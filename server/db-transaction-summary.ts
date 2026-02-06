import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { transactions } from "../drizzle/schema";

/**
 * Get transaction summary totals for a given entity with filters
 * Returns total income, total expenses, and balance
 */
export async function getTransactionSummary(
  entityId: number,
  options?: {
    startDate?: Date;
    endDate?: Date;
    status?: "PENDING" | "PAID" | "OVERDUE";
    categoryId?: number;
  }
) {
  const db = await getDb();
  if (!db) {
    return {
      totalIncome: 0,
      totalExpenses: 0,
      balance: 0,
    };
  }

  const conditions = [eq(transactions.entityId, entityId)];

  if (options?.startDate) {
    conditions.push(gte(transactions.dueDate, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(transactions.dueDate, options.endDate));
  }
  if (options?.status) {
    conditions.push(eq(transactions.status, options.status));
  }
  if (options?.categoryId) {
    conditions.push(eq(transactions.categoryId, options.categoryId));
  }

  // Get total income
  const incomeResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(and(...conditions, eq(transactions.type, "INCOME")));

  // Get total expenses
  const expenseResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(and(...conditions, eq(transactions.type, "EXPENSE")));

  const totalIncome = Number(incomeResult[0]?.total || 0);
  const totalExpenses = Number(expenseResult[0]?.total || 0);
  const balance = totalIncome - totalExpenses;

  // Get breakdown by status for income
  const incomeByStatus = await db
    .select({
      status: transactions.status,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.entityId, entityId),
        eq(transactions.type, "INCOME"),
        options?.startDate ? gte(transactions.dueDate, options.startDate) : sql`true`,
        options?.endDate ? lte(transactions.dueDate, options.endDate) : sql`true`,
        options?.categoryId ? eq(transactions.categoryId, options.categoryId) : sql`true`
      )
    )
    .groupBy(transactions.status);

  // Get breakdown by status for expenses
  const expensesByStatus = await db
    .select({
      status: transactions.status,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.entityId, entityId),
        eq(transactions.type, "EXPENSE"),
        options?.startDate ? gte(transactions.dueDate, options.startDate) : sql`true`,
        options?.endDate ? lte(transactions.dueDate, options.endDate) : sql`true`,
        options?.categoryId ? eq(transactions.categoryId, options.categoryId) : sql`true`
      )
    )
    .groupBy(transactions.status);

  // Build breakdown objects
  const incomeBreakdown = {
    paid: Number(incomeByStatus.find(s => s.status === "PAID")?.total || 0),
    pending: Number(incomeByStatus.find(s => s.status === "PENDING")?.total || 0),
    overdue: Number(incomeByStatus.find(s => s.status === "OVERDUE")?.total || 0),
  };

  const expensesBreakdown = {
    paid: Number(expensesByStatus.find(s => s.status === "PAID")?.total || 0),
    pending: Number(expensesByStatus.find(s => s.status === "PENDING")?.total || 0),
    overdue: Number(expensesByStatus.find(s => s.status === "OVERDUE")?.total || 0),
  };

  return {
    totalIncome,
    totalExpenses,
    balance,
    incomeBreakdown,
    expensesBreakdown,
  };
}
