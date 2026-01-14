import { pgTable, pgEnum, serial, integer, text, timestamp, varchar, boolean } from "drizzle-orm/pg-core";

// Define enums first
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["INCOME", "EXPENSE"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["PENDING", "PAID", "OVERDUE"]);
export const whatsappStatusEnum = pgEnum("whatsapp_status", ["RECEIVED", "TRANSCRIBED", "EXTRACTED", "CONFIRMED", "REJECTED"]);
export const paymentMethodTypeEnum = pgEnum("payment_method_type", ["CREDIT_CARD", "DEBIT_CARD", "PIX", "CASH", "BANK_TRANSFER", "OTHER"]);
export const attachmentTypeEnum = pgEnum("attachment_type", ["NOTA_FISCAL", "DOCUMENTOS", "BOLETO", "COMPROVANTE_PAGAMENTO"]);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Entities table - Dynamic financial modules (Fazenda 1, Fazenda 2, Empresa, etc.)
 */
export const entities = pgTable("entities", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }).default("#2563EB"),
  displayOrder: integer("displayOrder").default(0).notNull(),
  temporaryRentalEnabled: boolean("temporaryRentalEnabled").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Entity = typeof entities.$inferSelect;
export type InsertEntity = typeof entities.$inferInsert;

/**
 * Categories table - Tags for transaction classification
 */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(), // Owner of the category
  entityId: integer("entityId"), // Optional: if set, category is exclusive to this entity
  name: varchar("name", { length: 255 }).notNull(),
  type: transactionTypeEnum("type").notNull(),
  color: varchar("color", { length: 7 }).default("#6B7280"),
  icon: varchar("icon", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

/**
 * Transactions table - Receitas e Despesas
 */
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  entityId: integer("entityId").notNull(),
  type: transactionTypeEnum("type").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(), // Stored in cents to avoid decimal issues
  dueDate: timestamp("dueDate").notNull(),
  paymentDate: timestamp("paymentDate"),
  status: transactionStatusEnum("status").default("PENDING").notNull(),
  categoryId: integer("categoryId"),
  bankAccountId: integer("bankAccountId"),
  paymentMethodId: integer("paymentMethodId"),
  isRecurring: boolean("isRecurring").default(false).notNull(),
  recurrencePattern: text("recurrencePattern"), // JSON: { frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: number, endDate?: string }
  parentTransactionId: integer("parentTransactionId"), // For recurring transactions
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Attachments table - Comprovantes e documentos
 */
export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  transactionId: integer("transactionId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  blobUrl: text("blobUrl").notNull(), // Vercel Blob URL
  fileSize: integer("fileSize").notNull(), // Size in bytes
  mimeType: varchar("mimeType", { length: 127 }).notNull(),
  type: attachmentTypeEnum("type").default("DOCUMENTOS").notNull(), // Tipo de documento
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

/**
 * WhatsApp Messages table - Track WhatsApp interactions
 */
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  messageId: varchar("messageId", { length: 255 }).notNull().unique(),
  from: varchar("from", { length: 50 }).notNull(),
  audioUrl: text("audioUrl"),
  transcription: text("transcription"),
  extractedData: text("extractedData"), // JSON: { amount, date, description, category }
  status: whatsappStatusEnum("status").default("RECEIVED").notNull(),
  transactionId: integer("transactionId"), // Linked transaction if confirmed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsAppMessage = typeof whatsappMessages.$inferInsert;

/**
 * Bank Accounts table - Contas Correntes por entidade
 */
export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(), // Owner of the account
  entityId: integer("entityId"), // Optional: if set, account is exclusive to this entity
  name: varchar("name", { length: 255 }).notNull(),
  bank: varchar("bank", { length: 255 }),
  accountNumber: varchar("accountNumber", { length: 50 }),
  balance: integer("balance").default(0).notNull(), // Stored in cents
  color: varchar("color", { length: 7 }).default("#6B7280"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;

/**
 * Payment Methods table - Meios de Pagamento por entidade
 */
export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(), // Owner of the payment method
  entityId: integer("entityId"), // Optional: if set, payment method is exclusive to this entity
  name: varchar("name", { length: 255 }).notNull(),
  type: paymentMethodTypeEnum("type").notNull(),
  transactionType: transactionTypeEnum("transactionType").default("EXPENSE").notNull(), // INCOME or EXPENSE
  color: varchar("color", { length: 7 }).default("#6B7280"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethod = typeof paymentMethods.$inferInsert;

/**
 * Investment enums
 */
export const investmentTypeEnum = pgEnum("investment_type", [
  "ACAO",           // Ações
  "FII",            // Fundos Imobiliários
  "TESOURO_DIRETO", // Tesouro Direto
  "CDB",            // Certificado de Depósito Bancário
  "LCI",            // Letra de Crédito Imobiliário
  "LCA",            // Letra de Crédito do Agronegócio
  "FUNDO",          // Fundos de Investimento
  "CRIPTO",         // Criptomoedas
  "OUTRO"           // Outros
]);

export const investmentTransactionTypeEnum = pgEnum("investment_transaction_type", [
  "BUY",      // Compra
  "SELL",     // Venda
  "DIVIDEND", // Dividendo
  "INTEREST", // Juros
  "FEE"       // Taxa
]);

export const priceSourceEnum = pgEnum("price_source", [
  "WEB_SCRAPING",
  "API",
  "MANUAL"
]);

/**
 * Investments table - Aplicações financeiras por entidade
 */
export const investments = pgTable("investments", {
  id: serial("id").primaryKey(),
  entityId: integer("entityId").notNull(),
  userId: integer("userId").notNull(),
  
  // Informações básicas
  name: varchar("name", { length: 255 }).notNull(),
  type: investmentTypeEnum("type").notNull(),
  ticker: varchar("ticker", { length: 20 }), // Código do ativo (ex: PETR4, MXRF11)
  institution: varchar("institution", { length: 255 }), // Instituição financeira
  
  // Valores
  initialAmount: integer("initialAmount").notNull(), // Valor inicial em centavos
  currentAmount: integer("currentAmount"), // Valor atual em centavos
  quantity: integer("quantity"), // Quantidade de cotas/ações (em milésimos para precisão)
  averagePrice: integer("averagePrice"), // Preço médio em centavos
  currentPrice: integer("currentPrice"), // Preço atual em centavos
  
  // Rentabilidade
  profitLoss: integer("profitLoss"), // Lucro/Prejuízo em centavos
  profitLossPercent: integer("profitLossPercent"), // Lucro/Prejuízo em centésimos de % (ex: 1050 = 10.50%)
  dailyChange: integer("dailyChange"), // Variação diária em centésimos de %
  
  // Datas
  purchaseDate: timestamp("purchaseDate").notNull(),
  maturityDate: timestamp("maturityDate"), // Data de vencimento (para renda fixa)
  lastUpdate: timestamp("lastUpdate"), // Última atualização de preço
  
  // Configurações
  autoUpdate: boolean("autoUpdate").default(true).notNull(),
  alertThreshold: integer("alertThreshold"), // % de variação para alertar (em centésimos)
  
  // Tesouro Direto específico
  treasuryDirectCode: varchar("treasuryDirectCode", { length: 100 }), // Código do título (ex: "SELIC_2031")
  treasuryDirectCategory: varchar("treasuryDirectCategory", { length: 50 }), // Categoria (SELIC, IPCA, EDUCAC, RENDA, PREFIXADO)
  treasuryDirectProfitability: varchar("treasuryDirectProfitability", { length: 100 }), // Rentabilidade (ex: "SELIC + 0,1025%")
  
  // Metadados
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Investment = typeof investments.$inferSelect;
export type InsertInvestment = typeof investments.$inferInsert;

/**
 * Investment History table - Histórico diário de preços
 */
export const investmentHistory = pgTable("investment_history", {
  id: serial("id").primaryKey(),
  investmentId: integer("investmentId").notNull(),
  
  // Snapshot diário
  date: timestamp("date").notNull(),
  price: integer("price").notNull(), // Preço em centavos
  amount: integer("amount").notNull(), // Valor total em centavos
  profitLoss: integer("profitLoss"), // Lucro/Prejuízo em centavos
  profitLossPercent: integer("profitLossPercent"), // Em centésimos de %
  
  // Metadados
  source: priceSourceEnum("source").default("WEB_SCRAPING").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvestmentHistory = typeof investmentHistory.$inferSelect;
export type InsertInvestmentHistory = typeof investmentHistory.$inferInsert;

/**
 * Investment Transactions table - Transações de investimentos
 */
export const investmentTransactions = pgTable("investment_transactions", {
  id: serial("id").primaryKey(),
  investmentId: integer("investmentId").notNull(),
  
  // Transação
  type: investmentTransactionTypeEnum("type").notNull(),
  date: timestamp("date").notNull(),
  quantity: integer("quantity"), // Quantidade em milésimos
  price: integer("price"), // Preço unitário em centavos
  amount: integer("amount").notNull(), // Valor total em centavos
  fees: integer("fees").default(0).notNull(), // Taxas em centavos
  
  // Descrição
  description: text("description"),
  
  // Metadados
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvestmentTransaction = typeof investmentTransactions.$inferSelect;
export type InsertInvestmentTransaction = typeof investmentTransactions.$inferInsert;


/**
 * Treasury Selic table - Tesouro Selic investments
 */
export const treasurySelic = pgTable("treasury_selic", {
  id: serial("id").primaryKey(),
  entityId: integer("entityId").notNull().references(() => entities.id, { onDelete: "cascade" }),
  quantity: varchar("quantity", { length: 50 }).notNull(), // Decimal string (ex: "2.86")
  initialPrice: integer("initialPrice").notNull(), // Preço inicial em centavos
  currentPrice: integer("currentPrice").notNull(), // Preço atual em centavos
  lastUpdated: timestamp("lastUpdated").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TreasurySelic = typeof treasurySelic.$inferSelect;
export type InsertTreasurySelic = typeof treasurySelic.$inferInsert;

/**
 * Treasury Direct Titles Cache - Cache de títulos do Tesouro Direto
 * Atualizado diariamente via cron job
 */
export const treasuryDirectTitlesCache = pgTable("treasury_direct_titles_cache", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // Ex: "Tesouro Selic 2031"
  category: varchar("category", { length: 50 }).notNull(), // Ex: "SELIC", "IPCA", "EDUCAC", "RENDA", "PREFIXADO"
  code: varchar("code", { length: 100 }).unique().notNull(), // Código único (ex: "SELIC_2031")
  profitability: varchar("profitability", { length: 100 }).notNull(), // Ex: "SELIC + 0,1025%"
  unitaryPrice: integer("unitaryPrice").notNull(), // Preço unitário em centavos
  minimumInvestment: integer("minimumInvestment").notNull(), // Investimento mínimo em centavos
  maturityDate: varchar("maturityDate", { length: 20 }).notNull(), // Data de vencimento (ISO format)
  lastUpdated: timestamp("lastUpdated").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TreasuryDirectTitleCache = typeof treasuryDirectTitlesCache.$inferSelect;
export type InsertTreasuryDirectTitleCache = typeof treasuryDirectTitlesCache.$inferInsert;


// User Passwords table
export const userPasswords = pgTable("user_passwords", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UserPassword = typeof userPasswords.$inferSelect;
export type InsertUserPassword = typeof userPasswords.$inferInsert;

/**
 * Rental Status enum
 */
export const rentalStatusEnum = pgEnum("rental_status", ["BLOCKED", "RESERVED_AIRBNB", "RESERVED_DIRECT", "AVAILABLE"]);
export const rentalSourceEnum = pgEnum("rental_source", ["AIRBNB", "DIRECT", "BLOCKED"]);

/**
 * Rentals table - Reservas e bloqueios de temporada
 */
export const rentals = pgTable("rentals", {
  id: serial("id").primaryKey(),
  entityId: integer("entityId").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull(),
  
  // Período
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  
  // Informações da reserva
  source: rentalSourceEnum("source").notNull(),
  status: rentalStatusEnum("status").default("AVAILABLE").notNull(),
  
  // Hóspede (para reservas diretas)
  guestName: varchar("guestName", { length: 255 }),
  guestEmail: varchar("guestEmail", { length: 320 }),
  guestPhone: varchar("guestPhone", { length: 20 }),
  
  // Valores
  dailyRate: integer("dailyRate"),
  totalAmount: integer("totalAmount"),
  
  // Horários
  checkInTime: varchar("checkInTime", { length: 5 }),
  checkOutTime: varchar("checkOutTime", { length: 5 }),
  
  // Notas e observações
  notes: text("notes"),
  specialRequests: text("specialRequests"),
  
  // Número de hóspedes
  numberOfGuests: integer("numberOfGuests").default(1),
  
  // Taxa extra
  extraFeeType: varchar("extraFeeType", { length: 50 }), // IMPOSTO, TAXA_PET, LIMPEZA
  extraFeeAmount: integer("extraFeeAmount"),
  
  // Data de competência
  competencyDate: varchar("competencyDate", { length: 20 }).default("CHECK_IN"), // CHECK_IN ou CHECK_OUT
  
  // Documentos anexados (JSON array de IDs de attachments)
  attachmentIds: text("attachmentIds"),
  
  // Integração Airbnb (fase 2)
  airbnbListingId: varchar("airbnbListingId", { length: 255 }),
  airbnbReservationId: varchar("airbnbReservationId", { length: 255 }).unique(),
  airbnbSyncedAt: timestamp("airbnbSyncedAt"),
  
  // Metadados
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Rental = typeof rentals.$inferSelect;
export type InsertRental = typeof rentals.$inferInsert;

/**
 * Rental Attachments table - Documentos anexados às reservas
 */
export const rentalAttachments = pgTable("rental_attachments", {
  id: serial("id").primaryKey(),
  rentalId: integer("rentalId").notNull().references(() => rentals.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  blobUrl: text("blobUrl").notNull(), // Vercel Blob URL
  fileSize: integer("fileSize").notNull(), // Size in bytes
  mimeType: varchar("mimeType", { length: 127 }).notNull(),
  type: attachmentTypeEnum("type").default("DOCUMENTOS").notNull(), // NOTA_FISCAL, DOCUMENTOS, BOLETO, COMPROVANTE_PAGAMENTO
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RentalAttachment = typeof rentalAttachments.$inferSelect;
export type InsertRentalAttachment = typeof rentalAttachments.$inferInsert;

/**
 * Rental Configuration table - Configurações do módulo de locação
 */
export const rentalConfigs = pgTable("rental_configs", {
  id: serial("id").primaryKey(),
  entityId: integer("entityId").notNull().unique().references(() => entities.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull(),
  
  // Configurações gerais
  defaultCheckInTime: varchar("defaultCheckInTime", { length: 5 }).default("14:00"),
  defaultCheckOutTime: varchar("defaultCheckOutTime", { length: 5 }).default("11:00"),
  
  // Integração Airbnb (fase 2)
  airbnbApiKey: varchar("airbnbApiKey", { length: 255 }),
  airbnbListingIds: text("airbnbListingIds"),
  airbnbSyncEnabled: boolean("airbnbSyncEnabled").default(false),
  airbnbLastSync: timestamp("airbnbLastSync"),
  airbnbWebhookSecret: varchar("airbnbWebhookSecret", { length: 255 }),
  
  // Metadados
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type RentalConfig = typeof rentalConfigs.$inferSelect;
export type InsertRentalConfig = typeof rentalConfigs.$inferInsert;

/**
 * Rental Sync Logs table - Logs de sincronização com Airbnb (fase 2)
 */
export const rentalSyncLogs = pgTable("rental_sync_logs", {
  id: serial("id").primaryKey(),
  entityId: integer("entityId").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull(),
  
  // Informações da sincronização
  syncType: varchar("syncType", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  message: text("message"),
  
  // Detalhes
  itemsSynced: integer("itemsSynced").default(0),
  itemsFailed: integer("itemsFailed").default(0),
  
  // Metadados
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RentalSyncLog = typeof rentalSyncLogs.$inferSelect;
export type InsertRentalSyncLog = typeof rentalSyncLogs.$inferInsert;


/**
 * Task Priority enum
 */
export const taskPriorityEnum = pgEnum("task_priority", ["LOW", "MEDIUM", "HIGH"]);

/**
 * Task Status enum
 */
export const taskStatusEnum = pgEnum("task_status", ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

/**
 * Tasks table - Tarefas e compromissos por entidade
 */
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  entityId: integer("entityId").references(() => entities.id, { onDelete: "cascade" }),
  
  // Informações da tarefa
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  
  // Data e hora
  dueDate: timestamp("dueDate").notNull(),
  dueTime: varchar("dueTime", { length: 5 }), // Formato HH:MM
  endDate: timestamp("endDate"), // Para eventos com duração
  endTime: varchar("endTime", { length: 5 }), // Formato HH:MM
  allDay: boolean("allDay").default(false).notNull(),
  
  // Status e prioridade
  priority: taskPriorityEnum("priority").default("MEDIUM").notNull(),
  status: taskStatusEnum("status").default("PENDING").notNull(),
  
  // Cor personalizada (opcional)
  color: varchar("color", { length: 7 }),
  
  // Lembrete
  reminderMinutes: integer("reminderMinutes"), // Minutos antes para lembrar
  
  // Metadados
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
