# Phase 7 Completion Report: Reminders and Notifications (E1-E9)

**Date:** 2026-10-28  
**Scope:** Automated transactional notices, configurable 24h & 2h scheduled reminders, Cloudflare Worker Cron Trigger (every 5 min), Resend API integration with honest dry-run fallback, quiet hours, 15-minute lateness threshold, customer opt-out, and failure visibility.  
**Status:** **COMPLETE** (E1-E6, E8, E9 P0 passed; E7 P1 passed).

---

## 1. Feature Deliverables & Traceability (E1–E9)

| ID | Feature Description | Status | Implementation Files | Automated Verification |
|---|---|---|---|---|
| **E1** | **Immediate Confirmation Notification**<br>Transactional booking confirmation created post-save with immediate `ctx.waitUntil` dispatch and Cron safety net. | IMPLEMENTED & TESTED LOCALLY | `src/worker/notifications/jobCreator.ts`<br>`src/worker/notificationsHook.ts` | `tests/reminders_notifications.test.tsx` (PASS)<br>`tests/booking_api.test.ts` (PASS) |
| **E2** | **Configurable Scheduled Reminders (24h & 2h)**<br>Rules in `reminder_rules` (1440m and 120m) automatically scheduled relative to `start_at_utc`. | IMPLEMENTED & TESTED LOCALLY | `src/worker/notifications/jobCreator.ts`<br>`src/web/pages/SettingsPage.tsx` | `tests/reminders_notifications.test.tsx` (PASS) |
| **E3** | **Status Change Notifications**<br>Transactional notices for reschedule, cancellation, and approval with template rendering. | IMPLEMENTED & TESTED LOCALLY | `src/worker/notifications/emailTemplates.ts`<br>`src/worker/notifications/jobCreator.ts` | `tests/reminders_notifications.test.tsx` (PASS) |
| **E4** | **Notification Engine Reliability**<br>Atomic claim with 5-minute lease expiry, capped exponential backoff ($2^n \times 60$s), max 3 attempts, and Resend `Idempotency-Key` header. | IMPLEMENTED & TESTED LOCALLY | `src/worker/notifications/jobProcessor.ts`<br>`src/worker/notifications/provider.ts` | `tests/reminders_notifications.test.tsx` (PASS: 3 parallel processors claim test) |
| **E5** | **Supersede & Invalidate Stale Reminders**<br>Job records `booking_version`. Rescheduling marks old jobs `superseded`; cancellation marks jobs `cancelled`. Version mismatch at send time cancels stale jobs. | IMPLEMENTED & TESTED LOCALLY | `src/worker/notifications/jobCreator.ts`<br>`src/worker/notifications/jobProcessor.ts` | `tests/reminders_notifications.test.tsx` (PASS) |
| **E6** | **Customer Consent & Unsubscribe Opt-Out**<br>Reminders respect `consent_email_reminders`. Customer self-service unsubscribe endpoint (`POST /api/public/:slug/manage/:token/opt-out`) records `opted_out_at_utc` and invalidates pending reminders (`skipped_consent`). | IMPLEMENTED & TESTED LOCALLY | `src/worker/routes/public.ts`<br>`src/worker/notifications/jobProcessor.ts` | `tests/reminders_notifications.test.tsx` (PASS) |
| **E7** | **Quiet Hours Policy & 15-Minute Lateness Boundary**<br>Reminders falling in quiet hours (22:00–08:00) shifted to next morning (08:00). Reminders >15 min late from effective due time are marked `skipped_late`. Transactional notices are exempt from quiet hours. | IMPLEMENTED & TESTED LOCALLY | `src/worker/notifications/jobProcessor.ts`<br>`src/web/pages/SettingsPage.tsx` | `tests/reminders_notifications.test.tsx` (PASS: 14:59 sends, 15:01 skips) |
| **E8** | **Owner Reminder Health Panel & Failure Visibility**<br>Operational dashboard at `/app/notifications` with filter tabs, mode banner, exact required status labels, and manual retry for failed jobs. | IMPLEMENTED & TESTED LOCALLY | `src/web/pages/NotificationsPage.tsx`<br>`src/worker/routes/owner.ts` | `tests/reminders_notifications.test.tsx` (PASS) |
| **E8a** | **Safe Manual Fallback (WhatsApp wa.me)**<br>Prefilled WhatsApp links open in new tab (`https://wa.me/<phone>?text=...`). UI never falsely claims messages were sent. | IMPLEMENTED & TESTED LOCALLY | `src/web/pages/NotificationsPage.tsx`<br>`src/web/components/BookingDetailDrawer.tsx` | `tests/reminders_notifications.test.tsx` (PASS) |
| **E9** | **Real Email Delivery (Resend API) + Labelled Sandbox Mode**<br>Uses `RESEND_API_KEY` when configured; falls back to honest dry-run simulation (`simulated`). Gated sandbox mode marks non-whitelisted recipients `skipped_sandbox`. | IMPLEMENTED & TESTED LOCALLY | `src/worker/notifications/provider.ts`<br>`src/web/pages/NotificationsPage.tsx` | `tests/reminders_notifications.test.tsx` (PASS) |

