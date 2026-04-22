-- =============================================================
-- 02-migrate-icons-to-mdi.sql
-- Migration: Convert emoji icons to MDI icon names
-- =============================================================

-- Create a function to map emoji icons to MDI icon names
CREATE OR REPLACE FUNCTION map_emoji_to_mdi(emoji VARCHAR(50)) RETURNS VARCHAR(50) AS $$
BEGIN
  RETURN CASE emoji
    -- Expense icons
    WHEN '🍜' THEN 'food'
    WHEN '🚗' THEN 'transport'
    WHEN '🛍️' THEN 'shopping'
    WHEN '💊' THEN 'health'
    WHEN '🎮' THEN 'entertainment'
    WHEN '💡' THEN 'utilities'
    WHEN '🏠' THEN 'housing'
    WHEN '📚' THEN 'education'
    WHEN '📦' THEN 'other'
    WHEN '☕' THEN 'coffee'
    WHEN '✈️' THEN 'travel'
    WHEN '🎵' THEN 'music'
    WHEN '🐾' THEN 'pets'
    WHEN '💇' THEN 'beauty'
    WHEN '🏋️' THEN 'fitness'
    WHEN '🍽️' THEN 'restaurant'
    WHEN '🎬' THEN 'movies'
    WHEN '🏥' THEN 'medical'
    -- Income icons
    WHEN '💼' THEN 'salary'
    WHEN '💻' THEN 'freelance'
    WHEN '📈' THEN 'investment'
    WHEN '💰' THEN 'cash'
    WHEN '🎁' THEN 'gift'
    WHEN '🏆' THEN 'bonus'
    WHEN '💎' THEN 'rewards'
    WHEN '🌐' THEN 'global'
    -- Default fallback
    ELSE 'other'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Migrate categories icons
UPDATE categories SET icon = map_emoji_to_mdi(icon) WHERE icon IS NOT NULL AND icon LIKE '%';

-- Migrate allocations icons
UPDATE allocations SET icon = map_emoji_to_mdi(icon) WHERE icon IS NOT NULL AND icon LIKE '%';

-- Drop the migration function (optional - keep if you want to use it again)
-- DROP FUNCTION IF EXISTS map_emoji_to_mdi(VARCHAR);
