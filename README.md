# 💸 MoneyFlow — Expense Tracker

Mobile-first expense tracking PWA — React + NestJS + PostgreSQL + Docker.

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

## Analytics Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/analytics/summary?month=YYYY-MM` | Totals + avg/day |
| `GET /api/analytics/categories?month=YYYY-MM&type=expense` | Pie chart data |
| `GET /api/analytics/monthly-trend` | 12-month area chart |
| `GET /api/analytics/daily?month=YYYY-MM` | Daily bar chart |

## PWA — Install on Mobile

1. Open http://localhost:3000 in Chrome/Safari on your phone
2. Chrome: tap ⋮ → "Add to Home screen"
3. Safari: tap □↑ → "Add to Home Screen"

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
