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
import { eq, and, sql as sqlTag, isNotNull } from "drizzle-orm";
import { users, whatsappMessages, creditCardInvoices, creditCardInvoiceAttachments } from "../../drizzle/schema";

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
  pendingFile?: { mediaUrl: string; mimeType: string; filename: string; fileSize: number };
}>();

// ─── Estado para fluxo de anexos em múltiplos passos ─────────────────────────
type AttachmentStage =
  | "awaiting_mode"          // perguntou "nova transação ou existente?"
  | "awaiting_description"   // extração falhou — aguardando descrição por voz/texto
  | "awaiting_entity"        // escolher entidade (quando usuário tem múltiplas)
  | "awaiting_month"         // escolher mês de vencimento
  | "awaiting_match_confirm" // escolher transação da lista filtrada
  | "awaiting_type";         // tipo do documento (comprovante/boleto/NF/doc)

const pendingAttachments = new Map<string, {
  mediaUrl: string;
  mimeType: string;
  filename: string;
  fileSize: number;
  stage: AttachmentStage;
  entities?: Array<{ id: number; name: string }>;
  transactions?: Array<{ id: number; description: string; amount: number; dueDate: string | null }>;
  selectedTransaction?: { id: number; description: string; amount: number; dueDate: string | null };
  userId: number;
  entityId: number;
  organizationId: number | null;
  expiresAt: number;
}>();

const ATTACHMENT_TYPE_LABELS: Record<string, string> = {
  COMPROVANTE_PAGAMENTO: "Comprovante de Pagamento",
  BOLETO: "Boleto",
  NOTA_FISCAL: "Nota Fiscal",
  DOCUMENTOS: "Documento",
};

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

    // @s.whatsapp.net → envia direto; v2.3.7 roteia via OnWhatsappCache para @lid internamente
    // @lid → envia direto (v2.3.7 bypass PR #2544); mas pode resultar em PENDING
    // número puro → tenta resolver via Evolution API
    let sendTo = to;
    if (to.includes("@s.whatsapp.net")) {
      sendTo = to;
      console.log(`[WhatsApp Bot] Enviando para @s.whatsapp.net (routing cache v2.3.7): ${sendTo}`);
    } else if (to.includes("@lid")) {
      sendTo = to;
      console.log(`[WhatsApp Bot] Enviando direto para @lid (v2.3.7 bypass): ${sendTo}`);
    } else if (!to.includes("@")) {
      const resolved = await resolveJidViaEvolution(to);
      if (resolved) {
        sendTo = resolved;
        console.log(`[WhatsApp Bot] JID resolvido para ${to}: ${sendTo}`);
      } else {
        console.warn(`[WhatsApp Bot] Não foi possível resolver JID para ${to}, usando número puro`);
      }
    }

    console.log(`[WhatsApp Bot] Enviando mensagem para: ${sendTo}`);

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

    if (msgStatus === "PENDING") {
      console.warn(`[WhatsApp Bot] ⚠️ PENDING para ${sendTo} — mensagem criada localmente mas sem ACK do servidor WhatsApp.`);
      if (sendTo.includes("@s.whatsapp.net")) {
        console.warn(`[WhatsApp Bot] 💡 Cache v2.3.7 pode não estar aquecido. Certifique-se de que o usuário enviou uma mensagem recente para acionar o cache (lid=lid).`);
      }
    } else {
      console.log(`[WhatsApp Bot] ✅ Mensagem entregue para: ${sendTo} — status: ${msgStatus}`);
    }
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
type ExtractionResult =
  | { ok: true; data: ExtractedTransaction }
  | { ok: false; reason: "no_transaction" | "llm_error" };

async function extractTransactionFromText(
  text: string,
  userEntities: { id: number; name: string }[],
  categories: { name: string; type: string }[] = [],
  creditCardsList: { name: string }[] = []
): Promise<ExtractionResult> {
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
Cartões de crédito cadastrados: ${creditCardsStr}

Retorne um JSON com os campos:
- entityName: nome da entidade/centro de custo (string ou null)
- amount: valor em reais como número decimal (ex: 150.50) — valor TOTAL, não por parcela
- date: data no formato YYYY-MM-DD (use hoje se não informado)
- description: descrição curta da transação
- type: "INCOME" para crédito/receita ou "EXPENSE" para débito/despesa
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
      maxRetries: 0,
      maxRetryDelayMs: 3000,
    });

    const content = result.choices?.[0]?.message?.content;
    console.log(`[WhatsApp Bot] LLM resposta bruta: ${typeof content === "string" ? content.slice(0, 500) : JSON.stringify(content)?.slice(0, 500)}`);
    if (!content || typeof content !== "string") return null;

    const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(cleaned) as ExtractedTransaction | null;

    if (!parsed || !parsed.amount || !parsed.description) {
      console.warn(`[WhatsApp Bot] Extração descartada — amount=${parsed?.amount}, description=${parsed?.description}`);
      return { ok: false as const, reason: "no_transaction" as const };
    }
    return { ok: true as const, data: parsed };
  } catch (error) {
    console.error("[WhatsApp Bot] Erro ao extrair transação:", error);
    return { ok: false as const, reason: "llm_error" as const };
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
Cartões de crédito cadastrados: ${creditCardsStr}

Retorne um JSON com os campos:
- entityName: nome da entidade/centro de custo (string ou null)
- amount: valor em reais como número decimal (ex: 150.50) — valor TOTAL, não por parcela
- date: data no formato YYYY-MM-DD (use hoje se não informado)
- description: descrição curta da transação
- type: "INCOME" para crédito/receita ou "EXPENSE" para débito/despesa
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
      maxRetries: 0,
      maxRetryDelayMs: 3000,
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
type AudioTranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; reason: "ffmpeg_error" | "llm_error" | "no_content" };

