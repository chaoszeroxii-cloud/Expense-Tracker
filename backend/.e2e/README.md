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

Re-inject the defect it exists to catch and watch it go red before keeping it. An
assertion that has never failed is decoration — the timezone checks here were confirmed
by restoring `TO_CHAR(occurred_at, 'YYYY-MM')` and seeing the 1 February entry reappear
under January (`feb=0 jan=1`).
