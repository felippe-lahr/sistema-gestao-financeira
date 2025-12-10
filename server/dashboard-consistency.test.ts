import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";

describe("Dashboard Consistency Tests", () => {
  let testEntityId: number;
  let userId: number = 1; // Test user ID

  beforeAll(async () => {
    // Create a test entity
    testEntityId = await db.createEntity({
      userId,
      name: "Test Entity for Dashboard Consistency",
      description: "Testing dashboard metrics consistency",
    });
  });

  afterAll(async () => {
    // Clean up test entity
    await db.deleteEntity(testEntityId);
  });

  it("should have consistent values between dashboard metrics and transaction list", async () => {
    // Create test transactions
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Create a paid income transaction in current month
    const incomeId = await db.createTransaction({
      entityId: testEntityId,
      type: "INCOME",
      description: "Test Income",
      amount: 10000,
      dueDate: new Date(now.getFullYear(), now.getMonth(), 15),
      paymentDate: new Date(now.getFullYear(), now.getMonth(), 15),
      status: "PAID",
      categoryId: null,
      bankAccountId: null,
      paymentMethodId: null,
      isRecurring: false,
      recurrencePattern: null,
      notes: "Test income transaction",
    });

    // Create a paid expense transaction in current month
    const expenseId = await db.createTransaction({
      entityId: testEntityId,
      type: "EXPENSE",
      description: "Test Expense",
      amount: 5000,
      dueDate: new Date(now.getFullYear(), now.getMonth(), 20),
      paymentDate: new Date(now.getFullYear(), now.getMonth(), 20),
      status: "PAID",
      categoryId: null,
      bankAccountId: null,
      paymentMethodId: null,
      isRecurring: false,
      recurrencePattern: null,
      notes: "Test expense transaction",
    });

    // Create a pending expense transaction
    const pendingId = await db.createTransaction({
      entityId: testEntityId,
      type: "EXPENSE",
      description: "Test Pending Expense",
      amount: 3000,
      dueDate: new Date(now.getFullYear(), now.getMonth(), 25),
      paymentDate: null,
      status: "PENDING",
      categoryId: null,
      bankAccountId: null,
      paymentMethodId: null,
      isRecurring: false,
      recurrencePattern: null,
      notes: "Test pending expense",
    });

    // Get dashboard metrics
    const metrics = await db.getDashboardMetrics(testEntityId);

    // Get transactions list
    const transactions = await db.getTransactionsByEntityId(testEntityId, {
      startDate: startOfMonth,
      endDate: endOfMonth,
    });

    // Verify that the created transactions appear in the list
    const createdTransactions = transactions.filter(
      (t) => t.id === incomeId || t.id === expenseId || t.id === pendingId
    );
    expect(createdTransactions.length).toBe(3);

    // Verify metrics exist
    expect(metrics).not.toBeNull();
    expect(metrics!.monthIncome).toBeGreaterThanOrEqual(10000);
    expect(metrics!.monthExpenses).toBeGreaterThanOrEqual(5000);
    expect(metrics!.pendingExpenses).toBeGreaterThanOrEqual(3000);

    // Clean up test transactions
    await db.deleteTransaction(incomeId);
    await db.deleteTransaction(expenseId);
    await db.deleteTransaction(pendingId);
  });

  it("should use dueDate for filtering, not paymentDate", async () => {
    // Create a transaction with dueDate in current month but paymentDate in next month
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);

    const transactionId = await db.createTransaction({
      entityId: testEntityId,
      type: "INCOME",
      description: "Test Transaction with Different Dates",
      amount: 5000,
      dueDate: new Date(now.getFullYear(), now.getMonth(), 10),
      paymentDate: nextMonth,
      status: "PAID",
      categoryId: null,
      bankAccountId: null,
      paymentMethodId: null,
      isRecurring: false,
      recurrencePattern: null,
      notes: "Testing date filtering",
    });

    // Get transactions with current month filter
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const transactions = await db.getTransactionsByEntityId(testEntityId, {
      startDate: startOfMonth,
      endDate: endOfMonth,
    });

    // The transaction should appear in the list because dueDate is in current month
    const foundInList = transactions.some((t) => t.id === transactionId);
    expect(foundInList).toBe(true);

    // Clean up
    await db.deleteTransaction(transactionId);
  });
});
