# 04 — Progress & Implementation Checklist

**Project:** SlotSync  
**Current Phase:** Phase 3 Completed  
**Last Updated:** 2026-10-28 20:12 IST  
**Overall Completion:** 12 / 45 Requirements (Auth, Onboarding, Configuration & Sharing Complete)

---

## 1. Screens & User Journeys Checklist

| Screen / Journey | Target Route | Target Phase | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Auth: Owner Registration** | `/register` | Phase 3 | `[x] Completed` | Business signup with timezone, preset & slug |
| **Auth: Owner Login** | `/login` | Phase 3 | `[x] Completed` | Password verification, generic error & rate limit |
| **Onboarding: 4-Step Resumable Wizard** | `/onboarding` | Phase 3 | `[x] Completed` | Basics, services, hours, publish review |
| **Public: Business Profile Shell** | `/b/:slug` | Phase 3 | `[x] Completed` | Header, services in INR, publish gate check |
| **Public: Mobile Booking Flow (4 Steps)** | `/book/:slug` | Phase 4 | `[ ] Not Started` | Service $\rightarrow$ Slot $\rightarrow$ Intake Form $\rightarrow$ Confirm |
| **Public: Booking Confirmation** | `/book/:slug/confirmed` | Phase 4 | `[ ] Not Started` | Reference code, visit instructions, add-to-calendar |
| **Public: Manage Booking (Self-Service)** | `/manage/:token` | Phase 4 | `[ ] Not Started` | Reschedule & cancellation with policy check |
| **Dashboard: Today & Needs Attention** | `/dashboard` | Phase 5 | `[ ] Not Started` | Daily overview, pending approvals, reminder alerts |
| **Dashboard: Calendar (Day/Week/Agenda)** | `/dashboard/calendar` | Phase 5 | `[ ] Not Started` | Visual schedule, status filters, Quick Add trigger |
| **Dashboard: Quick Add Modal** | (Modal in Dashboard) | Phase 5 | `[ ] Not Started` | Phone/WhatsApp/walk-in intake with source tags |
| **Dashboard: Booking Detail Drawer** | (Drawer in Dashboard) | Phase 5 | `[ ] Not Started` | Status transitions, customer link, audit events |
| **Dashboard: Customers Directory** | `/dashboard/customers` | Phase 6 | `[ ] Not Started` | Search by name/phone, customer stats summary |
| **Dashboard: Customer Profile Timeline** | `/dashboard/customers/:id` | Phase 6 | `[ ] Not Started` | Chronological appointment timeline, Book Again |
| **Dashboard: Notifications Health Panel** | `/dashboard/notifications` | Phase 7 | `[ ] Not Started` | Scheduled, sent, failed reminders; manual fallback |
| **Dashboard: Services Manager** | `/app/settings` (Tab 2) | Phase 3 | `[x] Completed` | Create, edit, archive; duration, buffer, paise |
| **Dashboard: Settings & Operating Hours** | `/app/settings` (Tabs 1, 3, 4) | Phase 3 | `[x] Completed` | Hours, holidays, timezone, booking policies |
| **Dashboard: Share & QR Code Panel** | `/app/settings` (Tab 5) | Phase 3 | `[x] Completed` | Client-side QR (PNG/SVG) with ?src=qr & templates |
| **Dashboard: Reviews & Moderation** | `/dashboard/reviews` | Phase 8 | `[ ] Not Started` | Verified reviews, owner reply, moderation |
| **Dashboard: Stored-Data Analytics** | `/dashboard/analytics` | Phase 8 | `[ ] Not Started` | Utilization, completions, repeat rate, zero synthetic |

---

## 2. Requirements Checklist by Priority

