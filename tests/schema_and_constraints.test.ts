import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { generateUUID } from '../src/shared/idUtils';
import { NOTIFICATION_JOB_STATUSES } from '../src/shared/statusEnums';

describe('Schema Integrity, Foreign Keys, and CHECK Constraints', () => {
  beforeEach(async () => {
    // Ensure foreign keys are active
    await env.DB.exec('PRAGMA foreign_keys = ON;');
  });

  it('enforces FOREIGN KEY constraints by rejecting orphan rows', async () => {
    const orphanServiceId = generateUUID();
    const fakeBusinessId = generateUUID();

    // Attempt to insert a service pointing to a non-existent business
    const insertOrphan = env.DB.prepare(
      `INSERT INTO services (id, business_id, name, duration_minutes, buffer_minutes, price_minor, currency, is_active)
       VALUES (?, ?, 'Orphan Haircut', 30, 0, 50000, 'INR', 1)`
    ).bind(orphanServiceId, fakeBusinessId).run();

    await expect(insertOrphan).rejects.toThrow();
  });

  it('enforces CHECK constraints on services (duration_minutes > 0)', async () => {
    const businessId = generateUUID();
    await env.DB.prepare(
      `INSERT INTO businesses (id, name, slug) VALUES (?, 'Valid Salon', ?)`
    ).bind(businessId, `salon-${businessId.slice(0, 8)}`).run();

    // Invalid negative duration
    const insertBadDuration = env.DB.prepare(
      `INSERT INTO services (id, business_id, name, duration_minutes, buffer_minutes, price_minor)
       VALUES (?, ?, 'Negative Duration', -15, 0, 1000)`
    ).bind(generateUUID(), businessId).run();

    await expect(insertBadDuration).rejects.toThrow();
  });

  it('enforces CHECK constraints on booking status enum', async () => {
    const businessId = generateUUID();
    const userId = generateUUID();
    const resourceId = generateUUID();
    const serviceId = generateUUID();
    const customerId = generateUUID();
    const bookingId = generateUUID();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO businesses (id, name, slug) VALUES (?, 'Test Business', ?)`).bind(businessId, `biz-${businessId.slice(0, 8)}`),
      env.DB.prepare(`INSERT INTO resources (id, business_id, name) VALUES (?, ?, 'Staff 1')`).bind(resourceId, businessId),
      env.DB.prepare(`INSERT INTO services (id, business_id, name, duration_minutes) VALUES (?, ?, 'Service 1', 30)`).bind(serviceId, businessId),
      env.DB.prepare(`INSERT INTO customers (id, business_id, normalized_phone, display_phone, name) VALUES (?, ?, '+919999999999', '9999999999', 'Client')`).bind(customerId, businessId),
    ]);

    // Insert booking with illegal status 'in_progress' (not in CHECK constraint)
    const badStatusInsert = env.DB.prepare(
      `INSERT INTO bookings (
         id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id,
         start_at_utc, end_at_utc, business_timezone, status
       ) VALUES (?, 'SS-TEST01', 'dummyhash', ?, ?, ?, ?, '2026-10-29T10:00:00.000Z', '2026-10-29T10:30:00.000Z', 'Asia/Kolkata', 'in_progress')`
    ).bind(bookingId, businessId, customerId, serviceId, resourceId).run();

    await expect(badStatusInsert).rejects.toThrow();
  });

  it('enforces CHECK constraints on bookings (end_at_utc > start_at_utc)', async () => {
    const businessId = generateUUID();
    const resourceId = generateUUID();
    const serviceId = generateUUID();
    const customerId = generateUUID();
    const bookingId = generateUUID();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO businesses (id, name, slug) VALUES (?, 'Time Biz', ?)`).bind(businessId, `biz-${businessId.slice(0, 8)}`),
      env.DB.prepare(`INSERT INTO resources (id, business_id, name) VALUES (?, ?, 'Staff 1')`).bind(resourceId, businessId),
      env.DB.prepare(`INSERT INTO services (id, business_id, name, duration_minutes) VALUES (?, ?, 'Service 1', 30)`).bind(serviceId, businessId),
      env.DB.prepare(`INSERT INTO customers (id, business_id, normalized_phone, display_phone, name) VALUES (?, ?, '+919999999999', '9999999999', 'Client')`).bind(customerId, businessId),
    ]);

    // End time before start time
    const badTimeInsert = env.DB.prepare(
      `INSERT INTO bookings (
         id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id,
         start_at_utc, end_at_utc, business_timezone, status
       ) VALUES (?, 'SS-TEST02', 'dummyhash', ?, ?, ?, ?, '2026-10-29T11:00:00.000Z', '2026-10-29T10:00:00.000Z', 'Asia/Kolkata', 'confirmed')`
    ).bind(bookingId, businessId, customerId, serviceId, resourceId).run();

    await expect(badTimeInsert).rejects.toThrow();
  });

  it('validates every notification_jobs status enum allowed by the schema', async () => {
    const businessId = generateUUID();
    const resourceId = generateUUID();
    const serviceId = generateUUID();
    const customerId = generateUUID();
    const bookingId = generateUUID();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO businesses (id, name, slug) VALUES (?, 'Notify Biz', ?)`).bind(businessId, `notify-${businessId.slice(0, 8)}`),
      env.DB.prepare(`INSERT INTO resources (id, business_id, name) VALUES (?, ?, 'Staff')`).bind(resourceId, businessId),
      env.DB.prepare(`INSERT INTO services (id, business_id, name, duration_minutes) VALUES (?, ?, 'Haircut', 30)`).bind(serviceId, businessId),
      env.DB.prepare(`INSERT INTO customers (id, business_id, normalized_phone, display_phone, name) VALUES (?, ?, '+919876543210', '9876543210', 'Rahul')`).bind(customerId, businessId),
      env.DB.prepare(`INSERT INTO bookings (id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id, start_at_utc, end_at_utc, business_timezone)
                      VALUES (?, 'SS-NOTIF1', 'hash', ?, ?, ?, ?, '2026-10-29T10:00:00.000Z', '2026-10-29T10:30:00.000Z', 'Asia/Kolkata')`)
        .bind(bookingId, businessId, customerId, serviceId, resourceId),
    ]);

    // Verify all 16 enum values from PATCH 1 section D succeed
    for (const status of NOTIFICATION_JOB_STATUSES) {
      const jobId = generateUUID();
      const idempotencyKey = `job-${status}-${generateUUID()}`;

      await env.DB.prepare(
        `INSERT INTO notification_jobs (
           id, business_id, booking_id, customer_id, channel, template_key, due_at_utc, status, idempotency_key
         ) VALUES (?, ?, ?, ?, 'email', 'reminder_24h', '2026-10-28T10:00:00.000Z', ?, ?)`
      )
        .bind(jobId, businessId, bookingId, customerId, status, idempotencyKey)
        .run();
    }

    // Invalid status 'dispatched' must fail
    const badJobInsert = env.DB.prepare(
      `INSERT INTO notification_jobs (
         id, business_id, booking_id, customer_id, channel, template_key, due_at_utc, status, idempotency_key
       ) VALUES (?, ?, ?, ?, 'email', 'reminder_24h', '2026-10-28T10:00:00.000Z', 'dispatched', ?)`
    )
      .bind(generateUUID(), businessId, bookingId, customerId, 'invalid-key')
      .run();

    await expect(badJobInsert).rejects.toThrow();
  });

  it('enforces UNIQUE constraint on idempotency_keys (business_id, route, key)', async () => {
    const businessId = generateUUID();
    await env.DB.prepare(`INSERT INTO businesses (id, name, slug) VALUES (?, 'Idem Biz', ?)`).bind(businessId, `idem-${businessId.slice(0, 8)}`).run();

    const key = 'idem-test-key-1';
    const route = '/api/bookings';

    await env.DB.prepare(
      `INSERT INTO idempotency_keys (key, business_id, route, request_hash, response_status, response_json, expires_at_utc)
       VALUES (?, ?, ?, 'hash1', 200, '{"success":true}', '2026-10-30T00:00:00.000Z')`
    ).bind(key, businessId, route).run();

    // Duplicate insert for same (business_id, route, key) must throw UNIQUE constraint violation
    const duplicateInsert = env.DB.prepare(
      `INSERT INTO idempotency_keys (key, business_id, route, request_hash, response_status, response_json, expires_at_utc)
       VALUES (?, ?, ?, 'hash2', 200, '{"success":true}', '2026-10-30T00:00:00.000Z')`
    ).bind(key, businessId, route).run();

    await expect(duplicateInsert).rejects.toThrow();
  });

  it('proves strict tenant isolation: Business B query returns 0 rows of Business A', async () => {
    const bizA = generateUUID();
    const bizB = generateUUID();

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO businesses (id, name, slug) VALUES (?, 'Salon Alpha', ?)`).bind(bizA, `alpha-${bizA.slice(0, 8)}`),
      env.DB.prepare(`INSERT INTO businesses (id, name, slug) VALUES (?, 'Salon Beta', ?)`).bind(bizB, `beta-${bizB.slice(0, 8)}`),
      env.DB.prepare(`INSERT INTO customers (id, business_id, normalized_phone, display_phone, name) VALUES (?, ?, '+919000000001', '9000000001', 'Alpha VIP')`).bind(generateUUID(), bizA),
      env.DB.prepare(`INSERT INTO customers (id, business_id, normalized_phone, display_phone, name) VALUES (?, ?, '+919000000002', '9000000002', 'Beta VIP')`).bind(generateUUID(), bizB),
    ]);

    // Query for Business B customers
    const { results } = await env.DB.prepare(`SELECT * FROM customers WHERE business_id = ?`).bind(bizB).all();

    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Beta VIP');

    // Confirm Alpha VIP is completely inaccessible under bizB filter
    const crossCheck = results.some((r) => r.name === 'Alpha VIP');
    expect(crossCheck).toBe(false);
  });
});
