-- =============================================================
-- 01-schema.sql
-- =============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) UNIQUE NOT NULL,
  name           VARCHAR(100) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  currency       VARCHAR(3) DEFAULT 'THB',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  icon        VARCHAR(50),
  color       VARCHAR(7),
  type        VARCHAR(10) NOT NULL CHECK (type IN ('expense', 'income')),
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  type          VARCHAR(10) NOT NULL CHECK (type IN ('expense', 'income')),
  note          TEXT,
  tags          TEXT[] DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_occurred ON expenses(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category      ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_type          ON expenses(type);

-- ── Allocations (money envelope system) ─────────────────────
CREATE TABLE IF NOT EXISTS allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  icon        VARCHAR(50),
  color       VARCHAR(7),
  balance     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Many-to-many join table: allocation ↔ category
CREATE TABLE IF NOT EXISTS allocation_categories (
  allocation_id UUID NOT NULL REFERENCES allocations(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (allocation_id, category_id)
);

-- Add allocation_id to expenses (safe to run even if column exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'allocation_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN allocation_id UUID REFERENCES allocations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── User role ────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'user'
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

-- ── Onboarding flag ──────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- ── Monthly budgets ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  month       VARCHAR(7) NOT NULL, -- 'YYYY-MM'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, category_id, month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);

-- ── Loans (money lent to others) ─────────────────────────────
CREATE TABLE IF NOT EXISTS loans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  borrower     VARCHAR(100) NOT NULL,
  amount       NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  note         TEXT,
  lent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date     TIMESTAMPTZ,
  status       VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id, status);

CREATE TABLE IF NOT EXISTS loan_payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id    UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount     NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);

-- ── Investments (mutual funds / stocks) ──────────────────────
CREATE TABLE IF NOT EXISTS investments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  symbol      VARCHAR(50),
  type        VARCHAR(20) NOT NULL DEFAULT 'mutual_fund'
    CHECK (type IN ('mutual_fund', 'stock_th', 'stock_us', 'crypto', 'gold', 'other')),
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
  amount        NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  units         NUMERIC(18, 6),
  nav_price     NUMERIC(14, 4),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_tx_investment ON investment_transactions(investment_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_user ON investment_transactions(user_id);

-- ── Tax deductions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_deductions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year    INTEGER NOT NULL,
  type        VARCHAR(50) NOT NULL,
  name        VARCHAR(200) NOT NULL,
  amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  max_amount  NUMERIC(14, 2),
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, tax_year, type)
);
CREATE INDEX IF NOT EXISTS idx_tax_deductions_user_year ON tax_deductions(user_id, tax_year);

-- ── Chat messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content    TEXT NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at DESC);
