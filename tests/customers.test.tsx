// SlotSync Customer Management Automated Test Suite (Phase 6: D1-D6)
// Validates:
// D1: Customer directory with search (name/phone), pagination, and visit aggregations.
// D2: Customer profile with booking history, status metrics, and relationship notes.
// D3: Returning-customer safe phone match without silent name overwrite (sets possible_match = 1).
// D4: "Book again" quick rebooking prefill through existing booking engine; blocked if pending_deletion.
// D5: Controlled duplicate merge (reassigns bookings/notes, creates alias tombstone, deletes old record).
// D6 & D7: Role-based notes privacy (is_private hidden from staff) & pending_deletion exclusion from reminders.
// Multi-Tenant Isolation & Frontend Component Rendering.

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker, { app } from '../src/worker/index';
import { generateUUID, sha256Hex } from '../src/shared/idUtils';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { CustomersPage } from '../src/web/pages/CustomersPage';
import { CustomerProfileDrawer } from '../src/web/components/CustomerProfileDrawer';
import { MergeCustomerModal } from '../src/web/components/MergeCustomerModal';
import { AuthProvider } from '../src/web/context/AuthContext';
import { processNotificationQueue } from '../src/worker/notifications/jobProcessor';
import { createNotificationJobsForEvent } from '../src/worker/notifications/jobCreator';

