import { eq, or, and, isNull, desc, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
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

  return await db.select().from(entities).where(eq(entities.userId, userId)).orderBy(desc(entities.createdAt));
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

  const result = await db.insert(entities).values(entity);
  return Number(result[0].insertId);
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

  const result = await db.insert(categories).values(category);
  return Number(result[0].insertId);
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
      notes: transactions.notes,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.entityId, entityId))
    .$dynamic();

  if (options?.startDate) {
    query = query.where(gte(transactions.dueDate, options.startDate));
  }
  if (options?.endDate) {
    query = query.where(lte(transactions.dueDate, options.endDate));
  }
  if (options?.status) {
    query = query.where(eq(transactions.status, options.status));
  }
  if (options?.type) {
    query = query.where(eq(transactions.type, options.type));
  }

  query = query.orderBy(desc(transactions.dueDate));

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  return await query;
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

  const result = await db.insert(transactions).values(transaction);
  return Number(result[0].insertId);
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

export async function updateOverdueTransactions() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  await db
    .update(transactions)
    .set({ status: "OVERDUE" })
    .where(and(eq(transactions.status, "PENDING"), lte(transactions.dueDate, now)));
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
        gte(transactions.paymentDate, startOfMonth),
        lte(transactions.paymentDate, endOfMonth)
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
        gte(transactions.paymentDate, startOfMonth),
        lte(transactions.paymentDate, endOfMonth)
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

  const result = await db.insert(attachments).values(attachment);
  return Number(result[0].insertId);
}

export async function deleteAttachment(attachmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(attachments).where(eq(attachments.id, attachmentId));
}

// ========== WHATSAPP MESSAGE OPERATIONS ==========

export async function createWhatsAppMessage(message: InsertWhatsAppMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(whatsappMessages).values(message);
  return Number(result[0].insertId);
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

  const result = await db.insert(bankAccounts).values(account);
  return Number(result[0].insertId);
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

  const result = await db.insert(paymentMethods).values(method);
  return Number(result[0].insertId);
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
