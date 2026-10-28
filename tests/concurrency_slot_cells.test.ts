import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { generateUUID, generateReferenceCode, generateSecretToken, sha256Hex } from '../src/shared/idUtils';
import { calculateSlotCells, calculateEndAtUtc } from '../src/shared/timeUtils';

describe('Concurrency & Slot Cells Race Condition Safety', () => {
  beforeEach(async () => {
    await env.DB.exec('PRAGMA foreign_keys = ON;');
  });

  it('guarantees that two parallel bookings for the same slot_cells result in exactly ONE success and ONE conflict', async () => {
    const businessId = generateUUID();
    const resourceId = generateUUID();
    const serviceId = generateUUID();
    const customerA = generateUUID();
    const customerB = generateUUID();

    // 1. Setup business, primary resource, and service (30 min duration + 15 min buffer)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO businesses (id, name, slug) VALUES (?, 'Fast Salon', ?)`).bind(businessId, `fast-${businessId.slice(0, 8)}`),
      env.DB.prepare(`INSERT INTO resources (id, business_id, name, is_default, is_active) VALUES (?, ?, 'Master Barber', 1, 1)`).bind(resourceId, businessId),
      env.DB.prepare(`INSERT INTO services (id, business_id, name, duration_minutes, buffer_minutes, price_minor) VALUES (?, ?, 'Haircut & Styling', 30, 15, 60000)`).bind(serviceId, businessId),
      env.DB.prepare(`INSERT INTO customers (id, business_id, normalized_phone, display_phone, name) VALUES (?, ?, '+919111111111', '9111111111', 'Customer A')`).bind(customerA, businessId),
      env.DB.prepare(`INSERT INTO customers (id, business_id, normalized_phone, display_phone, name) VALUES (?, ?, '+919222222222', '9222222222', 'Customer B')`).bind(customerB, businessId),
    ]);

    const startUtc = '2026-10-29T10:00:00.000Z';
    const endUtc = calculateEndAtUtc(startUtc, 30);
    const cells = calculateSlotCells(startUtc, 30, 15); // [10:00, 10:15, 10:30]
    expect(cells.length).toBe(3);

    // Helper to simulate atomic booking transaction
    const executeBookingTransaction = async (bookingId: string, customerId: string, refCode: string) => {
      const token = generateSecretToken();
      const tokenHash = await sha256Hex(token);

      const statements = [
        env.DB.prepare(
          `INSERT INTO bookings (
             id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id,
             start_at_utc, end_at_utc, business_timezone, price_minor, currency, status, version
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Asia/Kolkata', 60000, 'INR', 'confirmed', 1)`
        ).bind(bookingId, refCode, tokenHash, businessId, customerId, serviceId, resourceId, startUtc, endUtc),
        ...cells.map((cell) =>
          env.DB.prepare(
            `INSERT INTO slot_cells (resource_id, cell_start_utc, booking_id) VALUES (?, ?, ?)`
          ).bind(resourceId, cell, bookingId)
        ),
      ];

      return env.DB.batch(statements);
    };

    const bookingIdA = generateUUID();
    const bookingIdB = generateUUID();
    const refA = generateReferenceCode();
    const refB = generateReferenceCode();

    // 2. Fire both transactions concurrently to simulate simultaneous race condition
    const [resultA, resultB] = await Promise.allSettled([
      executeBookingTransaction(bookingIdA, customerA, refA),
      executeBookingTransaction(bookingIdB, customerB, refB),
    ]);

    // 3. Exactly ONE must be fulfilled, and ONE must be rejected
    const fulfilledCount = [resultA, resultB].filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = [resultA, resultB].filter((r) => r.status === 'rejected').length;

    expect(fulfilledCount).toBe(1);
    expect(rejectedCount).toBe(1);

    // Verify rejection error was a UNIQUE constraint violation on slot_cells
    const rejectedResult = (resultA.status === 'rejected' ? resultA : resultB) as PromiseRejectedResult;
    expect(rejectedResult.reason.message).toMatch(/UNIQUE constraint failed|constraint failed/i);

    // 4. Verify Database State: exactly one booking exists in D1, exactly 3 cells occupied
    const { results: storedBookings } = await env.DB.prepare(
      `SELECT id, reference, customer_id FROM bookings WHERE business_id = ?`
    ).bind(businessId).all();

    expect(storedBookings.length).toBe(1);

    const winningBookingId = storedBookings[0].id;
    const { results: storedCells } = await env.DB.prepare(
      `SELECT resource_id, cell_start_utc, booking_id FROM slot_cells WHERE resource_id = ?`
    ).bind(resourceId).all();

    expect(storedCells.length).toBe(3);
    expect(storedCells.every((cell) => cell.booking_id === winningBookingId)).toBe(true);
  });
});
