import { eq, or, and, isNull, desc, asc, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertUser,
  users,
  entities,
  InsertEntity,
  categories,
  InsertCategory,
  transactions,
  InsertTransaction,
  attachments,
  InsertAttachment,
  whatsappMessages,
  InsertWhatsAppMessage,
  bankAccounts,
  InsertBankAccount,
  paymentMethods,
  InsertPaymentMethod,
  investments,
  InsertInvestment,
  investmentHistory,
  InsertInvestmentHistory,
  investmentTransactions,
  InsertInvestmentTransaction,
  treasurySelic,
  InsertTreasurySelic,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL);
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ========== USER OPERATIONS ==========

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ========== ENTITY OPERATIONS ==========

export async function getEntitiesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(entities).where(eq(entities.userId, userId)).orderBy(asc(entities.displayOrder), desc(entities.createdAt));
}

export async function getEntityById(entityId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(entities).where(eq(entities.id, entityId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createEntity(entity: InsertEntity) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(entities).values(entity).returning();
  return Number(result[0].id);
}

export async function updateEntity(entityId: number, data: Partial<InsertEntity>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(entities).set(data).where(eq(entities.id, entityId));
}

export async function deleteEntity(entityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(entities).where(eq(entities.id, entityId));
}

// ========== CATEGORY OPERATIONS ==========

export async function getCategoriesByEntityId(entityId: number, userId?: number) {
  const db = await getDb();
  if (!db) return [];

  // Return categories that are either:
  // 1. Specific to this entity (entityId matches)
  // 2. Shared categories (entityId is null) belonging to the user
  if (userId) {
    return await db
      .select()
      .from(categories)
      .where(
        or(
          eq(categories.entityId, entityId),
          and(isNull(categories.entityId), eq(categories.userId, userId))
        )
      )
      .orderBy(categories.name);
  }

  // Fallback: only entity-specific categories
  return await db.select().from(categories).where(eq(categories.entityId, entityId)).orderBy(categories.name);
}

export async function createCategory(category: InsertCategory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(categories).values(category).returning();
  return Number(result[0].id);
}

export async function updateCategory(categoryId: number, data: Partial<InsertCategory>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(categories).set(data).where(eq(categories.id, categoryId));
}

export async function deleteCategory(categoryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(categories).where(eq(categories.id, categoryId));
}

// ========== TRANSACTION OPERATIONS ==========

export async function getTransactionsByEntityId(
  entityId: number,
  options?: {
    startDate?: Date;
    endDate?: Date;
    status?: "PENDING" | "PAID" | "OVERDUE";
    type?: "INCOME" | "EXPENSE";
    limit?: number;
  }
) {
  const db = await getDb();
  if (!db) return [];
  
  if (options?.startDate || options?.endDate) {
    console.log("[getTransactionsByEntityId] Filtro de datas:", {
      startDate: options?.startDate?.toISOString(),
      endDate: options?.endDate?.toISOString(),
      startDateTime: options?.startDate,
      endDateTime: options?.endDate,
    });
  }

  let conditions: any[] = [eq(transactions.entityId, entityId)];
  
  if (options?.startDate) {
    conditions.push(gte(transactions.dueDate, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(transactions.dueDate, options.endDate));
  }
  if (options?.status) {
    conditions.push(eq(transactions.status, options.status));
  }
  if (options?.type) {
    conditions.push(eq(transactions.type, options.type));
  }
  
  let query = db
    .select({
      id: transactions.id,
      entityId: transactions.entityId,
      type: transactions.type,
      description: transactions.description,
      amount: transactions.amount,
      dueDate: transactions.dueDate,
      paymentDate: transactions.paymentDate,
      status: transactions.status,
      categoryId: transactions.categoryId,
      bankAccountId: transactions.bankAccountId,
      paymentMethodId: transactions.paymentMethodId,
      isRecurring: transactions.isRecurring,
      parentTransactionId: transactions.parentTransactionId,
      notes: transactions.notes,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
      categoryName: categories.name,
      categoryColor: categories.color,
      attachmentCount: sql<number>`(SELECT COUNT(*) FROM ${attachments} WHERE ${attachments.transactionId} = ${transactions.id})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .$dynamic();


  query = query.orderBy(desc(transactions.dueDate));

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const result = await query;
  
  if (options?.startDate || options?.endDate) {
    console.log("[getTransactionsByEntityId] Resultados:", {
      total: result.length,
      primeiraDueDate: result[result.length - 1]?.dueDate?.toISOString(),
      ultimaDueDate: result[0]?.dueDate?.toISOString(),
    });
  }
  
  return result;
}

export async function getTransactionById(transactionId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createTransaction(transaction: InsertTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(transactions).values(transaction).returning();
  return Number(result[0].id);
}

export async function updateTransaction(transactionId: number, data: Partial<InsertTransaction>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(transactions).set(data).where(eq(transactions.id, transactionId));
}

export async function deleteTransaction(transactionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(transactions).where(eq(transactions.id, transactionId));
}

/**
 * Deletar transação recorrente com opções de exclusão
 * @param transactionId - ID da transação a deletar
 * @param deleteMode - 'single' (apenas esta) ou 'all' (todas da recorrência)
 */
export async function deleteRecurringTransaction(
  transactionId: number,
  deleteMode: 'single' | 'all' = 'single'
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const transaction = await getTransactionById(transactionId);
  if (!transaction) throw new Error("Transaction not found");

  if (deleteMode === 'single') {
    // Deletar apenas esta transação
    await db.delete(transactions).where(eq(transactions.id, transactionId));
  } else if (deleteMode === 'all') {
    // Deletar todas as transações com a mesma descrição base (sem o número de parcela)
    // Extrai a descrição base removendo o padrão " (X/Y)"
    const descriptionBase = transaction.description.replace(/ \(\d+\/\d+\)$/, '');
    
    // Encontrar todas as transações com descrição similar (mesma entidade, tipo e descrição base)
    const allTransactions = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.entityId, transaction.entityId),
          eq(transactions.type, transaction.type),
          sql`${transactions.description} LIKE ${descriptionBase + '%'}`
        )
      );
    
    // Deletar todas as transações encontradas
    for (const trans of allTransactions) {
      await db.delete(transactions).where(eq(transactions.id, trans.id));
    }
  }
}



// ========== DASHBOARD METRICS ==========

export async function getDashboardMetrics(entityId: number) {
  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Get current balance (all paid transactions)
  const balanceResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE -amount END), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.entityId, entityId), eq(transactions.status, "PAID")));

  const currentBalance = Number(balanceResult[0]?.total) || 0;

  // Get month income
  const incomeResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(amount), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.entityId, entityId),
        eq(transactions.type, "INCOME"),
        eq(transactions.status, "PAID"),
        gte(transactions.dueDate, startOfMonth),
        lte(transactions.dueDate, endOfMonth)
      )
    );

  const monthIncome = Number(incomeResult[0]?.total) || 0;

  // Get month expenses
  const expenseResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(amount), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.entityId, entityId),
        eq(transactions.type, "EXPENSE"),
        eq(transactions.status, "PAID"),
        gte(transactions.dueDate, startOfMonth),
        lte(transactions.dueDate, endOfMonth)
      )
    );

  const monthExpenses = Number(expenseResult[0]?.total) || 0;

  // Get pending expenses
  const pendingResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(amount), 0)`,
    })
    .from(transactions)
    .where(
      and(eq(transactions.entityId, entityId), eq(transactions.type, "EXPENSE"), eq(transactions.status, "PENDING"))
    );

  const pendingExpenses = Number(pendingResult[0]?.total) || 0;

  return {
    currentBalance,
    monthIncome,
    monthExpenses,
    pendingExpenses,
  };
}

// ========== ATTACHMENT OPERATIONS ==========

export async function getAttachmentsByTransactionId(transactionId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(attachments).where(eq(attachments.transactionId, transactionId));
}

export async function createAttachment(attachment: InsertAttachment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(attachments).values(attachment).returning();
  return Number(result[0].id);
}

export async function deleteAttachment(attachmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(attachments).where(eq(attachments.id, attachmentId));
}

export async function updateAttachmentType(attachmentId: number, type: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(attachments).set({ type: type as any }).where(eq(attachments.id, attachmentId));
}

export async function getAttachmentById(attachmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(attachments).where(eq(attachments.id, attachmentId));
  return result[0] || null;
}

// ========== WHATSAPP MESSAGE OPERATIONS ==========

export async function createWhatsAppMessage(message: InsertWhatsAppMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(whatsappMessages).values(message).returning();
  return Number(result[0].id);
}

export async function getWhatsAppMessageById(messageId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(whatsappMessages).where(eq(whatsappMessages.messageId, messageId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateWhatsAppMessage(messageId: string, data: Partial<InsertWhatsAppMessage>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(whatsappMessages).set(data).where(eq(whatsappMessages.messageId, messageId));
}

// ========== BANK ACCOUNT OPERATIONS ==========

export async function getBankAccountsByEntityId(entityId: number, userId?: number) {
  const db = await getDb();
  if (!db) return [];

  // Return accounts that are either:
  // 1. Specific to this entity (entityId matches)
  // 2. Shared accounts (entityId is null) belonging to the user
  if (userId) {
    return await db
      .select()
      .from(bankAccounts)
      .where(
        or(
          eq(bankAccounts.entityId, entityId),
          and(isNull(bankAccounts.entityId), eq(bankAccounts.userId, userId))
        )
      )
      .orderBy(bankAccounts.name);
  }

  // Fallback: only entity-specific accounts
  return await db.select().from(bankAccounts).where(eq(bankAccounts.entityId, entityId)).orderBy(bankAccounts.name);
}

export async function getBankAccountById(accountId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createBankAccount(account: InsertBankAccount) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(bankAccounts).values(account).returning();
  return Number(result[0].id);
}

export async function updateBankAccount(accountId: number, data: Partial<InsertBankAccount>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(bankAccounts).set(data).where(eq(bankAccounts.id, accountId));
}

export async function deleteBankAccount(accountId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
}

// ========== PAYMENT METHOD OPERATIONS ==========

export async function getPaymentMethodsByEntityId(entityId: number, userId?: number) {
  const db = await getDb();
  if (!db) return [];

  // Return payment methods that are either:
  // 1. Specific to this entity (entityId matches)
  // 2. Shared methods (entityId is null) belonging to the user
  if (userId) {
    return await db
      .select()
      .from(paymentMethods)
      .where(
        or(
          eq(paymentMethods.entityId, entityId),
          and(isNull(paymentMethods.entityId), eq(paymentMethods.userId, userId))
        )
      )
      .orderBy(paymentMethods.name);
  }

  // Fallback: only entity-specific methods
  return await db.select().from(paymentMethods).where(eq(paymentMethods.entityId, entityId)).orderBy(paymentMethods.name);
}

export async function getPaymentMethodById(methodId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(paymentMethods).where(eq(paymentMethods.id, methodId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createPaymentMethod(method: InsertPaymentMethod) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(paymentMethods).values(method).returning();
  return Number(result[0].id);
}

export async function updatePaymentMethod(methodId: number, data: Partial<InsertPaymentMethod>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(paymentMethods).set(data).where(eq(paymentMethods.id, methodId));
}

export async function deletePaymentMethod(methodId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(paymentMethods).where(eq(paymentMethods.id, methodId));
}

// ========== DASHBOARD CHARTS ==========

export async function getCashFlowData(entityId: number, months: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    eq(transactions.entityId, entityId),
    sql`${transactions.dueDate} IS NOT NULL`
  ];

  if (startDate) {
    conditions.push(gte(transactions.dueDate, startDate));
  } else {
    conditions.push(gte(transactions.dueDate, sql`NOW() - INTERVAL '${sql.raw(months.toString())} months'`));
  }

  if (endDate) {
    conditions.push(lte(transactions.dueDate, endDate));
  }

  console.log('[getCashFlowData] entityId:', entityId, 'months:', months, 'startDate:', startDate, 'endDate:', endDate);

  const result = await db
    .select({
      month: sql<string>`TO_CHAR(${transactions.dueDate}, 'YYYY-MM')`,
      income: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'INCOME' AND ${transactions.status} = 'PAID' THEN ${transactions.amount} ELSE 0 END), 0)`,
      expense: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'EXPENSE' AND ${transactions.status} = 'PAID' THEN ${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(sql`TO_CHAR(${transactions.dueDate}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${transactions.dueDate}, 'YYYY-MM')`);

  console.log('[getCashFlowData] result:', result);

  return result.map((row) => ({
    month: row.month,
    income: Number(row.income),
    expense: Number(row.expense),
  }));
}

export async function getCategoryDistribution(entityId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const finalStartDate = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
  const finalEndDate = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const conditions = [
    eq(transactions.entityId, entityId),
    eq(transactions.type, "EXPENSE"),
    eq(transactions.status, "PAID"),
  ];

  // Aplicar filtro de datas corretamente
  if (startDate) {
    conditions.push(gte(transactions.dueDate, startDate));
  } else {
    conditions.push(gte(transactions.dueDate, finalStartDate));
  }
  
  if (endDate) {
    conditions.push(lte(transactions.dueDate, endDate));
  } else {
    conditions.push(lte(transactions.dueDate, finalEndDate));
  }

  const result = await db
    .select({
      name: categories.name,
      value: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
      color: categories.color,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .groupBy(categories.name, categories.color)
    .orderBy(sql`SUM(${transactions.amount}) DESC`);

  return result.map((row) => ({
    name: row.name,
    value: Number(row.value),
    color: row.color || "#6B7280",
  }));
}

export async function getCategoryExpensesByStatus(entityId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const finalStartDate = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
  const finalEndDate = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const conditions = [
    eq(transactions.entityId, entityId),
    eq(transactions.type, "EXPENSE"),
    sql`${transactions.dueDate} IS NOT NULL`
  ];

  // Aplicar filtro de datas corretamente
  if (startDate) {
    conditions.push(gte(transactions.dueDate, startDate));
  } else {
    conditions.push(gte(transactions.dueDate, finalStartDate));
  }
  
  if (endDate) {
    conditions.push(lte(transactions.dueDate, endDate));
  } else {
    conditions.push(lte(transactions.dueDate, finalEndDate));
  }

  const result = await db
    .select({
      categoryName: categories.name,
      categoryColor: categories.color,
      paid: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'PAID' THEN ${transactions.amount} ELSE 0 END), 0)`,
      pending: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'PENDING' AND DATE(${transactions.dueDate}) >= CURRENT_DATE THEN ${transactions.amount} ELSE 0 END), 0)`,
      overdue: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'OVERDUE' OR (${transactions.status} = 'PENDING' AND DATE(${transactions.dueDate}) < CURRENT_DATE) THEN ${transactions.amount} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .groupBy(categories.name, categories.color)
    .orderBy(sql`COALESCE(SUM(${transactions.amount}), 0) DESC`);

  return result.map((row) => ({
    categoryName: row.categoryName,
    categoryColor: row.categoryColor || "#6B7280",
    paid: Number(row.paid),
    pending: Number(row.pending),
    overdue: Number(row.overdue),
    total: Number(row.paid) + Number(row.pending) + Number(row.overdue),
  }));
}

export async function updateOverdueTransactions() {
  const db = await getDb();
  if (!db) return 0;

  await db
    .update(transactions)
    .set({ status: "OVERDUE" })
    .where(
      and(
        eq(transactions.status, "PENDING"),
        sql`DATE(${transactions.dueDate}) < CURRENT_DATE`
      )
    );

  // Drizzle não retorna rowCount, então retornamos sucesso
  return 1;
}

export async function getUpcomingTransactions(entityId: number, daysAhead: number = 7) {
  const db = await getDb();
  if (!db) return [];

  // Criar data em São Paulo (GMT-3)
  const today = new Date();
  const offset = 3 * 60 * 60 * 1000; // GMT-3 em milissegundos
  const localDate = new Date(today.getTime() - offset);
  localDate.setUTCHours(0, 0, 0, 0);
  const todayAtMidnight = new Date(localDate.getTime() + offset);
  
  const futureDate = new Date(todayAtMidnight);
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const result = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      amount: transactions.amount,
      dueDate: transactions.dueDate,
      status: transactions.status,
      type: transactions.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.entityId, entityId),
        eq(transactions.type, "EXPENSE"),
        or(
          eq(transactions.status, "PENDING"),
          eq(transactions.status, "OVERDUE")
        ),
        sql`DATE(${transactions.dueDate}) >= CURRENT_DATE`,
        sql`DATE(${transactions.dueDate}) <= CURRENT_DATE + INTERVAL '${sql.raw(daysAhead.toString())} days'`
      )
    )
    .orderBy(asc(transactions.dueDate));

  const mapped = result.map((row) => ({
    id: row.id,
    description: row.description,
    amount: row.amount,
    dueDate: row.dueDate,
    status: row.status,
    type: row.type,
    categoryId: row.categoryId,
    categoryName: row.categoryName || "Sem Categoria",
    categoryColor: row.categoryColor || "#6B7280",
    daysUntilDue: Math.ceil((row.dueDate!.getTime() - todayAtMidnight.getTime()) / (1000 * 60 * 60 * 24)),
  }));

  return mapped;
}

export async function getAttachmentsByEntityWithFilters(
  entityId: number,
  options?: {
    types?: string[];
    startDate?: Date;
    endDate?: Date;
  }
) {
  const db = await getDb();
  if (!db) return [];

  let query = db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      blobUrl: attachments.blobUrl,
      fileSize: attachments.fileSize,
      mimeType: attachments.mimeType,
      type: attachments.type,
      createdAt: attachments.createdAt,
      transactionId: attachments.transactionId,
      transactionDescription: transactions.description,
      transactionDueDate: transactions.dueDate,
    })
    .from(attachments)
    .innerJoin(transactions, eq(attachments.transactionId, transactions.id))
    .where(eq(transactions.entityId, entityId))
    .$dynamic();

  const conditions = [eq(transactions.entityId, entityId)];

  if (options?.types && options.types.length > 0) {
    conditions.push(
      or(...options.types.map((type) => eq(attachments.type, type as any)))!
    );
  }

  if (options?.startDate) {
    conditions.push(gte(transactions.dueDate, options.startDate));
  }

  if (options?.endDate) {
    conditions.push(lte(transactions.dueDate, options.endDate));
  }

  if (conditions.length > 1) {
    query = query.where(and(...conditions));
  }

  return await query.orderBy(asc(transactions.dueDate));
}


export async function updateEntitiesOrder(updates: { id: number; displayOrder: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const update of updates) {
    await db.update(entities)
      .set({ displayOrder: update.displayOrder })
      .where(eq(entities.id, update.id));
  }
}


// ============================================
// INVESTMENTS
// ============================================

/**
 * Get all investments for an entity
 */
export async function getInvestmentsByEntity(entityId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(investments)
    .where(eq(investments.entityId, entityId))
    .orderBy(desc(investments.currentAmount));
}

/**
 * Get investment by ID
 */
export async function getInvestmentById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(investments)
    .where(eq(investments.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Create new investment
 */
export async function createInvestment(data: InsertInvestment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .insert(investments)
    .values(data)
    .returning();

  return result[0];
}

/**
 * Update investment
 */
export async function updateInvestment(id: number, data: Partial<InsertInvestment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(investments)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(investments.id, id))
    .returning();

  return result[0];
}

/**
 * Delete investment
 */
export async function deleteInvestment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(investments)
    .where(eq(investments.id, id));
}

/**
 * Get investments summary for an entity
 */
export async function getInvestmentsSummary(entityId: number) {
  const db = await getDb();
  if (!db) return null;

  const allInvestments = await getInvestmentsByEntity(entityId);

  const totalInvested = allInvestments.reduce((sum, inv) => sum + (inv.initialAmount || 0), 0);
  const currentValue = allInvestments.reduce((sum, inv) => sum + (inv.currentAmount || inv.initialAmount || 0), 0);
  const totalProfitLoss = currentValue - totalInvested;
  const totalProfitLossPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 10000 : 0; // Em centésimos de %

  return {
    totalInvested,
    currentValue,
    totalProfitLoss,
    totalProfitLossPercent: Math.round(totalProfitLossPercent),
    count: allInvestments.length,
  };
}

/**
 * Get portfolio distribution by type
 */
export async function getPortfolioDistribution(entityId: number) {
  const db = await getDb();
  if (!db) return [];

  const allInvestments = await getInvestmentsByEntity(entityId);

  const distribution: Record<string, { type: string; amount: number; count: number }> = {};

  for (const inv of allInvestments) {
    const type = inv.type;
    const amount = inv.currentAmount || inv.initialAmount || 0;

    if (!distribution[type]) {
      distribution[type] = { type, amount: 0, count: 0 };
    }

    distribution[type].amount += amount;
    distribution[type].count += 1;
  }

  return Object.values(distribution).sort((a, b) => b.amount - a.amount);
}

// ============================================
// INVESTMENT HISTORY
// ============================================

/**
 * Get investment history
 */
export async function getInvestmentHistory(investmentId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await db
    .select()
    .from(investmentHistory)
    .where(
      and(
        eq(investmentHistory.investmentId, investmentId),
        gte(investmentHistory.date, startDate)
      )
    )
    .orderBy(asc(investmentHistory.date));
}

/**
 * Add investment history entry
 */
export async function addInvestmentHistory(data: InsertInvestmentHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if entry for this date already exists
  const existing = await db
    .select()
    .from(investmentHistory)
    .where(
      and(
        eq(investmentHistory.investmentId, data.investmentId),
        eq(investmentHistory.date, data.date)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing entry
    const result = await db
      .update(investmentHistory)
      .set(data)
      .where(eq(investmentHistory.id, existing[0].id))
      .returning();
    return result[0];
  } else {
    // Insert new entry
    const result = await db
      .insert(investmentHistory)
      .values(data)
      .returning();
    return result[0];
  }
}

// ============================================
// INVESTMENT TRANSACTIONS
// ============================================

/**
 * Get investment transactions
 */
export async function getInvestmentTransactions(investmentId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(investmentTransactions)
    .where(eq(investmentTransactions.investmentId, investmentId))
    .orderBy(desc(investmentTransactions.date));
}

/**
 * Add investment transaction
 */
export async function addInvestmentTransaction(data: InsertInvestmentTransaction) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .insert(investmentTransactions)
    .values(data)
    .returning();

  return result[0];
}


// Treasury Selic functions
export async function getTreasurySelicByEntity(entityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(treasurySelic)
    .where(eq(treasurySelic.entityId, entityId));
}

export async function createOrUpdateTreasurySelic(
  entityId: number,
  data: Omit<InsertTreasurySelic, "entityId">
) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  
  const existing = await database
    .select()
    .from(treasurySelic)
    .where(eq(treasurySelic.entityId, entityId));

  if (existing.length > 0) {
    return database
      .update(treasurySelic)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(treasurySelic.entityId, entityId))
      .returning();
  } else {
    return database
      .insert(treasurySelic)
      .values({
        entityId,
        ...data,
      })
      .returning();
  }
}

export async function updateTreasurySelicPrice(entityId: number, currentPrice: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .update(treasurySelic)
    .set({
      currentPrice,
      lastUpdated: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(treasurySelic.entityId, entityId))
    .returning();
}
