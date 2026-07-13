# Stack de Desenvolvimento & Arquitetura — UnifiquePro

Documentação técnica do sistema de gestão financeira UnifiquePro.
Última atualização: 2026-07-13.

---

## 1. Visão geral

Aplicação web full-stack (SPA + API) de gestão financeira multi-entidade, com
integração a WhatsApp, importação de faturas por IA, Google Calendar e módulos
de investimentos e aluguéis. Deploy contínuo no Railway.

- **Domínio de produção:** `app.unifiquepro.com.br`
- **Branch de produção:** `main` (deploy automático) · **staging:** `develop`
- **Monorepo** único: cliente + servidor + schema compartilhado

---

## 2. Frontend

| Camada | Tecnologia |
|--------|-----------|
| UI framework | **React 19** |
| Linguagem | **TypeScript 5.9** |
| Build/dev | **Vite 7** |
| Estilo | **Tailwind CSS v4** (tokens em `client/src/index.css`) |
| Componentes | **shadcn/ui** sobre **Radix UI** |
| Dados/API | **tRPC 11** + **TanStack React Query 5** |
| Rotas | **Wouter** |
| Gráficos | **Recharts 2** |
| Animações | **Framer Motion 12** |
| Drag-and-drop | **@dnd-kit/core** |
| Datas | **date-fns** |
| Toasts | **sonner** |
| Onboarding | **driver.js** |

- Tema claro/escuro via tokens CSS (`:root` / `.dark`) e overrides globais.
- Container responsivo customizado (`.container`) e utilitários mobile-first.
- Alias de imports: `@` → `client/src`, `@shared` → `shared`, `@assets` →
  `attached_assets`.

### Páginas principais (`client/src/pages/`)
Home (entidades), EntityDashboard, OverallDashboard, Transactions, BankAccounts,
CreditCards, Settings (categorias/meios/contas), Reports, Agenda, Investments,
TreasurySelic, Rentals, Admin, UserProfile, Planos, além do fluxo de auth
(Login/Signup/ForgotPassword/ResetPassword/VerifyEmail/AcceptInvite).

---

## 3. Backend

| Camada | Tecnologia |
|--------|-----------|
| Runtime | **Node.js** (servidor persistente) |
| HTTP | **Express 4** |
| API | **tRPC 11** (type-safe end-to-end) |
| Validação | **Zod 4** |
| ORM | **Drizzle ORM 0.44** |
| Banco | **PostgreSQL** (driver `postgres`) |
| Bundle | **esbuild** (ESM, `--packages=external`) |
| Segurança | **helmet**, **cors**, **cookie-parser**, rate limiting |

- Servidor em `server/_core/index.ts`; routers tRPC em `server/routers.ts`;
  acesso a dados em `server/db.ts`.
- Autenticação por **cookie de sessão**; RBAC por entidade
  (VIEWER/EDITOR/ADMIN) via `requireEntityAccess`.
- Rate limiter: janela de 15 min, `max: 500` por IP; `trust proxy` para o
  reverse proxy do Railway.
- SPA servida pelo próprio Express em produção (`serveStatic`): `index.html`
  com `no-cache`, assets com hash `immutable`.

### Módulos de serviço (`server/_core/`)
`llm.ts` (cliente LLM com cadeia de modelos e fallback), `whatsapp-bot.ts`
(bot completo Meta Cloud API), `credit-card-import-routes.ts` (import de faturas
PDF/CSV via IA), `ofx-routes.ts` (conciliação OFX), `s3.ts` (anexos),
`email.ts` (recuperação de senha, verificação), `google-auth.ts` +
`oauth.ts` (Google Calendar), `totp-auth.ts` (2FA), `password-auth.ts`,
`voiceTranscription.ts` (áudio→texto), `stripe-routes.ts` (billing, base),
`notification.ts`.

---

## 4. Banco de dados (Drizzle / PostgreSQL)

Tabelas (`drizzle/schema.ts`):

- **Núcleo:** `users`, `user_passwords`, `password_reset_tokens`,
  `email_verifications`, `organizations`, `organization_members`
- **Entidades & acesso:** `entities`, `entity_members`, `entity_invites`
- **Financeiro:** `transactions`, `categories`, `bank_accounts`,
  `payment_methods`, `attachments`
- **Cartão de crédito:** `credit_cards`, `credit_card_invoices`,
  `credit_card_invoice_attachments`
