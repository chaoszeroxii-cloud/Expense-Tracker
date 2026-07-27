-- =============================================================
-- 08-product-events.sql
-- Migration: minimal first-party product telemetry
--
-- Exists to answer four questions the rework is betting on:
--   1. do new users reach their first transaction?
--   2. how long does adding one actually take?
--   3. how often do saves fail?
--   4. do people come back the next day and record something?
--
-- Deliberately NOT recorded: amounts, notes, category names, or any other
-- financial content. The payload is a small whitelist of numbers and enums —
-- see ProductEventDto. Rows are per-user so they can be deleted with the account.
-- =============================================================

CREATE TABLE IF NOT EXISTS product_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(40) NOT NULL,
  duration_ms INTEGER,
  platform    VARCHAR(20),
  app_version VARCHAR(20),
  -- Local calendar date of the event, so day-over-day retention can be counted
  -- in the user's own timezone rather than UTC.
  local_date  DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_events_user_date ON product_events(user_id, local_date);
CREATE INDEX IF NOT EXISTS idx_product_events_name_date ON product_events(name, local_date);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_events_duration_sane'
  ) THEN
    ALTER TABLE product_events ADD CONSTRAINT product_events_duration_sane
      CHECK (duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 3600000));
  END IF;
END $$;
