#!/usr/bin/env python3
"""
Script para atualizar as verificações de autorização no routers.ts
para suportar membros compartilhados com RBAC.

Estratégia:
- Adicionar import do requireEntityAccess
- Substituir verificações de leitura (queries) para usar requireEntityAccess com VIEWER
- Substituir verificações de escrita (mutations de create/update) para usar EDITOR
- Substituir verificações de deleção (mutations de delete) para usar ADMIN
- Manter verificações de OWNER apenas para gerenciamento de entidades (update/delete entity)
"""

import re

with open('server/routers.ts', 'r') as f:
    content = f.read()

# 1. Adicionar import do requireEntityAccess
old_import = 'import { TRPCError } from "@trpc/server";'
new_import = '''import { TRPCError } from "@trpc/server";
import { requireEntityAccess } from "./_core/entity-auth";'''

content = content.replace(old_import, new_import, 1)

# 2. Atualizar entities.list para incluir entidades compartilhadas
old_list = '''    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getEntitiesByUserId(ctx.user.id);
    }),'''

new_list = '''    list: protectedProcedure.query(async ({ ctx }) => {
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
    }),'''

content = content.replace(old_list, new_list, 1)

# 3. Atualizar entities.getById para aceitar membros
old_getById = '''    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const entity = await db.getEntityById(input.id);
      if (!entity) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
      }
      if (entity.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return entity;
    }),'''

new_getById = '''    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
      const entity = await db.getEntityById(input.id);
      if (!entity) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
      }
      const role = await requireEntityAccess(input.id, ctx.user.id, "VIEWER");
      return { ...entity, myRole: role };
    }),'''

content = content.replace(old_getById, new_getById, 1)

print("Substituições concluídas.")
print("Ocorrências restantes de 'entity.userId !== ctx.user.id':", content.count('entity.userId !== ctx.user.id'))

with open('server/routers.ts', 'w') as f:
    f.write(content)

print("Arquivo salvo.")
