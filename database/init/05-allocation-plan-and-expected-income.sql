-- =============================================================
-- 05-allocation-plan-and-expected-income.sql
-- Migration: "Apply Last Month's Plan" feature
--   - allocation_plans: target funding total per (wallet, month)
--   - users.expected_monthly_income: reference value, prefills Add Income
-- =============================================================

CREATE TABLE IF NOT EXISTS allocation_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allocation_id UUID NOT NULL REFERENCES allocations(id) ON DELETE CASCADE,
  amount        NUMERIC(14,2) NOT NULL,
  month         VARCHAR(7) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, allocation_id, month)
);

CREATE INDEX IF NOT EXISTS idx_allocation_plans_user_month ON allocation_plans(user_id, month);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS expected_monthly_income NUMERIC(14,2);
