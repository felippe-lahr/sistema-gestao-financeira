/**
 * WhatsApp Bot — Integração Multi-Tenant via Evolution API
 *
 * Endpoints:
 *   POST /api/whatsapp/webhook          — Recebe eventos da Evolution API
 *   POST /api/whatsapp/link             — Inicia vinculação: envia código de verificação
 *   POST /api/whatsapp/verify           — Confirma o código e vincula o número
 *   DELETE /api/whatsapp/unlink         — Remove a vinculação do número
 *   GET  /api/whatsapp/status           — Retorna status da vinculação do usuário
 *
 * Fluxo de cadastro de transação:
 *   1. Usuário envia mensagem de voz, texto ou imagem (comprovante)
 *   2. Bot transcreve o áudio (Whisper) ou lê a imagem (Gemini Vision)
 *   3. GPT extrai: entidade, valor, data, descrição, tipo (débito/crédito)
 *   4. Bot envia resumo e pede confirmação (1 = confirmar, 2 = cancelar)
 *   5. Usuário responde 1 → transação cadastrada; 2 → cancelado
 */

import type { Express, Request, Response } from "express";
import { randomInt } from "crypto";
import { spawn } from "child_process";
import * as db from "../db";
import { getDb } from "../db";
import { sdk } from "./sdk";
import { invokeLLM } from "./llm";
import { uploadToS3, isS3Configured } from "./s3";
import { eq } from "drizzle-orm";
import { users, whatsappMessages } from "../../drizzle/schema";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
      addressingMode?: string; // "lid" quando a conta usa @lid (v2.3.7+)
      senderLid?: string; // JID @lid do remetente (v2.3.7+ quando addressingMode = "lid")
      participantLid?: string;
      remoteJidAlt?: string; // JID alternativo (algumas builds mandam o @lid aqui)
      senderPn?: string; // Phone number do remetente
    };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      audioMessage?: {
        url?: string;
        mimetype?: string;
        mediaKey?: string;
        fileEncSha256?: string;
        fileSha256?: string;
        fileLength?: string;
        seconds?: number;
        ptt?: boolean;
        mediaKeyTimestamp?: string;
        directPath?: string;
      };
      imageMessage?: {
        url?: string;
        mimetype?: string;
        caption?: string;
        mediaKey?: string;
        fileEncSha256?: string;
        fileSha256?: string;
        fileLength?: string;
        height?: number;
        width?: number;
        mediaKeyTimestamp?: string;
        directPath?: string;
        jpegThumbnail?: string;
      };
      documentMessage?: {
        url?: string;
        mimetype?: string;
        title?: string;
        mediaKey?: string;
        fileEncSha256?: string;
        fileSha256?: string;
        fileLength?: string;
        pageCount?: number;
        mediaKeyTimestamp?: string;
        directPath?: string;
        fileName?: string;
      };
    };
    messageType?: string;
    instanceId?: string;
    messageTimestamp?: number;
  };
}

interface ExtractedTransaction {
  entityName?: string;
  amount?: number; // em reais (float)
  date?: string; // YYYY-MM-DD
  description?: string;
  type?: "INCOME" | "EXPENSE";
  categoryName?: string;
  bankAccountName?: string;
  paymentMethodName?: string;
  creditCardName?: string;
  installments?: number;
  isRecurring?: boolean;
  recurrenceFrequency?: "monthly" | "weekly" | "yearly";
  confidence?: number;
}

// ─── Estado em memória para confirmações pendentes ────────────────────────────
// Chave: número de telefone (ex: "5511947728157")
// Valor: dados da transação extraída aguardando confirmação
// Dedup em memória: a Evolution API às vezes entrega o MESMO messageId duas vezes
// em milissegundos (uma via @lid, outra via @s.whatsapp.net). O dedup no banco
// sofre corrida porque o INSERT só acontece após o processamento. Esse lock em
// memória bloqueia a duplicata no instante do recebimento do webhook.
const recentlySeenMessageIds = new Map<string, number>(); // messageId → timestamp ms
function markMessageSeen(messageId: string): boolean {
  const now = Date.now();
  // Limpeza: remove entradas com mais de 5 minutos
  for (const [id, ts] of recentlySeenMessageIds) {
    if (now - ts > 5 * 60 * 1000) recentlySeenMessageIds.delete(id);
  }
  if (recentlySeenMessageIds.has(messageId)) return false; // já visto → duplicata
  recentlySeenMessageIds.set(messageId, now);
  return true;
}

const pendingConfirmations = new Map<string, {
  extracted: ExtractedTransaction;
  userId: number;
  organizationId: number | null;
  entityId: number;
  messageId: string;
  expiresAt: number; // timestamp ms
}>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normaliza número de telefone para formato internacional sem @s.whatsapp.net
 * Ex: "5511947728157@s.whatsapp.net" → "5511947728157"
 */
function normalizePhone(jid: string): string {
  // Remove sufixo @s.whatsapp.net/@lid/etc
  const withoutSuffix = jid.replace(/@.*$/, "");
  // Remove device ID do formato multi-device (ex: "5511947728157:15" → "5511947728157")
  const withoutDevice = withoutSuffix.split(":")[0];
  return withoutDevice.replace(/\D/g, "");
}

/**
 * Extrai o JID para resposta — mantém o remoteJid original para suporte a LID
 * WhatsApp Business usa @lid em vez de @s.whatsapp.net
 */
function getReplyJid(remoteJid: string): string {
  // Se for LID ou s.whatsapp.net, retorna o JID completo para resposta
  return remoteJid;
}

/**
 * Formata valor em centavos para BRL
 */
function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

/**
 * Formata data ISO para pt-BR
 */
function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
  } catch {
    return dateStr;
  }
}

/**
 * Envia mensagem de texto via Evolution API.
 * Responde para o JID/número informado (normalmente o remoteJid da conversa).
 */
