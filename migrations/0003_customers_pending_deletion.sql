-- SlotSync Migration 0003: Customer Pending Deletion Flag and Indexes

ALTER TABLE customers ADD COLUMN pending_deletion INTEGER NOT NULL DEFAULT 0 CHECK (pending_deletion IN (0, 1));
ALTER TABLE customers ADD COLUMN pending_deletion_at_utc TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_business_pending ON customers(business_id, pending_deletion);
