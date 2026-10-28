# Phase 5 Inventory — Owner Dashboard (C1–C5)

**Audit Date:** 2026-10-28 21:05 IST  
**Component:** Owner Command Center, Today View, Day View, Bookings Management, Quick Add, and Booking Detail Drawer  
**Author:** Senior Full-Stack Engineer  

---

## 1. Traceability Mapping & Requirement Breakdown

| Requirement ID | Name | Blueprint / Traceability Source | Status in Existing Codebase | Missing Components to Build | Target Files to Touch / Create |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **C1** | **Today Dashboard Panel** | Blueprint 3C, 7; `01-traceability.md:34` | **PARTIAL** (`OwnerLayout` has `/app/today` navigation tab; placeholder currently rendered) | Real-time counts (total today, upcoming, pending, cancelled, today's revenue in ₹) calculated dynamically in business timezone; chronological timeline of today's appointments; next up highlight card; empty states when no bookings exist. | `src/worker/routes/owner.ts`, `src/web/pages/TodayPage.tsx`, `src/web/App.tsx` |
| **C2** | **Day View Calendar** | Blueprint 3C, 7; `01-traceability.md:34` | **PARTIAL** (`OwnerLayout` has `/app/calendar` navigation tab; placeholder currently rendered) | Time-grid schedule view by hour for any selected date in the business timezone; appointment chips with customer name, service, and source badge; date picker (previous, next, today); loading skeleton, empty day state, and error handling. | `src/worker/routes/owner.ts`, `src/web/pages/CalendarDayPage.tsx`, `src/web/App.tsx` |
| **C3** | **Bookings List & Filters** | Blueprint 3C, 11; `01-traceability.md:35,38` | **PARTIAL** (`OwnerLayout` has `/app/bookings` navigation tab; placeholder currently rendered) | Search by customer name, phone, or reference code; filter by status (`all`, `confirmed`, `pending`, `completed`, `cancelled`, `no_show`); paginated or bounded query; quick action buttons (Approve, Complete, Cancel, No-Show); prefilled `wa.me` customer contact links. | `src/worker/routes/owner.ts`, `src/web/pages/BookingsListPage.tsx`, `src/web/App.tsx` |
| **C4** | **Needs Attention Alert Panel (P1)** | Blueprint 3C; `01-traceability.md:37` | **NOT STARTED** | Aggregated triage query returning pending bookings requiring owner approval and cancelled appointments. | `src/worker/routes/owner.ts`, `src/web/components/NeedsAttentionPanel.tsx` |
| **C5** | **Quick Add Modal & Overlap Prevention** | Blueprint 3C; `01-traceability.md:35,36` | **PARTIAL** (`OwnerCreateBookingSchema` exists in `src/shared/schemas.ts`; `slot_cells` atomic batch reservation engine exists) | Endpoint `POST /api/owner/bookings` enforcing session tenant `business_id`; phone normalization; service selection; atomic `slot_cells` batch reservation (zero double-booking guarantee); 409 conflict handling on lost race; source attribution (`phone`, `whatsapp`, `walkin`, `other`); Quick Add UI modal triggerable from Today, Calendar, and Bookings list. | `src/worker/routes/owner.ts`, `src/web/components/QuickAddModal.tsx`, `src/web/components/BookingDetailDrawer.tsx` |
| **C6** | **Tenant CSV Export (P1)** | Blueprint 3C; `01-traceability.md:39` | **QUEUED (Phase 8)** | Bounded to Phase 8 per roadmap. | Deferred to Phase 8 |

---

## 2. Existing Assets to Reuse (Zero Duplicate Logic)
1. **Database Layer & Schema:**
   - `bookings`, `slot_cells`, `customers`, `booking_events`, `services`, `working_hours` tables fully established with indexes and constraints.
2. **Availability & Timezone Utilities:**
   - `src/shared/availability.ts`: `localToUtc()`, `utcToLocal()`, `computeAvailableSlots()`, `findAlternativeSlots()`.
   - `src/shared/slotCells.ts`: `computeSlotCells()`.
   - `src/shared/timezoneUtils.ts`: IANA timezone validation.
3. **Identity & Phone Normalization:**
   - `src/shared/idUtils.ts`: `generateUUID()`, `generateReferenceCode()` (Crockford base32), `generateSecretToken()`, `sha256Hex()`.
   - `src/shared/phone.ts`: `normalizePhone()` with +91 default and E.164 conversion.
4. **Validation Schemas:**
   - `src/shared/schemas.ts`: `OwnerCreateBookingSchema`, `BOOKING_SOURCES`, `BOOKING_STATUSES`.
5. **UI Component System:**
   - `src/web/components/ui/`: `Button`, `Card`, `Dialog`, `FormField`, `StatusBadge`, `Skeleton`, `EmptyState`.
   - `src/web/components/layouts/OwnerLayout.tsx`: responsive shell with sidebar, mobile drawer, and offline banner.

---

## 3. Plan of Execution
1. **Backend Endpoints (`src/worker/routes/owner.ts`):**
   - `GET /api/owner/dashboard/today`: Returns today's stats (total, confirmed, pending, completed, cancelled, revenue in paise) + today's chronological bookings + next appointment highlight. All date boundaries computed strictly in the business timezone.
   - `GET /api/owner/bookings`: Returns bookings filtered by date (`YYYY-MM-DD`), date range, status, or search term `q`.
   - `POST /api/owner/bookings` (Quick Add): Creates booking using the canonical database price, normalizes customer phone, reserves `slot_cells` atomically inside D1 `batch()`, and records `booking_events` audit row. Returns 409 `slot_taken` if slot cell is occupied.
   - `GET /api/owner/bookings/:id`: Returns booking details, customer profile summary, and chronological audit log from `booking_events`.
   - `PATCH /api/owner/bookings/:id/status`: Transitions status (`confirmed` -> `completed`, `cancelled`, `no_show`; `pending` -> `confirmed`, `cancelled`). If cancelled, frees `slot_cells`. Appends audit row to `booking_events`.
2. **Frontend Pages & Components (`src/web/`):**
   - `src/web/pages/TodayPage.tsx`: Metric cards, Next Up card, Today's Schedule timeline, Quick Add button, and status quick-actions.
   - `src/web/pages/CalendarDayPage.tsx`: Day schedule grid with hourly breakdown, date switcher (`Today`, `<`, `>`), and Quick Add integration.
   - `src/web/pages/BookingsListPage.tsx`: Search input, status filter pills, table/card list, prefilled `wa.me` WhatsApp link, status transition dropdown/buttons.
   - `src/web/components/QuickAddModal.tsx`: Service selector, customer phone + name, date/time input, source attribution pill selector (`phone`, `whatsapp`, `walkin`, `other`), race collision handling.
   - `src/web/components/BookingDetailDrawer.tsx`: Slide-over drawer with appointment info, audit event timeline, and status actions.
   - Update `src/web/App.tsx`: Route `/app/today` -> `TodayPage`, `/app/calendar` -> `CalendarDayPage`, `/app/bookings` -> `BookingsListPage`.
3. **Automated Test Suite (`tests/owner_dashboard.test.ts`):**
   - Auth required on all endpoints.
   - Tenant isolation (Tenant A cannot see or update Tenant B's bookings).
   - Dynamic Today stats calculation in business timezone.
   - Timezone midnight boundary testing.
   - Quick Add: successful booking, phone normalization, price tampering immunity, and overlap prevention (`slot_cells`).
   - 20-way parallel race test: Owner Quick Add vs Public booking competing for the same slot (3 runs, 100% safety).
   - Status transitions (valid transitions succeed; illegal transitions like `cancelled` -> `completed` rejected).
   - Dead-button audit test.
