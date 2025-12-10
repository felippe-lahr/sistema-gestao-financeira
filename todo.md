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
