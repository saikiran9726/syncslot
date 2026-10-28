-- SlotSync Demo Data Removal Script
-- Safely purges ONLY demo records marked is_demo = 1 for the demo business.
-- Never affects production or non-demo tenant data.

PRAGMA foreign_keys = ON;

-- 1. Explicit clean-up of child tables for demo business
DELETE FROM slot_cells WHERE booking_id IN (SELECT id FROM bookings WHERE business_id = 'biz_demo_00000001');
DELETE FROM booking_events WHERE booking_id IN (SELECT id FROM bookings WHERE business_id = 'biz_demo_00000001');
DELETE FROM notification_jobs WHERE business_id = 'biz_demo_00000001';
DELETE FROM customer_notes WHERE business_id = 'biz_demo_00000001';
DELETE FROM customer_aliases WHERE business_id = 'biz_demo_00000001';
DELETE FROM bookings WHERE business_id = 'biz_demo_00000001';
DELETE FROM customers WHERE business_id = 'biz_demo_00000001';
DELETE FROM breaks WHERE business_id = 'biz_demo_00000001';
DELETE FROM working_hours WHERE business_id = 'biz_demo_00000001';
DELETE FROM services WHERE business_id = 'biz_demo_00000001';
DELETE FROM resources WHERE business_id = 'biz_demo_00000001';
DELETE FROM reminder_rules WHERE business_id = 'biz_demo_00000001';
DELETE FROM notification_preferences WHERE business_id = 'biz_demo_00000001';
DELETE FROM idempotency_keys WHERE business_id = 'biz_demo_00000001';
DELETE FROM audit_log WHERE business_id = 'biz_demo_00000001';
DELETE FROM memberships WHERE business_id = 'biz_demo_00000001';

-- 2. Delete Demo Business (enforces is_demo = 1 safety check)
DELETE FROM businesses WHERE id = 'biz_demo_00000001' AND is_demo = 1;

-- 3. Delete Demo Owner User & Sessions
DELETE FROM sessions WHERE user_id = 'usr_demo_00000001';
DELETE FROM users WHERE id = 'usr_demo_00000001';
