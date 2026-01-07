import { Express, Request, Response } from "express";
import { upload, deleteFile, getFilePath, fileExists } from "./upload";
import { getDb } from "../db";
import { attachments, transactions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Middleware to verify user authentication
 */
function requireAuth(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/**
 * Verify that user owns the transaction
 */
async function verifyTransactionOwnership(transactionId: number, userId: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    if (!transaction) return false;

    // Verify user owns the entity
    const entity = await db.getEntityById(transaction.entityId);
    return entity?.userId === userId;
  } catch (error) {
    console.error("[Upload] Error verifying ownership:", error);
    return false;
  }
}

export function registerUploadRoutes(app: Express) {
  // POST /api/attachments/upload - Upload de arquivo
  app.post(
    "/api/attachments/upload",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Nenhum arquivo foi enviado" });
        }

        const { transactionId, type } = req.body;
        const userId = (req as any).user?.id;

        if (!userId) {
          deleteFile(req.file.filename);
          return res.status(401).json({ error: "Unauthorized" });
        }

        if (!transactionId) {
          deleteFile(req.file.filename);
          return res.status(400).json({ error: "transactionId é obrigatório" });
        }

        // Verify user owns the transaction
        const ownsTransaction = await verifyTransactionOwnership(parseInt(transactionId), userId);
        if (!ownsTransaction) {
          deleteFile(req.file.filename);
          return res.status(403).json({ error: "Access denied" });
        }

        // Salvar no banco de dados
        const db = await getDb();
        if (!db) {
          deleteFile(req.file.filename);
          return res.status(500).json({ error: "Database not available" });
        }

        const result = await db
          .insert(attachments)
          .values({
            transactionId: parseInt(transactionId),
            filename: req.file.filename,
            blobUrl: `/api/attachments/${req.file.filename}/download`,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            type: type || "DOCUMENTOS",
          })
          .returning();

        return res.json({
          success: true,
          attachment: result[0],
        });
      } catch (error) {
        console.error("[Upload] Error:", error);
        if (req.file) {
          deleteFile(req.file.filename);
        }
        return res.status(500).json({ error: "Erro ao fazer upload" });
      }
    }
  );

  // GET /api/attachments/:filename/download - Download de arquivo
  app.get("/api/attachments/:filename/download", async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Validate filename to prevent path traversal
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const filePath = getFilePath(filename);

      if (!fileExists(filename)) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
      }

      // Verify user has access to this attachment
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.filename, filename));

      if (!attachment) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
      }

      // Verify user owns the transaction
      const ownsTransaction = await verifyTransactionOwnership(attachment.transactionId, userId);
      if (!ownsTransaction) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Enviar arquivo para download
      res.download(filePath);
    } catch (error) {
      console.error("[Upload] Download error:", error);
      return res.status(500).json({ error: "Erro ao baixar arquivo" });
    }
  });

  // GET /api/attachments/:filename/preview - Preview de arquivo
  app.get("/api/attachments/:filename/preview", async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Validate filename to prevent path traversal
      if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const filePath = getFilePath(filename);

      if (!fileExists(filename)) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
      }

      // Verify user has access to this attachment
      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.filename, filename));

      if (!attachment) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
      }

      // Verify user owns the transaction
      const ownsTransaction = await verifyTransactionOwnership(attachment.transactionId, userId);
      if (!ownsTransaction) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Set proper headers for inline display
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', 'inline');
      res.sendFile(filePath);
    } catch (error) {
      console.error("[Upload] Preview error:", error);
      return res.status(500).json({ error: "Erro ao visualizar arquivo" });
    }
  });

  // DELETE /api/attachments/:id - Deletar anexo
  app.delete("/api/attachments/:id", async (req: Request, res: Response) => {
    try {
      const attachmentId = parseInt(req.params.id);
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      // Buscar anexo no banco
      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachmentId));

      if (!attachment) {
        return res.status(404).json({ error: "Anexo não encontrado" });
      }

      // Verify user owns the transaction
      const ownsTransaction = await verifyTransactionOwnership(attachment.transactionId, userId);
      if (!ownsTransaction) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Deletar do filesystem
      deleteFile(attachment.filename);

      // Deletar do banco de dados
      await db.delete(attachments).where(eq(attachments.id, attachmentId));

      return res.json({ success: true });
    } catch (error) {
      console.error("[Upload] Delete error:", error);
      return res.status(500).json({ error: "Erro ao deletar anexo" });
    }
  });

  // PATCH /api/attachments/:id/type - Atualizar tipo do anexo
  app.patch("/api/attachments/:id/type", async (req: Request, res: Response) => {
    try {
      const attachmentId = parseInt(req.params.id);
      const { type } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!type) {
        return res.status(400).json({ error: "type é obrigatório" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      // Buscar anexo
      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachmentId));

      if (!attachment) {
        return res.status(404).json({ error: "Anexo não encontrado" });
      }

      // Verify user owns the transaction
      const ownsTransaction = await verifyTransactionOwnership(attachment.transactionId, userId);
      if (!ownsTransaction) {
        return res.status(403).json({ error: "Access denied" });
      }

      const result = await db
        .update(attachments)
        .set({ type })
        .where(eq(attachments.id, attachmentId))
        .returning();

      return res.json({ success: true, attachment: result[0] });
    } catch (error) {
      console.error("[Upload] Update type error:", error);
      return res.status(500).json({ error: "Erro ao atualizar tipo" });
    }
  });

  console.log("[Upload] Routes registered with security enhancements");
}
