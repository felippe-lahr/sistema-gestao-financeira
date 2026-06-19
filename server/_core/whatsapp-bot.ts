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

interface NormalizedIncomingMessage {
  messageType: "text" | "audio" | "image" | "document";
  text: string;
  caption?: string;
  mediaId?: string;
  filename?: string;
  mimeType?: string;
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
  resolvedPaymentMethodId?: number | null;
  pendingFile?: { mediaUrl: string; mimeType: string; filename: string; fileSize: number };
}>();

// Aguarda arquivo pendente para transação recém-criada (fluxo post-confirmation)
// Stage "awaiting_file_for_tx": aguarda envio do arquivo pelo usuário
// Extends pendingAttachments with targetTransactionId

const pendingAttachOffer = new Map<string, {
  transactionId: number;
  expiresAt: number;
}>();

const pendingTxSetup = new Map<string, {
  extracted: ExtractedTransaction;
  userId: number;
  organizationId: number | null;
  entityId?: number;
  messageId: string;
  expiresAt: number;
  stage: "awaiting_amount" | "awaiting_entity" | "awaiting_payment_method";
  entityOptions?: Array<{ id: number; name: string }>;
  paymentMethodOptions?: Array<{ id: number; name: string }>;
  pendingFile?: { mediaUrl: string; mimeType: string; filename: string; fileSize: number };
}>();

// ─── Estado para fluxo de anexos em múltiplos passos ─────────────────────────
type AttachmentStage =
  | "awaiting_mode"          // perguntou "nova transação ou existente?"
  | "awaiting_description"   // aguarda voz/texto para descrever nova transação
  | "awaiting_entity"        // escolher entidade (quando usuário tem múltiplas)
  | "awaiting_month"         // escolher mês de vencimento
  | "awaiting_match_confirm" // escolher transação da lista filtrada
  | "awaiting_type"          // tipo do documento (comprovante/boleto/NF/doc)
  | "awaiting_file_for_tx";  // aguarda envio do arquivo pelo usuário (post-confirmation)

const pendingAttachments = new Map<string, {
  mediaUrl: string;
  mimeType: string;
  filename: string;
  fileSize: number;
  stage: AttachmentStage;
  targetTransactionId?: number;
  isCreditCard?: boolean;
  creditCardId?: number;
  invoiceMonth?: number;
  invoiceYear?: number;
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
 * Envia mensagem de texto via WhatsApp Cloud API.
 */
async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn("[WhatsApp Bot] WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN não configurados");
    return;
  }

  const cleanTo = to.replace(/@.*$/, "").replace(/\D/g, "");

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanTo,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`[WhatsApp Bot] ❌ Falha ao enviar para ${cleanTo} — HTTP ${response.status}: ${errText}`);
      return;
    }

    console.log(`[WhatsApp Bot] ✅ Mensagem enviada para: ${cleanTo}`);
  } catch (error) {
    console.error(`[WhatsApp Bot] Exceção ao enviar para ${to}:`, error);
  }
}

/**
 * Baixa mídia da WhatsApp Cloud API pelo mediaId
 */
