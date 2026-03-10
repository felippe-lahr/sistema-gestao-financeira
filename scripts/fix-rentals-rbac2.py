"""
Corrige RBAC nas rotas de rentals e rentalAttachments no routers.ts.
Abordagem: lê linha a linha e substitui os blocos problemáticos.
"""

with open("server/routers.ts", "r") as f:
    lines = f.readlines()

new_lines = []
i = 0
changes = 0

while i < len(lines):
    line = lines[i]

    # Padrão: if (!rental || rental.userId !== ctx.user.id) {
    # Precisamos olhar o contexto para saber qual role usar
    if 'rental.userId !== ctx.user.id' in line:
        # Olhar para trás para identificar o contexto (qual função)
        # Procurar a função mais próxima acima
        context = ''.join(lines[max(0,i-30):i])
        
        # Determinar o role baseado no contexto
        if 'deleteRental' in context or ('delete' in context and 'rentalAttachments' not in context and i > 0):
            role = 'ADMIN'
        elif 'updateRental' in context or 'updateType' in context:
            role = 'EDITOR'
        elif 'createRental' in context or 'insert(rentalAttachments)' in context:
            role = 'EDITOR'
        elif 'listByRental' in context or 'select()' in context:
            role = 'VIEWER'
        else:
            role = 'EDITOR'  # default seguro

        # Pegar a indentação da linha atual
        indent = len(line) - len(line.lstrip())
        spaces = ' ' * indent

        # Substituir o bloco:
        # if (!rental || rental.userId !== ctx.user.id) {
        #   throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        # }
        # por:
        # if (!rental) throw new TRPCError({ code: "NOT_FOUND", message: "Rental not found" });
        # await requireEntityAccess(rental.entityId, ctx.user.id, "ROLE");

        # Verificar se a linha anterior tem "if (!rental ||" ou só "if (!rental"
        new_lines.append(f'{spaces}if (!rental) throw new TRPCError({{ code: "NOT_FOUND", message: "Rental not found" }});\n')
        new_lines.append(f'{spaces}await requireEntityAccess(rental.entityId, ctx.user.id, "{role}");\n')
        changes += 1

        # Pular a linha do throw e o fechamento }
        # Linha atual: if (!rental || rental.userId !== ctx.user.id) {
        # Próxima: throw new TRPCError(...)
        # Depois: }
        i += 1  # pular throw
        if i < len(lines) and 'throw new TRPCError' in lines[i]:
            i += 1  # pular throw
        if i < len(lines) and lines[i].strip() == '}':
            i += 1  # pular fechamento
        continue

    new_lines.append(line)
    i += 1

print(f"Substituições feitas: {changes}")

with open("server/routers.ts", "w") as f:
    f.writelines(new_lines)

print("OK: arquivo salvo.")
