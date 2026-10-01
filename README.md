# 💸 MoneyFlow — Expense Tracker

Mobile-first expense tracking PWA — React + NestJS + PostgreSQL + Docker.

The primary **Plan** page combines a monthly spending limit, recurring bills and
self-reported savings goals. Unpaid bills are reserved before calculating today's
allowance; paying or linking a bill records it once. Envelope tools remain optional.
See [everyday UX](docs/everyday-ux.md) and [planning architecture](docs/adr/0002-daily-money-and-life-planning.md).

## Quick Start (Development)

```bash
# 1. Set environment variables
cp .env.example .env
# Edit .env — fill in DB_PASSWORD and JWT_SECRET

# 2. Start everything
docker compose up --build

# 3. Open in browser
open http://localhost:3000

# Register an account — categories are seeded automatically
```

## Services

| Service  | URL                          | Notes              |
|----------|------------------------------|--------------------|
| Frontend | http://localhost:3000        | Vite dev server    |
| Backend  | http://localhost:3001/api    | NestJS + hot reload|
| pgAdmin  | http://localhost:5050        | admin@local.dev / admin |

## Production Deployment

Requires Docker Compose 2.24.4+ for `!reset` / `!override`. The production override
removes development mounts and direct database/API ports, starts the compiled backend
with migrations, and serves the frontend through nginx on port 3000.

`TRUST_PROXY_HOPS=0` is the direct development default. For the production topology
below, set it to `1` (nginx is the only trusted hop). Only increase it when every route
to the API passes through that many trusted proxies; block shorter direct routes.

```bash
# 1. Fill production values in .env
# 2. Run production build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 3. HTTPS via Let's Encrypt (on your VPS)
apt install certbot python3-certbot-nginx
cp nginx/https.conf /etc/nginx/sites-available/flo
# Edit yourdomain.com in the file, then:
certbot --nginx -d yourdomain.com
```

For a Vercel frontend deployment, set Root Directory to `frontend`. Its `vercel.json`
provides the React route rewrites and cache headers; keep it with the frontend project.
See [deployment recovery](docs/deploy-recovery.md) for stale PWA/lazy-route recovery
and the local two-release browser regression test.

## Auth Flow

```
POST /api/auth/register  { email, name, password }
  → { accessToken, user }    ← store token in localStorage

POST /api/auth/login     { email, password }
  → { accessToken, user }

GET  /api/auth/me                          ← Authorization: Bearer <token>
PATCH /api/auth/profile  { name }
```

All other endpoints require `Authorization: Bearer <token>`.

Google sign-in requires backend `GOOGLE_CLIENT_ID`; Facebook requires backend
`FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`. Compose maps the public IDs from the
corresponding `VITE_*` values. Missing configuration disables that provider. Only the
provider-returned email is trusted; an email entered by a client cannot prove ownership.
Matching email addresses never automatically link different sign-in methods. Existing
users must use their original method or recover through email. Password recovery consumes
its token once, revokes sessions, disconnects social credentials and enables email/password
sign-in. Previously linked accounts can use this recovery flow to remove old credentials.

When deploying the frontend to Vercel and the backend to Render, configure each
service separately: Vercel's `VITE_*` variables are not copied to Render. See
[Google/Facebook sign-in setup and troubleshooting (Thai)](docs/social-login.md).

Transaction exports use `GET /api/expenses/export` with `month` or `from` / `to` filters.
They return one consistent snapshot, up to 50,000 rows. Larger exports fail explicitly
and require a shorter date range instead of silently downloading a partial file.

Offline captures keep one idempotency key from their first online request through retries.
Temporary failures retain pending entries; invalid entries can be corrected from Home.
They are removed only after confirmation from the server or an explicit user discard.

## Analytics Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/analytics/summary?month=YYYY-MM` | Totals + avg/day |
| `GET /api/analytics/categories?month=YYYY-MM&type=expense` | Pie chart data |
| `GET /api/analytics/monthly-trend` | 12-month area chart |
| `GET /api/analytics/daily?month=YYYY-MM` | Daily bar chart |

## Gmail bank import

Gmail bank-email import supports separate connections and settings for each user.
See [setup, supported emails, scheduling and verification](docs/gmail-bank-import.md).

## PWA — Install on Mobile

1. Open the deployed **HTTPS** website on your phone. A computer's `localhost` or
   plain HTTP LAN address is not a mobile installation URL.
2. Use the install card on the sign-in page or in Settings. Android Chrome opens
   its native prompt when available; otherwise the card explains the browser menu.
3. On iPhone/iPad, use Share → Add to Home Screen in Safari or Chrome. The card
   provides these steps; iOS does not expose Chrome's Android install prompt.

See [mobile installation and troubleshooting](docs/pwa-installation.md). Successful
web installability checks do not prove that Android completed its native installation.

`frontend/public/app_icon.svg` is the single icon master — the favicon and every installed
icon are rendered from it. To regenerate the PNGs:
```bash
npx sharp-cli --input frontend/public/app_icon.svg \
  --output frontend/public/icons/icon-192.png --resize 192
npx sharp-cli --input frontend/public/app_icon.svg \
  --output frontend/public/icons/icon-512.png --resize 512
```
The maskable icon is **not** a resize of the same artwork — see
`frontend/public/icons/README.md` for why, and for the headless-Chrome recipe used to
produce the committed files.

## Project Structure

```
expense-tracker/
├── docker-compose.yml
├── docker-compose.prod.yml       ← production override
├── nginx/https.conf              ← HTTPS/TLS config for VPS
├── database/README.md            ← schema lives in backend/src/migrations/
├── backend/src/
│   └── modules/
│       ├── auth/                 ← JWT, bcrypt, register/login
│       ├── expenses/             ← CRUD + filtering
│       ├── categories/           ← CRUD + user-owned
│       └── analytics/            ← aggregation queries
└── frontend/src/
    ├── store/auth.store.ts       ← Zustand JWT store
    ├── api/index.ts              ← Axios + interceptors
    ├── components/layout/
    │   ├── Layout.tsx            ← Bottom nav (4 items)
    │   └── PrivateRoute.tsx      ← Auth guard
    └── pages/
        ├── Auth/AuthPage.tsx     ← Login + Register tabs
        ├── Dashboard/            ← Charts + summary
        ├── AddExpense/           ← Touch-friendly form
        ├── History/              ← Grouped list + delete
        └── Settings/             ← Profile + category CRUD
```
