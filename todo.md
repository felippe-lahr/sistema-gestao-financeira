# Sistema de Gestão Financeira - TODO

## 1. Autenticação e Segurança
- [x] Sistema de autenticação com NextAuth.js
- [x] Controle de acesso baseado em roles (admin/user)
- [x] Middleware de proteção de rotas
- [ ] Rate limiting via Edge Middleware

## 2. Banco de Dados e Schema
- [x] Schema de entidades (entities)
- [x] Schema de transações (transactions)
- [x] Schema de categorias (categories)
- [x] Schema de anexos (attachments)
- [x] Migrations e seed data

## 3. Gestão de Entidades Dinâmicas
- [x] CRUD de entidades personalizadas
- [x] Segregação de dados por entidade
- [x] Interface de gerenciamento de entidades
- [x] Validação e permissões

## 4. Controle Financeiro
- [x] Cadastro de receitas e despesas
- [x] Sistema de status (pendente/pago/vencido)
- [x] Despesas recorrentes automáticas
- [x] Sistema de categorização com tags
- [ ] Upload de comprovantes via Vercel Blob

## 5. Dashboard e Visualizações
- [x] Dashboard com métricas em tempo real
- [x] Gráficos de fluxo de caixa
- [x] Gráficos de distribuição de categorias
- [x] Tabela de transações recentes
- [x] Filtros e busca

## 6. Relatórios
- [ ] Relatórios personalizados por período
- [ ] Filtros por categoria e entidade
- [ ] Exportação em PDF

## 7. Integração WhatsApp
- [ ] Webhook para WhatsApp Business API
- [ ] Recebimento de mensagens de voz
- [ ] Processamento de áudio via Edge Functions

## 8. Processamento de IA
- [ ] Transcrição de áudio com OpenAI Whisper
- [ ] Extração de dados com LLM (valor, data, descrição)
- [ ] Classificação automática de categorias
- [ ] Sistema de confirmação interativa

## 9. Notificações
- [ ] Notificações de vencimentos
- [ ] Alertas de metas orçamentárias
- [ ] Notificações de anomalias
- [ ] Integração com sistema de notificações Manus

## 10. Interface e Design
- [x] Design system com Tailwind CSS
- [x] Componentes reutilizáveis com Radix UI
- [x] Tela de login
- [x] Dashboard principal
- [x] Gerenciamento de entidades
- [x] Formulário de lançamentos
- [ ] Interface de integração WhatsApp
- [x] Responsividade mobile/tablet/desktop

## 11. Testes e Qualidade
- [x] Testes unitários com Vitest
- [x] Testes de integração de APIs
- [x] Validação de formulários
- [x] Error handling

## 12. Deploy e Otimização
- [ ] Configuração para Vercel
- [ ] Otimização de performance
- [ ] Monitoramento e analytics
- [ ] Documentação final

## 13. Novas Funcionalidades Solicitadas
- [x] Cadastro de Contas Correntes por entidade
- [x] Cadastro de Meios de Pagamento por entidade
- [x] Sistema completo de Categorias personalizadas com cores
- [x] Vincular transações a contas correntes
- [x] Vincular transações a meios de pagamento
- [x] Interface de gerenciamento de contas correntes
- [x] Interface de gerenciamento de meios de pagamento
- [x] Interface de gerenciamento de categorias personalizadas

## 14. Melhorias de UX Solicitadas
- [x] Redesenhar tela inicial como painel de entidades
- [x] Criar cards clicáveis para cada entidade
- [x] Mover dashboard atual para visualização por entidade
- [x] Adicionar tags coloridas de categorias na lista de transações
- [x] Implementar navegação: Home (entidades) → Dashboard da entidade

## 15. Bugs Reportados
- [x] Corrigir erro "Failed to fetch" no dashboard da entidade (ID 30002)
- [x] Investigar problema nas queries tRPC do dashboard

## 16. Novas Funcionalidades - Filtros e Edição
- [x] Implementar filtros na lista de transações
  - [x] Filtro por período personalizado (data início e fim)
  - [x] Filtro por ano
  - [x] Filtro por mês do ano
  - [x] Filtro por categoria
  - [x] Filtro por tipo (receita/despesa)
- [x] Implementar edição de transações
  - [x] Modal de edição com todos os campos
  - [x] Validação e atualização no backend
- [ ] Implementar edição de configurações
  - [ ] Editar contas correntes
  - [ ] Editar meios de pagamento
  - [ ] Editar categorias
- [x] Associação multi-entidade
  - [x] Permitir vincular contas correntes a múltiplas entidades
  - [x] Permitir vincular meios de pagamento a múltiplas entidades
  - [x] Permitir vincular categorias a múltiplas entidades
  - [x] Atualizar schema do banco de dados
- [x] Integração no formulário de transações
  - [x] Adicionar seleção de conta corrente
  - [x] Adicionar seleção de meio de pagamento
  - [x] Adicionar seleção de categoria
  - [x] Carregar opções filtradas por entidade

## 17. Bugs Reportados
- [x] Corrigir erro de SelectItem com value vazio na página de transações

## 18. Novas Funcionalidades - Remoção e Recorrência
- [x] Implementar remoção de transações
  - [x] Botão de excluir na lista de transações
  - [x] Confirmação antes de remover
  - [x] Endpoint de delete no backend
- [x] Implementar remoção de configurações
  - [x] Remover contas correntes
  - [x] Remover meios de pagamento
  - [x] Remover categorias
- [ ] Implementar edição de configurações
  - [ ] Editar contas correntes (modal com todos os campos)
  - [ ] Editar meios de pagamento
  - [ ] Editar categorias
- [ ] Sistema de recorrência inteligente
  - [ ] Criar múltiplas transações ao marcar como recorrente
  - [ ] Dividir valor total em parcelas
  - [ ] Mostrar valor total e valor parcelado
  - [ ] Incrementar datas automaticamente (mensal)
  - [ ] Adicionar campo de número de parcelas

## 19. Melhorias em Configurações - Associação e Edição
- [ ] Adicionar seleção de entidades no cadastro
  - [ ] Permitir selecionar múltiplas entidades ao criar conta corrente
  - [ ] Permitir selecionar múltiplas entidades ao criar meio de pagamento
  - [ ] Permitir selecionar múltiplas entidades ao criar categoria
- [x] Implementar edição completa de configurações
  - [x] Modal de edição de contas correntes com todos os campos
  - [x] Botão de edição em contas correntes
  - [x] Modal de edição de meios de pagamento com todos os campos
  - [x] Botão de edição em meios de pagamento
  - [x] Modal de edição de categorias com todos os campos
  - [x] Botão de edição em categorias
- [x] Garantir propagação de mudanças (automático via JOINs no banco)
  - [x] Alterações em categorias refletidas nas transações
  - [x] Alterações em contas correntes refletidas nas transações
  - [x] Alterações em meios de pagamento refletidas nas transações

## 20. Sistema de Recorrência Avançado
- [x] Adicionar toggle "Repetir lançamento?" no formulário de transações
- [x] Adicionar campo numérico "Repetir por" (quantidade de repetições)
- [x] Adicionar dropdown "Frequência" com opções: Dia(s), Semana(s), Mês(es), Ano(s)
- [x] Implementar lógica de criação de múltiplas transações
- [x] Incrementar datas conforme frequência selecionada
- [x] Adicionar indicação de parcela na descrição (ex: "1/5", "2/5")
- [ ] Exibir valor total e valor parcelado no formulário
- [ ] Validar campos de recorrência antes de criar transações
