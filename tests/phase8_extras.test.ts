import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../src/worker/index';

describe('Phase 8 — Optional Extras (Insights, CSV Export, Reviews, Share Polish)', () => {
  const testEnv = {
    ...env,
    ENVIRONMENT: 'development',
    APP_BASE_URL: 'http://localhost:8787',
    COOKIE_NAME: 'slotsync_session',
    EMAIL_FROM: 'SlotSync <appointments@slotsync.dev>',
    RATE_LIMIT_SALT: 'phase8-test-salt',
    SESSION_SECRET: 'phase8-test-session-secret',
    TOKEN_SECRET: 'phase8-test-token-secret',
  };

  it('1. Insights (H1): Computes real metrics, cancellation rate, top services and respects empty state', async () => {
    const slug = `p8-ins-${Date.now().toString().slice(-6)}`;

    // Register owner
    const regRes = await app.fetch(
      new Request('http://localhost:8787/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8787' },
        body: JSON.stringify({
          email: `${slug}@example.com`,
          password: 'Password123!',
          businessName: 'Insights Test Salon',
          slug,
          timezone: 'Asia/Kolkata',
          industryPreset: 'hair_salon',
        }),
      }),
      testEnv as any
    );
    expect(regRes.status).toBe(201);
    const cookie = regRes.headers.get('Set-Cookie')!.split(';')[0];

    // Initial empty state check
    const emptyRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/insights', {
        headers: { Cookie: cookie },
      }),
      testEnv as any
    );
    expect(emptyRes.status).toBe(200);
    const emptyBody = (await emptyRes.json()) as any;
    expect(emptyBody.is_empty).toBe(true);
    expect(emptyBody.summary.total_bookings).toBe(0);
    expect(emptyBody.summary.cancellation_rate_percent).toBe(0);

    // Create a service
    const srvRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:8787' },
        body: JSON.stringify({
          name: 'Classic Fade',
          duration_minutes: 30,
          buffer_minutes: 15,
          price_minor: 50000, // ₹500
        }),
      }),
      testEnv as any
    );
    const srvId = ((await srvRes.json()) as any).service.id;

    // Book an appointment via Quick Add
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const startUtc = `${tomorrow.toISOString().slice(0, 10)}T05:00:00.000Z`;

    const bookRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:8787' },
        body: JSON.stringify({
          customer_name: 'Insights Client',
          customer_phone: '9876543210',
          service_id: srvId,
          start_at_utc: startUtc,
          source: 'phone',
        }),
      }),
      testEnv as any
    );
    expect(bookRes.status).toBe(201);
    const bookingId = ((await bookRes.json()) as any).booking.id;

    // Transition to completed
    const patchRes = await app.fetch(
      new Request(`http://localhost:8787/api/owner/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:8787' },
        body: JSON.stringify({ status: 'completed' }),
      }),
      testEnv as any
    );
    expect(patchRes.status).toBe(200);

    // Re-check insights
    const populatedRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/insights', {
        headers: { Cookie: cookie },
      }),
      testEnv as any
    );
    expect(populatedRes.status).toBe(200);
    const popBody = (await populatedRes.json()) as any;
    expect(popBody.is_empty).toBe(false);
    expect(popBody.summary.total_bookings).toBe(1);
    expect(popBody.summary.completed_bookings).toBe(1);
    expect(popBody.summary.total_revenue_minor).toBe(50000);
    expect(popBody.top_services.length).toBeGreaterThan(0);
    expect(popBody.top_services[0].name).toBe('Classic Fade');
  });

  it('2. CSV Export (C6): Exports tenant bookings and neutralizes formula injection', async () => {
    const slug = `p8-csv-${Date.now().toString().slice(-6)}`;

    // Register owner
    const regRes = await app.fetch(
      new Request('http://localhost:8787/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8787' },
        body: JSON.stringify({
          email: `${slug}@example.com`,
          password: 'Password123!',
          businessName: 'CSV Test Salon',
          slug,
          timezone: 'Asia/Kolkata',
          industryPreset: 'hair_salon',
        }),
      }),
      testEnv as any
    );
    const cookie = regRes.headers.get('Set-Cookie')!.split(';')[0];

    // Create service
    const srvRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:8787' },
        body: JSON.stringify({
          name: 'Hair Wash',
          duration_minutes: 15,
          buffer_minutes: 0,
          price_minor: 20000,
        }),
      }),
      testEnv as any
    );
    const srvId = ((await srvRes.json()) as any).service.id;

    // Create a booking with a formula injection attempt in customer name
    const maliciousName = '=SUM(1+1)*cmd|/C calc!A0';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const startUtc = `${tomorrow.toISOString().slice(0, 10)}T06:00:00.000Z`;

    const bookRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:8787' },
        body: JSON.stringify({
          customer_name: maliciousName,
          customer_phone: '9876543211',
          service_id: srvId,
          start_at_utc: startUtc,
          source: 'walkin',
        }),
      }),
      testEnv as any
    );
    expect(bookRes.status).toBe(201);

    // Request CSV export
    const exportRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/bookings/export', {
        headers: { Cookie: cookie },
      }),
      testEnv as any
    );

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('Content-Type')).toContain('text/csv');
    expect(exportRes.headers.get('Content-Disposition')).toContain('attachment; filename=');

    const csvText = await exportRes.text();
    // Headers must be present
    expect(csvText).toContain('Reference,Customer Name,Phone,Email,Service');
    // Secrets/hashes must be excluded
    expect(csvText).not.toContain('manage_token_hash');
    expect(csvText).not.toContain('password_salt');
    // Formula injection must be neutralized with leading single quote
    expect(csvText).toContain("`'=SUM(1+1)*cmd|/C calc!A0`".replace(/`/g, ''));
  });

  it('3. Reviews: Configures external review destination and returns review statistics', async () => {
    const slug = `p8-rev-${Date.now().toString().slice(-6)}`;

    // Register owner
    const regRes = await app.fetch(
      new Request('http://localhost:8787/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8787' },
        body: JSON.stringify({
          email: `${slug}@example.com`,
          password: 'Password123!',
          businessName: 'Reviews Test Salon',
          slug,
          timezone: 'Asia/Kolkata',
          industryPreset: 'hair_salon',
        }),
      }),
      testEnv as any
    );
    const cookie = regRes.headers.get('Set-Cookie')!.split(';')[0];

    // Set Google Review URL
    const googleReviewLink = 'https://g.page/r/test-google-review-destination/review';
    const patchRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'http://localhost:8787' },
        body: JSON.stringify({ review_url: googleReviewLink }),
      }),
      testEnv as any
    );
    expect(patchRes.status).toBe(200);

    // Fetch reviews hub
    const reviewsRes = await app.fetch(
      new Request('http://localhost:8787/api/owner/reviews', {
        headers: { Cookie: cookie },
      }),
      testEnv as any
    );
    expect(reviewsRes.status).toBe(200);
    const revBody = (await reviewsRes.json()) as any;
    expect(revBody.review_url).toBe(googleReviewLink);
    expect(revBody.total_reviews).toBe(0);
    expect(revBody.average_rating).toBe(0);
  });
});
