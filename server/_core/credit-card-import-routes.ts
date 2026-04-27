/**
 * Credit Card PDF Import Routes
 * Rota Express para upload e processamento de faturas de cartão de crédito via IA.
 */
import { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import { sdk } from "./sdk";
import { uploadFile } from "./upload";
import { invokeLLM } from "./llm";

// Multer configurado para aceitar PDF em memória (max 15MB)
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
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

export function registerCreditCardImportRoutes(app: Express) {
  /**
   * POST /api/credit-cards/import-pdf
   * Recebe um PDF de fatura de cartão de crédito, faz upload para S3,
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

        // Upload do PDF para S3 para obter URL pública
        let pdfUrl: string;
        try {
          pdfUrl = await uploadFile(req.file, `users/${user.id}/credit-card-invoices`);
        } catch (uploadErr: any) {
          console.error("[CreditCardImport] S3 upload error:", uploadErr);
          return res.status(500).json({ error: "Erro ao fazer upload do PDF. Verifique a configuração do S3." });
        }

        // Chamar LLM com o PDF para extrair transações
        const systemPrompt = `Você é um assistente especializado em extrair transações de faturas de cartão de crédito brasileiras.
Analise o PDF da fatura e extraia TODAS as transações/compras listadas.
Retorne um JSON com o seguinte formato exato:
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
Regras:
- amount deve ser em CENTAVOS (inteiro), ex: R$ 12,34 = 1234
- date no formato YYYY-MM-DD
- installment: se for parcelado, ex "2/6", senão null
- category_hint: sugira uma categoria em português (Alimentação, Transporte, Saúde, Lazer, Compras, Educação, Serviços, Outros)
- Ignore taxas, juros, pagamentos anteriores, créditos e ajustes
- Inclua TODAS as compras, mesmo as parceladas
- Se não conseguir ler algum campo, use null`;

        let extractedData: any = null;
        try {
          const llmResult = await invokeLLM({
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Extraia todas as transações desta fatura do cartão "${cardName}":`,
                  },
                  {
                    type: "file_url",
                    file_url: {
                      url: pdfUrl,
                      mime_type: "application/pdf",
                    },
                  },
                ],
              },
            ],
            responseFormat: {
              type: "json_object",
            },
          });

          const content = llmResult.choices?.[0]?.message?.content;
          if (typeof content === "string") {
            extractedData = JSON.parse(content);
          } else if (content && typeof content === "object") {
            extractedData = content;
          }
        } catch (llmErr: any) {
          console.error("[CreditCardImport] LLM error:", llmErr);
          return res.status(500).json({ error: "Erro ao processar o PDF com IA. Tente novamente." });
        }

        if (!extractedData || !Array.isArray(extractedData.transactions)) {
          return res.status(422).json({ error: "Não foi possível extrair transações do PDF. Verifique se o arquivo é uma fatura válida." });
        }

        return res.json({
          success: true,
          pdfUrl,
          transactions: extractedData.transactions || [],
          invoiceMonth: extractedData.invoice_month ?? null,
          invoiceYear: extractedData.invoice_year ?? null,
          invoiceTotal: extractedData.invoice_total ?? null,
          cardName: extractedData.card_name || cardName,
        });
      } catch (error: any) {
        console.error("[CreditCardImport] Unexpected error:", error);
        return res.status(500).json({ error: "Erro interno ao processar a fatura" });
      }
    }
  );

  console.log("[CreditCardImport] Routes registered");
}
