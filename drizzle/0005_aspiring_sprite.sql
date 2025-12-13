DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'entities' AND column_name = 'displayOrder'
  ) THEN
    ALTER TABLE "entities" ADD COLUMN "displayOrder" integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
