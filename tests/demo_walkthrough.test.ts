import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../src/worker/index';
import { ERROR_CODES } from '../src/shared/errorCodes';

describe('Phase 11 — Step 5: Demo Script Walkthrough Verification', () => {
  const testEnv = {
    ...env,
    ENVIRONMENT: 'development',
    APP_BASE_URL: 'http://localhost:8787',
    COOKIE_NAME: 'slotsync_session',
    EMAIL_FROM: 'SlotSync <appointments@slotsync.dev>',
    RATE_LIMIT_SALT: 'demo-walkthrough-salt-phase11',
    SESSION_SECRET: 'demo-walkthrough-session-secret-phase11',
    TOKEN_SECRET: 'demo-walkthrough-token-secret-phase11',
  };

  it('Executes complete 9-step demo script walkthrough sequentially', async () => {
    const demoSlug = `luxe-demo-${Date.now().toString().slice(-6)}`;

    // ==========================================
    // STEP 1: Owner Signup & Today Command Center
    // ==========================================
    const regRes = await app.fetch(
      new Request('http://localhost:8787/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          email: 'demo-walk-owner@example.com',
          password: 'DemoPassword123!',
          businessName: 'Luxe Studio Salon (Demo)',
          slug: demoSlug,
          timezone: 'Asia/Kolkata',
          industryPreset: 'hair_salon',
        }),
      }),
      testEnv as any
    );

    expect(regRes.status).toBe(201);
    const setCookie = regRes.headers.get('Set-Cookie');
    expect(setCookie).toBeDefined();
    const ownerCookie = setCookie!.split(';')[0];

    const todayRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/dashboard/today', {
        headers: { Cookie: ownerCookie },
      }),
      testEnv as any
    );
    expect(todayRes.status).toBe(200);
    const todayBody = (await todayRes.json()) as any;
    expect(todayBody.metrics).toBeDefined();

    // ==========================================
    // STEP 2: Configure Service and Publish Business
    // ==========================================
    const srvRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          name: 'Signature Haircut & Style',
          description: 'Precision cut, wash, and blow dry finish.',
          duration_minutes: 45,
          buffer_minutes: 15,
          price_minor: 85000,
        }),
      }),
      testEnv as any
    );
    expect(srvRes.status).toBe(201);
    const srvBody = (await srvRes.json()) as any;
    const demoServiceId = srvBody.service.id;

    // Publish business
    const pubRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/business', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({ published: 1 }),
      }),
      testEnv as any
    );
    expect(pubRes.status).toBe(200);

    // ==========================================
    // STEP 3: Owner Quick Add (Walk-in Intake)
    // ==========================================
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
    const targetDateStr = tomorrow.toISOString().slice(0, 10);
    const walkInStartIso = `${targetDateStr}T04:30:00.000Z`; // 10:00 AM IST

    const quickAddRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: ownerCookie,
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          customer_name: 'Kabir Das (Demo)',
          customer_phone: '9876543299', // Normalizes to +919876543299
          customer_email: 'kabir.demo@example.com',
          service_id: demoServiceId,
          start_at_utc: walkInStartIso,
          source: 'walkin',
          notes: 'First time client',
        }),
      }),
      testEnv as any
    );

    expect(quickAddRes.status).toBe(201);
    const quickAddBody = (await quickAddRes.json()) as any;
    expect(quickAddBody.booking.reference).toMatch(/^SS-[A-Z0-9]{8}$/);
    expect(quickAddBody.booking.status).toBe('confirmed');

    // ==========================================
    // STEP 4: Booking Detail Drawer & Actions
    // ==========================================
    const detailRes = await app.fetch(
      new Request(`http://localhost:8787/api/owner/bookings/${quickAddBody.booking.id}`, {
        headers: { Cookie: ownerCookie },
      }),
      testEnv as any
    );
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as any;
    expect(detailBody.booking.reference).toBe(quickAddBody.booking.reference);

    // ==========================================
    // STEP 5: Public Availability Sweep & Booking
    // ==========================================
    const availRes = await app.fetch(
      new Request(
        `http://localhost:8787/api/public/${demoSlug}/availability?serviceId=${demoServiceId}&from=${targetDateStr}&to=${targetDateStr}`
      ),
      testEnv as any
    );
    expect(availRes.status).toBe(200);
    const availBody = (await availRes.json()) as any;
    expect(availBody.available_slots.length).toBeGreaterThan(0);

    // Pick open slot
    const bookedSlotIso = availBody.available_slots.find((s: any) => s.start_at_utc !== walkInStartIso)!.start_at_utc;

    const bookRes = await app.fetch(
      new Request(`http://localhost:8787/api/public/${demoSlug}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          service_id: demoServiceId,
          start_at_utc: bookedSlotIso,
          customer_name: 'Rohan Gupta (Demo)',
          customer_phone: '+919876543255',
          customer_email: 'rohan.demo@example.com',
          consent_email_reminders: true,
          consent_whatsapp_reminders: true,
        }),
      }),
      testEnv as any
    );
    expect(bookRes.status).toBe(201);
    const bookBody = (await bookRes.json()) as any;
    const newlyBookedToken = bookBody.booking.manage_token;
    expect(newlyBookedToken).toBeDefined();

    // ==========================================
    // STEP 6: Collision Defense (Duplicate Slot)
    // ==========================================
    const collisionRes = await app.fetch(
      new Request(`http://localhost:8787/api/public/${demoSlug}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          service_id: demoServiceId,
          start_at_utc: bookedSlotIso,
          customer_name: 'Competing Client (Demo)',
          customer_phone: '+919988776655',
          customer_email: 'competing@example.com',
          consent_email_reminders: true,
          consent_whatsapp_reminders: true,
        }),
      }),
      testEnv as any
    );
    expect(collisionRes.status).toBe(409);
    const collisionBody = (await collisionRes.json()) as any;
    expect(collisionBody.error.code).toBe(ERROR_CODES.SLOT_TAKEN);
    expect(collisionBody.alternative_slots.length).toBeGreaterThan(0);

    // ==========================================
    // STEP 7: Customer Self-Service Manage Link
    // ==========================================
    const inspectRes = await app.fetch(
      new Request(`http://localhost:8787/api/public/${demoSlug}/manage/${newlyBookedToken}`),
      testEnv as any
    );
    expect(inspectRes.status).toBe(200);
    expect(inspectRes.headers.get('Cache-Control')).toBe('no-store');

    const cancelRes = await app.fetch(
      new Request(`http://localhost:8787/api/public/${demoSlug}/manage/${newlyBookedToken}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({ reason: 'Work meeting conflict' }),
      }),
      testEnv as any
    );
    expect(cancelRes.status).toBe(200);
    const cancelBody = (await cancelRes.json()) as any;
    expect(cancelBody.status).toBe('cancelled');

    // ==========================================
    // STEP 8: Customer Directory & Book Again
    // ==========================================
    const custRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/customers', {
        headers: { Cookie: ownerCookie },
      }),
      testEnv as any
    );
    expect(custRes.status).toBe(200);
    const custBody = (await custRes.json()) as any;
    expect(custBody.customers.length).toBeGreaterThan(0);

    const firstCust = custBody.customers[0];
    const profileRes = await app.fetch(
      new Request(`http://localhost:8787/api/owner/customers/${firstCust.id}`, {
        headers: { Cookie: ownerCookie },
      }),
      testEnv as any
    );
    expect(profileRes.status).toBe(200);
    const profileBody = (await profileRes.json()) as any;
    expect(profileBody.customer.name).toBe(firstCust.name);

    // ==========================================
    // STEP 9: Notification Queue & Honest Mode
    // ==========================================
    const notifRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/notifications', {
        headers: { Cookie: ownerCookie },
      }),
      testEnv as any
    );
    expect(notifRes.status).toBe(200);
    const notifBody = (await notifRes.json()) as any;
    expect(notifBody.delivery_mode).toBe('dry_run');
    expect(notifBody.jobs).toBeDefined();
  });
});