- **Importação:** `ofx_imports`, `ofx_transactions`
- **Investimentos:** `investments`, `investment_transactions`,
  `investment_history`, `treasury_direct_titles_cache`, `treasury_selic`
- **Aluguéis:** `rentals`, `rental_configs`, `rental_attachments`,
  `rental_sync_logs`
- **Agenda:** `tasks`
- **WhatsApp:** `whatsapp_messages` (+ colunas em `users`)

### Migrações
Script idempotente próprio em `scripts/migrate.ts` (rodado no start via
`pnpm start`), com `ALTER TABLE ... IF NOT EXISTS` — evita prompts do
`drizzle-kit push` em produção. Migrações SQL versionadas em `drizzle/`.

### Convenções
- Valores monetários em **centavos** (inteiros) para evitar erro de ponto
  flutuante.
- Séries (parcelas/recorrências) ligadas por `parentTransactionId`; o pai
  aponta para si mesmo.
- `creditCardId` gerenciado via SQL raw (fora do schema Drizzle da tabela
  transactions).

---

## 5. Inteligência Artificial

- Cliente unificado **`invokeLLM`** (`server/_core/llm.ts`) com cadeia de
  modelos e retry em 429/5xx.
- **Usos atuais:**
  - Extração de transações de faturas PDF/CSV (visão + texto)
  - Classificação de categoria (bot WhatsApp e sugestão em lote)
  - Transcrição de áudio (mensagens de voz do WhatsApp)
  - Extração de dados de comprovantes (imagem)
- **Sugestão de categorias em lote:** usa o histórico já categorizado do
  usuário como exemplos (few-shot), em lotes, sugerindo só com confiança.

---

## 6. Integrações externas

- **WhatsApp Business** — Meta Cloud API (migrado da Evolution API). Webhook,
  mensagens de voz/imagem/documento, lançamento e anexo de transações.
- **Google Calendar** — OAuth, sincronização de tarefas da Agenda.
- **AWS S3** — armazenamento de anexos (comprovantes, faturas).
- **OFX** — importação e conciliação de extratos bancários.
- **Stripe** — base de billing/planos.
- **Tesouro Direto / SELIC** — dados para o módulo de investimentos.

---

## 7. Infraestrutura & Deploy

- **Railway** com **nixpacks** (`nixpacks.toml`: poppler-utils, ffmpeg;
  build limpo `rm -rf dist client/.vite && pnpm build`).
- `railway.json`: builder NIXPACKS, `buildCommand: pnpm build`,
  `startCommand: pnpm start`.
- **Deploy automático** ao push no `main`.
- HTTPS/TLS gerenciado; variáveis de ambiente no painel do Railway.
- Estratégia de cache anti-"chunk obsoleto": `index.html` sempre revalidado,
  assets versionados por hash imutáveis.

### Variáveis de ambiente principais
`DATABASE_URL`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_VERIFY_TOKEN`, `AWS_*`/`AWS_S3_BUCKET`, chaves de LLM,
`ALLOWED_ORIGINS`/`FRONTEND_URL`, credenciais Google OAuth, Stripe.

---

## 8. Scripts npm

| Script | Função |
|--------|--------|
| `dev` | Servidor de desenvolvimento (`tsx watch`) |
| `build` | `vite build` + `esbuild` do servidor |
| `start` | `db:migrate` + `node dist/index.js` (produção) |
| `db:migrate` | Migrações idempotentes (`scripts/migrate.ts`) |
| `check` | `tsc --noEmit` |
| `test` | `vitest run` |

---

## 9. Estrutura de diretórios

```
client/      Frontend React (src/pages, src/components, src/lib)
server/      Backend Express + tRPC (routers.ts, db.ts, _core/)
shared/      Tipos/contratos compartilhados
drizzle/     Schema + migrações SQL
scripts/     Migração e utilitários
api/         Entrypoints/edge
patches/     Patches de dependências
docs/        Documentação (este arquivo, roadmap em /roadmap.md)
```

---

## 10. Qualidade

- Testes com **Vitest** (`server/*.test.ts`, incl. consistência de dashboard e
  logout de auth).
- Type-check com `tsc`.
- Padrões de segurança: helmet, CORS restrito, cookies httpOnly, 2FA TOTP,
  RBAC por entidade, sanitização de entrada.
