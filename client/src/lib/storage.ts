/**
 * Storage utilities - Upload de arquivos via API do servidor (AWS S3)
 * Substitui o uso direto do Supabase Storage
 */

/**
 * Faz upload de um arquivo via API do servidor para o S3
 * Retorna a URL do arquivo no S3
 *
 * Nota: Esta função é usada para uploads temporários (antes de associar a uma transação/reserva).
 * Para uploads associados a uma transação, use a rota /api/attachments/upload diretamente.
 */
export async function uploadFile(
  file: File,
  _bucket: string = "attachments" // parâmetro mantido por compatibilidade
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  // Usar um transactionId temporário de 0 para uploads sem transação associada
  // O servidor irá validar e rejeitar se necessário
  // Para uploads com transação, use uploadFileForTransaction
  formData.append("transactionId", "0");

  const response = await fetch("/api/attachments/upload-temp", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(error.error || `Upload falhou com status ${response.status}`);
  }

  const data = await response.json();
  return data.s3Url;
}

/**
 * Faz upload de um arquivo associado a uma transação
 * Retorna a URL do arquivo no S3 e o ID do attachment criado
 */
export async function uploadFileForTransaction(
  file: File,
  transactionId: number,
  type: string = "DOCUMENTOS"
): Promise<{ blobUrl: string; attachmentId: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("transactionId", String(transactionId));
  formData.append("type", type);

  const response = await fetch("/api/attachments/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(error.error || `Upload falhou com status ${response.status}`);
  }

  const data = await response.json();
  return {
    blobUrl: data.attachment.blobUrl,
    attachmentId: data.attachment.id,
  };
}

/**
 * Faz upload de um arquivo associado a uma reserva
 * Retorna a URL do arquivo no S3 e o ID do attachment criado
 */
export async function uploadFileForRental(
  file: File,
  rentalId: number,
  type: string = "DOCUMENTOS"
): Promise<{ blobUrl: string; attachmentId: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("rentalId", String(rentalId));
  formData.append("type", type);

  const response = await fetch("/api/rental-attachments/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(error.error || `Upload falhou com status ${response.status}`);
  }

  const data = await response.json();
  return {
    blobUrl: data.attachment.blobUrl,
    attachmentId: data.attachment.id,
  };
}

/**
 * Deleta um arquivo pelo URL
 * Para arquivos S3, a deleção é feita via API do servidor ao deletar o attachment
 * Esta função é mantida por compatibilidade mas não faz nada para URLs S3
 * (a deleção real acontece quando o attachment é deletado via tRPC)
 */
export async function deleteFile(
  fileUrl: string,
  _bucket: string = "attachments" // parâmetro mantido por compatibilidade
): Promise<void> {
  // Para URLs S3, a deleção é gerenciada pelo servidor ao deletar o attachment via tRPC
  // Não precisamos fazer nada aqui pois o servidor cuida da deleção do S3
  if (fileUrl && fileUrl.includes("amazonaws.com")) {
    console.log("[Storage] S3 file deletion is handled server-side via attachment delete API");
    return;
  }

  // Para URLs do Supabase (arquivos antigos migrados), também não deletamos
  // pois o Supabase não é mais usado e os arquivos foram migrados para S3
  console.log("[Storage] File deletion skipped for URL:", fileUrl);
}
