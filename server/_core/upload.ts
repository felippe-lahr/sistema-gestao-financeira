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

/**
 * Validate filename to prevent path traversal attacks
 */
function validateFilename(filename: string): boolean {
  // Check for path traversal attempts
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  // Check for null bytes
  if (filename.includes('\0')) {
    return false;
  }

  // Check for suspicious patterns
  if (filename.match(/[<>:"|?*]/)) {
    return false;
  }

  return true;
}

/**
 * Safely resolve file path to prevent directory traversal
 */
export function getFilePath(filename: string): string {
  if (!validateFilename(filename)) {
    throw new Error('Invalid filename');
  }

  // Use path.join and path.resolve to safely construct the path
  const filePath = path.resolve(UPLOAD_DIR, filename);

  // Ensure the resolved path is within UPLOAD_DIR
  if (!filePath.startsWith(UPLOAD_DIR)) {
    throw new Error('Path traversal attempt detected');
  }

  return filePath;
}

/**
 * Check if file exists safely
 */
export function fileExists(filename: string): boolean {
  try {
    const filePath = getFilePath(filename);
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
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
    
    // Sanitize basename to prevent injection
    const sanitizedBasename = basename.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    cb(null, `${sanitizedBasename}-${uniqueSuffix}${ext}`);
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
    const filePath = getFilePath(filename);
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
