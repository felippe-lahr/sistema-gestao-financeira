import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { transactions, categories } from "../drizzle/schema";

/**
 * Get monthly expenses by category for a given entity and date range
 * Returns data structured for stacked bar chart visualization
 */
export async function getMonthlyCategoryExpenses(
  entityId: number, 
  startDate?: Date, 
  endDate?: Date,
  categoryId?: number
) {
  const db = await getDb();
  if (!db) return [];

  // Default to current year if no dates provided
  const now = new Date();
  const finalStartDate = startDate || new Date(now.getFullYear(), 0, 1); // Jan 1st
  const finalEndDate = endDate || new Date(now.getFullYear(), 11, 31); // Dec 31st

  const conditions = [
    eq(transactions.entityId, entityId),
    eq(transactions.type, "EXPENSE"),
    eq(transactions.status, "PAID"),
    sql`${transactions.dueDate} IS NOT NULL`,
    gte(transactions.dueDate, finalStartDate),
    lte(transactions.dueDate, finalEndDate),
  ];

  // Filter by specific category if provided
  if (categoryId) {
    conditions.push(eq(transactions.categoryId, categoryId));
  }

  const result = await db
    .select({
      month: sql<string>`TO_CHAR(${transactions.dueDate}, 'YYYY-MM')`,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      totalAmount: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...conditions))
    .groupBy(
      sql`TO_CHAR(${transactions.dueDate}, 'YYYY-MM')`,
      categories.id,
      categories.name,
      categories.color
    )
    .orderBy(
      sql`TO_CHAR(${transactions.dueDate}, 'YYYY-MM')`,
      sql`COALESCE(SUM(${transactions.amount}), 0) DESC`
    );

  return result.map((row) => ({
    month: row.month,
    categoryId: Number(row.categoryId),
    categoryName: row.categoryName,
    categoryColor: row.categoryColor || "#6B7280",
    totalAmount: Number(row.totalAmount),
  }));
}
