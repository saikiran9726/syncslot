# SlotSync Notifications & Reminders Specification (Phase 7: E1-E9)

**Date:** 2026-10-28  
**Scope:** Automated transactional notifications, scheduled 24h & 2h reminders, Cloudflare Worker Cron Trigger (every 5 min), Resend API provider with honest dry-run fallback, quiet hours, 15-minute lateness threshold, customer opt-out, and failure visibility.

---

## 1. Inventory: Existing vs. Missing

### What Exists in Repository
1. **Database Tables (`migrations/0001_initial_schema.sql` & `migrations/0002_notifications_and_reminders.sql`):**
   - `notification_jobs` (Table 19): Outbox queue with `id`, `business_id`, `booking_id`, `booking_version`, `customer_id`, `channel`, `template_key`, `due_at_utc`, `status`, `attempt_count`, `next_attempt_at`, `locked_until`, `idempotency_key`, `provider_message_id`, `last_error_category`, `created_at_utc`, `updated_at_utc`.
   - `reminder_rules` (Table 18): `id`, `business_id`, `offset_minutes`, `enabled`, `template_key`.
   - `notification_preferences` (Table 17): `id`, `business_id`, `enable_email`, `enable_whatsapp_manual`, `sender_name`, `reply_to_email`, `consent_copy_text`, `sandbox_recipient_email`.
   - `businesses`: Contains `quiet_hours_start` (default '22:00') and `quiet_hours_end` (default '08:00').
   - `customers`: Contains `consent_email_reminders`, `consent_whatsapp_reminders`, `opted_out_at_utc`, `opt_out_reason`.
   - `bookings`: Contains `consent_email_reminders`, `version`.
2. **Status Enums (`src/shared/statusEnums.ts`):**
   - Complete 16-status closed enum locked in Phase 1: `queued`, `sending`, `accepted`, `delivered`, `simulated`, `retry_scheduled`, `failed`, `permanently_failed`, `skipped_late`, `skipped_quiet_hours`, `skipped_no_channel`, `skipped_consent`, `skipped_sandbox`, `superseded`, `cancelled`, `handled_manually`.
   - Standing rule compliance: "sent" and "delivered" are NOT set without provider confirmation; Resend acceptance maps strictly to `accepted`.
3. **Environment & Worker Triggers (`wrangler.jsonc`):**
   - Cloudflare Cron Trigger set to `"*/5 * * * *"` (every 5 minutes).
   - Variables: `EMAIL_FROM`, `APP_BASE_URL`.
   - Secrets: `RESEND_API_KEY` typed in `AppBindings`.
   - Architecture Seam: `dispatchBookingNotificationHook` in `src/worker/notificationsHook.ts` with immediate `ctx.waitUntil` attempt and Cron safety net.
4. **Owner UI & Navigation:**
   - `NotificationsPage.tsx` at `/app/notifications` with mode banner (`[Real Delivery]`, `[Sandbox Mode]`, or `[Dry-run Mode]`), exact required labels ("Accepted by provider, delivery unconfirmed", "Dry-run (not sent)", "Skipped: <reason>", "Failed: <sanitized reason>"), manual retry, and `wa.me` fallback links.
   - Notifications Tab in `SettingsPage.tsx` for reminder rules (24h/2h toggles), quiet hours (start/end), consent copy, and sandbox testing.
   - Booking detail drawer notification history section with exact status labels.

---

## 2. Failure-Mode Matrix

