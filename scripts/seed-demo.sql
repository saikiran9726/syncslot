-- SlotSync Idempotent Demo Seed Script
-- Scoped strictly to one demo business with is_demo = 1.
-- Uses non-sensitive, fictional data: @example.com emails, +9198765... phone numbers.
-- All IDs are deterministic to guarantee idempotency across repeated runs.

PRAGMA foreign_keys = ON;

-- 1. Demo Business Owner User
-- Password: DemoPassword123! (PBKDF2-SHA256 hashed with static demo salt)
INSERT INTO users (id, email, password_hash, password_salt, created_at_utc, updated_at_utc)
VALUES (
  'usr_demo_00000001',
  'demo-owner@example.com',
  'b99a6cf5ebfaeb8c0575d52ad63cb88a4e8d350b91e98cf00c8728d1152a514d',
  'demo_salt_phase11_seed_only',
  '2026-10-28T00:00:00.000Z',
  '2026-10-28T00:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  email = excluded.email,
  password_hash = excluded.password_hash;

-- 2. Demo Business
INSERT INTO businesses (
  id, name, slug, timezone, contact_phone, contact_email,
  description, address, accessibility_info, published, is_demo,
  country_code, currency, onboarding_step, booking_mode, requires_approval,
  min_notice_hours, max_days_ahead, cancel_cutoff_hours, cancellation_policy_text,
  industry_preset, quiet_hours_start, quiet_hours_end, created_at_utc, updated_at_utc
) VALUES (
  'biz_demo_00000001',
  'Luxe Studio Salon (Demo)',
  'luxe-demo-salon',
  'Asia/Kolkata',
  '+919876500000',
  'contact@example.com',
  'Premium boutique styling and grooming studio. Clean, quiet, and appointment-only.',
  '12 Indiranagar 100ft Road, Bengaluru, Karnataka 560038',
  'Wheelchair accessible entrance, ramp access, gender-neutral private booths.',
  1,
  1,
  'IN',
  'INR',
  3,
  'instant',
  0,
  2,
  30,
  2,
  'Free cancellation up to 2 hours before your scheduled appointment.',
  'hair_salon',
  '22:00',
  '08:00',
  '2026-10-28T00:00:00.000Z',
  '2026-10-28T00:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  slug = excluded.slug,
  published = 1,
  is_demo = 1;

-- 3. Owner Membership
INSERT INTO memberships (id, user_id, business_id, role, created_at_utc)
VALUES ('mem_demo_00000001', 'usr_demo_00000001', 'biz_demo_00000001', 'owner', '2026-10-28T00:00:00.000Z')
ON CONFLICT(id) DO NOTHING;

-- 4. Default Resource (Primary Stylist)
INSERT INTO resources (id, business_id, name, is_default, is_active, created_at_utc, updated_at_utc)
VALUES ('res_demo_00000001', 'biz_demo_00000001', 'Master Stylist Booth', 1, 1, '2026-10-28T00:00:00.000Z', '2026-10-28T00:00:00.000Z')
ON CONFLICT(id) DO NOTHING;

-- 5. Bookable Services
INSERT INTO services (id, business_id, name, description, duration_minutes, buffer_minutes, price_minor, currency, is_active, created_at_utc, updated_at_utc)
VALUES
(
  'srv_demo_00000001',
  'biz_demo_00000001',
  'Signature Haircut & Style',
  'Consultation, precision shear cut, wash, and blow dry finish.',
  45,
  15,
  85000,
  'INR',
  1,
  '2026-10-28T00:00:00.000Z',
  '2026-10-28T00:00:00.000Z'
),
(
  'srv_demo_00000002',
  'biz_demo_00000001',
  'Beard Trim & Hot Towel',
  'Beard shaping, line edging, warm eucalyptus towel, and beard oil conditioning.',
  30,
  15,
  45000,
  'INR',
  1,
  '2026-10-28T00:00:00.000Z',
  '2026-10-28T00:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  price_minor = excluded.price_minor;

-- 6. Working Hours (Monday-Saturday 09:00 - 19:00, Sunday Closed)
INSERT INTO working_hours (id, business_id, resource_id, day_of_week, open_time, close_time, is_closed, created_at_utc)
VALUES
('wh_demo_0', 'biz_demo_00000001', 'res_demo_00000001', 0, '09:00', '19:00', 1, '2026-10-28T00:00:00.000Z'),
('wh_demo_1', 'biz_demo_00000001', 'res_demo_00000001', 1, '09:00', '19:00', 0, '2026-10-28T00:00:00.000Z'),
('wh_demo_2', 'biz_demo_00000001', 'res_demo_00000001', 2, '09:00', '19:00', 0, '2026-10-28T00:00:00.000Z'),
('wh_demo_3', 'biz_demo_00000001', 'res_demo_00000001', 3, '09:00', '19:00', 0, '2026-10-28T00:00:00.000Z'),
('wh_demo_4', 'biz_demo_00000001', 'res_demo_00000001', 4, '09:00', '19:00', 0, '2026-10-28T00:00:00.000Z'),
('wh_demo_5', 'biz_demo_00000001', 'res_demo_00000001', 5, '09:00', '19:00', 0, '2026-10-28T00:00:00.000Z'),
('wh_demo_6', 'biz_demo_00000001', 'res_demo_00000001', 6, '09:00', '19:00', 0, '2026-10-28T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  is_closed = excluded.is_closed;

-- 7. Daily Break (13:00 - 14:00)
INSERT INTO breaks (id, business_id, resource_id, day_of_week, start_time, end_time, created_at_utc)
VALUES
('brk_demo_1', 'biz_demo_00000001', 'res_demo_00000001', 1, '13:00', '14:00', '2026-10-28T00:00:00.000Z'),
('brk_demo_2', 'biz_demo_00000001', 'res_demo_00000001', 2, '13:00', '14:00', '2026-10-28T00:00:00.000Z'),
('brk_demo_3', 'biz_demo_00000001', 'res_demo_00000001', 3, '13:00', '14:00', '2026-10-28T00:00:00.000Z'),
('brk_demo_4', 'biz_demo_00000001', 'res_demo_00000001', 4, '13:00', '14:00', '2026-10-28T00:00:00.000Z'),
('brk_demo_5', 'biz_demo_00000001', 'res_demo_00000001', 5, '13:00', '14:00', '2026-10-28T00:00:00.000Z'),
('brk_demo_6', 'biz_demo_00000001', 'res_demo_00000001', 6, '13:00', '14:00', '2026-10-28T00:00:00.000Z')
ON CONFLICT(id) DO NOTHING;

-- 8. Demo Customers
INSERT INTO customers (
  id, business_id, name, display_phone, normalized_phone, email,
  consent_email_reminders, consent_whatsapp_reminders, created_at_utc, updated_at_utc
) VALUES
(
  'cus_demo_00000001',
  'biz_demo_00000001',
  'Aarav Sharma (Demo)',
  '+91 98765 43210',
  '+919876543210',
  'aarav.demo@example.com',
  1, 1,
  '2026-10-20T00:00:00.000Z',
  '2026-10-20T00:00:00.000Z'
),
(
  'cus_demo_00000002',
  'biz_demo_00000001',
  'Priya Patel (Demo)',
  '+91 98765 43211',
  '+919876543211',
  'priya.demo@example.com',
  1, 1,
  '2026-10-22T00:00:00.000Z',
  '2026-10-22T00:00:00.000Z'
),
(
  'cus_demo_00000003',
  'biz_demo_00000001',
  'Vikram Mehta (Demo)',
  '+91 98765 43212',
  '+919876543212',
  'vikram.demo@example.com',
  1, 1,
  '2026-10-25T00:00:00.000Z',
  '2026-10-25T00:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  email = excluded.email;

-- 9. Relationship Notes for Demo Customers
INSERT INTO customer_notes (
  id, business_id, customer_id, author_user_id, note_text, is_private, created_at_utc
) VALUES
(
  'not_demo_00000001',
  'biz_demo_00000001',
  'cus_demo_00000001',
  'usr_demo_00000001',
  'Prefers low skin fade on sides with textured scissor cut on top. Uses matte pomade.',
  0,
  '2026-10-20T10:00:00.000Z'
),
(
  'not_demo_00000002',
  'biz_demo_00000001',
  'cus_demo_00000002',
  'usr_demo_00000001',
  'VIP client. Prefers quiet appointment booths.',
  1,
  '2026-10-22T14:30:00.000Z'
)
ON CONFLICT(id) DO NOTHING;

-- 10. Bookings (Past completed, Upcoming confirmed, and Cancelled)
-- Token hashes are sha256Hex('demo_manage_token_123')
INSERT INTO bookings (
  id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id,
  start_at_utc, end_at_utc, business_timezone, source, status, price_minor, currency,
  version, notes, possible_match, consent_email_reminders, created_at_utc, updated_at_utc
) VALUES
(
  'bok_demo_00000001',
  'SS-DEMOPAST',
  '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b',
  'biz_demo_00000001',
  'cus_demo_00000001',
  'srv_demo_00000001',
  'res_demo_00000001',
  '2026-10-27T04:30:00.000Z',
  '2026-10-27T05:15:00.000Z',
  'Asia/Kolkata',
  'direct',
  'completed',
  85000,
  'INR',
  1,
  'Initial styling consultation',
  0, 1,
  '2026-10-25T00:00:00.000Z',
  '2026-10-27T05:15:00.000Z'
),
(
  'bok_demo_00000002',
  'SS-DEMONEXT',
  'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35',
  'biz_demo_00000001',
  'cus_demo_00000002',
  'srv_demo_00000001',
  'res_demo_00000001',
  '2026-10-29T05:30:00.000Z',
  '2026-10-29T06:15:00.000Z',
  'Asia/Kolkata',
  'direct',
  'confirmed',
  85000,
  'INR',
  1,
  'Special occasion styling',
  0, 1,
  '2026-10-28T00:00:00.000Z',
  '2026-10-28T00:00:00.000Z'
),
(
  'bok_demo_00000003',
  'SS-DEMOCANC',
  '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
  'biz_demo_00000001',
  'cus_demo_00000003',
  'srv_demo_00000002',
  'res_demo_00000001',
  '2026-10-28T09:30:00.000Z',
  '2026-10-28T10:00:00.000Z',
  'Asia/Kolkata',
  'phone',
  'cancelled',
  45000,
  'INR',
  2,
  'Customer travelling out of station',
  0, 1,
  '2026-10-26T00:00:00.000Z',
  '2026-10-27T08:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  status = excluded.status,
  updated_at_utc = excluded.updated_at_utc;

-- 11. Discrete Slot Cells for Confirmed Booking (45m service + 15m buffer = 4 cells)
INSERT INTO slot_cells (booking_id, resource_id, cell_start_utc)
VALUES
('bok_demo_00000002', 'res_demo_00000001', '2026-10-29T05:30:00.000Z'),
('bok_demo_00000002', 'res_demo_00000001', '2026-10-29T05:45:00.000Z'),
('bok_demo_00000002', 'res_demo_00000001', '2026-10-29T06:00:00.000Z'),
('bok_demo_00000002', 'res_demo_00000001', '2026-10-29T06:15:00.000Z')
ON CONFLICT(resource_id, cell_start_utc) DO NOTHING;

-- 12. Notification Preferences & Default Rules
INSERT INTO notification_preferences (
  id, business_id, enable_email, enable_whatsapp_manual, sender_name, reply_to_email,
  consent_copy_text, created_at_utc
) VALUES (
  'pref_demo_00000001',
  'biz_demo_00000001',
  1, 1,
  'Luxe Studio Salon',
  'appointments@slotsync.dev',
  'By booking, you agree to receive email confirmation and appointment reminder notices.',
  '2026-10-28T00:00:00.000Z'
)
ON CONFLICT(business_id) DO NOTHING;

INSERT INTO reminder_rules (id, business_id, offset_minutes, enabled, template_key, created_at_utc)
VALUES
('rem_demo_24h', 'biz_demo_00000001', 1440, 1, 'reminder_standard', '2026-10-28T00:00:00.000Z'),
('rem_demo_2h', 'biz_demo_00000001', 120, 1, 'reminder_standard', '2026-10-28T00:00:00.000Z')
ON CONFLICT(business_id, offset_minutes) DO NOTHING;
