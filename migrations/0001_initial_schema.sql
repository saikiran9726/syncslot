-- SlotSync D1 SQLite Schema Migration: 0001_initial_schema.sql
-- Enforces: Foreign Keys, Tenant Isolation, Money in Minor Units (Paise), UTC ISO Instants,
-- Status Enums, and Dedicated 15-Minute Slot Cells for Race-Proof Concurrency.

PRAGMA foreign_keys = ON;

-- 1. Users (System authentication credentials)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Businesses (Tenant master entity)
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL COLLATE NOCASE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  contact_phone TEXT,
  contact_email TEXT,
  description TEXT,
  address TEXT,
  accessibility_info TEXT,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  country_code TEXT NOT NULL DEFAULT 'IN',
  currency TEXT NOT NULL DEFAULT 'INR',
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  booking_mode TEXT NOT NULL DEFAULT 'instant' CHECK (booking_mode IN ('instant', 'approval')),
  requires_approval INTEGER NOT NULL DEFAULT 0 CHECK (requires_approval IN (0, 1)),
  min_notice_hours INTEGER NOT NULL DEFAULT 2 CHECK (min_notice_hours >= 0),
  max_days_ahead INTEGER NOT NULL DEFAULT 60 CHECK (max_days_ahead >= 1),
  cancel_cutoff_hours INTEGER NOT NULL DEFAULT 2 CHECK (cancel_cutoff_hours >= 0),
  cancellation_policy_text TEXT,
  industry_preset TEXT DEFAULT 'salon',
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '08:00',
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);

-- 3. Memberships (User to Business association with role)
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_business ON memberships(user_id, business_id);
CREATE INDEX IF NOT EXISTS idx_memberships_business_role ON memberships(business_id, role);

-- 4. Sessions (Persistent auth tokens storing SHA-256 hash only)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at_utc TEXT NOT NULL,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at_utc);

-- 5. Resources (Staff / Equipment scheduled per business)
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resources_business ON resources(business_id, is_active);

-- 6. Services (Bookable service catalog with paise pricing)
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_services_business ON services(business_id, is_active);

-- 7. Working Hours (Weekly schedule per business/resource)
CREATE TABLE IF NOT EXISTS working_hours (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  resource_id TEXT,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TEXT NOT NULL, -- HH:MM
  close_time TEXT NOT NULL, -- HH:MM
  is_closed INTEGER NOT NULL DEFAULT 0 CHECK (is_closed IN (0, 1)),
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  CHECK (close_time > open_time OR is_closed = 1)
);

CREATE INDEX IF NOT EXISTS idx_working_hours_business ON working_hours(business_id, day_of_week);

-- 8. Breaks (Recurring intra-day breaks e.g. lunch)
CREATE TABLE IF NOT EXISTS breaks (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  resource_id TEXT,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL, -- HH:MM
  end_time TEXT NOT NULL, -- HH:MM
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_breaks_business ON breaks(business_id, day_of_week);

-- 9. Holidays (Full-day closures on calendar dates)
CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  resource_id TEXT,
  holiday_date TEXT NOT NULL, -- YYYY-MM-DD
  name TEXT NOT NULL,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_holidays_business_date ON holidays(business_id, holiday_date);

-- 10. Blocked Periods (Ad-hoc time blocks)
CREATE TABLE IF NOT EXISTS blocked_periods (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  resource_id TEXT,
  start_at_utc TEXT NOT NULL,
  end_at_utc TEXT NOT NULL,
  reason TEXT,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  CHECK (end_at_utc > start_at_utc)
);

CREATE INDEX IF NOT EXISTS idx_blocked_periods_business ON blocked_periods(business_id, start_at_utc);

-- 11. Customers (Scoped per business; phone is primary lookup)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,
  display_phone TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  consent_email_reminders INTEGER NOT NULL DEFAULT 1 CHECK (consent_email_reminders IN (0, 1)),
  consent_whatsapp_reminders INTEGER NOT NULL DEFAULT 1 CHECK (consent_whatsapp_reminders IN (0, 1)),
  consent_at_utc TEXT,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customers_business_phone ON customers(business_id, normalized_phone);
CREATE INDEX IF NOT EXISTS idx_customers_business_name ON customers(business_id, name);

-- 12. Customer Aliases (Merge tombstones)
CREATE TABLE IF NOT EXISTS customer_aliases (
  old_customer_id TEXT NOT NULL,
  new_customer_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  merged_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (old_customer_id, new_customer_id),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (new_customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_aliases_business ON customer_aliases(business_id, old_customer_id);

-- 13. Bookings (Core appointment entity)
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL, -- 8-char Crockford base32 e.g. SS-7K4M2QXA
  manage_token_hash TEXT NOT NULL, -- SHA-256 of 32-byte secret token
  business_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  start_at_utc TEXT NOT NULL,
  end_at_utc TEXT NOT NULL,
  business_timezone TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'phone', 'whatsapp', 'walkin', 'instagram', 'website', 'other')),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  notes TEXT,
  possible_match INTEGER NOT NULL DEFAULT 0 CHECK (possible_match IN (0, 1)),
  consent_email_reminders INTEGER NOT NULL DEFAULT 1 CHECK (consent_email_reminders IN (0, 1)),
  consent_at TEXT,
  consent_text_version TEXT,
  cancelled_reason TEXT,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE RESTRICT,
  CHECK (end_at_utc > start_at_utc),
  UNIQUE(business_id, reference)
);

