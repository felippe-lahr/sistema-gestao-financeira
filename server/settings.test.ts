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

describe("bank accounts and payment methods", () => {
  let testEntityId: number;

  beforeAll(async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a test entity first
    const entity = await caller.entities.create({
      name: "Test Entity for Settings",
      description: "Test entity",
    });
    testEntityId = entity.id;
  });

  describe("bank accounts", () => {
    it("should create a new bank account", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.bankAccounts.create({
        entityId: testEntityId,
        name: "Conta Corrente Principal",
        bank: "Banco do Brasil",
        accountNumber: "12345-6",
        balance: 1000.50,
        color: "#2563EB",
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
    });

    it("should list bank accounts for entity", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const accounts = await caller.bankAccounts.listByEntity({
        entityId: testEntityId,
      });

      expect(Array.isArray(accounts)).toBe(true);
      expect(accounts.length).toBeGreaterThan(0);
    });

    it("should store balance in cents", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.bankAccounts.create({
        entityId: testEntityId,
        name: "Test Balance Account",
        balance: 123.45,
      });

      const accounts = await caller.bankAccounts.listByEntity({
        entityId: testEntityId,
      });

      const account = accounts.find((a) => a.id === result.id);
      expect(account?.balance).toBe(12345); // 123.45 * 100
    });
  });

  describe("payment methods", () => {
    it("should create a new payment method", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.paymentMethods.create({
        entityId: testEntityId,
        name: "Cartão Itaú",
        type: "CREDIT_CARD",
        color: "#10B981",
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
    });

    it("should list payment methods for entity", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const methods = await caller.paymentMethods.listByEntity({
        entityId: testEntityId,
      });

      expect(Array.isArray(methods)).toBe(true);
      expect(methods.length).toBeGreaterThan(0);
    });

    it("should create PIX payment method", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.paymentMethods.create({
        entityId: testEntityId,
        name: "Pix Bradesco",
        type: "PIX",
      });

      const methods = await caller.paymentMethods.listByEntity({
        entityId: testEntityId,
      });

      const method = methods.find((m) => m.id === result.id);
      expect(method?.type).toBe("PIX");
    });
  });

  describe("categories with types", () => {
    it("should create income category", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.categories.create({
        entityId: testEntityId,
        name: "Salário",
        type: "INCOME",
        color: "#10B981",
      });

      expect(result).toHaveProperty("id");
    });

    it("should create expense category", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.categories.create({
        entityId: testEntityId,
        name: "Alimentação",
        type: "EXPENSE",
        color: "#EF4444",
      });

      expect(result).toHaveProperty("id");
    });

    it("should list categories with types", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);

      const categories = await caller.categories.listByEntity({
        entityId: testEntityId,
      });

      expect(Array.isArray(categories)).toBe(true);
      const hasIncome = categories.some((c) => c.type === "INCOME");
      const hasExpense = categories.some((c) => c.type === "EXPENSE");
      expect(hasIncome).toBe(true);
      expect(hasExpense).toBe(true);
    });
  });
});
