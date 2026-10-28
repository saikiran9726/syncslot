# SlotSync

> High-reliability appointment booking and customer management SaaS for local service businesses.

Built on Cloudflare Workers and Cloudflare D1 with strict concurrency collision prevention, deterministic customer manage tokens, privacy-preserving rate limiting, and an honest notification pipeline.

---

## 1. Stack & Architecture

- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide icons, Vite.
- **Backend / API:** ONE Cloudflare Worker running Hono and Zod.
- **Static Assets:** Bundled into `./dist` and served directly by the Cloudflare Worker via Cloudflare Worker Static Assets (`ASSETS` binding).
- **Database:** Cloudflare D1 (serverless SQLite at the edge) with 25 tables and additive migrations.
- **Background Tasks:** Cloudflare Cron Triggers (`*/5 * * * *`) invoking the Worker scheduled handler for appointment reminders and lease recovery.
- **Notifications:** Resend REST API client with automatic, honest dry-run fallback (`simulated`), customer opt-out, and prefilled manual WhatsApp links (`wa.me`). Zero automated delivery claims without external provider receipts.

---

## 2. Key Capabilities

1. **Race-Proof Slot Reservation:** Discrete 15-minute intervals tracked in `slot_cells` with a `UNIQUE(resource_id, cell_start_utc)` constraint inside atomic D1 transactions. Guarantees that under high parallel load (e.g. 20 concurrent requests for the exact same slot), exactly one booking succeeds and conflicting requests receive HTTP 409 with alternative slots.
2. **Deterministic Customer Manage Tokens:** Derived via WebCrypto `HMAC-SHA256(TOKEN_SECRET, business_id + ':' + booking_id)` and stored exclusively as SHA-256 hashes. Allows customers to inspect, reschedule, or cancel appointments without storing plaintext tokens in database idempotency caches.
3. **Owner Command Center:** Dynamic Today metrics computed in the business's timezone, countdown to next up appointment, agenda/day calendar view, searchable booking directory, and owner Quick Add with slot collision defense.
4. **Customer Relationship Directory:** Safe phone matching that preserves customer names when shared phone numbers are used, duplicate customer merging with tombstone aliases, repeat appointment "Book Again", and role-based notes privacy.
5. **Privacy-Preserving Rate Limiting:** All rate limiting buckets are hashed with `RATE_LIMIT_SALT` (`computeBucketHash(key, salt)`). Raw client IP addresses are never persisted in the database.
6. **WCAG AA Compliance:** Strict 4.5:1 contrast verified across all 13 core color tokens, visible focus rings, 16px form input font size to eliminate iOS auto-zoom, and fully self-hosted typography (`@fontsource/fraunces` and `@fontsource/plus-jakarta-sans`).

---

## 3. Environment Variables & Secrets (Names Only)

Credentials and configuration parameters are configured in `wrangler.jsonc` (for non-sensitive vars) and Cloudflare Worker secrets (for cryptographic keys):

| Name | Type | Purpose |
|---|---|---|
| `ENVIRONMENT` | Var | Runtime environment (`development`, `test`, `production`). |
| `APP_BASE_URL` | Var | Canonical base URL used for origin checks and link generation. |
| `COOKIE_NAME` | Var | Session cookie name (default: `slotsync_session`). |
| `EMAIL_FROM` | Var | Sender address for transactional emails (e.g. `SlotSync <appointments@slotsync.dev>`). |
| `SESSION_SECRET` | Secret | Cryptographic key (64+ chars) used for signing owner session cookies. |
| `TOKEN_SECRET` | Secret | HMAC secret for deriving deterministic customer manage tokens. |
| `RATE_LIMIT_SALT` | Secret | Cryptographic salt for privacy-preserving rate limit bucket hashing. |
| `RESEND_API_KEY` | Secret | Optional Resend API key. When omitted, system operates in honest dry-run mode (`simulated`). |

---

## 4. Local Development & Setup

### Prerequisites
- Node.js `v20.19.0+`
- `pnpm` package manager (`v9+` or `v12+`)

### Install Dependencies
```bash
pnpm install
```

### Local Database Migrations
Apply additive migrations to the local D1 SQLite database:
```bash
npx wrangler d1 migrations apply syncslot-db --local
```

### Seed Demo Data (Optional)
To populate an isolated, clearly labeled demo business (`Luxe Studio Salon (Demo)`, slug: `luxe-demo-salon`, `is_demo = 1`):
```bash
npx wrangler d1 execute syncslot-db --local --file=./scripts/seed-demo.sql
```

To remove only demo records without affecting other data:
```bash
npx wrangler d1 execute syncslot-db --local --file=./scripts/remove-demo.sql
```

### Run Tests
```bash
# Run all automated tests (18 test suites, 116 tests)
pnpm test

# Run 20-way parallel race condition concurrency test
npx vitest run tests/concurrency_20.test.ts

# Verify WCAG AA color contrast ratios
pnpm check:contrast

# Run TypeScript typechecker
pnpm typecheck
```

### Build Production Bundle
```bash
pnpm build
```

---

## 5. Security & Truth Invariants

- **No False Delivery Claims:** Without external webhook confirmation receipts, notification statuses are honestly labeled as `"Accepted by provider, delivery unconfirmed"`, `"Dry-run (not sent)"`, or `"Skipped: <reason>"`.
- **Manual WhatsApp Links Only:** WhatsApp interactions are prefilled `https://wa.me/<phone>?text=...` links that open in the user's browser or WhatsApp client. There is no automated WhatsApp bot or background messaging API.
- **Local Isolation:** Remote D1 migrations and deployments are only executed when explicitly authorized. All development, testing, and demo seeding are strictly scoped locally.
