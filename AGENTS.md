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
| DB migrations | auto-run from `database/init/*.sql` on first container start | Idempotent: use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` |

> **No test/lint scripts exist in either workspace.** You may add them but they are not expected.

## Architecture

### Backend (NestJS)
- **Auth:** Global `JwtAuthGuard` via `APP_GUARD` — every route requires JWT by default. Opt-out with `@Public()` decorator on individual routes.
- **ORM:** TypeORM 0.3 with `synchronize: true` in dev (tables auto-created from entities). Entities listed in `database.config.ts`.
- **Validation:** Global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform). DTOs use `class-validator` decorators.
- **Module pattern:** Each feature gets `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.entity.ts`, `dto/*.dto.ts`.
- **tsconfig caveat:** `strictNullChecks: false` — no strict null enforcement.
- **Serverless entry:** `backend/api/index.ts` (Vercel) — cached NestJS app singleton, separate from `src/main.ts`.

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
- PostgreSQL 16 with `pgcrypto` extension for `gen_random_uuid()`.
- Init scripts in `database/init/` run in numeric order on first container start.
- **Allocation system (envelope budgeting):** Two join tables — `allocation_categories` (expense categories drain wallet) and `allocation_income_categories` (income categories credit wallet). Balance mutations happen in `ExpensesService`: income credits linked wallets, expenses debit linked wallets.
- Both `FrontendAllocation` type and backend entity track `categories[]` and `incomeCategories[]`.

## Development Pitfalls

1. **No `.env` is committed.** Copy `.env.example` → `.env` and fill in `DB_PASSWORD` + `JWT_SECRET`.
2. **Backend tsconfig excludes `api/`.** The Vercel entry file is not type-checked as part of the main project.
3. **i18n keys must exist in both `en` and `th`** dictionaries in `i18n.store.ts`, otherwise `useT()` returns the key string.
4. **Allocation balance updates** happen in `ExpensesService` transactions — when adding allocation features, always go through the service, never mutate `balance` directly.
5. **Docker volume mounts:** `backend/src` and `frontend/src` are bind-mounted for hot reload in dev. `node_modules` are anonymous volumes (not synced to host).
