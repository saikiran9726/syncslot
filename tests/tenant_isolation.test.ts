// SlotSync Multi-Tenant Isolation & Role Permission Tests
// Verifies cross-tenant data leaks are impossible and staff roles cannot modify business settings

import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/worker/index';
import { generateUUID, sha256Hex } from '../src/shared/idUtils';

describe('Multi-Tenant Isolation & Role Enforcement', () => {
  const prefix = `iso-${Date.now()}`;

  async function registerTenant(name: string, slug: string, email: string) {
    const res = await worker.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          email,
          password: 'Password12345!',
          businessName: name,
          slug,
        }),
      }),
      env
    );
    const data: any = await res.json();
    const cookie = res.headers.get('Set-Cookie')!.split(';')[0];
    return { data, cookie };
  }

  it('guarantees tenant isolation: Tenant A cannot read or mutate Tenant B services', async () => {
    const tenantA = await registerTenant('Tenant Alpha', `${prefix}-alpha`, `${prefix}-alpha@test.com`);
    const tenantB = await registerTenant('Tenant Beta', `${prefix}-beta`, `${prefix}-beta@test.com`);

    // Tenant B creates a private service
    const createRes = await worker.fetch(
      new Request('http://localhost/api/owner/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: tenantB.cookie },
        body: JSON.stringify({
          name: 'Beta Exclusive VIP Spa',
          duration_minutes: 45,
          price_minor: 99900,
        }),
      }),
      env
    );
    expect(createRes.status).toBe(201);
    const betaService: any = await createRes.json();
    const betaServiceId = betaService.service.id;

    // Tenant A tries to list services -> Beta Exclusive VIP Spa must NOT be in Tenant A list
    const listRes = await worker.fetch(
      new Request('http://localhost/api/owner/services', {
        method: 'GET',
        headers: { Cookie: tenantA.cookie },
      }),
      env
    );
    expect(listRes.status).toBe(200);
    const listData: any = await listRes.json();
    const foundBetaInAlpha = listData.services.find((s: any) => s.id === betaServiceId);
    expect(foundBetaInAlpha).toBeUndefined();

    // Tenant A attempts to mutate Tenant B service directly by ID -> must 404 (cross-tenant shielded)
    const rogueUpdateRes = await worker.fetch(
      new Request(`http://localhost/api/owner/services/${betaServiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: tenantA.cookie },
        body: JSON.stringify({ name: 'Hacked by Alpha' }),
      }),
      env
    );
    expect(rogueUpdateRes.status).toBe(404);

    // Tenant A attempts to delete Tenant B service -> must 404
    const rogueDeleteRes = await worker.fetch(
      new Request(`http://localhost/api/owner/services/${betaServiceId}`, {
        method: 'DELETE',
        headers: { Origin: 'http://localhost', Cookie: tenantA.cookie },
      }),
      env
    );
    expect(rogueDeleteRes.status).toBe(404);

    // Verify service in Tenant B is unchanged
    const verifyBetaService = await env.DB.prepare('SELECT name FROM services WHERE id = ?')
      .bind(betaServiceId)
      .first<{ name: string }>();
    expect(verifyBetaService?.name).toBe('Beta Exclusive VIP Spa');
  });

  it('enforces role permissions: staff membership can read services but cannot modify settings or hours', async () => {
    const ownerTenant = await registerTenant('Role Test Salon', `${prefix}-role`, `${prefix}-role@test.com`);
    const businessId = ownerTenant.data.business.id;

    // Register a secondary user and directly grant them 'staff' role for this business
    const staffEmail = `${prefix}-staff@test.com`;
    const staffUserId = generateUUID();
    const staffSessionToken = 'staff-token-' + generateUUID();
    const staffTokenHash = await sha256Hex(staffSessionToken);

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + 86400000).toISOString();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, created_at_utc, updated_at_utc)
         VALUES (?, ?, 'dummyhash', 'dummysalt', ?, ?)`
      ).bind(staffUserId, staffEmail, nowIso, nowIso),

      env.DB.prepare(
        `INSERT INTO memberships (id, business_id, user_id, role, created_at_utc)
         VALUES (?, ?, ?, 'staff', ?)`
      ).bind(generateUUID(), businessId, staffUserId, nowIso),

      env.DB.prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at_utc, created_at_utc)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(generateUUID(), staffUserId, staffTokenHash, expiresIso, nowIso),
    ]);

    const staffCookie = `slotsync_session=${staffSessionToken}`;

    // Staff can read services
    const staffReadServices = await worker.fetch(
      new Request('http://localhost/api/owner/services', {
        method: 'GET',
        headers: { Cookie: staffCookie },
      }),
      env
    );
    expect(staffReadServices.status).toBe(200);

    // Staff is FORBIDDEN (403) from creating a service
    const staffCreateService = await worker.fetch(
      new Request('http://localhost/api/owner/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: staffCookie },
        body: JSON.stringify({ name: 'Staff Service', duration_minutes: 30, price_minor: 1000 }),
      }),
      env
    );
    expect(staffCreateService.status).toBe(403);
    const forbiddenServiceBody: any = await staffCreateService.json();
    expect(forbiddenServiceBody.error.code).toBe('forbidden');

    // Staff is FORBIDDEN (403) from modifying business profile
    const staffUpdateProfile = await worker.fetch(
      new Request('http://localhost/api/owner/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: staffCookie },
        body: JSON.stringify({ name: 'Staff Renamed Salon' }),
      }),
      env
    );
    expect(staffUpdateProfile.status).toBe(403);

    // Staff is FORBIDDEN (403) from updating working hours
    const staffUpdateHours = await worker.fetch(
      new Request('http://localhost/api/owner/hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: staffCookie },
        body: JSON.stringify({
          schedules: [{ day_of_week: 1, open_time: '10:00', close_time: '17:00', is_closed: 0 }],
        }),
      }),
      env
    );
    expect(staffUpdateHours.status).toBe(403);
  });
});
