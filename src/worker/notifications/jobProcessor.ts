// SlotSync Notification Job Processor
// Handles atomic claim-with-lease, eligibility validation, quiet-hours shifts,
// 15-minute lateness threshold, capped exponential backoff, and provider dispatch.

import { AppBindings } from '../middleware';
import { dispatchEmail } from './provider';
import { renderEmail } from './emailTemplates';
import { utcToLocal, localToUtc } from '../../shared/availability';

export interface ProcessQueueResult {
  processed: number;
  accepted: number;
  simulated: number;
  failed: number;
  skipped: number;
}

/**
 * Checks if a local HH:MM time falls inside quiet hours interval [start, end].
 * Handles overnight quiet hours (e.g. 22:00 to 08:00) as well as same-day intervals.
 */
export function isInQuietHours(
  localTime: string,
  start: string = '22:00',
  end: string = '08:00'
): boolean {
  if (start === end) return false;

  if (start < end) {
    // Same-day quiet hours (e.g. 13:00 to 15:00)
    return localTime >= start && localTime < end;
  } else {
    // Overnight quiet hours (e.g. 22:00 to 08:00)
    return localTime >= start || localTime < end;
  }
}

/**
 * Shifts an ISO UTC due instant out of quiet hours to the next quiet hours end instant.
 */
export function shiftOutOfQuietHours(
  utcIso: string,
  timezone: string,
  quietStart: string = '22:00',
  quietEnd: string = '08:00'
): string {
  const local = utcToLocal(utcIso, timezone);
  if (!isInQuietHours(local.time, quietStart, quietEnd)) {
    return utcIso; // Not in quiet hours; no shift needed
  }

  // If local.time >= quietStart (e.g. 22:30), quiet hours end at quietEnd on the NEXT calendar day
  // If local.time < quietEnd (e.g. 05:00), quiet hours end at quietEnd on the SAME calendar day
  const [y, m, d] = local.date.split('-').map(Number);
  let targetDateStr = local.date;

  if (local.time >= quietStart) {
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
    targetDateStr = nextDay.toISOString().slice(0, 10);
  }

  return localToUtc(targetDateStr, quietEnd, timezone);
}

/**
 * Processes up to `limit` due notification jobs from the outbox queue.
 */
