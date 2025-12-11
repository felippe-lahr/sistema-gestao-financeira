import { useState, useRef } from "react";
import { FileText, Image, Trash2, Download, Eye, Upload } from "lucide-react";

type AttachmentType = "NOTA_FISCAL" | "DOCUMENTOS" | "BOLETO" | "COMPROVANTE_PAGAMENTO";

interface Attachment {
  id: number;
  filename: string;
  blobUrl: string;
  fileSize: number;
  mimeType: string;
  type: AttachmentType;
  createdAt: string;
}

interface AttachmentUploaderProps {
  transactionId?: number;
  attachments: Attachment[];
  onUpload: (file: File, type: AttachmentType) => Promise<void>;
  onDelete: (attachmentId: number) => Promise<void>;
  onUpdateType: (attachmentId: number, type: AttachmentType) => Promise<void>;
  onPreview: (attachment: Attachment) => void;
}

const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  NOTA_FISCAL: "Nota Fiscal",
  DOCUMENTOS: "Documentos",
  BOLETO: "Boleto",
  COMPROVANTE_PAGAMENTO: "Comprovante de Pagamento",
};

export function AttachmentUploader({
  transactionId,
  attachments,
  onUpload,
  onDelete,
  onUpdateType,
  onPreview,
}: AttachmentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await handleFiles(files);
  };

  const handleFiles = async (files: File[]) => {
    setUploading(true);

    for (const file of files) {
      // Validar tipo de arquivo
      const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
      if (!allowedTypes.includes(file.type)) {
        alert(`Arquivo ${file.name} não é permitido. Use PDF, JPEG ou PNG.`);
        continue;
      }

      // Validar tamanho (3MB)
      if (file.size > 3 * 1024 * 1024) {
        alert(`Arquivo ${file.name} é muito grande. Máximo 3MB.`);
        continue;
      }

      try {
        await onUpload(file, "DOCUMENTOS");
      } catch (error) {
        console.error("Erro ao fazer upload:", error);
        alert(`Erro ao fazer upload de ${file.name}`);
      }
    }

    setUploading(false);

    // Limpar input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === "application/pdf") {
      return <FileText className="w-8 h-8 text-red-500" />;
    }
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      return <Image className="w-8 h-8 text-blue-500" />;
    }
    if (mimeType === "image/png") {
      return <Image className="w-8 h-8 text-green-500" />;
    }
    return <FileText className="w-8 h-8 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Área de Upload */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          className="hidden"
        />

        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-lg font-medium text-gray-700 mb-2">
          {uploading ? "Fazendo upload..." : "Arraste arquivos aqui ou clique para selecionar"}
        </p>
        <p className="text-sm text-gray-500">
          PDF, JPEG, PNG • Máximo 3MB por arquivo
        </p>
      </div>

      {/* Lista de Anexos */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700">Documentos Anexados ({attachments.length})</h3>
          
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 max-w-full overflow-hidden"
            >
              {/* Ícone do arquivo */}
              <div className="flex-shrink-0">
                {getFileIcon(attachment.mimeType)}
              </div>

              {/* Informações do arquivo */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {attachment.filename}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(attachment.fileSize)}
                </p>
              </div>

              {/* Dropdown de tipo */}
              <select
                value={attachment.type}
                onChange={(e) => onUpdateType(attachment.id, e.target.value as AttachmentType)}
                className="text-sm border rounded px-2 py-1 flex-shrink-0"
              >
                {Object.entries(ATTACHMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              {/* Botões de ação */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onPreview(attachment)}
                  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                  title="Visualizar"
                >
                  <Eye className="w-4 h-4" />
                </button>

                <a
                  href={attachment.blobUrl}
                  download
                  className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                  title="Baixar"
                >
                  <Download className="w-4 h-4" />
                </a>

                <button
                  onClick={() => {
                    if (confirm("Tem certeza que deseja deletar este anexo?")) {
                      onDelete(attachment.id);
                    }
                  }}
                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                  title="Deletar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
