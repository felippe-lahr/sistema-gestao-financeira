/**
 * OFX Import Routes
 * Rotas Express para upload e processamento de arquivos OFX.
 * Separadas do tRPC por necessidade de multipart/form-data.
 */

import { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import { getDb, getEntityById, getBankAccountById } from "../db";
import { sdk } from "./sdk";
import { parseOfxFile, detectDuplicate } from "../services/ofx";
import {
  ofxImports,
  ofxTransactions,
  transactions,
  bankAccounts,
} from "../../drizzle/schema";
import { eq, and, gte, lte } from "drizzle-orm";

// Multer configurado para aceitar apenas OFX em memória (max 5MB)
const ofxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/x-ofx",
      "application/ofx",
      "text/plain",
      "text/ofx",
      "application/octet-stream",
    ];
    const ext = file.originalname.toLowerCase().split(".").pop();
    if (allowed.includes(file.mimetype) || ext === "ofx" || ext === "qfx") {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos OFX ou QFX são aceitos."));
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

export function registerOfxRoutes(app: Express) {
  /**
   * POST /api/ofx/parse
   * Faz o parse do arquivo OFX e retorna as transações para revisão (sem salvar ainda).
   * Body: multipart/form-data com campo "file" (OFX) e "bankAccountId" (number)
   */
  app.post(
    "/api/ofx/parse",
    requireAuth,
    ofxUpload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id as number;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        if (!req.file) {
          return res.status(400).json({ error: "Nenhum arquivo enviado" });
        }

        const bankAccountId = parseInt(req.body.bankAccountId);
        if (!bankAccountId || isNaN(bankAccountId)) {
          return res.status(400).json({ error: "bankAccountId é obrigatório" });
        }

        const db = await getDb();
        if (!db) return res.status(500).json({ error: "Database não disponível" });

        // Verificar se a conta bancária pertence ao usuário
        const account = await getBankAccountById(bankAccountId);
        if (!account || account.userId !== userId) {
          return res.status(403).json({ error: "Conta bancária não encontrada ou acesso negado" });
        }

        // Fazer parse do OFX
        // Detectar codificação: arquivos OFX brasileiros frequentemente usam ISO-8859-1 (Latin-1)
        let content = req.file.buffer.toString("utf-8");
        // Se o conteúdo parece corrompido (caracteres inválidos), tentar latin1
        if (content.includes("\uFFFD") || content.includes("\x00")) {
          content = req.file.buffer.toString("latin1");
        }
        // Normalizar quebras de linha e remover BOM se houver
        content = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        console.log("[OFX Parse] Arquivo:", req.file.originalname, "Tamanho:", req.file.size, "bytes");
        console.log("[OFX Parse] Primeiros 300 chars:", content.substring(0, 300));
        const parsed = await parseOfxFile(content);

        if (parsed.transactions.length === 0) {
          return res.status(400).json({ error: "Nenhuma transação encontrada no arquivo OFX" });
        }

        // Buscar transações existentes para detecção de duplicatas
        // Período: 7 dias antes da primeira transação até 7 dias depois da última
        const dates = parsed.transactions.map((t) => t.date.getTime());
        const minDate = new Date(Math.min(...dates) - 7 * 24 * 60 * 60 * 1000);
        const maxDate = new Date(Math.max(...dates) + 7 * 24 * 60 * 60 * 1000);

        const existingTxs = await db
          .select({
            id: transactions.id,
            type: transactions.type,
            amount: transactions.amount,
            dueDate: transactions.dueDate,
            paymentDate: transactions.paymentDate,
            description: transactions.description,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.entityId, account.entityId!),
              gte(transactions.dueDate, minDate),
              lte(transactions.dueDate, maxDate)
            )
          );

        // Enriquecer cada transação OFX com informação de duplicata
        const enriched = parsed.transactions.map((tx) => {
          const matchId = detectDuplicate(tx, existingTxs);
          return {
            ...tx,
            date: tx.date.toISOString(),
            suggestedStatus: matchId ? "MATCHED" : "PENDING_REVIEW",
            matchedTransactionId: matchId,
          };
        });

        return res.json({
          bankAccount: {
            id: account.id,
            name: account.name,
            bank: account.bank,
          },
          period: {
            startDate: parsed.startDate?.toISOString(),
            endDate: parsed.endDate?.toISOString(),
          },
          ledgerBalance: parsed.ledgerBalance,
          availableBalance: parsed.availableBalance,
          totalTransactions: enriched.length,
          duplicatesFound: enriched.filter((t) => t.matchedTransactionId).length,
          transactions: enriched,
        });
      } catch (error: any) {
        console.error("[OFX Parse] Erro:", error);
        return res.status(400).json({ error: error.message || "Erro ao processar arquivo OFX" });
      }
    }
  );

  /**
   * POST /api/ofx/import
   * Confirma a importação após revisão do usuário.
   * Body JSON com as decisões por transação.
   */
  app.post("/api/ofx/import", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as number;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { bankAccountId, filename, period, ledgerBalance, availableBalance, decisions } = req.body;

      if (!bankAccountId || !decisions || !Array.isArray(decisions)) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database não disponível" });

      // Verificar conta bancária
      const account = await getBankAccountById(bankAccountId);
      if (!account || account.userId !== userId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      // Buscar organização do usuário
      const { organizations, organizationMembers } = await import("../../drizzle/schema");
      const [orgMember] = await db
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, userId))
        .limit(1);
      const organizationId = orgMember?.organizationId || null;

      // Criar registro de importação
      const [importRecord] = await db
        .insert(ofxImports)
        .values({
          organizationId,
          entityId: account.entityId!,
          bankAccountId,
          userId,
          filename: filename || "extrato.ofx",
          status: "PROCESSING",
          totalTransactions: decisions.length,
          startDate: period?.startDate ? new Date(period.startDate) : null,
          endDate: period?.endDate ? new Date(period.endDate) : null,
          ledgerBalance: ledgerBalance || null,
          availableBalance: availableBalance || null,
        })
        .returning();

      let importedCount = 0;
      let matchedCount = 0;
      let ignoredCount = 0;

      // Processar cada decisão
      for (const decision of decisions) {
        const {
          ofxId,
          type,
          amount,
          date,
          description,
          memo,
          action, // "IMPORT" | "MATCH" | "IGNORE"
          matchedTransactionId,
          categoryId,
        } = decision;

        let importedTransactionId: number | null = null;
        let finalStatus: "IMPORTED" | "MATCHED" | "IGNORED" = "IGNORED";

        if (action === "IMPORT") {
          // Criar nova transação
          const [newTx] = await db
            .insert(transactions)
            .values({
              entityId: account.entityId!,
              type,
              description,
              amount,
              dueDate: new Date(date),
              paymentDate: new Date(date),
              status: "PAID",
              bankAccountId,
              categoryId: categoryId || null,
              notes: memo || null,
              importOrigin: "OFX",
            })
            .returning();

          importedTransactionId = newTx.id;
          finalStatus = "IMPORTED";
          importedCount++;
        } else if (action === "MATCH") {
          // Marcar transação existente como conciliada
          if (matchedTransactionId) {
            await db
              .update(transactions)
              .set({
                status: "PAID",
                paymentDate: new Date(date),
                bankAccountId,
                updatedAt: new Date(),
              })
              .where(eq(transactions.id, matchedTransactionId));
          }
          finalStatus = "MATCHED";
          matchedCount++;
        } else {
          // IGNORE
          finalStatus = "IGNORED";
          ignoredCount++;
        }

        // Salvar registro da transação OFX
        await db.insert(ofxTransactions).values({
          importId: importRecord.id,
          bankAccountId,
          ofxId: String(ofxId),
          type,
          amount,
          date: new Date(date),
          description,
          memo: memo || null,
          status: finalStatus,
          matchedTransactionId: matchedTransactionId || null,
          importedTransactionId,
        });
      }

      // Atualizar status da importação
      await db
        .update(ofxImports)
        .set({
          status: "COMPLETED",
          importedCount,
          matchedCount,
          ignoredCount,
          updatedAt: new Date(),
        })
        .where(eq(ofxImports.id, importRecord.id));

      return res.json({
        success: true,
        importId: importRecord.id,
        importedCount,
        matchedCount,
        ignoredCount,
      });
    } catch (error: any) {
      console.error("[OFX Import] Erro:", error);
      return res.status(500).json({ error: error.message || "Erro ao importar extrato" });
    }
  });

  /**
   * GET /api/ofx/history/:bankAccountId
   * Retorna o histórico de importações de uma conta bancária.
   */
  app.get("/api/ofx/history/:bankAccountId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as number;
      const bankAccountId = parseInt(req.params.bankAccountId);

      if (!bankAccountId || isNaN(bankAccountId)) {
        return res.status(400).json({ error: "bankAccountId inválido" });
      }

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database não disponível" });

      const account = await getBankAccountById(bankAccountId);
      if (!account || account.userId !== userId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const history = await db
        .select()
        .from(ofxImports)
        .where(eq(ofxImports.bankAccountId, bankAccountId))
        .orderBy(ofxImports.createdAt);

      return res.json(history.reverse());
    } catch (error: any) {
      console.error("[OFX History] Erro:", error);
      return res.status(500).json({ error: "Erro ao buscar histórico" });
    }
  });
}
