-- =============================================================
-- Migration: session revocation via token_version
--   Every JWT embeds the user's token_version (`tv`). Changing or
--   resetting a password increments it, so previously issued tokens
--   (including any stolen ones) stop validating on the next request.
-- =============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
