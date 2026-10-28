-- SlotSync Phase 8 Additive Migration
-- Adds optional external review link (e.g. Google Reviews URL) to businesses

ALTER TABLE businesses ADD COLUMN review_url TEXT DEFAULT '';
