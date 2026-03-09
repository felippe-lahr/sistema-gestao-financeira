import { Express, Request, Response, NextFunction } from "express";
import { upload, uploadFile, deleteFile } from "./upload";
import { getPresignedUrl } from "./s3";
import { getDb, getEntityById } from "../db";
import { attachments, transactions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./sdk";

/**
 * Middleware de autenticação para rotas de upload
 * Popula req.user com o usuário autenticado
 */
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    (req as any).user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * Verify that user owns the transaction
 */
async function verifyTransactionOwnership(transactionId: number, userId: number): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    if (!transaction) return false;

    const entity = await getEntityById(transaction.entityId);
    return entity?.userId === userId;
  } catch (error) {
    console.error("[Upload] Error verifying ownership:", error);
    return false;
  }
}

export function registerUploadRoutes(app: Express) {
  // POST /api/attachments/upload - Upload de arquivo para S3
  app.post(
    "/api/attachments/upload",
    requireAuth,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Nenhum arquivo foi enviado" });
        }

        const { transactionId, type } = req.body;
        const userId = (req as any).user?.id as number;

        if (!userId) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        if (!transactionId) {
          return res.status(400).json({ error: "transactionId é obrigatório" });
        }

        const ownsTransaction = await verifyTransactionOwnership(parseInt(transactionId), userId);
        if (!ownsTransaction) {
          return res.status(403).json({ error: "Access denied" });
        }

        // Fazer upload para S3
        // Organizar por userId para isolamento multi-tenant
        const s3Url = await uploadFile(req.file, `users/${userId}/attachments`);

        const db = await getDb();
        if (!db) {
          await deleteFile(s3Url);
          return res.status(500).json({ error: "Database not available" });
        }

        const result = await db
          .insert(attachments)
          .values({
            transactionId: parseInt(transactionId),
            filename: req.file.originalname,
            blobUrl: s3Url,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            type: type || "DOCUMENTOS",
          })
          .returning();

        return res.json({ success: true, attachment: result[0] });
      } catch (error) {
        console.error("[Upload] Error:", error);
        return res.status(500).json({ error: "Erro ao fazer upload" });
      }
    }
  );

  // GET /api/attachments/:id/download - Redireciona para URL pré-assinada do S3
  app.get("/api/attachments/:id/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const attachmentId = parseInt(req.params.id);
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      if (isNaN(attachmentId)) return res.status(400).json({ error: "ID inválido" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachmentId));

      if (!attachment) return res.status(404).json({ error: "Arquivo não encontrado" });

      const ownsTransaction = await verifyTransactionOwnership(attachment.transactionId, userId);
      if (!ownsTransaction) return res.status(403).json({ error: "Access denied" });

      if (attachment.blobUrl && attachment.blobUrl.includes("amazonaws.com")) {
        const presignedUrl = await getPresignedUrl(attachment.blobUrl, 3600);
        return res.redirect(presignedUrl);
      }

      // Fallback para Supabase ou outros providers
      return res.redirect(attachment.blobUrl);
    } catch (error) {
      console.error("[Upload] Download error:", error);
      return res.status(500).json({ error: "Erro ao baixar arquivo" });
    }
  });

  // GET /api/attachments/:id/preview - Preview via URL pré-assinada
  app.get("/api/attachments/:id/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const attachmentId = parseInt(req.params.id);
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      if (isNaN(attachmentId)) return res.status(400).json({ error: "ID inválido" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachmentId));

      if (!attachment) return res.status(404).json({ error: "Arquivo não encontrado" });

      const ownsTransaction = await verifyTransactionOwnership(attachment.transactionId, userId);
      if (!ownsTransaction) return res.status(403).json({ error: "Access denied" });

      if (attachment.blobUrl && attachment.blobUrl.includes("amazonaws.com")) {
        const presignedUrl = await getPresignedUrl(attachment.blobUrl, 3600);
        return res.redirect(presignedUrl);
      }

      return res.redirect(attachment.blobUrl);
    } catch (error) {
      console.error("[Upload] Preview error:", error);
      return res.status(500).json({ error: "Erro ao visualizar arquivo" });
    }
  });

  // Rota legada por filename (compatibilidade com arquivos migrados do Supabase)
  app.get("/api/attachments/:filename/download-legacy", requireAuth, async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.filename, filename));

      if (!attachment) return res.status(404).json({ error: "Arquivo não encontrado" });

      const ownsTransaction = await verifyTransactionOwnership(attachment.transactionId, userId);
      if (!ownsTransaction) return res.status(403).json({ error: "Access denied" });

      if (attachment.blobUrl && attachment.blobUrl.includes("amazonaws.com")) {
        const presignedUrl = await getPresignedUrl(attachment.blobUrl, 3600);
        return res.redirect(presignedUrl);
      }

      return res.redirect(attachment.blobUrl);
    } catch (error) {
      console.error("[Upload] Legacy download error:", error);
      return res.status(500).json({ error: "Erro ao baixar arquivo" });
    }
  });

  // DELETE /api/attachments/:id - Deletar anexo
  app.delete("/api/attachments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const attachmentId = parseInt(req.params.id);
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachmentId));

      if (!attachment) return res.status(404).json({ error: "Anexo não encontrado" });

      const ownsTransaction = await verifyTransactionOwnership(attachment.transactionId, userId);
      if (!ownsTransaction) return res.status(403).json({ error: "Access denied" });

      // Deletar do banco primeiro
      await db.delete(attachments).where(eq(attachments.id, attachmentId));

      // Deletar do S3 (ou Supabase - deleteFile lida com ambos)
      await deleteFile(attachment.blobUrl);

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
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      if (!type) return res.status(400).json({ error: "type é obrigatório" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, attachmentId));

      if (!attachment) return res.status(404).json({ error: "Anexo não encontrado" });

      const ownsTransaction = await verifyTransactionOwnership(attachment.transactionId, userId);
      if (!ownsTransaction) return res.status(403).json({ error: "Access denied" });

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

  // POST /api/attachments/upload-temp - Upload temporário (sem transação associada)
  // Usado para uploads antes de criar/editar uma transação
  app.post(
    "/api/attachments/upload-temp",
    requireAuth,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Nenhum arquivo foi enviado" });
        }

        const userId = (req as any)?.user?.id as number;

        if (!userId) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        // Organizar por userId para isolamento multi-tenant
        const s3Url = await uploadFile(req.file, `users/${userId}/attachments/temp`);

        return res.json({ success: true, s3Url });
      } catch (error) {
        console.error("[Upload] Temp upload error:", error);
        return res.status(500).json({ error: "Erro ao fazer upload" });
      }
    }
  );

  console.log("[Upload] Routes registered with S3 storage");

  // ============================================
  // RENTAL ATTACHMENTS ROUTES
  // ============================================

  async function verifyRentalOwnership(rentalId: number, userId: number): Promise<boolean> {
    try {
      const db = await getDb();
      if (!db) return false;

      const { rentals } = await import("../../drizzle/schema");
      const [rental] = await db
        .select()
        .from(rentals)
        .where(eq(rentals.id, rentalId));

      if (!rental) return false;

      const entity = await getEntityById(rental.entityId);
      return entity?.userId === userId;
    } catch (error) {
      console.error("[Upload] Error verifying rental ownership:", error);
      return false;
    }
  }

  // POST /api/rental-attachments/upload - Upload de arquivo para reserva
  app.post(
    "/api/rental-attachments/upload",
    requireAuth,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "Nenhum arquivo foi enviado" });
        }

        const { rentalId, type } = req.body;
        const userId = (req as any)?.user?.id as number;

        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        if (!rentalId) return res.status(400).json({ error: "rentalId é obrigatório" });

        const ownsRental = await verifyRentalOwnership(parseInt(rentalId), userId);
        if (!ownsRental) return res.status(403).json({ error: "Access denied" });

        // Fazer upload para S3
        // Organizar por userId para isolamento multi-tenant
        const s3Url = await uploadFile(req.file, `users/${userId}/rental-attachments`);

        const db = await getDb();
        if (!db) {
          await deleteFile(s3Url);
          return res.status(500).json({ error: "Database not available" });
        }

        const { rentalAttachments } = await import("../../drizzle/schema");
        const result = await db
          .insert(rentalAttachments)
          .values({
            rentalId: parseInt(rentalId),
            filename: req.file.originalname,
            blobUrl: s3Url,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            type: type || "DOCUMENTOS",
          })
          .returning();

        return res.json({ success: true, attachment: result[0] });
      } catch (error) {
        console.error("[Upload] Rental upload error:", error);
        return res.status(500).json({ error: "Erro ao fazer upload" });
      }
    }
  );

  // GET /api/rental-attachments/:id/download - Download de arquivo da reserva
  app.get("/api/rental-attachments/:id/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const attachmentId = parseInt(req.params.id);
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      if (isNaN(attachmentId)) return res.status(400).json({ error: "ID inválido" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const { rentalAttachments } = await import("../../drizzle/schema");
      const [attachment] = await db
        .select()
        .from(rentalAttachments)
        .where(eq(rentalAttachments.id, attachmentId));

      if (!attachment) return res.status(404).json({ error: "Arquivo não encontrado" });

      const ownsRental = await verifyRentalOwnership(attachment.rentalId, userId);
      if (!ownsRental) return res.status(403).json({ error: "Access denied" });

      if (attachment.blobUrl && attachment.blobUrl.includes("amazonaws.com")) {
        const presignedUrl = await getPresignedUrl(attachment.blobUrl, 3600);
        return res.redirect(presignedUrl);
      }

      return res.redirect(attachment.blobUrl);
    } catch (error) {
      console.error("[Upload] Rental download error:", error);
      return res.status(500).json({ error: "Erro ao baixar arquivo" });
    }
  });

  // GET /api/rental-attachments/:id/preview - Preview de arquivo da reserva
  app.get("/api/rental-attachments/:id/preview", requireAuth, async (req: Request, res: Response) => {
    try {
      const attachmentId = parseInt(req.params.id);
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      if (isNaN(attachmentId)) return res.status(400).json({ error: "ID inválido" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const { rentalAttachments } = await import("../../drizzle/schema");
      const [attachment] = await db
        .select()
        .from(rentalAttachments)
        .where(eq(rentalAttachments.id, attachmentId));

      if (!attachment) return res.status(404).json({ error: "Arquivo não encontrado" });

      const ownsRental = await verifyRentalOwnership(attachment.rentalId, userId);
      if (!ownsRental) return res.status(403).json({ error: "Access denied" });

      if (attachment.blobUrl && attachment.blobUrl.includes("amazonaws.com")) {
        const presignedUrl = await getPresignedUrl(attachment.blobUrl, 3600);
        return res.redirect(presignedUrl);
      }

      return res.redirect(attachment.blobUrl);
    } catch (error) {
      console.error("[Upload] Rental preview error:", error);
      return res.status(500).json({ error: "Erro ao visualizar arquivo" });
    }
  });

  // Rota legada por filename para rental attachments
  app.get("/api/rental-attachments/:filename/download-legacy", requireAuth, async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const { rentalAttachments } = await import("../../drizzle/schema");
      const [attachment] = await db
        .select()
        .from(rentalAttachments)
        .where(eq(rentalAttachments.filename, filename));

      if (!attachment) return res.status(404).json({ error: "Arquivo não encontrado" });

      const ownsRental = await verifyRentalOwnership(attachment.rentalId, userId);
      if (!ownsRental) return res.status(403).json({ error: "Access denied" });

      if (attachment.blobUrl && attachment.blobUrl.includes("amazonaws.com")) {
        const presignedUrl = await getPresignedUrl(attachment.blobUrl, 3600);
        return res.redirect(presignedUrl);
      }

      return res.redirect(attachment.blobUrl);
    } catch (error) {
      console.error("[Upload] Rental legacy download error:", error);
      return res.status(500).json({ error: "Erro ao baixar arquivo" });
    }
  });

  // DELETE /api/rental-attachments/:id - Deletar anexo da reserva
  app.delete("/api/rental-attachments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const attachmentId = parseInt(req.params.id);
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const { rentalAttachments } = await import("../../drizzle/schema");
      const [attachment] = await db
        .select()
        .from(rentalAttachments)
        .where(eq(rentalAttachments.id, attachmentId));

      if (!attachment) return res.status(404).json({ error: "Anexo não encontrado" });

      const ownsRental = await verifyRentalOwnership(attachment.rentalId, userId);
      if (!ownsRental) return res.status(403).json({ error: "Access denied" });

      // Deletar do banco primeiro
      await db.delete(rentalAttachments).where(eq(rentalAttachments.id, attachmentId));

      // Deletar do S3
      await deleteFile(attachment.blobUrl);

      return res.json({ success: true });
    } catch (error) {
      console.error("[Upload] Rental delete error:", error);
      return res.status(500).json({ error: "Erro ao deletar anexo" });
    }
  });

  // PATCH /api/rental-attachments/:id/type - Atualizar tipo do anexo da reserva
  app.patch("/api/rental-attachments/:id/type", async (req: Request, res: Response) => {
    try {
      const attachmentId = parseInt(req.params.id);
      const { type } = req.body;
      const userId = (req as any)?.user?.id as number;

      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      if (!type) return res.status(400).json({ error: "type é obrigatório" });

      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });

      const { rentalAttachments } = await import("../../drizzle/schema");
      const [attachment] = await db
        .select()
        .from(rentalAttachments)
        .where(eq(rentalAttachments.id, attachmentId));

      if (!attachment) return res.status(404).json({ error: "Anexo não encontrado" });

      const ownsRental = await verifyRentalOwnership(attachment.rentalId, userId);
      if (!ownsRental) return res.status(403).json({ error: "Access denied" });

      const result = await db
        .update(rentalAttachments)
        .set({ type })
        .where(eq(rentalAttachments.id, attachmentId))
        .returning();

      return res.json({ success: true, attachment: result[0] });
    } catch (error) {
      console.error("[Upload] Rental update type error:", error);
      return res.status(500).json({ error: "Erro ao atualizar tipo" });
    }
  });
}