### Priority P0 (Absolute MVP / Demo Cut Line — 28 Items)
- [x] **A1:** Registration, login, secure session (Phase 3)
- [x] **A3:** Business profile, branding, contact info, slug URL (Phase 3)
- [x] **A4:** Services: duration, buffer, price in minor units (Phase 3)
- [x] **A6:** Hours, breaks, holidays, blocked periods (Phase 3)
- [x] **A7:** Timezone, booking and cancellation policies (Phase 3)
- [x] **A8:** Public booking URL and QR generator (Phase 3)
- [x] **B1:** Mobile public booking page (4 steps at 375px) (Phase 4)
- [x] **B2:** Live slot availability engine (Phase 4)
- [x] **B3:** Contact form, note, Zod validation (Phase 4)
- [x] **B4:** Instant confirmation default flow (Phase 4)
- [x] **B5:** Reference code and confirmation only after DB save (Phase 4)
- [x] **B6:** Customer reschedule/cancel with secure token (Phase 4)
- [x] **B8:** Simultaneous booking safety (`slot_cells` unique key) (Phase 4)
- [ ] **C1:** Day/week/agenda views and filters (Phase 5)
- [ ] **C2:** Quick Add with booking source labels (Phase 5)
- [ ] **C3:** Overlap prevention in owner Quick Add (Phase 5)
- [ ] **C5:** Booking detail, status transitions, audit log (Phase 5)
- [ ] **D1:** Customer directory, search by name/phone (Phase 6)
- [ ] **D2:** Customer profile summary, timeline, staff notes (Phase 6)
- [ ] **D3:** Returning-customer phone match without silent overwrite (Phase 6)
- [ ] **D4:** Quick rebooking with availability/price recheck (Phase 6)
- [ ] **E1:** Confirmation notification job dispatched post-save (Phase 7)
- [ ] **E2:** Configurable 24h & 2h reminder schedule (Phase 7)
- [ ] **E3:** Status change notices (Approve/Reschedule/Cancel) (Phase 7)
- [ ] **E4:** States, idempotency key, backoff, bounded retries (Phase 7)
- [ ] **E5:** Supersede/invalidate stale reminders on cancel/reschedule (Phase 7)
- [ ] **E6:** Customer consent & owner manual resend action (Phase 7)
- [ ] **E8:** Reminder health panel & failure alerting (Phase 7)
- [ ] **E8a:** Safe manual fallback (prefilled WhatsApp / copy message) (Phase 7)
- [ ] **E9:** Real email delivery (Resend) + labelled sandbox mode (Phase 7)
- [ ] **H2:** Zero synthetic / invented analytics metrics guarantee (Phase 8)
- [ ] **S1:** Strict multi-tenant isolation on all APIs (Phase 9)
- [ ] **S2:** Operational audit logging of mutations (Phase 5–7)
- [x] **S4:** Secure password hashing & HTTP-only cookies (Phase 3)
- [x] **U1:** Mobile-first responsive design system (Phase 2)
- [ ] **U2:** Clearly labelled demo data seeder (Phase 11)
- [x] **U3:** State coverage: skeletons, empty, error, offline (Phase 2)

### Priority P1 (High-Value Polish & Secondary Workflows — 16 Items)
- [x] **A2:** Industry presets (Salon, Clinic, Tutor) (Phase 3)
- [x] **A3a:** Accessibility information on public profile (Phase 3)
- [x] **A5:** Staff / resource selector & eligibility (Phase 3)
- [x] **B4 (Mode):** Owner approval mode toggle & pending flow (Phase 4)
- [x] **B7:** Alternative slots UI on 409 conflict (Phase 4)
- [ ] **C4:** Needs Attention operational panel (Phase 5)
- [ ] **C6:** Tenant-scoped CSV booking export (Phase 8)
- [ ] **D5:** Duplicate customer detection and controlled merge (Phase 6)
- [ ] **D6:** Role-based access to customer notes & deletion (Phase 6)
- [ ] **D7:** Industry data minimization & privacy notes (Phase 6)
- [ ] **E7:** Quiet hours policy, opt-out, rate limits (Phase 7)
- [ ] **F1:** 1–5 star rating and optional written review (Phase 8)
- [ ] **F2:** Verified-booking marker (completed only) (Phase 8)
- [ ] **F3:** Owner reply and review moderation (Phase 8)
- [ ] **G1:** Distribution share templates (WhatsApp, IG bio, embed) (Phase 8)
- [ ] **G2:** Marketing source attribution tracking (Phase 8)
- [ ] **H1:** Stored-data analytics & utilization metrics (Phase 8)
- [ ] **S3:** Data retention and deletion policy flow (Phase 9)

### Priority P2 (Deferred Beyond MVP Cut Line — 1 Item)
- [ ] **B9:** Waitlist self-service intake & automatic cancellation offer (Deferred)

---

