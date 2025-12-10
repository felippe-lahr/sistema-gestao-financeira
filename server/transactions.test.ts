import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("transactions router", () => {
  let testEntityId: number;

  beforeAll(async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a test entity first
    const entity = await caller.entities.create({
      name: "Test Entity for Transactions",
      description: "Test entity",
    });
    testEntityId = entity.id;
  });

  it("should create a new expense transaction", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transactions.create({
      entityId: testEntityId,
      type: "EXPENSE",
      description: "Test expense",
      amount: 100.50,
      dueDate: new Date(),
      status: "PENDING",
    });

    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("number");
  });

  it("should create a new income transaction", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transactions.create({
      entityId: testEntityId,
      type: "INCOME",
      description: "Test income",
      amount: 500.00,
      dueDate: new Date(),
      status: "PAID",
      paymentDate: new Date(),
    });

    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("number");
  });

  it("should list transactions for entity", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const transactions = await caller.transactions.listByEntity({
      entityId: testEntityId,
    });

    expect(Array.isArray(transactions)).toBe(true);
    expect(transactions.length).toBeGreaterThan(0);
  });

  it("should convert amount to cents correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transactions.create({
      entityId: testEntityId,
      type: "EXPENSE",
      description: "Amount test",
      amount: 123.45,
      dueDate: new Date(),
    });

    const transaction = await caller.transactions.getById({ id: result.id });
    
    // Amount should be stored in cents (123.45 * 100 = 12345)
    // But returned as decimal (12345 / 100 = 123.45)
    expect(transaction.amount).toBe(12345);
  });

  it("should require authentication to create transaction", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {
        clearCookie: () => {},
      } as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.transactions.create({
        entityId: testEntityId,
        type: "EXPENSE",
        description: "Should fail",
        amount: 100,
        dueDate: new Date(),
      })
    ).rejects.toThrow();
  });
});