async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "sgf-bot";

  if (!evolutionUrl || !evolutionKey) {
    console.warn("[WhatsApp Bot] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados");
    return;
  }

  try {
    const url = `${evolutionUrl.replace(/\/$/, "")}/message/sendText/${instanceName}`;
    console.log(`[WhatsApp Bot] Enviando mensagem para: ${to}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionKey,
      },
      body: JSON.stringify({ number: to, text }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`[WhatsApp Bot] ❌ Falha ao enviar para ${to} — HTTP ${response.status}: ${errText}`);
      return;
    }

    const responseData = await response.json().catch(() => ({})) as { status?: string };
    const msgStatus = responseData.status ?? "OK";
    console.log(`[WhatsApp Bot] Resposta do envio para ${to} — status: ${msgStatus}`);
  } catch (error) {
    console.error(`[WhatsApp Bot] Exceção ao enviar para ${to}:`, error);
  }
}

/**
 * Baixa mídia da Evolution API (áudio, imagem, documento)
 */
async function downloadEvolutionMedia(
  messageId: string,
  instanceName: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;

  if (!evolutionUrl || !evolutionKey) return null;

  try {
    const url = `${evolutionUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instanceName}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": evolutionKey,
      },
      body: JSON.stringify({ message: { key: { id: messageId } } }),
    });

    if (!response.ok) {
      console.error(`[WhatsApp Bot] Erro ao baixar mídia: ${response.status}`);
      return null;
    }

    const data = await response.json() as { base64?: string; mimetype?: string };
    if (!data.base64) return null;

    const buffer = Buffer.from(data.base64, "base64");
    return { buffer, mimeType: data.mimetype || "audio/ogg" };
  } catch (error) {
    console.error("[WhatsApp Bot] Erro ao baixar mídia:", error);
    return null;
  }
}

/**
 * Extrai dados de transação de um texto usando IA
 */
async function extractTransactionFromText(
  text: string,
  userEntities: { id: number; name: string }[],
  categories: { name: string; type: string }[] = [],
  creditCardsList: { name: string }[] = []
): Promise<ExtractedTransaction | null> {
  const entitiesStr = userEntities.map(e => e.name).join(", ");
  const today = new Date().toISOString().split("T")[0];
  const categoriesStr = categories.length > 0
    ? categories.map(c => `${c.name} (${c.type})`).join(", ")
    : "nenhuma";
  const creditCardsStr = creditCardsList.length > 0
    ? creditCardsList.map(c => c.name).join(", ")
    : "nenhum";

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um assistente financeiro inteligente. Extraia dados de transação financeira do texto do usuário.

Entidades disponíveis: ${entitiesStr || "nenhuma"}
Data de hoje: ${today}
Categorias cadastradas: ${categoriesStr}
Cartões de crédito cadastrados: ${creditCardsStr}

Retorne um JSON com os campos:
- entityName: nome da entidade/centro de custo (string ou null)
- amount: valor em reais como número decimal (ex: 150.50) — valor TOTAL, não por parcela
- date: data no formato YYYY-MM-DD (use hoje se não informado)
- description: descrição curta da transação
- type: "INCOME" para crédito/receita ou "EXPENSE" para débito/despesa
- categoryName: escolha EXATAMENTE um nome da lista de categorias cadastradas, ou null se nenhuma for adequada
- bankAccountName: conta bancária mencionada (string ou null)
- paymentMethodName: meio de pagamento mencionado (string ou null)
- creditCardName: se mencionar cartão de crédito (nubank, itaú, etc.), escolha EXATAMENTE um nome da lista de cartões cadastrados, ou null
- installments: número de parcelas se mencionado ("4x", "em 4 vezes" → 4), ou null/1 se não parcelado
- isRecurring: true se for recorrente/mensalidade/assinatura
- recurrenceFrequency: "monthly", "weekly" ou "yearly" (apenas se isRecurring=true)
- confidence: número de 0 a 1 indicando confiança na extração

Se não conseguir identificar um campo obrigatório (amount ou description), retorne null para o objeto inteiro.
Retorne APENAS o JSON, sem texto adicional.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      responseFormat: { type: "json_object" },
    });

    const content = result.choices?.[0]?.message?.content;
    console.log(`[WhatsApp Bot] LLM resposta bruta: ${typeof content === "string" ? content.slice(0, 500) : JSON.stringify(content)?.slice(0, 500)}`);
    if (!content || typeof content !== "string") return null;

    const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(cleaned) as ExtractedTransaction | null;

    if (!parsed || !parsed.amount || !parsed.description) {
      console.warn(`[WhatsApp Bot] Extração descartada — amount=${parsed?.amount}, description=${parsed?.description}`);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("[WhatsApp Bot] Erro ao extrair transação:", error);
    return null;
  }
}

/**
 * Extrai dados de transação de uma imagem (comprovante) usando Gemini Vision
 */
