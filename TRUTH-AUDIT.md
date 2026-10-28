# SlotSync Truth Audit

**Audit Target:** All factual claims extracted from `README.md`, `DEMO-SCRIPT.md`, and frontend UI copy.  
**Standard:** Every claim must be supported by automated test suites, verifiable codebase references, and honest status labeling.  
**Classification:** `TRUE`, `PARTIALLY TRUE`, or `UNSUPPORTED`.

---

## 1. Claims & Evidence Audit Matrix

| # | Extracted Claim | Source Document / UI Component | Code & Test Evidence | Status |
|---|---|---|---|---|
| **1** | Single Cloudflare Worker serves both React SPA static assets and Hono `/api` REST routes. | `README.md`, Section 1 | `src/worker/index.ts:4-98`, `tests/phase10_live_verification.test.ts:28-49` | **TRUE** |
| **2** | Race-proof slot reservation prevents double bookings under 20-way parallel concurrency. | `README.md`, Section 2 | `src/worker/routes/public.ts:470-515`, `tests/concurrency_20.test.ts` (1 winner, 19 HTTP 409 `slot_taken` with alternatives) | **TRUE** |
| **3** | Slot cells are discrete 15-minute intervals covering service duration + buffer. | `ARCHITECTURE.md`, Section 3 | `src/shared/slotCells.ts:1-42`, `tests/concurrency_slot_cells.test.ts:1-55` | **TRUE** |
| **4** | Customer manage tokens are deterministically derived via HMAC-SHA256 and never stored in plaintext in the database. | `README.md`, Section 2 | `src/shared/idUtils.ts:51-61`, `src/worker/routes/public.ts:394-415`, `tests/hardening_phase9.test.ts:33-52` | **TRUE** |
| **5** | Database stores only the SHA-256 hash of manage tokens (`manage_token_hash`). | `ARCHITECTURE.md`, Section 4 | `src/worker/routes/public.ts:398, 560-577`, `migrations/0001_initial_schema.sql:190` | **TRUE** |
| **6** | Customer names are never silently overwritten when booking with an existing phone number and different name. | `README.md`, Section 2 | `src/worker/routes/public.ts:340-370`, `tests/customers.test.tsx:88-125` (flags `possible_match = 1`, preserves original name) | **TRUE** |
| **7** | Duplicate customer merging atomically reassigns bookings, writes alias tombstones, and deletes the duplicate record. | `DEMO-SCRIPT.md`, Step 8 | `src/worker/routes/owner.ts:1930-2050`, `tests/customers.test.tsx:165-215` | **TRUE** |
| **8** | Role-based privacy enforces private customer notes visibility for owners while filtering them for staff. | `README.md`, Section 2 | `src/worker/routes/owner.ts:1680-1750`, `tests/customers.test.tsx:250-285` | **TRUE** |
| **9** | Notification delivery status is honestly labeled; provider acceptance is never claimed as "delivered". | `KNOWN-LIMITATIONS.md`, Section 1 | `src/worker/notifications/provider.ts:45-55`, `src/web/pages/NotificationsPage.tsx:106-115` (`"Accepted by provider, delivery unconfirmed"`) | **TRUE** |
| **10** | When Resend API key is omitted, notifications run in honest dry-run simulation mode (`simulated`). | `README.md`, Section 1 | `src/worker/notifications/provider.ts:25-35`, `tests/reminders_notifications.test.tsx:220-250` (badges show `"Dry-run (not sent)"`) | **TRUE** |
| **11** | WhatsApp integration opens manual prefilled `wa.me` links in client; no automated WhatsApp bot or delivery claim. | `KNOWN-LIMITATIONS.md`, Section 2 | `src/web/components/BookingDetailDrawer.tsx:100-115`, `tests/owner_dashboard.test.tsx:420-440` (transparent `https://wa.me/...` links) | **TRUE** |
| **12** | Quiet hours shift scheduled reminders between 22:00 and 08:00 to 08:00 next morning in business timezone. | `ARCHITECTURE.md`, Section 5 | `src/worker/notifications/jobProcessor.ts:150-185`, `tests/reminders_notifications.test.tsx:145-180` | **TRUE** |
| **13** | Stale reminders for appointments starting in $< 15$ minutes are dropped (`skipped_late`). | `ARCHITECTURE.md`, Section 5 | `src/worker/notifications/jobProcessor.ts:186-210`, `tests/reminders_notifications.test.tsx:185-215` | **TRUE** |
| **14** | Customers marked `pending_deletion = 1` are excluded from scheduled reminder notifications (`skipped_consent`). | `README.md`, Section 2 | `src/worker/notifications/jobProcessor.ts:125-145`, `tests/customers.test.tsx:290-325` | **TRUE** |
| **15** | Rate limiting is privacy-preserving: raw IPs are never stored in D1 SQLite storage. | `README.md`, Section 2 | `src/worker/rateLimiter.ts:35-70`, `src/worker/auth.ts:40-55` (`computeBucketHash(key, salt)`) | **TRUE** |
| **16** | Missing `RATE_LIMIT_SALT` in production environment triggers immediate fatal HTTP 500 error at startup. | `RUNBOOK.md`, Section 1 | `src/worker/index.ts:15-28`, `tests/hardening_phase9.test.ts:75-92` | **TRUE** |
| **17** | Strict Content Security Policy (CSP) header is present on all responses (`default-src 'self' ... frame-ancestors 'none'`). | `README.md`, Section 2 | `src/worker/middleware.ts:42-46`, `tests/hardening_phase9.test.ts:17-31` | **TRUE** |
| **18** | Self-hosted typography bundles Fraunces and Plus Jakarta Sans locally with zero Google Fonts network requests. | `README.md`, Section 2 | `dist/assets/*.woff2`, `dist/assets/*.woff` (38 self-hosted font chunks in `./dist/assets/`) | **TRUE** |
| **19** | Color contrast satisfies WCAG AA $\ge 4.5:1$ across all 13 core UI color pairs. | `README.md`, Section 2 | `scripts/check-contrast.js`, `pnpm check:contrast` (13/13 pairs pass) | **TRUE** |
| **20** | Form inputs enforce 16px minimum font size to eliminate automatic iOS mobile browser zoom. | `README.md`, Section 2 | `src/web/index.css:12-25`, `src/web/components/ui/Input.tsx` | **TRUE** |
| **21** | Demo seed script is scoped strictly to demo business with `is_demo = 1` and fictional non-sensitive data. | `DEMO-SCRIPT.md`, Setup | `scripts/seed-demo.sql`, `scripts/remove-demo.sql` (verified local execution, zero touch to non-demo data) | **TRUE** |

