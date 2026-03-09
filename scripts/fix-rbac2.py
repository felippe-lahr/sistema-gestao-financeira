"""
Script para substituir todas as verificações entity.userId !== ctx.user.id
por requireEntityAccess com o role mínimo correto.

Regras:
- Leitura (query/get/list): VIEWER
- Criação/Edição (create/update): EDITOR
- Exclusão (delete): ADMIN
- Entidades próprias (entities.update/delete): OWNER (apenas dono pode excluir/editar a entidade em si)
"""

import re

with open("server/routers.ts", "r") as f:
    lines = f.readlines()

# Mapeamento de linha -> role correto baseado na análise acima
# Linhas com verificações entity.userId !== ctx.user.id
line_roles = {
    # entities.update (linha ~84) — OWNER (só dono edita/deleta a entidade)
    84: "OWNER",
    # entities.delete (linha ~98) — OWNER
    98: "OWNER",
    # entities.updateOrder loop (linha ~118) — OWNER
    118: "OWNER",
    # transactions.summary (linha ~415) — VIEWER
    415: "VIEWER",
    # transactions.listByEntity (linha ~433) — VIEWER (já substituído, pode não existir)
    # transactions.update (linha ~586) — EDITOR
    586: "EDITOR",
    # transactions.deleteRecurring loop (linha ~606) — ADMIN
    606: "ADMIN",
    # export ZIP (linha ~891) — VIEWER
    891: "VIEWER",
    # export PDF (linha ~1008) — VIEWER
    1008: "VIEWER",
    # attachments.listByTransaction (linha ~1085) — VIEWER
    1085: "VIEWER",
    # attachments.create (linha ~1109) — EDITOR
    1109: "EDITOR",
    # attachments.delete (linha ~1129) — ADMIN
    1129: "ADMIN",
    # attachments.updateType (linha ~1154) — EDITOR
    1154: "EDITOR",
    # investments.getById (linha ~1181) — VIEWER
    1181: "VIEWER",
    # investments.create (linha ~1212) — EDITOR
    1212: "EDITOR",
    # investments.update (linha ~1254) — EDITOR
    1254: "EDITOR",
    # investments.delete (linha ~1269) — ADMIN
    1269: "ADMIN",
    # investments.getHistory (linha ~1301) — VIEWER
    1301: "VIEWER",
    # investments.getTransactions (linha ~1316) — VIEWER
    1316: "VIEWER",
    # investments.addTransaction (linha ~1342) — EDITOR
    1342: "EDITOR",
    # investments.deleteTransaction (linha ~1360) — ADMIN
    1360: "ADMIN",
    # tasks (linha ~1770) — VIEWER/EDITOR
    1770: "VIEWER",
    # tasks create/update (linha ~1900) — EDITOR
    1900: "EDITOR",
    # entitySharing (linha ~2053) — OWNER
    2053: "OWNER",
    # entitySharing (linha ~2188) — OWNER
    2188: "OWNER",
    # entitySharing (linha ~2230) — OWNER
    2230: "OWNER",
}

# Encontrar as linhas reais com entity.userId !== ctx.user.id
actual_lines = []
for i, line in enumerate(lines, 1):
    if "entity.userId !== ctx.user.id" in line:
        actual_lines.append(i)

print(f"Linhas encontradas: {actual_lines}")

# Para cada linha encontrada, determinar o role baseado na proximidade com as linhas esperadas
def find_closest_role(line_num, line_roles):
    closest = min(line_roles.keys(), key=lambda x: abs(x - line_num))
    if abs(closest - line_num) <= 15:  # tolerância de 15 linhas
        return line_roles[closest]
    return "VIEWER"  # default seguro

# Determinar o entityId a usar baseado no contexto
def get_entity_id_expr(line_num, lines):
    """Olha para trás até 20 linhas para encontrar o entityId"""
    for i in range(line_num - 1, max(0, line_num - 20), -1):
        line = lines[i - 1]
        if "transaction.entityId" in line or "investment.entityId" in line or "attachment.transactionId" in line:
            # Precisa de entityId via objeto relacionado
            if "transaction" in line:
                return "transaction.entityId"
            elif "investment" in line:
                return "investment.entityId"
        if "input.entityId" in line:
            return "input.entityId"
    return "entity.id"

# Aplicar substituições
new_lines = list(lines)
offset = 0  # compensar remoção de linhas

for orig_line_num in actual_lines:
    curr_line_num = orig_line_num + offset
    role = find_closest_role(orig_line_num, line_roles)
    
    # Encontrar o bloco: const entity = ...; if (!entity || ...) { throw ... }
    # Pode ser 3 ou 4 linhas antes da linha com entity.userId
    
    # A linha atual é a do if (!entity || entity.userId !== ctx.user.id)
    if_line = curr_line_num - 1  # 0-indexed
    
    # Verificar se a linha anterior é o const entity = await db.getEntityById(...)
    entity_fetch_line = if_line - 1
    
    if entity_fetch_line >= 0 and "const entity = await db.getEntityById(" in new_lines[entity_fetch_line]:
        # Determinar o entityId
        entity_fetch = new_lines[entity_fetch_line].strip()
        # Extrair o argumento: getEntityById(X)
        match = re.search(r'getEntityById\(([^)]+)\)', entity_fetch)
        if match:
            entity_arg = match.group(1)
            # Determinar qual entityId usar
            if entity_arg == "input.entityId":
                entity_id_expr = "input.entityId"
            elif entity_arg == "transaction.entityId":
                entity_id_expr = "transaction.entityId"
            elif entity_arg == "investment.entityId":
                entity_id_expr = "investment.entityId"
            else:
                entity_id_expr = entity_arg
        else:
            entity_id_expr = "input.entityId"
        
        # Obter indentação da linha do const entity
        indent = len(new_lines[entity_fetch_line]) - len(new_lines[entity_fetch_line].lstrip())
        indent_str = " " * indent
        
        # Linhas a remover: const entity, if (!entity...), throw, }
        # Verificar as próximas linhas
        throw_line = if_line + 1
        close_line = if_line + 2
        
        if (throw_line < len(new_lines) and 
            close_line < len(new_lines) and
            'throw new TRPCError' in new_lines[throw_line] and
            new_lines[close_line].strip() == '}'):
            
            # Substituir as 4 linhas por 1 linha de requireEntityAccess
            replacement = f'{indent_str}await requireEntityAccess({entity_id_expr}, ctx.user.id, "{role}");\n'
            
            # Remover as 4 linhas e inserir 1
            del new_lines[entity_fetch_line:close_line + 1]
            new_lines.insert(entity_fetch_line, replacement)
            
            # Ajustar offset (removemos 4, adicionamos 1 = -3)
            offset -= 3
            print(f"Substituído na linha original {orig_line_num}: {entity_id_expr} -> {role}")
        else:
            print(f"SKIP linha {orig_line_num}: estrutura inesperada")
    else:
        print(f"SKIP linha {orig_line_num}: não encontrou const entity antes")

with open("server/routers.ts", "w") as f:
    f.writelines(new_lines)

print("\nConcluído!")
remaining = sum(1 for line in new_lines if "entity.userId !== ctx.user.id" in line)
print(f"Verificações entity.userId restantes: {remaining}")
