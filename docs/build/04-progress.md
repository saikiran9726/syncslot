# 04 — Progress & Implementation Checklist

**Project:** SlotSync  
**Current Phase:** Phase 2 Completed  
**Last Updated:** 2026-10-28 19:45 IST  
**Overall Completion:** 2 / 45 Requirements (Design System & UI Primitives Operational)

---

## 1. Screens & User Journeys Checklist

| Screen / Journey | Target Route | Target Phase | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Auth: Owner Registration** | `/register` | Phase 3 | `[ ] Not Started` | Business signup with timezone & phone |
| **Auth: Owner Login** | `/login` | Phase 3 | `[ ] Not Started` | Password verification & secure session |
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
| **Dashboard: Services Manager** | `/dashboard/services` | Phase 3 | `[ ] Not Started` | Duration, buffer, minor units pricing |
| **Dashboard: Settings & Operating Hours** | `/dashboard/settings` | Phase 3 | `[ ] Not Started` | Hours, breaks, holidays, timezone, policies |
| **Dashboard: Share & QR Code Panel** | `/dashboard/share` | Phase 3 / 8 | `[ ] Not Started` | Downloadable QR code, social templates, iframe code |
| **Dashboard: Reviews & Moderation** | `/dashboard/reviews` | Phase 8 | `[ ] Not Started` | Verified reviews, owner reply, moderation |
| **Dashboard: Stored-Data Analytics** | `/dashboard/analytics` | Phase 8 | `[ ] Not Started` | Utilization, completions, repeat rate, zero synthetic |

---

## 2. Requirements Checklist by Priority

### Priority P0 (Absolute MVP / Demo Cut Line — 28 Items)
- [ ] **A1:** Registration, login, secure session (Phase 3)
- [ ] **A3:** Business profile, branding, contact info, slug URL (Phase 3)
- [ ] **A4:** Services: duration, buffer, price in minor units (Phase 3)
- [ ] **A6:** Hours, breaks, holidays, blocked periods (Phase 3)
- [ ] **A7:** Timezone, booking and cancellation policies (Phase 3)
- [ ] **A8:** Public booking URL and QR generator (Phase 3)
- [ ] **B1:** Mobile public booking page (4 steps at 375px) (Phase 4)
- [ ] **B2:** Live slot availability engine (Phase 4)
- [ ] **B3:** Contact form, note, Zod validation (Phase 4)
- [ ] **B4:** Instant confirmation default flow (Phase 4)
- [ ] **B5:** Reference code and confirmation only after DB save (Phase 4)
- [ ] **B6:** Customer reschedule/cancel with secure token (Phase 4)
- [ ] **B8:** Simultaneous booking safety (`slot_cells` unique key) (Phase 4)
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
- [ ] **S4:** Secure password hashing & HTTP-only cookies (Phase 3)
- [x] **U1:** Mobile-first responsive design system (Phase 2)
- [ ] **U2:** Clearly labelled demo data seeder (Phase 11)
- [x] **U3:** State coverage: skeletons, empty, error, offline (Phase 2)

### Priority P1 (High-Value Polish & Secondary Workflows — 16 Items)
- [ ] **A2:** Industry presets (Salon, Clinic, Tutor) (Phase 3)
- [ ] **A3a:** Accessibility information on public profile (Phase 3)
- [ ] **A5:** Staff / resource selector & eligibility (Phase 3)
- [ ] **B4 (Mode):** Owner approval mode toggle & pending flow (Phase 4)
- [ ] **B7:** Alternative slots UI on 409 conflict (Phase 4)
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
| **Phase 3** | Authentication & Business Setup | *Queued* |
| **Phase 4** | Customer Booking Engine & Concurrency Safety | *Queued* |
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
