-- Add whatsappLid column to users table for WhatsApp Business LID support
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsappLid" varchar(100);
