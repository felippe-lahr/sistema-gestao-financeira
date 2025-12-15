import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as exportUtils from "./export";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { treasurySelic } from "../drizzle/schema";
import { getDb } from "./db";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ========== ENTITIES ==========
  entities: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getEntitiesByUserId(ctx.user.id);
    }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const entity = await db.getEntityById(input.id);
      if (!entity) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
      }
      if (entity.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return entity;
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          description: z.string().optional(),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const entityId = await db.createEntity({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          color: input.color,
        });
        return { id: entityId };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          description: z.string().optional(),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.id);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await db.updateEntity(input.id, {
          name: input.name,
          description: input.description,
          color: input.color,
        });
        return { success: true };
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const entity = await db.getEntityById(input.id);
      if (!entity || entity.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await db.deleteEntity(input.id);
      return { success: true };
    }),

    updateOrder: protectedProcedure
      .input(
        z.array(
          z.object({
            id: z.number(),
            displayOrder: z.number(),
          })
        )
      )
      .mutation(async ({ input, ctx }) => {
        // Verify all entities belong to user
        for (const item of input) {
          const entity = await db.getEntityById(item.id);
          if (!entity || entity.userId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
        }
        // Update display order for all entities
        await db.updateEntitiesOrder(input);
        return { success: true };
      }),
  }),

  // ========== CATEGORIES ==========
  categories: router({
    listByEntity: protectedProcedure.input(z.object({ entityId: z.number() })).query(async ({ input, ctx }) => {
      const entity = await db.getEntityById(input.entityId);
      if (!entity || entity.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return await db.getCategoriesByEntityId(input.entityId, ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          name: z.string().min(1).max(255),
          type: z.enum(["INCOME", "EXPENSE"]),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          icon: z.string().max(50).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const categoryId = await db.createCategory({
          userId: ctx.user.id,
          entityId: input.entityId,
          name: input.name,
          type: input.type,
          color: input.color,
          icon: input.icon,
        });
        return { id: categoryId };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          icon: z.string().max(50).optional(),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateCategory(input.id, {
          name: input.name,
          color: input.color,
          icon: input.icon,
        });
        return { success: true };
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteCategory(input.id);
      return { success: true };
    }),
  }),

  // ========== BANK ACCOUNTS ==========
  bankAccounts: router({
    listByEntity: protectedProcedure.input(z.object({ entityId: z.number() })).query(async ({ input, ctx }) => {
      const entity = await db.getEntityById(input.entityId);
      if (!entity || entity.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return await db.getBankAccountsByEntityId(input.entityId, ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          name: z.string().min(1).max(255),
          bank: z.string().max(255).optional(),
          accountNumber: z.string().max(50).optional(),
          balance: z.number().optional(),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const balanceInCents = input.balance ? Math.round(input.balance * 100) : 0;

        const accountId = await db.createBankAccount({
          userId: ctx.user.id,
          entityId: input.entityId,
          name: input.name,
          bank: input.bank,
          accountNumber: input.accountNumber,
          balance: (input.balance || 0) * 100, // Convert to cents
          color: input.color,
        });
        return { id: accountId };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          bank: z.string().max(255).optional(),
          accountNumber: z.string().max(50).optional(),
          balance: z.number().optional(),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const updateData: any = {
          name: input.name,
          bank: input.bank,
          accountNumber: input.accountNumber,
          color: input.color,
          isActive: input.isActive,
        };

        if (input.balance !== undefined) {
          updateData.balance = Math.round(input.balance * 100);
        }

        await db.updateBankAccount(input.id, updateData);
        return { success: true };
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteBankAccount(input.id);
      return { success: true };
    }),
  }),

  // ========== PAYMENT METHODS ==========
  paymentMethods: router({
    listByEntity: protectedProcedure.input(z.object({ entityId: z.number() })).query(async ({ input, ctx }) => {
      const entity = await db.getEntityById(input.entityId);
      if (!entity || entity.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return await db.getPaymentMethodsByEntityId(input.entityId, ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          name: z.string().min(1).max(255),
          type: z.enum(["CREDIT_CARD", "DEBIT_CARD", "PIX", "CASH", "BANK_TRANSFER", "OTHER"]),
          transactionType: z.enum(["INCOME", "EXPENSE"]),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const methodId = await db.createPaymentMethod({
          userId: ctx.user.id,
          entityId: input.entityId,
          name: input.name,
          type: input.type,
          transactionType: input.transactionType,
          color: input.color,
        });
        return { id: methodId };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          type: z.enum(["CREDIT_CARD", "DEBIT_CARD", "PIX", "CASH", "BANK_TRANSFER", "OTHER"]).optional(),
          transactionType: z.enum(["INCOME", "EXPENSE"]).optional(),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await db.updatePaymentMethod(input.id, {
          name: input.name,
          type: input.type,
          transactionType: input.transactionType,
          color: input.color,
          isActive: input.isActive,
        });
        return { success: true };
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deletePaymentMethod(input.id);
      return { success: true };
    }),
  }),

  // ========== TRANSACTIONS ==========
  transactions: router({
    listByEntity: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          status: z.enum(["PENDING", "PAID", "OVERDUE"]).optional(),
          type: z.enum(["INCOME", "EXPENSE"]).optional(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await db.getTransactionsByEntityId(input.entityId, {
          startDate: input.startDate,
          endDate: input.endDate,
          status: input.status,
          type: input.type,
          limit: input.limit,
        });
      }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const transaction = await db.getTransactionById(input.id);
      if (!transaction) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      }
      const entity = await db.getEntityById(transaction.entityId);
      if (!entity || entity.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return transaction;
    }),

    create: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          type: z.enum(["INCOME", "EXPENSE"]),
          description: z.string().min(1),
          amount: z.number().positive(),
          dueDate: z.date(),
          paymentDate: z.date().optional(),
          status: z.enum(["PENDING", "PAID", "OVERDUE"]).optional(),
          categoryId: z.number().optional(),
          bankAccountId: z.number().optional(),
          paymentMethodId: z.number().optional(),
          isRecurring: z.boolean().optional(),
          recurrenceCount: z.number().positive().optional(),
          recurrenceFrequency: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        // Convert amount to cents
        const amountInCents = Math.round(input.amount * 100);

        // Se for recorrente, criar múltiplas transações
        if (input.isRecurring && input.recurrenceCount && input.recurrenceFrequency) {
          const count = input.recurrenceCount;
          const frequency = input.recurrenceFrequency;
          const transactionIds: number[] = [];
          let parentTransactionId: number | null = null;

          for (let i = 0; i < count; i++) {
            let newDueDate = new Date(input.dueDate);
            
            // Incrementar data conforme frequência
            switch (frequency) {
              case "DAY":
                newDueDate.setDate(newDueDate.getDate() + i);
                break;
              case "WEEK":
                newDueDate.setDate(newDueDate.getDate() + (i * 7));
                break;
              case "MONTH":
                newDueDate.setMonth(newDueDate.getMonth() + i);
                break;
              case "YEAR":
                newDueDate.setFullYear(newDueDate.getFullYear() + i);
                break;
            }

            const transactionId = await db.createTransaction({
              entityId: input.entityId,
              type: input.type,
              description: `${input.description} (${i + 1}/${count})`,
              amount: amountInCents,
              dueDate: newDueDate,
              paymentDate: input.paymentDate,
              status: input.status || "PENDING",
              categoryId: input.categoryId,
              bankAccountId: input.bankAccountId,
              paymentMethodId: input.paymentMethodId,
              isRecurring: false,
              recurrencePattern: null,
              parentTransactionId: parentTransactionId,
              notes: input.notes,
            });

            if (i === 0) {
              parentTransactionId = transactionId;
              await db.updateTransaction(transactionId, { parentTransactionId: transactionId });
            }

            transactionIds.push(transactionId);
          }

          return { id: transactionIds[0], count: transactionIds.length };
        }

        // Se não for recorrente, criar apenas uma transação
        const transactionId = await db.createTransaction({
          entityId: input.entityId,
          type: input.type,
          description: input.description,
          amount: amountInCents,
          dueDate: input.dueDate,
          paymentDate: input.paymentDate,
          status: input.status || "PENDING",
          categoryId: input.categoryId,
          bankAccountId: input.bankAccountId,
          paymentMethodId: input.paymentMethodId,
          isRecurring: false,
          recurrencePattern: null,
          notes: input.notes,
        });

        return { id: transactionId };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          type: z.enum(["INCOME", "EXPENSE"]).optional(),
          description: z.string().min(1).optional(),
          amount: z.number().positive().optional(),
          dueDate: z.date().optional(),
          paymentDate: z.date().optional(),
          status: z.enum(["PENDING", "PAID", "OVERDUE"]).optional(),
          categoryId: z.number().optional(),
          bankAccountId: z.number().optional(),
          paymentMethodId: z.number().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const transaction = await db.getTransactionById(input.id);
        if (!transaction) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        }
        const entity = await db.getEntityById(transaction.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const updateData: any = {
          type: input.type,
          description: input.description,
          dueDate: input.dueDate,
          paymentDate: input.paymentDate,
          status: input.status,
          categoryId: input.categoryId,
          bankAccountId: input.bankAccountId,
          paymentMethodId: input.paymentMethodId,
          notes: input.notes,
        };

        if (input.amount !== undefined) {
          updateData.amount = Math.round(input.amount * 100);
        }

        await db.updateTransaction(input.id, updateData);
        return { success: true };
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const transaction = await db.getTransactionById(input.id);
      if (!transaction) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      }
      const entity = await db.getEntityById(transaction.entityId);
      if (!entity || entity.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await db.deleteTransaction(input.id);
      return { success: true };
    }),

    deleteRecurring: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          deleteMode: z.enum(["single", "all"]).default("single"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const transaction = await db.getTransactionById(input.id);
        if (!transaction) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        }
        const entity = await db.getEntityById(transaction.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await db.deleteRecurringTransaction(input.id, input.deleteMode);
        return { success: true };
      }),
  }),

  // ========== DASHBOARD ==========
  dashboard: router({
    metrics: protectedProcedure.input(z.object({ entityId: z.number() })).query(async ({ input, ctx }) => {
      const entity = await db.getEntityById(input.entityId);
      if (!entity || entity.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const metrics = await db.getDashboardMetrics(input.entityId);
      if (!metrics) {
        return {
          currentBalance: 0,
          monthIncome: 0,
          monthExpenses: 0,
          pendingExpenses: 0,
        };
      }

      // Convert from cents to currency
      return {
        currentBalance: metrics.currentBalance / 100,
        monthIncome: metrics.monthIncome / 100,
        monthExpenses: metrics.monthExpenses / 100,
        pendingExpenses: metrics.pendingExpenses / 100,
      };
    }),

    cashFlow: protectedProcedure
      .input(z.object({ 
        entityId: z.number(), 
        months: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional()
      }))
      .query(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const months = input.months || 6;
        const cashFlowData = await db.getCashFlowData(input.entityId, months, input.startDate, input.endDate);
        
        // Convert amounts from cents
        return cashFlowData.map((item) => ({
          ...item,
          income: item.income / 100,
          expense: item.expense / 100,
        }));
      }),

    categoryDistribution: protectedProcedure
      .input(z.object({ 
        entityId: z.number(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const distribution = await db.getCategoryDistribution(input.entityId, input.startDate, input.endDate);
        
        // Convert amounts from cents
        return distribution.map((item) => ({
          ...item,
          value: item.value / 100,
        }));
      }),

    recentTransactions: protectedProcedure
      .input(z.object({ 
        entityId: z.number(), 
        limit: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const transactions = await db.getTransactionsByEntityId(input.entityId, {
          limit: input.limit || 10,
          startDate: input.startDate,
          endDate: input.endDate,
        });

        // Convert amounts from cents
        return transactions.map((t) => ({
          ...t,
          amount: t.amount / 100,
        }));
      }),

    upcomingTransactions: protectedProcedure
      .input(z.object({ 
        entityId: z.number(),
        daysAhead: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const transactions = await db.getUpcomingTransactions(
          input.entityId,
          input.daysAhead || 7
        );

        return transactions.map((t) => ({
          ...t,
          amount: t.amount / 100,
        }));
      }),

    categoryExpensesByStatus: protectedProcedure
      .input(z.object({ 
        entityId: z.number(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        const data = await db.getCategoryExpensesByStatus(input.entityId, input.startDate, input.endDate);
        
        // Convert amounts from cents
        return data.map((item) => ({
          ...item,
          paid: item.paid / 100,
          pending: item.pending / 100,
          overdue: item.overdue / 100,
          total: item.total / 100,
        }));
      }),
  }),

  // ========== EXPORTS ==========
  exports: router({
    exportTransactionsExcel: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          period: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        // Processar datas corretamente (formato YYYY-MM-DD vem do frontend)
        let startDate: Date | undefined;
        let endDate: Date | undefined;
        
        if (input.startDate) {
          const parts = input.startDate.split('-').map(Number);
          startDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
        }
        
        if (input.endDate) {
          const parts = input.endDate.split('-').map(Number);
          endDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
        }
        
        const transactions = await db.getTransactionsByEntityId(input.entityId, {
          startDate,
          endDate,
        });

        const summary = {
          totalIncome: transactions
            .filter((t) => t.type === "INCOME" && t.status === "PAID")
            .reduce((sum, t) => sum + t.amount, 0),
          totalExpenses: transactions
            .filter((t) => t.type === "EXPENSE" && t.status === "PAID")
            .reduce((sum, t) => sum + t.amount, 0),
        };

        const buffer = await exportUtils.generateTransactionsExcel({
          entityName: entity.name,
          transactions,
          summary,
          period: input.period,
        });

        return {
          data: buffer.toString("base64"),
          filename: `relatorio_${entity.name.replace(/\s+/g, "_")}_${Date.now()}.xlsx`,
        };
      }),

    exportTransactionsPDF: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          period: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          console.log("[PDF Export] Iniciando exportação para entityId:", input.entityId);
          
          const entity = await db.getEntityById(input.entityId);
          if (!entity || entity.userId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
          console.log("[PDF Export] Entidade encontrada:", entity.name);

          // Processar datas corretamente (formato YYYY-MM-DD vem do frontend)
          let startDate: Date | undefined;
          let endDate: Date | undefined;
          
          if (input.startDate) {
            const parts = input.startDate.split('-').map(Number);
            startDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
          }
          
          if (input.endDate) {
            const parts = input.endDate.split('-').map(Number);
            endDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
          }
          
          console.log("[PDF Export] Filtro de datas:", {
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
            inputStartDate: input.startDate,
            inputEndDate: input.endDate,
          });
          
          const transactions = await db.getTransactionsByEntityId(input.entityId, {
            startDate,
            endDate,
          });
          console.log("[PDF Export] Transações encontradas:", transactions.length);
          if (transactions.length > 0) {
            console.log("[PDF Export] Primeira transação:", {
              description: transactions[0].description,
              dueDate: transactions[0].dueDate,
            });
            console.log("[PDF Export] Última transação:", {
              description: transactions[transactions.length - 1].description,
              dueDate: transactions[transactions.length - 1].dueDate,
            });
          }

          const summary = {
            totalIncome: transactions
              .filter((t) => t.type === "INCOME" && t.status === "PAID")
              .reduce((sum, t) => sum + t.amount, 0),
            totalExpenses: transactions
              .filter((t) => t.type === "EXPENSE" && t.status === "PAID")
              .reduce((sum, t) => sum + t.amount, 0),
          };
          console.log("[PDF Export] Resumo calculado:", summary);

          // Buscar dados para gráficos
          const categoryExpenses = await db.getCategoryExpensesByStatus(
            input.entityId,
            startDate,
            endDate
          );
          console.log("[PDF Export] Despesas por categoria:", categoryExpenses.length);

          // Buscar transações a vencer (próximos 7 dias)
          const upcomingTransactions = await db.getUpcomingTransactions(input.entityId, 7);
          console.log("[PDF Export] Transações a vencer:", upcomingTransactions.length);

          // Preparar dados do gráfico de pizza
          const categoryData = categoryExpenses.map((cat) => ({
            name: cat.categoryName || "Sem Categoria",
            value: cat.total,
          }));
          console.log("[PDF Export] Dados do gráfico preparados:", categoryData.length);

          console.log("[PDF Export] Gerando PDF...");
          const buffer = await exportUtils.generateTransactionsPDF({
            entityName: entity.name,
            transactions,
            summary,
            period: input.period,
            startDate: input.startDate,
            endDate: input.endDate,
            categoryExpenses,
            categoryData,
            upcomingTransactions,
          });
          console.log("[PDF Export] PDF gerado com sucesso. Tamanho:", buffer.length, "bytes");

          return {
            data: buffer.toString("base64"),
            filename: `relatorio_${entity.name.replace(/\s+/g, "_")}_${Date.now()}.pdf`,
          };
        } catch (error) {
          console.error("[PDF Export] Erro ao exportar PDF:", error);
          throw new TRPCError({ 
            code: "INTERNAL_SERVER_ERROR", 
            message: `Erro ao gerar PDF: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
          });
        }
      }),

    exportAttachmentsZip: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          types: z.array(z.string()).optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          console.log("[ZIP Export] Iniciando exportação de anexos para entityId:", input.entityId);
          
          const entity = await db.getEntityById(input.entityId);
          if (!entity || entity.userId !== ctx.user.id) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
          console.log("[ZIP Export] Entidade encontrada:", entity.name);

          const attachments = await db.getAttachmentsByEntityWithFilters(input.entityId, {
            types: input.types,
            startDate: input.startDate ? new Date(input.startDate) : undefined,
            endDate: input.endDate ? new Date(input.endDate) : undefined,
          });
          console.log("[ZIP Export] Anexos encontrados:", attachments.length);

          if (attachments.length === 0) {
            throw new TRPCError({ 
              code: "NOT_FOUND", 
              message: "Nenhum anexo encontrado com os filtros selecionados" 
            });
          }

          if (attachments.length > 100) {
            throw new TRPCError({ 
              code: "BAD_REQUEST", 
              message: `Muitos anexos selecionados (${attachments.length}). Máximo: 100 arquivos` 
            });
          }

          console.log("[ZIP Export] Gerando ZIP...");
          const buffer = await exportUtils.generateAttachmentsZip({
            entityName: entity.name,
            attachments,
          });
          console.log("[ZIP Export] ZIP gerado com sucesso. Tamanho:", buffer.length, "bytes");

          return {
            data: buffer.toString("base64"),
            filename: `anexos_${entity.name.replace(/\s+/g, "_")}_${Date.now()}.zip`,
          };
        } catch (error) {
          console.error("[ZIP Export] Erro ao exportar anexos:", error);
          throw new TRPCError({ 
            code: "INTERNAL_SERVER_ERROR", 
            message: `Erro ao gerar ZIP: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
          });
        }
      }),
  }),

  // ========== ATTACHMENTS ==========
  attachments: router({
    listByTransaction: protectedProcedure
      .input(z.object({ transactionId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify transaction belongs to user
        const transaction = await db.getTransactionById(input.transactionId);
        if (!transaction) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        }
        const entity = await db.getEntityById(transaction.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await db.getAttachmentsByTransactionId(input.transactionId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          transactionId: z.number(),
          filename: z.string(),
          blobUrl: z.string(),
          fileSize: z.number(),
          mimeType: z.string(),
          type: z.enum(["NOTA_FISCAL", "DOCUMENTOS", "BOLETO", "COMPROVANTE_PAGAMENTO"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Verify transaction belongs to user
        const transaction = await db.getTransactionById(input.transactionId);
        if (!transaction) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        }
        const entity = await db.getEntityById(transaction.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const attachmentId = await db.createAttachment(input);
        return { id: attachmentId };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Verify attachment belongs to user
        const attachment = await db.getAttachmentById(input.id);
        if (!attachment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
        }
        const transaction = await db.getTransactionById(attachment.transactionId);
        if (!transaction) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        }
        const entity = await db.getEntityById(transaction.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await db.deleteAttachment(input.id);
        return { success: true };
      }),

    updateType: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          type: z.enum(["NOTA_FISCAL", "DOCUMENTOS", "BOLETO", "COMPROVANTE_PAGAMENTO"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Verify attachment belongs to user
        const attachment = await db.getAttachmentById(input.id);
        if (!attachment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
        }
        const transaction = await db.getTransactionById(attachment.transactionId);
        if (!transaction) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        }
        const entity = await db.getEntityById(transaction.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await db.updateAttachmentType(input.id, input.type);
        return { success: true };
      }),
  }),

  // ========== INVESTMENTS ==========
  investments: router({
    listByEntity: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify entity belongs to user
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await db.getInvestmentsByEntity(input.entityId);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const investment = await db.getInvestmentById(input.id);
        if (!investment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found" });
        }
        // Verify investment belongs to user
        const entity = await db.getEntityById(investment.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return investment;
      }),

    create: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          name: z.string(),
          type: z.enum(["ACAO", "FII", "TESOURO_DIRETO", "CDB", "LCI", "LCA", "FUNDO", "CRIPTO", "OUTRO"]),
          ticker: z.string().optional(),
          institution: z.string().optional(),
          initialAmount: z.number(),
          quantity: z.number().optional(),
          averagePrice: z.number().optional(),
          purchaseDate: z.string(),
          maturityDate: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        console.log('[investments.create] Input:', JSON.stringify(input, null, 2));
        
        try {
          console.log('[investments.create] Verificando entidade...');
          // Verify entity belongs to user
          const entity = await db.getEntityById(input.entityId);
          console.log('[investments.create] Entidade:', entity);
          
          if (!entity || entity.userId !== ctx.user.id) {
            console.log('[investments.create] ERRO: Acesso negado');
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }

          console.log('[investments.create] Criando investimento...');
          const investment = await db.createInvestment({
            ...input,
            userId: ctx.user.id,
            currentAmount: input.initialAmount,
            purchaseDate: new Date(input.purchaseDate),
            maturityDate: input.maturityDate ? new Date(input.maturityDate) : undefined,
          });
          
          console.log('[investments.create] Investimento criado:', investment);
          return investment;
        } catch (error) {
          console.error('[investments.create] ERRO:', error);
          throw error;
        }
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          ticker: z.string().optional(),
          institution: z.string().optional(),
          notes: z.string().optional(),
          autoUpdate: z.boolean().optional(),
          alertThreshold: z.number().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const investment = await db.getInvestmentById(id);
        if (!investment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found" });
        }
        // Verify investment belongs to user
        const entity = await db.getEntityById(investment.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await db.updateInvestment(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const investment = await db.getInvestmentById(input.id);
        if (!investment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found" });
        }
        // Verify investment belongs to user
        const entity = await db.getEntityById(investment.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await db.deleteInvestment(input.id);
        return { success: true };
      }),

    summary: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify entity belongs to user
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await db.getInvestmentsSummary(input.entityId);
      }),

    distribution: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify entity belongs to user
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await db.getPortfolioDistribution(input.entityId);
      }),

    history: protectedProcedure
      .input(z.object({ investmentId: z.number(), days: z.number().default(30) }))
      .query(async ({ input, ctx }) => {
        const investment = await db.getInvestmentById(input.investmentId);
        if (!investment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found" });
        }
        // Verify investment belongs to user
        const entity = await db.getEntityById(investment.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await db.getInvestmentHistory(input.investmentId, input.days);
      }),

    transactions: protectedProcedure
      .input(z.object({ investmentId: z.number() }))
      .query(async ({ input, ctx }) => {
        const investment = await db.getInvestmentById(input.investmentId);
        if (!investment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found" });
        }
        // Verify investment belongs to user
        const entity = await db.getEntityById(investment.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await db.getInvestmentTransactions(input.investmentId);
      }),

    addTransaction: protectedProcedure
      .input(
        z.object({
          investmentId: z.number(),
          type: z.enum(["BUY", "SELL", "DIVIDEND", "INTEREST", "FEE"]),
          date: z.string(),
          quantity: z.number().optional(),
          price: z.number().optional(),
          amount: z.number(),
          fees: z.number().default(0),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const investment = await db.getInvestmentById(input.investmentId);
        if (!investment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found" });
        }
        // Verify investment belongs to user
        const entity = await db.getEntityById(investment.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await db.addInvestmentTransaction({
          ...input,
          date: new Date(input.date),
        });
      }),

    updatePrice: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const investment = await db.getInvestmentById(input.id);
        if (!investment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found" });
        }
        // Verify investment belongs to user
        const entity = await db.getEntityById(investment.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        // Import scraper dynamically to avoid circular dependencies
        const scraper = await import("./services/investment-scraper");
        const result = await scraper.updateInvestmentPrice(input.id);

        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error || "Failed to update price",
          });
        }

        return result;
      }),

    updateAll: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Verify entity belongs to user
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        // Import scraper dynamically
        const scraper = await import("./services/investment-scraper");
        const results = await scraper.updateInvestmentsByEntity(input.entityId);

        return {
          total: results.length,
          success: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          results,
        };
      }),
  }),
  treasurySelic: router({
    getByEntity: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const result = await db.getTreasurySelicByEntity(input.entityId);
        return result && result.length > 0 ? result[0] : null;
      }),
    createOrUpdate: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          quantity: z.string(),
          initialPrice: z.number(),
          currentPrice: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const result = await db.createOrUpdateTreasurySelic(input.entityId, {
          quantity: input.quantity,
          initialPrice: input.initialPrice,
          currentPrice: input.currentPrice,
        });
        return result && result.length > 0 ? result[0] : null;
      }),
    updatePrice: protectedProcedure
      .input(z.object({ entityId: z.number(), currentPrice: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const result = await db.updateTreasurySelicPrice(input.entityId, input.currentPrice);
        return result && result.length > 0 ? result[0] : null;
      }),
    fetchLatestPrice: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        
        try {
          const { fetchTreasurySelicPrice } = await import("../services/treasury-selic-scraper");
          const currentPrice = await fetchTreasurySelicPrice();
          const result = await db.updateTreasurySelicPrice(input.entityId, currentPrice);
          
          return {
            success: true,
            currentPrice,
            updated: result && result.length > 0 ? result[0] : null,
          };
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Erro ao buscar preço: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
          });
        }
      }),
    delete: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity || entity.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        return database.delete(treasurySelic).where(eq(treasurySelic.entityId, input.entityId)).returning();
      }),
  }),
});

export type AppRouter = typeof appRouter;
