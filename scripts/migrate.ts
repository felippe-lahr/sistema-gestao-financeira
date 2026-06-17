/**
 * Script de migração customizado — executa ALTER TABLE idempotentes.
 * Substitui o `drizzle-kit push` no startup para evitar prompts interativos.
 *
 * Adicione novas migrações aqui como comandos SQL com IF NOT EXISTS / IF EXISTS.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL não definida. Pulando migração.");
  process.exit(0);
}

const sql = postgres(DATABASE_URL, { max: 1 });

const migrations: { name: string; sql: string }[] = [
  {
    name: "add_purchaseDate_to_transactions",
    sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS "purchaseDate" date`,
  },
  {
    name: "add_invoiceTotal_to_credit_card_invoices",
    sql: `ALTER TABLE credit_card_invoices ADD COLUMN IF NOT EXISTS "invoiceTotal" integer`,
  },
  {
    name: "create_invoice_attachment_type_enum",
    sql: `DO $$ BEGIN
      CREATE TYPE invoice_attachment_type AS ENUM ('NOTA_FISCAL', 'DOCUMENTOS', 'BOLETO', 'COMPROVANTE_PAGAMENTO');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,
  },
  {
    name: "create_credit_card_invoice_attachments_table",
    sql: `CREATE TABLE IF NOT EXISTS credit_card_invoice_attachments (
      id SERIAL PRIMARY KEY,
      "invoiceId" INTEGER NOT NULL REFERENCES credit_card_invoices(id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      "blobUrl" TEXT NOT NULL,
      "fileSize" INTEGER NOT NULL,
      "mimeType" VARCHAR(127) NOT NULL,
      type invoice_attachment_type NOT NULL DEFAULT 'DOCUMENTOS',
      "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
  },
  {
    name: "update_invoice_attachment_type_enum_add_values",
    sql: `DO $$ BEGIN
      ALTER TYPE invoice_attachment_type ADD VALUE IF NOT EXISTS 'NOTA_FISCAL';
      ALTER TYPE invoice_attachment_type ADD VALUE IF NOT EXISTS 'DOCUMENTOS';
      ALTER TYPE invoice_attachment_type ADD VALUE IF NOT EXISTS 'BOLETO';
      ALTER TYPE invoice_attachment_type ADD VALUE IF NOT EXISTS 'COMPROVANTE_PAGAMENTO';
    EXCEPTION WHEN others THEN NULL;
    END $$`,
  },
  {
    // Corrige incompatibilidade de tipo: o schema Drizzle usa timestamp() mas a coluna foi criada como date.
    // O Drizzle serializa Date objects como ISO string completa ('2026-04-15T16:00:00.000Z'),
    // que o PostgreSQL rejeita em colunas do tipo date. Convertendo para timestamp resolve o bug.
    name: "fix_purchaseDate_type_date_to_timestamp",
    sql: `ALTER TABLE transactions ALTER COLUMN "purchaseDate" TYPE timestamp USING "purchaseDate"::timestamp`,
  },
  {
    // Adiciona colunas necessárias para integração com Google Calendar na tabela users.
    // Sem essas colunas o refresh_token nunca é salvo e a integração nunca persiste.
    name: "add_google_calendar_columns_to_users",
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='googleCalendarRefreshToken') THEN
          ALTER TABLE users ADD COLUMN "googleCalendarRefreshToken" text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='googleCalendarConnectedAt') THEN
          ALTER TABLE users ADD COLUMN "googleCalendarConnectedAt" timestamp;
        END IF;
      END $$
    `,
  },
  {
    // Adiciona coluna googleCalendarEventId na tabela tasks para rastrear eventos sincronizados.
    name: "add_google_calendar_event_id_to_tasks",
    sql: `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS "googleCalendarEventId" varchar(255)`,
  },
  {
    // Adiciona colunas para autenticação de dois fatores (2FA) via TOTP (Google Authenticator).
    // totpSecret: chave secreta ativa (quando 2FA está habilitado)
    // totpEnabled: flag indicando se o 2FA está ativo para o usuário
    // totpPendingSecret: chave temporária durante o processo de ativação (antes da confirmação)
    name: "add_totp_2fa_columns_to_users",
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "totpSecret" varchar(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "totpEnabled" boolean NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "totpPendingSecret" varchar(64);
    `,
  },
  {
    // Adiciona colunas para integração multi-tenant com WhatsApp Bot.
    // whatsappPhone: número vinculado ao bot (formato internacional: 5511999999999)
    // whatsappVerified: indica se o número foi verificado via código de confirmação
    // whatsappVerifyCode: código temporário de 6 dígitos enviado via WhatsApp
    // whatsappVerifyExpires: data/hora de expiração do código (10 minutos)
    name: "add_whatsapp_columns_to_users",
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "whatsappPhone" varchar(30);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "whatsappVerified" boolean NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "whatsappVerifyCode" varchar(10);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "whatsappVerifyExpires" timestamp;
    `,
  },
  {
    name: "add_payment_method_types_ted_boleto_exchange",
    sql: `DO $$ BEGIN
      ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'TED';
      ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'BOLETO';
      ALTER TYPE payment_method_type ADD VALUE IF NOT EXISTS 'EXCHANGE';
    EXCEPTION WHEN others THEN NULL;
    END $$`,
  },
  {
    name: "add_whatsappLid_to_users",
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS "whatsappLid" varchar(100)`,
  },
  {
    name: "create_password_reset_tokens_table",
    sql: `CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
      "id" serial PRIMARY KEY,
      "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "token" varchar(128) NOT NULL,
      "expiresAt" timestamp NOT NULL,
      "usedAt" timestamp,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )`,
  },
  {
    name: "add_isDefault_to_bank_accounts",
    sql: `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS "isDefault" boolean NOT NULL DEFAULT false`,
  },
  {
    name: "add_isDefault_to_credit_cards",
    sql: `ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS "isDefault" boolean NOT NULL DEFAULT false`,
  },
];

async function runMigrations() {
  console.log("[migrate] Iniciando migrações...");
  for (const migration of migrations) {
    try {
      await sql.unsafe(migration.sql);
      console.log(`[migrate] ✓ ${migration.name}`);
    } catch (err: any) {
      console.error(`[migrate] ✗ ${migration.name}: ${err.message}`);
      // Não interrompe o startup — erros de migração não devem derrubar o servidor
    }
  }
  console.log("[migrate] Migrações concluídas.");
  await sql.end();
}

runMigrations().catch((err) => {
  console.error("[migrate] Erro inesperado:", err.message);
  process.exit(0); // exit 0 para não bloquear o startup
});
