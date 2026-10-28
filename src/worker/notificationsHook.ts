// SlotSync Notification Hook Seam
// Architecture seam for Phase 7 notification jobs.
// Called after atomic database commits without blocking response.

import { createNotificationJobsForEvent } from './notifications/jobCreator';
import { processNotificationQueue } from './notifications/jobProcessor';
import { AppBindings } from './middleware';

export async function dispatchBookingNotificationHook(
  db: D1Database,
  bookingId: string,
  eventType: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED' | 'BOOKING_APPROVED',
  env?: AppBindings,
  ctx?: ExecutionContext
): Promise<void> {
  try {
    const jobIds = await createNotificationJobsForEvent(db, bookingId, eventType);
    console.log(`[Notification Hook] ${eventType} created ${jobIds.length} jobs for booking ${bookingId.slice(0, 8)}...`);

    // Immediate attempt via ctx.waitUntil (Step 2 item 5)
    if (env && ctx && jobIds.length > 0) {
      ctx.waitUntil(
        processNotificationQueue(env, 5).catch((err) =>
          console.error('[Notification Immediate Dispatch Error]:', err)
        )
      );
    }
  } catch (err: any) {
    console.error(`[Notification Hook Error] Failed to process ${eventType}:`, err?.message || err);
  }
}