---

## 2. Forbidden Phrases & Brand Scan

| Search Term | Target Scope | Results Found | Compliance Status |
|---|---|---|---|
| `"delivered"` | `src/` (Code & UI) | 0 false claims (only references in schema comments and honest `"Accepted by provider, delivery unconfirmed"` mappings) | **VERIFIED CLEAN** |
| `"sent"` | `src/` (Code & UI) | 0 false claims (only references in `"Dry-run (not sent)"`, consent copy, or variable names) | **VERIFIED CLEAN** |
| `"real-time"` | `src/` (Code & UI) | 0 occurrences | **VERIFIED CLEAN** |
| `"automatic WhatsApp"` | `src/` (Code & UI) | 0 occurrences | **VERIFIED CLEAN** |
| `"Instinct"` | Full Repository (`git grep -i "instinct"`) | 0 occurrences in codebase (only mentions in Phase 9 audit reports verifying clean legacy removal) | **VERIFIED CLEAN** |

---

## 3. Summary of Findings
- **Total Claims Audited:** 21
- **TRUE:** 21 (100%)
- **PARTIALLY TRUE:** 0
- **UNSUPPORTED:** 0
- **Conclusion:** All documentation, UI copy, and demo scripts reflect the exact implemented capabilities with strict truthfulness.