CREATE INDEX IF NOT EXISTS idx_bookings_business_start ON bookings(business_id, start_at_utc);
CREATE INDEX IF NOT EXISTS idx_bookings_business_status ON bookings(business_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id, start_at_utc);
CREATE INDEX IF NOT EXISTS idx_bookings_manage_token ON bookings(manage_token_hash);

-- 14. Slot Cells (Dedicated 15-minute intervals for zero-race-condition booking safety)
CREATE TABLE IF NOT EXISTS slot_cells (
  resource_id TEXT NOT NULL,
  cell_start_utc TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  PRIMARY KEY (resource_id, cell_start_utc),
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_slot_cells_booking ON slot_cells(booking_id);

-- 15. Booking Events (Audit log for booking status transitions; NO PII in payload)
CREATE TABLE IF NOT EXISTS booking_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner', 'staff', 'customer', 'system')),
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  payload_json TEXT, -- Must contain NO name, email, or phone
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON booking_events(booking_id, created_at_utc);
CREATE INDEX IF NOT EXISTS idx_booking_events_business ON booking_events(business_id, created_at_utc);

-- 16. Customer Notes (Staff/owner relationship notes with privacy flag)
CREATE TABLE IF NOT EXISTS customer_notes (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON customer_notes(customer_id, created_at_utc);
CREATE INDEX IF NOT EXISTS idx_customer_notes_business ON customer_notes(business_id);

-- 17. Notification Preferences (Tenant-level communication settings)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  business_id TEXT UNIQUE NOT NULL,
  enable_email INTEGER NOT NULL DEFAULT 1 CHECK (enable_email IN (0, 1)),
  enable_whatsapp_manual INTEGER NOT NULL DEFAULT 1 CHECK (enable_whatsapp_manual IN (0, 1)),
  sender_name TEXT,
  reply_to_email TEXT,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

-- 18. Reminder Rules (Configurable offsets before appointment e.g. 1440m, 120m)
CREATE TABLE IF NOT EXISTS reminder_rules (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes > 0),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  template_key TEXT NOT NULL DEFAULT 'reminder_standard',
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  UNIQUE(business_id, offset_minutes)
);

CREATE INDEX IF NOT EXISTS idx_reminder_rules_business ON reminder_rules(business_id, enabled);

-- 19. Notification Jobs (Reliable background outbox with idempotency & strict state machine)
CREATE TABLE IF NOT EXISTS notification_jobs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  booking_version INTEGER NOT NULL DEFAULT 1,
  customer_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  template_key TEXT NOT NULL,
  due_at_utc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'sending', 'accepted', 'delivered', 'simulated',
    'retry_scheduled', 'failed', 'permanently_failed',
    'skipped_late', 'skipped_quiet_hours', 'skipped_no_channel',
    'skipped_consent', 'skipped_sandbox', 'superseded', 'cancelled', 'handled_manually'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  locked_until TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  provider_message_id TEXT,
  last_error_category TEXT,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_jobs_claim ON notification_jobs(status, due_at_utc);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_booking ON notification_jobs(booking_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_business ON notification_jobs(business_id, status);

-- 20. Reviews (Post-service customer feedback; 1 per booking)
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  booking_id TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  owner_reply TEXT,
  is_verified INTEGER NOT NULL DEFAULT 1 CHECK (is_verified IN (0, 1)),
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id, is_published, rating);

-- 21. Audit Log (Tenant operational activity tracking)
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload_json TEXT,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_log_business ON audit_log(business_id, created_at_utc);

-- 22. Idempotency Keys (API mutation deduplication)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  business_id TEXT NOT NULL,
  route TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at_utc TEXT NOT NULL,
  PRIMARY KEY (business_id, route, key),
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at_utc);

-- 23. Rate Limits (Privacy-safe brute-force protection using HMAC bucket hashes)
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_hash TEXT NOT NULL,
  window_start_utc TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_hash, window_start_utc)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start_utc);
