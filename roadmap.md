# Roadmap — UnifiquePro

Itens planejados / em avaliação. Para o histórico detalhado de features já
entregues, ver `todo.md`.

---

## PWA Mobile + Notificações Push

**Status:** Concluído (Fase 1 em 2026-10-17, Fases 2–3 em 2026-10-23) · **Prioridade:** Média-alta · **Viabilidade:** Alta

Transformar a aplicação em PWA instalável no celular, com notificações push.

### Já existe (fundação pronta)
- [x] `site.webmanifest` com `display: standalone`, `theme_color`, ícones
- [x] Ícones (`android-chrome-192/512`, `apple-touch-icon`)
- [x] Manifest linkado no `index.html`
- [x] HTTPS em domínio próprio (`app.unifiquepro.com.br`)
- [x] Servidor Node persistente no Railway (pode disparar push direto)

### Fase 1 — PWA instalável (~meio dia)
- [x] Adicionar `vite-plugin-pwa` (Workbox) para gerar o service worker
- [x] Cache offline do app shell
- [x] Instalação na Tela de Início + splash screen
- [x] Auto-update do service worker (`skipWaiting`/`clientsClaim`) com prompt
      de "nova versão disponível"
- [x] ⚠️ Garantir que o cache do SW não reintroduza o bug de chunk/asset
      obsoleto (ver fix de `no-cache` no `index.html`)

### Fase 2 — Push ponta a ponta ✅ (2026-10-23)
- [x] Chaves VAPID (env `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` ou geradas e
      salvas em `app_settings`)
- [x] Lib `web-push` no backend Express
- [x] Tabela `push_subscriptions` por usuário/aparelho (endpoint + p256dh/auth)
- [x] Handlers `push` e `notificationclick` no service worker (`push-sw.js`)
- [x] Tela **Notificações** (`/notificacoes`): ativar no aparelho, teste,
      preferências por tipo e por entidade
- [x] Orientação no iOS: push só pelo app instalado na Tela de Início

### Fase 3 — Gatilhos + agendador ✅ (2026-10-23)
- [x] Agendador `node-cron` a cada 5 min com deduplicação (`notification_log`)
- [x] Lembrete de compromissos da agenda (antecedência configurável)
- [x] Resumo diário às 7h (São Paulo): agenda do dia, contas a pagar e a
      receber por entidade (no dia / X dias antes)
- [x] Reservas: nova reserva (criada por outro membro) e check-in/check-out
- [ ] Vencimento de fatura de cartão (ex: "Fatura do Nubank vence amanhã")

### Ressalvas de plataforma
- **Android (Chrome/Edge):** push total.
- **Desktop:** push total.
- **iPhone (Safari):** push só a partir do **iOS 16.4** e **apenas com o PWA
  instalado na Tela de Início** — não funciona na aba do navegador.

### Consideração estratégica
Canal complementar ao bot do WhatsApp: WhatsApp para interação, push para
lembretes rápidos sem depender do WhatsApp.

---

## Checklist de ações nas tarefas da Agenda

**Status:** ✅ Concluído (2026-08-04) · **Prioridade:** Média

Checklist de subtarefas dentro do card de uma tarefa da Agenda; ao completar
100% dos itens, a tarefa é finalizada automaticamente.

- [x] Coluna `checklist` (JSON) na tabela `tasks` + migração idempotente
- [x] Seção de checklist no drawer da tarefa com barra de progresso e %
- [x] Adicionar / marcar / remover itens
- [x] 100% dos itens → tarefa concluída automaticamente
- [x] Desmarcar um item → tarefa reaberta automaticamente (status derivado no
      servidor em `tasks.update`)
- [x] Indicador de progresso `☑ N/M` nas visões mês e semana

---

## Conformidade legal & segurança (Google Safe Browsing / LGPD)

**Status:** ✅ Concluído (2026-09-15) · **Prioridade:** Alta

O domínio `app.unifiquepro.com.br` havia sido sinalizado pelo Google como
"página enganosa" (Social Engineering), bloqueando o acesso no Chrome.
Resolvido com adequação às diretrizes do Google e à LGPD, e revisão aprovada
no Search Console ("Nenhum problema foi detectado").

- [x] Verificação da propriedade no Google Search Console (arquivo HTML servido em `client/public/`)
- [x] Página pública de **Termos de Uso** (`/termos`) — inclui direito de arrependimento (CDC) e cláusula de que o app não é aconselhamento financeiro
- [x] Página pública de **Política de Privacidade** (`/privacidade`) — LGPD, com as integrações reais (Google, AWS S3, Stripe, IA, WhatsApp/Meta, e-mail)
- [x] Página pública de **Exclusão de Dados** (`/exclusao-de-dados`) — LGPD
- [x] Identificação da empresa (Studio44 / CNPJ 23.192.161/0001-20) e contato `contato@unifiquepro.com.br` em `client/src/lib/legal.ts`
- [x] Rodapé institucional (links legais + identificação) na tela de login
- [x] Aceite obrigatório dos Termos/Privacidade no cadastro
- [x] Banner de cookies (LGPD)
- [x] Redesign profissional das páginas legais (header da marca + logo branco)
- [x] Pedido de revisão ao Google **aprovado** — alerta "Dangerous site" removido

**Atenção (risco de reincidência):** o gatilho provável do flag foi a
semelhança do nome "UnifiquePro" com a marca "Unifique" (Unifique
Telecomunicações). Se o alerta reincidir, avaliar diferenciação de marca/domínio.