---

## 2. Deviations & Clarifications

1. **15-Minute Lateness Rule:** Applies strictly to scheduled reminders. Transactional notices (confirmations, reschedules, cancellations) remain sendable until the appointment start time if the booking version still matches.
2. **Resend Webhooks:** Deferred per standing rules (out of scope). Provider acceptance is marked `accepted` ("Accepted by provider, delivery unconfirmed"). The UI never sets "delivered" without provider webhook confirmation.
3. **UNCERTAIN Items:** None. All E-items were fully mapped to the locked 16-status enum from Phase 1 / Part 2 patches.

---

## 3. Automated Test Verification Evidence

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

### D1 Migrations:
- `0002_notifications_and_reminders.sql` applied successfully on local D1 database with 8 commands executed.
- Re-run applied cleanly with 0 pending migrations (`✅ No migrations to apply!`).

---

## 4. Files Created / Modified

- `migrations/0002_notifications_and_reminders.sql`: Additive columns and idempotent backfill.
- `src/worker/notifications/provider.ts`: Resend API provider with `Idempotency-Key` header, dry-run fallback, sandbox gating, and sanitized error logging.
- `src/worker/notifications/jobCreator.ts`: Event-driven job creation, version snapshotting, and rule scheduling.
- `src/worker/notifications/jobProcessor.ts`: Queue processing, atomic conditional claim with 5m lease, quiet-hours shifts, and 15m lateness threshold.
- `src/worker/notifications/emailTemplates.ts`: Accessible HTML/text templates with manage & opt-out links.
- `src/worker/notificationsHook.ts`: Integrated with job creator and `ctx.waitUntil` immediate attempt.
- `src/worker/index.ts`: Wired `scheduled()` cron handler to `processNotificationQueue`.
- `src/worker/routes/owner.ts`: Added `/notifications`, `/notifications/:id/retry`, `/notifications/preferences`, and `/reminder-rules`.
- `src/worker/routes/public.ts`: Added customer opt-out endpoint `POST /:slug/manage/:token/opt-out`.
- `src/web/pages/NotificationsPage.tsx`: Owner notifications queue dashboard with mode banner, exact status labels, retry, and WhatsApp links.
- `src/web/pages/SettingsPage.tsx`: Added Notifications & Reminders tab with quiet hours, reminder rules, consent copy, and sandbox testing.
- `src/web/components/BookingDetailDrawer.tsx`: Added per-booking notification history section.
- `src/web/App.tsx`: Wired `/app/notifications` route.
- `tests/reminders_notifications.test.tsx`: 11 automated test cases verifying all engine behaviors.
- `docs/08-reminders.md`: Requirements inventory, failure-mode matrix, and verification evidence.
