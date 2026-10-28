# Requirements Traceability Matrix (Seed)

Condensed seed matrix from Playbook Section 4. Antigravity expands this to full columns in `01-traceability.md`. Status for every row starts as `Not started`.

| ID | Requirement (source) | Screen / backend | Acceptance test | Planned Phase | Priority | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| A1 | Registration, login, secure session (3A, 11) | Auth screens; users, sessions | Register, log in, wrong password rejected, session expires | Phase 3 | P0 | Not started |
| A2 | Industry presets (3A, 4) | Onboarding picker; preset seed data | Salon preset seeds services; others selectable as data only | Phase 3 | P1 | Not started |
| A3 | Business profile, branding, slug URL (3A) | Settings; businesses | Edit profile, public page reflects it | Phase 3 | P0 | Not started |
| A4 | Services: duration, buffer, price in minor units (3A, 9) | Services; services | CRUD persists, price in paise | Phase 3 | P0 | Not started |
| A5 | Staff/resources, eligibility (3A, 9) | Default resource; staff | One default resource used by availability | Phase 3 | P1 | Not started |
| A6 | Hours, breaks, holidays, blocked periods (3A) | Settings; hours, blocks | Slots vanish in a break or holiday | Phase 3 | P0 | Not started |
| A7 | Timezone, booking and cancellation policies (3A) | Settings | Policy blocks late cancel server-side | Phase 3 | P0 | Not started |
| A8 | Public booking URL and QR (3G) | Share panel | URL opens public page, QR downloads and scans | Phase 3 | P0 | Not started |
| B1 | Mobile public booking page (3B) | Public page | Completes in 4 steps at 375px | Phase 4 | P0 | Not started |
| B2 | Live availability from server rules (3B, 10) | GET availability | Matches hours, buffers, bookings | Phase 4 | P0 | Not started |
| B3 | Contact form, note, validation (3B) | Booking form; Zod | Invalid phone rejected inline and server-side | Phase 4 | P0 | Not started |
| B4 | Instant confirm (P0) / approval mode (P1) (3B) | Settings flag; status | Instant path works; approval creates pending | Phase 4 | P0/P1 | Not started |
| B5 | Reference and confirmation only after save (3B, 14) | Confirmation page | No confirmation if insert fails | Phase 4 | P0 | Not started |
| B6 | Customer reschedule/cancel with token (3B) | Manage page | Reschedule frees old slot, policy enforced | Phase 4 | P0 | Not started |
| B7 | Alternative slots on conflict (3B, 3C) | Conflict UI | 409 shows nearest alternatives | Phase 4 | P1 | Not started |
| B8 | Simultaneous booking safety (3B, 8, 14) | slot_cells unique key | Parallel test: exactly one confirmed | Phase 4 | P0 | Not started |
| B9 | Waitlist (3B, 6) | Join waitlist | Deferred, documented | Deferred | P2 | Not started |
| C1 | Day/week/agenda views and filters (3C) | Calendar, Bookings | Filters by staff, service, status work | Phase 5 | P0 | Not started |
| C2 | Quick Add with source label (3C) | Quick Add dialog | Phone/WhatsApp/walk-in saved with source | Phase 5 | P0 | Not started |
| C3 | Overlap prevention in owner flows (3C) | Same engine as public | Owner cannot double-book | Phase 5 | P0 | Not started |
| C4 | Needs Attention panel (3C) | Today | Shows pending, failures, cancellations | Phase 5 | P1 | Not started |
| C5 | Booking detail, status transitions, audit (3C, 11) | Detail drawer; booking_events | Illegal transition rejected, event logged | Phase 5 | P0 | Not started |
| C6 | CSV export (3C) | Export button | Tenant-scoped CSV downloads | Phase 8 | P1 | Not started |
| D1 | Customer directory, search by name/phone (3D) | Customers | Search normalizes phone | Phase 6 | P0 | Not started |
| D2 | Profile summary, timeline, notes (3D, 5) | Profile | Stats match stored bookings | Phase 6 | P0 | Not started |
| D3 | Returning-customer match, no silent merge (3D) | Booking create | Same phone links; name conflict asks owner | Phase 6 | P0 | Not started |
| D4 | Quick rebook with revalidation (3D) | Book again | Price and availability rechecked | Phase 6 | P0 | Not started |
| D5 | Duplicate detection and controlled merge (3D) | Merge dialog | Merge keeps booking links and audit | Phase 6 | P1 | Not started |
| D6 | Role-based notes, export, deletion request (3D, 11) | Permissions | Staff without role cannot read notes | Phase 6 | P1 | Not started |
| E1 | Confirmation after save (3E) | Job on booking | Job created only after commit | Phase 7 | P0 | Not started |
| E2 | Configurable schedule (3E) | Notifications settings; rules | 24h and 2h jobs at correct UTC | Phase 7 | P0 | Not started |
| E3 | Approve/reschedule/cancel notices (3E, 6) | Templates | Each event creates one job | Phase 7 | P0 | Not started |
| E4 | States, idempotency, backoff, bounded retries (3E, 10) | notification_jobs; cron | Crash and double-run send once; stops at max attempts | Phase 7 | P0 | Not started |
| E5 | Supersede on reschedule/cancel (3E, 10) | Job logic | No reminder for cancelled booking | Phase 7 | P0 | Not started |
| E6 | Consent, manual resend (3E) | Preferences; resend button | No send without consent | Phase 7 | P0 | Not started |
| E7 | Quiet hours, opt-out, rate limits (3E, 11) | Settings | Quiet-hour job shifts or skips by rule | Phase 7 | P1 | Not started |
| E8 | Reminder health panel and fallback (3E, 6) | Notifications screen | Failed job shows reason, copy message, wa.me link | Phase 7 | P0 | Not started |
| E9 | One real channel (Resend) or labelled sandbox (14, 15) | Provider adapter | Missing key means labelled dry-run | Phase 7 | P0 | Not started |
| F1 | Reviews, verified, owner reply, moderation (3F) | Reviews | One review per completed booking | Phase 8 | P1 | Not started |
| G1 | Share templates, embed, source tags (3G) | Share panel | Source tag stored on booking | Phase 8 | P1 | Not started |
| H1 | Analytics from stored data only (3H, 12) | Today, Insights | Numbers equal DB counts; empty state shown | Phase 8 | P0/P1 | Not started |
| S1 | Tenant isolation everywhere (11, 14) | All APIs | Cross-business access returns 404 | Phase 9 | P0 | Not started |
| S2 | Audit of customer, status, notes, settings (11) | booking_events, audit_log | Changes appear in timeline | Phase 5–7 | P0 | Not started |
| S3 | Retention and deletion policy (11) | Docs and flow | Documented behavior | Phase 9 | P1 | Not started |
| U1 | Design system and all states (7) | Whole UI | Skeleton, empty, error, offline present | Phase 2 | P0 | Not started |
| U2 | Labelled demo data only (13, 14) | Seed command | Demo badge visible, no real data | Phase 11 | P0 | Not started |