async function extractTransactionFromImage(
  imageUrl: string,
  userEntities: { id: number; name: string }[],
  categories: { name: string; type: string }[] = [],
  creditCardsList: { name: string }[] = [],
  caption?: string
): Promise<ExtractedTransaction | null> {
  const entitiesStr = userEntities.map(e => e.name).join(", ");
  const today = new Date().toISOString().split("T")[0];
  const categoriesStr = categories.length > 0
    ? categories.map(c => `${c.name} (${c.type})`).join(", ")
    : "nenhuma";
  const creditCardsStr = creditCardsList.length > 0
    ? creditCardsList.map(c => c.name).join(", ")
    : "nenhum";

  const userContentParts: Array<{ type: string; [key: string]: unknown }> = [
    {
      type: "image_url",
      image_url: { url: imageUrl, detail: "high" },
    },
    {
      type: "text",
      text: caption
        ? `Extraia os dados desta transação/comprovante. Contexto adicional fornecido pelo usuário: "${caption}"`
        : "Extraia os dados desta transação/comprovante.",
    },
  ];

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um assistente financeiro inteligente. Analise o comprovante/imagem e extraia os dados da transação financeira.

Entidades disponíveis: ${entitiesStr || "nenhuma"}
Data de hoje: ${today}
Categorias cadastradas: ${categoriesStr}
Cartões de crédito cadastrados: ${creditCardsStr}

Retorne um JSON com os campos:
- entityName: nome da entidade/centro de custo (string ou null)
- amount: valor em reais como número decimal (ex: 150.50) — valor TOTAL, não por parcela
- date: data no formato YYYY-MM-DD (use hoje se não informado)
- description: descrição curta da transação
- type: "INCOME" para crédito/receita ou "EXPENSE" para débito/despesa
- categoryName: escolha EXATAMENTE um nome da lista de categorias cadastradas, ou null se nenhuma for adequada
- bankAccountName: conta bancária mencionada (string ou null)
- paymentMethodName: meio de pagamento mencionado (string ou null)
- creditCardName: se mencionar cartão de crédito, escolha EXATAMENTE um nome da lista de cartões cadastrados, ou null
- installments: número de parcelas se visível no comprovante, ou null/1 se não parcelado
- isRecurring: false
- confidence: número de 0 a 1 indicando confiança na extração

Se não conseguir identificar um campo obrigatório (amount ou description), retorne null para o objeto inteiro.
Retorne APENAS o JSON, sem texto adicional.`,
        },
        {
          role: "user",
          content: userContentParts as any,
        },
      ],
      responseFormat: { type: "json_object" },
    });

    const content = result.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(cleaned) as ExtractedTransaction;

    if (!parsed.amount || !parsed.description) return null;
    return parsed;
  } catch (error) {
    console.error("[WhatsApp Bot] Erro ao extrair transação da imagem:", error);
    return null;
  }
}

/**
 * Transcodifica áudio (ex: ogg/opus do WhatsApp) para mp3 usando ffmpeg.
 * O Gemini só aceita wav/mp3 no input_audio, então convertemos antes de enviar.
 */
async function transcodeToMp3(input: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", [
      "-i", "pipe:0",
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-f", "mp3",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });

    const chunks: Buffer[] = [];
    let stderr = "";
    ff.stdout.on("data", (d: Buffer) => chunks.push(d));
    ff.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    ff.on("error", (e) => {
      console.error("[WhatsApp Bot] Erro ao iniciar ffmpeg:", e);
      resolve(null);
    });
    ff.on("close", (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        console.error(`[WhatsApp Bot] ffmpeg falhou (code ${code}): ${stderr.slice(-400)}`);
        resolve(null);
      }
    });
    ff.stdin.on("error", () => {}); // evita crash se o processo fechar antes
    ff.stdin.write(input);
    ff.stdin.end();
  });
}

/**
 * Transcreve áudio usando o Gemini (multimodal nativo via input_audio).
 * O provedor atual (Gemini) não tem endpoint Whisper /v1/audio/transcriptions,
 * então usamos o mesmo caminho de chat que já funciona para texto/imagem.
 */
async function transcribeAudioWithGemini(
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  // O Gemini só aceita wav/mp3. WhatsApp envia ogg/opus, então transcodificamos.
  let audioBuffer = buffer;
  let format = (mimeType.split("/")[1] || "").split(";")[0].trim();
  if (format !== "mp3" && format !== "wav") {
    const mp3 = await transcodeToMp3(buffer);
    if (!mp3) return null;
    audioBuffer = mp3;
    format = "mp3";
  }
  const base64 = audioBuffer.toString("base64");

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Você transcreve áudios em português brasileiro. Responda APENAS com a transcrição literal do áudio, sem comentários, sem aspas, sem texto adicional.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcreva o áudio a seguir:" },
            { type: "input_audio", input_audio: { data: base64, format } },
          ],
        },
      ],
    });

    const content = result.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;
    const transcription = content.trim();
    return transcription.length > 0 ? transcription : null;
  } catch (error) {
    console.error("[WhatsApp Bot] Erro ao transcrever áudio com Gemini:", error);
    return null;
  }
}

/**
 * Resolve o entityId a partir do nome extraído pela IA
 */
function resolveEntityId(
  entityName: string | undefined,
  userEntities: { id: number; name: string }[]
): number | null {
  if (!entityName || userEntities.length === 0) {
    return userEntities.length > 0 ? userEntities[0].id : null;
  }

  const normalized = entityName.toLowerCase().trim();
  const exact = userEntities.find(e => e.name.toLowerCase() === normalized);
  if (exact) return exact.id;

  const partial = userEntities.find(e =>
    e.name.toLowerCase().includes(normalized) || normalized.includes(e.name.toLowerCase())
  );
  if (partial) return partial.id;

  return userEntities[0].id;
}

/**
 * Resolve categoryId a partir do nome
 */
async function resolveCategoryId(
  categoryName: string | undefined,
  entityId: number,
  userId: number,
  type: "INCOME" | "EXPENSE"
): Promise<number | null> {
  if (!categoryName) return null;
  try {
    const cats = await db.getCategoriesByEntityId(entityId, userId);
    const filtered = cats.filter(c => c.type === type);
    const normalized = categoryName.toLowerCase().trim();
    const match = filtered.find(c =>
      c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase())
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve bankAccountId a partir do nome
 */
async function resolveBankAccountId(
  accountName: string | undefined,
  entityId: number,
  userId: number
): Promise<number | null> {
  if (!accountName) return null;
  try {
    const accounts = await db.getBankAccountsByEntityId(entityId, userId);
    const normalized = accountName.toLowerCase().trim();
    const match = accounts.find(a =>
      a.name.toLowerCase().includes(normalized) || normalized.includes(a.name.toLowerCase())
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve paymentMethodId a partir do nome
 */
async function resolvePaymentMethodId(
  methodName: string | undefined,
  entityId: number,
  userId: number
): Promise<number | null> {
  if (!methodName) return null;
  try {
    const methods = await db.getPaymentMethodsByEntityId(entityId, userId);
    const normalized = methodName.toLowerCase().trim();
    const match = methods.find(m =>
      m.name.toLowerCase().includes(normalized) || normalized.includes(m.name.toLowerCase())
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve creditCardId a partir do nome
 */
async function resolveCreditCardId(
  cardName: string | undefined,
  entityId: number,
  userId: number
): Promise<number | null> {
  if (!cardName) return null;
  try {
    const cards = await db.getCreditCardsByEntityId(entityId, userId);
    console.log(`[WhatsApp Bot] Cartões disponíveis na entidade ${entityId}:`, cards.map(c => c.name));
    const normalized = cardName.toLowerCase().trim();
    const match = cards.find(c =>
      c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase())
    );
    if (match) {
      console.log(`[WhatsApp Bot] Cartão resolvido: "${cardName}" → id=${match.id} nome="${match.name}"`);
      return match.id;
    }
    console.log(`[WhatsApp Bot] Cartão "${cardName}" não encontrado na entidade ${entityId}`);
    return null;
  } catch (err) {
    console.error("[WhatsApp Bot] Erro ao resolver cartão:", err);
    return null;
  }
}

/**
 * Monta o resumo da transação para confirmação
 */
function buildConfirmationMessage(
  extracted: ExtractedTransaction,
  entityName: string
): string {
  const typeLabel = extracted.type === "INCOME" ? "💰 Crédito" : "💸 Débito";
  const amountCents = Math.round((extracted.amount ?? 0) * 100);
  const amountStr = formatCurrency(amountCents);
  const dateStr = extracted.date ? formatDate(extracted.date) : "hoje";
  const recurring = extracted.isRecurring
    ? `\n🔁 Recorrente (${extracted.recurrenceFrequency === "monthly" ? "mensal" : extracted.recurrenceFrequency === "weekly" ? "semanal" : "anual"}) — serão criados 12 lançamentos`
    : "";
  const installments = extracted.installments && extracted.installments > 1
    ? `\n🔢 Parcelado em ${extracted.installments}x de ${formatCurrency(Math.round(amountCents / extracted.installments))}`
    : "";
  const creditCard = extracted.creditCardName
    ? `\n💳 Cartão: ${extracted.creditCardName}`
    : "";

  return `📋 *Confirmar transação?*

${typeLabel}: *${amountStr}*
📝 ${extracted.description}
🏷️ Entidade: ${entityName}
📅 Data: ${dateStr}${extracted.categoryName ? `\n🗂️ Categoria: ${extracted.categoryName}` : ""}${extracted.bankAccountName ? `\n🏦 Conta: ${extracted.bankAccountName}` : ""}${extracted.paymentMethodName ? `\n💳 Pagamento: ${extracted.paymentMethodName}` : ""}${creditCard}${installments}${recurring}

Responda:
*1* — Confirmar ✅
*2* — Cancelar ❌`;
}

/**
 * Processa uma mensagem recebida do WhatsApp
 */
async function processIncomingMessage(
  fromPhone: string,
  replyJid: string,
  messageId: string,
  messageType: string,
  payload: EvolutionWebhookPayload
): Promise<void> {
  // 1. Buscar usuário pelo número de WhatsApp ou pelo LID
  const dbInstance = await getDb();
  if (!dbInstance) {
    console.error("[WhatsApp Bot] Database não disponível");
    return;
  }

  // Deduplicação: a Evolution API às vezes entrega o mesmo messageId duas vezes
  // (uma via @lid e outra via @s.whatsapp.net). Ignorar se já foi processado.
  const existing = await dbInstance
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.messageId, messageId))
    .limit(1);
  if (existing.length > 0) {
    console.log(`[WhatsApp Bot] Mensagem ${messageId} já processada, ignorando duplicata`);
    return;
  }

  // v2.3.7 mapeia @lid → @s.whatsapp.net no webhook, mas preserva addressingMode: "lid"
  const addressingMode = payload.data?.key?.addressingMode;
  const isLid = replyJid.includes("@lid") || addressingMode === "lid";
  console.log(`[WhatsApp Bot] Buscando usuário - fromPhone: ${fromPhone}, replyJid: ${replyJid}, isLid: ${isLid}, addressingMode: ${addressingMode}`);

  let userResult: any[] = [];

  // Primeiro tenta buscar pelo LID salvo (se for mensagem com LID)
  if (isLid) {
    userResult = await dbInstance
      .select()
      .from(users)
      .where(eq(users.whatsappLid, replyJid))
      .limit(1);
  }

  // Se não encontrou pelo LID, busca pelo número
  if (userResult.length === 0) {
    userResult = await dbInstance
      .select()
      .from(users)
      .where(eq(users.whatsappPhone, fromPhone))
      .limit(1);
  }

  // Se ainda não encontrou, tentar com/sem o 55
  if (userResult.length === 0) {
    const altPhone = fromPhone.startsWith("55") ? fromPhone.slice(2) : "55" + fromPhone;
    userResult = await dbInstance
      .select()
      .from(users)
      .where(eq(users.whatsappPhone, altPhone))
      .limit(1);
  }

  // Se for LID e encontrou usuário, mas não tem LID salvo, auto-vincular
  if (userResult.length > 0 && isLid && !userResult[0].whatsappLid) {
    console.log(`[WhatsApp Bot] Auto-vinculando LID ${replyJid} ao usuário ${userResult[0].id}`);
    await dbInstance
      .update(users)
      .set({ whatsappLid: replyJid, updatedAt: new Date() })
      .where(eq(users.id, userResult[0].id));
  }

  // Se for LID e não encontrou por nenhum método, buscar QUALQUER usuário com whatsappPhone preenchido
  // (workaround para quando o LID não corresponde ao número)
  if (userResult.length === 0 && isLid) {
    const { isNotNull } = await import("drizzle-orm");
    userResult = await dbInstance
      .select()
      .from(users)
      .where(isNotNull(users.whatsappPhone))
      .limit(10);
    
    // Se só tem um usuário com WhatsApp vinculado, usar esse
    if (userResult.length === 1) {
      console.log(`[WhatsApp Bot] Único usuário com WhatsApp vinculado: ${userResult[0].id}, auto-vinculando LID`);
      await dbInstance
        .update(users)
        .set({ whatsappLid: replyJid, updatedAt: new Date() })
        .where(eq(users.id, userResult[0].id));
    } else {
      // Múltiplos usuários - não consegue determinar qual é
      userResult = [];
    }
  }

  if (userResult.length === 0) {
    console.log(`[WhatsApp Bot] Usuário não encontrado para fromPhone=${fromPhone}, replyJid=${replyJid}`);
    // Enviar para o número do próprio bot como fallback (não vai funcionar para LID)
    // Não enviar nada se for LID pois vai dar erro
    if (!isLid) {
      await sendWhatsAppMessage(
        replyJid,
        `⚠️ Seu número não está vinculado ao SGF.\n\nPara vincular, acesse *Perfil → WhatsApp Bot* no sistema e siga as instruções.`
      );
    }
    return;
  }

  const user = userResult[0];

  // Destino de envio. Hipótese: quando addressingMode = "lid", a sessão de
  // criptografia do Baileys está indexada pelo @lid, não pelo @s.whatsapp.net.
  // Responder ao @s.whatsapp.net deixa a mensagem PENDING para sempre porque
  // o Baileys não acha a sessão. Então, se a Evolution mandar o @lid real do
  // remetente no payload, respondemos para ESSE jid.
  const senderLid = payload.data?.key?.senderLid
    || payload.data?.key?.participantLid
    || (payload.data?.key?.remoteJidAlt?.includes("@lid") ? payload.data.key.remoteJidAlt : undefined)
    || (user.whatsappLid && user.whatsappLid.includes("@lid") ? user.whatsappLid : undefined);

  const sendTarget = (isLid && senderLid) ? senderLid : replyJid;
  console.log(`[WhatsApp Bot] sendTarget escolhido: ${sendTarget} (isLid=${isLid}, senderLid=${senderLid ?? "n/a"})`);

  const sendReply = (txt: string) => sendWhatsAppMessage(sendTarget, txt);

  // 2. Verificar se é uma resposta de confirmação pendente
  const text = payload.data.message?.conversation ||
    payload.data.message?.extendedTextMessage?.text || "";

  const pending = pendingConfirmations.get(replyJid);

  if (pending && Date.now() < pending.expiresAt) {
    const trimmed = text.trim();

    if (trimmed === "1") {
      // Confirmar transação
      pendingConfirmations.delete(replyJid);

      try {
        const extracted = pending.extracted;
        const amountCents = Math.round((extracted.amount ?? 0) * 100);
        const baseDate = extracted.date
          ? (() => {
              const [y, m, d] = extracted.date!.split("-").map(Number);
              return new Date(y, m - 1, d);
            })()
          : new Date();

        console.log(`[WhatsApp Bot] Confirmando: creditCardName="${extracted.creditCardName}", installments=${extracted.installments}, entityId=${pending.entityId}`);
        const categoryId = await resolveCategoryId(
          extracted.categoryName,
          pending.entityId,
          user.id,
          extracted.type ?? "EXPENSE"
        );
        const bankAccountId = await resolveBankAccountId(
          extracted.bankAccountName,
          pending.entityId,
          user.id
        );
        const paymentMethodId = await resolvePaymentMethodId(
          extracted.paymentMethodName,
          pending.entityId,
          user.id
        );
        const creditCardId = await resolveCreditCardId(
          extracted.creditCardName,
          pending.entityId,
          user.id
        );

        console.log(`[WhatsApp Bot] creditCardId resolvido: ${creditCardId}`);

        const installments = (extracted.installments && extracted.installments > 1)
          ? extracted.installments
          : 1;
        const description = extracted.description ?? "Transação via WhatsApp";
        const basePayload = {
          entityId: pending.entityId,
          type: extracted.type ?? "EXPENSE",
          amount: Math.round(amountCents / installments),
          status: "PAID" as const,
          categoryId: categoryId ?? undefined,
          bankAccountId: bankAccountId ?? undefined,
          paymentMethodId: paymentMethodId ?? undefined,
          importOrigin: "MANUAL" as const,
        };

        let firstTransactionId: number;
        const createdIds: number[] = [];

        if (installments > 1) {
          // Criar N transações parceladas, distribuindo datas mensalmente
          for (let i = 1; i <= installments; i++) {
            const dueDate = new Date(baseDate);
            dueDate.setMonth(dueDate.getMonth() + (i - 1));
            const tid = await db.createTransaction({
              ...basePayload,
              description: `${description} (${i}/${installments})`,
              dueDate,
              paymentDate: i === 1 ? new Date() : undefined,
              isRecurring: false,
              ...(creditCardId ? { creditCardId } as any : {}),
            });
            createdIds.push(tid);
          }
          firstTransactionId = createdIds[0];
        } else {
          // Transação única
          firstTransactionId = await db.createTransaction({
            ...basePayload,
            description,
            amount: amountCents,
            dueDate: baseDate,
            paymentDate: new Date(),
            isRecurring: extracted.isRecurring ?? false,
            recurrencePattern: extracted.isRecurring && extracted.recurrenceFrequency
              ? JSON.stringify({ frequency: extracted.recurrenceFrequency, interval: 1 })
              : undefined,
            ...(creditCardId ? { creditCardId } as any : {}),
          });
          createdIds.push(firstTransactionId);
        }

        // Criar 12 transações recorrentes futuras se isRecurring=true
        let recurringCount = 0;
        if (extracted.isRecurring && installments === 1) {
          const freq = extracted.recurrenceFrequency ?? "monthly";
          for (let i = 1; i <= 12; i++) {
            const dueDate = new Date(baseDate);
            if (freq === "monthly") dueDate.setMonth(dueDate.getMonth() + i);
            else if (freq === "weekly") dueDate.setDate(dueDate.getDate() + 7 * i);
            else if (freq === "yearly") dueDate.setFullYear(dueDate.getFullYear() + i);
            await db.createTransaction({
              ...basePayload,
              description,
              amount: amountCents,
              dueDate,
              paymentDate: undefined,
              status: "PENDING",
              isRecurring: true,
              recurrencePattern: JSON.stringify({ frequency: freq, interval: 1 }),
              parentTransactionId: firstTransactionId,
              ...(creditCardId ? { creditCardId } as any : {}),
            });
            recurringCount++;
          }
        }

        // Atualizar whatsapp_message com transactionId
        await dbInstance
          .update(whatsappMessages)
          .set({ status: "CONFIRMED", transactionId: firstTransactionId, updatedAt: new Date() })
          .where(eq(whatsappMessages.messageId, pending.messageId));

        const amountStr = formatCurrency(amountCents);
        let successMsg = `✅ *Transação cadastrada com sucesso!*\n\n${extracted.type === "INCOME" ? "💰 Crédito" : "💸 Débito"}: *${amountStr}*\n📝 ${description}`;
        if (installments > 1) {
          successMsg += `\n🔢 Parcelado em ${installments}x de ${formatCurrency(Math.round(amountCents / installments))}`;
        }
        if (creditCardId && extracted.creditCardName) {
          successMsg += `\n💳 Cartão: ${extracted.creditCardName}`;
        }
        if (recurringCount > 0) {
          successMsg += `\n🔁 Recorrência criada: ${recurringCount} lançamentos futuros`;
        }
        successMsg += `\n\nID: #${firstTransactionId}`;
        await sendReply(successMsg);
      } catch (error) {
        console.error("[WhatsApp Bot] Erro ao criar transação:", error);
        await sendReply(
          `❌ Erro ao cadastrar a transação. Tente novamente ou acesse o sistema.`
        );
      }
      return;
    }

    if (trimmed === "2") {
      // Cancelar
      pendingConfirmations.delete(replyJid);

      await dbInstance
        .update(whatsappMessages)
        .set({ status: "REJECTED", updatedAt: new Date() })
        .where(eq(whatsappMessages.messageId, pending.messageId));

      await sendReply(`❌ Transação cancelada.`);
      return;
    }
  }

  // 3. Verificar comandos especiais
  const lowerText = text.toLowerCase().trim();

  if (lowerText === "ajuda" || lowerText === "help" || lowerText === "/ajuda") {
    await sendReply(
      `🤖 *SGF WhatsApp Bot — Ajuda*\n\n*Como cadastrar transações:*\n\n🎙️ *Voz:* Envie um áudio descrevendo a transação\n_"Paguei 150 reais de mercado hoje"_\n\n💬 *Texto:* Digite diretamente\n_"Recebi 2000 de aluguel dia 10"_\n\n🖼️ *Comprovante:* Envie foto ou imagem do comprovante\n\n*Exemplos de texto:*\n• "Despesa de 80 reais no restaurante"\n• "Recebi salário de 5000"\n• "Conta de luz 120 reais vencimento dia 15"\n\n*Comandos:*\n• *ajuda* — Esta mensagem\n• *1* — Confirmar transação pendente\n• *2* — Cancelar transação pendente`
    );
    return;
  }

  // 4. Processar mensagem de acordo com o tipo
  const org = await db.getOrFirstOrganizationForUser(user.id);
  const userEntities = await db.getEntitiesByUserId(user.id);

  if (userEntities.length === 0) {
    await sendReply(
      `⚠️ Você não possui entidades cadastradas no SGF. Acesse o sistema para criar uma entidade primeiro.`
    );
    return;
  }

  // Pré-carregar categorias e cartões para a primeira entidade (usados no prompt do LLM)
  const defaultEntityId = userEntities[0].id;
  const [categoriesList, creditCardsList] = await Promise.all([
    db.getCategoriesByEntityId(defaultEntityId, user.id).catch(() => [] as { name: string; type: string }[]),
    db.getCreditCardsByEntityId(defaultEntityId, user.id).catch(() => [] as { name: string }[]),
  ]);

  // Salvar mensagem recebida no banco
  const savedMessage = await db.createWhatsAppMessage({
    organizationId: org?.id ?? null,
    userId: user.id,
    messageId,
    from: fromPhone,
    status: "RECEIVED",
  });

  let extractedText: string | null = null;
  let mediaUrl: string | null = null;

  // ── Processar áudio ──────────────────────────────────────────────────────────
  if (messageType === "audioMessage" || messageType === "pttMessage") {
    await sendReply(`🎙️ Transcrevendo seu áudio...`);

    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "sgf-bot";
    const mediaData = await downloadEvolutionMedia(messageId, instanceName);

    if (!mediaData) {
      await sendReply(`❌ Não consegui baixar o áudio. Tente novamente.`);
      return;
    }

    // Transcrição via Gemini (multimodal). O provedor atual não tem endpoint
    // Whisper, então enviamos o áudio direto pro modelo de chat.
    const transcription = await transcribeAudioWithGemini(mediaData.buffer, mediaData.mimeType);

    if (!transcription) {
      await sendReply(`❌ Não consegui transcrever o áudio. Tente enviar uma mensagem de texto.`);
      return;
    }

    extractedText = transcription;
    console.log(`[WhatsApp Bot] Áudio transcrito: "${transcription}"`);

    // Upload do áudio para S3 (best-effort, apenas para registro)
    let audioUrl: string | null = null;
    try {
      if (isS3Configured()) {
        const filename = `whatsapp-audio-${Date.now()}.ogg`;
        audioUrl = await uploadToS3(mediaData.buffer, filename, mediaData.mimeType, "whatsapp");
      }
    } catch (uploadError) {
      console.error("[WhatsApp Bot] Erro ao fazer upload do áudio:", uploadError);
    }
    mediaUrl = audioUrl;

    await dbInstance
      .update(whatsappMessages)
      .set({ audioUrl, transcription: extractedText, status: "TRANSCRIBED", updatedAt: new Date() })
      .where(eq(whatsappMessages.messageId, messageId));
  }

  // ── Processar imagem (comprovante) ───────────────────────────────────────────
  else if (messageType === "imageMessage") {
    await sendReply(`🖼️ Analisando o comprovante...`);

    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "sgf-bot";
    const mediaData = await downloadEvolutionMedia(messageId, instanceName);

    if (!mediaData) {
      await sendReply(`❌ Não consegui baixar a imagem. Tente novamente.`);
      return;
    }

    // Upload para S3
    let imageUrl: string | null = null;
    try {
      if (isS3Configured()) {
        const ext = mediaData.mimeType.includes("png") ? "png" : "jpg";
        const filename = `whatsapp-image-${Date.now()}.${ext}`;
        imageUrl = await uploadToS3(mediaData.buffer, filename, mediaData.mimeType, "whatsapp");
      } else {
        const { storagePut } = await import("../storage");
        const ext = mediaData.mimeType.includes("png") ? "png" : "jpg";
        const { url } = await storagePut(
          `whatsapp/image-${Date.now()}.${ext}`,
          mediaData.buffer,
          mediaData.mimeType
        );
        imageUrl = url;
      }
    } catch (uploadError) {
      console.error("[WhatsApp Bot] Erro ao fazer upload da imagem:", uploadError);
    }

    if (imageUrl) {
      mediaUrl = imageUrl;
      const imageCaption = payload.data?.message?.imageMessage?.caption ?? undefined;
      const extracted = await extractTransactionFromImage(imageUrl, userEntities, categoriesList, creditCardsList, imageCaption);

      if (!extracted) {
        await sendReply(
          `❌ Não consegui identificar uma transação nesta imagem. Tente enviar uma mensagem de texto descrevendo a transação.`
        );
        return;
      }

      const entityId = resolveEntityId(extracted.entityName, userEntities);
      if (!entityId) {
        await sendReply(`❌ Não encontrei a entidade. Verifique suas entidades no sistema.`);
        return;
      }

      const entityName = userEntities.find(e => e.id === entityId)?.name ?? "Entidade";

      await dbInstance
        .update(whatsappMessages)
        .set({
          audioUrl: imageUrl,
          extractedData: JSON.stringify(extracted),
          status: "EXTRACTED",
          updatedAt: new Date(),
        })
        .where(eq(whatsappMessages.messageId, messageId));

      // Salvar confirmação pendente
      pendingConfirmations.set(replyJid, {
        extracted,
        userId: user.id,
        organizationId: org?.id ?? null,
        entityId,
        messageId,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutos
      });

      await sendReply(buildConfirmationMessage(extracted, entityName));
      return;
    } else {
      await sendReply(`❌ Erro ao processar a imagem. Tente enviar uma mensagem de texto.`);
      return;
    }
  }

  // ── Processar texto ──────────────────────────────────────────────────────────
  else if (messageType === "conversation" || messageType === "extendedTextMessage") {
    if (!text.trim()) return;
    extractedText = text.trim();
  }

  // ── Processar documento (PDF) ────────────────────────────────────────────────
  else if (messageType === "documentMessage") {
    await sendReply(`📄 Recebi um documento. Por enquanto, envie o comprovante como *imagem* (foto) para que eu consiga processar automaticamente.`);
    return;
  }

  // ── Extrair transação do texto ───────────────────────────────────────────────
  if (!extractedText) return;

  await sendReply(`🤔 Processando...`);

  const extracted = await extractTransactionFromText(extractedText, userEntities, categoriesList, creditCardsList);

  if (!extracted) {
    await sendReply(
      `❌ Não consegui identificar uma transação na sua mensagem.\n\nTente ser mais específico, por exemplo:\n_"Paguei 150 reais de mercado hoje"_\n_"Recebi 2000 de aluguel"_`
    );
    return;
  }

  const entityId = resolveEntityId(extracted.entityName, userEntities);
  if (!entityId) {
    await sendReply(`❌ Não encontrei a entidade. Verifique suas entidades no sistema.`);
    return;
  }

  const entityName = userEntities.find(e => e.id === entityId)?.name ?? "Entidade";

  // Atualizar mensagem no banco com dados extraídos
  await dbInstance
    .update(whatsappMessages)
    .set({
      transcription: extractedText,
      extractedData: JSON.stringify(extracted),
      status: "EXTRACTED",
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessages.messageId, messageId));

  // Salvar confirmação pendente
  pendingConfirmations.set(replyJid, {
    extracted,
    userId: user.id,
    organizationId: org?.id ?? null,
    entityId,
    messageId,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutos
  });

  await sendReply(buildConfirmationMessage(extracted, entityName));
}

