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
      CREATE TYPE invoice_attachment_type AS ENUM ('FATURA_PDF', 'COMPROVANTE_PAGAMENTO', 'OUTROS');
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
      type invoice_attachment_type NOT NULL DEFAULT 'OUTROS',
      "createdAt" TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
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
