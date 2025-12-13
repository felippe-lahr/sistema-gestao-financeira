CREATE TYPE "public"."investment_transaction_type" AS ENUM('BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'FEE');--> statement-breakpoint
CREATE TYPE "public"."investment_type" AS ENUM('ACAO', 'FII', 'TESOURO_DIRETO', 'CDB', 'LCI', 'LCA', 'FUNDO', 'CRIPTO', 'OUTRO');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('WEB_SCRAPING', 'API', 'MANUAL');--> statement-breakpoint
CREATE TABLE "investment_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"investmentId" integer NOT NULL,
	"date" timestamp NOT NULL,
	"price" integer NOT NULL,
	"amount" integer NOT NULL,
	"profitLoss" integer,
	"profitLossPercent" integer,
	"source" "price_source" DEFAULT 'WEB_SCRAPING' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"investmentId" integer NOT NULL,
	"type" "investment_transaction_type" NOT NULL,
	"date" timestamp NOT NULL,
	"quantity" integer,
	"price" integer,
	"amount" integer NOT NULL,
	"fees" integer DEFAULT 0 NOT NULL,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" serial PRIMARY KEY NOT NULL,
	"entityId" integer NOT NULL,
	"userId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "investment_type" NOT NULL,
	"ticker" varchar(20),
	"institution" varchar(255),
	"initialAmount" integer NOT NULL,
	"currentAmount" integer,
	"quantity" integer,
	"averagePrice" integer,
	"currentPrice" integer,
	"profitLoss" integer,
	"profitLossPercent" integer,
	"dailyChange" integer,
	"purchaseDate" timestamp NOT NULL,
	"maturityDate" timestamp,
	"lastUpdate" timestamp,
	"autoUpdate" boolean DEFAULT true NOT NULL,
	"alertThreshold" integer,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
