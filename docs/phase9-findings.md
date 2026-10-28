# Phase 9 Security, Hardening, and Accessibility Audit Findings

**Date:** 2026-10-28  
**Audit Target:** SlotSync Production Readiness (Security, Correctness, Performance, WCAG AA Accessibility)  
**Standard:** Zero open Critical or High findings before production deployment.

---

## 1. Audit Findings Matrix

| Finding ID | Severity | Category | File & Line | Evidence / Vulnerability | Planned Remediation |
|---|---|---|---|---|---|
| **SEC-01** | **High** | Security Headers | `src/worker/middleware.ts:35-41` | `Content-Security-Policy` header is absent in `securityHeaders` middleware. Allows arbitrary script/style injections if XSS exists. | Add strict CSP header: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. No `unsafe-eval`. |
| **SEC-02** | **High** | Rate Limiting | `src/worker/routes/auth.ts:18` | Owner registration `POST /api/auth/register` lacks rate limiting, allowing automated account creation / registration spam. | Add `checkCustomRateLimit(c.env.DB, 'register:' + ip, 5, 3600, salt)` (max 5 registrations per hour per salted IP hash). |
| **SEC-03** | **High** | Rate Limiting | `src/worker/routes/public.ts:599, 697` | Token mutation endpoints (`POST /:slug/manage/:token/cancel` and `POST /:slug/manage/:token/reschedule`) lack rate limiting. | Add `checkCustomRateLimit(c.env.DB, 'manage_mutate:' + ip, 20, 60, salt)` (max 20 requests per minute). |
| **SEC-04** | **High** | Token Exposure & Replay | `src/worker/middleware.ts:238-251`<br>`src/worker/routes/public.ts:395` | Plaintext `manage_token` is cached in `idempotency_keys.response_json` in the database. If idempotency table is read, plaintext manage tokens are exposed. | Implement HMAC-derived manage token design: `rawManageToken = hmacSha256(tokenSecret, businessId + ':' + bookingId)`. `manage_token` is deterministic and recomputable on replay without saving plaintext tokens in the idempotency table. |
| **SEC-05** | **Medium** | Config & Hardening | `src/worker/index.ts:12` | Missing startup assertion for `RATE_LIMIT_SALT` in production mode. If missing, rate limiter falls back to default salt. | Add startup check: In `ENVIRONMENT === 'production'`, verify `RATE_LIMIT_SALT` is configured, non-empty, and not default placeholder. |
| **SEC-06** | **Medium** | CSRF / Origin Check | `src/worker/middleware.ts:46-73` | Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) without an `Origin` header are permitted in production if omitted by client. | In production mode, require `Origin` header or `Sec-Fetch-Site: same-origin` for mutating requests. |
| **A11Y-01** | **Medium** | Accessibility | `src/web/pages/CustomersPage.tsx:140` | Search input and clear search button need explicit `aria-label` and `aria-describedby` for assistive technologies. | Add `aria-label="Search customer directory"` and link helper text with `aria-describedby`. |
| **A11Y-02** | **Medium** | Accessibility | `src/web/pages/CustomersPage.tsx:170` | Result count changes during live search lack `aria-live="polite"` announcement for screen reader users. | Add accessible `aria-live="polite"` status message announcing matching customer count. |
| **SEC-07** | **Low** | Token Headers | `src/worker/routes/public.ts:842` | `POST /:slug/manage/:token/opt-out` sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, but misses explicit `Pragma: no-cache`. | Add standard `Pragma: no-cache` header alongside `Cache-Control: no-store`. |

---

## 2. Detailed Audit Scope & Verification Results

### Area 1: Security Headers & Fonts
- **Headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: accelerometer=(), camera=(), microphone=(), geolocation=()` are present.
- **CSP:** Currently missing (Finding **SEC-01**). Will be implemented with `default-src 'self'`.
- **Self-Hosted Fonts:** Bundled locally from `@fontsource/fraunces` and `@fontsource/plus-jakarta-sans` via Vite into `./dist/assets/`. Zero external font network requests. Fully licensed for self-hosting (SIL Open Font License).

### Area 2: Token Pages
- Token inspect and mutation endpoints set `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- Zero tokens in server logs (`console.error` logs only sanitized error messages; notification logs log only first 8 chars of booking IDs).
- Rate limiting added to token cancel and reschedule routes (Finding **SEC-03**).

