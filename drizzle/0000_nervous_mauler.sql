CREATE TYPE "public"."payment_method_type" AS ENUM('CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'CASH', 'BANK_TRANSFER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('PENDING', 'PAID', 'OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('INCOME', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_status" AS ENUM('RECEIVED', 'TRANSCRIBED', 'EXTRACTED', 'CONFIRMED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"transactionId" integer NOT NULL,
	"filename" varchar(255) NOT NULL,
	"blobUrl" text NOT NULL,
	"fileSize" integer NOT NULL,
	"mimeType" varchar(127) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"entityId" integer,
	"name" varchar(255) NOT NULL,
	"bank" varchar(255),
	"accountNumber" varchar(50),
	"balance" integer DEFAULT 0 NOT NULL,
	"color" varchar(7) DEFAULT '#6B7280',
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"entityId" integer,
	"name" varchar(255) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"color" varchar(7) DEFAULT '#6B7280',
	"icon" varchar(50),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"color" varchar(7) DEFAULT '#2563EB',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"entityId" integer,
	"name" varchar(255) NOT NULL,
	"type" "payment_method_type" NOT NULL,
	"color" varchar(7) DEFAULT '#6B7280',
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entityId" integer NOT NULL,
	"type" "transaction_type" NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"dueDate" timestamp NOT NULL,
	"paymentDate" timestamp,
	"status" "transaction_status" DEFAULT 'PENDING' NOT NULL,
	"categoryId" integer,
	"bankAccountId" integer,
	"paymentMethodId" integer,
	"isRecurring" boolean DEFAULT false NOT NULL,
	"recurrencePattern" text,
	"parentTransactionId" integer,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"messageId" varchar(255) NOT NULL,
	"from" varchar(50) NOT NULL,
	"audioUrl" text,
	"transcription" text,
	"extractedData" text,
	"status" "whatsapp_status" DEFAULT 'RECEIVED' NOT NULL,
	"transactionId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_messages_messageId_unique" UNIQUE("messageId")
);
