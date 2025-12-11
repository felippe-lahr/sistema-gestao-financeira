-- Add column without NOT NULL first
ALTER TABLE "payment_methods" ADD COLUMN "transactionType" "transaction_type";

-- Set default value for existing rows (assume EXPENSE for existing payment methods)
UPDATE "payment_methods" SET "transactionType" = 'EXPENSE' WHERE "transactionType" IS NULL;

-- Now add NOT NULL constraint
ALTER TABLE "payment_methods" ALTER COLUMN "transactionType" SET NOT NULL;