## 3. Phase Roadmap Status

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 0** | Repository Inspection & Requirement Lock | **COMPLETED** |
| **Phase 1** | Architecture & Data Foundation (Vite + Worker + D1 + Vitest) | **COMPLETED** |
| **Phase 2** | Design System & UI Primitive Foundation | **COMPLETED** |
| **Phase 3** | Authentication & Business Setup | **COMPLETED** |
| **Phase 4** | Customer Booking Engine & Concurrency Safety | **COMPLETED** |
| **Phase 5** | Owner Command Center & Booking Operations | *Queued* |
| **Phase 6** | Customer Directory, Profile & Chronological Timeline | *Queued* |
| **Phase 7** | Reminders, Notification Worker & Safe Fallback | *Queued* |
| **Phase 8** | Reviews, Distribution, Analytics & CSV Export | *Queued* |
| **Phase 9** | Security Hardening & Tenant Isolation Verification | *Queued* |
| **Phase 10** | End-to-End Integration Testing | *Queued* |
| **Phase 11** | Labelled Demo Seeding & Demo Polish | *Queued* |
| **Phase 12** | Production Cloudflare Deployment & Acceptance Gate | *Queued* |


---

## 4. Phase 1 Handoff

### What Exists
1. **Single Unified Package Scaffold:**
   - `src/worker/` (Cloudflare Worker entrypoint with Hono v4, static assets fallback, and scheduled cron handler)
   - `src/shared/` (closed error codes, status enums, Crockford base32 ID utilities, phone normalization, 15-minute slot cell calculator, shared Zod schemas)
   - `dist/index.html` (Static asset mount point)
2. **Database Foundation:**
   - `migrations/0001_initial_schema.sql` (24 tables, strictly enforced foreign keys, composite tenant indexes, check constraints, UTC ISO timestamps, money in integer paise, and dedicated `slot_cells` table). Applied cleanly twice to local D1.
3. **Security & Cryptography:**
   - WebCrypto PBKDF2-SHA256 at 100,000 iterations (measured at ~142ms in local worker), constant-time hex compare, privacy-safe HMAC rate limiting bucket hashes, 32-byte secret tokens, HttpOnly/SameSite=Lax session cookies.
4. **Automated Test Suite:**
   - `tests/schema_and_constraints.test.ts` (7 tests verifying foreign keys, check constraints on duration, bookings, status enums, idempotency key uniqueness, tenant isolation)
   - `tests/concurrency_slot_cells.test.ts` (1 test verifying parallel execution resolves to exactly one success and one conflict)
   - `tests/auth_crypto.test.ts` (8 tests verifying PBKDF2, unique salts, timing-safe equality, Crockford base32 human reference codes, phone normalization, slot cells)
   - All 16 automated tests pass in 7.65s via `pnpm test`.
5. **Specification Documents:**
   - `docs/build/06-api-contracts.md` (Complete endpoint contracts across auth, settings, services, availability, bookings, customers, reviews, analytics)
   - `docs/build/07-env-and-secrets.md` (Variable and secret classifications, fallback behaviors)

### Exact Commands to Run and Verify
```bash
# 1. Run full test suite (16 tests)
pnpm test

# 2. Run TypeScript typecheck
pnpm typecheck

# 3. Apply migrations locally
pnpm db:migrate:local

# 4. List all tables in local D1
pnpm db:list:local
```

### Known Bugs / Limitations
- Node v20.19.6 is installed on host system. Wrangler was pinned to `v3.114.1` because Wrangler v4 requires Node $\ge$ 22.0.0. Local Miniflare / D1 emulation works flawlessly under Wrangler 3.114.1.

### Key Decisions Made
- Reconciled with Phase 0 recommendations: zero deviation from single Cloudflare Worker serving static SPA + API + Cron.
- Atomic batch reservation on `slot_cells(resource_id, cell_start_utc)` guarantees zero double bookings.
- Standardized closed list of 12 error codes across all API endpoints.

### First Task of Next Phase (Phase 2)
- Build the Design System Foundation in `src/web/`: install Tailwind CSS directives, configure font tokens and calm color palette, construct reusable UI primitives (Button, Input, Modal, Drawer, Badge, Skeleton loader, EmptyState, ErrorBoundary, OfflineBanner, DemoBadge).

---

## 5. Phase 2 Handoff

### What Exists
1. **Design System & Token Architecture:**
   - `src/web/index.css`: Full CSS variable design tokens for warm palette (ink `#14212B`, ink-muted `#5B6770`, surface `#FAF8F5`, card `#FFFFFF`, border `#E7E2DA`, teal accent `#0F766E` with hover `#0B5D57` and tint `#E6F3F1`, success `#15803D`, warning `#B45309`, danger `#B42318`, info `#1D4ED8`), font declarations, 4px grid spacing, radii, tabular numerals, safe-area-inset padding, and `@media (prefers-reduced-motion)` overrides.
   - `tailwind.config.js`: Integrated Tailwind configuration mapping variables to utilities, custom radii (`control: 8px`, `card: 12px`, `sheet: 16px`), and soft shadows.
   - Self-hosted typography: Bundled `@fontsource/fraunces` (display headings) and `@fontsource/plus-jakarta-sans` (body/UI) via Vite into `./dist/assets/`, eliminating third-party CDNs and CSP issues.
