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

// Multer configurado para aceitar CSV em memória (max 5MB)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "text/csv" ||
      file.mimetype === "application/csv" ||
      file.originalname.toLowerCase().endsWith(".csv")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos CSV são aceitos."));
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

        // ── Extrair descrições negativas do PDF de forma determinística ───────────
        // O Nubank (e alguns outros bancos) usa U+2212 (−) como sinal de menos.
        // A IA não reconhece esse caractere como negativo e importa como positivo.
        // Solucao: extrair as descrições que aparecem com −R$ no PDF e filtrar no pós-processamento.
        const negativeDescriptions = new Set<string>();
        // Regex: captura linha inteira com −R$ (U+2212), usando 2+ espaços como separador
        const negativeLineRegex = /^(.+?)\s{2,}\u2212R\$\s*[\d.,]+\s*$/gm;
        let negMatch: RegExpExecArray | null;
        while ((negMatch = negativeLineRegex.exec(pdfText)) !== null) {
          let rawDesc = negMatch[1].trim();
          // Remover prefixo de data (ex: "31 MAR ", "06 ABR ") se presente
          rawDesc = rawDesc.replace(/^\d{2}\s+[A-Z]{3}\s+/i, "").trim();
          // Normalizar espaços internos múltiplos
          rawDesc = rawDesc.replace(/\s{2,}/g, " ").toLowerCase();
          if (rawDesc.length > 2) negativeDescriptions.add(rawDesc);
        }
        if (negativeDescriptions.size > 0) {
          console.log(`[CreditCardImport] ${negativeDescriptions.size} descrições negativas detectadas no PDF:`, [...negativeDescriptions]);
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
      "is_negative": false,
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
- amount deve ser em CENTAVOS (inteiro) SEMPRE POSITIVO (valor absoluto). Ex: R$ 12,34 = 1234, R$ 1.234,56 = 123456, -R$ 5,00 = 500
- is_negative: true se o lançamento tem valor negativo na fatura (estornos, IOF de volta, devoluções, créditos). false para débitos normais
- purchase_date é a data da compra no formato YYYY-MM-DD (use o ano da fatura se não estiver claro)
- installment_current: número da parcela atual (ex: se aparecer "2/6", retorne 2). Se não for parcelado, retorne null
- installment_total: total de parcelas (ex: se aparecer "2/6", retorne 6). Se não for parcelado, retorne null
- category_hint: sugira uma categoria em português (Alimentação, Transporte, Saúde, Lazer, Compras, Educação, Serviços, Assinaturas, Outros)
- INCLUA todos os lançamentos: débitos (positivos), estornos/IOF de volta/devoluções (negativos com is_negative: true)
- IGNORE APENAS: pagamentos da fatura anterior ("Pagamento recebido", "Pagamento com saldo", "Crédito de pagamento", "Pagamento da fatura", "Pagamento em DD MMM")
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
            // Filtrar amount zero
            if (Number(tx.amount) === 0) return false;
            // Filtrar pagamentos da fatura anterior (mesmo que a IA inclua por engano)
            if (IGNORE_PATTERNS.some((p) => p.test(desc))) return false;
            return true;
          })
          .map((tx) => {
            const amountCents = Math.abs(Math.round(Number(tx.amount) || 0));
            // Determinar se é negativo: pela flag is_negative da IA ou pela detecção determinística do PDF
            let isNegative = tx.is_negative === true;
            // Fallback: se a IA não marcou is_negative, verificar pela detecção determinística do PDF
            if (!isNegative && negativeDescriptions.size > 0) {
              const descLower = String(tx.description || "").trim().toLowerCase();
              if (negativeDescriptions.has(descLower)) {
                isNegative = true;
              }
            }
            const purchaseDateNorm = normalizeDate(tx.purchase_date);
            const key = `${amountCents}|${purchaseDateNorm}`;
            const isDuplicate = existingKeys.has(key);

            return {
              description: String(tx.description || "").trim(),
              amount: amountCents,
              is_negative: isNegative,
              purchase_date: tx.purchase_date || null,
              installment_current: tx.installment_current ? Number(tx.installment_current) : null,
              installment_total: tx.installment_total ? Number(tx.installment_total) : null,
              installment: (tx.installment_current && tx.installment_total)
                ? `${tx.installment_current}/${tx.installment_total}`
                : null,
              category_hint: tx.category_hint || null,
              is_duplicate: isDuplicate,
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

  /**
   * POST /api/credit-cards/import-csv
   * Recebe um CSV de fatura (formato Nubank: date,title,amount),
   * parseia as transações e retorna para revisão no frontend.
   * Mesma lógica do import-pdf: deduplication, parcelas futuras, etc.
   */
  app.post(
    "/api/credit-cards/import-csv",
    requireAuth,
    csvUpload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: "Unauthorized" });
        if (!req.file) return res.status(400).json({ error: "Nenhum arquivo CSV foi enviado" });

        const cardName = req.body?.cardName || "Cartão de Crédito";
        const creditCardId = req.body?.creditCardId ? Number(req.body.creditCardId) : null;
        const invoiceDueDateParam: string | null = req.body?.invoiceDueDate || null;

        console.log(`[CreditCardImport] Processando CSV: ${req.file.originalname} (${req.file.size} bytes)`);

        // ── Parse do CSV ──────────────────────────────────────────────────────
        const csvText = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, ""); // remover BOM
        const lines = csvText.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
          return res.status(422).json({ error: "CSV inválido ou vazio." });
        }

        // Detectar separador (vírgula ou ponto-e-vírgula)
        const header = lines[0].toLowerCase();
        const sep = header.includes(";") ? ";" : ",";
        const cols = header.split(sep).map(c => c.trim().replace(/"/g, ""));

        // Mapear colunas por nome (suporta Nubank: date/title/amount e variantes)
        const colDate = cols.findIndex(c => ["date", "data"].includes(c));
        const colTitle = cols.findIndex(c => ["title", "descrição", "descricao", "description", "estabelecimento"].includes(c));
        const colAmount = cols.findIndex(c => ["amount", "valor", "value"].includes(c));

        if (colDate === -1 || colTitle === -1 || colAmount === -1) {
          return res.status(422).json({
            error: `Formato de CSV não reconhecido. Colunas encontradas: ${cols.join(", ")}. Esperado: date/title/amount ou data/descrição/valor.`
          });
        }

        // ── Extrair transações do CSV ────────────────────────────────────────
        const rawTransactions: Array<{
          description: string;
          amount: number;
          purchase_date: string;
          installment_current: number | null;
          installment_total: number | null;
        }> = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Parse simples de CSV (suporta campos com aspas)
          const parseCsvLine = (l: string, s: string): string[] => {
            const result: string[] = [];
            let current = "";
            let inQuotes = false;
            for (let ci = 0; ci < l.length; ci++) {
              const ch = l[ci];
              if (ch === '"') { inQuotes = !inQuotes; }
              else if (ch === s && !inQuotes) { result.push(current.trim()); current = ""; }
              else { current += ch; }
            }
            result.push(current.trim());
            return result;
          };

          const parts = parseCsvLine(line, sep);
          if (parts.length <= Math.max(colDate, colTitle, colAmount)) continue;

          const dateStr = (parts[colDate] || "").replace(/"/g, "").trim();
          const titleStr = (parts[colTitle] || "").replace(/"/g, "").trim();
          const rawAmount = (parts[colAmount] || "").replace(/"/g, "").trim()
            .replace(/R\$\s*/g, "");   // remover prefixo R$
          // Detectar formato: se tem ponto e vírgula (pt-BR: 1.234,56) ou só ponto (en-US: 1234.56)
          let amountStr: string;
          if (/\d\.\d{3},/.test(rawAmount) || (rawAmount.includes(",") && rawAmount.includes("."))) {
            // Formato pt-BR: 1.234,56 → remover ponto de milhar, trocar vírgula por ponto
            amountStr = rawAmount.replace(/\./g, "").replace(",", ".");
          } else if (rawAmount.includes(",") && !rawAmount.includes(".")) {
            // Formato pt-BR sem milhar: 384,00 → trocar vírgula por ponto
            amountStr = rawAmount.replace(",", ".");
          } else {
            // Formato en-US: 384.00 → usar direto
            amountStr = rawAmount;
          }

          if (!titleStr || !amountStr) continue;

          const amountFloat = parseFloat(amountStr);
          if (isNaN(amountFloat)) continue;

          // Ignorar pagamentos da fatura anterior (valores negativos muito altos)
          // Mas manter estornos pequenos (IOF de volta, devoluções) como créditos
          const PAYMENT_PATTERNS = [
            /^pagamento recebido/i,
            /^pagamento com saldo/i,
            /^pagamento em \d/i,
            /^pagamento da fatura/i,
            /^cr[eé]dito de pagamento/i,
          ];
          if (amountFloat <= 0 && PAYMENT_PATTERNS.some(p => p.test(titleStr))) continue;
          // Ignorar zero
          if (amountFloat === 0) continue;

          // Normalizar data: aceita YYYY-MM-DD e DD/MM/YYYY
          let purchaseDateStr = dateStr;
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            const [d, m, y] = dateStr.split("/");
            purchaseDateStr = `${y}-${m}-${d}`;
          }

          // Extrair parcelamento do título (formato Nubank: "Desc - X/Y" ou "Desc - Parcela X/Y")
          let installment_current: number | null = null;
          let installment_total: number | null = null;
          let cleanTitle = titleStr;

          const installMatch = titleStr.match(/[-\s]+(?:Parcela\s+)?(\d+)\/(\d+)\s*$/i);
          if (installMatch) {
            installment_current = parseInt(installMatch[1], 10);
            installment_total = parseInt(installMatch[2], 10);
            cleanTitle = titleStr.slice(0, installMatch.index).trim().replace(/[-\s]+$/, "").trim();
          }

          rawTransactions.push({
            description: cleanTitle,
            amount: Math.round(Math.abs(amountFloat) * 100),
            is_negative: amountFloat < 0,
            purchase_date: purchaseDateStr,
            installment_current,
            installment_total,
          });
        }

        if (rawTransactions.length === 0) {
          return res.status(422).json({ error: "Nenhuma transação válida encontrada no CSV." });
        }

        // Inferir invoiceMonth/invoiceYear a partir da data de vencimento ou das datas das transações
        let invoiceMonth: number | null = null;
        let invoiceYear: number | null = null;
        let invoiceDueDate: string | null = invoiceDueDateParam;

        if (invoiceDueDateParam) {
          const d = new Date(invoiceDueDateParam + "T12:00:00");
          invoiceMonth = d.getMonth() + 1;
          invoiceYear = d.getFullYear();
        } else {
          // Inferir pelo mês mais recente das transações
          const dates = rawTransactions
            .map(t => t.purchase_date)
            .filter(Boolean)
            .sort()
            .reverse();
          if (dates.length > 0) {
            const latest = new Date(dates[0] + "T12:00:00");
            // Fatura vence no mês seguinte ao da última compra
            invoiceMonth = latest.getMonth() + 2 > 12 ? 1 : latest.getMonth() + 2;
            invoiceYear = latest.getMonth() + 2 > 12 ? latest.getFullYear() + 1 : latest.getFullYear();
          }
        }

        // ── Verificar duplicatas no banco ─────────────────────────────────────
        let existingKeys: Set<string> = new Set();
        if (creditCardId) {
          try {
            const dbInstance = await getDb();
            if (dbInstance) {
              const { sql: sqlTag } = await import("drizzle-orm");
              const result = await dbInstance.execute(
                sqlTag`SELECT amount, "purchaseDate", "dueDate", notes FROM transactions
                       WHERE "creditCardId" = ${creditCardId}`
              );
              const rows = (Array.isArray(result) ? result : ((result as any).rows ?? [])) as any[];
              for (const row of rows) {
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
                if (!purchaseDateStr && row.dueDate) {
                  purchaseDateStr = normalizeDate(row.dueDate);
                }
                existingKeys.add(`${row.amount}|${purchaseDateStr}`);
              }
            }
          } catch (dbErr: any) {
            console.error("[CreditCardImport CSV] Error checking duplicates:", dbErr?.message);
          }
        }

        // ── Montar resposta com mesma estrutura do PDF ────────────────────────
        const transactions = rawTransactions.map((tx) => {
          const key = `${tx.amount}|${normalizeDate(tx.purchase_date)}`;
          const isDuplicate = existingKeys.has(key);
          return {
            description: tx.description,
            amount: tx.amount,
            is_negative: tx.is_negative || false,
            purchase_date: tx.purchase_date,
            installment_current: tx.installment_current,
            installment_total: tx.installment_total,
            installment: (tx.installment_current && tx.installment_total)
              ? `${tx.installment_current}/${tx.installment_total}`
              : null,
            category_hint: null,
            is_duplicate: isDuplicate,
            has_future_installments: !isDuplicate &&
              tx.installment_current != null &&
              tx.installment_total != null &&
              tx.installment_current < tx.installment_total,
          };
        });

        // Calcular total líquido da fatura (débitos - créditos)
        const totalDebits = transactions.filter(t => !t.is_negative).reduce((s, t) => s + t.amount, 0);
        const totalCredits = transactions.filter(t => t.is_negative).reduce((s, t) => s + t.amount, 0);
        const invoiceTotal = totalDebits - totalCredits;

        console.log(`[CreditCardImport CSV] ${transactions.length} transações, ${transactions.filter(t => t.is_duplicate).length} duplicatas, total líquido: ${invoiceTotal}`);

        return res.json({
          success: true,
          transactions,
          invoiceMonth,
          invoiceYear,
          invoiceDueDate,
          invoiceTotal,
          cardName,
          source: "csv",
        });
      } catch (error: any) {
        console.error("[CreditCardImport CSV] Unexpected error:", error?.message);
        return res.status(500).json({ error: "Erro interno ao processar o CSV" });
      }
    }
  );

  console.log("[CreditCardImport] Routes registered");
}