async function transcribeAudioWithGemini(
  buffer: Buffer,
  mimeType: string
): Promise<AudioTranscriptionResult> {
  let audioBuffer = buffer;
  let format = (mimeType.split("/")[1] || "").split(";")[0].trim();
  console.log(`[WhatsApp Bot] Transcrição: mimeType="${mimeType}", format="${format}", size=${buffer.length}b`);

  if (format !== "mp3" && format !== "wav") {
    const mp3 = await transcodeToMp3(buffer);
    if (!mp3) return { ok: false, reason: "ffmpeg_error" };
    audioBuffer = mp3;
    format = "mp3";
    console.log(`[WhatsApp Bot] Transcrição: áudio convertido para mp3, size=${audioBuffer.length}b`);
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
      maxRetries: 0,
      maxRetryDelayMs: 3000,
    });

    const content = result.choices?.[0]?.message?.content;
    console.log(`[WhatsApp Bot] Transcrição resultado: finish_reason=${result.choices?.[0]?.finish_reason}, content=${typeof content === "string" ? content.slice(0, 200) : JSON.stringify(content)?.slice(0, 200)}`);
    if (!content || typeof content !== "string") return { ok: false, reason: "no_content" };
    const transcription = content.trim();
    if (!transcription) return { ok: false, reason: "no_content" };
    return { ok: true, text: transcription };
  } catch (error) {
    console.error("[WhatsApp Bot] Erro ao transcrever áudio com Gemini:", error);
    return { ok: false, reason: "llm_error" };
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
 * Usa o LLM para escolher a categoria mais adequada dentre as categorias ATIVAS cadastradas.
 * Segundo passo dedicado — a lista passada contém apenas categorias ativas, eliminando alucinações.
 */
async function classifyCategoryWithLLM(
  description: string,
  type: "INCOME" | "EXPENSE",
  categories: { id: number; name: string; type: string }[]
): Promise<number | null> {
  const filtered = categories.filter(c => c.type === type);
  if (filtered.length === 0) return null;

  const listStr = filtered.map(c => `- ${c.name}`).join("\n");

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um classificador financeiro. Escolha a categoria mais adequada para a transação abaixo, dentre as opções disponíveis.

Categorias disponíveis (${type === "EXPENSE" ? "despesas" : "receitas"}):
${listStr}

Regras:
- Retorne EXATAMENTE o nome de uma categoria da lista acima, sem alterações
- Se nenhuma categoria for adequada, retorne apenas a palavra: null
- Não explique, não adicione texto extra — apenas o nome ou "null"`,
        },
        {
          role: "user",
          content: `Transação: ${description}`,
        },
      ],
      maxRetries: 0,
      maxRetryDelayMs: 3000,
    });

    const content = result.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const chosen = content.trim();
    if (!chosen || chosen.toLowerCase() === "null") return null;

    // Busca exata primeiro, depois fallback para contains
    const exact = filtered.find(c => c.name.toLowerCase() === chosen.toLowerCase());
    if (exact) return exact.id;

    const fallback = filtered.find(c =>
      c.name.toLowerCase().includes(chosen.toLowerCase()) ||
      chosen.toLowerCase().includes(c.name.toLowerCase())
    );
    return fallback?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Extrai mês e ano de uma string em português.
 * Aceita: "junho", "jul/2026", "07/26", "julho de 2026", "6", "06/2026"
 */
function parseMonthYear(input: string): { month: number; year: number } | null {
  const MONTHS: Record<string, number> = {
    jan: 1, janeiro: 1,
    fev: 2, fevereiro: 2,
    mar: 3, março: 3, marco: 3,
    abr: 4, abril: 4,
    mai: 5, maio: 5,
    jun: 6, junho: 6,
    jul: 7, julho: 7,
    ago: 8, agosto: 8,
    set: 9, setembro: 9,
    out: 10, outubro: 10,
    nov: 11, novembro: 11,
    dez: 12, dezembro: 12,
  };
  const now = new Date();
  const currentYear = now.getFullYear();
  const lower = input.toLowerCase().trim();

  // "06/2026" ou "6/2026"
  const full = lower.match(/\b(\d{1,2})[\/\-](\d{4})\b/);
  if (full) {
    const m = parseInt(full[1]);
    if (m >= 1 && m <= 12) return { month: m, year: parseInt(full[2]) };
  }
  // "06/26" ou "6/26"
  const short = lower.match(/\b(\d{1,2})[\/\-](\d{2})\b/);
  if (short) {
    const m = parseInt(short[1]);
    if (m >= 1 && m <= 12) return { month: m, year: 2000 + parseInt(short[2]) };
  }
  // Nome do mês com ano opcional
  for (const [name, month] of Object.entries(MONTHS)) {
    if (lower.includes(name)) {
      const yearMatch = lower.match(/\b(20\d{2})\b/);
      return { month, year: yearMatch ? parseInt(yearMatch[1]) : currentYear };
    }
  }
  // Só número 1–12
  const numOnly = lower.match(/^\s*(\d{1,2})\s*$/);
  if (numOnly) {
    const m = parseInt(numOnly[1]);
    if (m >= 1 && m <= 12) return { month: m, year: currentYear };
  }
  return null;
}

/**
 * Usa o LLM para encontrar a transação mais adequada dentre uma lista de pendentes.
 * Retorna a transação que melhor corresponde à descrição do usuário.
 */
async function matchTransactionWithLLM(
  description: string,
  transactions: Array<{ id: number; description: string; amount: number; dueDate: string | null }>
): Promise<{ id: number; description: string; amount: number; dueDate: string | null } | null> {
  if (transactions.length === 0) return null;

  const listStr = transactions.map((t, i) => {
    const valor = formatCurrency(t.amount);
    const venc = t.dueDate ?? "sem vencimento";
    return `${i + 1}. ${t.description} • ${valor} • Vencimento: ${venc}`;
  }).join("\n");

  console.log(`[WhatsApp Bot] matchTransaction: descrição="${description}", ${transactions.length} candidatas`);

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um assistente de busca financeira. O usuário vai descrever uma transação e você deve encontrar a mais parecida na lista abaixo.

Transações disponíveis:
${listStr}

Instruções:
- Retorne APENAS o número (1, 2, 3...) da transação que melhor corresponde à descrição
- Leve em conta descrição, valor aproximado e data, quando mencionados
- Mesmo que a correspondência não seja perfeita, escolha a mais próxima
- Só retorne "null" se a descrição não tiver NENHUMA relação com qualquer transação da lista`,
        },
        {
          role: "user",
          content: description,
        },
      ],
      maxRetries: 0,
      maxRetryDelayMs: 3000,
    });

    const content = result.choices?.[0]?.message?.content;
    console.log(`[WhatsApp Bot] matchTransaction LLM resposta: "${content}"`);
    if (!content || typeof content !== "string") return null;

    const cleaned = content.trim().replace(/[^\d]/g, "");
    if (!cleaned) return null;

    const idx = parseInt(cleaned, 10) - 1;
    return transactions[idx] ?? null;
  } catch (err) {
    console.error("[WhatsApp Bot] matchTransaction erro:", err);
    return null;
  }
}