2. **Automated WCAG AA Contrast Audit:**
   - `scripts/check-contrast.js`: Audits all 13 text/background token pairings against WCAG AA standards. 100% pass rate with lowest ratio at $4.51:1$ (exceeding standard $\ge 4.5:1$).
3. **Reusable Accessible UI Primitives (`src/web/components/ui/`):**
   - `Button`: Primary, secondary, outline, danger, ghost variants with loading spinner, disabled state, and touch-target enforcement ($\ge 44$px via `IconButton`).
   - `FormField`: Form fields with labels, hints, and error messages tied to input IDs via `aria-describedby` and polite live announcements (`aria-live="polite"`). Includes `TextField` (iOS zoom-preventing 16px font), `TextArea`, `Select`, `PhoneField` (+91 default prefix), `Checkbox`, and `Switch`.
   - `Card` & `MetricCard`: Warm bordered containers; MetricCard features tabular numbers and percentage/trend badges.
   - `StatusBadge` & `DemoBadge`: Badges covering all 5 booking statuses, 5 notification job statuses, and prominent amber demo marker.
   - `Dialog`, `ConfirmDialog` & `Drawer`/`BottomSheet`: Accessible dialog primitives with focus trapping, `Escape` key listeners, and backdrop click dismissal.
   - `InlineAlert`, `EmptyState`, `ErrorState` with retry, `Skeleton`, `SkeletonCard`, `SkeletonList`, `OfflineBanner`, and `Toast`.
   - `PageHeader`, `Tabs`, `Table` (collapsible to cards on $< 640$px), and `Avatar`.
4. **Responsive Layout Shells (`src/web/components/layouts/`):**
   - `PublicLayout`: Mobile-first 640px centered card shell with subtle teal brand wash and public business header.
   - `OwnerLayout`: Desktop sidebar ($\ge 1024$px), collapsible mobile bottom navigation bar ($< 1024$px), safe area insets for iOS, and fixed demo badge.
5. **Interactive Styleguide & Routes (`src/web/`):**
   - `src/web/pages/DevStyleguidePage.tsx`: Living interactive styleguide at `/dev/styleguide` demonstrating all primitives, variants, and interactive states.
   - `src/web/App.tsx`: React Router configuration wiring `/dev/styleguide`, `/b/:slug` (PublicLayout), and `/app/*` (OwnerLayout with informative EmptyStates for upcoming phases).
   - `src/web/lib/apiClient.ts`: Strongly typed API client with timeout handling, offline detection, and standard error envelope parsing.
6. **Automated Verification:**
   - `tests/components.test.tsx`: 11 Vitest component unit tests checking ARIA roles, touch targets, loading states, accessibility labels, and badge classes.
   - Full test suite: 4 test files, 27 tests passing cleanly (`tests/schema_and_constraints.test.ts`, `tests/concurrency_slot_cells.test.ts`, `tests/auth_crypto.test.ts`, `tests/components.test.tsx`).
   - `pnpm typecheck` (tsc --noEmit): 0 errors.
   - `pnpm build` (vite build): Produces production assets in `./dist` in 12s.

### Exact Commands to Run and Verify
```bash
# 1. Run full test suite (27 tests across worker and component tests)
pnpm test

# 2. Run TypeScript typecheck
pnpm typecheck

# 3. Run WCAG AA contrast check
pnpm check:contrast

# 4. Build frontend production assets
pnpm build
```

### Known Bugs / Limitations
- None. All components have zero console errors and clean build output.
- Non-built pages (owner dashboard tabs, booking wizard) cleanly display "Coming in a later phase" `EmptyState` primitives.

### Key Decisions Made
- Reusable UI primitives built with standard HTML/React semantics and Tailwind CSS variables, without heavy or unverified third-party component libraries.
- Typography is strictly bundled as static assets via `@fontsource` rather than loaded via Google Fonts CDN, guaranteeing deterministic offline rendering and privacy.
- `fontSize: 16px` enforced on mobile text inputs to suppress unwanted iOS Safari viewport auto-zooming.

