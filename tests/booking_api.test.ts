import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/worker/index';
import { generateUUID, sha256Hex } from '../src/shared/idUtils';
import { calculateEndAtUtc } from '../src/shared/timeUtils';

describe('Public Booking API End-to-End Slice', () => {
  let businessId: string;
  let serviceId: string;
  let resourceId: string;
  const slug = 'slice-salon';

  beforeEach(async () => {
    await env.DB.exec('PRAGMA foreign_keys = ON;');
    businessId = generateUUID();
    serviceId = generateUUID();
    resourceId = generateUUID();

    // Seed test business
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO businesses (
          id, name, slug, timezone, published, booking_mode,
          min_notice_hours, max_days_ahead, cancel_cutoff_hours,
          cancellation_policy_text
        ) VALUES (?, 'Slice Salon', ?, 'Asia/Kolkata', 1, 'instant', 2, 30, 4, 'Free cancellation up to 4h before.')
      `).bind(businessId, slug),
      env.DB.prepare(`
        INSERT INTO resources (id, business_id, name, is_default, is_active)
        VALUES (?, ?, 'Stylist 1', 1, 1)
      `).bind(resourceId, businessId),
      env.DB.prepare(`
        INSERT INTO services (id, business_id, name, duration_minutes, buffer_minutes, price_minor, currency, is_active)
        VALUES (?, ?, 'Signature Cut', 30, 15, 80000, 'INR', 1)
      `).bind(serviceId, businessId),
      // Monday 09:00 - 18:00
      env.DB.prepare(`
        INSERT INTO working_hours (id, business_id, day_of_week, open_time, close_time, is_closed)
        VALUES (?, ?, 1, '09:00', '18:00', 0)
      `).bind(generateUUID(), businessId),
    ]);
  });

  it('GET /api/public/:slug returns business profile and active services', async () => {
    const res = await app.request(`/api/public/${slug}`, { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.business.name).toBe('Slice Salon');
    expect(body.business.slug).toBe(slug);
    expect(body.services.length).toBe(1);
    expect(body.services[0].name).toBe('Signature Cut');
    expect(body.services[0].price_minor).toBe(80000);
  });

  it('GET /api/public/:slug/availability returns available time slots', async () => {
    const res = await app.request(
      `/api/public/${slug}/availability?service_id=${serviceId}&date=2026-11-02`,
      { method: 'GET' },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.slots).toBeDefined();
    expect(body.slots.length).toBeGreaterThan(0);
    expect(body.timezone).toBe('Asia/Kolkata');
    expect(body.timezone_label).toContain('India Standard Time');
  });

  it('POST /api/public/:slug/bookings creates booking, normalizes phone, and returns manage token', async () => {
    const startAtUtc = '2026-11-02T04:30:00.000Z'; // 10:00 AM local

    const payload = {
      service_id: serviceId,
      start_at_utc: startAtUtc,
      customer_name: 'Aditi Sharma',
      customer_phone: '9876543210', // Should be normalized to +919876543210
      customer_email: 'aditi@example.com',
      notes: 'First time visit',
      source_tag: 'instagram',
    };

    const res = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.booking).toBeDefined();
    expect(body.booking.reference).toMatch(/^SS-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    expect(body.booking.manage_token).toBeDefined();
    expect(body.booking.manage_url).toContain(`/b/${slug}/manage/`);
    expect(body.booking.status).toBe('confirmed');

    // Verify DB state
    const dbBooking = await env.DB.prepare('SELECT * FROM bookings WHERE reference = ?')
      .bind(body.booking.reference)
      .first<any>();
    expect(dbBooking).not.toBeNull();
    expect(dbBooking.price_minor).toBe(80000); // Snapshotted from DB service
    expect(dbBooking.source).toBe('instagram');

    // Verify customer record was created with normalized phone
    const dbCustomer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?')
      .bind(dbBooking.customer_id)
      .first<any>();
    expect(dbCustomer.normalized_phone).toBe('+919876543210');
    expect(dbCustomer.name).toBe('Aditi Sharma');

    // Verify slot_cells were created (30m service + 15m buffer = 3 cells)
    const { results: cells } = await env.DB.prepare(
      'SELECT cell_start_utc FROM slot_cells WHERE booking_id = ? ORDER BY cell_start_utc ASC'
    )
      .bind(dbBooking.id)
      .all<any>();
    expect(cells.length).toBe(3);
    expect(cells[0].cell_start_utc).toBe('2026-11-02T04:30:00.000Z');
    expect(cells[1].cell_start_utc).toBe('2026-11-02T04:45:00.000Z');
    expect(cells[2].cell_start_utc).toBe('2026-11-02T05:00:00.000Z');
  });

  it('ignores client price tampering and always uses canonical service price', async () => {
    const startAtUtc = '2026-11-02T05:30:00.000Z'; // 11:00 AM local

    const payload = {
      service_id: serviceId,
      start_at_utc: startAtUtc,
      customer_name: 'Sneaky Client',
      customer_phone: '+919999999999',
      price_minor: 100, // Attempted tamper to 1 INR
    };

    const res = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.booking.price_minor).toBe(80000); // Kept 80000 from database
  });

  it('idempotency key returns identical response without duplicate bookings', async () => {
    const startAtUtc = '2026-11-02T06:30:00.000Z'; // 12:00 PM local
    const idempotencyKey = `idem-${generateUUID()}`;

    const payload = {
      service_id: serviceId,
      start_at_utc: startAtUtc,
      customer_name: 'Repeat Client',
      customer_phone: '+919888888888',
    };

    // First request
    const res1 = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
      env
    );
    expect(res1.status).toBe(201);
    const body1 = (await res1.json()) as any;

    // Second request with exact same idempotency key
    const res2 = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
      env
    );
    expect(res2.status).toBe(201);
    const body2 = (await res2.json()) as any;

    expect(body1.booking.reference).toBe(body2.booking.reference);
    expect(body1.booking.manage_token).toBe(body2.booking.manage_token);

    // Verify only ONE booking row exists in DB
    const count = await env.DB.prepare('SELECT COUNT(*) as c FROM bookings WHERE reference = ?')
      .bind(body1.booking.reference)
      .first<{ c: number }>();
    expect(count?.c).toBe(1);
  });

  it('GET /api/public/:slug/manage/:token fetches appointment details', async () => {
    // Create a booking first
    const createRes = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: '2026-11-02T07:30:00.000Z',
          customer_name: 'Priya Patel',
          customer_phone: '+919777777777',
        }),
      },
      env
    );
    const created = (await createRes.json()) as any;
    const token = created.booking.manage_token;

    // Fetch via manage token
    const manageRes = await app.request(`/api/public/${slug}/manage/${token}`, { method: 'GET' }, env);
    expect(manageRes.status).toBe(200);
    const manageBody = (await manageRes.json()) as any;
    expect(manageBody.booking.reference).toBe(created.booking.reference);
    expect(manageBody.booking.service_id).toBe(serviceId);
    expect(manageBody.booking.customer_name).toBe('Priya Patel');
    expect(manageBody.booking.can_cancel).toBe(true);
    expect(manageBody.booking.can_reschedule).toBe(true);
  });

  it('POST /api/public/:slug/manage/:token/cancel cancels booking and frees slot_cells', async () => {
    const createRes = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: '2026-11-02T08:30:00.000Z',
          customer_name: 'Rohan Mehra',
          customer_phone: '+919666666666',
        }),
      },
      env
    );
    const created = (await createRes.json()) as any;
    const token = created.booking.manage_token;

    // Cancel appointment
    const cancelRes = await app.request(
      `/api/public/${slug}/manage/${token}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Family emergency' }),
      },
      env
    );
    expect(cancelRes.status).toBe(200);
    const cancelBody = (await cancelRes.json()) as any;
    expect(cancelBody.booking.status).toBe('cancelled');

    // Verify slot_cells were completely deleted
    const cells = await env.DB.prepare('SELECT COUNT(*) as c FROM slot_cells WHERE booking_id = ?')
      .bind(cancelBody.booking.id)
      .first<{ c: number }>();
    expect(cells?.c).toBe(0);

    // Verify audit log in booking_events
    const event = await env.DB.prepare('SELECT * FROM booking_events WHERE booking_id = ? AND event_type = ?')
      .bind(cancelBody.booking.id, 'BOOKING_CANCELLED')
      .first<any>();
    expect(event).not.toBeNull();
  });

  it('POST /api/public/:slug/manage/:token/reschedule moves slot_cells to new time', async () => {
    const createRes = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: '2026-11-02T09:30:00.000Z',
          customer_name: 'Anita Roy',
          customer_phone: '+919555555555',
        }),
      },
      env
    );
    const created = (await createRes.json()) as any;
    const token = created.booking.manage_token;
    const newStartUtc = '2026-11-02T10:30:00.000Z';

    const reschedRes = await app.request(
      `/api/public/${slug}/manage/${token}/reschedule`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_start_at_utc: newStartUtc }),
      },
      env
    );

    expect(reschedRes.status).toBe(200);
    const reschedBody = (await reschedRes.json()) as any;
    expect(reschedBody.booking.start_at_utc).toBe(newStartUtc);
    expect(reschedBody.booking.version).toBe(2);

    // Verify new slot_cells match new start time
    const { results: newCells } = await env.DB.prepare(
      'SELECT cell_start_utc FROM slot_cells WHERE booking_id = ? ORDER BY cell_start_utc ASC'
    )
      .bind(reschedBody.booking.id)
      .all<any>();
    expect(newCells[0].cell_start_utc).toBe(newStartUtc);
  });

  it('POST /api/public/:slug/manage/:token/reschedule returns 409 slot_taken when target slot is occupied', async () => {
    // 1. Create Booking A at 2026-11-02 04:30 UTC
    const createA = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: '2026-11-02T04:30:00.000Z',
          customer_name: 'Customer A',
          customer_phone: '+919111111111',
        }),
      },
      env
    );
    expect(createA.status).toBe(201);

    // 2. Create Booking B at 2026-11-02 05:30 UTC
    const createB = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: '2026-11-02T05:30:00.000Z',
          customer_name: 'Customer B',
          customer_phone: '+919222222222',
        }),
      },
      env
    );
    expect(createB.status).toBe(201);
    const bodyB = (await createB.json()) as any;
    const tokenB = bodyB.booking.manage_token;

    // 3. Attempt to reschedule Booking B into Booking A's slot (2026-11-02 04:30 UTC)
    const conflictRes = await app.request(
      `/api/public/${slug}/manage/${tokenB}/reschedule`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_start_at_utc: '2026-11-02T04:30:00.000Z' }),
      },
      env
    );

    expect(conflictRes.status).toBe(409);
    const errBody = (await conflictRes.json()) as any;
    expect(errBody.error.code).toBe('slot_taken');
  });

  it('GET /api/public/:slug/availability supports exclude_booking_id for rescheduling self-exclusion', async () => {
    // 1. Create Booking at 2026-11-02 06:30 UTC
    const slotTime = '2026-11-02T06:30:00.000Z';
    const createRes = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: slotTime,
          customer_name: 'Self Exclude Tester',
          customer_phone: '+919333333333',
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as any;
    const bookingId = created.booking.id;
    const manageToken = created.booking.manage_token;

    // 2. Normal availability query without exclude_booking_id: slot 06:30 is NOT available
    const availWithout = await app.request(
      `/api/public/${slug}/availability?service_id=${serviceId}&date=2026-11-02`,
      { method: 'GET' },
      env
    );
    const dataWithout = (await availWithout.json()) as any;
    const slotTaken = dataWithout.available_slots.find((s: any) => s.start_at_utc === slotTime);
    expect(slotTaken).toBeUndefined();

    // 3. Unauthenticated attempt passing exclude_booking_id without manage_token: REJECTED (still taken)
    const availUnauth = await app.request(
      `/api/public/${slug}/availability?service_id=${serviceId}&date=2026-11-02&exclude_booking_id=${bookingId}`,
      { method: 'GET' },
      env
    );
    const dataUnauth = (await availUnauth.json()) as any;
    expect(dataUnauth.available_slots.find((s: any) => s.start_at_utc === slotTime)).toBeUndefined();

    // 4. Forged manage_token attempt: REJECTED (still taken)
    const availForged = await app.request(
      `/api/public/${slug}/availability?service_id=${serviceId}&date=2026-11-02&exclude_booking_id=${bookingId}&manage_token=fake_unauthorized_token`,
      { method: 'GET' },
      env
    );
    const dataForged = (await availForged.json()) as any;
    expect(dataForged.available_slots.find((s: any) => s.start_at_utc === slotTime)).toBeUndefined();

    // 5. Legitimate rescheduling availability query with matching manage_token: slot 06:30 IS available
    const availWith = await app.request(
      `/api/public/${slug}/availability?service_id=${serviceId}&date=2026-11-02&exclude_booking_id=${bookingId}&manage_token=${manageToken}`,
      { method: 'GET' },
      env
    );
    const dataWith = (await availWith.json()) as any;
    const slotFree = dataWith.available_slots.find((s: any) => s.start_at_utc === slotTime);
    expect(slotFree).toBeDefined();
  });

  it('POST /api/public/:slug/manage/:token/reschedule rejects requests violating minimum notice and preserves original slot cells', async () => {
    // 1. Create Booking at a valid future date (2026-11-02 07:30 UTC)
    const originalStart = '2026-11-02T07:30:00.000Z';
    const createRes = await app.request(
      `/api/public/${slug}/bookings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: originalStart,
          customer_name: 'Min Notice Tester',
          customer_phone: '+919444444444',
        }),
      },
      env
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as any;
    const bookingId = created.booking.id;
    const manageToken = created.booking.manage_token;

    // Verify initial slot_cells for this booking
    const { results: initialCells } = await env.DB.prepare(
      'SELECT cell_start_utc FROM slot_cells WHERE booking_id = ? ORDER BY cell_start_utc ASC'
    )
      .bind(bookingId)
      .all<any>();
    expect(initialCells.length).toBeGreaterThan(0);
    expect(initialCells[0].cell_start_utc).toBe(originalStart);

    // 2. Attempt to reschedule to a slot violating min_notice_hours (business has min_notice_hours = 2)
    const violatingStart = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const rejectRes = await app.request(
      `/api/public/${slug}/manage/${manageToken}/reschedule`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_start_at_utc: violatingStart }),
      },
      env
    );

    expect(rejectRes.status).toBe(422);
    const errBody = (await rejectRes.json()) as any;
    expect(errBody.error.code).toBe('policy_violation');
    expect(errBody.error.message).toContain('at least 2 hours in advance');

    // 3. Confirm original booking record in D1 remains unchanged
    const bookingInDb = await env.DB.prepare('SELECT start_at_utc, version FROM bookings WHERE id = ?')
      .bind(bookingId)
      .first<any>();
    expect(bookingInDb.start_at_utc).toBe(originalStart);
    expect(bookingInDb.version).toBe(1);

    // 4. Confirm original slot_cells remain unchanged in D1
    const { results: cellsAfter } = await env.DB.prepare(
      'SELECT cell_start_utc FROM slot_cells WHERE booking_id = ? ORDER BY cell_start_utc ASC'
    )
      .bind(bookingId)
      .all<any>();
    expect(cellsAfter).toEqual(initialCells);
  });
});