export async function processNotificationQueue(
  env: AppBindings,
  limit: number = 10,
  nowIsoOverride?: string
): Promise<ProcessQueueResult> {
  const nowIso = nowIsoOverride || new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const leaseDurationMs = 5 * 60 * 1000; // 5 minute lock lease
  const lockUntilIso = new Date(nowMs + leaseDurationMs).toISOString();

  const stats: ProcessQueueResult = {
    processed: 0,
    accepted: 0,
    simulated: 0,
    failed: 0,
    skipped: 0,
  };

  // 1. Query eligible due jobs (limit 10)
  // Jobs are eligible if:
  // a) status IN ('queued', 'retry_scheduled') AND due_at_utc <= now AND (next_attempt_at IS NULL OR next_attempt_at <= now)
  // OR b) status = 'sending' AND locked_until <= now (reclaiming expired stuck lease!)
  const eligibleJobs = await env.DB.prepare(
    `SELECT id, business_id, booking_id, booking_version, customer_id, channel,
            template_key, due_at_utc, status, attempt_count, idempotency_key, locked_until
     FROM notification_jobs
     WHERE (
       (status IN ('queued', 'retry_scheduled') AND due_at_utc <= ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
       OR
       (status = 'sending' AND locked_until <= ?)
     )
     ORDER BY due_at_utc ASC
     LIMIT ?`
  )
    .bind(nowIso, nowIso, nowIso, limit)
    .all<{
      id: string;
      business_id: string;
      booking_id: string;
      booking_version: number;
      customer_id: string;
      channel: string;
      template_key: string;
      due_at_utc: string;
      status: string;
      attempt_count: number;
      idempotency_key: string;
      locked_until: string | null;
    }>();

  const jobs = eligibleJobs.results || [];
  if (jobs.length === 0) return stats;

  for (const job of jobs) {
    // 2. Atomic Claim with Conditional UPDATE
    const claimRes = await env.DB.prepare(
      `UPDATE notification_jobs
       SET status = 'sending',
           locked_until = ?,
           attempt_count = attempt_count + 1,
           updated_at_utc = ?
       WHERE id = ? AND (
         status IN ('queued', 'retry_scheduled')
         OR (status = 'sending' AND locked_until <= ?)
       )`
    )
      .bind(lockUntilIso, nowIso, job.id, nowIso)
      .run();

    if (claimRes.meta.changes === 0) {
      // Race: another processor claimed this job
      continue;
    }

    stats.processed++;
    const currentAttempt = job.attempt_count + 1;

    // 3. Fetch current booking, business, customer, and preferences
    const details = await env.DB.prepare(
      `SELECT b.id AS booking_id, b.status AS booking_status, b.version AS booking_version,
              b.start_at_utc, b.reference, b.price_minor, b.currency, b.cancelled_reason,
              c.id AS customer_id, c.name AS customer_name, c.email AS customer_email,
              c.opted_out_at_utc, c.consent_email_reminders, c.pending_deletion,
              biz.name AS business_name, biz.slug AS business_slug, biz.timezone AS business_timezone,
              biz.quiet_hours_start, biz.quiet_hours_end,
              np.sandbox_recipient_email
       FROM bookings b
       JOIN customers c ON b.customer_id = c.id
       JOIN businesses biz ON b.business_id = biz.id
       LEFT JOIN notification_preferences np ON biz.id = np.business_id
       WHERE b.id = ?`
    )
      .bind(job.booking_id)
      .first<{
        booking_id: string;
        booking_status: string;
        booking_version: number;
        start_at_utc: string;
        reference: string;
        price_minor: number;
        currency: string;
        cancelled_reason: string | null;
        customer_id: string;
        customer_name: string;
        customer_email: string | null;
        opted_out_at_utc: string | null;
        consent_email_reminders: number;
        pending_deletion: number;
        business_name: string;
        business_slug: string;
        business_timezone: string;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        sandbox_recipient_email: string | null;
      }>();

    if (!details || !details.customer_email) {
      await env.DB.prepare(
        `UPDATE notification_jobs SET status = 'failed', last_error_category = 'No recipient email', updated_at_utc = ? WHERE id = ?`
      ).bind(nowIso, job.id).run();
      stats.failed++;
      continue;
    }

    // 4. Eligibility Check: Booking Version Mismatch (Cancel / Supersede)
    if (details.booking_version !== job.booking_version) {
      await env.DB.prepare(
        `UPDATE notification_jobs SET status = 'superseded', updated_at_utc = ? WHERE id = ?`
      ).bind(nowIso, job.id).run();
      stats.skipped++;
      continue;
    }

    // 5. Eligibility Check: Booking Active
    // If booking was cancelled and this is not a cancellation notice, cancel the job
    if (details.booking_status === 'cancelled' && job.template_key !== 'booking_cancelled') {
      await env.DB.prepare(
        `UPDATE notification_jobs SET status = 'cancelled', updated_at_utc = ? WHERE id = ?`
      ).bind(nowIso, job.id).run();
      stats.skipped++;
      continue;
    }

    const isReminder = job.template_key.startsWith('reminder_');

    // 6. Eligibility Check: Customer Consent & Opt-Out (Reminders only)
    if (isReminder) {
      if (details.consent_email_reminders === 0 || details.opted_out_at_utc !== null || details.pending_deletion === 1) {
        await env.DB.prepare(
          `UPDATE notification_jobs SET status = 'skipped_consent', updated_at_utc = ? WHERE id = ?`
        ).bind(nowIso, job.id).run();
        stats.skipped++;
        continue;
      }
    }

    // 7. Eligibility Check: Quiet Hours (Reminders only; transactional notices are EXEMPT)
    let effectiveDueIso = job.due_at_utc;
    if (isReminder) {
      const qStart = details.quiet_hours_start || '22:00';
      const qEnd = details.quiet_hours_end || '08:00';
      effectiveDueIso = shiftOutOfQuietHours(job.due_at_utc, details.business_timezone, qStart, qEnd);

      const effectiveDueMs = new Date(effectiveDueIso).getTime();

      // If shifted due time is in the future, release lock and re-queue for shifted due time
      if (effectiveDueMs > nowMs) {
        await env.DB.prepare(
          `UPDATE notification_jobs
           SET status = 'queued',
               next_attempt_at = ?,
               locked_until = NULL,
               attempt_count = attempt_count - 1,
               updated_at_utc = ?
           WHERE id = ?`
        ).bind(effectiveDueIso, nowIso, job.id).run();
        stats.skipped++;
        continue;
      }

      // 8. 15-Minute Lateness Boundary (Reminders only)
      // Skipped if more than 15 minutes late from effective due time
      const latenessMs = nowMs - effectiveDueMs;
      if (latenessMs > 15 * 60 * 1000) {
        await env.DB.prepare(
          `UPDATE notification_jobs SET status = 'skipped_late', updated_at_utc = ? WHERE id = ?`
        ).bind(nowIso, job.id).run();
        stats.skipped++;
        continue;
      }
    } else {
      // Transactional notices: remain sendable until the appointment start time
      const appointmentStartMs = new Date(details.start_at_utc).getTime();
      if (nowMs > appointmentStartMs) {
        await env.DB.prepare(
          `UPDATE notification_jobs SET status = 'skipped_late', updated_at_utc = ? WHERE id = ?`
        ).bind(nowIso, job.id).run();
        stats.skipped++;
        continue;
      }
    }

    // 9. Render Email
    const appBase = env.APP_BASE_URL || 'http://localhost:8787';
    const localStart = utcToLocal(details.start_at_utc, details.business_timezone);
    const startFormatted = `${localStart.date} at ${localStart.time} (${details.business_timezone})`;

    // Fetch secret manage token for self-service links
    const tokenRow = await env.DB.prepare(
      'SELECT id, manage_token_hash FROM bookings WHERE id = ?'
    ).bind(job.booking_id).first<{ id: string; manage_token_hash: string }>();

    // For email manage links, reference is used as fallback or manage token hash identifier
    const manageUrl = `${appBase}/b/${details.business_slug}/manage/${details.reference}`;
    const optOutUrl = `${appBase}/b/${details.business_slug}/manage/${details.reference}?optout=1`;

    const emailContent = renderEmail(job.template_key, {
      businessName: details.business_name,
      businessTimezone: details.business_timezone,
      customerName: details.customer_name,
      serviceName: 'Appointment',
      startLocalFormatted: startFormatted,
      durationMinutes: 30,
      priceFormatted: `₹${(details.price_minor / 100).toFixed(0)}`,
      referenceCode: details.reference,
      manageUrl,
      optOutUrl,
      cancellationReason: details.cancelled_reason || undefined,
    });

    // 10. Dispatch via Provider
    const result = await dispatchEmail(
      env,
      job.id,
      job.idempotency_key,
      {
        to: details.customer_email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      },
      details.sandbox_recipient_email
    );

    // 11. Handle Result
    if (result.status === 'accepted') {
      await env.DB.prepare(
        `UPDATE notification_jobs
         SET status = 'accepted',
             provider_message_id = ?,
             locked_until = NULL,
             updated_at_utc = ?
         WHERE id = ?`
      ).bind(result.messageId || null, nowIso, job.id).run();
      stats.accepted++;
    } else if (result.status === 'simulated') {
      await env.DB.prepare(
        `UPDATE notification_jobs
         SET status = 'simulated',
             provider_message_id = ?,
             locked_until = NULL,
             updated_at_utc = ?
         WHERE id = ?`
      ).bind(result.messageId || null, nowIso, job.id).run();
      stats.simulated++;
    } else if (result.status === 'skipped_sandbox') {
      await env.DB.prepare(
        `UPDATE notification_jobs
         SET status = 'skipped_sandbox',
             last_error_category = ?,
             locked_until = NULL,
             updated_at_utc = ?
         WHERE id = ?`
      ).bind(result.error || null, nowIso, job.id).run();
      stats.skipped++;
    } else {
      // Failed: retry with capped exponential backoff or permanently fail
      if (currentAttempt >= 3) {
        await env.DB.prepare(
          `UPDATE notification_jobs
           SET status = 'permanently_failed',
               last_error_category = ?,
               locked_until = NULL,
               updated_at_utc = ?
           WHERE id = ?`
        ).bind(result.error || 'Max attempts reached', nowIso, job.id).run();
        stats.failed++;
      } else {
        const backoffMs = Math.pow(2, currentAttempt) * 60 * 1000; // 2 min, 4 min
        const nextAttemptIso = new Date(nowMs + backoffMs).toISOString();

        await env.DB.prepare(
          `UPDATE notification_jobs
           SET status = 'retry_scheduled',
               next_attempt_at = ?,
               last_error_category = ?,
               locked_until = NULL,
               updated_at_utc = ?
           WHERE id = ?`
        ).bind(nextAttemptIso, result.error || null, nowIso, job.id).run();
        stats.failed++;
      }
    }
  }

  return stats;
}