/**
 * Resolve categoryId usando classificação por LLM (segunda passagem dedicada).
 * Garante que apenas categorias ATIVAS são consideradas.
 */
async function resolveCategoryId(
  description: string,
  entityId: number,
  userId: number,
  type: "INCOME" | "EXPENSE"
): Promise<number | null> {
  try {
    const cats = await db.getCategoriesByEntityId(entityId, userId); // só ativas por padrão
    return await classifyCategoryWithLLM(description, type, cats);
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
async function resolveCreditCard(
  cardName: string | undefined,
  entityId: number,
  userId: number
): Promise<{ id: number; name: string; closingDay: number; dueDay: number } | null> {
  if (!cardName) return null;
  try {
    const cards = await db.getCreditCardsByEntityId(entityId, userId);
    console.log(`[WhatsApp Bot] Cartões disponíveis na entidade ${entityId}:`, cards.map(c => c.name));
    const normalized = cardName.toLowerCase().trim();
    const match = cards.find(c =>
      c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase())
    );
    if (match) {
      console.log(`[WhatsApp Bot] Cartão resolvido: "${cardName}" → id=${match.id} nome="${match.name}" fechamento=dia${match.closingDay}`);
      return { id: match.id, name: match.name, closingDay: match.closingDay, dueDay: match.dueDay };
    }
    console.log(`[WhatsApp Bot] Cartão "${cardName}" não encontrado na entidade ${entityId}`);
    return null;
  } catch (err) {
    console.error("[WhatsApp Bot] Erro ao resolver cartão:", err);
    return null;
  }
}

async function resolveCreditCardId(
  cardName: string | undefined,
  entityId: number,
  userId: number
): Promise<number | null> {
  const card = await resolveCreditCard(cardName, entityId, userId);
  return card?.id ?? null;
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
/**
 * Busca transações PENDING da entidade para o mês/ano informado,
 * ordena vencidas primeiro e exibe lista numerada.
 * Avança o stage para awaiting_match_confirm.
 */
async function showPendingTransactionsList(
  replyJid: string,
  pendingAttach: NonNullable<ReturnType<typeof pendingAttachments.get>>,
  entityId: number,
  month: number,
  year: number,
  sendReply: (txt: string) => Promise<void>
): Promise<void> {
  const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const monthLabel = `${MONTH_NAMES[month - 1]}/${year}`;

  // Transações regulares (sem cartão de crédito)
  const [pendingTx, overdueTx] = await Promise.all([
    db.getTransactionsByEntityId(entityId, { status: "PENDING", limit: 200, excludeCreditCard: true }),
    db.getTransactionsByEntityId(entityId, { status: "OVERDUE", limit: 200, excludeCreditCard: true }),
  ]);

  // Filtrar pelo mês/ano (aceita fuso local ou UTC)
  const matchesMonth = (dueDate: any) => {
    if (!dueDate) return false;
    const d = new Date(dueDate);
    return (d.getMonth() + 1 === month && d.getFullYear() === year) ||
           (d.getUTCMonth() + 1 === month && d.getUTCFullYear() === year);
  };

  const regularTx = [...(pendingTx as any[]), ...(overdueTx as any[])].filter((t: any) => matchesMonth(t.dueDate));

  // Faturas de cartão de crédito com pendências no mês
  const dbInstance = await (db as any).getDb?.() ?? null;
  type CardInvoiceItem = { id: number; description: string; amount: number; dueDate: string | null; status: string; overdue: boolean; isCreditCard: true; creditCardId: number };
  const cardItems: CardInvoiceItem[] = [];
  try {
    const cards = await db.getCreditCardsByEntityId(entityId);
    const rawDb = await getDb();
    if (rawDb && cards.length > 0) {
      for (const card of cards as any[]) {
        const startDate = new Date(year, month - 1, 1).toISOString();
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
        const rows = await rawDb.execute(
          sqlTag`SELECT COALESCE(SUM(amount),0) as total, MIN("dueDate") as first_due
                 FROM transactions
                 WHERE "creditCardId" = ${card.id}
                   AND "dueDate" >= ${startDate}
                   AND "dueDate" <= ${endDate}
                   AND status IN ('PENDING','OVERDUE')`
        );
        const row = (Array.isArray(rows) ? rows[0] : (rows as any).rows?.[0]) as any;
        const total = Number(row?.total ?? 0);
        if (total > 0) {
          const firstDue = row?.first_due ? new Date(row.first_due).toLocaleDateString("pt-BR") : null;
          const now = new Date();
          const isOverdue = row?.first_due && new Date(row.first_due) < now;
          cardItems.push({
            id: -card.id,
            description: `Fatura ${card.name}`,
            amount: total,
            dueDate: firstDue,
            status: isOverdue ? "OVERDUE" : "PENDING",
            overdue: !!isOverdue,
            isCreditCard: true,
            creditCardId: card.id,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[WhatsApp Bot] Erro ao buscar faturas de cartão:", err);
  }

  if (regularTx.length === 0 && cardItems.length === 0) {
    pendingAttachments.set(replyJid, { ...pendingAttach, entityId, stage: "awaiting_month" });
    await sendReply(`⚠️ Nenhuma transação pendente ou vencida em *${monthLabel}*.\n\nInforme outro mês ou *0* para cancelar.`);
    return;
  }

  const now = new Date();

  const overdue = regularTx.filter((t: any) => t.status === "OVERDUE" || new Date(t.dueDate) < now);
  const upcoming = regularTx.filter((t: any) => t.status !== "OVERDUE" && new Date(t.dueDate) >= now);
  overdue.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  upcoming.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const overdueCards = cardItems.filter(c => c.overdue);
  const pendingCards = cardItems.filter(c => !c.overdue);

  const combined = [...overdueCards, ...overdue, ...pendingCards, ...upcoming].slice(0, 10);

  const txForList = combined.map((t: any) => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    dueDate: t.dueDate,
    status: t.status,
    overdue: t.overdue ?? (t.status === "OVERDUE" || (t.dueDate && new Date(t.dueDate) < now)),
    isCreditCard: t.isCreditCard ?? false,
    creditCardId: t.creditCardId ?? null,
    invoiceMonth: t.isCreditCard ? month : undefined,
    invoiceYear: t.isCreditCard ? year : undefined,
  }));

  const listStr = txForList.map((t, i) => {
    const flag = t.isCreditCard ? "💳" : t.overdue ? "🔴" : "🟡";
    const venc = t.dueDate ? `Vence ${t.dueDate}` : "sem vencimento";
    return `*${i + 1}* ${flag} ${t.description}\n    ${formatCurrency(t.amount)} • ${venc}`;
  }).join("\n");

  pendingAttachments.set(replyJid, {
    ...pendingAttach,
    stage: "awaiting_match_confirm",
    entityId,
    transactions: txForList,
    selectedTransaction: undefined,
  });

  await sendReply(
    `📋 *Transações de ${monthLabel}:*\n🔴 Vencida  🟡 Pendente  💳 Fatura\n\n${listStr}\n\n*0* — Cancelar`
  );
}

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

  // Se for LID e encontrou usuário pelo número, atualizar o LID salvo (pode ter mudado após reconexão)
  if (userResult.length > 0 && isLid && userResult[0].whatsappLid !== replyJid) {
    console.log(`[WhatsApp Bot] Atualizando LID: ${userResult[0].whatsappLid ?? "(vazio)"} → ${replyJid} para usuário ${userResult[0].id}`);
    await dbInstance
      .update(users)
      .set({ whatsappLid: replyJid, updatedAt: new Date() })
      .where(eq(users.id, userResult[0].id));
    userResult[0].whatsappLid = replyJid;
  }

  // Se for LID e não encontrou por nenhum método, buscar QUALQUER usuário com whatsappPhone preenchido
  // (workaround para quando o LID não corresponde ao número)
  if (userResult.length === 0 && isLid) {
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

  // Destino de envio:
  // - @lid (isLid=true): usa @s.whatsapp.net para aproveitar OnWhatsappCache do v2.3.7.
  //   Quando a Evolution API recebe mensagem de conta @lid, ela popula o cache
  //   com lid=lid para aquele número. Enviar para @s.whatsapp.net logo depois
  //   faz o v2.3.7 roteá-la internamente via @lid (confirmado: status 1/SERVER_ACK nos logs).
  //   Enviar direto ao @lid resulta em PENDING mesmo no v2.3.7.
  // - normal: usa número de telefone puro para resolução via Evolution API
  let sendTarget: string;
  if (isLid && user.whatsappPhone) {
    sendTarget = `${user.whatsappPhone}@s.whatsapp.net`;
    console.log(`[WhatsApp Bot] LID mode — enviando para @s.whatsapp.net via cache v2.3.7: ${sendTarget}`);
  } else if (isLid && replyJid.includes("@s.whatsapp.net")) {
    sendTarget = replyJid;
    console.log(`[WhatsApp Bot] LID mode — usando replyJid @s.whatsapp.net: ${sendTarget}`);
  } else if (user.whatsappPhone) {
    sendTarget = user.whatsappPhone;
  } else {
    sendTarget = replyJid;
  }

  const sendReply = (txt: string) => sendWhatsAppMessage(sendTarget, txt);

  // 2. Verificar se há fluxo de anexo pendente
  const pendingAttach = pendingAttachments.get(replyJid);
  if (pendingAttach && Date.now() < pendingAttach.expiresAt) {
    const messageType = payload.data?.messageType ?? "conversation";
    let responseText = payload.data.message?.conversation ||
      payload.data.message?.extendedTextMessage?.text || "";

    // Transcrever voz se necessário
    if ((messageType === "audioMessage" || messageType === "pttMessage") && !responseText) {
      const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "sgf-bot";
      const mediaData = await downloadEvolutionMedia(messageId, instanceName);
      if (mediaData) {
        const tr = await transcribeAudioWithGemini(mediaData.buffer, mediaData.mimeType);
        if (tr.ok) responseText = tr.text;
      }
    }

    const trimmed = responseText.trim();

    if (pendingAttach.stage === "awaiting_mode") {
      if (trimmed === "1") {
        // Nova transação — tentar extrair dados do documento
        const org = await db.getOrFirstOrganizationForUser(user.id);
        const userEntities = await db.getEntitiesByUserId(user.id);
        const defaultEntityId = userEntities[0]?.id;
        const [categoriesList, creditCardsList] = await Promise.all([
          db.getCategoriesByEntityId(defaultEntityId, user.id).catch(() => []),
          db.getCreditCardsByEntityId(defaultEntityId, user.id).catch(() => []),
        ]);
        await sendReply(`🤔 Processando...`);
        const extracted = await extractTransactionFromImage(pendingAttach.mediaUrl, userEntities, categoriesList, creditCardsList);
        if (!extracted) {
          // Extração falhou — manter o arquivo e aguardar descrição por voz/texto
          pendingAttachments.set(replyJid, { ...pendingAttach, stage: "awaiting_description" });
          await sendReply(`❌ Não consegui extrair os dados do documento.\n\n📎 O arquivo está guardado. Descreva a transação por *voz* ou *texto* que ele será anexado automaticamente.`);
          return;
        }
        const entityId = resolveEntityId(extracted.entityName, userEntities);
        if (!entityId) {
          pendingAttachments.delete(replyJid);
          await sendReply(`❌ Não encontrei a entidade. Verifique suas entidades no sistema.`);
          return;
        }
        const entityName = userEntities.find(e => e.id === entityId)?.name ?? "Entidade";
        // Extração ok — salvar referência do arquivo junto com a confirmação
        pendingAttachments.delete(replyJid);
        pendingConfirmations.set(replyJid, {
          extracted,
          userId: user.id,
          organizationId: org?.id ?? null,
          entityId,
          messageId,
          expiresAt: Date.now() + 10 * 60 * 1000,
          pendingFile: { mediaUrl: pendingAttach.mediaUrl, mimeType: pendingAttach.mimeType, filename: pendingAttach.filename, fileSize: pendingAttach.fileSize },
        });
        await sendReply(buildConfirmationMessage(extracted, entityName));
        return;
      }

      if (trimmed === "2") {
        // Anexar a transação existente — verificar se há múltiplas entidades
        const allEntities = await db.getEntitiesByUserId(pendingAttach.userId);
        if (allEntities.length === 0) {
          pendingAttachments.delete(replyJid);
          await sendReply(`⚠️ Nenhuma entidade encontrada. Cadastre uma entidade no sistema.`);
          return;
        }

        if (allEntities.length > 1) {
          // Múltiplas entidades: pedir para escolher
          const listStr = allEntities.map((e: { id: number; name: string }, i: number) => `*${i + 1}* — ${e.name}`).join("\n");
          pendingAttachments.set(replyJid, {
            ...pendingAttach,
            stage: "awaiting_entity",
            entities: allEntities,
          });
          await sendReply(`🏢 *Qual entidade?*\n\n${listStr}\n\n*0* — Cancelar`);
          return;
        }

        // Entidade única: pedir mês
        pendingAttachments.set(replyJid, { ...pendingAttach, stage: "awaiting_month", entityId: allEntities[0].id });
        await sendReply(`📅 *Qual o mês de vencimento?*\n\nEx: _junho_, _jul/2026_, _07/26_`);
        return;
      }

      // Cancelar
      if (trimmed === "0" || trimmed.toLowerCase().includes("cancel")) {
        pendingAttachments.delete(replyJid);
        await sendReply(`❌ Operação cancelada.`);
        return;
      }
    }

    if (pendingAttach.stage === "awaiting_entity" && pendingAttach.entities) {
      if (trimmed === "0" || trimmed.toLowerCase().includes("cancel")) {
        pendingAttachments.delete(replyJid);
        await sendReply(`❌ Operação cancelada.`);
        return;
      }

      const idx = parseInt(trimmed, 10) - 1;
      const chosenEntity = pendingAttach.entities[idx];
      if (!chosenEntity) {
        await sendReply(`❓ Responda com o número da entidade ou *0* para cancelar.`);
        return;
      }

      pendingAttachments.set(replyJid, { ...pendingAttach, stage: "awaiting_month", entityId: chosenEntity.id });
      await sendReply(`📅 *Qual o mês de vencimento?*\n\nEx: _junho_, _jul/2026_, _07/26_`);
      return;
    }

    if (pendingAttach.stage === "awaiting_month") {
      if (trimmed === "0" || trimmed.toLowerCase().includes("cancel")) {
        pendingAttachments.delete(replyJid);
        await sendReply(`❌ Operação cancelada.`);
        return;
      }

      const parsed = parseMonthYear(trimmed);
      if (!parsed) {
        await sendReply(`❓ Não entendi o mês. Tente: _junho_, _jul/2026_, _07/26_ ou *0* para cancelar.`);
        return;
      }

      await showPendingTransactionsList(replyJid, pendingAttach, pendingAttach.entityId, parsed.month, parsed.year, sendReply);
      return;
    }

    if (pendingAttach.stage === "awaiting_match_confirm" && pendingAttach.transactions) {
      if (trimmed === "0" || trimmed.toLowerCase().includes("cancel")) {
        pendingAttachments.delete(replyJid);
        await sendReply(`❌ Operação cancelada.`);
        return;
      }

      const idx = parseInt(trimmed, 10) - 1;
      const chosen = pendingAttach.transactions[idx];
      if (!chosen) {
        await sendReply(`❓ Responda com o número da transação ou *0* para cancelar.`);
        return;
      }

      pendingAttachments.set(replyJid, { ...pendingAttach, stage: "awaiting_type", selectedTransaction: chosen });
      await sendReply(
        `🗂️ *Qual o tipo do documento?*\n\n*1* — Comprovante de Pagamento ✅ (marca como pago)\n*2* — Boleto\n*3* — Nota Fiscal\n*4* — Documento\n*0* — Cancelar`
      );
      return;
    }

    if (pendingAttach.stage === "awaiting_type" && pendingAttach.selectedTransaction) {
      if (trimmed === "0" || trimmed.toLowerCase().includes("cancel")) {
        pendingAttachments.delete(replyJid);
        await sendReply(`❌ Operação cancelada.`);
        return;
      }

      const typeMap: Record<string, string> = {
        "1": "COMPROVANTE_PAGAMENTO",
        "2": "BOLETO",
        "3": "NOTA_FISCAL",
        "4": "DOCUMENTOS",
      };
      const attachType = typeMap[trimmed];
      if (!attachType) {
        await sendReply(`❓ Responda com 1, 2, 3 ou 4 para escolher o tipo, ou *0* para cancelar.`);
        return;
      }

      const chosen = pendingAttach.selectedTransaction;
      pendingAttachments.delete(replyJid);

      try {
        const isComprovante = attachType === "COMPROVANTE_PAGAMENTO";
        const typeLabel = ATTACHMENT_TYPE_LABELS[attachType] ?? attachType;

        // Fatura de cartão de crédito — salva em credit_card_invoice_attachments
        if ((chosen as any).isCreditCard && (chosen as any).creditCardId) {
          const rawDb = await getDb();
          if (rawDb) {
            const cardId: number = (chosen as any).creditCardId;
            const invoiceMonth: number = (chosen as any).invoiceMonth;
            const invoiceYear: number = (chosen as any).invoiceYear;

            // Buscar ou criar registro da fatura
            let [invoice] = await rawDb.select().from(creditCardInvoices)
              .where(and(
                eq(creditCardInvoices.creditCardId, cardId),
                eq(creditCardInvoices.month, invoiceMonth),
                eq(creditCardInvoices.year, invoiceYear),
              )).limit(1);

            if (!invoice) {
              const [newInvoice] = await rawDb.insert(creditCardInvoices).values({
                creditCardId: cardId,
                month: invoiceMonth,
                year: invoiceYear,
                status: "OPEN",
                totalAmount: chosen.amount,
                dueDate: new Date(invoiceYear, invoiceMonth - 1, 10),
              }).returning();
              invoice = newInvoice;
            }

            // Salvar anexo na tabela de faturas de cartão
            await rawDb.insert(creditCardInvoiceAttachments).values({
              invoiceId: invoice.id,
              filename: pendingAttach.filename,
              blobUrl: pendingAttach.mediaUrl,
              fileSize: pendingAttach.fileSize,
              mimeType: pendingAttach.mimeType,
              type: attachType as any,
            });

            // Se comprovante de pagamento, marcar transações do mês como pagas
            if (isComprovante) {
              const startDate = new Date(invoiceYear, invoiceMonth - 1, 1).toISOString();
              const endDate = new Date(invoiceYear, invoiceMonth, 0, 23, 59, 59).toISOString();
              await rawDb.execute(
                sqlTag`UPDATE transactions SET status = 'PAID', "paymentDate" = NOW(), "updatedAt" = NOW()
                       WHERE "creditCardId" = ${cardId}
                         AND "dueDate" >= ${startDate}
                         AND "dueDate" <= ${endDate}
                         AND status IN ('PENDING','OVERDUE')`
              );
            }
          }
          const statusLine = isComprovante ? `\n\n🟢 Fatura marcada como *PAGA*` : "";
          await sendReply(
            `✅ *${typeLabel} da ${chosen.description} salvo!*\n\n💰 ${formatCurrency(chosen.amount)}${statusLine}`
          );
          return;
        }

        // Transação regular
        await db.createAttachment({
          transactionId: chosen.id,
          filename: pendingAttach.filename,
          blobUrl: pendingAttach.mediaUrl,
          fileSize: pendingAttach.fileSize,
          mimeType: pendingAttach.mimeType,
          type: attachType,
        } as any);

        if (isComprovante) {
          await db.updateTransaction(chosen.id, { status: "PAID", paymentDate: new Date() } as any);
        }

        const statusLine = isComprovante ? `\n\n🟢 Status atualizado para *PAGO*` : "";
        await sendReply(
          `✅ *${typeLabel} anexado com sucesso!*\n\n📝 ${chosen.description}\n💰 ${formatCurrency(chosen.amount)}\n📅 Vencimento: ${chosen.dueDate ?? "-"}${statusLine}`
        );
      } catch (err) {
        console.error("[WhatsApp Bot] Erro ao salvar anexo:", err);
        await sendReply(`❌ Erro ao salvar o anexo. Tente novamente.`);
      }
      return;
    }
  }

  // 3. Verificar se é uma resposta de confirmação pendente
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
          extracted.description ?? extracted.categoryName ?? "",
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
        const creditCard = await resolveCreditCard(
          extracted.creditCardName,
          pending.entityId,
          user.id
        );
        const creditCardId = creditCard?.id ?? null;

        console.log(`[WhatsApp Bot] creditCardId resolvido: ${creditCardId}`);

        const installments = (extracted.installments && extracted.installments > 1)
          ? extracted.installments
          : 1;
        const description = extracted.description ?? "Transação via WhatsApp";

        // Quando há cartão de crédito, a data da primeira parcela considera o
        // closingDay para determinar em qual fatura a compra cai, e retorna
        // o 1º dia do mês de vencimento (mês seguinte ao fechamento).
        //
        // Exemplos com closingDay=29:
        //   Compra em 08/jun → fatura fecha 29/jun → vence em julho → 01/07
        //   Compra em 30/jun → fatura de jun já fechou → fatura fecha 29/jul → vence em agosto → 01/08
        const getFirstInstallmentDate = (referenceDate: Date): Date => {
          if (!creditCard) return referenceDate;
          const closingDay = creditCard.closingDay;
          // monthOffset=0: fatura do mês atual (ainda não fechou), vence no mês+1
          // monthOffset=1: fatura do mês seguinte (já passou do fechamento), vence no mês+2
          const monthOffset = referenceDate.getDate() >= closingDay ? 1 : 0;
          // +1 porque o vencimento é sempre no mês APÓS o fechamento
          // Usar 15:00 UTC (meio-dia BRT) para evitar que meia-noite UTC = véspera no Brasil
          return new Date(Date.UTC(
            referenceDate.getFullYear(),
            referenceDate.getMonth() + monthOffset + 1,
            1, 15, 0, 0
          ));
        };

        const firstInstallmentDate = getFirstInstallmentDate(baseDate);
        console.log(`[WhatsApp Bot] baseDate=${baseDate.toISOString()}, closingDay=${creditCard?.closingDay}, firstInstallmentDate=${firstInstallmentDate.toISOString()}`);

        // Compras no cartão de crédito ficam PENDING (serão pagas na fatura)
        const txStatus = creditCard ? "PENDING" : "PAID";

        const basePayload = {
          entityId: pending.entityId,
          type: extracted.type ?? "EXPENSE",
          amount: Math.round(amountCents / installments),
          status: txStatus as "PENDING" | "PAID",
          categoryId: categoryId ?? undefined,
          bankAccountId: bankAccountId ?? undefined,
          paymentMethodId: paymentMethodId ?? undefined,
          importOrigin: "MANUAL" as const,
        };

        let firstTransactionId: number;
        const createdIds: number[] = [];

        if (installments > 1) {
          for (let i = 1; i <= installments; i++) {
            const installmentDate = new Date(firstInstallmentDate);
            installmentDate.setMonth(installmentDate.getMonth() + (i - 1));
            const tid = await db.createTransaction({
              ...basePayload,
              description: `${description} (${i}/${installments})`,
              dueDate: installmentDate,
              paymentDate: undefined,
              isRecurring: false,
              ...(creditCardId ? { creditCardId } as any : {}),
            });
            createdIds.push(tid);
          }
          firstTransactionId = createdIds[0];
        } else {
          firstTransactionId = await db.createTransaction({
            ...basePayload,
            description,
            amount: amountCents,
            dueDate: creditCard ? firstInstallmentDate : baseDate,
            paymentDate: creditCard ? undefined : new Date(),
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
        const firstMonthLabel = firstInstallmentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        let successMsg = `✅ *Transação cadastrada com sucesso!*\n\n${extracted.type === "INCOME" ? "💰 Crédito" : "💸 Débito"}: *${amountStr}*\n📝 ${description}`;
        if (installments > 1) {
          successMsg += `\n🔢 Parcelado em ${installments}x de ${formatCurrency(Math.round(amountCents / installments))}`;
          if (creditCard) successMsg += ` — 1ª parcela em ${firstMonthLabel}`;
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

    const transcriptionResult = await transcribeAudioWithGemini(mediaData.buffer, mediaData.mimeType);

    if (!transcriptionResult.ok) {
      if (transcriptionResult.reason === "llm_error") {
        await sendReply(`⏳ Serviço de IA temporariamente indisponível. Aguarde alguns instantes e tente novamente.`);
      } else if (transcriptionResult.reason === "ffmpeg_error") {
        await sendReply(`❌ Não consegui converter o áudio. Tente enviar em formato MP3 ou por mensagem de texto.`);
      } else {
        await sendReply(`❌ Não consegui transcrever o áudio. Tente enviar uma mensagem de texto.`);
      }
      return;
    }

    extractedText = transcriptionResult.text;
    console.log(`[WhatsApp Bot] Áudio transcrito: "${transcriptionResult.text}"`);

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
    await sendReply(`📎 Documento recebido! Fazendo upload...`);

    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "sgf-bot";
    const mediaData = await downloadEvolutionMedia(messageId, instanceName);

    if (!mediaData) {
      await sendReply(`❌ Não consegui baixar a imagem. Tente novamente.`);
      return;
    }

    // Upload para S3
    let imageUrl: string | null = null;
    let uploadedFilename = "";
    try {
      if (isS3Configured()) {
        const ext = mediaData.mimeType.includes("png") ? "png" : "jpg";
        uploadedFilename = `whatsapp-image-${Date.now()}.${ext}`;
        imageUrl = await uploadToS3(mediaData.buffer, uploadedFilename, mediaData.mimeType, "whatsapp");
      } else {
        const { storagePut } = await import("../storage");
        const ext = mediaData.mimeType.includes("png") ? "png" : "jpg";
        uploadedFilename = `whatsapp/image-${Date.now()}.${ext}`;
        const { url } = await storagePut(uploadedFilename, mediaData.buffer, mediaData.mimeType);
        imageUrl = url;
      }
    } catch (uploadError) {
      console.error("[WhatsApp Bot] Erro ao fazer upload da imagem:", uploadError);
    }

    if (!imageUrl) {
      await sendReply(`❌ Não consegui fazer o upload da imagem. Tente novamente.`);
      return;
    }

    mediaUrl = imageUrl;

    // Perguntar ao usuário o que deseja fazer com o documento
    pendingAttachments.set(replyJid, {
      mediaUrl: imageUrl,
      mimeType: mediaData.mimeType,
      filename: uploadedFilename || `imagem-${Date.now()}.jpg`,
      fileSize: mediaData.buffer.length,
      stage: "awaiting_mode",
      userId: user.id,
      entityId: defaultEntityId,
      organizationId: org?.id ?? null,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    await sendReply(
      `📎 *Documento recebido! O que deseja fazer?*\n\n*1* — Nova transação (extrair dados do documento)\n*2* — Anexar a uma transação já cadastrada\n*0* — Cancelar`
    );
    return;
  }

  // ── Processar texto ──────────────────────────────────────────────────────────
  else if (messageType === "conversation" || messageType === "extendedTextMessage") {
    if (!text.trim()) return;
    extractedText = text.trim();
  }

  // ── Processar documento com legenda (compartilhamento direto de apps bancários) ─
  else if (messageType === "documentWithCaptionMessage") {
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "sgf-bot";
    const mediaData = await downloadEvolutionMedia(messageId, instanceName);
    if (!mediaData) {
      await sendReply(`❌ Não consegui baixar o documento. Tente novamente.`);
      return;
    }
    const mimeType = mediaData.mimeType;
    const isImage = mimeType.startsWith("image/");
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("pdf") ? "pdf" : "jpg";
    const filename = `whatsapp-doc-${Date.now()}.${ext}`;
    let docUrl: string | null = null;
    try {
      if (isS3Configured()) {
        docUrl = await uploadToS3(mediaData.buffer, filename, mimeType, "whatsapp");
      } else {
        const { storagePut } = await import("../storage");
        const { url } = await storagePut(`whatsapp/${filename}`, mediaData.buffer, mimeType);
        docUrl = url;
      }
    } catch (uploadError) {
      console.error("[WhatsApp Bot] Erro ao fazer upload do documento com legenda:", uploadError);
    }
    if (!docUrl) {
      await sendReply(`❌ Não consegui fazer o upload do documento. Tente novamente.`);
      return;
    }
    pendingAttachments.set(replyJid, {
      mediaUrl: docUrl,
      mimeType,
      filename,
      fileSize: mediaData.buffer.length,
      stage: "awaiting_mode",
      userId: user.id,
      entityId: defaultEntityId,
      organizationId: org?.id ?? null,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    await sendReply(
      `📎 *Documento recebido! O que deseja fazer?*\n\n*1* — Nova transação (extrair dados do documento)\n*2* — Anexar a uma transação já cadastrada\n*0* — Cancelar`
    );
    return;
  }

  // ── Processar documento (PDF) ────────────────────────────────────────────────
  else if (messageType === "documentMessage") {
    const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "sgf-bot";
    const mediaData = await downloadEvolutionMedia(messageId, instanceName);
    if (!mediaData) {
      await sendReply(`❌ Não consegui baixar o documento. Tente novamente.`);
      return;
    }
    let docUrl: string | null = null;
    let docFilename = `whatsapp-doc-${Date.now()}.pdf`;
    try {
      if (isS3Configured()) {
        docUrl = await uploadToS3(mediaData.buffer, docFilename, mediaData.mimeType, "whatsapp");
      } else {
        const { storagePut } = await import("../storage");
        const { url } = await storagePut(`whatsapp/${docFilename}`, mediaData.buffer, mediaData.mimeType);
        docUrl = url;
      }
    } catch (uploadError) {
      console.error("[WhatsApp Bot] Erro ao fazer upload do documento:", uploadError);
    }
    if (!docUrl) {
      await sendReply(`❌ Não consegui fazer o upload do documento. Tente novamente.`);
      return;
    }
    pendingAttachments.set(replyJid, {
      mediaUrl: docUrl,
      mimeType: mediaData.mimeType,
      filename: docFilename,
      fileSize: mediaData.buffer.length,
      stage: "awaiting_mode",
      userId: user.id,
      entityId: defaultEntityId,
      organizationId: org?.id ?? null,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    await sendReply(
      `📎 *Documento recebido! O que deseja fazer?*\n\n*1* — Nova transação (extrair dados do documento)\n*2* — Anexar a uma transação já cadastrada\n*0* — Cancelar`
    );
    return;
  }

  // ── Extrair transação do texto ───────────────────────────────────────────────
  if (!extractedText) return;

  await sendReply(`🤔 Processando...`);

  const extractionResult = await extractTransactionFromText(extractedText, userEntities, categoriesList, creditCardsList);

  if (!extractionResult.ok) {
    if (extractionResult.reason === "llm_error") {
      await sendReply(`⏳ Serviço de IA temporariamente indisponível. Aguarde alguns instantes e tente novamente.`);
    } else {
      await sendReply(
        `❌ Não consegui identificar uma transação na sua mensagem.\n\nTente ser mais específico, por exemplo:\n_"Paguei 150 reais de mercado hoje"_\n_"Recebi 2000 de aluguel"_`
      );
    }
    return;
  }

  const extracted = extractionResult.data;
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

      // Enviar mensagem de boas-vindas
      const firstName = (user.name ?? "").split(" ")[0] || "usuário";
      const welcomeMsg =
        `👋 Olá, ${firstName}! Seu WhatsApp foi vinculado com sucesso ao UnifiquePro.\n\n` +
        `A partir de agora você pode:\n` +
        `• Enviar áudios ou mensagens de texto para registrar transações\n` +
        `• Anexar comprovantes a lançamentos pendentes\n\n` +
        `Para começar, é só mandar uma mensagem. 🚀`;
      sendWhatsAppMessage(`${normalized}@s.whatsapp.net`, welcomeMsg).catch((err) =>
        console.warn("[WhatsApp Bot] Falha ao enviar boas-vindas:", err?.message)
      );

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
