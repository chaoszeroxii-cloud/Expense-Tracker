# End-to-end checks

Exercises the money paths against a real backend and a real Postgres. A green
`npm run typecheck` says nothing about whether a balance moves correctly — most of what
this catches was invisible to every static check in the repo, including a 500 on
`GET /expenses?month=` that the type system was perfectly happy with.

```bash
# 1. throwaway database
docker run -d --name mf_e2e_db -p 15433:5432 \
  -e POSTGRES_PASSWORD=e2epass -e POSTGRES_USER=expense_user -e POSTGRES_DB=expense_tracker \
  postgres:16-alpine
docker exec mf_e2e_db psql -U expense_user -d expense_tracker \
  -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;'

# 2. schema + build
npm run build
DB_HOST=localhost DB_PORT=15433 DB_NAME=expense_tracker DB_USER=expense_user \
  DB_PASSWORD=e2epass npm run migration:run

# 3. server
DB_HOST=localhost DB_PORT=15433 DB_NAME=expense_tracker DB_USER=expense_user \
  DB_PASSWORD=e2epass JWT_SECRET=e2e-secret-that-is-definitely-long-enough-32 \
  PORT=3099 NODE_ENV=test node dist/main &

# 4. run
npm run test:e2e

# 5. clean up
docker rm -f mf_e2e_db
```

## Adding a check

Audit regressions (disposable database only): start Postgres on loopback port 15434,
database `moneyflow_fix_test`, user `expense_user`, password `fix-local-only`.
Start Vite on 5174 with `VITE_API_URL=http://127.0.0.1:3098`, build the backend,
then run `node .e2e/audit-regression.cjs` from backend. It starts its own server,
ignores project `.env`, mocks external OAuth, and verifies security, late bills,
queue recovery and a complete CSV download. It never uses the main database.

`node .e2e/bill-migration.cjs` verifies the occurrence backfill against legacy rows in
that same disposable database. It runs its schema/data changes in a transaction and
rolls everything back. Run it sequentially after the audit suite.

The browser suite mocks only external OAuth and selected failures/AI stream responses;
expense writes, authentication, planning and downloaded exports use the real API/DB.
Evidence is recorded in `docs/audits/2026-09-22-regression.json`.

Daily planning verification (same disposable server):

```bash
npm run test:planning
node --test test/daily-allowance.test.js
```

The planning suite covers clear/inherit semantics, preferences consistency, recurring
bill reservations, concurrent payment retries, linking/deleting actual expenses, savings
progress, historical wallet routing, ownership and account reset. Frontend integration
is `npm run test:planning --workspace frontend` with Vite on 5173 and
`VITE_API_URL=http://localhost:3099`. Both browser suites use project-local artifacts.

For the synthetic index experiment, explicitly set `PERF_TEST_DATABASE` to a disposable
database name containing `test` or `e2e`, plus `DB_PASSWORD`, `DB_USER` and `DB_PORT`.
Run `node .e2e/planning-performance.cjs`. Generated rows are rolled back.

When a local `.env` contains `DATABASE_URL`, explicitly override it to an empty string
for the disposable server. Otherwise it takes precedence over the `DB_*` variables.
Disable outbound service credentials in the test environment as needed.

Re-inject the defect it exists to catch and watch it go red before keeping it. An
assertion that has never failed is decoration — the timezone checks here were confirmed
by restoring `TO_CHAR(occurred_at, 'YYYY-MM')` and seeing the 1 February entry reappear
under January (`feb=0 jan=1`).
