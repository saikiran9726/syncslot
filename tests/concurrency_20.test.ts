import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/worker/index';
import { generateUUID } from '../src/shared/idUtils';

describe('20-Way Parallel Concurrency & Race-Condition Safety (Slot Cells)', () => {
  let businessId: string;
  let serviceId: string;
  let resourceId: string;
  const slug = 'race-salon';

  beforeEach(async () => {
    await env.DB.exec('PRAGMA foreign_keys = ON;');
    businessId = generateUUID();
    serviceId = generateUUID();
    resourceId = generateUUID();

    // Setup fresh business, provider resource, service and operating hours
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO businesses (
          id, name, slug, timezone, published, booking_mode,
          min_notice_hours, max_days_ahead
        ) VALUES (?, 'Race Salon', ?, 'Asia/Kolkata', 1, 'instant', 0, 30)
      `).bind(businessId, slug),
      env.DB.prepare(`
        INSERT INTO resources (id, business_id, name, is_default, is_active)
        VALUES (?, ?, 'Solo Specialist', 1, 1)
      `).bind(resourceId, businessId),
      env.DB.prepare(`
        INSERT INTO services (id, business_id, name, duration_minutes, buffer_minutes, price_minor, currency, is_active)
        VALUES (?, ?, 'High Velocity Cut', 30, 15, 50000, 'INR', 1)
      `).bind(serviceId, businessId),
      // Open Thursday 09:00 - 18:00 (Day 4)
      env.DB.prepare(`
        INSERT INTO working_hours (id, business_id, day_of_week, open_time, close_time, is_closed)
        VALUES (?, ?, 4, '09:00', '18:00', 0)
      `).bind(generateUUID(), businessId),
    ]);
  });

  it('handles 20 simultaneous parallel requests for the exact same slot: exactly ONE 201, 19 receive 409 slot_taken with alternatives', async () => {
    const targetSlot = '2026-11-05T04:30:00.000Z'; // Thursday 10:00 AM local (Asia/Kolkata)
    const concurrencyCount = 20;

    // Launch 20 simultaneous HTTP POST requests via Promise.all
    const requests = Array.from({ length: concurrencyCount }, (_, i) => {
      const contenderPhone = `+9198000000${String(i).padStart(2, '0')}`;
      return app.request(
        `/api/public/${slug}/bookings`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: serviceId,
            start_at_utc: targetSlot,
            customer_name: `Contender ${i + 1}`,
            customer_phone: contenderPhone,
            notes: `High concurrency contender ${i + 1}`,
          }),
        },
        env
      );
    });

    const responses = await Promise.all(requests);
    const parsed = await Promise.all(
      responses.map(async (res) => ({
        status: res.status,
        body: (await res.json()) as any,
      }))
    );

    const successes = parsed.filter((r) => r.status === 201);
    const conflicts = parsed.filter((r) => r.status === 409);

    // Assert: Exactly ONE request wins
    expect(successes.length).toBe(1);
    expect(successes[0].body.booking).toBeDefined();
    expect(successes[0].body.booking.reference).toMatch(/^SS-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    expect(successes[0].body.booking.status).toBe('confirmed');

    // Assert: Exactly 19 requests receive 409 conflict
    expect(conflicts.length).toBe(concurrencyCount - 1);

    for (const conflict of conflicts) {
      expect(conflict.body.error).toBeDefined();
      expect(conflict.body.error.code).toBe('slot_taken');
      expect(conflict.body.error.message).toContain('taken by another booking');
      // Alternative slots must be provided to the runner-up
      expect(conflict.body.error.details).toBeDefined();
      expect(Array.isArray(conflict.body.error.details.alternative_slots)).toBe(true);
    }

    // Database verification: Exactly ONE booking recorded in DB for this business
    const bookingsCount = await env.DB.prepare('SELECT COUNT(*) as count FROM bookings WHERE business_id = ?')
      .bind(businessId)
      .first<{ count: number }>();
    expect(bookingsCount?.count).toBe(1);

    // Database verification: Exactly 3 slot cells reserved (30m duration + 15m buffer = 3 x 15m cells)
    const slotCellsCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM slot_cells WHERE resource_id = ?'
    )
      .bind(resourceId)
      .first<{ count: number }>();
    expect(slotCellsCount?.count).toBe(3);

    // Verify cell timestamps match exactly
    const { results: cells } = await env.DB.prepare(
      'SELECT cell_start_utc FROM slot_cells WHERE resource_id = ? ORDER BY cell_start_utc ASC'
    )
      .bind(resourceId)
      .all<{ cell_start_utc: string }>();

    expect(cells.map((c) => c.cell_start_utc)).toEqual([
      '2026-11-05T04:30:00.000Z',
      '2026-11-05T04:45:00.000Z',
      '2026-11-05T05:00:00.000Z',
    ]);
  });
});
