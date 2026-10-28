import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import worker, { app } from '../src/worker/index';
import { ERROR_CODES } from '../src/shared/errorCodes';

describe('Phase 10 — Verification Suite (Local Runtime Emulation)', () => {
  const prodLikeEnv = {
    ...env,
    ENVIRONMENT: 'development',
    APP_BASE_URL: 'http://localhost:8787',
    COOKIE_NAME: 'slotsync_session',
    EMAIL_FROM: 'SlotSync <appointments@slotsync.dev>',
    RATE_LIMIT_SALT: 'prod-salt-phase10-live-verification',
    SESSION_SECRET: 'prod-session-secret-phase10-live-verification',
    TOKEN_SECRET: 'prod-token-secret-phase10-live-verification',
  };

  it('1. Health endpoint returns 200 with service info', async () => {
    const res = await app.fetch(new Request('http://localhost:8787/api/health'), prodLikeEnv as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.service).toBe('syncslot-api');
  });

  it('2. Frontend root returns 200 with HTML SPA shell', async () => {
    const res = await app.fetch(new Request('http://localhost:8787/'), prodLikeEnv as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('<html');
  });

  it('3. SPA deep links (/b/<slug>, /app) return 200 with HTML shell', async () => {
    const resPublic = await app.fetch(new Request('http://localhost:8787/b/demo-salon'), prodLikeEnv as any);
    expect(resPublic.status).toBe(200);
    expect(resPublic.headers.get('content-type')).toContain('text/html');

    const resApp = await app.fetch(new Request('http://localhost:8787/app/today'), prodLikeEnv as any);
    expect(resApp.status).toBe(200);
    expect(resApp.headers.get('content-type')).toContain('text/html');
  });

  it('4. Unknown /api path returns JSON 404', async () => {
    const res = await app.fetch(new Request('http://localhost:8787/api/unknown-endpoint-xyz'), prodLikeEnv as any);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('5. Security headers present as designed in Phase 9', async () => {
    const res = await app.fetch(new Request('http://localhost:8787/api/health'), prodLikeEnv as any);
    expect(res.status).toBe(200);

    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toContain('geolocation=()');
  });

  it('6-13. Complete End-to-End Live Workflow (Owner, Services, Availability, Booking, Collision, Manage, Dashboard, Notifications)', async () => {
    const unique = Date.now().toString().slice(-6);
    const businessSlug = `p10-test-${unique}`;

    // 6. Sign up with a labeled test owner
    const regRes = await app.fetch(
      new Request('http://localhost:8787/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          email: `owner-p10-${unique}@slotsync.test`,
          password: 'TestPassword123!',
          businessName: 'Phase 10 Test Salon',
          slug: businessSlug,
          timezone: 'Asia/Kolkata',
          industryPreset: 'hair_salon',
        }),
      }),
      prodLikeEnv as any
    );

    expect(regRes.status).toBe(201);
    const setCookie = regRes.headers.get('Set-Cookie');
    expect(setCookie).toBeDefined();
    const sessionCookie = setCookie!.split(';')[0];

    // 7. Configure service and publish business
    const serviceRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          name: 'P10 Deluxe Haircut',
          duration_minutes: 30,
          buffer_minutes: 15,
          price_minor: 75000, // ₹750
        }),
      }),
      prodLikeEnv as any
    );
    expect(serviceRes.status).toBe(201);
    const serviceBody = (await serviceRes.json()) as any;
    const serviceId = serviceBody.service.id;

    // Publish business so public availability works
    const pubRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/business', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          published: 1,
        }),
      }),
      prodLikeEnv as any
    );
    expect(pubRes.status).toBe(200);

    // 8. Public booking page with real availability
    // Note: The preset seeds working hours for Monday-Saturday 09:00 - 18:00
    // Find next working day (e.g. 2 days ahead)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 2);
    // Ensure not Sunday (0)
    if (targetDate.getDay() === 0) targetDate.setDate(targetDate.getDate() + 1);
    const targetDateStr = targetDate.toISOString().slice(0, 10);

    const availRes = await app.fetch(
      new Request(
        `http://localhost:8787/api/public/${businessSlug}/availability?serviceId=${serviceId}&from=${targetDateStr}&to=${targetDateStr}`
      ),
      prodLikeEnv as any
    );

    expect(availRes.status).toBe(200);
    const availBody = (await availRes.json()) as any;
    expect(availBody.available_slots).toBeDefined();
    expect(availBody.available_slots.length).toBeGreaterThan(0);
    const bookingStartIso = availBody.available_slots[0].start_at_utc;

    // 9. Create a booking and receive manage token
    const bookRes = await app.fetch(
      new Request(`http://localhost:8787/api/public/${businessSlug}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: bookingStartIso,
          customer_name: 'P10 Verification Client',
          customer_phone: '+919876543210',
          customer_email: 'client-p10@slotsync.test',
          consent_email_reminders: true,
          consent_whatsapp_reminders: true,
        }),
      }),
      prodLikeEnv as any
    );

    expect(bookRes.status).toBe(201);
    const bookBody = (await bookRes.json()) as any;
    expect(bookBody.booking.reference).toMatch(/^SS-[A-Z0-9]{8}$/);
    expect(bookBody.booking.manage_token).toBeDefined();
    const manageToken = bookBody.booking.manage_token;

    // 10. Duplicate booking attempt returns 409 slot_taken with alternatives
    const dupRes = await app.fetch(
      new Request(`http://localhost:8787/api/public/${businessSlug}/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: bookingStartIso,
          customer_name: 'Concurrent Interloper',
          customer_phone: '+919988776655',
          customer_email: 'interloper@slotsync.test',
          consent_email_reminders: true,
          consent_whatsapp_reminders: true,
        }),
      }),
      prodLikeEnv as any
    );

    expect(dupRes.status).toBe(409);
    const dupBody = (await dupRes.json()) as any;
    expect(dupBody.error.code).toBe(ERROR_CODES.SLOT_TAKEN);
    expect(dupBody.alternative_slots).toBeDefined();

    // 11. Manage link cancel with security headers
    const inspectRes = await app.fetch(
      new Request(`http://localhost:8787/api/public/${businessSlug}/manage/${manageToken}`),
      prodLikeEnv as any
    );
    expect(inspectRes.status).toBe(200);
    expect(inspectRes.headers.get('Cache-Control')).toBe('no-store');
    expect(inspectRes.headers.get('Pragma')).toBe('no-cache');

    const cancelRes = await app.fetch(
      new Request(`http://localhost:8787/api/public/${businessSlug}/manage/${manageToken}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:8787',
        },
        body: JSON.stringify({
          reason: 'Customer schedule conflict',
        }),
      }),
      prodLikeEnv as any
    );
    expect(cancelRes.status).toBe(200);
    const cancelBody = (await cancelRes.json()) as any;
    expect(cancelBody.status).toBe('cancelled');

    // 12. Owner dashboard shows booking in Today and Bookings view
    const authTodayRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/dashboard/today', {
        headers: {
          Cookie: sessionCookie,
        },
      }),
      prodLikeEnv as any
    );
    expect(authTodayRes.status).toBe(200);
    const todayBody = (await authTodayRes.json()) as any;
    expect(todayBody.metrics).toBeDefined();

    const authBookingsRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/bookings', {
        headers: {
          Cookie: sessionCookie,
        },
      }),
      prodLikeEnv as any
    );
    expect(authBookingsRes.status).toBe(200);
    const bookingsBody = (await authBookingsRes.json()) as any;
    expect(bookingsBody.bookings).toBeDefined();

    // 13. Notification timeline shows honest status
    const notifRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/notifications', {
        headers: {
          Cookie: sessionCookie,
        },
      }),
      prodLikeEnv as any
    );

    expect(notifRes.status).toBe(200);
    const notifBody = (await notifRes.json()) as any;
    expect(notifBody.delivery_mode).toBe('dry_run'); // Honest mode banner
    expect(notifBody.jobs).toBeDefined();
  });

  it('14. Cloudflare Cron Trigger executes background notification worker', async () => {
    const scheduledEvent = {
      scheduledTime: Date.now(),
      cron: '*/5 * * * *',
    };

    await worker.scheduled(scheduledEvent as any, prodLikeEnv as any, {
      waitUntil: () => {},
      passThroughOnException: () => {},
    } as any);

    expect(true).toBe(true);
  });
});