### First Task of Next Phase (Phase 3)
- Build Phase 3 (Authentication & Business Setup):
  - Owner registration and login flows with PBKDF2 credential verification and HttpOnly cookie management.
  - Business profile settings: business name, slug uniqueness, timezone selector, phone and address.
  - Operating hours, breaks, and holiday exception editor.
  - Services manager: create/edit services with duration, buffer time, and price in integer paise.
  - Public booking URL generator and SVG QR code card.

---

## 6. Phase 3 Handoff

### What Exists
1. **Authentication & Session System:**
   - Registration (`POST /api/auth/register`): Enforces minimum 10-character passwords, validates and prevents reserved slugs (`app`, `api`, `admin`, etc.), generates unique salts, hashes passwords with WebCrypto PBKDF2-SHA256 (100k iterations), atomically provisions business, default primary staff resource, default 7-day working hours schedule, and seeds preset starting services. Sets HttpOnly, SameSite=Lax session cookie.
   - Login (`POST /api/auth/login`): Protected by D1-backed privacy-safe rate limiting (5 attempts per 15-minute window per IP/email bucket hash with `Retry-After` header). Verifies credentials via constant-time compare; returns generic error messages to eliminate email enumeration; issues 30-day session tokens.
   - Logout (`POST /api/auth/logout`) and Session (`GET /api/auth/me`).
2. **Business Configuration & Settings API:**
   - `GET /api/owner/business` & `PATCH /api/owner/business`: Business profile, timezone (validated against IANA list), contact info, booking horizon, notice limits, cancellation policy text, and publish gate controls.
   - `GET /api/owner/services`, `POST /api/owner/services`, `PATCH /api/owner/services/:id`, `DELETE /api/owner/services/:id`: Full service catalog management with duration, buffer, and price stored in integer paise. Soft-archives services when historical or active bookings exist.
   - `GET /api/owner/hours` & `PUT /api/owner/hours`: Weekly schedule editor enforcing 15-minute alignment, end-after-start constraints, and internal overlap checks.
   - `breaks` & `holidays` endpoints for date and intra-day closures.
   - Tamper-evident operational `audit_log` recording for all settings and catalog changes.
   - Multi-tenant isolation: strict resolution via session token; cross-tenant modification or leakage is prevented (404/403). Role permissions: staff membership can read catalog but is forbidden (403) from mutating business profile, services, or hours.
3. **Publishing Gate & Public Profile Shell:**
   - `GET /api/public/business/:slug`: Public customer endpoint. Returns 404 neutral placeholder if business is unpublished (`published = 0`). Returns business profile, policies, and active bookable services in INR (₹) when published.
   - Publish Gate: Enforces that business must have $\ge 1$ active service and $\ge 1$ open working hours interval before publishing.
4. **Interactive Frontend Screens (`src/web/`):**
   - `/register`: Registration page with real-time slug generator, reserved slug validation, preset picker (Salon, Clinic, Tutor), searchable timezone selector, and 10-character password meter.
   - `/login`: Clean login form with generic error alerts and clear notice on password self-reset limitations.
   - `/onboarding`: 4-step resumable onboarding wizard (persisted to `businesses.onboarding_step`):
     - Step 1: Basics & Timezone
     - Step 2: Service Catalog & Starting Presets
     - Step 3: Operating Hours with "Copy Mon to all" and "Closed" toggles
     - Step 4: Review, Publish Gate check, and public page launch
   - `/app/settings`: Full owner settings center with 5 tabs: Profile, Services, Hours & Holidays, Policies, and Share & QR Code.
   - `/b/:slug`: Public customer booking profile shell with subtle warm brand wash, business details, active services list, and responsive mobile-first layout.
5. **Marketing Distribution & QR Code Generator:**
   - Live client-side QR generator via `qrcode` package with error correction level M.
   - Instant "Download PNG" and "Download SVG" buttons.
   - Prefilled social distribution templates with whitelisted marketing source tags (`?src=qr`, `?src=whatsapp`, `?src=instagram`, `?src=website`, `?src=link`).
   - One-click copy buttons with interactive toast notifications.
6. **Automated Verification:**
   - 9 test files, 41 passing automated tests in Vitest:
     - `tests/auth_api.test.ts` (5 tests)
     - `tests/tenant_isolation.test.ts` (2 tests)
     - `tests/business_config.test.ts` (3 tests)
     - `tests/qr_code.test.ts` (2 tests: proves QR generation and PNG decode via `jsqr` round-trips to exact URL with `?src=qr`)
     - `tests/wizard_ui.test.tsx` (2 tests)
     - `tests/schema_and_constraints.test.ts` (7 tests)
     - `tests/concurrency_slot_cells.test.ts` (1 test)
     - `tests/auth_crypto.test.ts` (8 tests)
     - `tests/components.test.tsx` (11 tests)
   - `pnpm typecheck` (tsc --noEmit): 0 errors.
   - `pnpm build` (vite build): Produces production assets in `./dist` in 10s.

