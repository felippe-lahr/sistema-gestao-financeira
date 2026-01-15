-- Add recurrence fields to tasks table
ALTER TABLE tasks ADD COLUMN "isRecurring" boolean DEFAULT false NOT NULL;
ALTER TABLE tasks ADD COLUMN "recurrencePattern" text;
ALTER TABLE tasks ADD COLUMN "parentTaskId" integer;
