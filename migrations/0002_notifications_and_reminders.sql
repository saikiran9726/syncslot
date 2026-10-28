-- SlotSync Migration 0002: Notifications & Reminders Configuration, Idempotent Backfill, and Opt-Out

-- 1. Additive columns for notification_preferences
ALTER TABLE notification_preferences ADD COLUMN consent_copy_text TEXT DEFAULT 'I agree to receive booking confirmations and reminder updates via email and messaging.';
ALTER TABLE notification_preferences ADD COLUMN sandbox_recipient_email TEXT;

-- 2. Additive columns for customer opt-out
ALTER TABLE customers ADD COLUMN opted_out_at_utc TEXT;
ALTER TABLE customers ADD COLUMN opt_out_reason TEXT;

-- 3. Idempotent Backfill: Ensure every business has notification_preferences
INSERT OR IGNORE INTO notification_preferences (
  id, business_id, enable_email, enable_whatsapp_manual, consent_copy_text, created_at_utc
)
SELECT
  'np_' || b.id,
  b.id,
  1,
  1,
  'I agree to receive booking confirmations and reminder updates via email and messaging.',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM notification_preferences np WHERE np.business_id = b.id
);

-- 4. Idempotent Backfill: Ensure every business has default 24h (1440m) reminder rule
INSERT OR IGNORE INTO reminder_rules (
  id, business_id, offset_minutes, enabled, template_key, created_at_utc
)
SELECT
  'rr_1440_' || b.id,
  b.id,
  1440,
  1,
  'reminder_24h',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_rules rr WHERE rr.business_id = b.id AND rr.offset_minutes = 1440
);

-- 5. Idempotent Backfill: Ensure every business has default 2h (120m) reminder rule
INSERT OR IGNORE INTO reminder_rules (
  id, business_id, offset_minutes, enabled, template_key, created_at_utc
)
SELECT
  'rr_120_' || b.id,
  b.id,
  120,
  1,
  'reminder_2h',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM reminder_rules rr WHERE rr.business_id = b.id AND rr.offset_minutes = 120
);
