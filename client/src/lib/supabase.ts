import { createClient } from '@supabase/supabase-js';

// Credenciais públicas do Supabase (seguro expor a chave anon)
const supabaseUrl = 'https://jyibtqwk-jthsdnahtdvd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5aWJ0cXdranRoc2RuYWh0ZHZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM4NjE1NjEsImV4cCI6MjA0OTQzNzU2MX0.VYqPYhKGzLRQcEQXoqAWX8vKqJqE7vH0YqJZNqE4Qzs';

console.log('[Supabase] Initializing with URL:', supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to upload file to Supabase Storage
export async function uploadFile(file: File, bucket: string = 'attachments'): Promise<string> {
  console.log('[Supabase] Uploading file:', file.name, 'Size:', file.size, 'Type:', file.type);
  
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  console.log('[Supabase] Upload path:', filePath);

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('[Supabase] Upload error:', error);
    throw error;
  }

  console.log('[Supabase] Upload successful:', data);

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  console.log('[Supabase] Public URL:', publicUrl);

  return publicUrl;
}

// Helper function to delete file from Supabase Storage
export async function deleteFile(fileUrl: string, bucket: string = 'attachments'): Promise<void> {
  console.log('[Supabase] Deleting file:', fileUrl);
  
  // Extract file path from URL
  const urlParts = fileUrl.split('/');
  const filePath = urlParts[urlParts.length - 1];

  const { error } = await supabase.storage
    .from(bucket)
    .remove([filePath]);

  if (error) {
    console.error('[Supabase] Delete error:', error);
    throw error;
  }

  console.log('[Supabase] Delete successful');
}