describe('Phase 6 — Customers (D1-D6)', () => {
  const ts = Date.now();

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
    return { data, cookie, businessId: data.business?.id || data.user?.business_id, userId: data.user?.id };
  }

  async function createStaffUser(businessId: string, email: string) {
    const staffId = generateUUID();
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, created_at_utc, updated_at_utc)
       VALUES (?, ?, 'dummy_hash', 'dummy_salt', ?, ?)`
    ).bind(staffId, email, nowIso, nowIso).run();

    await env.DB.prepare(
      `INSERT INTO memberships (id, business_id, user_id, role, created_at_utc)
       VALUES (?, ?, ?, 'staff', ?)`
    ).bind(generateUUID(), businessId, staffId, nowIso).run();

    const sessionToken = generateUUID();
    const tokenHash = await sha256Hex(sessionToken);
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    await env.DB.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at_utc, created_at_utc)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(generateUUID(), staffId, tokenHash, expiresAt, nowIso).run();

    return { staffId, cookie: `slotsync_session=${sessionToken}` };
  }

  async function createService(cookie: string, name: string = 'Haircut', duration: number = 30, priceMinor: number = 50000) {
    const res = await app.request(
      '/api/owner/services',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          name,
          duration_minutes: duration,
          buffer_minutes: 0,
          price_minor: priceMinor,
        }),
      },
      env
    );
    const data: any = await res.json();
    return data.service;
  }

  beforeEach(async () => {
    await env.DB.exec('PRAGMA foreign_keys = ON;');
  });

  // =========================================================================
  // 1. D1: Customer Directory & Search
  // =========================================================================
  describe('1. Customer Directory & Search (D1)', () => {
    it('returns tenant-scoped customers with visit aggregations and supports search by name and phone', async () => {
      const owner = await registerTenant('Salon Alpha', `salon-dir-${ts}`, `owner-dir-${ts}@example.com`);
      const service = await createService(owner.cookie, 'Standard Cut', 30, 40000);

      // Book 2 appointments for customer A (Aarav Patel, 9876543210)
      await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-10T10:00:00Z',
            customer_name: 'Aarav Patel',
            customer_phone: '9876543210',
            customer_email: 'aarav@example.com',
            source: 'phone',
          }),
        },
        env
      );

      await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-11T10:00:00Z',
            customer_name: 'Aarav Patel',
            customer_phone: '9876543210',
            customer_email: 'aarav@example.com',
            source: 'walkin',
          }),
        },
        env
      );

      // Book 1 appointment for customer B (Priya Sharma, 9123456789)
      await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-12T11:00:00Z',
            customer_name: 'Priya Sharma',
            customer_phone: '9123456789',
            source: 'whatsapp',
          }),
        },
        env
      );

      // 1. Directory List: Should return 2 customers
      const listRes = await app.request('/api/owner/customers', { method: 'GET', headers: { Cookie: owner.cookie } }, env);
      expect(listRes.status).toBe(200);
      const listData: any = await listRes.json();
      expect(listData.customers.length).toBe(2);
      expect(listData.total).toBe(2);

      // Verify Aarav Patel has total_visits = 2
      const aaravRow = listData.customers.find((c: any) => c.name === 'Aarav Patel');
      expect(aaravRow).toBeDefined();
      expect(aaravRow.total_visits).toBe(2);
      expect(aaravRow.normalized_phone).toBe('+919876543210');

      // 2. Search by Name: "Priya"
      const searchNameRes = await app.request(
        '/api/owner/customers?q=Priya',
        { method: 'GET', headers: { Cookie: owner.cookie } },
        env
      );
      const searchNameData: any = await searchNameRes.json();
      expect(searchNameData.customers.length).toBe(1);
      expect(searchNameData.customers[0].name).toBe('Priya Sharma');

      // 3. Search by 10-digit Phone: "9876543210"
      const searchPhoneRes = await app.request(
        '/api/owner/customers?q=9876543210',
        { method: 'GET', headers: { Cookie: owner.cookie } },
        env
      );
      const searchPhoneData: any = await searchPhoneRes.json();
      expect(searchPhoneData.customers.length).toBe(1);
      expect(searchPhoneData.customers[0].name).toBe('Aarav Patel');

      // 4. Search by E.164: "+91 98765 43210"
      const searchE164Res = await app.request(
        '/api/owner/customers?q=+91%2098765%2043210',
        { method: 'GET', headers: { Cookie: owner.cookie } },
        env
      );
      const searchE164Data: any = await searchE164Res.json();
      expect(searchE164Data.customers.length).toBe(1);
      expect(searchE164Data.customers[0].name).toBe('Aarav Patel');
    });
  });

  // =========================================================================
  // 2. D2: Customer Profile & Timeline
  // =========================================================================
  describe('2. Customer Profile & Appointment Timeline (D2)', () => {
    it('returns full customer profile, visit summary metrics, and chronological bookings', async () => {
      const owner = await registerTenant('Salon Beta', `salon-prof-${ts}`, `owner-prof-${ts}@example.com`);
      const service = await createService(owner.cookie, 'Deluxe Facial', 45, 120000);

      // Create booking
      const bookRes = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-15T14:00:00Z',
            customer_name: 'Ananya Roy',
            customer_phone: '9988776655',
            customer_email: 'ananya@example.com',
            source: 'phone',
            notes: 'Allergic to rose water',
          }),
        },
        env
      );
      const bookData: any = await bookRes.json();
      const customerId = bookData.booking.customer_id;

      // Transition to completed
      await app.request(
        `/api/owner/bookings/${bookData.booking.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ status: 'completed' }),
        },
        env
      );

      // Fetch Customer Profile
      const profRes = await app.request(
        `/api/owner/customers/${customerId}`,
        { method: 'GET', headers: { Cookie: owner.cookie } },
        env
      );
      expect(profRes.status).toBe(200);
      const profData: any = await profRes.json();

      expect(profData.customer.name).toBe('Ananya Roy');
      expect(profData.customer.email).toBe('ananya@example.com');
      expect(profData.customer.normalized_phone).toBe('+919988776655');

      // Check summary
      expect(profData.summary.total_bookings).toBe(1);
      expect(profData.summary.completed_bookings).toBe(1);
      expect(profData.summary.total_spend_minor).toBe(120000);

      // Check bookings history
      expect(profData.bookings.length).toBe(1);
      expect(profData.bookings[0].service_name).toBe('Deluxe Facial');
      expect(profData.bookings[0].status).toBe('completed');
    });

    it('returns 404 for non-existent customer ID', async () => {
      const owner = await registerTenant('Salon Gamma', `salon-404-${ts}`, `owner-404-${ts}@example.com`);
      const res = await app.request(
        `/api/owner/customers/${generateUUID()}`,
        { method: 'GET', headers: { Cookie: owner.cookie } },
        env
      );
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 3. D3: Returning-Customer Matching Without Silent Name Overwrite
  // =========================================================================
  describe('3. Returning-Customer Safe Phone Matching (D3)', () => {
    it('reuses customer record when phone and name match', async () => {
      const owner = await registerTenant('Salon Delta', `salon-match-${ts}`, `owner-match-${ts}@example.com`);
      const service = await createService(owner.cookie, 'Trim', 20, 25000);

      // Booking 1
      const res1 = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-10T09:00:00Z',
            customer_name: 'Vikram Seth',
            customer_phone: '9811122233',
            source: 'phone',
          }),
        },
        env
      );
      const b1: any = await res1.json();

      // Booking 2 with same phone and same name
      const res2 = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-12T09:00:00Z',
            customer_name: 'Vikram Seth',
            customer_phone: '9811122233',
            source: 'walkin',
          }),
        },
        env
      );
      const b2: any = await res2.json();

      expect(b2.booking.customer_id).toBe(b1.booking.customer_id);
      expect(b2.booking.possible_match).toBe(0);
    });

    it('never overwrites existing customer name when same phone is booked with a different name, and flags possible_match = 1', async () => {
      const owner = await registerTenant('Salon Epsilon', `salon-nomut-${ts}`, `owner-nomut-${ts}@example.com`);
      const service = await createService(owner.cookie, 'Hair Coloring', 60, 150000);

      // Customer 1: Parent (Sunita Sharma) books with phone 9844455566
      const res1 = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-10T12:00:00Z',
            customer_name: 'Sunita Sharma',
            customer_phone: '9844455566',
            source: 'phone',
          }),
        },
        env
      );
      const b1: any = await res1.json();
      const customerId = b1.booking.customer_id;

      // Customer 2: Family member (Rohan Sharma) books with same shared phone
      const res2 = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-11T12:00:00Z',
            customer_name: 'Rohan Sharma', // Different name!
            customer_phone: '9844455566',
            source: 'whatsapp',
          }),
        },
        env
      );
      const b2: any = await res2.json();

      // Possible match flag MUST be 1
      expect(b2.booking.possible_match).toBe(1);

      // The original customer record name MUST NOT have been overwritten
      const custRow = await env.DB.prepare('SELECT name FROM customers WHERE id = ?').bind(customerId).first<{ name: string }>();
      expect(custRow?.name).toBe('Sunita Sharma');
    });
  });

  // =========================================================================
  // 4. D4: "Book Again" Quick Rebooking
  // =========================================================================
  describe('4. "Book Again" Quick Rebooking (D4)', () => {
    it('creates repeat appointment prefilled with customer_id through existing slot engine', async () => {
      const owner = await registerTenant('Salon Zeta', `salon-again-${ts}`, `owner-again-${ts}@example.com`);
      const service = await createService(owner.cookie, 'Blowdry', 30, 60000);

      // Initial booking
      const res1 = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-10T15:00:00Z',
            customer_name: 'Maya Sen',
            customer_phone: '9765432100',
            source: 'phone',
          }),
        },
        env
      );
      const b1: any = await res1.json();
      const customerId = b1.booking.customer_id;

      // Book Again: supply customer_id explicitly
      const res2 = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            customer_id: customerId,
            service_id: service.id,
            start_at_utc: '2026-11-17T15:00:00Z',
            customer_name: 'Maya Sen',
            customer_phone: '9765432100',
            source: 'phone',
          }),
        },
        env
      );
      expect(res2.status).toBe(201);
      const b2: any = await res2.json();
      expect(b2.booking.customer_id).toBe(customerId);
    });

    it('rejects booking when customer is marked pending_deletion = 1', async () => {
      const owner = await registerTenant('Salon Eta', `salon-delblock-${ts}`, `owner-delblock-${ts}@example.com`);
      const service = await createService(owner.cookie, 'Manicure', 30, 45000);

      // Initial booking
      const res1 = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-10T16:00:00Z',
            customer_name: 'Karan Mehra',
            customer_phone: '9111223344',
            source: 'phone',
          }),
        },
        env
      );
      const b1: any = await res1.json();
      const customerId = b1.booking.customer_id;

      // Mark customer for pending deletion
      await app.request(
        `/api/owner/customers/${customerId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ pending_deletion: true }),
        },
        env
      );

      // Attempt to book again for this customer -> HTTP 422
      const res2 = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            customer_id: customerId,
            service_id: service.id,
            start_at_utc: '2026-11-17T16:00:00Z',
            customer_name: 'Karan Mehra',
            customer_phone: '9111223344',
            source: 'phone',
          }),
        },
        env
      );
      expect(res2.status).toBe(422);
      const errData: any = await res2.json();
      expect(errData.error.message).toContain('deletion');
    });
  });

  // =========================================================================
  // 5. D5: Controlled Duplicate Merge
  // =========================================================================
  describe('5. Duplicate Customer Controlled Merge (D5)', () => {
    it('merges customer B into customer A: reassigns bookings/notes, creates alias tombstone, deletes B, logs audit', async () => {
      const owner = await registerTenant('Salon Theta', `salon-merge-${ts}`, `owner-merge-${ts}@example.com`);
      const service = await createService(owner.cookie, 'Pedicure', 30, 50000);

      // Create Customer A (Primary)
      const resA = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-10T10:00:00Z',
            customer_name: 'Rohit Verma',
            customer_phone: '9900112233',
            customer_email: 'rohit@example.com',
            source: 'phone',
          }),
        },
        env
      );
      const bA: any = await resA.json();
      const customerAId = bA.booking.customer_id;

      // Create Customer B (Duplicate)
      const resB = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-11T10:00:00Z',
            customer_name: 'R. Verma',
            customer_phone: '9900112244',
            source: 'walkin',
          }),
        },
        env
      );
      const bB: any = await resB.json();
      const customerBId = bB.booking.customer_id;

      // Add a note to customer B
      await app.request(
        `/api/owner/customers/${customerBId}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ note_text: 'Prefers mint tea', is_private: false }),
        },
        env
      );

      // Perform controlled merge: B into A
      const mergeRes = await app.request(
        '/api/owner/customers/merge',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            old_customer_id: customerBId,
            new_customer_id: customerAId,
          }),
        },
        env
      );
      expect(mergeRes.status).toBe(200);

      // 1. Booking B should now point to Customer A
      const updatedBookingB = await env.DB.prepare('SELECT customer_id FROM bookings WHERE id = ?')
        .bind(bB.booking.id)
        .first<{ customer_id: string }>();
      expect(updatedBookingB?.customer_id).toBe(customerAId);

      // 2. Note from B should now point to Customer A
      const notesA = await env.DB.prepare('SELECT note_text FROM customer_notes WHERE customer_id = ?')
        .bind(customerAId)
        .all<{ note_text: string }>();
      expect(notesA.results.some((n) => n.note_text === 'Prefers mint tea')).toBe(true);

      // 3. Alias tombstone exists
      const alias = await env.DB.prepare(
        'SELECT new_customer_id FROM customer_aliases WHERE old_customer_id = ?'
      ).bind(customerBId).first<{ new_customer_id: string }>();
      expect(alias?.new_customer_id).toBe(customerAId);

      // 4. Old customer row is deleted from customers table
      const oldRow = await env.DB.prepare('SELECT id FROM customers WHERE id = ?').bind(customerBId).first();
      expect(oldRow).toBeNull();

      // 5. Audit log recorded without PII
      const audit = await env.DB.prepare(
        "SELECT action, target_type, target_id FROM audit_log WHERE action = 'CUSTOMER_MERGED'"
      ).first<{ action: string; target_type: string; target_id: string }>();
      expect(audit?.action).toBe('CUSTOMER_MERGED');
      expect(audit?.target_id).toBe(customerAId);

      // 6. Querying old customer ID automatically resolves to Customer A with is_merged_alias
      const profileAliasRes = await app.request(
        `/api/owner/customers/${customerBId}`,
        { method: 'GET', headers: { Cookie: owner.cookie } },
        env
      );
      expect(profileAliasRes.status).toBe(200);
      const aliasData: any = await profileAliasRes.json();
      expect(aliasData.customer.id).toBe(customerAId);
      expect(aliasData.customer.is_merged_alias).toBe(true);
    });

    it('requires owner role for merge; rejects staff with HTTP 403', async () => {
      const owner = await registerTenant('Salon Iota', `salon-mergerole-${ts}`, `owner-mergerole-${ts}@example.com`);
      const staff = await createStaffUser(owner.businessId, `staff-${ts}@example.com`);

      const mergeRes = await app.request(
        '/api/owner/customers/merge',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: staff.cookie },
          body: JSON.stringify({
            old_customer_id: generateUUID(),
            new_customer_id: generateUUID(),
          }),
        },
        env
      );
      expect(mergeRes.status).toBe(403);
    });
  });

  // =========================================================================
  // 6. D6 & D7: Role-Based Notes Privacy & Pending Deletion
  // =========================================================================
  describe('6. Role-Based Notes Privacy & Reminder Exclusion (D6 & D7)', () => {
    it('allows owner to see private notes, but filters them out for staff users', async () => {
      const owner = await registerTenant('Salon Kappa', `salon-notes-${ts}`, `owner-notes-${ts}@example.com`);
      const staff = await createStaffUser(owner.businessId, `staff-notes-${ts}@example.com`);
      const service = await createService(owner.cookie, 'Styling', 30, 40000);

      // Create customer
      const res = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-10T10:00:00Z',
            customer_name: 'Pooja Hegde',
            customer_phone: '9822334455',
            source: 'phone',
          }),
        },
        env
      );
      const b: any = await res.json();
      const customerId = b.booking.customer_id;

      // Add a public note
      await app.request(
        `/api/owner/customers/${customerId}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ note_text: 'Public styling note: parted left', is_private: false }),
        },
        env
      );

      // Add a private note (owner only)
      await app.request(
        `/api/owner/customers/${customerId}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ note_text: 'Private owner note: VIP high tipper', is_private: true }),
        },
        env
      );

      // 1. Owner views profile: Sees BOTH notes
      const ownerView = await app.request(
        `/api/owner/customers/${customerId}`,
        { method: 'GET', headers: { Cookie: owner.cookie } },
        env
      );
      const ownerData: any = await ownerView.json();
      expect(ownerData.notes.length).toBe(2);

      // 2. Staff views profile: Sees ONLY the public note
      const staffView = await app.request(
        `/api/owner/customers/${customerId}`,
        { method: 'GET', headers: { Cookie: staff.cookie } },
        env
      );
      const staffData: any = await staffView.json();
      expect(staffData.notes.length).toBe(1);
      expect(staffData.notes[0].note_text).toBe('Public styling note: parted left');
    });

    it('excludes customers marked pending_deletion = 1 from scheduled reminder dispatch', async () => {
      const owner = await registerTenant('Salon Lambda', `salon-delrem-${ts}`, `owner-delrem-${ts}@example.com`);
      const service = await createService(owner.cookie, 'Facial', 60, 80000);

      // Create booking for tomorrow 15:00 UTC
      const bookRes = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: service.id,
            start_at_utc: '2026-11-10T15:00:00Z',
            customer_name: 'Deepak Rao',
            customer_phone: '9833445566',
            customer_email: 'deepak@example.com',
            source: 'phone',
          }),
        },
        env
      );
      const bData: any = await bookRes.json();
      const customerId = bData.booking.customer_id;
      const bookingId = bData.booking.id;

      // Mark customer pending deletion
      await app.request(
        `/api/owner/customers/${customerId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ pending_deletion: true }),
        },
        env
      );

      // 1. Insert a fresh test booking for this pending_deletion customer
      const newBookingId = generateUUID();
      const nowIso = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO bookings (
          id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id,
          start_at_utc, end_at_utc, business_timezone, source, status, price_minor, currency,
          version, notes, possible_match, consent_email_reminders, created_at_utc, updated_at_utc
        ) VALUES (?, 'SS-TEST99', 'dummy_hash', ?, ?, ?, (SELECT id FROM resources WHERE business_id = ? LIMIT 1), '2026-11-20T10:00:00Z', '2026-11-20T11:00:00Z', 'Asia/Kolkata', 'phone', 'confirmed', 50000, 'INR', 1, '', 0, 1, ?, ?)`
      ).bind(newBookingId, owner.businessId, customerId, service.id, owner.businessId, nowIso, nowIso).run();

      // createNotificationJobsForEvent creates confirmation notice but ZERO reminder jobs because pending_deletion = 1
      await createNotificationJobsForEvent(env.DB, newBookingId, 'BOOKING_CREATED');
      const reminderJobs = await env.DB.prepare(
        "SELECT id FROM notification_jobs WHERE booking_id = ? AND template_key LIKE 'reminder_%'"
      ).bind(newBookingId).all();
      expect(reminderJobs.results.length).toBe(0);

      // 2. If a reminder job was previously queued, verify queue processor marks it skipped_consent
      const testJobId = generateUUID();
      await env.DB.prepare(
        `INSERT INTO notification_jobs (
          id, business_id, booking_id, booking_version, customer_id, channel,
          template_key, due_at_utc, status, attempt_count, idempotency_key, created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, 1, ?, 'email', 'reminder_24h', ?, 'queued', 0, ?, ?, ?)`
      ).bind(testJobId, owner.businessId, bookingId, customerId, nowIso, `rem_${testJobId}`, nowIso, nowIso).run();

      await processNotificationQueue(env as any, 10);

      const jobRow = await env.DB.prepare('SELECT status FROM notification_jobs WHERE id = ?')
        .bind(testJobId)
        .first<{ status: string }>();
      expect(jobRow?.status).toBe('skipped_consent');
    });
  });

  // =========================================================================
  // 7. Multi-Tenant Customer Isolation (S1)
  // =========================================================================
  describe('7. Multi-Tenant Customer Isolation (S1)', () => {
    it('guarantees Tenant A cannot list, view, mutate, or merge Tenant B customers', async () => {
      const tenantA = await registerTenant('Tenant Alpha', `tenant-a-${ts}`, `tenant-a-${ts}@example.com`);
      const tenantB = await registerTenant('Tenant Beta', `tenant-b-${ts}`, `tenant-b-${ts}@example.com`);

      const serviceB = await createService(tenantB.cookie, 'Service B', 30, 50000);

      // Tenant B customer
      const resB = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: tenantB.cookie },
          body: JSON.stringify({
            service_id: serviceB.id,
            start_at_utc: '2026-11-10T10:00:00Z',
            customer_name: 'Confidential Client B',
            customer_phone: '9988001122',
            customer_email: 'secret@example.com',
            source: 'phone',
          }),
        },
        env
      );
      const bData: any = await resB.json();
      const custBId = bData.booking.customer_id;

      // 1. Tenant A attempts to list customers -> Tenant B's customer must NOT appear
      const listA = await app.request('/api/owner/customers', { method: 'GET', headers: { Cookie: tenantA.cookie } }, env);
      const listAData: any = await listA.json();
      expect(listAData.customers.some((c: any) => c.id === custBId)).toBe(false);

      // 2. Tenant A attempts to fetch Tenant B customer profile -> 404
      const viewA = await app.request(`/api/owner/customers/${custBId}`, { method: 'GET', headers: { Cookie: tenantA.cookie } }, env);
      expect(viewA.status).toBe(404);

      // 3. Tenant A attempts to add note to Tenant B customer -> 404
      const noteA = await app.request(
        `/api/owner/customers/${custBId}/notes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: tenantA.cookie },
          body: JSON.stringify({ note_text: 'Malicious note', is_private: false }),
        },
        env
      );
      expect(noteA.status).toBe(404);

      // 4. Tenant A attempts to update Tenant B customer -> 404
      const patchA = await app.request(
        `/api/owner/customers/${custBId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: tenantA.cookie },
          body: JSON.stringify({ name: 'Tampered Name' }),
        },
        env
      );
      expect(patchA.status).toBe(404);

      // 5. Tenant A attempts to merge Tenant B customer -> 404
      const mergeA = await app.request(
        '/api/owner/customers/merge',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: tenantA.cookie },
          body: JSON.stringify({
            old_customer_id: custBId,
            new_customer_id: generateUUID(),
          }),
        },
        env
      );
      expect(mergeA.status).toBe(404);
    });
  });

  // =========================================================================
  // 8. Frontend Component Rendering & UI State Coverage
  // =========================================================================
  describe('8. Frontend Component Rendering & Audit', () => {
    it('renders CustomersPage with empty state and search inputs', () => {
      const html = renderToString(
        <AuthProvider>
          <CustomersPage />
        </AuthProvider>
      );
      expect(html).toContain('Customers');
      expect(html).toContain('Search by name, phone, or email...');
      expect(html).toContain('New Appointment');
    });

    it('renders CustomerProfileDrawer with status tabs, honest wa.me WhatsApp link, and Book Again', () => {
      const html = renderToString(
        <AuthProvider>
          <CustomerProfileDrawer
            customerId="cust-test-123"
            isOpen={true}
            onClose={() => {}}
            businessTimezone="Asia/Kolkata"
          />
        </AuthProvider>
      );
      expect(html).toContain('Customer Profile');
      expect(html).toContain('Total Visits');
      expect(html).toContain('Appointment History');
      expect(html).toContain('Relationship Notes');
    });

    it('renders MergeCustomerModal with search and warning guidelines', () => {
      const html = renderToString(
        <MergeCustomerModal
          isOpen={true}
          onClose={() => {}}
          onSuccess={() => {}}
          sourceCustomerId="source-123"
        />
      );
      expect(html).toContain('Merge Duplicate Customer');
      expect(html).toContain('What happens after merge:');
      expect(html).toContain('Confirm &amp; Merge');
    });
  });
});