async function downloadCloudMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) return null;

  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) {
      console.error(`[WhatsApp Bot] Erro ao obter URL da mídia: ${metaRes.status}`);
      return null;
    }
    const metaData = await metaRes.json() as { url?: string; mime_type?: string };
    if (!metaData.url) return null;

    const mediaRes = await fetch(metaData.url, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!mediaRes.ok) {
      console.error(`[WhatsApp Bot] Erro ao baixar mídia: ${mediaRes.status}`);
      return null;
    }
    const buffer = Buffer.from(await mediaRes.arrayBuffer());
    return { buffer, mimeType: metaData.mime_type || "application/octet-stream" };
  } catch (error) {
    console.error("[WhatsApp Bot] Erro ao baixar mídia Cloud API:", error);
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
 * Interpreta input de valor monetário digitado pelo usuário.
 * Aceita: "100", "100,50", "100.50", "R$100", etc.
 * Retorna valor em reais (float) ou null se inválido.
 */
function parseAmountInput(input: string): number | null {
  const cleaned = input.replace(/[^\d,\.]/g, "").trim();
  if (!cleaned) return null;
  // "100,50" → "100.50"
  const normalized = cleaned.replace(",", ".");
  const value = parseFloat(normalized);
  if (isNaN(value) || value < 0) return null;
  return value;
}

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

  const [pendingTx, overdueTx] = await Promise.all([
    db.getTransactionsByEntityId(entityId, { status: "PENDING", limit: 200 }),
    db.getTransactionsByEntityId(entityId, { status: "OVERDUE", limit: 200 }),
  ]);
  const allTx = [...(pendingTx as any[]), ...(overdueTx as any[])];

  // Filtrar pelo mês/ano informado
  const filtered = (allTx as any[]).filter((t: any) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d.getUTCMonth() + 1 === month && d.getUTCFullYear() === year;
  });

  if (filtered.length === 0) {
    // Manter no stage awaiting_month para tentar outro mês
    pendingAttachments.set(replyJid, { ...pendingAttach, entityId, stage: "awaiting_month" });
    await sendReply(`⚠️ Nenhuma transação pendente ou vencida em *${monthLabel}*.\n\nInforme outro mês ou *0* para cancelar.`);
    return;
  }

  const now = new Date();

  // Separar vencidas (status OVERDUE ou dueDate passado) das futuras
  const overdue = filtered.filter((t: any) => t.status === "OVERDUE" || (t.dueDate && new Date(t.dueDate) < now));
  const upcoming = filtered.filter((t: any) => t.status !== "OVERDUE" && (!t.dueDate || new Date(t.dueDate) >= now));
  overdue.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  upcoming.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const combined = [...overdue, ...upcoming].slice(0, 10);

  const txForList = combined.map((t: any) => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString("pt-BR") : null,
    overdue: t.status === "OVERDUE" || (t.dueDate && new Date(t.dueDate) < now),
  }));

  const listStr = txForList.map((t, i) => {
    const flag = t.overdue ? "🔴" : "🟡";
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
    `📋 *Transações de ${monthLabel}:*\n🔴 Vencida  🟡 Pendente\n\n${listStr}\n\n*0* — Cancelar`
  );
}

async function startTxSetupFlow(
  fromPhone: string,
  extracted: ExtractedTransaction,
  userId: number,
  organizationId: number | null,
  messageId: string,
  sendReply: (txt: string) => Promise<void>,
  userEntities: Array<{ id: number; name: string }>,
  pendingFile?: { mediaUrl: string; mimeType: string; filename: string; fileSize: number },
): Promise<void> {
  if (!extracted.amount || extracted.amount <= 0) {
    pendingTxSetup.set(fromPhone, {
      extracted,
      userId,
      organizationId,
      messageId,
      expiresAt: Date.now() + 10 * 60 * 1000,
      stage: "awaiting_amount",
      pendingFile,
    });
    await sendReply(`💰 *Qual o valor da transação?*\n\nDigite apenas o número (ex: *100* ou *100,50*).\n\n*0* — Cancelar`);
    return;
  }

  if (userEntities.length === 0) {
    await sendReply(`⚠️ Você não possui entidades cadastradas no SGF. Acesse o sistema para criar uma entidade primeiro.`);
    return;
  }

  if (userEntities.length > 1) {
    const resolved = resolveEntityId(extracted.entityName, userEntities);
    if (!resolved) {
      const listStr = userEntities.map((e, i) => `*${i + 1}* — ${e.name}`).join("\n");
      pendingTxSetup.set(fromPhone, {
        extracted,
        userId,
        organizationId,
        messageId,
        expiresAt: Date.now() + 10 * 60 * 1000,
        stage: "awaiting_entity",
        entityOptions: userEntities,
        pendingFile,
      });
      await sendReply(`🏢 *Qual entidade?*\n\n${listStr}\n\n*0* — Cancelar`);
      return;
    }
    await resolvePaymentMethodStep(fromPhone, extracted, userId, organizationId, resolved, messageId, sendReply, pendingFile);
    return;
  }

  await resolvePaymentMethodStep(fromPhone, extracted, userId, organizationId, userEntities[0].id, messageId, sendReply, pendingFile);
}

