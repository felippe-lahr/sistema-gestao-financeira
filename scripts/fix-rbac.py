"""
Script para corrigir dois problemas no routers.ts:
1. Lentidão: eliminar N+1 queries em entities.list
2. RBAC: substituir verificações entity.userId !== ctx.user.id por requireEntityAccess
   com o role mínimo correto para cada operação
"""

import re

with open("server/routers.ts", "r") as f:
    content = f.read()

# ============================================================
# FIX 1: entities.list — eliminar N+1 queries
# ============================================================
old_list = """    list: protectedProcedure.query(async ({ ctx }) => {
      // Retorna entidades próprias + entidades compartilhadas com o usuário
      const ownedEntities = await db.getEntitiesByUserId(ctx.user.id);
      const sharedEntities = await db.getSharedEntitiesForUser(ctx.user.id);
      
      // Buscar dados completos das entidades compartilhadas
      const sharedFull = await Promise.all(
        sharedEntities.map(async (se) => {
          const entity = await db.getEntityById(se.id);
          return entity ? { ...entity, sharedRole: se.role } : null;
        })
      );
      
      const validShared = sharedFull.filter(Boolean) as any[];
      
      // Combinar: entidades próprias primeiro, depois compartilhadas
      return [
        ...ownedEntities.map(e => ({ ...e, sharedRole: null })),
        ...validShared,
      ];
    }),"""

new_list = """    list: protectedProcedure.query(async ({ ctx }) => {
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
    }),"""

content = content.replace(old_list, new_list)

# ============================================================
# FIX 2: RBAC — substituir verificações de ownership por requireEntityAccess
# Padrão a substituir (rotas de leitura — VIEWER):
#   const entity = await db.getEntityById(input.entityId);
#   if (!entity || entity.userId !== ctx.user.id) {
#     throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
#   }
# Por:
#   await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");
# ============================================================

# Rotas de LEITURA (listByEntity, getById, summary, etc.) — VIEWER
read_check = (
    r'const entity = await db\.getEntityById\(input\.entityId\);\n'
    r'        if \(!entity \|\| entity\.userId !== ctx\.user\.id\) \{\n'
    r'          throw new TRPCError\(\{ code: "FORBIDDEN", message: "Access denied" \}\);\n'
    r'        \}'
)
read_replacement = 'await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");'
content = re.sub(read_check, read_replacement, content)

# Rotas de ESCRITA por entityId (create) — EDITOR
create_check = (
    r'const entity = await db\.getEntityById\(input\.entityId\);\n'
    r'        if \(!entity \|\| entity\.userId !== ctx\.user\.id\) \{\n'
    r'          throw new TRPCError\(\{ code: "FORBIDDEN", message: "Access denied" \}\);\n'
    r'        \}\n\n'
    r'        const balanceInCents'
)
create_replacement = (
    'await requireEntityAccess(input.entityId, ctx.user.id, "EDITOR");\n\n'
    '        const balanceInCents'
)
content = re.sub(create_check, create_replacement, content)

# Substituir todas as verificações de create por entityId restantes — EDITOR
create_check2 = (
    r'const entity = await db\.getEntityById\(input\.entityId\);\n'
    r'        if \(!entity \|\| entity\.userId !== ctx\.user\.id\) \{\n'
    r'          throw new TRPCError\(\{ code: "FORBIDDEN", message: "Access denied" \}\);\n'
    r'        \}\n'
    r'        const \w+Id = await db\.'
)

def replace_create(m):
    # Keep the db call line
    text = m.group(0)
    # Extract the last line (const xxxId = await db.)
    last_line = text.split('\n')[-1]
    return f'await requireEntityAccess(input.entityId, ctx.user.id, "EDITOR");\n        {last_line}'

content = re.sub(create_check2, replace_create, content)

# Rotas de ESCRITA por transactionId (update/delete) — EDITOR para update, ADMIN para delete
# Padrão: busca transaction, depois entity
trans_update_check = (
    r'const entity = await db\.getEntityById\(transaction\.entityId\);\n'
    r'        if \(!entity \|\| entity\.userId !== ctx\.user\.id\) \{\n'
    r'          throw new TRPCError\(\{ code: "FORBIDDEN", message: "Access denied" \}\);\n'
    r'        \}\n\n'
    r'        const updateData'
)
trans_update_replacement = (
    'await requireEntityAccess(transaction.entityId, ctx.user.id, "EDITOR");\n\n'
    '        const updateData'
)
content = re.sub(trans_update_check, trans_update_replacement, content)

# Delete de transação — ADMIN
trans_delete_check = (
    r'const entity = await db\.getEntityById\(transaction\.entityId\);\n'
    r'        if \(!entity \|\| entity\.userId !== ctx\.user\.id\) \{\n'
    r'          throw new TRPCError\(\{ code: "FORBIDDEN", message: "Access denied" \}\);\n'
    r'        \}\n'
    r'      await db\.deleteTransaction'
)
trans_delete_replacement = (
    'await requireEntityAccess(transaction.entityId, ctx.user.id, "ADMIN");\n'
    '      await db.deleteTransaction'
)
content = re.sub(trans_delete_check, trans_delete_replacement, content)

# Substituições genéricas restantes para qualquer entity.userId check
# Leitura (query)
remaining_read = (
    r'const entity = await db\.getEntityById\(input\.entityId\);\n'
    r'      if \(!entity \|\| entity\.userId !== ctx\.user\.id\) \{\n'
    r'        throw new TRPCError\(\{ code: "FORBIDDEN", message: "Access denied" \}\);\n'
    r'      \}'
)
content = re.sub(remaining_read, 'await requireEntityAccess(input.entityId, ctx.user.id, "VIEWER");', content)

# Verificações dentro de loops (listByEntities)
loop_check = (
    r'const entity = await db\.getEntityById\(entityId\);\n'
    r'          if \(!entity \|\| entity\.userId !== ctx\.user\.id\) \{\n'
    r'            throw new TRPCError\(\{ code: "FORBIDDEN", message: "Access denied" \}\);\n'
    r'          \}'
)
content = re.sub(loop_check, 'await requireEntityAccess(entityId, ctx.user.id, "VIEWER");', content)

# Verificações de update/delete de categoria, conta, método de pagamento por userId do recurso
# (category.userId, bankAccount.userId, etc.) — EDITOR para update, ADMIN para delete
# Esses recursos pertencem ao dono da entidade, mas membros EDITOR+ devem poder criar/editar

# Para categories.create — já tratado acima
# Para categories.update — verificação é por category.userId, manter como está (só dono edita categorias globais)
# Para transactions.create — já tratado acima

with open("server/routers.ts", "w") as f:
    f.write(content)

print("Substituições concluídas!")

# Verificar quantas verificações antigas ainda restam
remaining = content.count("entity.userId !== ctx.user.id")
print(f"Verificações entity.userId restantes: {remaining}")
