// SlotSync Notification Job Creator
// Transactionally provisions confirmation, status-change, and scheduled reminder jobs
// with idempotency keys and booking version tracking.

import { generateUUID } from '../../shared/idUtils';

export async function createNotificationJobsForEvent(
  db: D1Database,
  bookingId: string,
  eventType: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED' | 'BOOKING_APPROVED'
): Promise<string[]> {
  const nowIso = new Date().toISOString();

  // Fetch booking details
  const booking = await db
    .prepare(
      `SELECT b.id, b.business_id, b.customer_id, b.start_at_utc, b.status, b.version,
              b.consent_email_reminders,
              c.email AS customer_email, c.opted_out_at_utc, c.pending_deletion
       FROM bookings b
       JOIN customers c ON b.customer_id = c.id
       WHERE b.id = ?`
    )
    .bind(bookingId)
    .first<{
      id: string;
      business_id: string;
      customer_id: string;
      start_at_utc: string;
      status: string;
      version: number;
      consent_email_reminders: number;
      customer_email: string | null;
      opted_out_at_utc: string | null;
      pending_deletion: number;
    }>();

  if (!booking || !booking.customer_email) {
    return [];
  }

  const createdJobIds: string[] = [];
  const statements: D1PreparedStatement[] = [];

  const hasConsent =
    booking.consent_email_reminders === 1 && !booking.opted_out_at_utc && booking.pending_deletion !== 1;

  // --- EVENT: BOOKING CANCELLED ---
  if (eventType === 'BOOKING_CANCELLED') {
    // 1. Invalidate all pending or retrying reminder jobs for this booking
    statements.push(
      db.prepare(
        `UPDATE notification_jobs
         SET status = 'cancelled', updated_at_utc = ?
         WHERE booking_id = ? AND status IN ('queued', 'retry_scheduled')`
      ).bind(nowIso, booking.id)
    );

    // 2. Create transactional cancellation notice job
    const cancelJobId = generateUUID();
    createdJobIds.push(cancelJobId);
    statements.push(
      db.prepare(
        `INSERT INTO notification_jobs (
          id, business_id, booking_id, booking_version, customer_id, channel,
          template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, 'email', 'booking_cancelled', ?, 'queued', ?, ?, ?)`
      ).bind(
        cancelJobId,
        booking.business_id,
        booking.id,
        booking.version,
        booking.customer_id,
        nowIso,
        `cancel_${booking.id}_v${booking.version}`,
        nowIso,
        nowIso
      )
    );
  }

  // --- EVENT: BOOKING RESCHEDULED ---
  else if (eventType === 'BOOKING_RESCHEDULED') {
    // 1. Supersede previous reminder jobs for older versions
    statements.push(
      db.prepare(
        `UPDATE notification_jobs
         SET status = 'superseded', updated_at_utc = ?
         WHERE booking_id = ? AND status IN ('queued', 'retry_scheduled')`
      ).bind(nowIso, booking.id)
    );

    // 2. Create transactional reschedule notice job
    const reschedJobId = generateUUID();
    createdJobIds.push(reschedJobId);
    statements.push(
      db.prepare(
        `INSERT INTO notification_jobs (
          id, business_id, booking_id, booking_version, customer_id, channel,
          template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, 'email', 'booking_rescheduled', ?, 'queued', ?, ?, ?)`
      ).bind(
        reschedJobId,
        booking.business_id,
        booking.id,
        booking.version,
        booking.customer_id,
        nowIso,
        `resched_${booking.id}_v${booking.version}`,
        nowIso,
        nowIso
      )
    );

    // 3. Create fresh reminders for new schedule (if consented)
    if (hasConsent) {
      await scheduleReminderRules(db, booking, statements, createdJobIds, nowIso);
    }
  }

  // --- EVENT: BOOKING CREATED or APPROVED ---
  else if (eventType === 'BOOKING_CREATED' || eventType === 'BOOKING_APPROVED') {
    if (booking.status === 'confirmed') {
      // 1. Transactional confirmation notice job
      const confirmJobId = generateUUID();
      createdJobIds.push(confirmJobId);
      statements.push(
        db.prepare(
          `INSERT INTO notification_jobs (
            id, business_id, booking_id, booking_version, customer_id, channel,
            template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc
          ) VALUES (?, ?, ?, ?, ?, 'email', 'booking_confirmed', ?, 'queued', ?, ?, ?)`
        ).bind(
          confirmJobId,
          booking.business_id,
          booking.id,
          booking.version,
          booking.customer_id,
          nowIso,
          `confirm_${booking.id}_v${booking.version}`,
          nowIso,
          nowIso
        )
      );

      // 2. Schedule reminders if customer gave consent
      if (hasConsent) {
        await scheduleReminderRules(db, booking, statements, createdJobIds, nowIso);
      }
    }
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return createdJobIds;
}

/**
 * Helper to query enabled reminder rules and insert scheduled reminder jobs
 */
async function scheduleReminderRules(
  db: D1Database,
  booking: {
    id: string;
    business_id: string;
    customer_id: string;
    start_at_utc: string;
    version: number;
  },
  statements: D1PreparedStatement[],
  createdJobIds: string[],
  nowIso: string
) {
  const rules = await db
    .prepare(
      `SELECT offset_minutes, template_key
       FROM reminder_rules
       WHERE business_id = ? AND enabled = 1`
    )
    .bind(booking.business_id)
    .all<{ offset_minutes: number; template_key: string }>();

  const startMs = new Date(booking.start_at_utc).getTime();
  const nowMs = new Date(nowIso).getTime();

  for (const rule of rules.results || []) {
    const dueMs = startMs - rule.offset_minutes * 60 * 1000;
    // Only schedule if the due time is in the future
    if (dueMs > nowMs) {
      const dueIso = new Date(dueMs).toISOString();
      const jobId = generateUUID();
      createdJobIds.push(jobId);

      statements.push(
        db.prepare(
          `INSERT OR IGNORE INTO notification_jobs (
            id, business_id, booking_id, booking_version, customer_id, channel,
            template_key, due_at_utc, status, idempotency_key, created_at_utc, updated_at_utc
          ) VALUES (?, ?, ?, ?, ?, 'email', ?, ?, 'queued', ?, ?, ?)`
        ).bind(
          jobId,
          booking.business_id,
          booking.id,
          booking.version,
          booking.customer_id,
          rule.template_key || (rule.offset_minutes >= 1440 ? 'reminder_24h' : 'reminder_2h'),
          dueIso,
          `reminder_${booking.id}_v${booking.version}_${rule.offset_minutes}`,
          nowIso,
          nowIso
        )
      );
    }
  }
}
