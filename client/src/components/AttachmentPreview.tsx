import { X } from "lucide-react";

interface Attachment {
  id: number;
  filename: string;
  blobUrl: string;
  fileSize: number;
  mimeType: string;
  type: string;
  createdAt: string;
}

interface AttachmentPreviewProps {
  attachment: Attachment | null;
  onClose: () => void;
}

export function AttachmentPreview({ attachment, onClose }: AttachmentPreviewProps) {
  if (!attachment) return null;

  const isPDF = attachment.mimeType === "application/pdf";
  const isImage = attachment.mimeType.startsWith("image/");

  // Construir URL de preview
  const previewUrl = attachment.blobUrl.replace("/download", "/preview");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="relative w-full h-full max-w-6xl max-h-screen p-4">
        {/* Botão de fechar */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-10 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Título */}
        <div className="absolute top-6 left-6 z-10 bg-white px-4 py-2 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{attachment.filename}</p>
        </div>

        {/* Conteúdo do preview */}
        <div className="w-full h-full flex items-center justify-center mt-16">
          {isPDF && (
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(attachment.blobUrl)}&embedded=true`}
              className="w-full h-full bg-white rounded-lg shadow-2xl"
              title={attachment.filename}
            />
          )}

          {isImage && (
            <img
              src={previewUrl}
              alt={attachment.filename}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          )}

          {!isPDF && !isImage && (
            <div className="bg-white p-8 rounded-lg shadow-2xl">
              <p className="text-gray-600">
                Preview não disponível para este tipo de arquivo.
              </p>
              <a
                href={attachment.blobUrl}
                download
                className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Baixar Arquivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
