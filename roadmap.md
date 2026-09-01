# Roadmap — UnifiquePro

Itens planejados / em avaliação. Para o histórico detalhado de features já
entregues, ver `todo.md`.

---

## PWA Mobile + Notificações Push

**Status:** Planejado · **Prioridade:** Média-alta · **Viabilidade:** Alta

Transformar a aplicação em PWA instalável no celular, com notificações push.

### Já existe (fundação pronta)
- [x] `site.webmanifest` com `display: standalone`, `theme_color`, ícones
- [x] Ícones (`android-chrome-192/512`, `apple-touch-icon`)
- [x] Manifest linkado no `index.html`
- [x] HTTPS em domínio próprio (`app.unifiquepro.com.br`)
- [x] Servidor Node persistente no Railway (pode disparar push direto)

### Fase 1 — PWA instalável (~meio dia)
- [ ] Adicionar `vite-plugin-pwa` (Workbox) para gerar o service worker
- [ ] Cache offline do app shell
- [ ] Instalação na Tela de Início + splash screen
- [ ] Auto-update do service worker (`skipWaiting`/`clientsClaim`) com prompt
      de "nova versão disponível"
- [ ] ⚠️ Garantir que o cache do SW não reintroduza o bug de chunk/asset
      obsoleto (ver fix de `no-cache` no `index.html`)

### Fase 2 — Push ponta a ponta (~1–2 dias)
- [ ] Gerar par de chaves VAPID
- [ ] Adicionar lib `web-push` no backend Express
- [ ] Tabela de push subscriptions por usuário (endpoint + chaves p256dh/auth)
- [ ] Handlers `push` e `notificationclick` no service worker
- [ ] UI de permissão + inscrição (`PushManager`) no frontend
- [ ] Onboarding no iOS orientando "Adicionar à Tela de Início"

### Fase 3 — Gatilhos + agendador (~1 dia)
- [ ] Gatilhos a partir de `upcomingTransactions`, Agenda/tarefas e
      vencimentos de fatura (ex: "Fatura do Nubank vence amanhã")
- [ ] Agendador de lembretes diários (cron do Railway ou node-cron)

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
