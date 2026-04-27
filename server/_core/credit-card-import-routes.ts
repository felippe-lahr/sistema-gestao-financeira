/**
 * Credit Card PDF Import Routes
 * Rota Express para upload e processamento de faturas de cartão de crédito via IA.
 *
 * Estratégia:
 * 1. Recebe o PDF via multipart/form-data
 * 2. Extrai o texto do PDF usando pdf-parse (CJS, sem canvas, sem worker, sem S3)
 * 3. Envia o texto extraído ao LLM para identificar as transações
 * 4. Retorna o JSON estruturado para revisão no frontend
 */
import { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import { createRequire } from "module";
import { sdk } from "./sdk";
import { invokeLLM } from "./llm";

// pdf-parse é CJS, precisa de createRequire para funcionar em ESM
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

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
 * Extrai texto de um buffer PDF usando pdf-parse (CJS puro, sem dependências nativas)
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdf = new PDFParse({ data: buffer });
    const result = await pdf.getText();
    const text = result?.text || "";
    return text.trim();
  } catch (err: any) {
    console.error("[CreditCardImport] pdf-parse error:", err?.message, err?.stack);
    return "";
  }
}

export function registerCreditCardImportRoutes(app: Express) {
  /**
   * POST /api/credit-cards/import-pdf
   * Recebe um PDF de fatura de cartão de crédito, extrai o texto com pdf-parse,
   * envia para o LLM e retorna as transações extraídas para revisão.
   * Body: multipart/form-data com campo "file" (PDF) e "cardName" (string)
   */
  app.post(
    "/api/credit-cards/import-pdf",
    requireAuth,
    pdfUpload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user;
        if (!user?.id) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        if (!req.file) {
          return res.status(400).json({ error: "Nenhum arquivo PDF foi enviado" });
        }

        const cardName = req.body?.cardName || "Cartão de Crédito";

        // ── Passo 1: Extrair texto do PDF ──────────────────────────────────────
        console.log(
          `[CreditCardImport] Processando PDF: ${req.file.originalname} (${req.file.size} bytes)`
        );

        const pdfText = await extractPdfText(req.file.buffer);

        console.log(
          `[CreditCardImport] Texto extraído: ${pdfText.length} caracteres`
        );

        if (!pdfText || pdfText.trim().length < 30) {
          return res.status(422).json({
            error:
              "Não foi possível extrair texto do PDF. Verifique se o arquivo é uma fatura válida e não está protegido por senha.",
          });
        }

        // ── Passo 2: Enviar texto ao LLM ───────────────────────────────────────
        const systemPrompt = `Você é um assistente especializado em extrair transações de faturas de cartão de crédito brasileiras.
Analise o texto da fatura e extraia TODAS as transações/compras listadas.
Retorne APENAS um JSON válido com o seguinte formato exato (sem markdown, sem explicações):
{
  "transactions": [
    {
      "description": "Nome do estabelecimento/descrição da compra",
      "amount": 1234,
      "date": "2024-01-15",
      "installment": "1/3",
      "category_hint": "Alimentação"
    }
  ],
  "invoice_month": 1,
  "invoice_year": 2024,
  "invoice_total": 5678,
  "card_name": "Nome do cartão se visível"
}
Regras importantes:
- amount deve ser em CENTAVOS (inteiro), ex: R$ 12,34 = 1234, R$ 1.234,56 = 123456
- date no formato YYYY-MM-DD (use o ano da fatura se o dia/mês estiver disponível)
- installment: se for parcelado, ex "2/6", senão use null
- category_hint: sugira uma categoria em português (Alimentação, Transporte, Saúde, Lazer, Compras, Educação, Serviços, Assinaturas, Outros)
- Ignore taxas, juros, encargos, IOF, pagamentos anteriores, créditos e ajustes
- Inclua TODAS as compras, mesmo as parceladas
- Se não conseguir ler algum campo, use null
- Retorne APENAS o JSON, sem texto adicional`;

        let extractedData: any = null;
        try {
          // Limitar o texto a 30.000 caracteres para não exceder o contexto do LLM
          const truncatedText = pdfText.substring(0, 30000);

          const llmResult = await invokeLLM({
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: `Extraia todas as transações desta fatura do cartão "${cardName}":\n\n${truncatedText}`,
              },
            ],
            responseFormat: {
              type: "json_object",
            },
          });

          const content = llmResult.choices?.[0]?.message?.content;
          if (typeof content === "string") {
            // Limpar possível markdown code block
            const cleaned = content
              .replace(/```json\s*/gi, "")
              .replace(/```\s*/gi, "")
              .trim();
            extractedData = JSON.parse(cleaned);
          } else if (content && typeof content === "object") {
            extractedData = content;
          }
        } catch (llmErr: any) {
          console.error("[CreditCardImport] LLM error:", llmErr?.message);
          return res.status(500).json({
            error:
              "Erro ao processar o PDF com IA. Tente novamente em alguns instantes.",
          });
        }

        if (!extractedData || !Array.isArray(extractedData.transactions)) {
          return res.status(422).json({
            error:
              "Não foi possível identificar transações no PDF. Verifique se o arquivo é uma fatura de cartão de crédito válida.",
          });
        }

        // Validar e normalizar as transações
        const transactions = (extractedData.transactions as any[])
          .filter((tx) => tx && tx.description && tx.amount != null)
          .map((tx) => ({
            description: String(tx.description || "").trim(),
            amount: Math.abs(Math.round(Number(tx.amount) || 0)),
            date: tx.date || null,
            installment: tx.installment || null,
            category_hint: tx.category_hint || null,
          }));

        if (transactions.length === 0) {
          return res.status(422).json({
            error:
              "Nenhuma transação válida encontrada no PDF. Verifique se o arquivo é uma fatura de cartão de crédito.",
          });
        }

        console.log(
          `[CreditCardImport] Extraídas ${transactions.length} transações`
        );

        return res.json({
          success: true,
          transactions,
          invoiceMonth: extractedData.invoice_month ?? null,
          invoiceYear: extractedData.invoice_year ?? null,
          invoiceTotal: extractedData.invoice_total ?? null,
          cardName: extractedData.card_name || cardName,
          pdfTextLength: pdfText.length,
        });
      } catch (error: any) {
        console.error("[CreditCardImport] Unexpected error:", error?.message);
        return res
          .status(500)
          .json({ error: "Erro interno ao processar a fatura" });
      }
    }
  );

  console.log("[CreditCardImport] Routes registered");
}
