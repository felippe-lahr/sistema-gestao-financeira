/**
 * Helpers de autorização para entidades compartilhadas (RBAC).
 *
 * Hierarquia de roles:
 *   OWNER > ADMIN > EDITOR > VIEWER
 *
 * Permissões:
 *   VIEWER  — leitura, download de arquivos, exportação
 *   EDITOR  — VIEWER + criar/editar transações, categorias, contas
 *   ADMIN   — EDITOR + deletar registros
 *   OWNER   — ADMIN + gerenciar membros (convidar, remover, alterar roles)
 */

import { TRPCError } from "@trpc/server";
import { getEntityById, getEntityMember } from "../db";

export type EntityRole = "VIEWER" | "EDITOR" | "ADMIN" | "OWNER";

const ROLE_HIERARCHY: Record<EntityRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMIN: 3,
  OWNER: 4,
};

/**
 * Verifica se um role tem pelo menos o nível mínimo exigido.
 */
export function hasMinRole(role: EntityRole, minRole: EntityRole): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
}

/**
 * Resolve o role efetivo de um usuário em uma entidade.
 * Retorna "OWNER" se o usuário for o dono, o role de membro se for membro,
 * ou null se não tiver acesso.
 */
export async function resolveEntityRole(
  entityId: number,
  userId: number
): Promise<EntityRole | null> {
  const entity = await getEntityById(entityId);
  if (!entity) return null;

  if (entity.userId === userId) return "OWNER";

  const member = await getEntityMember(entityId, userId);
  if (!member) return null;

  return member.role as EntityRole;
}

/**
 * Verifica se o usuário tem acesso à entidade com pelo menos o role mínimo.
 * Lança TRPCError se não tiver acesso.
 * Retorna o role efetivo do usuário.
 */
export async function requireEntityAccess(
  entityId: number,
  userId: number,
  minRole: EntityRole = "VIEWER"
): Promise<EntityRole> {
  const role = await resolveEntityRole(entityId, userId);

  if (!role) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não tem acesso a esta entidade",
    });
  }

  if (!hasMinRole(role, minRole)) {
    const roleLabels: Record<EntityRole, string> = {
      VIEWER: "Visualizador",
      EDITOR: "Editor",
      ADMIN: "Administrador",
      OWNER: "Proprietário",
    };
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Esta ação requer permissão de ${roleLabels[minRole]} ou superior`,
    });
  }

  return role;
}
