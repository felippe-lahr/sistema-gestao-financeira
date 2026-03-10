"""
Corrige o RBAC nas rotas de rentals e rentalAttachments no routers.ts.
- rentals.create: já tem requireEntityAccess("VIEWER") — corrigir para "EDITOR"
- rentals.update: substituir rental.userId check por requireEntityAccess("EDITOR")
- rentals.delete: substituir rental.userId check por requireEntityAccess("ADMIN")
- rentalAttachments.create: substituir rental.userId check por requireEntityAccess("EDITOR")
- rentalAttachments.listByRental: substituir rental.userId check por requireEntityAccess("VIEWER")
- rentalAttachments.delete: substituir rental.userId check por requireEntityAccess("ADMIN")
- rentalAttachments.updateType: substituir rental.userId check por requireEntityAccess("EDITOR")
"""

with open("server/routers.ts", "r") as f:
    content = f.read()

original = content

# 1. rentals.create — já tem requireEntityAccess mas com "VIEWER", corrigir para "EDITOR"
content = content.replace(
    'await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");\n        const { createRental } = await import("./db-rentals");',
    'await requireEntityAccess(input.entityId, ctx.user.id, "EDITOR");\n        const { createRental } = await import("./db-rentals");'
)

# 2. rentals.update — substituir verificação antiga por requireEntityAccess("EDITOR")
content = content.replace(
    '''      .mutation(async ({ input, ctx }) => {
        const { getRentalById, updateRental } = await import("./db-rentals");
        const rental = await getRentalById(input.id);
        if (!rental || rental.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await updateRental(input.id, input);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { getRentalById, deleteRental } = await import("./db-rentals");
        const rental = await getRentalById(input.id);
        if (!rental || rental.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return await deleteRental(input.id);
      }),''',
    '''      .mutation(async ({ input, ctx }) => {
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
      }),'''
)

# 3. rentalAttachments.create — substituir verificação antiga por requireEntityAccess("EDITOR")
content = content.replace(
    '''      .mutation(async ({ input, ctx }) => {
        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(input.rentalId);
        if (!rental || rental.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
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
        if (!rental || rental.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }''',
    '''      .mutation(async ({ input, ctx }) => {
        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(input.rentalId);
        if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        await requireEntityAccess(rental.entityId, ctx.user.id, "EDITOR");
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
        await requireEntityAccess(rental.entityId, ctx.user.id, "VIEWER");'''
)

# 4. rentalAttachments.delete — substituir verificação antiga por requireEntityAccess("ADMIN")
content = content.replace(
    '''        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(attachment.rentalId);
        if (!rental || rental.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await dbInstance.delete(rentalAttachments).where(eq(rentalAttachments.id, input.id));
        return { success: true };''',
    '''        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(attachment.rentalId);
        if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        await requireEntityAccess(rental.entityId, ctx.user.id, "ADMIN");
        await dbInstance.delete(rentalAttachments).where(eq(rentalAttachments.id, input.id));
        return { success: true };'''
)

# 5. rentalAttachments.updateType — substituir verificação antiga por requireEntityAccess("EDITOR")
content = content.replace(
    '''        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(attachment.rentalId);
        if (!rental || rental.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const result = await dbInstance
          .update(rentalAttachments)
          .set({ type: input.type })
          .where(eq(rentalAttachments.id, input.id))
          .returning();
        return result[0];''',
    '''        const { getRentalById } = await import("./db-rentals");
        const rental = await getRentalById(attachment.rentalId);
        if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        await requireEntityAccess(rental.entityId, ctx.user.id, "EDITOR");
        const result = await dbInstance
          .update(rentalAttachments)
          .set({ type: input.type })
          .where(eq(rentalAttachments.id, input.id))
          .returning();
        return result[0];'''
)

if content == original:
    print("AVISO: Nenhuma substituição foi feita! Verificar padrões.")
else:
    with open("server/routers.ts", "w") as f:
        f.write(content)
    print("OK: RBAC de rentals e rentalAttachments corrigido com sucesso.")
