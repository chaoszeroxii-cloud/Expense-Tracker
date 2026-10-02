# AGENTS.md — MoneyFlow Expense Tracker

Mobile-first PWA: React 18 + NestJS 10 + PostgreSQL + Docker.
See `README.md` for project overview, quick start, and API reference.

## Commands

| Scope | Command | Notes |
|-------|---------|-------|
| Dev (full stack) | `docker compose up --build` | DB + backend + frontend + pgAdmin |
| Backend dev | `cd backend && npm run start:dev` | NestJS watch mode, port 3001 |
| Backend build | `cd backend && npm run build` | → `dist/` |
| Frontend dev | `cd frontend && npm run dev` | Vite, port 5173 → proxied as 3000 in Docker |
| Frontend build | `cd frontend && npm run build` | → `dist/`, served by nginx in prod |
| Prod deploy | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` | |
| DB migrations | `cd backend && npm run build && npm run migration:run` | TypeORM migrations in `backend/src/migrations/`. Applied automatically by `start:prod` and by docker-compose |

| Backend typecheck | `cd backend && npm run typecheck` | Covers `src/` **and** `api/` |
| Backend e2e | `cd backend && npm run test:e2e` | Real Postgres + real server — see `backend/.e2e/README.md` |

> **No lint script exists in either workspace.** You may add one; it is not expected.
> The e2e suite is not wired into CI — it needs a database, so it is run deliberately.

## Architecture

### Backend (NestJS)
- **Auth:** Global `JwtAuthGuard` via `APP_GUARD` — every route requires JWT by default. Opt-out with `@Public()` decorator on individual routes.
- **ORM:** TypeORM 0.3. `synchronize` is **off everywhere** — migrations own the schema. It used to be on outside production and had dropped every CHECK constraint and hand-written index, and rewritten two varchar columns as native enums. Entities are listed in `database.config.ts`.
- **Validation:** Global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform). DTOs use `class-validator` decorators.
- **Module pattern:** Each feature gets `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.entity.ts`, `dto/*.dto.ts`.
- **tsconfig caveat:** `strictNullChecks: false` — no strict null enforcement.
- **Serverless entry:** `backend/api/index.ts` (Vercel) — promise-cached NestJS app, separate
  from `src/main.ts` but sharing `getCorsOptions()` so the two allow-lists cannot diverge.
  Type-checked via `tsconfig.api.json` (`npm run typecheck`), because when it was excluded
  it silently drifted: it had lost PUT from its CORS verbs and capped bodies at 100 kB
  while `main.ts` allowed 20 MB.
- **Dates:** every month/day boundary belongs to the *user's* timezone. Use the predicate
  helpers in `common/local-date.util.ts` (`monthRangePredicate`, `yearRangePredicate`,
  `monthSpanPredicate`, `localDayExpr`) — never `TO_CHAR(occurred_at, 'YYYY-MM')`, which
  formats in the server's zone and also defeats `idx_expenses_user_occurred`.
- **Proxies:** `app.set('trust proxy', TRUST_PROXY_HOPS)` in both entry points. Without it
  `ThrottlerGuard` keys every caller to the load balancer's IP — one shared 100 req/min
  bucket for the whole user base.

### Frontend (React + Vite)
- **Routing:** `react-router-dom` v6 with `Layout` (bottom nav + `<Outlet>`) and `PrivateRoute` (auth guard navigating to `/login`). The `/add` route renders **without** `Layout`.
- **State:** Zustand stores (`auth`, `theme`, `i18n`) — all persist to localStorage with `flo_` prefix.
- **i18n:** Custom dictionary in `i18n.store.ts` — `useT()` hook returns `t(key)` function. Add keys to both `en` and `th` dicts.
- **API client:** Axios instance (`src/api/index.ts`) with JWT interceptor; auto-redirects to `/login` on 401.
- **Icons:** **MDI** (`@mdi/react` + `@mdi/js`) is the primary icon system. Legacy emoji support via `iconMap.ts` fallback. See `utils/iconMap.ts` for available icon IDs.
- **Theming:** CSS custom properties (`--bg-app`, `--bg-card`, `--border`, etc.) defined in `index.css`, switched via `.dark` class on `<html>`. Tailwind `darkMode: 'class'`.
- **Number format:** Thai locale (`th-TH`) in `Amount` component.
- **Data fetching:** `useFetch<T>(fetchFn, deps)` generic hook → `{ data, loading, error, refetch }`.

### Database
- PostgreSQL 16 with the `uuid-ossp` and `pgcrypto` extensions.
- **Schema lives in `backend/src/migrations/`** — see `database/README.md`. Generate with
  `npm run migration:generate -- src/migrations/Name` (build first; the CLI runs against
  `dist/`). Generation does not capture CHECK constraints, extra indexes, or data
  backfills — hand-write those, and remember a new column with a non-obvious default
  usually needs a backfill beside it.
- **Allocation system (envelope budgeting):** Two join tables — `allocation_categories` (expense categories drain wallet) and `allocation_income_categories` (income categories credit wallet). Balance mutations happen in `ExpensesService`: income credits linked wallets, expenses debit linked wallets.
- Both `FrontendAllocation` type and backend entity track `categories[]` and `incomeCategories[]`.

## Development Pitfalls

1. **No `.env` is committed.** Copy `.env.example` → `.env` and fill in `DB_PASSWORD` + `JWT_SECRET`.
2. **Backend tsconfig excludes `api/`.** The Vercel entry file is not type-checked as part of the main project.
3. **i18n keys must exist in both `en` and `th`** dictionaries in `i18n.store.ts`, otherwise `useT()` returns the key string.
4. **Allocation balance updates** happen in `ExpensesService` transactions — when adding
   allocation features, always go through the service, never mutate `balance` directly.
   The chat tools now do this too; the hand-written SQL they used before had drifted far
   enough that `delete_transaction` reversed `total_balance` and left the envelope short.
5. **A category funds at most one wallet.** Enforced by a unique index on
   `allocation_categories(category_id)` (migration 1785220000000) plus a service check, not
   just the greyed-out button in the wallet editor — the API and the chat tools bypass that.
6. **Reversals read `expenses.allocation_id` only.** Falling back to "whichever wallet this
   category is linked to now" credited wallets that had never been debited.
7. **Optional client secrets are optional.** A missing `VITE_GOOGLE_CLIENT_ID` must not
   render the Google button: `useGoogleLogin` initialises Google's token client with the
   empty id, throws from an effect, and takes the whole app down to a blank page.
5. **Docker volume mounts:** `backend/src` and `frontend/src` are bind-mounted for hot reload in dev. `node_modules` are anonymous volumes (not synced to host).
