import multer from "multer";
import path from "path";
import { uploadToS3, deleteFromS3, isS3Configured } from "./s3";

// Usar memória para armazenar temporariamente antes de enviar ao S3
const storage = multer.memoryStorage();

// Filtro de tipos de arquivo permitidos
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimes = ["application/pdf", "image/jpeg", "image/png"];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de arquivo não permitido. Use PDF, JPEG ou PNG."));
  }
};

// Configuração do multer com memória e limite de 10MB
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * Gera nome único para o arquivo
 */
export function generateFilename(originalname: string): string {
  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
  const ext = path.extname(originalname);
  const basename = path.basename(originalname, ext);
  const sanitizedBasename = basename.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${sanitizedBasename}-${uniqueSuffix}${ext}`;
}

/**
 * Faz upload do arquivo para S3 e retorna a URL pública
 */
export async function uploadFile(
  file: Express.Multer.File,
  folder: string = "attachments"
): Promise<string> {
  const filename = generateFilename(file.originalname);

  if (isS3Configured()) {
    return await uploadToS3(file.buffer, filename, file.mimetype, folder);
  } else {
    throw new Error(
      "S3 não está configurado. Configure as variáveis AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY e AWS_S3_BUCKET."
    );
  }
}

/**
 * Deleta um arquivo pelo URL (S3)
 */
export async function deleteFile(fileUrl: string): Promise<boolean> {
  if (!fileUrl) return false;

  try {
    if (fileUrl.includes("amazonaws.com")) {
      return await deleteFromS3(fileUrl);
    }
    // URL do Supabase ou outro provider — não deletar (manter compatibilidade)
    console.warn("[Upload] Cannot delete file from unknown provider:", fileUrl);
    return false;
  } catch (error) {
    console.error("[Upload] Error deleting file:", error);
    return false;
  }
}

/**
 * Verifica se um arquivo existe (por URL)
 */
export function fileExists(fileUrl: string): boolean {
  return !!(fileUrl && fileUrl.startsWith("http"));
}

/**
 * Compatibilidade: retorna a URL do arquivo
 */
export function getFilePath(fileUrl: string): string {
  return fileUrl;
}
