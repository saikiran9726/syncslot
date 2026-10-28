// SlotSync Auth & Security API Tests
// Verifies registration, validation, login, rate limiting, and session cookies

import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/worker/index';

describe('Authentication & Session API', () => {
  const uniquePrefix = `test-${Date.now()}`;

  it('rejects registration with password shorter than 10 characters', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          email: `${uniquePrefix}-short@test.com`,
          password: 'short',
          businessName: 'Short Salon',
          slug: `${uniquePrefix}-short`,
        }),
      }),
      env
    );

    expect(res.status).toBe(422);
    const body: any = await res.json();
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.fields?.password).toMatch(/at least 10 characters/);
  });

  it('rejects registration with a reserved slug', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          email: `${uniquePrefix}-reserved@test.com`,
          password: 'ValidPassword123!',
          businessName: 'Admin Salon',
          slug: 'admin',
        }),
      }),
      env
    );

    expect(res.status).toBe(422);
    const body: any = await res.json();
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.fields?.slug).toMatch(/reserved/);
  });

  it('successfully registers owner, sets session cookie, and seeds default records', async () => {
    const slug = `${uniquePrefix}-barber`;
    const email = `${uniquePrefix}-owner@test.com`;

    const res = await worker.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          email,
          password: 'SecurePassword123!',
          businessName: 'Premier Barber',
          slug,
          timezone: 'Asia/Kolkata',
          industryPreset: 'salon',
        }),
      }),
      env
    );

    expect(res.status).toBe(201);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('slotsync_session=');
    expect(setCookie).toContain('HttpOnly');

    const data: any = await res.json();
    expect(data.user.email).toBe(email);
    expect(data.business.slug).toBe(slug);
    expect(data.role).toBe('owner');

    // Verify DB seeded records: default resource, hours, preset services
    const businessId = data.business.id;
    const resource = await env.DB.prepare('SELECT * FROM resources WHERE business_id = ? AND is_default = 1')
      .bind(businessId)
      .first();
    expect(resource).toBeTruthy();

    const hours = await env.DB.prepare('SELECT COUNT(*) as count FROM working_hours WHERE business_id = ?')
      .bind(businessId)
      .first<{ count: number }>();
    expect(hours?.count).toBe(7); // 7 days of the week

    const services = await env.DB.prepare('SELECT COUNT(*) as count FROM services WHERE business_id = ?')
      .bind(businessId)
      .first<{ count: number }>();
    expect(services?.count).toBe(4); // 4 salon services seeded
  });

  it('rejects duplicate email and duplicate slug with policy_violation (409)', async () => {
    const slug = `${uniquePrefix}-dup`;
    const email = `${uniquePrefix}-dup@test.com`;

    // First registration
    await worker.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          email,
          password: 'SecurePassword123!',
          businessName: 'First Salon',
          slug,
        }),
      }),
      env
    );

    // Duplicate email registration
    const resDupEmail = await worker.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          email,
          password: 'SecurePassword123!',
          businessName: 'Another Salon',
          slug: `${slug}-unique`,
        }),
      }),
      env
    );
    expect(resDupEmail.status).toBe(409);
    const dupEmailBody: any = await resDupEmail.json();
    expect(dupEmailBody.error.code).toBe('policy_violation');

    // Duplicate slug registration
    const resDupSlug = await worker.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          email: `${uniquePrefix}-other@test.com`,
          password: 'SecurePassword123!',
          businessName: 'Third Salon',
          slug,
        }),
      }),
      env
    );
    expect(resDupSlug.status).toBe(409);
    const dupSlugBody: any = await resDupSlug.json();
    expect(dupSlugBody.error.code).toBe('policy_violation');
  });

  it('handles login flow: valid, invalid, and rate-limited attempts', async () => {
    const slug = `${uniquePrefix}-login`;
    const email = `${uniquePrefix}-login@test.com`;
    const password = 'SuperSecret123!';

    // Register user first
    await worker.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          email,
          password,
          businessName: 'Login Test Salon',
          slug,
        }),
      }),
      env
    );

    // Invalid password returns generic 401
    const invalidRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'CF-Connecting-IP': '10.0.0.1',
        },
        body: JSON.stringify({ email, password: 'WrongPassword999!' }),
      }),
      env
    );
    expect(invalidRes.status).toBe(401);
    const invalidBody: any = await invalidRes.json();
    expect(invalidBody.error.code).toBe('unauthenticated');
    expect(invalidBody.error.message).toBe('Invalid email or password');

    // Successful login returns session and profile
    const validRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'CF-Connecting-IP': '10.0.0.2',
        },
        body: JSON.stringify({ email, password }),
      }),
      env
    );
    expect(validRes.status).toBe(200);
    const cookieHeader = validRes.headers.get('Set-Cookie');
    expect(cookieHeader).toContain('slotsync_session=');

    // Extract cookie token for authenticated calls
    const sessionCookie = cookieHeader!.split(';')[0];

    // Check GET /api/auth/me
    const meRes = await worker.fetch(
      new Request('http://localhost/api/auth/me', {
        method: 'GET',
        headers: { Cookie: sessionCookie },
      }),
      env
    );
    expect(meRes.status).toBe(200);
    const meData: any = await meRes.json();
    expect(meData.user.email).toBe(email);
    expect(meData.business.slug).toBe(slug);

    // Logout deletes session
    const logoutRes = await worker.fetch(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: sessionCookie, Origin: 'http://localhost' },
      }),
      env
    );
    expect(logoutRes.status).toBe(200);

    // After logout, session is rejected
    const meAfterLogout = await worker.fetch(
      new Request('http://localhost/api/auth/me', {
        method: 'GET',
        headers: { Cookie: sessionCookie },
      }),
      env
    );
    expect(meAfterLogout.status).toBe(401);

    // Test Rate Limiter by making 5 failed attempts from same IP
    const attackerIp = '198.51.100.42';
    for (let i = 0; i < 5; i++) {
      await worker.fetch(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost',
            'CF-Connecting-IP': attackerIp,
          },
          body: JSON.stringify({ email: 'target@test.com', password: 'bad' }),
        }),
        env
      );
    }

    // 6th attempt must be 429 rate_limited
    const rateLimitedRes = await worker.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost',
          'CF-Connecting-IP': attackerIp,
        },
        body: JSON.stringify({ email: 'target@test.com', password: 'bad' }),
      }),
      env
    );
    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.headers.get('Retry-After')).toBeTruthy();
  });
});
