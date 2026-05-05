import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as exportUtils from "./export";
import { getMonthlyCategoryExpenses } from "./db-monthly-category";
import { getTransactionSummary } from "./db-transaction-summary";
import { TRPCError } from "@trpc/server";
import { requireEntityAccess } from "./_core/entity-auth";
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
    // Onboarding
    completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
      await db.completeOnboarding(ctx.user.id);
      return { success: true };
    }),
    resetOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
      await db.resetOnboarding(ctx.user.id);
      return { success: true };
    }),
    getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
      const completed = await db.getOnboardingStatus(ctx.user.id);
      return { completed };
    }),
  }),

  // ========== ENTITIES ==========
  entities: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // Retorna entidades próprias + entidades compartilhadas em paralelo (sem N+1)
      const [ownedEntities, sharedEntities] = await Promise.all([
        db.getEntitiesByUserId(ctx.user.id),
        db.getSharedEntitiesForUser(ctx.user.id),
      ]);
      // Combinar: entidades próprias primeiro, depois compartilhadas
      return [
        ...ownedEntities.map(e => ({ ...e, sharedRole: null })),
        ...sharedEntities,
      ];
    }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const entity = await db.getEntityById(input.id);
      if (!entity) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
      }
      const role = await requireEntityAccess(input.id, ctx.user.id, "VIEWER");
      return { ...entity, myRole: role };
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
          temporaryRentalEnabled: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess(input.id, ctx.user.id, "OWNER");
        await db.updateEntity(input.id, {
          name: input.name,
          description: input.description,
          color: input.color,
          temporaryRentalEnabled: input.temporaryRentalEnabled,
        });
        return { success: true };
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      await requireEntityAccess(input.id, ctx.user.id, "OWNER");
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
          await requireEntityAccess(item.id, ctx.user.id, "OWNER");
        }
        // Update display order for all entities
        await db.updateEntitiesOrder(input);
        return { success: true };
      }),
  }),

  // ========== CATEGORIES ==========
  categories: router({
    listByEntity: protectedProcedure
      .input(z.object({ entityId: z.number(), includeInactive: z.boolean().optional() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        return await db.getCategoriesByEntityId(input.entityId, ctx.user.id, input.includeInactive ?? false);
      }),

    create: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          name: z.string().min(1).max(255),
          type: z.enum(["INCOME", "EXPENSE"]),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          icon: z.string().max(50).optional(),
          parentId: z.number().optional(), // Subcategoria: ID da categoria pai
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const categoryId = await db.createCategory({
          userId: ctx.user.id,
          entityId: input.entityId,
          name: input.name,
          type: input.type,
          color: input.color,
          icon: input.icon,
          parentId: input.parentId ?? null,
        });
        return { id: categoryId };
      }),

    listByEntities: protectedProcedure
      .input(
        z.object({
          entityIds: z.array(z.number()),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          status: z.enum(["PENDING", "PAID", "OVERDUE"]).optional(),
          type: z.enum(["INCOME", "EXPENSE"]).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        // Verify all entities belong to user
        for (const entityId of input.entityIds) {
          await requireEntityAccess(entityId, ctx.user.id, "VIEWER");
        }
        
        // Get transactions from all entities
        const allTransactions = [];
        for (const entityId of input.entityIds) {
          const transactions = await db.getTransactionsByEntityId(entityId, {
            startDate: input.startDate,
            endDate: input.endDate,
            status: input.status,
            type: input.type,
          });
          allTransactions.push(...transactions);
        }
        
        return allTransactions;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          icon: z.string().max(50).optional(),
          parentId: z.number().nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const category = await db.getCategoryById(input.id);
        if (!category || category.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await db.updateCategory(input.id, {
          name: input.name,
          color: input.color,
          icon: input.icon,
          parentId: input.parentId,
        });
        return { success: true };
      }),

    // Soft delete: desativa categoria (e subcategorias)
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const category = await db.getCategoryById(input.id);
      if (!category || category.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await db.deleteCategory(input.id);
      return { success: true };
    }),

    // Reativar categoria inativa
    reactivate: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const category = await db.getCategoryById(input.id);
      if (!category || category.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await db.updateCategory(input.id, { isActive: true });
      return { success: true };
    }),
  }),

  // ========== BANK ACCOUNTS ==========
  bankAccounts: router({
    listByEntity: protectedProcedure.input(z.object({ entityId: z.number() })).query(async ({ input, ctx }) => {
      await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

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
      .mutation(async ({ input, ctx }) => {
        const account = await db.getBankAccountById(input.id);
        if (!account || account.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
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

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const account = await db.getBankAccountById(input.id);
      if (!account || account.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await db.deleteBankAccount(input.id);
      return { success: true };
    }),
    // Retorna saldo atual por conta (saldo inicial + movimentações pagas)
    getBalanceSummary: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const accounts = await db.getBankAccountsByEntityId(input.entityId, ctx.user.id);
        const summaries = await Promise.all(
          accounts.map(async (acc) => {
            const metrics = await db.getDashboardMetrics(input.entityId, { bankAccountId: acc.id });
            return {
              id: acc.id,
              name: acc.name,
              bank: acc.bank,
              color: acc.color,
              isActive: acc.isActive,
              initialBalance: acc.balance / 100,
              currentBalance: metrics ? metrics.currentBalance / 100 : acc.balance / 100,
            };
          })
        );
        return summaries;
      }),
  }),

  // ========== PAYMENT METHODS ==========
  paymentMethods: router({
    listByEntity: protectedProcedure.input(z.object({ entityId: z.number() })).query(async ({ input, ctx }) => {
      await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

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
      .mutation(async ({ input, ctx }) => {
        const method = await db.getPaymentMethodById(input.id);
        if (!method || method.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await db.updatePaymentMethod(input.id, {
          name: input.name,
          type: input.type,
          transactionType: input.transactionType,
          color: input.color,
          isActive: input.isActive,
        });
        return { success: true };
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const method = await db.getPaymentMethodById(input.id);
      if (!method || method.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      await db.deletePaymentMethod(input.id);
      return { success: true };
    }),
  }),

  // ========== TRANSACTIONS ==========
  transactions: router({
    summary: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          status: z.enum(["PENDING", "PAID", "OVERDUE"]).optional(),
          categoryId: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        return await getTransactionSummary(input.entityId, {
          startDate: input.startDate,
          endDate: input.endDate,
          status: input.status,
          categoryId: input.categoryId,
        });
      }),

    listByEntity: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          startDate: z.date().optional(),
          endDate: z.date().optional(),
          status: z.enum(["PENDING", "PAID", "OVERDUE"]).optional(),
          type: z.enum(["INCOME", "EXPENSE"]).optional(),
          limit: z.number().optional(),
          bankAccountId: z.number().optional(),
          excludeCreditCard: z.boolean().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        return await db.getTransactionsByEntityId(input.entityId, {
          startDate: input.startDate,
          endDate: input.endDate,
          status: input.status,
          type: input.type,
          limit: input.limit,
          bankAccountId: input.bankAccountId,
          excludeCreditCard: input.excludeCreditCard,
        });
      }),

    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const transaction = await db.getTransactionById(input.id);
      if (!transaction) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      }
      await requireEntityAccess(transaction.entityId, ctx.user.id, "VIEWER");
      return transaction;
    }),

    create: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          type: z.enum(["INCOME", "EXPENSE"]),
          description: z.string().min(1),
          amount: z.number().nonnegative(),
          dueDate: z.date(),
          purchaseDate: z.date().optional(), // Data da compra (cartão de crédito)
          paymentDate: z.date().optional(),
          status: z.enum(["PENDING", "PAID", "OVERDUE"]).optional(),
          categoryId: z.number().optional(),
          bankAccountId: z.number().optional(),
          paymentMethodId: z.number().optional(),
          creditCardId: z.number().optional(), // Cartão de crédito
          installments: z.number().min(1).max(48).optional(), // Número de parcelas
          isRecurring: z.boolean().optional(),
          recurrenceCount: z.number().positive().optional(),
          recurrenceFrequency: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]).optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

        // Convert amount to cents
        const amountInCents = Math.round(input.amount * 100);

        // ── PARCELAMENTO NO CARTÃO DE CRÉDITO ──────────────────────────────────
        // Quando creditCardId + installments > 1: criar N parcelas
        // Cada parcela tem Data de Efetivação (dueDate) avançando 1 mês
        // A Data do Evento (purchaseDate) é a mesma para todas as parcelas
        if (input.creditCardId && input.installments && input.installments > 1) {
          const count = input.installments;
          const installmentAmount = Math.round(amountInCents / count);
          const transactionIds: number[] = [];
          let parentTransactionId: number | null = null;

          for (let i = 0; i < count; i++) {
            // Data de Efetivação: avança 1 mês por parcela
            const dueDate = new Date(input.dueDate);
            dueDate.setMonth(dueDate.getMonth() + i);

            const transactionId = await db.createTransaction({
              entityId: input.entityId,
              type: input.type,
              description: `${input.description} - Parcela ${i + 1}/${count}`,
              amount: installmentAmount,
              dueDate,
              purchaseDate: input.purchaseDate || undefined,
              paymentDate: undefined,
              status: "PENDING",
              categoryId: input.categoryId,
              bankAccountId: undefined, // cartão não usa conta bancária
              paymentMethodId: input.paymentMethodId,
              isRecurring: false,
              recurrencePattern: null,
              parentTransactionId: parentTransactionId,
              notes: input.notes,
            } as any);

            // Salvar creditCardId via SQL raw
            const dbInstance = await getDb();
            if (dbInstance) {
              const { sql: sqlTag } = await import("drizzle-orm");
              await dbInstance.execute(
                sqlTag`UPDATE transactions SET "creditCardId" = ${input.creditCardId} WHERE id = ${transactionId}`
              );
            }

            if (i === 0) {
              parentTransactionId = transactionId;
              await db.updateTransaction(transactionId, { parentTransactionId: transactionId });
            }
            transactionIds.push(transactionId);
          }

          const createdTransactions = [];
          for (const tid of transactionIds) {
            const t = await db.getTransactionById(tid);
            if (t) createdTransactions.push(t);
          }
          return { id: transactionIds[0], count: transactionIds.length, transactions: createdTransactions };
        }

        // ── RECORRÊNCIA NORMAL ─────────────────────────────────────────────────
        if (input.isRecurring && input.recurrenceCount && input.recurrenceFrequency) {
          const count = input.recurrenceCount;
          const frequency = input.recurrenceFrequency;
          const transactionIds: number[] = [];
          let parentTransactionId: number | null = null;

          for (let i = 0; i < count; i++) {
            let newDueDate = new Date(input.dueDate);
            switch (frequency) {
              case "DAY": newDueDate.setDate(newDueDate.getDate() + i); break;
              case "WEEK": newDueDate.setDate(newDueDate.getDate() + (i * 7)); break;
              case "MONTH": newDueDate.setMonth(newDueDate.getMonth() + i); break;
              case "YEAR": newDueDate.setFullYear(newDueDate.getFullYear() + i); break;
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

          const createdTransactions = [];
          for (const tid of transactionIds) {
            const t = await db.getTransactionById(tid);
            if (t) createdTransactions.push(t);
          }
          return { id: transactionIds[0], count: transactionIds.length, transactions: createdTransactions };
        }

        // ── TRANSAÇÃO ÚNICA ────────────────────────────────────────────────────
        const transactionId = await db.createTransaction({
          entityId: input.entityId,
          type: input.type,
          description: input.description,
          amount: amountInCents,
          dueDate: input.dueDate,
          purchaseDate: input.purchaseDate || undefined,
          paymentDate: input.paymentDate,
          status: input.status || "PENDING",
          categoryId: input.categoryId,
          bankAccountId: input.creditCardId ? undefined : input.bankAccountId,
          paymentMethodId: input.paymentMethodId,
          isRecurring: false,
          recurrencePattern: null,
          notes: input.notes,
          ...(input.creditCardId ? { creditCardId: input.creditCardId } : {}),
        } as any);

        // Salvar creditCardId via SQL raw se fornecido
        if (input.creditCardId) {
          const dbInstance = await getDb();
          if (dbInstance) {
            const { sql: sqlTag } = await import("drizzle-orm");
            await dbInstance.execute(
              sqlTag`UPDATE transactions SET "creditCardId" = ${input.creditCardId} WHERE id = ${transactionId}`
            );
          }
        }

        return { id: transactionId };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          type: z.enum(["INCOME", "EXPENSE"]).optional(),
          description: z.string().min(1).optional(),
          amount: z.number().nonnegative().optional(),
          dueDate: z.date().optional(),
          paymentDate: z.date().optional(),
          status: z.enum(["PENDING", "PAID", "OVERDUE"]).optional(),
          categoryId: z.number().optional(),
          bankAccountId: z.number().optional(),
          paymentMethodId: z.number().optional(),
          creditCardId: z.number().optional(),
          notes: z.string().optional(),
          isRecurring: z.boolean().optional(),
          recurrenceCount: z.number().positive().optional(),
          recurrenceFrequency: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const transaction = await db.getTransactionById(input.id);
        if (!transaction) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
        }
        await requireEntityAccess(transaction.entityId, ctx.user.id, "EDITOR");

        const updateData: any = {
          type: input.type,
          description: input.description,
          dueDate: input.dueDate,
          paymentDate: input.paymentDate,
          status: input.status,
          categoryId: input.categoryId,
          bankAccountId: input.bankAccountId,
          paymentMethodId: input.paymentMethodId,
          creditCardId: input.creditCardId,
          notes: input.notes,
        };

        if (input.amount !== undefined) {
          updateData.amount = Math.round(input.amount * 100);
        }

        // Se marcou como recorrente e tem count/frequency, criar parcelas futuras
        if (input.isRecurring && input.recurrenceCount && input.recurrenceFrequency && input.recurrenceCount > 1) {
          // Atualizar a transação original como parent da recorrência
          updateData.isRecurring = false;
          updateData.parentTransactionId = input.id;
          await db.updateTransaction(input.id, updateData);

          const count = input.recurrenceCount;
          const frequency = input.recurrenceFrequency;
          const baseDate = input.dueDate || transaction.dueDate;
          const baseDescription = input.description || transaction.description;
          const baseAmount = input.amount !== undefined ? Math.round(input.amount * 100) : transaction.amount;
          const baseType = input.type || transaction.type;

          // Atualizar descrição da transação original com numeração
          await db.updateTransaction(input.id, { description: `${baseDescription} (1/${count})` });

          // Criar parcelas futuras (a partir de i=1, pois i=0 é a original)
          for (let i = 1; i < count; i++) {
            let newDueDate = new Date(baseDate);
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
            await db.createTransaction({
              entityId: transaction.entityId,
              type: baseType,
              description: `${baseDescription} (${i + 1}/${count})`,
              amount: baseAmount,
              dueDate: newDueDate,
              paymentDate: undefined,
              status: "PENDING",
              categoryId: input.categoryId || transaction.categoryId,
              bankAccountId: input.bankAccountId || transaction.bankAccountId,
              paymentMethodId: input.paymentMethodId || transaction.paymentMethodId,
              isRecurring: false,
              recurrencePattern: null,
              parentTransactionId: input.id,
              notes: input.notes || transaction.notes,
            });
          }
          return { success: true };
        }

        await db.updateTransaction(input.id, updateData);
        
        // Se o status foi alterado para PAID, marcar tarefas relacionadas como concluídas
        if (input.status === "PAID") {
          const relatedTasks = await db.getTasksByTransactionId(input.id);
          for (const task of relatedTasks) {
            if (task.status !== "COMPLETED") {
              await db.updateTask(task.id, { status: "COMPLETED" });
            }
          }
        }
        
        return { success: true };
      }),

    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const transaction = await db.getTransactionById(input.id);
      if (!transaction) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      }
      await requireEntityAccess(transaction.entityId, ctx.user.id, "EDITOR");
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
        await requireEntityAccess(transaction.entityId, ctx.user.id, "ADMIN");
        await db.deleteRecurringTransaction(input.id, input.deleteMode);
        return { success: true };
      }),
  }),

  // ========== DASHBOARD ==========
  dashboard: router({
    // Endpoint de diagnóstico para investigar cálculo do Saldo Atual
    balanceDiagnostic: protectedProcedure.input(z.object({ entityId: z.number() })).query(async ({ input, ctx }) => {
      await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

      try {
        const diagnostic = await db.getBalanceDiagnostic(input.entityId);
        if (!diagnostic) {
          // Retornar estrutura vazia se não houver dados
          return {
            summary: {
              totalIncomeCount: 0,
              totalIncomeAmount: 0,
              totalExpenseCount: 0,
              totalExpenseAmount: 0,
              calculatedBalance: 0,
            },
            paidIncomeTransactions: [],
            paidExpenseTransactions: [],
          };
        }
        return diagnostic;
      } catch (error) {
        console.error('[balanceDiagnostic] Error:', error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load diagnostic" });
      }
    }),

    metrics: protectedProcedure.input(z.object({ 
      entityId: z.number(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      bankAccountId: z.number().optional(),
    })).query(async ({ input, ctx }) => {
      await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

      const metrics = await db.getDashboardMetrics(input.entityId, {
        startDate: input.startDate,
        endDate: input.endDate,
        bankAccountId: input.bankAccountId,
      });
      if (!metrics) {
        return {
          currentBalance: 0,
          periodBalance: 0,
          monthIncome: 0,
          monthExpenses: 0,
          pendingExpenses: 0,
          periodPendingExpenses: 0,
        };
      }

      // Convert from cents to currency
      return {
        currentBalance: metrics.currentBalance / 100,
        periodBalance: metrics.periodBalance / 100,
        monthIncome: metrics.monthIncome / 100,
        monthExpenses: metrics.monthExpenses / 100,
        pendingExpenses: metrics.pendingExpenses / 100,
        periodPendingExpenses: metrics.periodPendingExpenses / 100,
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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

        const distribution = await db.getCategoryDistribution(input.entityId, input.startDate, input.endDate);
        
        // Convert amounts from cents
        return distribution.map((item) => ({
          ...item,
          value: item.value / 100,
        }));
      }),

    monthlyCategoryExpenses: protectedProcedure
      .input(z.object({ 
        entityId: z.number(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        categoryId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

        const data = await getMonthlyCategoryExpenses(
          input.entityId, 
          input.startDate, 
          input.endDate,
          input.categoryId
        );
        
        // Convert amounts from cents
        return data.map((item) => ({
          ...item,
          totalAmount: item.totalAmount / 100,
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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

        const transactions = await db.getUpcomingTransactions(
          input.entityId,
          input.daysAhead || 7
        );

        return transactions.map((t) => ({
          ...t,
          amount: t.amount / 100,
        }));
      }),

    upcomingIncomeTransactions: protectedProcedure
      .input(z.object({ 
        entityId: z.number(),
        daysAhead: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

        const transactions = await db.getUpcomingIncomeTransactions(
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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

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
         await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const entity = await db.getEntityById(input.entityId);
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
          entityName: entity?.name ?? "",
          transactions,
          summary,
          period: input.period,
        });

        return {
          data: buffer.toString("base64"),
          filename: `relatorio_${(entity?.name ?? "entidade").replace(/\s+/g, "_")}_${Date.now()}.xlsx`,
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
          
          await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
          const entity = await db.getEntityById(input.entityId);
          console.log("[PDF Export] Entidade encontrada:", entity?.name);

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

          // Buscar receitas a receber (próximos 7 dias)
          const upcomingIncomeTransactions = await db.getUpcomingIncomeTransactions(input.entityId, 7);
          console.log("[PDF Export] Receitas a receber:", upcomingIncomeTransactions.length);

          // Preparar dados do gráfico de pizza
          const categoryData = categoryExpenses.map((cat) => ({
            name: cat.categoryName || "Sem Categoria",
            value: cat.total,
          }));
          console.log("[PDF Export] Dados do gráfico preparados:", categoryData.length);

          console.log("[PDF Export] Gerando PDF...");
          const buffer = await exportUtils.generateTransactionsPDF({
            entityName: entity?.name ?? "",
            transactions,
            summary,
            period: input.period,
            startDate: input.startDate,
            endDate: input.endDate,
            categoryExpenses,
            categoryData,
            upcomingTransactions,
            upcomingIncomeTransactions,
          });
          console.log("[PDF Export] PDF gerado com sucesso. Tamanho:", buffer.length, "bytes");

          return {
            data: buffer.toString("base64"),
            filename: `relatorio_${(entity?.name ?? "entidade").replace(/\s+/g, "_")}_${Date.now()}.pdf`,
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
          
          await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
          const entity = await db.getEntityById(input.entityId);
          console.log("[ZIP Export] Entidade encontrada:", entity?.name);

          // Converter datas corretamente (formato YYYY-MM-DD)
          // Usar UTC para consistência com como as transações são salvas
          let startDate: Date | undefined;
          let endDate: Date | undefined;
          
          if (input.startDate) {
            // Criar data no início do dia em UTC
            startDate = new Date(input.startDate + "T00:00:00.000Z");
            console.log("[ZIP Export] Data inicial:", input.startDate, "->", startDate.toISOString());
          }
          
          if (input.endDate) {
            // Criar data no final do dia em UTC
            endDate = new Date(input.endDate + "T23:59:59.999Z");
            console.log("[ZIP Export] Data final:", input.endDate, "->", endDate.toISOString());
          }
          
          console.log("[ZIP Export] Tipos selecionados:", input.types);
          
          const attachments = await db.getAttachmentsByEntityWithFilters(input.entityId, {
            types: input.types,
            startDate,
            endDate,
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
            entityName: entity?.name ?? "",
            attachments,
          });
          console.log("[ZIP Export] ZIP gerado com sucesso. Tamanho:", buffer.length, "bytes");

          return {
            data: buffer.toString("base64"),
            filename: `anexos_${(entity?.name ?? "entidade").replace(/\s+/g, "_")}_${Date.now()}.zip`,
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
        await requireEntityAccess(transaction.entityId, ctx.user.id, "VIEWER");
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
        await requireEntityAccess(transaction.entityId, ctx.user.id, "EDITOR");
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
        await requireEntityAccess(transaction.entityId, ctx.user.id, "ADMIN");
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
        await requireEntityAccess(transaction.entityId, ctx.user.id, "EDITOR");
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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
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
        await requireEntityAccess(investment.entityId, ctx.user.id, "VIEWER");
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
          // Verify entity access (RBAC)
          await requireEntityAccess(input.entityId, ctx.user.id, "EDITOR");

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
        await requireEntityAccess(investment.entityId, ctx.user.id, "EDITOR");
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
        await requireEntityAccess(investment.entityId, ctx.user.id, "ADMIN");
        await db.deleteInvestment(input.id);
        return { success: true };
      }),

    summary: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify entity belongs to user
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        return await db.getInvestmentsSummary(input.entityId);
      }),

    distribution: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify entity belongs to user
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
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
        await requireEntityAccess(investment.entityId, ctx.user.id, "VIEWER");
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
        await requireEntityAccess(investment.entityId, ctx.user.id, "VIEWER");
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
        await requireEntityAccess(investment.entityId, ctx.user.id, "EDITOR");
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
        await requireEntityAccess(investment.entityId, ctx.user.id, "ADMIN");

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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");

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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const result = await db.updateTreasurySelicPrice(input.entityId, input.currentPrice);
        return result && result.length > 0 ? result[0] : null;
      }),
    fetchLatestPrice: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        
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
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const database = await getDb();
        if (!database) throw new Error("Database not available");
        return database.delete(treasurySelic).where(eq(treasurySelic.entityId, input.entityId)).returning();
      }),
  }),
  treasuryDirect: router({
    /**
     * Busca todos os títulos do cache (instantâneo)
     */
    getAllTitles: publicProcedure.query(async () => {
      try {
        const { getTreasuryDirectTitlesFromCache } = await import("./db-treasury-direct");
        const titles = await getTreasuryDirectTitlesFromCache();
        return titles;
      } catch (error) {
        console.error("[treasuryDirect.getAllTitles] Erro:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao buscar títulos",
        });
      }
    }),

    /**
     * Busca títulos de uma categoria específica do cache
     */
    getTitlesByCategory: publicProcedure
      .input(z.object({ category: z.enum(["SELIC", "IPCA", "EDUCAC", "RENDA", "PREFIXADO"]) }))
      .query(async ({ input }) => {
        try {
          const { getTreasuryDirectTitlesByCategoryFromCache } = await import("./db-treasury-direct");
          const titles = await getTreasuryDirectTitlesByCategoryFromCache(input.category);
          return titles;
        } catch (error) {
          console.error("[treasuryDirect.getTitlesByCategory] Erro:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Erro ao buscar títulos da categoria",
          });
        }
      }),

    /**
     * Atualiza o cache com novos títulos (chamado quando usuário clica "Atualizar")
     */
    refreshCache: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        const { fetchTreasuryDirectTitles } = await import("./services/treasury-direct-scraper");
        const { updateTreasuryDirectTitlesCache } = await import("./db-treasury-direct");
        
        console.log("[treasuryDirect.refreshCache] Iniciando atualização de cache...");
        const titles = await fetchTreasuryDirectTitles();
        const count = await updateTreasuryDirectTitlesCache(titles);
        
        console.log(`[treasuryDirect.refreshCache] ✓ Cache atualizado com ${count} títulos`);
        return { success: true, count };
      } catch (error) {
        console.error("[treasuryDirect.refreshCache] Erro:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao atualizar cache de títulos",
        });
      }
    }),
  }),

  // ========== RENTALS ==========
  rentals: router({
    list: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const { getRentalsByEntityId } = await import("./db-rentals");
        return await getRentalsByEntityId(input.entityId);
      }),

    getConfig: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const { getRentalConfigByEntityId } = await import("./db-rentals");
        return await getRentalConfigByEntityId(input.entityId);
      }),

    create: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          startDate: z.string(),
          endDate: z.string(),
          source: z.enum(["AIRBNB", "DIRECT", "BLOCKED"]),
          guestName: z.string().optional(),
          guestEmail: z.string().optional(),
          guestPhone: z.string().optional(),
          numberOfGuests: z.number().optional(),
          dailyRate: z.number().optional(),
          totalAmount: z.number().optional(),
          extraFeeType: z.string().optional(),
          extraFeeAmount: z.number().optional(),
          checkInTime: z.string().optional(),
          checkOutTime: z.string().optional(),
          notes: z.string().optional(),
          specialRequests: z.string().optional(),
          competencyDate: z.enum(["CHECK_IN", "CHECK_OUT"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "EDITOR");
        const { createRental } = await import("./db-rentals");
        return await createRental({
          ...input,
          userId: ctx.user.id,
        });
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          source: z.enum(["AIRBNB", "DIRECT", "BLOCKED"]).optional(),
          guestName: z.string().optional(),
          guestEmail: z.string().optional(),
          guestPhone: z.string().optional(),
          numberOfGuests: z.number().optional(),
          dailyRate: z.number().optional(),
          totalAmount: z.number().optional(),
          extraFeeType: z.string().optional(),
          extraFeeAmount: z.number().optional(),
          checkInTime: z.string().optional(),
          checkOutTime: z.string().optional(),
          notes: z.string().optional(),
          specialRequests: z.string().optional(),
          competencyDate: z.enum(["CHECK_IN", "CHECK_OUT"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getRentalById, updateRental } = await import("./db-rentals");
        const rental = await getRentalById(input.id);
        if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        await requireEntityAccess(rental.entityId, ctx.user.id, "EDITOR");
        return await updateRental(input.id, input);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getRentalById, deleteRental } = await import("./db-rentals");
        const rental = await getRentalById(input.id);
        if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        await requireEntityAccess(rental.entityId, ctx.user.id, "ADMIN");
        return await deleteRental(input.id);
      }),
  }),

  rentalAttachments: router({
    create: protectedProcedure
      .input(
        z.object({
          rentalId: z.number(),
          filename: z.string(),
          blobUrl: z.string(),
          fileSize: z.number(),
          mimeType: z.string(),
          type: z.enum(["NOTA_FISCAL", "DOCUMENTOS", "BOLETO", "COMPROVANTE_PAGAMENTO"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(input.rentalId);
        if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        await requireEntityAccess(rental.entityId, ctx.user.id, "ADMIN");
        const dbInstance = await getDb();
        if (!dbInstance) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        }
        const { rentalAttachments } = await import("../drizzle/schema");
        const result = await dbInstance
          .insert(rentalAttachments)
          .values(input)
          .returning();
        return result[0];
      }),

    listByRental: protectedProcedure
      .input(z.object({ rentalId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(input.rentalId);
        if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        await requireEntityAccess(rental.entityId, ctx.user.id, "EDITOR");
        const dbInstance = await getDb();
        if (!dbInstance) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        }
        const { rentalAttachments } = await import("../drizzle/schema");
        return await dbInstance
          .select()
          .from(rentalAttachments)
          .where(eq(rentalAttachments.rentalId, input.rentalId));
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const dbInstance = await getDb();
        if (!dbInstance) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        }
        const { rentalAttachments } = await import("../drizzle/schema");
        const [attachment] = await dbInstance
          .select()
          .from(rentalAttachments)
          .where(eq(rentalAttachments.id, input.id));
        if (!attachment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
        }
        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(attachment.rentalId);
        if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        await requireEntityAccess(rental.entityId, ctx.user.id, "ADMIN");
        await dbInstance.delete(rentalAttachments).where(eq(rentalAttachments.id, input.id));
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
        const dbInstance = await getDb();
        if (!dbInstance) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        }
        const { rentalAttachments } = await import("../drizzle/schema");
        const [attachment] = await dbInstance
          .select()
          .from(rentalAttachments)
          .where(eq(rentalAttachments.id, input.id));
        if (!attachment) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
        }
        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(attachment.rentalId);
        if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        await requireEntityAccess(rental.entityId, ctx.user.id, "EDITOR");
        const result = await dbInstance
          .update(rentalAttachments)
          .set({ type: input.type })
          .where(eq(rentalAttachments.id, input.id))
          .returning();
        return result[0];
      }),
   }),

  // ========== TASKS ==========
  tasks: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getTasksByUserId(ctx.user.id);
    }),

    listByEntity: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        return await db.getTasksByEntityId(input.entityId);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const task = await db.getTaskById(input.id);
        if (!task) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
        }
        if (task.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return task;
      }),

    create: protectedProcedure
      .input(
        z.object({
          entityId: z.number().optional(),
          transactionId: z.number().optional(),
          title: z.string().min(1).max(255),
          description: z.string().optional(),
          dueDate: z.date(),
          dueTime: z.string().max(5).optional(),
          endDate: z.date().optional(),
          endTime: z.string().max(5).optional(),
          allDay: z.boolean().optional(),
          priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
          status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          reminderMinutes: z.number().optional(),
          isRecurring: z.boolean().optional(),
          recurrenceCount: z.number().optional(),
          recurrenceFrequency: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (input.entityId) {
          await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        }
        // Se for recorrente, criar múltiplas tarefas
        if (input.isRecurring && input.recurrenceCount && input.recurrenceFrequency) {
          const tasks = [];
          const count = input.recurrenceCount;
          const frequency = input.recurrenceFrequency;
          
          // Criar tarefa pai
          const parentTaskId = await db.createTask({
            userId: ctx.user.id,
            entityId: input.entityId,
            transactionId: input.transactionId,
            title: input.title,
            description: input.description,
            dueDate: input.dueDate,
            dueTime: input.dueTime,
            endDate: input.endDate,
            endTime: input.endTime,
            allDay: input.allDay,
            priority: input.priority,
            status: input.status,
            color: input.color,
            reminderMinutes: input.reminderMinutes,
            isRecurring: true,
            recurrencePattern: JSON.stringify({ frequency, interval: 1, count }),
            parentTaskId: null,
          });
          tasks.push(parentTaskId);

          // Sync com Google Calendar (tarefa pai)
          try {
            const user = await db.getUserById(ctx.user.id);
            if (user?.googleCalendarRefreshToken) {
              const { syncTaskToGoogleCalendar } = await import("./services/google-calendar");
              const parentTask = await db.getTaskById(parentTaskId);
              if (parentTask) await syncTaskToGoogleCalendar(parentTask, user.googleCalendarRefreshToken);
            }
          } catch (e) { console.error("[Google Calendar] Erro sync tarefa pai:", e); }
          
          // Criar tarefas filhas
          for (let i = 1; i < count; i++) {
            const newDueDate = new Date(input.dueDate);
            const newEndDate = input.endDate ? new Date(input.endDate) : undefined;
            
            switch (frequency) {
              case "DAY":
                newDueDate.setDate(newDueDate.getDate() + i);
                if (newEndDate) newEndDate.setDate(newEndDate.getDate() + i);
                break;
              case "WEEK":
                newDueDate.setDate(newDueDate.getDate() + (i * 7));
                if (newEndDate) newEndDate.setDate(newEndDate.getDate() + (i * 7));
                break;
              case "MONTH":
                newDueDate.setMonth(newDueDate.getMonth() + i);
                if (newEndDate) newEndDate.setMonth(newEndDate.getMonth() + i);
                break;
              case "YEAR":
                newDueDate.setFullYear(newDueDate.getFullYear() + i);
                if (newEndDate) newEndDate.setFullYear(newEndDate.getFullYear() + i);
                break;
            }
            
            const childTaskId = await db.createTask({
              userId: ctx.user.id,
              entityId: input.entityId,
              transactionId: input.transactionId,
              title: input.title,
              description: input.description,
              dueDate: newDueDate,
              dueTime: input.dueTime,
              endDate: newEndDate,
              endTime: input.endTime,
              allDay: input.allDay,
              priority: input.priority,
              status: input.status,
              color: input.color,
              reminderMinutes: input.reminderMinutes,
              isRecurring: false,
              recurrencePattern: null,
              parentTaskId: parentTaskId,
            });
            tasks.push(childTaskId);

            // Sync com Google Calendar (tarefa filha)
            try {
              const user = await db.getUserById(ctx.user.id);
              if (user?.googleCalendarRefreshToken) {
                const { syncTaskToGoogleCalendar } = await import("./services/google-calendar");
                const childTask = await db.getTaskById(childTaskId);
                if (childTask) await syncTaskToGoogleCalendar(childTask, user.googleCalendarRefreshToken);
              }
            } catch (e) { console.error("[Google Calendar] Erro sync tarefa filha:", e); }
          }
          
          return { id: parentTaskId, tasks };
        } else {
          // Tarefa única
          const taskId = await db.createTask({
            userId: ctx.user.id,
            entityId: input.entityId,
            transactionId: input.transactionId,
            title: input.title,
            description: input.description,
            dueDate: input.dueDate,
            dueTime: input.dueTime,
            endDate: input.endDate,
            endTime: input.endTime,
            allDay: input.allDay,
            priority: input.priority,
            status: input.status,
            color: input.color,
            reminderMinutes: input.reminderMinutes,
            isRecurring: false,
            recurrencePattern: null,
            parentTaskId: null,
          });

          // Sync com Google Calendar (tarefa única)
          try {
            const user = await db.getUserById(ctx.user.id);
            if (user?.googleCalendarRefreshToken) {
              const { syncTaskToGoogleCalendar } = await import("./services/google-calendar");
              const createdTask = await db.getTaskById(taskId);
              if (createdTask) await syncTaskToGoogleCalendar(createdTask, user.googleCalendarRefreshToken);
            }
          } catch (e) { console.error("[Google Calendar] Erro sync tarefa:", e); }

          return { id: taskId };
        }
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          entityId: z.number().optional().nullable(),
          title: z.string().min(1).max(255).optional(),
          description: z.string().optional().nullable(),
          dueDate: z.date().optional(),
          dueTime: z.string().max(5).optional().nullable(),
          endDate: z.date().optional().nullable(),
          endTime: z.string().max(5).optional().nullable(),
          allDay: z.boolean().optional(),
          priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
          status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
          color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
          reminderMinutes: z.number().optional().nullable(),
          updateAll: z.boolean().optional(), // Atualizar todas as tarefas recorrentes
        })
      )
      .mutation(async ({ input, ctx }) => {
        const task = await db.getTaskById(input.id);
        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        if (input.entityId) {
          await requireEntityAccess(input.entityId, ctx.user.id, "EDITOR");
        }
        
        const { id, updateAll, ...updateData } = input;
        
        // Se updateAll = true e a tarefa tem parentTaskId ou é pai, atualizar todas
        if (updateAll && (task.parentTaskId || task.isRecurring)) {
          const parentId = task.parentTaskId || task.id;
          // Buscar todas as tarefas relacionadas
          const relatedTasks = await db.getTasksByParentId(parentId);
          
          // Atualizar tarefa pai
          await db.updateTask(parentId, updateData);
          
          // Atualizar todas as tarefas filhas
          for (const relatedTask of relatedTasks) {
            await db.updateTask(relatedTask.id, updateData);
          }
        } else {
          // Atualizar apenas a tarefa atual
          await db.updateTask(id, updateData);
        }

        // Sync com Google Calendar após atualização
        try {
          const user = await db.getUserById(ctx.user.id);
          if (user?.googleCalendarRefreshToken) {
            const { syncTaskToGoogleCalendar } = await import("./services/google-calendar");
            if (updateAll && (task.parentTaskId || task.isRecurring)) {
              const parentId = task.parentTaskId || task.id;
              const parentTask = await db.getTaskById(parentId);
              if (parentTask) await syncTaskToGoogleCalendar(parentTask, user.googleCalendarRefreshToken);
              const relatedTasks = await db.getTasksByParentId(parentId);
              for (const rt of relatedTasks) {
                await syncTaskToGoogleCalendar(rt, user.googleCalendarRefreshToken);
              }
            } else {
              const updatedTask = await db.getTaskById(id);
              if (updatedTask) await syncTaskToGoogleCalendar(updatedTask, user.googleCalendarRefreshToken);
            }
          }
        } catch (e) { console.error("[Google Calendar] Erro sync após update:", e); }
        
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ 
        id: z.number(),
        deleteAll: z.boolean().optional() // Deletar todas as tarefas recorrentes
      }))
      .mutation(async ({ input, ctx }) => {
        const task = await db.getTaskById(input.id);
        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        
        // Se deleteAll = true e a tarefa tem parentTaskId ou é pai, deletar todas
        if (input.deleteAll && (task.parentTaskId || task.isRecurring)) {
          const parentId = task.parentTaskId || task.id;
          // Buscar todas as tarefas relacionadas
          const relatedTasks = await db.getTasksByParentId(parentId);
          
          // Deletar tarefa pai
          await db.deleteTask(parentId);
          
          // Deletar todas as tarefas filhas
          for (const relatedTask of relatedTasks) {
            await db.deleteTask(relatedTask.id);
          }
        } else {
          // Deletar apenas a tarefa atual
          await db.deleteTask(input.id);
        }
        
        return { success: true };
      }),

    complete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const task = await db.getTaskById(input.id);
        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await db.completeTask(input.id);
        return { success: true };
      }),

    toggleComplete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const task = await db.getTaskById(input.id);
        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const newStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
        await db.updateTask(input.id, { status: newStatus });
        return { success: true, status: newStatus };
      }),
    /**
     * Sincroniza todas as tarefas do usuário com o Google Calendar.
     */
    syncGoogleCalendar: protectedProcedure
      .mutation(async ({ ctx }) => {
        const { syncAllTasksToGoogleCalendar } = await import("./services/google-calendar");
        const user = await db.getUserById(ctx.user.id);
        if (!user?.googleCalendarRefreshToken) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google Calendar não conectado" });
        }
        const result = await syncAllTasksToGoogleCalendar(ctx.user.id, user.googleCalendarRefreshToken);
        return result;
      }),
  }),

  // ========== ORGANIZATIONS ==========
  organizations: router({
    // Listar todas as organizações do usuário
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getOrganizationsByUserId(ctx.user.id);
    }),

    // Obter organização por ID (com verificação de acesso)
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const org = await db.getOrganizationById(input.id);
        if (!org) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
        }
        const userOrgs = await db.getOrganizationsByUserId(ctx.user.id);
        if (!userOrgs.some(o => o.id === org.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return org;
      }),

    // Criar nova organização
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(100).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const org = await db.createOrganization({
          name: input.name,
          ownerId: ctx.user.id,
          slug: input.slug,
        });
        await db.addOrganizationMember({
          organizationId: org.id,
          userId: ctx.user.id,
          role: "owner",
        });
        return org;
      }),

    // Garantir que o usuário tem uma organização padrão (cria se não tiver)
    ensureDefault: protectedProcedure.mutation(async ({ ctx }) => {
      const org = await db.ensureOrganizationForUser({
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
      });
      return org;
    }),
  }),

  // ========== ENTITY SHARING (RBAC) ==========
  entitySharing: router({
    /**
     * Cria um link de convite para uma entidade.
     * Apenas o dono da entidade pode convidar.
     */
    createInvite: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          role: z.enum(["VIEWER", "EDITOR", "ADMIN"]),
          email: z.string().email().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "OWNER");

        // Gera token único
        const { randomUUID } = await import("crypto");
        const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

        // Convite expira em 7 dias
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        const invite = await db.createEntityInvite({
          entityId: input.entityId,
          invitedBy: ctx.user.id,
          email: input.email,
          role: input.role,
          token,
          expiresAt,
        });

        return { token: invite.token, expiresAt: invite.expiresAt };
      }),

    /**
     * Retorna informações de um convite pelo token (rota pública para a página de aceite).
     */
    getInviteInfo: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const invite = await db.getEntityInviteByToken(input.token);
        if (!invite) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Convite não encontrado" });
        }
        if (invite.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite já foi utilizado ou expirou" });
        }
        if (new Date() > invite.expiresAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite expirou" });
        }
        return {
          entityId: invite.entityId,
          entityName: invite.entityName,
          inviterName: invite.inviterName,
          inviterEmail: invite.inviterEmail,
          inviteEmail: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
        };
      }),

    /**
     * Aceita um convite. O usuário autenticado se torna membro da entidade.
     */
    acceptInvite: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const invite = await db.getEntityInviteByToken(input.token);
        if (!invite) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Convite não encontrado" });
        }
        if (invite.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite já foi utilizado ou expirou" });
        }
        if (new Date() > invite.expiresAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite expirou" });
        }

        // Verifica se o usuário já é dono da entidade
        const entity = await db.getEntityById(invite.entityId);
        if (entity?.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Você já é o dono desta entidade" });
        }

        // Verifica se já é membro
        const existingMember = await db.getEntityMember(invite.entityId, ctx.user.id);
        if (existingMember) {
          // Atualiza o role se o convite tem um role diferente
          if (existingMember.role !== invite.role) {
            await db.updateEntityMemberRole(invite.entityId, ctx.user.id, invite.role);
          }
        } else {
          // Adiciona como novo membro
          await db.addEntityMember({
            entityId: invite.entityId,
            userId: ctx.user.id,
            role: invite.role,
            invitedBy: invite.invitedBy,
          });
        }

        // Marca o convite como aceito
        await db.acceptEntityInvite(input.token);

        return { success: true, entityId: invite.entityId, role: invite.role };
      }),

    /**
     * Lista os membros de uma entidade.
     * Dono e membros podem ver a lista.
     */
    listMembers: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Entidade não encontrada" });
        }

        const isOwner = entity.userId === ctx.user.id;
        const member = await db.getEntityMember(input.entityId, ctx.user.id);

        if (!isOwner && !member) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
        }

        const members = await db.getEntityMembers(input.entityId);
        const invites = await db.getEntityInvites(input.entityId);

        return { members, invites, isOwner, myRole: isOwner ? "OWNER" : member?.role };
      }),

    /**
     * Atualiza o role de um membro. Apenas o dono pode fazer isso.
     */
    updateMemberRole: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          userId: z.number(),
          role: z.enum(["VIEWER", "EDITOR", "ADMIN"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "OWNER");
        await db.updateEntityMemberRole(input.entityId, input.userId, input.role);
        return { success: true };
      }),

    /**
     * Remove um membro de uma entidade.
     * O dono pode remover qualquer membro. O próprio membro pode sair.
     */
    removeMember: protectedProcedure
      .input(
        z.object({
          entityId: z.number(),
          userId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const entity = await db.getEntityById(input.entityId);
        if (!entity) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Entidade não encontrada" });
        }

        const isOwner = entity.userId === ctx.user.id;
        const isSelf = input.userId === ctx.user.id;

        if (!isOwner && !isSelf) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o dono pode remover membros" });
        }

        await db.removeEntityMember(input.entityId, input.userId);
        return { success: true };
      }),

    /**
     * Revoga um convite pendente. Apenas o dono pode revogar.
     */
    revokeInvite: protectedProcedure
      .input(z.object({ inviteId: z.number(), entityId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "OWNER");
        await db.revokeEntityInvite(input.inviteId);
        return { success: true };
      }),

    /**
     * Lista todas as entidades às quais o usuário tem acesso compartilhado.
     */
    listSharedEntities: protectedProcedure.query(async ({ ctx }) => {
      return await db.getSharedEntitiesForUser(ctx.user.id);
    }),
  }),

  // ========== ADMIN ==========
  admin: router({
    /**
     * Estatísticas gerais do sistema.
     */
    getStats: adminProcedure.query(async () => {
      return await db.adminGetStats();
    }),

    /**
     * Lista todos os usuários cadastrados.
     */
    listUsers: adminProcedure.query(async () => {
      return await db.adminListUsers();
    }),

    /**
     * Lista todas as organizações.
     */
    listOrganizations: adminProcedure.query(async () => {
      return await db.adminListOrganizations();
    }),

    /**
     * Altera o plano de uma organização.
     */
    setOrganizationPlan: adminProcedure
      .input(z.object({
        orgId: z.number(),
        plan: z.enum(['free', 'pro', 'enterprise']),
      }))
      .mutation(async ({ input }) => {
        await db.adminSetOrganizationPlan(input.orgId, input.plan);
        return { success: true };
      }),

    /**
     * Força a verificação de e-mail de um usuário.
     */
    forceVerifyUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        await db.adminForceVerifyUser(input.userId);
        return { success: true };
      }),

    /**
     * Altera o role de um usuário (user / admin).
     */
    setUserRole: adminProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(['user', 'admin']),
      }))
      .mutation(async ({ input, ctx }) => {
        // Não permitir que o admin remova seu próprio role
        if (input.userId === ctx.user.id && input.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não pode remover seu próprio acesso de admin.' });
        }
        await db.adminSetUserRole(input.userId, input.role);
        return { success: true };
      }),

    /**
     * Altera o status de um usuário (active / suspended / banned).
     */
    setUserStatus: adminProcedure
      .input(z.object({
        userId: z.number(),
        status: z.enum(['active', 'suspended', 'banned']),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não pode alterar seu próprio status.' });
        }
        await db.adminSetUserStatus(input.userId, input.status);
        return { success: true };
      }),

    /**
     * Deleta um usuário e todos os seus dados.
     */
    deleteUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não pode deletar sua própria conta por aqui.' });
        }
        await db.adminDeleteUser(input.userId);
        return { success: true };
      }),
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // CARTÕES DE CRÉDITO
  // ─────────────────────────────────────────────────────────────────────────
  creditCards: router({
    listByEntity: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const dbInstance = await getDb();
        if (!dbInstance) return [];
        const { creditCards } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        return dbInstance
          .select()
          .from(creditCards)
          .where(and(eq(creditCards.entityId, input.entityId), eq(creditCards.isActive, true)))
          .orderBy(creditCards.name);
      }),

    create: protectedProcedure
      .input(z.object({
        entityId: z.number(),
        name: z.string().min(1),
        brand: z.enum(["VISA", "MASTERCARD", "ELO", "AMERICAN_EXPRESS", "HIPERCARD", "OTHER"]).default("OTHER"),
        lastFourDigits: z.string().max(4).optional(),
        creditLimit: z.number().min(0).default(0),
        closingDay: z.number().min(1).max(31).default(1),
        dueDay: z.number().min(1).max(31).default(10),
        color: z.string().default("#7C3AED"),
      }))
      .mutation(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { creditCards } = await import("../drizzle/schema");
        const [card] = await dbInstance.insert(creditCards).values({
          organizationId: null,
          userId: ctx.user.id,
          entityId: input.entityId,
          name: input.name,
          brand: input.brand,
          lastFourDigits: input.lastFourDigits,
          creditLimit: Math.round(input.creditLimit * 100),
          closingDay: input.closingDay,
          dueDay: input.dueDay,
          color: input.color,
        }).returning();
        return card;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        brand: z.enum(["VISA", "MASTERCARD", "ELO", "AMERICAN_EXPRESS", "HIPERCARD", "OTHER"]).optional(),
        lastFourDigits: z.string().max(4).optional(),
        creditLimit: z.number().min(0).optional(),
        closingDay: z.number().min(1).max(31).optional(),
        dueDay: z.number().min(1).max(31).optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { creditCards } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const updates: any = { updatedAt: new Date() };
        if (input.name !== undefined) updates.name = input.name;
        if (input.brand !== undefined) updates.brand = input.brand;
        if (input.lastFourDigits !== undefined) updates.lastFourDigits = input.lastFourDigits;
        if (input.creditLimit !== undefined) updates.creditLimit = Math.round(input.creditLimit * 100);
        if (input.closingDay !== undefined) updates.closingDay = input.closingDay;
        if (input.dueDay !== undefined) updates.dueDay = input.dueDay;
        if (input.color !== undefined) updates.color = input.color;
        const [updated] = await dbInstance.update(creditCards).set(updates).where(eq(creditCards.id, input.id)).returning();
        return updated;
      }),

    deactivate: protectedProcedure
      .input(z.object({ id: z.number(), deleteTransactions: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { creditCards } = await import("../drizzle/schema");
        const { eq, sql: sqlTag } = await import("drizzle-orm");
        if (input.deleteTransactions) {
          await dbInstance.execute(sqlTag`DELETE FROM transactions WHERE "creditCardId" = ${input.id}`);
        }
        await dbInstance.update(creditCards).set({ isActive: false, updatedAt: new Date() }).where(eq(creditCards.id, input.id));
        return { success: true };
      }),
    getTransactionCount: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) return { count: 0 };
        const { sql: sqlTag } = await import("drizzle-orm");
        const result = await dbInstance.execute(sqlTag`SELECT COUNT(*) as count FROM transactions WHERE "creditCardId" = ${input.id}`);
        const rows = (Array.isArray(result) ? result : ((result as any).rows ?? [])) as any[];
        const count = rows[0] ? Number(rows[0].count) : 0;
        return { count };
      }),
    getSummary: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .query(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) return null;
        const { creditCards } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { sql: sqlTag } = await import("drizzle-orm");
        const [card] = await dbInstance.select().from(creditCards).where(eq(creditCards.id, input.cardId));
        if (!card) return null;
        const now = new Date();
        let invoiceMonth = now.getMonth() + 1;
        let invoiceYear = now.getFullYear();
        if (now.getDate() >= card.closingDay) {
          if (invoiceMonth === 12) { invoiceMonth = 1; invoiceYear++; }
          else { invoiceMonth++; }
        }
        // Usar SQL raw porque creditCardId não está no schema Drizzle
        // Conta apenas transações PENDING (faturas pagas liberam o limite)
        // Débitos (EXPENSE) somam, créditos (INCOME: estornos, pagamentos antecipados) subtraem
        const result = await dbInstance.execute(
          sqlTag`SELECT
            COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) as total_debits,
            COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as total_credits
          FROM transactions WHERE "creditCardId" = ${input.cardId} AND status != 'PAID'`
        );
        const resultRows = (Array.isArray(result) ? result : ((result as any).rows ?? [])) as any[];
        const totalDebits = Number(resultRows[0]?.total_debits ?? 0);
        const totalCredits = Number(resultRows[0]?.total_credits ?? 0);
        const usedAmount = Math.max(0, totalDebits - totalCredits);
        const availableLimit = card.creditLimit - usedAmount;
        const dueDate = new Date(invoiceYear, invoiceMonth - 1, card.dueDay);
        return {
          card,
          usedAmount,
          availableLimit,
          creditLimit: card.creditLimit,
          invoiceMonth,
          invoiceYear,
          dueDate,
          usagePercent: card.creditLimit > 0 ? Math.round((usedAmount / card.creditLimit) * 100) : 0,
        };
      }),

    // Retorna faturas agrupadas por mês (próximos N meses)
    getInvoicesByMonth: protectedProcedure
      .input(z.object({ cardId: z.number(), months: z.number().default(6) }))
      .query(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) return [];
        const { creditCards, creditCardInvoices } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { sql: sqlTag } = await import("drizzle-orm");
        const [card] = await dbInstance.select().from(creditCards).where(eq(creditCards.id, input.cardId));
        if (!card) return [];
        // Buscar todas as transações do cartão agrupadas por mês/ano do dueDate
        // Total líquido: débitos (EXPENSE) - créditos (INCOME: estornos, pagamentos antecipados)
        const rows = await dbInstance.execute(
          sqlTag`
            SELECT
              EXTRACT(YEAR FROM "dueDate") as year,
              EXTRACT(MONTH FROM "dueDate") as month,
              COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) -
              COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as total,
              COUNT(*) as count
            FROM transactions
            WHERE "creditCardId" = ${input.cardId}
            GROUP BY EXTRACT(YEAR FROM "dueDate"), EXTRACT(MONTH FROM "dueDate")
            ORDER BY year ASC, month ASC
          `
        );
        // Buscar registros de fatura já pagos na tabela credit_card_invoices
        const invoiceRecords = await dbInstance
          .select()
          .from(creditCardInvoices)
          .where(eq(creditCardInvoices.creditCardId, input.cardId));
        const invoiceMap = new Map<string, any>();
        for (const inv of invoiceRecords) {
          invoiceMap.set(`${inv.year}-${inv.month}`, inv);
        }
        const rowsArr = (Array.isArray(rows) ? rows : ((rows as any).rows ?? [])) as any[];
        return rowsArr.map((row) => {
          const year = Number(row.year);
          const month = Number(row.month);
          const dueDate = new Date(year, month - 1, card.dueDay);
          const invoiceRecord = invoiceMap.get(`${year}-${month}`);
          const status = invoiceRecord?.status ?? "OPEN";
          return {
            year,
            month,
            total: Number(row.total),
            count: Number(row.count),
            dueDate,
            isPaid: status === "PAID",
            status,
            invoiceId: invoiceRecord?.id ?? null,
            paidFromAccountId: invoiceRecord?.paidFromAccountId ?? null,
            invoiceTotal: invoiceRecord?.invoiceTotal ?? null, // valor real da fatura do PDF/CSV
          };
        });
      }),
    payInvoice: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        month: z.number().min(1).max(12),
        year: z.number().min(2000).max(2100),
        bankAccountId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { creditCards, creditCardInvoices } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const { sql: sqlTag } = await import("drizzle-orm");
        // Verificar acesso ao cartão
        const [card] = await dbInstance.select().from(creditCards).where(eq(creditCards.id, input.cardId));
        if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "Cartão não encontrado" });
        await requireEntityAccess(card.entityId, ctx.user.id, "EDITOR");
        // Buscar todas as transações PENDING do cartão naquele mês/ano
        const startDate = new Date(input.year, input.month - 1, 1).toISOString();
        const endDate = new Date(input.year, input.month, 0, 23, 59, 59).toISOString();
        const txRows = await dbInstance.execute(
          sqlTag`SELECT id, amount, type FROM transactions WHERE "creditCardId" = ${input.cardId} AND "dueDate" >= ${startDate} AND "dueDate" <= ${endDate} AND status = 'PENDING'`
        );
        const pendingTxs = (Array.isArray(txRows) ? txRows : ((txRows as any).rows ?? [])) as any[];
        if (pendingTxs.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não há transações pendentes nesta fatura" });
        }
        // Total líquido: débitos (EXPENSE) - créditos (INCOME: estornos, pagamentos antecipados)
        const totalDebitsInvoice = pendingTxs.filter((tx: any) => tx.type === 'EXPENSE').reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
        const totalCreditsInvoice = pendingTxs.filter((tx: any) => tx.type === 'INCOME').reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
        const calculatedTotal = Math.max(0, totalDebitsInvoice - totalCreditsInvoice);
        // Usar invoiceTotal salvo (valor real da fatura do PDF/CSV) se disponível
        const existingInvoiceForTotal = await dbInstance
          .select({ invoiceTotal: creditCardInvoices.invoiceTotal })
          .from(creditCardInvoices)
          .where(and(eq(creditCardInvoices.creditCardId, input.cardId), eq(creditCardInvoices.month, input.month), eq(creditCardInvoices.year, input.year)))
          .limit(1);
        const savedInvoiceTotal = existingInvoiceForTotal[0]?.invoiceTotal;
        const totalAmount = savedInvoiceTotal != null ? savedInvoiceTotal : calculatedTotal;
        const MONTH_NAMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        // Criar transação de despesa na conta bancária
        const paymentDescription = `Pagamento Fatura ${card.name} - ${MONTH_NAMES[input.month - 1]}/${input.year}`;
        const paymentTxId = await db.createTransaction({
          entityId: card.entityId,
          type: "EXPENSE",
          description: paymentDescription,
          amount: totalAmount,
          dueDate: new Date(),
          paymentDate: new Date(),
          status: "PAID",
          bankAccountId: input.bankAccountId,
          categoryId: null,
          paymentMethodId: null,
          isRecurring: false,
          recurrencePattern: null,
          notes: `Pagamento automático de fatura do cartão ${card.name}`,
        });
        // Marcar todas as transações do cartão naquele mês como PAID
        await dbInstance.execute(
          sqlTag`UPDATE transactions SET status = 'PAID', "paymentDate" = NOW(), "updatedAt" = NOW() WHERE "creditCardId" = ${input.cardId} AND "dueDate" >= ${startDate} AND "dueDate" <= ${endDate} AND status = 'PENDING'`
        );
        // Upsert na tabela credit_card_invoices
        const existingInvoice = await dbInstance
          .select()
          .from(creditCardInvoices)
          .where(and(eq(creditCardInvoices.creditCardId, input.cardId), eq(creditCardInvoices.month, input.month), eq(creditCardInvoices.year, input.year)))
          .limit(1);
        if (existingInvoice.length > 0) {
          await dbInstance.update(creditCardInvoices)
            .set({ status: "PAID", paidAt: new Date(), paidFromAccountId: input.bankAccountId, totalAmount, updatedAt: new Date() })
            .where(eq(creditCardInvoices.id, existingInvoice[0].id));
        } else {
          await dbInstance.insert(creditCardInvoices).values({
            creditCardId: input.cardId,
            month: input.month,
            year: input.year,
            status: "PAID",
            totalAmount,
            dueDate: new Date(input.year, input.month - 1, card.dueDay),
            paidAt: new Date(),
            paidFromAccountId: input.bankAccountId,
          });
        }
        return { success: true, paymentTxId, totalAmount };
      }),

    getInvoiceGroups: protectedProcedure
      .input(z.object({
        entityId: z.number(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }))
      .query(async ({ input, ctx }) => {
        await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
        const dbInstance = await getDb();
        if (!dbInstance) return [];
        const { sql: sqlTag } = await import("drizzle-orm");
        const { creditCards: creditCardsTable } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        // Buscar todos os cartões ativos da entidade
        const cards = await dbInstance
          .select()
          .from(creditCardsTable)
          .where(and(eq(creditCardsTable.entityId, input.entityId), eq(creditCardsTable.isActive, true)));
        if (cards.length === 0) return [];
        const cardIds = cards.map(c => c.id);
        const cardIdsStr = cardIds.join(',');
        // Montar filtro de datas para SQL raw
        let dateCondition = '';
        if (input.startDate) {
          dateCondition += ` AND t."dueDate" >= '${input.startDate.toISOString()}'`;
        }
        if (input.endDate) {
          dateCondition += ` AND t."dueDate" <= '${input.endDate.toISOString()}'`;
        }
        const cardMap = new Map<number, any>();
        for (const card of cards) {
          cardMap.set(card.id, card);
        }
        // ── Query 1: buscar TODAS as transações de cartão da entidade de uma vez ──
        const allTxRows = await dbInstance.execute(
          sqlTag`
            SELECT
              t.id,
              t."entityId",
              t.type,
              t.description,
              t.amount,
              t."dueDate",
              t."paymentDate",
              t.status,
              t."categoryId",
              t."bankAccountId",
              t."paymentMethodId",
              t."isRecurring",
              t."parentTransactionId",
              t.notes,
              t."createdAt",
              t."updatedAt",
              t."importOrigin",
              t."creditCardId",
              c.name as "categoryName",
              c.color as "categoryColor",
              c."parentId" as "parentCategoryId",
              pc.name as "parentCategoryName",
              pc.color as "parentCategoryColor",
              ba.name as "bankAccountName",
              ba.bank as "bankInstitution",
              EXTRACT(YEAR FROM t."dueDate")::int as tx_year,
              EXTRACT(MONTH FROM t."dueDate")::int as tx_month,
              (SELECT COUNT(*) FROM attachments WHERE "transactionId" = t.id)::int as "attachmentCount"
            FROM transactions t
            LEFT JOIN categories c ON t."categoryId" = c.id
            LEFT JOIN categories pc ON c."parentId" = pc.id
            LEFT JOIN bank_accounts ba ON t."bankAccountId" = ba.id
            WHERE t."creditCardId" = ANY(ARRAY[${sqlTag.raw(cardIdsStr)}]::int[])
              ${sqlTag.raw(dateCondition)}
            ORDER BY t."dueDate" ASC
          `
        );
        // ── Query 2: buscar registros de fatura (status PAID etc.) ──
        const allInvoiceRows = await dbInstance.execute(
          sqlTag`SELECT * FROM credit_card_invoices WHERE "creditCardId" = ANY(ARRAY[${sqlTag.raw(cardIdsStr)}]::int[])`
        );
        const invoiceMap = new Map<string, any>();
        const invoiceArr = (Array.isArray(allInvoiceRows) ? allInvoiceRows : ((allInvoiceRows as any).rows ?? [])) as any[];
        for (const inv of invoiceArr) {
          invoiceMap.set(`${inv.creditCardId}-${inv.year}-${inv.month}`, inv);
        }
        // ── Agrupar transações por cartão + mês/ano no código ──
        const groupMap = new Map<string, {
          cardId: number; year: number; month: number;
          total: number; count: number;
          transactions: any[];
        }>();
        const txArr = (Array.isArray(allTxRows) ? allTxRows : ((allTxRows as any).rows ?? [])) as any[];
        for (const row of txArr) {
          const cardId = Number(row.creditCardId);
          const year = Number(row.tx_year);
          const month = Number(row.tx_month);
          const key = `${cardId}-${year}-${month}`;
          if (!groupMap.has(key)) {
            groupMap.set(key, { cardId, year, month, total: 0, count: 0, transactions: [] });
          }
          const g = groupMap.get(key)!;
          g.total += Number(row.amount);
          g.count += 1;
          g.transactions.push({
            ...row,
            amount: Number(row.amount),
            attachmentCount: Number(row.attachmentCount ?? 0),
            dueDate: row.dueDate ? new Date(row.dueDate) : null,
            paymentDate: row.paymentDate ? new Date(row.paymentDate) : null,
            createdAt: row.createdAt ? new Date(row.createdAt) : null,
            updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
          });
        }
        // ── Montar resultado final ──
        const groups = [];
        for (const [key, g] of groupMap.entries()) {
          const card = cardMap.get(g.cardId);
          if (!card) continue;
          const invoiceRecord = invoiceMap.get(key);
          const status = invoiceRecord?.status ?? "OPEN";
          const dueDate = new Date(g.year, g.month - 1, card.dueDay);
          groups.push({
            cardId: g.cardId,
            cardName: card.name,
            cardColor: card.color,
            cardBrand: card.brand,
            cardLastFourDigits: card.lastFourDigits,
            year: g.year,
            month: g.month,
            total: g.total,
            count: g.count,
            dueDate,
            status,
            isPaid: status === "PAID",
            invoiceId: invoiceRecord?.id ?? null,
            paidFromAccountId: invoiceRecord?.paidFromAccountId ?? null,
            transactions: g.transactions,
          });
        }
        // Ordenar por ano desc, mês desc, cardId asc
        groups.sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          if (b.month !== a.month) return b.month - a.month;
          return a.cardId - b.cardId;
        });
        return groups;
      }),
    listTransactions: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        month: z.number().optional(),
        year: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) return [];
        const { sql: sqlTag } = await import("drizzle-orm");
        // Usar SQL raw porque creditCardId não está no schema Drizzle
        if (input.month && input.year) {
          const start = new Date(input.year, input.month - 1, 1).toISOString();
          const end = new Date(input.year, input.month, 0, 23, 59, 59).toISOString();
          const result = await dbInstance.execute(
            sqlTag`SELECT * FROM transactions WHERE "creditCardId" = ${input.cardId} AND "dueDate" >= ${start} AND "dueDate" <= ${end} ORDER BY "dueDate" ASC`
          );
          return (Array.isArray(result) ? result : ((result as any).rows ?? [])) as any[];
        }
        const result = await dbInstance.execute(
          sqlTag`SELECT * FROM transactions WHERE "creditCardId" = ${input.cardId} ORDER BY "dueDate" ASC`
        );
        return (Array.isArray(result) ? result : ((result as any).rows ?? [])) as any[];
      }),
    // Salva o invoiceTotal (valor real da fatura conforme PDF/CSV) na tabela credit_card_invoices
    setInvoiceTotal: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        month: z.number(),
        year: z.number(),
        invoiceTotal: z.number(), // em centavos
        dueDate: z.date().optional(),
      }))
      .mutation(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
        const { creditCardInvoices } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const existing = await dbInstance
          .select()
          .from(creditCardInvoices)
          .where(and(eq(creditCardInvoices.creditCardId, input.cardId), eq(creditCardInvoices.month, input.month), eq(creditCardInvoices.year, input.year)))
          .limit(1);
        if (existing.length > 0) {
          await dbInstance.update(creditCardInvoices)
            .set({ invoiceTotal: input.invoiceTotal, updatedAt: new Date() })
            .where(eq(creditCardInvoices.id, existing[0].id));
        } else {
          await dbInstance.insert(creditCardInvoices).values({
            creditCardId: input.cardId,
            month: input.month,
            year: input.year,
            status: "OPEN",
            totalAmount: 0,
            invoiceTotal: input.invoiceTotal,
            dueDate: input.dueDate ?? null,
          });
        }
        return { success: true };
      }),
    // Retorna os invoiceTotals salvos para todos os cartões de uma entidade
    getInvoiceTotals: protectedProcedure
      .input(z.object({ entityId: z.number() }))
      .query(async ({ input }) => {
        const dbInstance = await getDb();
        if (!dbInstance) return [];
        const { creditCards: creditCardsTable, creditCardInvoices } = await import("../drizzle/schema");
        const { eq, and, isNotNull } = await import("drizzle-orm");
        // Buscar todos os cartões da entidade
        const cards = await dbInstance
          .select({ id: creditCardsTable.id })
          .from(creditCardsTable)
          .where(and(eq(creditCardsTable.entityId, input.entityId), eq(creditCardsTable.isActive, true)));
        if (cards.length === 0) return [];
        const cardIds = cards.map(c => c.id);
        // Buscar invoices com invoiceTotal preenchido
        const invoices = await dbInstance
          .select({
            creditCardId: creditCardInvoices.creditCardId,
            month: creditCardInvoices.month,
            year: creditCardInvoices.year,
            invoiceTotal: creditCardInvoices.invoiceTotal,
          })
          .from(creditCardInvoices)
          .where(isNotNull(creditCardInvoices.invoiceTotal));
        return invoices.filter(inv => cardIds.includes(inv.creditCardId));
      }),
  }),
});
export type AppRouter = typeof appRouter;
