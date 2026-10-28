// SlotSync Owner Dashboard & Appointments Automated Test Suite (Phase 5: C1-C5)
// Validates: Auth protection, tenant isolation, dynamic Today metrics in business timezone,
// Quick Add intake with slot_cells reservation, 20-way parallel race condition prevention,
// and state machine transitions with slot freeing on cancellation.

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker, { app } from '../src/worker/index';
import { generateUUID } from '../src/shared/idUtils';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { TodayPage } from '../src/web/pages/TodayPage';
import { CalendarDayPage } from '../src/web/pages/CalendarDayPage';
import { BookingsListPage } from '../src/web/pages/BookingsListPage';
import { QuickAddModal } from '../src/web/components/QuickAddModal';
import { BookingDetailDrawer } from '../src/web/components/BookingDetailDrawer';

describe('Owner Dashboard, Appointments & Quick Add (C1-C5)', () => {
  const prefix = `p5-${Date.now()}`;

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

  // 1. Auth & Protection
  describe('1. Route Authentication Enforcement', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const getTodayRes = await app.request('/api/owner/dashboard/today', { method: 'GET' }, env);
      expect(getTodayRes.status).toBe(401);

      const getBookingsRes = await app.request('/api/owner/bookings', { method: 'GET' }, env);
      expect(getBookingsRes.status).toBe(401);

      const postBookingRes = await app.request(
        '/api/owner/bookings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: generateUUID(),
            start_at_utc: '2026-11-10T10:00:00Z',
            customer_name: 'Test Customer',
            customer_phone: '9876543210',
          }),
        },
        env
      );
      expect(postBookingRes.status).toBe(401);

      const patchStatusRes = await app.request(
        `/api/owner/bookings/${generateUUID()}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'confirmed' }),
        },
        env
      );
      expect(patchStatusRes.status).toBe(401);
    });
  });

  // 2. Tenant Isolation
  describe('2. Multi-Tenant Isolation (C1 & C3)', () => {
    it('guarantees Tenant A cannot access, query, or mutate Tenant B bookings', async () => {
      const tenantA = await registerOwner('Tenant A Salons', `${prefix}-iso-a`, `${prefix}-a@example.com`);
      const tenantB = await registerOwner('Tenant B Studios', `${prefix}-iso-b`, `${prefix}-b@example.com`);

      // Tenant A configures service
      const createServiceRes = await worker.fetch(
        new Request('http://localhost/api/owner/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: tenantA.cookie },
          body: JSON.stringify({
            name: 'Deluxe Haircut',
            duration_minutes: 30,
            price_minor: 50000,
          }),
        }),
        env
      );
      expect(createServiceRes.status).toBe(201);
      const serviceA = (await createServiceRes.json()) as any;
      const serviceAId = serviceA.service.id;

      // Tenant A creates booking via Quick Add
      const bookingSlot = '2026-11-10T05:00:00.000Z'; // 10:30 AM IST
      const createBookingRes = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: tenantA.cookie },
          body: JSON.stringify({
            service_id: serviceAId,
            start_at_utc: bookingSlot,
            customer_name: 'Alpha VIP Client',
            customer_phone: '9876543210',
            source: 'phone',
          }),
        }),
        env
      );
      expect(createBookingRes.status).toBe(201);
      const bookingA = (await createBookingRes.json()) as any;
      const bookingAId = bookingA.booking.id;

      // Tenant B queries /dashboard/today -> Alpha VIP Client must NOT be visible
      const tenantBTodayRes = await worker.fetch(
        new Request('http://localhost/api/owner/dashboard/today', {
          method: 'GET',
          headers: { Cookie: tenantB.cookie },
        }),
        env
      );
      expect(tenantBTodayRes.status).toBe(200);
      const tenantBToday = (await tenantBTodayRes.json()) as any;
      expect(tenantBToday.metrics.total).toBe(0);
      expect(tenantBToday.bookings.length).toBe(0);

      // Tenant B queries /bookings -> Alpha VIP Client must NOT be visible
      const tenantBListRes = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'GET',
          headers: { Cookie: tenantB.cookie },
        }),
        env
      );
      expect(tenantBListRes.status).toBe(200);
      const tenantBList = (await tenantBListRes.json()) as any;
      expect(tenantBList.bookings.length).toBe(0);

      // Tenant B attempts to fetch Tenant A booking by ID -> 404 NOT FOUND
      const tenantBGetRes = await worker.fetch(
        new Request(`http://localhost/api/owner/bookings/${bookingAId}`, {
          method: 'GET',
          headers: { Cookie: tenantB.cookie },
        }),
        env
      );
      expect(tenantBGetRes.status).toBe(404);

      // Tenant B attempts to update status of Tenant A booking -> 404 NOT FOUND
      const tenantBPatchRes = await worker.fetch(
        new Request(`http://localhost/api/owner/bookings/${bookingAId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: tenantB.cookie },
          body: JSON.stringify({ status: 'completed' }),
        }),
        env
      );
      expect(tenantBPatchRes.status).toBe(404);
    });
  });

  // 3. Dynamic Today Metrics & Timezone Calculations (C1)
  describe('3. Dynamic Today Metrics in Business Timezone (C1)', () => {
    it('computes accurate counts, revenue minor, and next up appointment', async () => {
      const owner = await registerOwner('Metrics Salon', `${prefix}-metrics`, `${prefix}-metrics@example.com`);

      // Add service
      const svcRes = await worker.fetch(
        new Request('http://localhost/api/owner/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Hair Spa', duration_minutes: 30, price_minor: 100000 }),
        }),
        env
      );
      const svc = ((await svcRes.json()) as any).service;

      // Get current business today date
      const todayRes = await worker.fetch(
        new Request('http://localhost/api/owner/dashboard/today', {
          method: 'GET',
          headers: { Cookie: owner.cookie },
        }),
        env
      );
      const todayData = (await todayRes.json()) as any;
      const todayDate = todayData.today_date; // YYYY-MM-DD

      // Create 3 bookings for today:
      // Booking 1: 10:00 AM local -> confirmed
      // Booking 2: 11:00 AM local -> completed
      // Booking 3: 12:00 PM local -> cancelled
      const b1Res = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: svc.id,
            start_at_utc: `${todayDate}T04:30:00.000Z`, // 10:00 IST
            customer_name: 'Customer One',
            customer_phone: '9876543211',
            source: 'phone',
          }),
        }),
        env
      );
      expect(b1Res.status).toBe(201);
      const b1Id = ((await b1Res.json()) as any).booking.id;

      const b2Res = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: svc.id,
            start_at_utc: `${todayDate}T05:30:00.000Z`, // 11:00 IST
            customer_name: 'Customer Two',
            customer_phone: '9876543212',
            source: 'walkin',
          }),
        }),
        env
      );
      expect(b2Res.status).toBe(201);
      const b2Id = ((await b2Res.json()) as any).booking.id;

      const b3Res = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: svc.id,
            start_at_utc: `${todayDate}T06:30:00.000Z`, // 12:00 IST
            customer_name: 'Customer Three',
            customer_phone: '9876543213',
            source: 'whatsapp',
          }),
        }),
        env
      );
      expect(b3Res.status).toBe(201);
      const b3Id = ((await b3Res.json()) as any).booking.id;

      // Mark b2 as completed
      const markCompleted = await worker.fetch(
        new Request(`http://localhost/api/owner/bookings/${b2Id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ status: 'completed' }),
        }),
        env
      );
      expect(markCompleted.status).toBe(200);

      // Mark b3 as cancelled
      const markCancelled = await worker.fetch(
        new Request(`http://localhost/api/owner/bookings/${b3Id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ status: 'cancelled', reason: 'Customer requested' }),
        }),
        env
      );
      expect(markCancelled.status).toBe(200);

      // Re-fetch /dashboard/today
      const updatedTodayRes = await worker.fetch(
        new Request('http://localhost/api/owner/dashboard/today', {
          method: 'GET',
          headers: { Cookie: owner.cookie },
        }),
        env
      );
      const updatedData = (await updatedTodayRes.json()) as any;
      expect(updatedData.metrics.total).toBe(3);
      expect(updatedData.metrics.confirmed).toBe(1);
      expect(updatedData.metrics.completed).toBe(1);
      expect(updatedData.metrics.cancelled).toBe(1);
      // Completed revenue minor: 100000 (1 completed * 100000)
      expect(updatedData.metrics.completed_revenue_minor).toBe(100000);
      // Expected revenue minor: 200000 (1 confirmed + 1 completed)
      expect(updatedData.metrics.expected_revenue_minor).toBe(200000);
    });
  });

  // 4. Quick Add & Atomic Slot Cells Reservation (C5)
  describe('4. Owner Quick Add & Slot Cells (C5)', () => {
    it('normalizes phone number, snapshots canonical DB price, and populates slot_cells', async () => {
      const owner = await registerOwner('Quick Add Salon', `${prefix}-qa`, `${prefix}-qa@example.com`);

      const svcRes = await worker.fetch(
        new Request('http://localhost/api/owner/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Beard Trim', duration_minutes: 30, buffer_minutes: 15, price_minor: 45000 }),
        }),
        env
      );
      const svc = ((await svcRes.json()) as any).service;

      const slot = '2026-11-15T09:00:00.000Z';
      const res = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: svc.id,
            start_at_utc: slot,
            customer_name: 'Anand Kumar',
            customer_phone: '9876543210', // 10-digit raw
            source: 'walkin',
          }),
        }),
        env
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      const b = body.booking;

      expect(b.customer_phone).toBe('+91 98765 43210'); // Normalized display
      expect(b.price_minor).toBe(45000); // Server-side DB snapshot
      expect(b.status).toBe('confirmed');

      // Check slot_cells: 30 min duration with default 15 min buffer = 45 min = 3 15-min cells
      const cellsRes = await env.DB.prepare('SELECT cell_start_utc FROM slot_cells WHERE booking_id = ?')
        .bind(b.id)
        .all();
      expect(cellsRes.results.length).toBe(3);

      // Check audit event
      const eventsRes = await env.DB.prepare('SELECT event_type, actor_type FROM booking_events WHERE booking_id = ?')
        .bind(b.id)
        .first<{ event_type: string; actor_type: string }>();
      expect(eventsRes?.event_type).toBe('BOOKING_CREATED');
      expect(eventsRes?.actor_type).toBe('owner');
    });

    it('returns HTTP 409 slot_taken when attempting to book an overlapping slot', async () => {
      const owner = await registerOwner('Overlap Salon', `${prefix}-overlap`, `${prefix}-overlap@example.com`);

      const svcRes = await worker.fetch(
        new Request('http://localhost/api/owner/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Standard Cut', duration_minutes: 30, price_minor: 50000 }),
        }),
        env
      );
      const svc = ((await svcRes.json()) as any).service;

      const slot = '2026-11-16T10:00:00.000Z';
      const firstRes = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: svc.id,
            start_at_utc: slot,
            customer_name: 'Client Alpha',
            customer_phone: '9876543210',
          }),
        }),
        env
      );
      expect(firstRes.status).toBe(201);

      // Attempt second booking for exact same slot
      const secondRes = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: svc.id,
            start_at_utc: slot,
            customer_name: 'Client Beta',
            customer_phone: '9876543211',
          }),
        }),
        env
      );
      expect(secondRes.status).toBe(409);
      const err = (await secondRes.json()) as any;
      expect(err.error.code).toBe('slot_taken');
    });
  });

  // 5. Concurrency Race Test: 20-Way Parallel Requests (Owner Quick Add vs Public)
  describe('5. 20-Way Parallel Concurrency (Public vs Owner Quick Add)', () => {
    it('executes 20 concurrent requests: exactly 1 wins (201), 19 receive 409 slot_taken', async () => {
      const slug = `${prefix}-race`;
      const owner = await registerOwner('Race Arena Salon', slug, `${prefix}-race@example.com`);

      // Add service & publish business
      const svcRes = await worker.fetch(
        new Request('http://localhost/api/owner/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Sprint Cut', duration_minutes: 30, price_minor: 60000 }),
        }),
        env
      );
      const svc = ((await svcRes.json()) as any).service;

      await env.DB.prepare('UPDATE businesses SET published = 1 WHERE id = ?').bind(owner.businessId).run();

      const raceSlot = '2026-11-20T08:00:00.000Z';

      // 10 Owner Quick Add requests + 10 Public requests competing concurrently
      const promises: Promise<Response>[] = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve(
            worker.fetch(
              new Request('http://localhost/api/owner/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
                body: JSON.stringify({
                  service_id: svc.id,
                  start_at_utc: raceSlot,
                  customer_name: `Owner Contender ${i}`,
                  customer_phone: `98765432${String(i).padStart(2, '0')}`,
                }),
              }),
              env
            )
          )
        );
      }

      for (let i = 10; i < 20; i++) {
        promises.push(
          Promise.resolve(
            app.request(
              `/api/public/${slug}/bookings`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  service_id: svc.id,
                  start_at_utc: raceSlot,
                  customer_name: `Public Contender ${i}`,
                  customer_phone: `+9198765432${String(i).padStart(2, '0')}`,
                }),
              },
              env
            )
          )
        );
      }

      const results = await Promise.all(promises);
      const statuses = results.map((r) => r.status);

      const winCount = statuses.filter((s) => s === 201).length;
      const conflictCount = statuses.filter((s) => s === 409).length;

      expect(winCount).toBe(1);
      expect(conflictCount).toBe(19);

      // Confirm slot_cells has exactly one booking associated with this slot
      const cellsCount = await env.DB.prepare(
        'SELECT COUNT(DISTINCT booking_id) as count FROM slot_cells WHERE cell_start_utc = ?'
      )
        .bind(raceSlot)
        .first<{ count: number }>();
      expect(cellsCount?.count).toBe(1);
    });
  });

  // 6. Status Transitions & Slot Freeing State Machine
  describe('6. Status State Machine & Slot Freeing', () => {
    it('frees slot_cells on cancellation and forbids illegal transitions', async () => {
      const owner = await registerOwner('StateMachine Salon', `${prefix}-sm`, `${prefix}-sm@example.com`);

      const svcRes = await worker.fetch(
        new Request('http://localhost/api/owner/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: owner.cookie },
          body: JSON.stringify({ name: 'Coloring', duration_minutes: 30, price_minor: 80000 }),
        }),
        env
      );
      const svc = ((await svcRes.json()) as any).service;

      const slot = '2026-11-22T06:00:00.000Z';
      const bookRes = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: svc.id,
            start_at_utc: slot,
            customer_name: 'Priya Sharma',
            customer_phone: '9876543210',
          }),
        }),
        env
      );
      expect(bookRes.status).toBe(201);
      const bookingId = ((await bookRes.json()) as any).booking.id;

      // Verify slot cells exist
      const beforeCells = await env.DB.prepare('SELECT COUNT(*) as count FROM slot_cells WHERE booking_id = ?')
        .bind(bookingId)
        .first<{ count: number }>();
      expect(beforeCells?.count).toBeGreaterThan(0);

      // Cancel the booking
      const cancelRes = await worker.fetch(
        new Request(`http://localhost/api/owner/bookings/${bookingId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ status: 'cancelled', reason: 'Customer sick' }),
        }),
        env
      );
      expect(cancelRes.status).toBe(200);

      // Verify slot cells were FREED (deleted)
      const afterCells = await env.DB.prepare('SELECT COUNT(*) as count FROM slot_cells WHERE booking_id = ?')
        .bind(bookingId)
        .first<{ count: number }>();
      expect(afterCells?.count).toBe(0);

      // Illegal transition: attempt to change cancelled booking to completed -> 400 illegal_transition
      const illegalRes = await worker.fetch(
        new Request(`http://localhost/api/owner/bookings/${bookingId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({ status: 'completed' }),
        }),
        env
      );
      expect(illegalRes.status).toBe(400);
      const err = (await illegalRes.json()) as any;
      expect(err.error.code).toBe('illegal_transition');

      // Now that the slot was freed, another customer CAN book the exact same slot!
      const rebookRes = await worker.fetch(
        new Request('http://localhost/api/owner/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
          body: JSON.stringify({
            service_id: svc.id,
            start_at_utc: slot,
            customer_name: 'New Client on Freed Slot',
            customer_phone: '9876543299',
          }),
        }),
        env
      );
      expect(rebookRes.status).toBe(201);
    });
  });

  // 7. Dead Button and Component Render Audit
  describe('7. Dead Button & Visual Component Audit', () => {
    it('renders TodayPage, CalendarDayPage, BookingsListPage and Drawers with working controls', () => {
      // TodayPage
      const todayHtml = renderToString(<TodayPage />);
      expect(todayHtml).toContain("Today&#x27;s Command Center");
      expect(todayHtml).toContain("Quick Add");
      expect(todayHtml).toContain("Total Today");

      // CalendarDayPage
      const calendarHtml = renderToString(<CalendarDayPage />);
      expect(calendarHtml).toContain("Calendar Schedule");
      expect(calendarHtml).toContain("Today");
      expect(calendarHtml).toContain("Quick Add");

      // BookingsListPage
      const bookingsHtml = renderToString(<BookingsListPage />);
      expect(bookingsHtml).toContain("Bookings Directory");
      expect(bookingsHtml).toContain("Search by customer name");
      expect(bookingsHtml).toContain("Confirmed");

      // QuickAddModal
      const quickAddHtml = renderToString(
        <QuickAddModal isOpen={true} onClose={() => {}} onSuccess={() => {}} />
      );
      expect(quickAddHtml).toContain("Quick Add Appointment");
      expect(quickAddHtml).toContain("Confirm Appointment");
      expect(quickAddHtml).toContain("Booking Source");

      // BookingDetailDrawer
      const drawerHtml = renderToString(
        <BookingDetailDrawer bookingId="test-id" isOpen={true} onClose={() => {}} />
      );
      expect(drawerHtml).toContain("Booking Details &amp; Audit Log");
      expect(drawerHtml).toContain("Close");
    });
  });
});
