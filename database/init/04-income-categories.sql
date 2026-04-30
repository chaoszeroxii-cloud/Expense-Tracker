-- =============================================================
-- 04-income-categories.sql
-- Migration: Add income category binding to allocations
-- =============================================================

-- Many-to-many join table: allocation ↔ income category
CREATE TABLE IF NOT EXISTS allocation_income_categories (
  allocation_id UUID NOT NULL REFERENCES allocations(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (allocation_id, category_id)
);
