# Relatório de Desenvolvimento — UnifiquePro

Compilação de tudo que foi desenvolvido, organizada por área.
Base: histórico git (**103 commits**, de 2026-05-28 a 2026-07-13).
Última atualização: 2026-07-13.

> Para o stack técnico e arquitetura, ver `docs/STACK.md`.
> Para o planejamento futuro, ver `roadmap.md`.
> Para o backlog histórico detalhado, ver `todo.md`.

---

## 1. Autenticação & Segurança

- Autenticação por cookie de sessão; RBAC por entidade (VIEWER/EDITOR/ADMIN).
- **Recuperação de senha** — fluxo completo (token, e-mail, reset).
- **Verificação de e-mail** e cadastro (Signup).
- **2FA TOTP** (Google Authenticator): ativação, confirmação, login.
- **Login com Google** (OAuth).
- Rate limiting por IP; helmet, CORS restrito, sanitização.
- Remetente/logo/nome da app configuráveis por variáveis de ambiente.

## 2. Entidades, Compartilhamento & Organizações

- CRUD de entidades dinâmicas com segregação total de dados.
- Home como painel de entidades (cards clicáveis → dashboard da entidade).
- Multi-tenancy (organizations/members) e **convites de entidade**
  (`entity_invites`, AcceptInvite).
- Conta/cartão padrão por entidade.

## 3. Controle Financeiro (Transações)

- Receitas/despesas com status (pendente/pago/vencido) e datas.
- **Recorrência avançada**: repetir por N vezes, frequências (dia/semana/
  mês/ano), numeração de parcela (`X/Y`), incremento automático de datas.
- **Edição com escopo de série**: "somente esta / esta e as próximas /
  todas as parcelas" ao alterar valor (ideal p/ reajustes; preserva pagas).
- Detecção de série por `parentTransactionId` **e** por padrão de descrição
  (`(X/Y)`), cobrindo dados legados.
- Categorização inline (popover) e **em lote**; associação a categoria,
  conta e meio de pagamento.
- **Sugestão de categorias em lote com IA** — aprende do histórico do
  usuário, em lotes, só sugere com confiança; usuário revisa e confirma.
- Filtros (período/ano/mês/categoria/tipo/status/conta) e busca.
- Remoção com confirmação.

## 4. Cartões de Crédito

- Cadastro de cartões (bandeira, limite, fechamento, vencimento, cor).
- **Faturas**: agrupamento de transações por cartão no grid, com status e
  total; valor real do PDF (`invoiceTotal`) como autoritativo.
- **Pagar fatura**: débito na conta escolhida, marca transações como pagas;
  **estorno** (toggle) que reverte a fatura para não paga.
- Não gera transação avulsa ao pagar (débito real vem da conciliação OFX).
- **Categoria por cartão** (dimensão do cartão como um todo) — para
  relatórios de gasto por cartão, sem alterar a categoria de cada transação.
- **Importação de faturas por IA** (PDF e CSV): extração de transações,
  parcelas, datas, valores.
- **Deduplicação de parcelas** por identidade (base + `X/Y` + valor),
  ignorando datas divergentes da IA; distingue titular vs adicional.
- **Rotina de revisão/remoção de duplicatas** já existentes (com confirmação).

## 5. Contas Bancárias

- CRUD de contas por entidade; conta padrão.
- **Extrato com projeção de saldo** (saldo corrido, exclui cartão).
- **Importação/conciliação OFX** (importar novo / conciliar existente / ignorar).
- Padronização visual com a página de Transações.

## 6. Dashboards & Relatórios

- Dashboard por entidade e visão geral (OverallDashboard) com métricas em
  tempo real (créditos, débitos, saldo, pendências).
- Gráficos: fluxo de caixa (área), distribuição por categoria (barras),
  débitos mensais por categoria.
- **Gráfico animado de gastos por cartão de crédito** (donut por categoria
  do cartão + barras animadas por cartão, responsivo) — usa o total do PDF.
- Relatórios exportáveis (PDF/Excel) e página de Reports.

## 7. Bot WhatsApp (Meta Cloud API)

- Migração completa da Evolution API para **Meta Cloud API**.
- Lançamento de transações por **voz, texto e imagem** (comprovante).
- Transcrição de áudio e extração de dados via IA; classificação de categoria
  em passo dedicado de LLM.
- Recorrências e contas de consumo (valor variável) via conversa.
- Resolução de conta/meio de pagamento/entidade/cartão por nome.
- **Anexo de documentos** a transações existentes, com tipo de documento
  (comprovante/boleto/NF/documento); comprovante marca como pago.
- Lista pendentes/vencidas por mês; **cartões aparecem como fatura única**
  (não as compras internas), com valor igual ao da frente do card.
- Correções: nomes de arquivo únicos (evita sobrescrita de comprovantes),
  roteamento LID, deduplicação de mensagens, timezone de datas.

## 8. Módulos adicionais

- **Agenda/Tarefas** com sincronização Google Calendar (aplicar a todas as
  recorrentes; criar/atualizar/deletar eventos).
- **Investimentos** — Tesouro Direto/SELIC (cache de títulos, histórico).
- **Aluguéis** (rentals) — configs, anexos, logs de sync.
- **Planos/Billing** — base Stripe.
- **Admin** — administração do sistema.

## 9. UI/UX & Design

- **Redesign UnifiquePro** aplicado em produção (paleta semântica, tokens).
- **Dark mode** completo com overrides globais.
- **Login redesenhado** (fundo azul, glassmorphism, widgets flutuantes).
- Drag-and-drop de categorias para criar/remover subcategorias.
- Padronização de cores de status, badges e espaçamentos.
- Favicon, apple-touch-icon, webmanifest e meta tags OG/Twitter.
- Responsividade mobile/tablet/desktop.

## 10. Infra, Deploy & Correções de plataforma

- Deploy Railway/nixpacks com **build limpo** (evita CSS/artefatos cacheados).
- Correção de **chunk obsoleto** pós-deploy: `index.html` no-cache + assets
  imutáveis + auto-reload no ErrorBoundary.
- Migrações idempotentes no start.
- Diagnóstico e correção de rate limit e cache de produção.

---

## Linha do tempo (marcos)

| Período | Destaques |
|---------|-----------|
| Mai/2026 | Bot WhatsApp (LID/Baileys), dedup de mensagens, cartão PENDING |
| Jun/2026 (1ª q.) | Classificação por LLM, anexo de documentos, recuperação de senha, extrato bancário |
| Jun/2026 (2ª q.) | Migração p/ Meta Cloud API, redesign UnifiquePro + dark mode, login novo |
| Jun–Jul/2026 | Drag-and-drop categorias, padronização visual, fixes de deploy/cache |
| Jul/2026 | Escopo de série, cartões (categoria, estorno, dedup, gráfico), IA de categorização em lote, correções do bot, roadmap PWA |

---

*Relatório gerado a partir do histórico git. Para detalhamento por commit:
`git log --reverse --pretty=format:"%ad %s" --date=short`.*
