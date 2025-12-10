import { Express, Request, Response } from "express";
import { upload, deleteFile, getFilePath, fileExists } from "./upload";
import { getDb } from "../db";
import { attachments } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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

        if (!transactionId) {
          // Deletar arquivo se não tiver transactionId
          deleteFile(req.file.filename);
          return res.status(400).json({ error: "transactionId é obrigatório" });
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
            blobUrl: `/api/attachments/${req.file.filename}/download`, // URL relativa
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
        // Deletar arquivo em caso de erro
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
      const filePath = getFilePath(filename);

      if (!fileExists(filename)) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
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
      const filePath = getFilePath(filename);

      if (!fileExists(filename)) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
      }

      // Enviar arquivo para visualização inline
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

      // Extrair filename da blobUrl
      const filename = attachment.blobUrl.split("/").pop()?.replace("/download", "") || "";

      // Deletar do filesystem
      deleteFile(filename);

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

      if (!type) {
        return res.status(400).json({ error: "type é obrigatório" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(500).json({ error: "Database not available" });
      }

      const result = await db
        .update(attachments)
        .set({ type })
        .where(eq(attachments.id, attachmentId))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: "Anexo não encontrado" });
      }

      return res.json({ success: true, attachment: result[0] });
    } catch (error) {
      console.error("[Upload] Update type error:", error);
      return res.status(500).json({ error: "Erro ao atualizar tipo" });
    }
  });

  console.log("[Upload] Routes registered");
}