async function resolvePaymentMethodStep(
  fromPhone: string,
  extracted: ExtractedTransaction,
  userId: number,
  organizationId: number | null,
  entityId: number,
  messageId: string,
  sendReply: (txt: string) => Promise<void>,
  pendingFile?: { mediaUrl: string; mimeType: string; filename: string; fileSize: number },
): Promise<void> {
  // Se já tem meio de pagamento extraído, pular
  if (extracted.paymentMethodName || extracted.creditCardName) {
    await goToConfirmation(fromPhone, extracted, userId, organizationId, entityId, messageId, sendReply, pendingFile, undefined, undefined);
    return;
  }

  // Buscar contas bancárias e cartões para mostrar como opções
  const dbInstance = await getDb();
  if (!dbInstance) {
    await goToConfirmation(fromPhone, extracted, userId, organizationId, entityId, messageId, sendReply, pendingFile, undefined, undefined);
    return;
  }

  const { bankAccounts, creditCards: creditCardsSchema } = await import("../../drizzle/schema");
  const { eq: eqOp } = await import("drizzle-orm");
  const [bankAccountsList, creditCardsList] = await Promise.all([
    dbInstance.select({ id: bankAccounts.id, name: bankAccounts.name }).from(bankAccounts).where(eqOp(bankAccounts.entityId, entityId)),
    dbInstance.select({ id: creditCardsSchema.id, name: creditCardsSchema.name }).from(creditCardsSchema).where(eqOp(creditCardsSchema.entityId, entityId)),
  ]);

  const options: Array<{ id: number; name: string }> = [
    ...bankAccountsList.map((b: { id: number; name: string }) => ({ id: b.id, name: b.name })),
    ...creditCardsList.map((c: { id: number; name: string }) => ({ id: -c.id, name: `💳 ${c.name}` })),
  ];

  if (options.length === 0) {
    await goToConfirmation(fromPhone, extracted, userId, organizationId, entityId, messageId, sendReply, pendingFile, undefined, undefined);
    return;
  }

  const listStr = options.map((o, i) => `*${i + 1}* — ${o.name}`).join("\n");
  pendingTxSetup.set(fromPhone, {
    extracted,
    userId,
    organizationId,
    entityId,
    messageId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    stage: "awaiting_payment_method",
    paymentMethodOptions: options,
    pendingFile,
  });
  await sendReply(`💳 *Meio de pagamento:*\n\n${listStr}\n\n*0* — Pular`);
}

async function goToConfirmation(
  fromPhone: string,
  extracted: ExtractedTransaction,
  userId: number,
  organizationId: number | null,
  entityId: number,
  messageId: string,
  sendReply: (txt: string) => Promise<void>,
  pendingFile: { mediaUrl: string; mimeType: string; filename: string; fileSize: number } | undefined,
  resolvedPaymentMethodId: number | undefined,
  resolvedPaymentMethodName: string | undefined,
): Promise<void> {
  const userEntities = await db.getEntitiesByUserId(userId).catch(() => [] as Array<{ id: number; name: string }>);
  const entityName = userEntities.find((e: { id: number; name: string }) => e.id === entityId)?.name ?? "Entidade";

  const finalExtracted = resolvedPaymentMethodName
    ? { ...extracted, paymentMethodName: resolvedPaymentMethodName }
    : extracted;

  pendingConfirmations.set(fromPhone, {
    extracted: finalExtracted,
    userId,
    organizationId,
    entityId,
    messageId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    resolvedPaymentMethodId,
    pendingFile,
  });
  await sendReply(buildConfirmationMessage(finalExtracted, entityName));
}

