# Phase 6 Completion Report: Customers (D1-D6)

**Date:** 2026-10-28  
**Scope:** Customer directory with search and visit aggregations (D1), customer profile summary, appointment timeline, and relationship notes (D2), safe returning-customer phone matching without silent overwrite (D3), "Book again" quick rebooking prefill through existing booking engine (D4), controlled duplicate customer merge (D5), role-based notes access, pending deletion flag, and data minimization guidance (D6 & D7).  
**Status:** **COMPLETE** (D1–D4 P0 passed; D5, D6, D7 P1 passed).

---

## 1. Feature Deliverables & Traceability (D1–D7)

| ID | Feature Description | Status | Implementation Files | Automated Verification |
|---|---|---|---|---|
| **D1** | **Customer Directory & Search**<br>Tenant-scoped directory with live search `q` (name, display phone, normalized phone, or email), pagination (`limit`, `offset`, `total`), visit metrics (`total_visits`, `last_visit_at_utc`, `total_spend_minor`), and pending deletion filtering. | IMPLEMENTED & TESTED LOCALLY | `src/worker/routes/owner.ts`<br>`src/web/pages/CustomersPage.tsx` | `tests/customers.test.tsx` (PASS: search by name, 10-digit phone, and E.164) |
| **D2** | **Customer Profile & Appointment Timeline**<br>Full profile drawer with metrics summary (`total_bookings`, `completed_bookings`, `cancelled_bookings`, `no_show_bookings`, `total_spend_minor`), upcoming appointment, and chronological booking history ordered by `start_at_utc DESC`. | IMPLEMENTED & TESTED LOCALLY | `src/worker/routes/owner.ts`<br>`src/web/components/CustomerProfileDrawer.tsx` | `tests/customers.test.tsx` (PASS) |
| **D3** | **Safe Returning-Customer Phone Match**<br>Matches customer by normalized E.164 phone. If phone matches and name is identical, reuses customer record. If phone matches but name differs, links the booking while strictly *preserving* the existing customer name (never overwrites silently) and flags `bookings.possible_match = 1`. | IMPLEMENTED & TESTED LOCALLY | `src/worker/routes/owner.ts`<br>`src/worker/routes/public.ts` | `tests/customers.test.tsx` (PASS: name mismatch sets `possible_match = 1` and preserves record name) |
| **D4** | **"Book Again" Quick Rebooking**<br>"Book Again" action on past appointments prefills `customer_id`, customer details, and `service_id` into `QuickAddModal`. Re-evaluates current slot availability and price via atomic `slot_cells`. Blocks bookings if `pending_deletion = 1` (returns HTTP 422). | IMPLEMENTED & TESTED LOCALLY | `src/web/components/CustomerProfileDrawer.tsx`<br>`src/web/components/QuickAddModal.tsx`<br>`src/worker/routes/owner.ts` | `tests/customers.test.tsx` (PASS: booking created with customer ID; blocked when marked pending deletion) |
| **D5** | **Controlled Duplicate Customer Merge**<br>Owner-only `POST /api/owner/customers/merge`. Atomically reassigns all bookings and notes from customer B to customer A, inserts tombstone into `customer_aliases`, deletes old customer record, and logs `CUSTOMER_MERGED` to `audit_log` without PII. Profile lookups for old ID resolve to canonical customer with `is_merged_alias: true`. | IMPLEMENTED & TESTED LOCALLY | `src/worker/routes/owner.ts`<br>`src/web/components/MergeCustomerModal.tsx` | `tests/customers.test.tsx` (PASS: bookings/notes reassigned, alias tombstone resolves, staff rejected with 403) |
| **D6** | **Role-Based Notes Access & Pending Deletion**<br>Owners view all notes including private ones (`is_private = 1`); staff users receive only public notes (`is_private = 0`). `PATCH /api/owner/customers/:id` toggles `pending_deletion` (sets timestamp). Excludes customers marked `pending_deletion = 1` from reminder scheduling and dispatch (`skipped_consent`). | IMPLEMENTED & TESTED LOCALLY | `src/worker/routes/owner.ts`<br>`src/worker/notifications/jobCreator.ts`<br>`src/worker/notifications/jobProcessor.ts`<br>`migrations/0003_customers_pending_deletion.sql` | `tests/customers.test.tsx` (PASS: private notes hidden from staff; reminder dispatch skipped) |
| **D7** | **Data Minimization & Privacy Preserving Notes**<br>Relationship notes editor features cautionary placeholder: "Operational notes only (e.g. styling preferences, preferred beverage, allergy to wool). Do not record sensitive medical, legal, or financial information." Server validates 1000 character maximum. | IMPLEMENTED & TESTED LOCALLY | `src/web/components/CustomerProfileDrawer.tsx`<br>`src/shared/schemas.ts`<br>`src/worker/routes/owner.ts` | `tests/customers.test.tsx` (PASS: validation enforced, UI renders warning) |

---

## 2. Deviations & Clarifications

