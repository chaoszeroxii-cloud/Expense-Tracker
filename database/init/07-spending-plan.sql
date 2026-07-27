-- =============================================================
-- 07-spending-plan.sql
-- Migration: daily spending plan, local timezone, work-time lens
--
--   - users.monthly_spending_limit : the single number the daily "safe to spend"
--                                    figure derives from. NULL = no plan set.
--   - users.tracking_mode          : 'plan' | 'track_only'. Track-only users record
--                                    transactions without committing to a limit.
--   - users.timezone               : IANA zone used to decide what "today" and
--                                    "this month" mean for this user.
--   - users.work_*                 : hourly-rate inputs for the work-time lens,
--                                    moved off localStorage so they survive a
--                                    device change.
--   - users.advanced_mode          : reveals envelope wallets, loans, investments
--                                    and tax. Backfilled ON for anyone already
--                                    using wallets so nothing disappears on them.
--
-- Idempotent — safe to re-run against an existing database.
-- =============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_spending_limit NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS tracking_mode          VARCHAR(20)  NOT NULL DEFAULT 'plan',
  ADD COLUMN IF NOT EXISTS timezone               VARCHAR(64)  NOT NULL DEFAULT 'Asia/Bangkok',
  ADD COLUMN IF NOT EXISTS work_hours_per_day     NUMERIC(4,2) NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS work_days_per_month    INTEGER      NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS show_work_time         BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS advanced_mode          BOOLEAN      NOT NULL DEFAULT FALSE;

-- A limit of 0 would render as "you may not spend anything today", which is not
-- the same statement as "no plan set" (NULL). Keep the two distinguishable.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_monthly_spending_limit_positive'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_monthly_spending_limit_positive
      CHECK (monthly_spending_limit IS NULL OR monthly_spending_limit > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_tracking_mode_valid'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_tracking_mode_valid
      CHECK (tracking_mode IN ('plan', 'track_only'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_work_inputs_positive'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_work_inputs_positive
      CHECK (work_hours_per_day > 0 AND work_days_per_month > 0);
  END IF;
END $$;

-- ── Backfill: existing users keep everything they already had ────────────────
-- Anyone who has created a wallet is already using envelope budgeting; hiding it
-- behind a toggle they never enabled would look like data loss.
UPDATE users u
   SET advanced_mode = TRUE
 WHERE advanced_mode = FALSE
   AND EXISTS (SELECT 1 FROM allocations a WHERE a.user_id = u.id);

-- Same for anyone with loans, investments or tax deductions on record.
UPDATE users u
   SET advanced_mode = TRUE
 WHERE advanced_mode = FALSE
   AND (   EXISTS (SELECT 1 FROM loans           l WHERE l.user_id = u.id)
        OR EXISTS (SELECT 1 FROM investments     i WHERE i.user_id = u.id)
        OR EXISTS (SELECT 1 FROM tax_deductions  t WHERE t.user_id = u.id));

-- No salary column is added: the work-time lens reads `expected_monthly_income`,
-- which the user may already have set, rather than asking for the same figure twice.

CREATE INDEX IF NOT EXISTS idx_users_tracking_mode ON users(tracking_mode);
