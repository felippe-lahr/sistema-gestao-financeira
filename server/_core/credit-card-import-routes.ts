/**
 * Credit Card PDF Import Routes
 * Rota Express para upload e processamento de faturas de cartão de crédito via IA.
 *
 * Estratégia:
 * 1. Recebe o PDF via multipart/form-data
 * 2. Extrai o texto do PDF usando pdftotext (poppler-utils CLI)
 * 3. Envia o texto extraído ao LLM para identificar as transações
 * 4. Retorna o JSON estruturado para revisão no frontend
 *    - invoice_month/invoice_year = mês de VENCIMENTO da fatura (não data da compra)
 *    - installment_current / installment_total para parcelamentos
 *    - is_new_installment: true se é uma parcela nova (não importada antes)
 * 5. No endpoint de confirmação (/api/credit-cards/confirm-import):
 *    - Verifica duplicatas (mesma descrição + valor + mês + cartão)
 *    - Cria parcelas futuras para parcelamentos novos
 *
 * IMPORTANTE: Usa pdftotext (poppler-utils) via child_process.
 */
import { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { sdk } from "./sdk";
import { invokeLLM } from "./llm";
import { getDb } from "../db";

// Multer configurado para aceitar PDF em memória (max 15MB)
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos PDF são aceitos."));
    }
  },
});

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    (req as any).user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * Extrai texto de um buffer PDF usando pdftotext (poppler-utils).
 */