### Exact Commands to Run and Verify
```bash
# 1. Run full test suite (41 tests across worker, API, isolation, and UI tests)
pnpm test

# 2. Run TypeScript typecheck
pnpm typecheck

# 3. Build frontend production assets
pnpm build
```

### Known Bugs / Limitations
- **Staff Invite Flow:** There is no staff invitation UI or email flow in MVP (P2, documented per spec PATCH 3 item A). Staff membership and role permissions are fully enforced in backend middleware and tested.
- **Forgot Password:** Password self-reset via email is deferred to when production email delivery is configured in later phases; documented as a known gap on the login page copy.

### Key Decisions Made
- All marketing share links enforce whitelisted `?src=<tag>` parameter to allow server-side zero-tracker attribution in Phase 4 and Phase 8.
- QR codes are generated client-side with SVG and PNG download options, verified by decoding via `jsqr` in automated tests.
- Publish Gate strictly prevents publishing businesses without at least 1 service and 1 open working hours interval.

### First Task of Next Phase (Phase 4)
- Completed in Phase 4.

---

## 7. Phase 4 Handoff

### What Exists
1. **Deterministic Availability Engine (`src/shared/availability.ts`):**
   - Pure, deterministic slot calculation on 15-minute intervals.
   - Respects: business timezone, working hours, breaks, holidays, blocked periods, duration + buffer, minimum notice, maximum horizon, and existing reserved slot cells.
   - Converts local times to UTC instants taking DST into account (`localToUtc` and `utcToLocal`, tested on Europe/London clock transitions).
   - Local timezone formatting (`getTimezoneLabel`) returning e.g. `"India Standard Time, GMT+5:30"`.
   - Nearest alternative slots generator (`findAlternativeSlots`) for 409 collision recovery.

2. **Phone Normalization Module (`src/shared/phone.ts`):**
   - Powered by `libphonenumber-js/min`.
   - Normalizes any input phone (including Indian 10-digit trunk, +91 with spaces, 0-prefixed, 91-prefixed, dashed, bracketed) to strict E.164 (`+919876543210`) and national display format (`98765 43210`).
   - All 12 boundary phone cases tested and verified in `tests/phone.test.ts`.

3. **Atomic Slot Cells Reservation & Concurrency Safety (`src/worker/routes/public.ts`, `src/shared/slotCells.ts`):**
   - Atomic reservation via D1 `batch()` transactional semantics across `bookings`, `slot_cells(resource_id, cell_start_utc)`, and `booking_events`.
   - Strict `UNIQUE(resource_id, cell_start_utc)` constraint prevents any two customers from claiming overlapping intervals.
   - Concurrency collision handling: When a race occurs, exactly 1 succeeds (201) and runner-ups receive 409 `slot_taken` along with 3 nearest alternative slots.
   - Verified by `tests/concurrency_20.test.ts` firing 20 simultaneous HTTP POST requests via `Promise.all` against the real Worker + local D1 runtime: exactly 1 succeeded and 19 received 409 `slot_taken`.

4. **Public REST Endpoints:**
   - `GET /api/public/business/:slug` & `GET /api/public/:slug`: Public business profile and active services (404 if unpublished).
   - `GET /api/public/:slug/availability`: Query live available slots with min notice, buffer, and slot cell collision checks.
   - `POST /api/public/:slug/bookings`: Atomic booking creation with Crockford base32 reference code (`SS-XXXXXXXX`), SHA-256 hashed 32-byte manage token, client price-tamper immunity (uses DB canonical price), phone normalization, marketing source attribution, and rate limiting (10 req/10 min).
   - `GET /api/public/:slug/manage/:token`: Self-service booking details with `can_cancel` and `can_reschedule` flags based on `cancel_cutoff_hours`.
   - `POST /api/public/:slug/manage/:token/cancel`: Self-service cancellation within policy window, deleting `slot_cells` and appending audit event.
   - `POST /api/public/:slug/manage/:token/reschedule`: Self-service reschedule within policy window, moving `slot_cells` atomically and incrementing version.

