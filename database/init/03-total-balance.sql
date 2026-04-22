-- =============================================================
-- 03-total-balance.sql
-- Migration: Add total_balance to users for "park then distribute" flow
-- =============================================================

-- 1. Add column
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS total_balance NUMERIC(14,2) NOT NULL DEFAULT 0;

-- 2. Backfill existing users:
--    total_balance = sum(all income) - sum(all expenses)
--    This keeps unallocated = 0 for old users (all income was already in allocations).
UPDATE users u
SET total_balance = COALESCE((
  SELECT SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE -e.amount END)
  FROM expenses e
  WHERE e.user_id = u.id
), 0);

-- 3. Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
