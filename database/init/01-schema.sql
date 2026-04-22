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