// ─── Registro de Rotas ────────────────────────────────────────────────────────

export function registerWhatsAppBotRoutes(app: Express): void {

  // ── GET /api/whatsapp/test?to=5511... — Testa envio direto via Evolution API ──
  app.get("/api/whatsapp/test", async (req: Request, res: Response) => {
    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "sgf-bot";
    const to = (req.query.to as string) || "5511947728157";

    const results: Record<string, unknown> = {};

    // 0. Estado real da conexão Baileys
    try {
      const stateUrl = `${evolutionUrl?.replace(/\/$/, "")}/instance/connectionState/${instanceName}`;
      const stateResp = await fetch(stateUrl, {
        headers: { "apikey": evolutionKey! },
      });
      results.connectionState = { status: stateResp.status, body: await stateResp.json().catch(() => stateResp.text()) };
    } catch (e) {
      results.connectionState = { error: String(e) };
    }

    // 1. Testa envio de mensagem
    try {
      const sendUrl = `${evolutionUrl?.replace(/\/$/, "")}/message/sendText/${instanceName}`;
      const sendResp = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": evolutionKey! },
        body: JSON.stringify({ number: to, text: "🧪 Teste de envio SGF — " + new Date().toISOString() }),
      });
      results.send = { status: sendResp.status, body: await sendResp.json().catch(() => sendResp.text()) };
    } catch (e) {
      results.send = { error: String(e) };
    }

    // 2. Consulta JID do número via whatsappNumbers
    try {
      const checkUrl = `${evolutionUrl?.replace(/\/$/, "")}/chat/whatsappNumbers/${instanceName}`;
      const checkResp = await fetch(checkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": evolutionKey! },
        body: JSON.stringify({ numbers: [to] }),
      });
      results.whatsappNumbers = { status: checkResp.status, body: await checkResp.json().catch(() => checkResp.text()) };
    } catch (e) {
      results.whatsappNumbers = { error: String(e) };
    }

    // 3. Se o parâmetro 'lid' for passado, testa envio direto ao @lid
    const lidParam = req.query.lid as string | undefined;
    if (lidParam) {
      try {
        const sendUrl = `${evolutionUrl?.replace(/\/$/, "")}/message/sendText/${instanceName}`;
        const sendResp = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": evolutionKey! },
          body: JSON.stringify({ number: lidParam, text: "🧪 Teste @lid direto — " + new Date().toISOString() }),
        });
        results.sendLid = { number: lidParam, status: sendResp.status, body: await sendResp.json().catch(() => sendResp.text()) };
      } catch (e) {
        results.sendLid = { error: String(e) };
      }
    }

    return res.json(results);
  });

  // ── POST /api/whatsapp/webhook — Recebe eventos da Evolution API ──────────────
  app.post("/api/whatsapp/webhook", async (req: Request, res: Response) => {
    // Responder imediatamente para não bloquear a Evolution API
    res.status(200).json({ ok: true });

    try {
      const payload = req.body as EvolutionWebhookPayload;

      // Processar apenas mensagens recebidas (não enviadas pelo bot)
      // A Evolution API v2 envia eventos em maiúsculas (MESSAGES_UPSERT)
      // enquanto versões anteriores usavam minúsculas (messages.upsert)
      const eventNorm = (payload.event ?? "").toLowerCase().replace(/_/g, ".");
      if (eventNorm !== "messages.upsert") return;
      if (payload.data?.key?.fromMe === true) return;

      const remoteJid = payload.data?.key?.remoteJid ?? "";
      const messageId = payload.data?.key?.id ?? "";

      // Ignorar mensagens de grupos
      if (remoteJid.includes("@g.us")) return;

      // Log do objeto key COMPLETO para descobrir onde vem o @lid real do remetente
      console.log(`[WhatsApp Bot] key bruto: ${JSON.stringify(payload.data?.key)}`);

      // Dedup atômico em memória ANTES de processar (evita envio duplicado)
      if (!messageId || !markMessageSeen(messageId)) {
        if (messageId) console.log(`[WhatsApp Bot] Duplicata ignorada no webhook: ${messageId}`);
        return;
      }

      const fromPhone = normalizePhone(remoteJid);
      const replyJid = getReplyJid(remoteJid);
      const messageType = payload.data?.messageType ?? "conversation";

      console.log(`[WhatsApp Bot] Mensagem recebida - remoteJid: ${remoteJid}, fromPhone: ${fromPhone}, replyJid: ${replyJid}`);

      if (!fromPhone) return;

      // Processar em background para não bloquear
      processIncomingMessage(fromPhone, replyJid, messageId, messageType, payload).catch(err => {
        console.error("[WhatsApp Bot] Erro ao processar mensagem:", err);
      });
    } catch (error) {
      console.error("[WhatsApp Bot] Erro no webhook:", error);
    }
  });

  // ── POST /api/whatsapp/link — Vincula número diretamente (usuário já autenticado) ─────
  app.post("/api/whatsapp/link", async (req: Request, res: Response) => {
    console.log("[WhatsApp Bot] POST /api/whatsapp/link chamado - body:", JSON.stringify(req.body));
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        console.log("[WhatsApp Bot] /link - usuário não autenticado");
        return res.status(401).json({ error: "Não autenticado" });
      }
      console.log("[WhatsApp Bot] /link - usuário autenticado, id:", user.id);

      const { phone } = req.body as { phone?: string };
      if (!phone) return res.status(400).json({ error: "Número de telefone obrigatório" });

      // Normalizar número (remover tudo que não é dígito)
      let normalized = phone.replace(/\D/g, "");
      // Adicionar código do Brasil (55) automaticamente se não estiver presente
      if (normalized.length === 10 || normalized.length === 11) {
        normalized = "55" + normalized;
      }
      if (normalized.length < 12 || normalized.length > 15) {
        return res.status(400).json({ error: "Número de telefone inválido. Use o formato: 5511999999999" });
      }

      // Verificar se o número já está em uso por outro usuário
      const dbInstance = await getDb();
      if (!dbInstance) return res.status(500).json({ error: "Database não disponível" });

      const existing = await dbInstance
        .select({ id: users.id })
        .from(users)
        .where(eq(users.whatsappPhone, normalized))
        .limit(1);

      if (existing.length > 0 && existing[0].id !== user.id) {
        return res.status(409).json({ error: "Este número já está vinculado a outra conta" });
      }

      // Vincular diretamente (usuário já está autenticado no sistema)
      await dbInstance
        .update(users)
        .set({
          whatsappPhone: normalized,
          whatsappVerified: true,
          whatsappVerifyCode: null,
          whatsappVerifyExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      console.log(`[WhatsApp Bot] Número ${normalized} vinculado diretamente ao usuário ${user.id}`);
      return res.json({ success: true, message: "Número vinculado com sucesso!" });
    } catch (error) {
      console.error("[WhatsApp Bot] Erro ao enviar código:", error);
      return res.status(500).json({ error: "Erro ao enviar código de verificação" });
    }
  });

  // ── POST /api/whatsapp/verify — Confirma código e vincula número ──────────────
  app.post("/api/whatsapp/verify", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) return res.status(401).json({ error: "Não autenticado" });

      const { phone, code } = req.body as { phone?: string; code?: string };
      if (!phone || !code) return res.status(400).json({ error: "Número e código obrigatórios" });

      const normalized = phone.replace(/\D/g, "");
      const dbInstance = await getDb();
      if (!dbInstance) return res.status(500).json({ error: "Database não disponível" });

      // Buscar dados do usuário
      const userResult = await dbInstance
        .select({
          whatsappVerifyCode: users.whatsappVerifyCode,
          whatsappVerifyExpires: users.whatsappVerifyExpires,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (userResult.length === 0) return res.status(404).json({ error: "Usuário não encontrado" });

      const { whatsappVerifyCode, whatsappVerifyExpires } = userResult[0];

      if (!whatsappVerifyCode || whatsappVerifyCode !== code.trim()) {
        return res.status(400).json({ error: "Código inválido" });
      }

      if (!whatsappVerifyExpires || whatsappVerifyExpires < new Date()) {
        return res.status(400).json({ error: "Código expirado. Solicite um novo código." });
      }

      // Vincular número
      await dbInstance
        .update(users)
        .set({
          whatsappPhone: normalized,
          whatsappVerified: true,
          whatsappVerifyCode: null,
          whatsappVerifyExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return res.json({ success: true, message: "WhatsApp vinculado com sucesso!" });
    } catch (error) {
      console.error("[WhatsApp Bot] Erro ao verificar código:", error);
      return res.status(500).json({ error: "Erro ao verificar código" });
    }
  });

  // ── DELETE /api/whatsapp/unlink — Remove vinculação ──────────────────────────
  app.delete("/api/whatsapp/unlink", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) return res.status(401).json({ error: "Não autenticado" });

      const dbInstance = await getDb();
      if (!dbInstance) return res.status(500).json({ error: "Database não disponível" });

      // Remover número do mapa de confirmações pendentes
      const userResult = await dbInstance
        .select({ whatsappPhone: users.whatsappPhone })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (userResult[0]?.whatsappPhone) {
        pendingConfirmations.delete(userResult[0].whatsappPhone);
      }

      await dbInstance
        .update(users)
        .set({
          whatsappPhone: null,
          whatsappVerified: false,
          whatsappVerifyCode: null,
          whatsappVerifyExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      return res.json({ success: true, message: "WhatsApp desvinculado" });
    } catch (error) {
      console.error("[WhatsApp Bot] Erro ao desvincular:", error);
      return res.status(500).json({ error: "Erro ao desvincular WhatsApp" });
    }
  });

  // ── GET /api/whatsapp/status — Retorna status da vinculação ──────────────────
  app.get("/api/whatsapp/status", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) return res.status(401).json({ error: "Não autenticado" });

      const dbInstance = await getDb();
      if (!dbInstance) return res.status(500).json({ error: "Database não disponível" });

      const userResult = await dbInstance
        .select({
          whatsappPhone: users.whatsappPhone,
          whatsappVerified: users.whatsappVerified,
        })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      if (userResult.length === 0) return res.status(404).json({ error: "Usuário não encontrado" });

      const { whatsappPhone, whatsappVerified } = userResult[0];

      return res.json({
        linked: !!whatsappPhone && whatsappVerified,
        phone: whatsappPhone
          ? `+${whatsappPhone.slice(0, 2)} (${whatsappPhone.slice(2, 4)}) ${whatsappPhone.slice(4, 9)}-${whatsappPhone.slice(9)}`
          : null,
      });
    } catch (error) {
      console.error("[WhatsApp Bot] Erro ao buscar status:", error);
      return res.status(500).json({ error: "Erro ao buscar status" });
    }
  });

  console.log("[WhatsApp Bot] Rotas registradas");
}