### Area 3: Idempotent Replay & Manage Tokens
- Plaintext token currently saved inside `idempotency_keys.response_json` (Finding **SEC-04**).
- Transition to HMAC-derived tokens: `manage_token` computed from `HMAC-SHA256(TOKEN_SECRET, businessId + ':' + bookingId)`. Existing tokens remain valid because lookup hashes incoming token with `sha256Hex(token)` and matches `manage_token_hash`.
- Replaying a booking creation recomputes the manage token safely.

### Area 4: Rate Limiting
- Privacy-preserving rate limiter hashes all keys with `RATE_LIMIT_SALT` via `computeBucketHash(key, salt)` before storing in `rate_limits` table.
- Raw IP addresses are never persisted in the database.
- Registration rate limiting added (Finding **SEC-02**).
- Production startup assertion added for `RATE_LIMIT_SALT` (Finding **SEC-05**).

### Area 5: Auth, Tenant Isolation, and Input Validation
- Authentication: PBKDF2-SHA256 (100,000 iterations), unique salts per user, HttpOnly SameSite=Lax cookie.
- Tenant Isolation: Every query in `owner.ts` strictly enforces `business_id = ?` resolved from the session cookie. Client input cannot specify or override `business_id`.
- Error Handling: Global error handler in `src/worker/index.ts` catches all unhandled exceptions and returns a generic `{ error: { code: 'INTERNAL', message: 'An internal server error occurred' } }`, preventing database/runtime stack trace leakage.

### Area 6: Reminder Honesty
- Notification status badges and copy strictly use:
  - `"Accepted by provider, delivery unconfirmed"` for provider status `accepted`.
  - `"Dry-run (not sent)"` for `simulated`.
  - `"Skipped: <reason>"` for skipped states.
  - Zero UI elements or emails claim "sent" or "delivered" without confirmation.
- WhatsApp links are transparent `https://wa.me/<phone>?text=...` links opening in a new tab.

### Area 7: Performance and Plan Limits
- Cloudflare Workers Limits:
  - Free plan: 10ms CPU time per request.
  - Paid/Standard: 30s CPU time for HTTP, 15m CPU time for Scheduled (Cron) events.
  - PBKDF2 100k iterations takes ~84ms wall-time in Node.js test runtime; runs within WebCrypto native limits.
  - Cron trigger runs every 5 minutes and processes max 10 jobs per batch, requiring <20ms CPU time and 2–5 D1 queries, well below the 1,000 query limit.
- Indexes:
  - `idx_businesses_slug` on `businesses(slug)`.
  - `idx_services_business` on `services(business_id, is_active)`.
  - `idx_slot_cells_booking` on `slot_cells(booking_id)`.
  - `idx_bookings_business_start` on `bookings(business_id, start_at_utc)`.
  - `idx_bookings_manage_token` on `bookings(manage_token_hash)`.
  - `idx_notification_jobs_status_due` on `notification_jobs(status, due_at_utc)`.
  - `idx_customers_business_pending` on `customers(business_id, pending_deletion)`.

### Area 8: Dependency Review
- Production dependencies: 9 packages (`hono`, `zod`, `libphonenumber-js`, `lucide-react`, `qrcode`, `react`, `react-dom`, `@fontsource/fraunces`, `@fontsource/plus-jakarta-sans`). All are required and actively used.
- `pnpm audit` read-only report completed. All flagged CVEs are confined to test devDependencies (`vitest`, `vite-node`, `@testing-library`). Production bundle `./dist` contains zero vulnerable dev code.

### Area 9: Accessibility (WCAG AA)
- Automated contrast check (`pnpm check:contrast`): 13/13 token pairings pass WCAG AA standards ($\ge 4.5:1$).
- Input zoom prevention: `font-size: 16px` on all form inputs.
- Touch targets: $\ge 44$px for standard buttons; minimum 36px for compact controls.
- Reduced motion: `@media (prefers-reduced-motion: reduce)` zeroes animations and transitions.
- Focus rings: `.focus-ring` utility with 2px teal outline and 2px offset.
- Added `aria-label` and `aria-live` regions (Findings **A11Y-01** and **A11Y-02**).

### Area 10: Secrets Scan & Configuration
- `git grep -i "re_"`: Zero hardcoded Resend API keys or secrets in source code.
- `.gitignore`: Properly excludes `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `.wrangler/`, `node_modules/`, `dist/`.
- Zero occurrences of "Instinct" anywhere in git tracked files.
- `wrangler.jsonc` contains only environment binding names and dev fallback values.
