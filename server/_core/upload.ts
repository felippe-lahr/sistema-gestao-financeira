import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";

// Diretório para armazenar uploads
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

// Criar diretório se não existir
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configuração do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Gerar nome único: timestamp + nome original
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  },
});

// Filtro de tipos de arquivo permitidos
const fileFilter = (
  req: Request,
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

// Configuração do multer com limite de 3MB
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 3 * 1024 * 1024, // 3MB
  },
});

// Função para deletar arquivo do filesystem
export function deleteFile(filename: string): boolean {
  try {
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[Upload] Error deleting file:", error);
    return false;
  }
}

// Função para obter caminho completo do arquivo
export function getFilePath(filename: string): string {
  return path.join(UPLOAD_DIR, filename);
}

// Função para verificar se arquivo existe
export function fileExists(filename: string): boolean {
  return fs.existsSync(getFilePath(filename));
}