function extractPdfText(buffer: Buffer): string {
  const tmpFile = join(tmpdir(), `pdf-import-${randomUUID()}.pdf`);
  try {
    writeFileSync(tmpFile, buffer);
    const text = execSync(`pdftotext -layout "${tmpFile}" -`, {
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return text.trim();
  } catch (err: any) {
    console.error("[CreditCardImport] pdftotext error:", err?.message);
    try {
      const text = execSync(`pdftotext "${tmpFile}" -`, {
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return text.trim();
    } catch (err2: any) {
      console.error("[CreditCardImport] pdftotext fallback error:", err2?.message);
      return "";
    }
  } finally {
    try {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    } catch {}
  }
}

/**
 * Normaliza uma data para comparação de duplicatas (formato YYYY-MM-DD).
 */
function normalizeDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? new Date(date + (date.includes("T") ? "" : "T12:00:00")) : date;
    return d.toISOString().substring(0, 10); // YYYY-MM-DD
  } catch {
    return String(date).substring(0, 10);
  }
}

export function registerCreditCardImportRoutes(app: Express) {
  try {
    execSync("which pdftotext", { encoding: "utf-8" });
    console.log("[CreditCardImport] pdftotext found, PDF import available");
  } catch {
    console.warn(
      "[CreditCardImport] WARNING: pdftotext not found! Install poppler-utils. PDF import will not work."
    );
  }

  /**
   * POST /api/credit-cards/import-pdf
   * Recebe um PDF de fatura, extrai transações via IA e retorna para revisão.
   * O mês/ano retornado é sempre o do VENCIMENTO da fatura.
   */
  app.post(
    "/api/credit-cards/import-pdf",
    requireAuth,
    pdfUpload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
        if (!req.file) return res.status(400).json({ error: "Nenhum arquivo PDF foi enviado" });

        const cardName = req.body?.cardName || "Cartão de Crédito";
        const creditCardId = req.body?.creditCardId ? Number(req.body.creditCardId) : null;

        console.log(`[CreditCardImport] Processando PDF: ${req.file.originalname} (${req.file.size} bytes)`);

        const pdfText = extractPdfText(req.file.buffer);
        console.log(`[CreditCardImport] Texto extraído: ${pdfText.length} caracteres`);

        if (!pdfText || pdfText.trim().length < 30) {
          return res.status(422).json({
            error: "Não foi possível extrair texto do PDF. Verifique se o arquivo é uma fatura válida e não está protegido por senha.",
          });
        }

        // ── Prompt corrigido: mês da fatura = data de VENCIMENTO ──────────────
        const systemPrompt = `Você é um assistente especializado em extrair transações de faturas de cartão de crédito brasileiras.
Analise o texto da fatura e extraia TODAS as transações/compras listadas.
Retorne APENAS um JSON válido com o seguinte formato exato (sem markdown, sem explicações):
{
  "transactions": [
    {
      "description": "Nome do estabelecimento/descrição da compra",
      "amount": 1234,
      "purchase_date": "2024-03-15",
      "installment_current": 2,
      "installment_total": 6,
      "category_hint": "Alimentação"
    }
  ],
  "invoice_due_date": "2026-05-05",
  "invoice_month": 5,
  "invoice_year": 2026,
  "invoice_total": 800644,
  "card_name": "Nome do cartão se visível"
}
Regras CRÍTICAS:
- invoice_month e invoice_year devem ser o mês e ano do VENCIMENTO da fatura (não a data das compras)
- invoice_due_date é a data de vencimento da fatura no formato YYYY-MM-DD
- invoice_total deve ser o valor exato do campo "Valor total" ou "Total a pagar" da fatura, em CENTAVOS (inteiro). Ex: R$ 4.549,85 = 454985
- amount deve ser em CENTAVOS (inteiro) SEMPRE POSITIVO. Ex: R$ 12,34 = 1234, R$ 1.234,56 = 123456
- purchase_date é a data da compra no formato YYYY-MM-DD (use o ano da fatura se não estiver claro)
- installment_current: número da parcela atual (ex: se aparecer "2/6", retorne 2). Se não for parcelado, retorne null
- installment_total: total de parcelas (ex: se aparecer "2/6", retorne 6). Se não for parcelado, retorne null
- category_hint: sugira uma categoria em português (Alimentação, Transporte, Saúde, Lazer, Compras, Educação, Serviços, Assinaturas, Outros)
- INCLUA apenas lançamentos com valor POSITIVO (débitos e parcelamentos): compras, IOF, juros, tarifas, multas, parcelamentos de fatura
- IGNORE completamente lançamentos com valor NEGATIVO (estornos, IOF de volta, devoluções) — não inclua no JSON
- IGNORE também: pagamentos da fatura anterior ("Pagamento recebido", "Pagamento com saldo", "Crédito de pagamento", "Pagamento da fatura")
- Para encargos sem data de compra específica, use a data de vencimento da fatura como purchase_date
- ATENÇÃO: para compras com data apenas de dia/mês (sem ano), infira o ano correto: se o mês da compra for posterior ao mês de vencimento da fatura, o ano é o anterior ao ano de vencimento
- Inclua TODAS as compras e parcelamentos, mesmo os de fatura anterior refinanciados
- Se não conseguir ler algum campo, use null
- Retorne APENAS o JSON, sem texto adicional`;

        let extractedData: any = null;
        try {
          const truncatedText = pdfText.substring(0, 30000);
          const llmResult = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Extraia todas as transações desta fatura do cartão "${cardName}":\n\n${truncatedText}` },
            ],
            responseFormat: { type: "json_object" },
          });

          const content = llmResult.choices?.[0]?.message?.content;
          if (typeof content === "string") {
            const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
            extractedData = JSON.parse(cleaned);
          } else if (content && typeof content === "object") {
            extractedData = content;
          }
        } catch (llmErr: any) {
          console.error("[CreditCardImport] LLM error:", llmErr?.message);
          return res.status(500).json({ error: "Erro ao processar o PDF com IA. Tente novamente em alguns instantes." });
        }

        if (!extractedData || !Array.isArray(extractedData.transactions)) {
          return res.status(422).json({ error: "Não foi possível identificar transações no PDF. Verifique se o arquivo é uma fatura de cartão de crédito válida." });
        }

        const invoiceMonth: number = extractedData.invoice_month ?? null;
        const invoiceYear: number = extractedData.invoice_year ?? null;

        // ── Verificar duplicatas no banco se creditCardId foi fornecido ─────────
        // Chave de conciliação: amount (centavos) + purchase_date (YYYY-MM-DD)
        let existingKeys: Set<string> = new Set();
        if (creditCardId) {
          try {
            const dbInstance = await getDb();
            if (dbInstance) {
              const { sql: sqlTag } = await import("drizzle-orm");
              // Buscar TODAS as transações do cartão (sem filtro de mês)
              // para conciliar por valor + data da compra
              const result = await dbInstance.execute(
                sqlTag`SELECT amount, "purchaseDate", "dueDate", notes FROM transactions 
                       WHERE "creditCardId" = ${creditCardId}`
              );
              const rows = (Array.isArray(result) ? result : ((result as any).rows ?? [])) as any[];
              for (const row of rows) {
                // Prioridade: purchaseDate (coluna dedicada) > notes (legado) > dueDate (fallback)
                let purchaseDateStr = "";
                if (row.purchaseDate) {
                  purchaseDateStr = normalizeDate(row.purchaseDate);
                } else if (row.notes) {
                  const match = String(row.notes).match(/Data da compra: (\d{2}\/\d{2}\/\d{4})/);
                  if (match) {
                    const [day, month, year] = match[1].split("/");
                    purchaseDateStr = `${year}-${month}-${day}`;
                  }
                }
                // Se não tem purchase_date, usar dueDate como fallback
                if (!purchaseDateStr && row.dueDate) {
                  purchaseDateStr = normalizeDate(row.dueDate);
                }
                const key = `${row.amount}|${purchaseDateStr}`;
                existingKeys.add(key);
              }
              console.log(`[CreditCardImport] ${existingKeys.size} transações existentes no cartão para conciliação`);
            }
          } catch (dbErr: any) {
            console.error("[CreditCardImport] Error checking duplicates:", dbErr?.message);
          }
        }

        // ── Normalizar e marcar duplicatas ─────────────────────────────────────────────────────
        // Padrões de descrição que devem ser filtrados (mesmo que a IA inclua por engano)
        // Apenas pagamentos de fatura anterior são ignorados — valores negativos já são filtrados pelo amount <= 0
        const IGNORE_PATTERNS = [
          /^pagamento recebido/i,       // Nubank: "Pagamento recebido"
          /^pagamento com saldo/i,      // Nubank: "Pagamento com saldo"
          /^pagamento em \d/i,          // Nubank: "Pagamento em 06 ABR"
          /^pagamento da fatura/i,      // Genérico
          /^crédito de pagamento/i,     // Genérico
        ];

        const transactions = (extractedData.transactions as any[])
          .filter((tx) => {
            if (!tx || !tx.description || tx.amount == null) return false;
            const desc = String(tx.description).trim();
            // Filtrar valores negativos (estornos, IOF de volta, devoluções)
            if (Number(tx.amount) <= 0) return false;
            // Filtrar pagamentos da fatura anterior
            if (IGNORE_PATTERNS.some((p) => p.test(desc))) return false;
            return true;
          })
          .map((tx) => {
            const amountCents = Math.abs(Math.round(Number(tx.amount) || 0));
            const purchaseDateNorm = normalizeDate(tx.purchase_date);
            const key = `${amountCents}|${purchaseDateNorm}`;
            const isDuplicate = existingKeys.has(key);

            return {
              description: String(tx.description || "").trim(),
              amount: amountCents,
              purchase_date: tx.purchase_date || null,
              installment_current: tx.installment_current ? Number(tx.installment_current) : null,
              installment_total: tx.installment_total ? Number(tx.installment_total) : null,
              // Manter campo legado "installment" para compatibilidade com frontend
              installment: (tx.installment_current && tx.installment_total)
                ? `${tx.installment_current}/${tx.installment_total}`
                : null,
              category_hint: tx.category_hint || null,
              is_duplicate: isDuplicate,
              // Parcela que não é a última: pode ter parcelas futuras a criar
              has_future_installments: !isDuplicate &&
                tx.installment_current != null &&
                tx.installment_total != null &&
                Number(tx.installment_current) < Number(tx.installment_total),
            };
          });

        if (transactions.length === 0) {
          return res.status(422).json({ error: "Nenhuma transação válida encontrada no PDF." });
        }

        console.log(`[CreditCardImport] ${transactions.length} transações extraídas, ${transactions.filter(t => t.is_duplicate).length} duplicatas`);

        return res.json({
          success: true,
          transactions,
          invoiceMonth,
          invoiceYear,
          invoiceDueDate: extractedData.invoice_due_date ?? null,
          invoiceTotal: extractedData.invoice_total ?? null,
          cardName: extractedData.card_name || cardName,
          pdfTextLength: pdfText.length,
        });
      } catch (error: any) {
        console.error("[CreditCardImport] Unexpected error:", error?.message);
        return res.status(500).json({ error: "Erro interno ao processar a fatura" });
      }
    }
  );

  console.log("[CreditCardImport] Routes registered");
}
