import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from "path";

// Configuração do cliente S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || "gestao-financeira-attachments";
const REGION = process.env.AWS_REGION || "us-east-2";

/**
 * Verifica se o S3 está configurado corretamente
 */
export function isS3Configured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  );
}

/**
 * Faz upload de um arquivo para o S3
 * @returns URL pública do arquivo no S3
 */
export async function uploadToS3(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  folder: string = "attachments"
): Promise<string> {
  const key = `${folder}/${filename}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    })
  );

  // Retorna URL pública
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

/**
 * Deleta um arquivo do S3
 */
export async function deleteFromS3(fileUrl: string): Promise<boolean> {
  try {
    // Extrair a key da URL
    const url = new URL(fileUrl);
    const key = url.pathname.substring(1); // Remove o leading "/"

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    console.error("[S3] Error deleting file:", error);
    return false;
  }
}

/**
 * Gera uma URL pré-assinada para download seguro (expira em 1 hora)
 */
export async function getPresignedUrl(
  fileUrl: string,
  expiresIn: number = 3600
): Promise<string> {
  const url = new URL(fileUrl);
  const key = url.pathname.substring(1);

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Extrai o nome do arquivo de uma URL do S3
 */
export function getFilenameFromS3Url(url: string): string {
  return path.basename(url);
}