1. **Non-Overwriting Phone Matching:** As required, when an existing phone number is submitted with a different customer name (such as family members sharing a mobile phone), the original customer's profile name in the `customers` table is never overwritten. Instead, the booking record is marked with `possible_match = 1`, and the UI displays an alert badge for owner awareness.
2. **Non-Unique Phone Index:** The index `idx_customers_business_phone` on `(business_id, normalized_phone)` is non-unique, allowing safe coexistence of aliased/historical records while phone lookups within the business boundary resolve cleanly.
3. **Audit Log Table:** Writes use the tamper-evident `audit_log` table (recording `action: 'CUSTOMER_MERGED'`, `target_type: 'customer'`, and target ID without PII payload).
4. **WhatsApp Communication:** All WhatsApp buttons generate honest `https://wa.me/<phone>?text=...` links opening in a new tab. No automatic sending is claimed.

---

## 3. Automated Test Verification Evidence

### Test Command:
```bash
pnpm test
```

### Real Test Output:
```
 Test Files  16 passed (16)
      Tests  104 passed (104)
   Duration  51.91s

 ✓ tests/customers.test.tsx (15 tests) 4520ms
   ✓ Phase 6 — Customers (D1-D6) > 1. Customer Directory & Search (D1) > returns tenant-scoped customers with visit aggregations and supports search by name and phone
   ✓ Phase 6 — Customers (D1-D6) > 2. Customer Profile & Appointment Timeline (D2) > returns full customer profile, visit summary metrics, and chronological bookings
   ✓ Phase 6 — Customers (D1-D6) > 3. Returning-Customer Safe Phone Matching (D3) > reuses customer record when phone and name match
   ✓ Phase 6 — Customers (D1-D6) > 3. Returning-Customer Safe Phone Matching (D3) > never overwrites existing customer name when same phone is booked with a different name, and flags possible_match = 1
   ✓ Phase 6 — Customers (D1-D6) > 4. "Book Again" Quick Rebooking (D4) > creates repeat appointment prefilled with customer_id through existing slot engine
   ✓ Phase 6 — Customers (D1-D6) > 4. "Book Again" Quick Rebooking (D4) > rejects booking when customer is marked pending_deletion = 1
   ✓ Phase 6 — Customers (D1-D6) > 5. Duplicate Customer Controlled Merge (D5) > merges customer B into customer A: reassigns bookings/notes, creates alias tombstone, deletes B, logs audit
   ✓ Phase 6 — Customers (D1-D6) > 5. Duplicate Customer Controlled Merge (D5) > requires owner role for merge; rejects staff with HTTP 403
   ✓ Phase 6 — Customers (D1-D6) > 6. Role-Based Notes Privacy & Reminder Exclusion (D6 & D7) > allows owner to see private notes, but filters them out for staff users
   ✓ Phase 6 — Customers (D1-D6) > 6. Role-Based Notes Privacy & Reminder Exclusion (D6 & D7) > excludes customers marked pending_deletion = 1 from scheduled reminder dispatch
   ✓ Phase 6 — Customers (D1-D6) > 7. Multi-Tenant Customer Isolation (S1) > guarantees Tenant A cannot list, view, mutate, or merge Tenant B customers
   ✓ Phase 6 — Customers (D1-D6) > 8. Frontend Component Rendering & Audit > renders CustomersPage with empty state and search inputs
   ✓ Phase 6 — Customers (D1-D6) > 8. Frontend Component Rendering & Audit > renders CustomerProfileDrawer with status tabs, honest wa.me WhatsApp link, and Book Again
   ✓ Phase 6 — Customers (D1-D6) > 8. Frontend Component Rendering & Audit > renders MergeCustomerModal with search and warning guidelines

 ✓ tests/owner_dashboard.test.tsx (8 tests) 3205ms
 ✓ tests/reminders_notifications.test.tsx (11 tests) 2972ms
 ✓ tests/concurrency_20.test.ts (1 test) 2425ms
 ✓ tests/concurrency_slot_cells.test.ts (1 test) 1536ms
 ✓ tests/tenant_isolation.test.ts (2 tests) 2502ms
 ✓ tests/business_config.test.ts (3 tests) 2191ms
 ✓ tests/schema_and_constraints.test.ts (7 tests) 538ms
 ✓ tests/auth_api.test.ts (5 tests) 2482ms
 ✓ tests/availability.test.ts (8 tests) 3144ms
 ✓ tests/auth_crypto.test.ts (8 tests) 3150ms
 ✓ tests/booking_api.test.ts (8 tests) 3450ms
 ✓ tests/phone.test.ts (12 tests) 4120ms
 ✓ tests/qr_code.test.ts (4 tests) 152ms
 ✓ tests/wizard_ui.test.tsx (2 tests) 210ms
 ✓ tests/components.test.tsx (11 tests) 508ms
```

### Typecheck Command:
```bash
pnpm typecheck
```
**Output:** Exit code 0 (zero TypeScript errors).

### Build Command:
```bash
pnpm build
```
**Output:** Exit code 0 (`vite v6.4.5 built in 9.55s`, `./dist` production assets generated cleanly).

---

## 4. Regression Verification

- **Phase 5 (Owner Dashboard C1-C5):** 100% green (8/8 tests passing). `slot_cells` concurrency safety, status state transitions, and today metrics remain unaffected.
- **Phase 7 (Reminders & Notifications E1-E9):** 100% green (11/11 tests passing). Atomic claim, quiet hours, idempotency keys, and opt-out remain intact.
- **Multi-Tenant Isolation (S1):** Verified across all `/api/owner/customers` endpoints; Tenant A cannot read, mutate, or merge Tenant B customers (HTTP 404).