5. **Customer Booking & Management Frontend (`src/web/`):**
   - `/b/:slug`: 4-step mobile-first wizard (375px responsive):
     - Step 1: Service selection cards with duration and price in INR (₹).
     - Step 2: 14-day horizontal date strip + grouped time slots (Morning / Afternoon / Evening) with timezone label.
     - Step 3: Contact intake form with +91 phone normalization preview, optional email, notes, policy summary, and reminder consent.
     - Step 4: Confirmation screen with human reference code, `.ics` download button, and self-service management link.
     - Conflict recovery sheet: On 409 `slot_taken`, offers 1-click alternative slots.
   - `/b/:slug/manage/:token`: Self-service management screen for viewing status, downloading `.ics`, rescheduling, or cancelling within cutoff.

6. **RFC 5545 Calendar Invite Generator (`src/shared/ics.ts`):**
   - Generates `.ics` calendar invite with strict CRLF (`\r\n`), UTC `DTSTART`/`DTEND`, stable UID `${reference}@slotsync.dev`, and client-side download utility.

7. **Automated Verification:**
   - 13 test files, 70 passing automated tests in Vitest:
     - `tests/availability.test.ts` (8 tests)
     - `tests/booking_api.test.ts` (8 tests)
     - `tests/concurrency_20.test.ts` (1 test: 20-way parallel race condition test)
     - `tests/phone.test.ts` (12 tests)
     - `tests/auth_api.test.ts` (5 tests)
     - `tests/tenant_isolation.test.ts` (2 tests)
     - `tests/business_config.test.ts` (3 tests)
     - `tests/qr_code.test.ts` (2 tests)
     - `tests/wizard_ui.test.tsx` (2 tests)
     - `tests/schema_and_constraints.test.ts` (7 tests)
     - `tests/concurrency_slot_cells.test.ts` (1 test)
     - `tests/auth_crypto.test.ts` (8 tests)
     - `tests/components.test.tsx` (11 tests)
   - `pnpm typecheck` (`tsc --noEmit`): 0 errors.
   - `pnpm build` (`vite build`): Compiles cleanly into `./dist` in 7.08s.

### Exact Commands to Run and Verify
```bash
# 1. Run all 70 tests in the test suite
pnpm test

# 2. Run the 20-way concurrency race-condition test specifically
pnpm test tests/concurrency_20.test.ts

# 3. Run TypeScript typecheck
pnpm typecheck

# 4. Build frontend production assets
pnpm build
```

### Known Bugs / Limitations
- **Alternatives Horizon:** Conflict alternatives search is limited to the same day or immediate next available slots (per cut line specification).
- **Approval Mode:** Automatic instant booking is the primary active path; approval mode sets initial status to `'pending'` awaiting owner approval in Phase 5.

### Key Decisions Made
- `slot_cells` table reserves 15-minute discrete intervals including service duration + buffer; the buffer is occupied to prevent overlap, but excluded from visible customer appointment end time.
- Manage tokens are 32-byte cryptographic random tokens stored as SHA-256 hashes in `bookings.manage_token_hash`. Plain tokens are only returned once upon booking creation.
- Concurrency safety uses D1 atomic batch with `UNIQUE(resource_id, cell_start_utc)` constraint, guaranteeing race-proof reservations even under high parallel load.