| Failure Mode | Mechanism in Code | Automated Test | Result |
|---|---|---|---|
| **Double Send** | Atomic conditional `UPDATE ... SET status = 'sending', locked_until = ? ... WHERE id = ? AND (status IN ('queued', 'retry_scheduled') OR (status = 'sending' AND locked_until <= ?))`. Supported by `Idempotency-Key` header sent to Resend REST API (24h deduplication). | `tests/reminders_notifications.test.tsx`<br>*(Atomic Claim under 3 parallel processors)* | **PASS** (Zero duplicate sends; exactly 5 jobs processed across 3 concurrent runs). |
| **Lost Job** | Notification jobs are persisted transactionally to D1 `notification_jobs` outbox table before any network dispatch. | `tests/reminders_notifications.test.tsx` | **PASS** (Jobs reliably stored and claimed). |
| **Stuck Lease (Worker crash / timeout)** | `locked_until` timestamp (5 min lease). Claim query reclaims expired locks: `(status = 'sending' AND locked_until <= now)`. | `tests/reminders_notifications.test.tsx`<br>*(Stuck Lease Expiry & Reclamation)* | **PASS** (Expired lease reclaimed and processed on next pass). |
| **Provider Outage (Resend 5xx / timeout)** | `dispatchEmail` catches network errors, sanitizes error string (redacts keys/tokens), and sets `status = 'retry_scheduled'` with capped exponential backoff. Caps at 3 attempts before `permanently_failed`. | `tests/reminders_notifications.test.tsx`<br>*(Sanitized Errors & Retry)* | **PASS** (Sanitized error recorded; no keys leaked). |
| **Provider Rate Limit (HTTP 429)** | Capped exponential backoff ($2^{\text{attempt}} \times 60$s) and queue processor batch size limited to 10 jobs per cron invocation. | `tests/reminders_notifications.test.tsx` | **PASS** (Scheduled retry with backoff). |
| **Booking Edited After Job Creation** | Each job stores `booking_version`. Processor checks `details.booking_version !== job.booking_version`. If mismatched, status transitions to `superseded`. If booking was cancelled, transitions to `cancelled`. | `tests/reminders_notifications.test.tsx`<br>*(Booking Version Mismatch Cancellation)* | **PASS** (Job transitioned to `superseded`). |
| **Clock Skew / Cron Delay (> 15 min late)** | 15-minute lateness threshold enforced on reminders. If `nowMs - effectiveDueMs > 15 * 60 * 1000`, status transitions to `skipped_late`. Transactional notices remain valid until appointment start time. | `tests/reminders_notifications.test.tsx`<br>*(15-Minute Lateness Boundary: 14:59 sends, 15:01 skips)* | **PASS** (14:59 sends; 15:01 safely skips). |
| **Cron Missed** | Subsequent cron run claims all due jobs `due_at_utc <= now`. If within 15 minutes, dispatches; if late, skips safely without spamming clients. | `tests/reminders_notifications.test.tsx` | **PASS** (Handled via lateness boundary). |
| **Backfill Rerun** | Idempotent `INSERT OR IGNORE` with `NOT EXISTS` subqueries against `notification_preferences` and `reminder_rules(business_id, offset_minutes)`. | `tests/reminders_notifications.test.tsx`<br>*(Additive Migration & Backfill Idempotency)* | **PASS** (Running backfill twice produces no duplicates). |

---

## 3. Verification Evidence

### Test Command:
```bash
pnpm test
```

### Real Test Output:
```
Test Files  15 passed (15)
     Tests  89 passed (89)
  Duration  32.17s

✓ tests/reminders_notifications.test.tsx (11 tests) 1921ms
✓ tests/owner_dashboard.test.tsx (8 tests) 2133ms
✓ tests/concurrency_20.test.ts (1 test) 1515ms
✓ tests/concurrency_slot_cells.test.ts (1 test) 825ms
✓ tests/tenant_isolation.test.ts (2 tests) 1479ms
✓ tests/business_config.test.ts (3 tests) 1817ms
✓ tests/schema_and_constraints.test.ts (7 tests) 562ms
✓ tests/auth_api.test.ts (5 tests) 2125ms
✓ tests/availability.test.ts (8 tests) 2465ms
✓ tests/auth_crypto.test.ts (8 tests) 2852ms
✓ tests/booking_api.test.ts (8 tests) 2986ms
✓ tests/phone.test.ts (12 tests) 3578ms
✓ tests/qr_code.test.ts (4 tests) 140ms
✓ tests/wizard_ui.test.tsx (2 tests) 189ms
✓ tests/components.test.tsx (11 tests) 474ms
```

### TypeScript Typecheck & Production Build:
- `pnpm typecheck` -> Exit code 0 (Zero errors)
- `pnpm build` -> Built 1761 modules into `./dist` in 6.78s (Zero errors)
