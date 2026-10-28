// SlotSync Business Configuration & Publishing Gate Tests

import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/worker/index';

describe('Business Configuration & Publishing Gate', () => {
  const prefix = `cfg-${Date.now()}`;

  async function registerNewBusiness(slug: string, preset: string = 'salon') {
    const res = await worker.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
        body: JSON.stringify({
          email: `${slug}@test.com`,
          password: 'Password12345!',
          businessName: 'Config Test Biz',
          slug,
          industryPreset: preset,
        }),
      }),
      env
    );
    const data: any = await res.json();
    const cookie = res.headers.get('Set-Cookie')!.split(';')[0];
    return { data, cookie, businessId: data.business.id };
  }

  it('rejects overlapping working hours on the same day with validation_failed (422)', async () => {
    const { cookie } = await registerNewBusiness(`${prefix}-overlap`);

    const badHoursRes = await worker.fetch(
      new Request('http://localhost/api/owner/hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: cookie },
        body: JSON.stringify({
          schedules: [
            { day_of_week: 1, open_time: '09:00', close_time: '13:00', is_closed: 0 },
            { day_of_week: 1, open_time: '12:00', close_time: '17:00', is_closed: 0 }, // Overlaps 12:00-13:00
          ],
        }),
      }),
      env
    );

    expect(badHoursRes.status).toBe(422);
    const body: any = await badHoursRes.json();
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.message).toMatch(/Overlapping hours/);
  });

  it('enforces publish gate: prevents publishing when services or hours are missing', async () => {
    // Register business with an empty preset (clinic or tutor with no preset services inserted, or clear services)
    const { cookie, businessId, data } = await registerNewBusiness(`${prefix}-gate`);
    const slug = data.business.slug;

    // Delete all services for this business to test gate
    await env.DB.prepare('DELETE FROM services WHERE business_id = ?').bind(businessId).run();

    // Attempt to publish
    const publishRes = await worker.fetch(
      new Request('http://localhost/api/owner/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: cookie },
        body: JSON.stringify({ published: 1 }),
      }),
      env
    );

    expect(publishRes.status).toBe(422);
    const errBody: any = await publishRes.json();
    expect(errBody.error.code).toBe('validation_failed');
    expect(errBody.error.message).toContain('At least one active service is required');

    // Public page returns 404 when unpublished
    const publicUnpublished = await worker.fetch(
      new Request(`http://localhost/api/public/business/${slug}`, { method: 'GET' }),
      env
    );
    expect(publicUnpublished.status).toBe(404);

    // Now add an active service
    const createServiceRes = await worker.fetch(
      new Request('http://localhost/api/owner/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: cookie },
        body: JSON.stringify({
          name: 'Classic Manicure',
          duration_minutes: 30,
          price_minor: 40000,
        }),
      }),
      env
    );
    expect(createServiceRes.status).toBe(201);

    // Now publishing must succeed
    const successfulPublish = await worker.fetch(
      new Request('http://localhost/api/owner/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: cookie },
        body: JSON.stringify({ published: 1 }),
      }),
      env
    );
    expect(successfulPublish.status).toBe(200);

    // Now public page returns 200 with business details and services list
    const publicPublished = await worker.fetch(
      new Request(`http://localhost/api/public/business/${slug}`, { method: 'GET' }),
      env
    );
    expect(publicPublished.status).toBe(200);
    const pubData: any = await publicPublished.json();
    expect(pubData.business.name).toBe('Config Test Biz');
    expect(pubData.services.length).toBe(1);
    expect(pubData.services[0].name).toBe('Classic Manicure');
  });

  it('records audit log entries upon mutating settings and services', async () => {
    const { cookie, businessId } = await registerNewBusiness(`${prefix}-audit`);

    await worker.fetch(
      new Request('http://localhost/api/owner/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: cookie },
        body: JSON.stringify({ description: 'A luxury experience in the city center.' }),
      }),
      env
    );

    const auditEntry = await env.DB.prepare(
      'SELECT * FROM audit_log WHERE business_id = ? AND action = "UPDATE_BUSINESS_SETTINGS"'
    )
      .bind(businessId)
      .first<{ action: string; target_type: string; payload_json: string }>();

    expect(auditEntry).toBeTruthy();
    expect(auditEntry?.target_type).toBe('business');
    expect(auditEntry?.payload_json).toContain('A luxury experience in the city center.');
  });
});