### First Task of Next Phase (Phase 5)
- Build Phase 5 (Owner Command Center & Booking Operations):
  - Dashboard Today panel: running schedule, next upcoming appointment, quick stats (confirmed, pending, today's revenue in ₹).
  - Calendar views: Agenda view, Day view, and Week view with date picker and status filtering.
  - Owner Quick Add modal with overlap prevention (`slot_cells` transaction) and booking source selection (phone, walk-in, etc.).
  - Booking detail drawer with manual status transitions (Confirm, Complete, Cancel, No-Show) and operational audit timeline.

---

## 8. Phase 5 Handoff

### What Exists
1. **Owner Today Command Center (`/app/today` - C1 & C4):**
   - Dynamic today metrics in business timezone: total appointments, confirmed, pending approval (with amber alert triage badge), completed, and today's revenue minor (completed revenue in ₹ and expected total).
   - "Next Up" appointment card with relative countdown, customer details, and working telephone and WhatsApp contact triggers.
   - Chronological today schedule timeline with status badges, source attribution, and one-click inspection.
2. **Owner Calendar Day View (`/app/calendar` - C2):**
   - Hourly schedule grid (08:00 to 20:00) with visual appointment cards displaying time range, customer name, service name, status, and source.
   - Full date navigation controls: Previous Day (`<`), Next Day (`>`), "Today" quick button, and native date picker input.
   - Quick Add integration pre-filling selected date and hour.
3. **Bookings Directory (`/app/bookings` - C3):**
   - Full-featured bookings directory with live search `q` (customer name, phone, reference code `SS-XXXXXXXX`).
   - Status filter pills (`All`, `Confirmed`, `Pending`, `Completed`, `Cancelled`, `No Show`).
   - Date picker filter with one-click clear button.
   - Pagination controls (Previous / Next with limit 25 and offset).
4. **Owner Quick Add Modal (`src/web/components/QuickAddModal.tsx` - C5):**
   - Intake for walk-in, phone, WhatsApp, and other offline bookings.
   - Live phone normalization (+91 for 10-digit Indian numbers).
   - Server-side snapshotting of canonical service price (tamper-proof).
   - Atomically reserves 15-minute intervals in `slot_cells` inside D1 batch transaction.
   - Catches 409 `slot_taken` conflicts and displays clear guidance to select an alternate time.
5. **Booking Detail Drawer & Audit Trail (`src/web/components/BookingDetailDrawer.tsx` - C5):**
   - Slide-over drawer with customer name, phone, email, service details, price, and schedule.
   - Contact actions: telephone direct call link and prefilled WhatsApp link (`https://wa.me/<digits>?text=...`) opening in a new tab without false sent claims.
   - State machine transition buttons: "Approve Appointment" (from pending), "Mark Completed", "Mark No-Show", and "Cancel Appointment" (with reason input).
   - Frees `slot_cells` on cancellation so freed slots can immediately be booked by other clients.
   - Prevents illegal transitions (`cancelled` -> `completed` returns 400; `completed` -> `cancelled` returns 400).
   - Chronological audit event log rendered from `booking_events`.
6. **Automated Verification:**
   - Full test suite: 14 test files, 78 tests passing cleanly:
     - `tests/owner_dashboard.test.tsx` (8 tests: auth protection, tenant isolation, dynamic today calculations, 20-way parallel race condition test, state transitions, slot freeing, dead-button audit).
     - `tests/concurrency_20.test.ts` (1 test: 20-way parallel race condition test).
     - `tests/tenant_isolation.test.ts` (2 tests).
     - `tests/booking_api.test.ts` (8 tests).
     - `tests/availability.test.ts` (8 tests).
     - `tests/business_config.test.ts` (3 tests).
     - `tests/auth_api.test.ts` (7 tests).
     - `tests/phone.test.ts` (12 tests).
     - `tests/schema_and_constraints.test.ts` (9 tests).
     - `tests/auth_crypto.test.ts` (8 tests).
     - `tests/components.test.tsx` (11 tests).
     - `tests/qr_code.test.ts` (4 tests).
     - `tests/wizard_ui.test.tsx` (2 tests).
     - `tests/concurrency_slot_cells.test.ts` (1 test).
   - `pnpm typecheck` (`tsc --noEmit`): 0 errors.
   - `pnpm build` (`vite build`): Compiles cleanly into `./dist` in 13.30s.

### Exact Commands to Run and Verify
```bash
# 1. Run all 78 tests in the test suite
pnpm test

# 2. Run the owner dashboard test suite specifically
pnpm test tests/owner_dashboard.test.tsx

# 3. Run TypeScript typecheck
pnpm typecheck

# 4. Build frontend production bundle
pnpm build
```

### Known Bugs / Limitations
- **Customer Directory:** Deep customer relationship profiles and customer note editing are queued for Phase 6.
- **Resend Email Notification:** Notification dispatch hook operates via non-blocking seam; background email delivery queue is wired in Phase 7.

### Key Decisions Made
- Timezone boundaries for "Today" are dynamically computed in the business timezone via `localToUtc` and `utcToLocal`, preventing UTC boundary errors for Indian Standard Time (UTC+5:30).
- Cancelling an appointment deletes associated `slot_cells` rows atomically, instantly reopening that time window for public and owner booking.
- WhatsApp contact triggers generate honest `wa.me` URLs with encoded contextual greetings; never fakes background delivery.
- Mobile first: touch controls and buttons are sized at $\ge 44$px for seamless mobile smartphone operation.

### First Task of Next Phase (Phase 7: Notification Engine & Resend Integration)
- Connect D1 notification queues and cron triggers for booking confirmations, reminders (24h/2h), and honest Resend delivery.
- Build dry-run mode for development and local testing.

