import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Entities table - Dynamic financial modules (Fazenda 1, Fazenda 2, Empresa, etc.)
 */
export const entities = mysqlTable("entities", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }).default("#2563EB"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Entity = typeof entities.$inferSelect;
export type InsertEntity = typeof entities.$inferInsert;

/**
 * Categories table - Tags for transaction classification
 */
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  entityId: int("entityId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6B7280"),
  icon: varchar("icon", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

/**
 * Transactions table - Receitas e Despesas
 */
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  entityId: int("entityId").notNull(),
  type: mysqlEnum("type", ["INCOME", "EXPENSE"]).notNull(),
  description: text("description").notNull(),
  amount: int("amount").notNull(), // Stored in cents to avoid decimal issues
  dueDate: timestamp("dueDate").notNull(),
  paymentDate: timestamp("paymentDate"),
  status: mysqlEnum("status", ["PENDING", "PAID", "OVERDUE"]).default("PENDING").notNull(),
  categoryId: int("categoryId"),
  isRecurring: boolean("isRecurring").default(false).notNull(),
  recurrencePattern: text("recurrencePattern"), // JSON: { frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: number, endDate?: string }
  parentTransactionId: int("parentTransactionId"), // For recurring transactions
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Attachments table - Comprovantes e documentos
 */
export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  blobUrl: text("blobUrl").notNull(), // Vercel Blob URL
  fileSize: int("fileSize").notNull(), // Size in bytes
  mimeType: varchar("mimeType", { length: 127 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

/**
 * WhatsApp Messages table - Track WhatsApp interactions
 */
export const whatsappMessages = mysqlTable("whatsapp_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  messageId: varchar("messageId", { length: 255 }).notNull().unique(),
  from: varchar("from", { length: 50 }).notNull(),
  audioUrl: text("audioUrl"),
  transcription: text("transcription"),
  extractedData: text("extractedData"), // JSON: { amount, date, description, category }
  status: mysqlEnum("status", ["RECEIVED", "TRANSCRIBED", "EXTRACTED", "CONFIRMED", "REJECTED"]).default("RECEIVED").notNull(),
  transactionId: int("transactionId"), // Linked transaction if confirmed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsAppMessage = typeof whatsappMessages.$inferInsert;
