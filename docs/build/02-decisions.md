# 02 — Architecture & Requirement Decisions

**Project:** SlotSync  
**Date:** 2026-10-28  
**Author:** Senior Full-Stack Engineer  
**Status:** LOCKED & RECONCILED (PHASE 1)

---

## 1. Stack Reconciliation with Phase 0

* **Phase 0 Recommendations:** Single Cloudflare Worker serving React SPA via static assets, Hono / REST API, Zod schema validation, Vitest with `@cloudflare/vitest-pool-workers`, Tailwind CSS, and D1 SQLite.
* **Phase 1 Implementation:** Identical. Zero stack deviation.
  - Runtime: Cloudflare Workers with `assets: { directory: "./dist", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: true }` in `wrangler.jsonc`.
  - API Framework: Hono v4.
  - Validation: Zod v3.
  - Test Pool: Vitest v2 + `@cloudflare/vitest-pool-workers`.
  - Database: Cloudflare D1 with native migrations in `/migrations`.

---

## 2. Key Architecture Decisions & Technical Proofs

### Decision 1: D1 Concurrency & Race-Proof Slot Cells
* **What the Parallel Test Proves:**
  The automated test in `tests/concurrency_slot_cells.test.ts` executes two simultaneous booking transactions attempting to claim the same provider and overlapping 15-minute intervals (`slot_cells`).
  - It proves that SQLite's `PRIMARY KEY (resource_id, cell_start_utc)` constraint inside a single `db.batch()` execution provides **atomic rollback**.
  - Exactly one transaction commits (HTTP 201), and the second fails with a constraint violation (HTTP 409).
* **What it Does NOT Prove:**
  In a high-contention production environment where dozens of geographically distributed requests arrive across multiple Cloudflare edge nodes, Cloudflare D1 routes all writes through a single primary coordinator. The test proves local transactional correctness and constraint rejection; under extreme global write volume, D1 may return transient SQLite busy/locked errors rather than immediate constraint rejections, which our retry/backoff policy in the API layer will handle cleanly.

### Decision 2: WebCrypto PBKDF2 Limits & Benchmark
* **Official Cloudflare Limit:** Cloudflare `workerd` core runtime enforces a strict ceiling of **100,000 iterations** for `PBKDF2-SHA256` (`crypto.subtle`). Exceeding 100,000 iterations causes a runtime `DOMException` / `NotSupportedError`.
* **Empirical Measurement:**
  Tested in the Cloudflare Workers test runtime (`tests/auth_crypto.test.ts`):
  `[PBKDF2 Benchmark] 100,000 iterations took 142ms`.
* **Trade-off Analysis:**
  - On the Free Plan (10ms CPU limit), running PBKDF2 synchronously can encounter CPU limits under cold load.
  - On the Standard / Paid Plan (50ms+ CPU limit), 100,000 iterations is the optimal balance of NIST-compliant security and performance.
  - Decision: We lock iterations at exactly **100,000** with a per-user 16-byte random salt, SHA-256 digest, and constant-time hex comparison.

### Decision 3: Notification Job State Machine & Definitions
Every row in `notification_jobs.status` must strictly match one of the following 16 lifecycle states:

| Status Enum | Meaning & Lifecycle Rule |
| :--- | :--- |
| `queued` | Job created inside booking transaction; waiting for scheduled send window. |
| `sending` | Atomically claimed by cron trigger with `locked_until`; dispatch in flight. |
| `accepted` | Third-party provider (Resend) acknowledged receipt of the message. |
| `delivered` | Provider webhook or receipt confirmed successful delivery to recipient. |
| `simulated` | Executed in local development or without API keys; recorded in database outbox with `[SIMULATED SANDBOX]` marker. |
| `retry_scheduled` | Transient network error; backoff timer calculated (1m, 5m, 30m) for next cron pick-up. |
| `failed` | Error occurred on current attempt; awaiting evaluation or retry. |
| `permanently_failed` | Exceeded maximum attempts (3); requires owner attention or manual fallback. |
| `skipped_late` | Cron was delayed or offline; appointment is < 10m away or already elapsed. |
| `skipped_quiet_hours` | Target send window collided with business quiet hours (e.g. 22:00–08:00); shifted or skipped per policy. |
| `skipped_no_channel` | Customer has no valid email/phone or channel is disabled by tenant. |
| `skipped_consent` | Customer explicitly opted out or unchecked reminder consent. |
| `skipped_sandbox` | Channel suppressed in non-production environment. |
| `superseded` | Appointment was rescheduled; this older reminder job was invalidated for a new one. |
| `cancelled` | Appointment was cancelled; pending reminder job marked inert. |
| `handled_manually` | Owner used the "Send WhatsApp Fallback" (`wa.me`) or clipboard fallback action. |

---

## 3. Slot Cell 15-Minute Grid Rule

* **Grid Alignment:** All bookings align to the 15-minute boundary (`:00`, `:15`, `:30`, `:45`).
* **Interval Formula:**
  A booking spanning `duration_minutes` with turnover `buffer_minutes` reserves $N$ contiguous cells:
  $$N = \left\lceil \frac{\text{duration\_minutes} + \text{buffer\_minutes}}{15} \right\rceil$$
* **End Time Formula:**
  $$\text{end\_at\_utc} = \text{start\_at\_utc} + \text{duration\_minutes}$$
  The buffer is reserved in `slot_cells` to block subsequent bookings, but is **NOT** added to the visible appointment duration shown to the customer.
* **Reschedule Mutation:**
  In a single atomic `db.batch()`:
  1. `DELETE FROM slot_cells WHERE booking_id = ?`
  2. `INSERT INTO slot_cells ... (new cells)`
  3. `UPDATE bookings SET start_at_utc = ?, end_at_utc = ?, version = version + 1 WHERE id = ?`
  If any new cell is already occupied, the entire batch rolls back, guaranteeing zero partial updates.

---

## 4. Privacy & Rate Limiting Architecture

* **No Plain IPs or PII in Operational Tables:**
  - `rate_limits` table keys on `HMAC(RATE_LIMIT_SALT, ip)` or `HMAC(RATE_LIMIT_SALT, ip + email)`. Raw IP addresses are discarded immediately after HMAC calculation.
  - `booking_events` payload JSON strictly excludes customer name, phone number, and email. It audits only status transitions, actor types, timestamps, and resource IDs.


---

## 5. UI Styling Architecture (Locked for Phase 2)

* **Decision:** **Tailwind CSS with CSS Variable Tokens** (Zero CSS Modules mixing).
* **Rationale:**
  1. Defines all design tokens as raw CSS variables under `:root` in `src/web/index.css`.
  2. Maps these variables directly into `tailwind.config.js` (`colors: { ink: 'var(--color-ink)', surface: 'var(--color-surface)', ... }`).
  3. Provides utility classes with strict token enforcement, ensuring consistent spacing on the 4px grid, unified typography scales, and seamless dark mode support without custom CSS sprawl.