async function processIncomingMessage(
  fromPhone: string,
  messageId: string,
  msg: NormalizedIncomingMessage,
): Promise<void> {
  // 1. Buscar usuário pelo número de WhatsApp
  const dbInstance = await getDb();
  if (!dbInstance) {
    console.error("[WhatsApp Bot] Database não disponível");
    return;
  }

  // Deduplicação: verificar se o messageId já foi processado no banco
  const existing = await dbInstance
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.messageId, messageId))
    .limit(1);
  if (existing.length > 0) {
    console.log(`[WhatsApp Bot] Mensagem ${messageId} já processada, ignorando duplicata`);
    return;
  }

  console.log(`[WhatsApp Bot] Buscando usuário - fromPhone: ${fromPhone}`);

  let userResult: any[] = [];

  // Busca pelo número
  userResult = await dbInstance
    .select()
    .from(users)
    .where(eq(users.whatsappPhone, fromPhone))
    .limit(1);

  // Se ainda não encontrou, tentar com/sem o 55
  if (userResult.length === 0) {
    const altPhone = fromPhone.startsWith("55") ? fromPhone.slice(2) : "55" + fromPhone;
    userResult = await dbInstance
      .select()
      .from(users)
      .where(eq(users.whatsappPhone, altPhone))
      .limit(1);
  }

  if (userResult.length === 0) {
    console.log(`[WhatsApp Bot] Usuário não encontrado para fromPhone=${fromPhone}`);
    await sendWhatsAppMessage(
      fromPhone,
      `⚠️ Seu número não está vinculado ao SGF.\n\nPara vincular, acesse *Perfil → WhatsApp Bot* no sistema e siga as instruções.`
    );
    return;
  }

  const user = userResult[0];
  const replyJid = fromPhone;
  const sendTarget = user.whatsappPhone || fromPhone;

  const sendReply = (txt: string) => sendWhatsAppMessage(sendTarget, txt);

  // 2. Verificar se há fluxo de anexo pendente
  const pendingAttach = pendingAttachments.get(replyJid);
  if (pendingAttach && Date.now() < pendingAttach.expiresAt) {
    let responseText = msg.text || "";

    // Transcrever voz se necessário
    if (msg.messageType === "audio" && !responseText) {
      const mediaData = msg.mediaId ? await downloadCloudMedia(msg.mediaId) : null;
      if (mediaData) {
        const tr = await transcribeAudioWithGemini(mediaData.buffer, mediaData.mimeType);
        if (tr.ok) responseText = tr.text;
      }
    }

    const trimmed = responseText.trim();

    if (pendingAttach.stage === "awaiting_mode") {
      if (trimmed === "1") {
        // Nova transação — pedir descrição por voz ou texto
        pendingAttachments.set(replyJid, { ...pendingAttach, stage: "awaiting_description" });
        await sendReply(`📎 Documento guardado!\n\nDescreva a transação por *voz* ou *texto*.\nEx: _"Paguei 150 reais de mercado hoje"_\n\n*0* — Cancelar`);
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

    if (pendingAttach.stage === "awaiting_description") {
      if (trimmed === "0" || trimmed.toLowerCase().includes("cancel")) {
        pendingAttachments.delete(replyJid);
        await sendReply(`❌ Operação cancelada.`);
        return;
      }

      // Transcrever voz já foi feito acima; usar responseText como descrição
      if (!trimmed) {
        await sendReply(`❓ Não recebi a descrição. Envie por *voz* ou *texto*, ou *0* para cancelar.`);
        return;
      }

      // Extrair transação do texto/voz
      const orgForDesc = await db.getOrFirstOrganizationForUser(user.id);
      const entitiesForDesc = await db.getEntitiesByUserId(user.id);
      const defEntityId = entitiesForDesc[0]?.id;
      const [catsForDesc, cardsForDesc] = await Promise.all([
        db.getCategoriesByEntityId(defEntityId, user.id).catch(() => [] as { name: string; type: string }[]),
        db.getCreditCardsByEntityId(defEntityId, user.id).catch(() => [] as { name: string }[]),
      ]);

      await sendReply(`🤔 Processando...`);
      const extractionResult = await extractTransactionFromText(trimmed, entitiesForDesc, catsForDesc, cardsForDesc).catch(() => null);

      if (!extractionResult || !extractionResult.ok) {
        await sendReply(
          `❌ Não consegui identificar uma transação na sua mensagem.\n\nTente ser mais específico, por exemplo:\n_"Paguei 150 reais de mercado hoje"_\n_"Recebi 2000 de aluguel"_`
        );
        return;
      }

      const extractedDesc = extractionResult.data;
      const entityIdDesc = resolveEntityId(extractedDesc.entityName, entitiesForDesc);
      if (!entityIdDesc) {
        await sendReply(`❌ Não encontrei a entidade. Verifique suas entidades no sistema.`);
        return;
      }

      const entityNameDesc = entitiesForDesc.find(e => e.id === entityIdDesc)?.name ?? "Entidade";

      pendingAttachments.delete(replyJid);
      pendingConfirmations.set(replyJid, {
        extracted: extractedDesc,
        userId: user.id,
        organizationId: orgForDesc?.id ?? null,
        entityId: entityIdDesc,
        messageId,
        expiresAt: Date.now() + 10 * 60 * 1000,
        pendingFile: {
          mediaUrl: pendingAttach.mediaUrl,
          mimeType: pendingAttach.mimeType,
          filename: pendingAttach.filename,
          fileSize: pendingAttach.fileSize,
        },
      });
      await sendReply(buildConfirmationMessage(extractedDesc, entityNameDesc));
      return;
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
          const { sql: sqlTag } = await import("drizzle-orm");
          const { creditCardInvoices, creditCardInvoiceAttachments } = await import("../drizzle/schema");
          const { eq, and } = await import("drizzle-orm");
          const rawDb = await import("../db").then(m => m.getDb());
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

  // 3a. Verificar se há seleção de tipo de documento pendente (após criação de transação)
  const pendingDocType = pendingDocumentType.get(replyJid);
  if (pendingDocType && Date.now() < pendingDocType.expiresAt) {
    const docTypeText = (msg.text || "").trim();

    if (docTypeText === "0" || docTypeText.toLowerCase().includes("cancel")) {
      pendingDocumentType.delete(replyJid);
      await sendReply(`❌ Documento não anexado.`);
      return;
    }

    const docTypeMap: Record<string, string> = {
      "1": "COMPROVANTE_PAGAMENTO",
      "2": "BOLETO",
      "3": "NOTA_FISCAL",
      "4": "DOCUMENTOS",
    };
    const chosenDocType = docTypeMap[docTypeText];
    if (!chosenDocType) {
      await sendReply(`❓ Responda com 1, 2, 3 ou 4 para escolher o tipo, ou *0* para cancelar.`);
      return;
    }

    pendingDocumentType.delete(replyJid);
    try {
      await db.createAttachment({
        transactionId: pendingDocType.transactionId,
        filename: pendingDocType.filename,
        blobUrl: pendingDocType.mediaUrl,
        fileSize: pendingDocType.fileSize,
        mimeType: pendingDocType.mimeType,
        type: chosenDocType,
      } as any);

      if (chosenDocType === "COMPROVANTE_PAGAMENTO") {
        await db.updateTransaction(pendingDocType.transactionId, { status: "PAID", paymentDate: new Date() } as any);
      }

      const typeLabel = ATTACHMENT_TYPE_LABELS[chosenDocType] ?? chosenDocType;
      const statusLine = chosenDocType === "COMPROVANTE_PAGAMENTO" ? `\n🟢 Status atualizado para *PAGO*` : "";
      await sendReply(`✅ *${typeLabel} anexado com sucesso!*${statusLine}`);
    } catch (err) {
      console.error("[WhatsApp Bot] Erro ao salvar anexo de tipo:", err);
      await sendReply(`❌ Erro ao salvar o documento. Tente novamente.`);
    }
    return;
  }

  // 3. Verificar se é uma resposta de confirmação pendente
  const text = msg.text || "";

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

        // Se há arquivo pendente, pedir o tipo antes de anexar
        if (pending.pendingFile) {
          pendingDocumentType.set(replyJid, {
            transactionId: firstTransactionId,
            mediaUrl: pending.pendingFile.mediaUrl,
            mimeType: pending.pendingFile.mimeType,
            filename: pending.pendingFile.filename,
            fileSize: pending.pendingFile.fileSize,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
          await sendReply(
            `📎 *Qual o tipo do documento anexado?*\n\n*1* — Comprovante de Pagamento ✅\n*2* — Boleto\n*3* — Nota Fiscal\n*4* — Documento\n*0* — Não anexar`
          );
        }
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
  if (msg.messageType === "audio") {
    await sendReply(`🎙️ Transcrevendo seu áudio...`);

    const mediaData = msg.mediaId ? await downloadCloudMedia(msg.mediaId) : null;

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
  else if (msg.messageType === "image") {
    await sendReply(`📎 Documento recebido! Fazendo upload...`);

    const mediaData = msg.mediaId ? await downloadCloudMedia(msg.mediaId) : null;

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
      `📎 *Documento recebido! O que deseja fazer?*\n\n*1* — Nova transação (descrever por voz ou texto)\n*2* — Anexar a uma transação já cadastrada\n*0* — Cancelar`
    );
    return;
  }

  // ── Processar texto ──────────────────────────────────────────────────────────
  else if (msg.messageType === "text") {
    if (!text.trim()) return;
    extractedText = text.trim();
  }

  // ── Processar documento (PDF) ────────────────────────────────────────────────
  else if (msg.messageType === "document") {
    const mediaData = msg.mediaId ? await downloadCloudMedia(msg.mediaId) : null;
    if (!mediaData) {
      await sendReply(`❌ Não consegui baixar o documento. Tente novamente.`);
      return;
    }
    let docUrl: string | null = null;
    let docFilename = msg.filename || `whatsapp-doc-${Date.now()}.pdf`;
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
      `📎 *Documento recebido! O que deseja fazer?*\n\n*1* — Nova transação (descrever por voz ou texto)\n*2* — Anexar a uma transação já cadastrada\n*0* — Cancelar`
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

  // ── GET /api/whatsapp/test?to=5511... — Testa envio via Cloud API ──────────────
  app.get("/api/whatsapp/test", async (req: Request, res: Response) => {
    const to = (req.query.to as string) || "5511947728157";
    await sendWhatsAppMessage(to, "🧪 Teste de envio SGF — " + new Date().toISOString());
    return res.json({ ok: true, to });
  });

  // ── GET /api/whatsapp/webhook — Verificação do webhook pelo Meta ──────────────
  app.get("/api/whatsapp/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === "subscribe" && token === verifyToken) {
      console.log("[WhatsApp Bot] Webhook verificado pelo Meta");
      return res.status(200).send(challenge);
    }
    console.warn("[WhatsApp Bot] Falha na verificação do webhook — token inválido");
    return res.status(403).json({ error: "Verificação falhou" });
  });

  // ── POST /api/whatsapp/webhook — Recebe eventos da Meta Cloud API ─────────────
  app.post("/api/whatsapp/webhook", async (req: Request, res: Response) => {
    res.status(200).json({ ok: true });

    try {
      const body = req.body as any;
      if (body.object !== "whatsapp_business_account") return;

      for (const entry of (body.entry ?? [])) {
        for (const change of (entry.changes ?? [])) {
          if (change.field !== "messages") continue;
          const value = change.value;
          if (!value?.messages?.length) continue;

          for (const message of value.messages) {
            const messageId = message.id as string;
            const fromPhone = message.from as string;

            if (!messageId || !fromPhone) continue;
            if (!markMessageSeen(messageId)) {
              console.log(`[WhatsApp Bot] Duplicata ignorada: ${messageId}`);
              continue;
            }

            console.log(`[WhatsApp Bot] Mensagem recebida - from: ${fromPhone}, type: ${message.type}, id: ${messageId}`);

            const msgType = message.type as string;
            let normalized: NormalizedIncomingMessage;

            if (msgType === "text") {
              normalized = { messageType: "text", text: message.text?.body ?? "" };
            } else if (msgType === "audio") {
              normalized = { messageType: "audio", text: "", mediaId: message.audio?.id, mimeType: message.audio?.mime_type };
            } else if (msgType === "image") {
              normalized = { messageType: "image", text: "", mediaId: message.image?.id, caption: message.image?.caption, mimeType: message.image?.mime_type };
            } else if (msgType === "document") {
              normalized = { messageType: "document", text: "", mediaId: message.document?.id, caption: message.document?.caption, filename: message.document?.filename, mimeType: message.document?.mime_type };
            } else {
              console.log(`[WhatsApp Bot] Tipo de mensagem não suportado: ${msgType}`);
              continue;
            }

            processIncomingMessage(fromPhone, messageId, normalized).catch(err => {
              console.error("[WhatsApp Bot] Erro ao processar mensagem:", err);
            });
          }
        }
      }
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
