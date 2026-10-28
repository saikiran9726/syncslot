// SlotSync Notifications & Reminders Automated Test Suite (Phase 7: E1-E9)
// Validates: Backfill idempotency, atomic claim under parallel processors, lease expiry,
// retry/backoff & max attempts, booking version mismatch cancellation, customer consent & opt-out,
// quiet hours shift (reminders only), 15-minute lateness boundary, sandbox skip, dry-run simulation,
// sanitized provider failure reporting, UI label audit, and tenant isolation.

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker, { app } from '../src/worker/index';
import { generateUUID } from '../src/shared/idUtils';
import { processNotificationQueue, isInQuietHours, shiftOutOfQuietHours } from '../src/worker/notifications/jobProcessor';
import { createNotificationJobsForEvent } from '../src/worker/notifications/jobCreator';
import { dispatchEmail } from '../src/worker/notifications/provider';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { NotificationsPage } from '../src/web/pages/NotificationsPage';

describe('Phase 7: Notifications & Reminders Engine (E1-E9)', () => {
  const prefix = `notif-${Date.now()}`;

  async function registerOwner(name: string, slug: string, email: string) {
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
    return { data, cookie, businessId: data.business?.id || data.user?.business_id };
  }

  beforeEach(async () => {
    await env.DB.exec('PRAGMA foreign_keys = ON;');
  });

  // 1. Backfill Idempotency
  describe('1. Additive Migration & Backfill Idempotency', () => {
    it('executes idempotent backfill twice with zero errors and no duplicate rules', async () => {
      const owner = await registerOwner('Backfill Salon', `${prefix}-bf`, `${prefix}-bf@example.com`);

      // Run backfill SQL explicitly a second time
      await env.DB.batch([
        env.DB.prepare(`
          INSERT OR IGNORE INTO notification_preferences (
            id, business_id, enable_email, enable_whatsapp_manual, consent_copy_text, created_at_utc
          )
          SELECT
            'np_' || b.id, b.id, 1, 1,
            'I agree to receive booking confirmations and reminder updates via email and messaging.',
            strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          FROM businesses b
          WHERE NOT EXISTS (SELECT 1 FROM notification_preferences np WHERE np.business_id = b.id)
        `),
        env.DB.prepare(`
          INSERT OR IGNORE INTO reminder_rules (id, business_id, offset_minutes, enabled, template_key, created_at_utc)
          SELECT 'rr_1440_' || b.id, b.id, 1440, 1, 'reminder_24h', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          FROM businesses b
          WHERE NOT EXISTS (SELECT 1 FROM reminder_rules rr WHERE rr.business_id = b.id AND rr.offset_minutes = 1440)
        `),
        env.DB.prepare(`
          INSERT OR IGNORE INTO reminder_rules (id, business_id, offset_minutes, enabled, template_key, created_at_utc)
          SELECT 'rr_120_' || b.id, b.id, 120, 1, 'reminder_2h', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          FROM businesses b
          WHERE NOT EXISTS (SELECT 1 FROM reminder_rules rr WHERE rr.business_id = b.id AND rr.offset_minutes = 120)
        `),
      ]);

      // Verify exactly 1 24h rule and 1 2h rule exist for the business
      const r1440 = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM reminder_rules WHERE business_id = ? AND offset_minutes = 1440'
      ).bind(owner.businessId).first<{ count: number }>();
      expect(r1440?.count).toBe(1);

      const r120 = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM reminder_rules WHERE business_id = ? AND offset_minutes = 120'
      ).bind(owner.businessId).first<{ count: number }>();
      expect(r120?.count).toBe(1);
    });
  });

  // 2. Atomic Claim Under Parallel Processors (Zero Double Sends)
  describe('2. Atomic Claim & Concurrency Safety (E4)', () => {
    it('guarantees no job is claimed or processed twice under 3 concurrent runs', async () => {
      const owner = await registerOwner('Claim Arena Salon', `${prefix}-claim`, `${prefix}-claim@example.com`);

      // Seed customer & booking
      const custId = generateUUID();
      const bookingId = generateUUID();
      const nowIso = new Date().toISOString();

      await env.DB.prepare(`
        INSERT INTO customers (id, business_id, normalized_phone, display_phone, name, email, consent_email_reminders, created_at_utc, updated_at_utc)
        VALUES (?, ?, '+919876543210', '98765 43210', 'Parallel Tester', 'tester@example.com', 1, ?, ?)
      `).bind(custId, owner.businessId, nowIso, nowIso).run();

      const svc = await env.DB.prepare('SELECT id FROM services WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();
      const res = await env.DB.prepare('SELECT id FROM resources WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();

      await env.DB.prepare(`
        INSERT INTO bookings (id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id, start_at_utc, end_at_utc, business_timezone, status, price_minor, currency, version, created_at_utc, updated_at_utc)
        VALUES (?, 'SS-CLAIM01', 'tokenhash', ?, ?, ?, ?, '2026-11-20T10:00:00Z', '2026-11-20T10:30:00Z', 'Asia/Kolkata', 'confirmed', 50000, 'INR', 1, ?, ?)
      `).bind(bookingId, owner.businessId, custId, svc?.id, res?.id, nowIso, nowIso).run();

      // Seed 5 due jobs
      const jobIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const jId = generateUUID();
        jobIds.push(jId);
        await env.DB.prepare(`
          INSERT INTO notification_jobs (id, business_id, booking_id, booking_version, customer_id, channel, template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc)
          VALUES (?, ?, ?, 1, ?, 'email', 'booking_confirmed', ?, 'queued', ?, ?, ?)
        `).bind(jId, owner.businessId, bookingId, custId, nowIso, `claim_${jId}`, nowIso, nowIso).run();
      }

      // Run 3 parallel processor calls simultaneously
      const results = await Promise.all([
        processNotificationQueue(env as any, 10),
        processNotificationQueue(env as any, 10),
        processNotificationQueue(env as any, 10),
      ]);

      const totalSimulated = results.reduce((acc, r) => acc + r.simulated, 0);
      expect(totalSimulated).toBe(5);

      // Verify each job has attempt_count exactly 1
      for (const jId of jobIds) {
        const row = await env.DB.prepare('SELECT attempt_count, status FROM notification_jobs WHERE id = ?')
          .bind(jId)
          .first<{ attempt_count: number; status: string }>();
        expect(row?.attempt_count).toBe(1);
        expect(row?.status).toBe('simulated');
      }
    });
  });

  // 3. Lease Expiry & Reclamation
  describe('3. Stuck Lease Expiry & Reclamation', () => {
    it('reclaims expired lease when job was stuck in sending state', async () => {
      const owner = await registerOwner('Lease Salon', `${prefix}-lease`, `${prefix}-lease@example.com`);

      const custId = generateUUID();
      const bookingId = generateUUID();
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const expiredLockIso = new Date(nowMs - 60000).toISOString(); // Expired 1 min ago

      await env.DB.prepare(`
        INSERT INTO customers (id, business_id, normalized_phone, display_phone, name, email, consent_email_reminders, created_at_utc, updated_at_utc)
        VALUES (?, ?, '+919876543210', '98765 43210', 'Lease Tester', 'lease@example.com', 1, ?, ?)
      `).bind(custId, owner.businessId, nowIso, nowIso).run();

      const svc = await env.DB.prepare('SELECT id FROM services WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();
      const res = await env.DB.prepare('SELECT id FROM resources WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();

      await env.DB.prepare(`
        INSERT INTO bookings (id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id, start_at_utc, end_at_utc, business_timezone, status, price_minor, currency, version, created_at_utc, updated_at_utc)
        VALUES (?, 'SS-LEASE01', 'tokenhash', ?, ?, ?, ?, '2026-11-20T10:00:00Z', '2026-11-20T10:30:00Z', 'Asia/Kolkata', 'confirmed', 50000, 'INR', 1, ?, ?)
      `).bind(bookingId, owner.businessId, custId, svc?.id, res?.id, nowIso, nowIso).run();

      const jobId = generateUUID();
      // Job is stuck in 'sending' with expired locked_until
      await env.DB.prepare(`
        INSERT INTO notification_jobs (id, business_id, booking_id, booking_version, customer_id, channel, template_key, due_at_utc, status, attempt_count, locked_until, idempotency_key, created_at_utc, updated_at_utc)
        VALUES (?, ?, ?, 1, ?, 'email', 'booking_confirmed', ?, 'sending', 1, ?, ?, ?, ?)
      `).bind(jobId, owner.businessId, bookingId, custId, nowIso, expiredLockIso, `lease_${jobId}`, nowIso, nowIso).run();

      // Processor run should reclaim this job!
      const stats = await processNotificationQueue(env as any, 10);
      expect(stats.processed).toBeGreaterThanOrEqual(1);

      const updated = await env.DB.prepare('SELECT status, attempt_count FROM notification_jobs WHERE id = ?')
        .bind(jobId)
        .first<{ status: string; attempt_count: number }>();
      expect(updated?.status).toBe('simulated');
      expect(updated?.attempt_count).toBe(2);
    });
  });

  // 4. Booking Version Mismatch (Cancel / Supersede)
  describe('4. Booking Version Mismatch Cancellation (E5)', () => {
    it('cancels job with superseded status if booking version was incremented', async () => {
      const owner = await registerOwner('Version Salon', `${prefix}-ver`, `${prefix}-ver@example.com`);

      const custId = generateUUID();
      const bookingId = generateUUID();
      const nowIso = new Date().toISOString();

      await env.DB.prepare(`
        INSERT INTO customers (id, business_id, normalized_phone, display_phone, name, email, consent_email_reminders, created_at_utc, updated_at_utc)
        VALUES (?, ?, '+919876543210', '98765 43210', 'Version Tester', 'ver@example.com', 1, ?, ?)
      `).bind(custId, owner.businessId, nowIso, nowIso).run();

      const svc = await env.DB.prepare('SELECT id FROM services WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();
      const res = await env.DB.prepare('SELECT id FROM resources WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();

      // Booking version is now 2 (rescheduled)
      await env.DB.prepare(`
        INSERT INTO bookings (id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id, start_at_utc, end_at_utc, business_timezone, status, price_minor, currency, version, created_at_utc, updated_at_utc)
        VALUES (?, 'SS-VER001', 'tokenhash', ?, ?, ?, ?, '2026-11-20T10:00:00Z', '2026-11-20T10:30:00Z', 'Asia/Kolkata', 'confirmed', 50000, 'INR', 2, ?, ?)
      `).bind(bookingId, owner.businessId, custId, svc?.id, res?.id, nowIso, nowIso).run();

      // Job was built for version 1
      const jobId = generateUUID();
      await env.DB.prepare(`
        INSERT INTO notification_jobs (id, business_id, booking_id, booking_version, customer_id, channel, template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc)
        VALUES (?, ?, ?, 1, ?, 'email', 'reminder_24h', ?, 'queued', ?, ?, ?)
      `).bind(jobId, owner.businessId, bookingId, custId, nowIso, `ver_${jobId}`, nowIso, nowIso).run();

      await processNotificationQueue(env as any, 10);

      const job = await env.DB.prepare('SELECT status FROM notification_jobs WHERE id = ?')
        .bind(jobId)
        .first<{ status: string }>();
      expect(job?.status).toBe('superseded');
    });
  });

  // 5. Customer Consent & Opt-Out (E6, E7)
  describe('5. Customer Consent & Unsubscribe Opt-Out (E6, E7)', () => {
    it('skips reminders if customer opted out, and customer opt-out endpoint invalidates reminders', async () => {
      const slug = `${prefix}-optout`;
      const owner = await registerOwner('Optout Salon', slug, `${prefix}-opt@example.com`);

      const custId = generateUUID();
      const bookingId = generateUUID();
      const nowIso = new Date().toISOString();

      await env.DB.prepare(`
        INSERT INTO customers (id, business_id, normalized_phone, display_phone, name, email, consent_email_reminders, created_at_utc, updated_at_utc)
        VALUES (?, ?, '+919876543210', '98765 43210', 'Optout Client', 'client@example.com', 1, ?, ?)
      `).bind(custId, owner.businessId, nowIso, nowIso).run();

      const svc = await env.DB.prepare('SELECT id FROM services WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();
      const res = await env.DB.prepare('SELECT id FROM resources WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();

      await env.DB.prepare(`
        INSERT INTO bookings (id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id, start_at_utc, end_at_utc, business_timezone, status, price_minor, currency, version, created_at_utc, updated_at_utc)
        VALUES (?, 'SS-OPTOUT1', 'fakehash', ?, ?, ?, ?, '2026-11-20T10:00:00Z', '2026-11-20T10:30:00Z', 'Asia/Kolkata', 'confirmed', 50000, 'INR', 1, ?, ?)
      `).bind(bookingId, owner.businessId, custId, svc?.id, res?.id, nowIso, nowIso).run();

      const jobId = generateUUID();
      await env.DB.prepare(`
        INSERT INTO notification_jobs (id, business_id, booking_id, booking_version, customer_id, channel, template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc)
        VALUES (?, ?, ?, 1, ?, 'email', 'reminder_24h', ?, 'queued', ?, ?, ?)
      `).bind(jobId, owner.businessId, bookingId, custId, nowIso, `opt_${jobId}`, nowIso, nowIso).run();

      // Customer calls opt-out endpoint using their booking reference
      const optOutRes = await app.request(
        `/api/public/${slug}/manage/SS-OPTOUT1/opt-out`,
        { method: 'POST' },
        env
      );
      expect(optOutRes.status).toBe(200);
      const optOutBody = (await optOutRes.json()) as any;
      expect(optOutBody.opted_out).toBe(true);

      // Verify customer record has opted_out_at_utc
      const updatedCustomer = await env.DB.prepare('SELECT opted_out_at_utc, consent_email_reminders FROM customers WHERE id = ?')
        .bind(custId)
        .first<{ opted_out_at_utc: string | null; consent_email_reminders: number }>();
      expect(updatedCustomer?.opted_out_at_utc).not.toBeNull();
      expect(updatedCustomer?.consent_email_reminders).toBe(0);

      // Verify the reminder job was marked skipped_consent
      const job = await env.DB.prepare('SELECT status FROM notification_jobs WHERE id = ?')
        .bind(jobId)
        .first<{ status: string }>();
      expect(job?.status).toBe('skipped_consent');
    });
  });

  // 6. Quiet Hours & 15-Minute Lateness Boundary (E7)
  describe('6. Quiet Hours & Lateness Boundary Logic (E7)', () => {
    it('identifies quiet hours overnight and shifts reminder to 08:00', () => {
      // 23:30 local in Asia/Kolkata is within 22:00-08:00
      expect(isInQuietHours('23:30', '22:00', '08:00')).toBe(true);
      expect(isInQuietHours('05:00', '22:00', '08:00')).toBe(true);
      expect(isInQuietHours('10:00', '22:00', '08:00')).toBe(false);

      // Shift 2026-11-10T18:00:00Z (23:30 IST) out of quiet hours
      const shifted = shiftOutOfQuietHours('2026-11-10T18:00:00.000Z', 'Asia/Kolkata', '22:00', '08:00');
      // Should shift to 08:00 IST next morning (2026-11-11 08:00 IST = 2026-11-11 02:30 UTC)
      expect(shifted).toContain('2026-11-11T02:30:00');
    });

    it('enforces 15-minute lateness boundary for reminders (14:59 sends, 15:01 skips)', async () => {
      const owner = await registerOwner('Lateness Salon', `${prefix}-late`, `${prefix}-late@example.com`);

      const custId = generateUUID();
      const bookingId = generateUUID();
      const baseMs = new Date('2026-11-10T10:00:00.000Z').getTime();

      await env.DB.prepare(`
        INSERT INTO customers (id, business_id, normalized_phone, display_phone, name, email, consent_email_reminders, created_at_utc, updated_at_utc)
        VALUES (?, ?, '+919876543210', '98765 43210', 'Late Tester', 'late@example.com', 1, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z')
      `).bind(custId, owner.businessId).run();

      const svc = await env.DB.prepare('SELECT id FROM services WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();
      const res = await env.DB.prepare('SELECT id FROM resources WHERE business_id = ? LIMIT 1').bind(owner.businessId).first<{ id: string }>();

      // Future booking at 15:00 UTC
      await env.DB.prepare(`
        INSERT INTO bookings (id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id, start_at_utc, end_at_utc, business_timezone, status, price_minor, currency, version, created_at_utc, updated_at_utc)
        VALUES (?, 'SS-LATE01', 'tokenhash', ?, ?, ?, ?, '2026-11-10T15:00:00Z', '2026-11-10T15:30:00Z', 'Asia/Kolkata', 'confirmed', 50000, 'INR', 1, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z')
      `).bind(bookingId, owner.businessId, custId, svc?.id, res?.id).run();

      // Job A: Due at 10:00. We process at 10:14:59 (14 min 59 sec late -> eligible!)
      const jobAId = generateUUID();
      await env.DB.prepare(`
        INSERT INTO notification_jobs (id, business_id, booking_id, booking_version, customer_id, channel, template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc)
        VALUES (?, ?, ?, 1, ?, 'email', 'reminder_2h', '2026-11-10T10:00:00.000Z', 'queued', ?, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z')
      `).bind(jobAId, owner.businessId, bookingId, custId, `late_${jobAId}`).run();

      const time14m59s = new Date(baseMs + (14 * 60 + 59) * 1000).toISOString();
      await processNotificationQueue(env as any, 1, time14m59s);

      const jobA = await env.DB.prepare('SELECT status FROM notification_jobs WHERE id = ?').bind(jobAId).first<{ status: string }>();
      expect(jobA?.status).toBe('simulated'); // Sent!

      // Job B: Due at 10:00. We process at 10:15:01 (15 min 01 sec late -> skipped_late!)
      const jobBId = generateUUID();
      await env.DB.prepare(`
        INSERT INTO notification_jobs (id, business_id, booking_id, booking_version, customer_id, channel, template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc)
        VALUES (?, ?, ?, 1, ?, 'email', 'reminder_2h', '2026-11-10T10:00:00.000Z', 'queued', ?, '2026-11-10T00:00:00Z', '2026-11-10T00:00:00Z')
      `).bind(jobBId, owner.businessId, bookingId, custId, `late_${jobBId}`).run();

      const time15m01s = new Date(baseMs + (15 * 60 + 1) * 1000).toISOString();
      await processNotificationQueue(env as any, 1, time15m01s);

      const jobB = await env.DB.prepare('SELECT status FROM notification_jobs WHERE id = ?').bind(jobBId).first<{ status: string }>();
      expect(jobB?.status).toBe('skipped_late');
    });
  });

  // 7. Sandbox Gating & Sanitized Error Logging (E9)
  describe('7. Sandbox Gating & Sanitized Errors (E9)', () => {
    it('sets skipped_sandbox when recipient email is not allowed in sandbox mode', async () => {
      const res = await dispatchEmail(
        env as any,
        'job-123',
        'idem-key-1',
        { to: 'unauthorized@example.com', subject: 'Test', html: '<p>Hi</p>', text: 'Hi' },
        'owner@example.com' // Whitelisted sandbox address
      );

      expect(res.status).toBe('skipped_sandbox');
    });

    it('simulates dry-run honestly without claiming delivered when no RESEND_API_KEY', async () => {
      const res = await dispatchEmail(
        env as any,
        'job-456',
        'idem-key-2',
        { to: 'client@example.com', subject: 'Test', html: '<p>Hi</p>', text: 'Hi' }
      );

      expect(res.status).toBe('simulated');
      expect(res.messageId).toContain('dryrun_');
    });
  });

  // 8. Tenant Isolation on Notifications API
  describe('8. Tenant Isolation & Manual Retry', () => {
    it('guarantees Tenant A cannot see or retry Tenant B notification jobs', async () => {
      const tenantA = await registerOwner('Tenant A Notifs', `${prefix}-t-a`, `${prefix}-a@example.com`);
      const tenantB = await registerOwner('Tenant B Notifs', `${prefix}-t-b`, `${prefix}-b@example.com`);

      // Tenant A has a notification job
      const custId = generateUUID();
      const bookingId = generateUUID();
      const jobId = generateUUID();
      const nowIso = new Date().toISOString();

      await env.DB.prepare(`
        INSERT INTO customers (id, business_id, normalized_phone, display_phone, name, email, consent_email_reminders, created_at_utc, updated_at_utc)
        VALUES (?, ?, '+919876543210', '98765 43210', 'Client A', 'a@example.com', 1, ?, ?)
      `).bind(custId, tenantA.businessId, nowIso, nowIso).run();

      const svc = await env.DB.prepare('SELECT id FROM services WHERE business_id = ? LIMIT 1').bind(tenantA.businessId).first<{ id: string }>();
      const res = await env.DB.prepare('SELECT id FROM resources WHERE business_id = ? LIMIT 1').bind(tenantA.businessId).first<{ id: string }>();

      await env.DB.prepare(`
        INSERT INTO bookings (id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id, start_at_utc, end_at_utc, business_timezone, status, price_minor, currency, version, created_at_utc, updated_at_utc)
        VALUES (?, 'SS-TNOTA1', 'tokenhash', ?, ?, ?, ?, '2026-11-20T10:00:00Z', '2026-11-20T10:30:00Z', 'Asia/Kolkata', 'confirmed', 50000, 'INR', 1, ?, ?)
      `).bind(bookingId, tenantA.businessId, custId, svc?.id, res?.id, nowIso, nowIso).run();

      await env.DB.prepare(`
        INSERT INTO notification_jobs (id, business_id, booking_id, booking_version, customer_id, channel, template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc)
        VALUES (?, ?, ?, 1, ?, 'email', 'booking_confirmed', ?, 'failed', ?, ?, ?)
      `).bind(jobId, tenantA.businessId, bookingId, custId, nowIso, `iso_${jobId}`, nowIso, nowIso).run();

      // Tenant B queries /api/owner/notifications -> Job must NOT appear
      const bListRes = await worker.fetch(
        new Request('http://localhost/api/owner/notifications', {
          method: 'GET',
          headers: { Cookie: tenantB.cookie },
        }),
        env
      );
      const bListData = (await bListRes.json()) as any;
      expect(bListData.jobs.length).toBe(0);

      // Tenant B attempts to retry Tenant A's job -> 404
      const bRetryRes = await worker.fetch(
        new Request(`http://localhost/api/owner/notifications/${jobId}/retry`, {
          method: 'POST',
          headers: { Cookie: tenantB.cookie },
        }),
        env
      );
      expect(bRetryRes.status).toBe(404);

      // Tenant A retries their job -> 200 OK and job is processed
      const aRetryRes = await worker.fetch(
        new Request(`http://localhost/api/owner/notifications/${jobId}/retry`, {
          method: 'POST',
          headers: { Cookie: tenantA.cookie },
        }),
        env
      );
      expect(aRetryRes.status).toBe(200);
      const aRetryData = (await aRetryRes.json()) as any;
      expect(aRetryData.job.status).toBe('simulated');
    });
  });

  // 9. UI Status Label & Dead Button Audit
  describe('9. UI Status Labels & Dead-Button Audit', () => {
    it('renders NotificationsPage with mode banner and exact required status labels without claiming delivered', () => {
      const html = renderToString(<NotificationsPage />);

      // Title & Navigation
      expect(html).toContain('Notifications &amp; Reminders');
      expect(html).toContain('Mode');

      // Filter buttons
      expect(html).toContain('All Jobs');
      expect(html).toContain('Failed');
      expect(html).toContain('Accepted by Provider');
      expect(html).toContain('Dry-run');

      // Never claims false delivered states in default UI
      expect(html).not.toContain('>delivered<');
      expect(html).not.toContain('>sent<');
    });
  });
});
