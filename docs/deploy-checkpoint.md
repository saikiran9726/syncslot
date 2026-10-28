# SlotSync — Deployment & Rollback Runbook (Checkpoint D)

**Created:** Checkpoint D (Phase 4 Verification)  
**Target Platform:** Single Cloudflare Worker + Static Assets + Cloudflare D1 + Cron Triggers  
**Execution State:** LOCAL CHECKS COMPLETE; REMOTE NOT EXECUTED (Authorization: `DEPLOY_AUTHORIZED = NO`)

---

## 1. Required Secrets & Environment Variables

Secrets must **NEVER** be committed to git or stored in plaintext files. Configure them using `wrangler secret put <NAME>`:

| Secret / Var Name | Type | Purpose | Mandatory For Startup? |
| :--- | :--- | :--- | :--- |
| `SESSION_SECRET` | Cloudflare Worker Secret | Cryptographic key for session token signing and verification | **YES** |
| `RATE_LIMIT_SALT` | Cloudflare Worker Secret | Cryptographic HMAC salt for privacy-preserving IP rate limiting | **YES** |
| `RESEND_API_KEY` | Cloudflare Worker Secret | Resend email delivery API key (falls back to honest dry-run if omitted) | No (dry-run supported) |
| `ENVIRONMENT` | wrangler.jsonc Var | Environment identifier (`production` or `development`) | Configured in wrangler |
| `APP_BASE_URL` | wrangler.jsonc Var | Public application origin URL (e.g. `https://syncslot.dev`) | Configured in wrangler |
| `COOKIE_NAME` | wrangler.jsonc Var | Session cookie name (`slotsync_session`) | Configured in wrangler |
| `EMAIL_FROM` | wrangler.jsonc Var | Default email sender header | Configured in wrangler |

---

## 2. Order of Operations for Remote Deployment

When deployment authorization is granted (`DEPLOY_AUTHORIZED = YES`), execute the following sequential steps:

### Step 1: Pre-flight & Account Verification
Confirm authentication and target Cloudflare account:
```bash
wrangler whoami
```

### Step 2: Provision Remote D1 Database
Confirm database existence or create target D1 database:
```bash
# Check if database already exists
wrangler d1 list

# If not created and CREATE_D1_AUTHORIZED = YES:
wrangler d1 create syncslot-db
```
Copy the returned `database_id` into `wrangler.jsonc` under `d1_databases[0].database_id`.

### Step 3: Configure Required Secrets
Confirm that required secrets are set by name:
```bash
wrangler secret list

# Set any missing secret (never print secret values)
wrangler secret put SESSION_SECRET
wrangler secret put RATE_LIMIT_SALT
```

### Step 4: Record Time Travel Restore Point & Apply Migrations
Record the current UTC timestamp as a disaster recovery restore point:
```bash
# Note current UTC timestamp (e.g., 2026-10-28T21:00:00Z)
wrangler d1 migrations list DB --remote

# Apply migrations
wrangler d1 migrations apply DB --remote
```

### Step 5: Build Production Frontend Assets
Compile React SPA static assets into `./dist`:
```bash
pnpm build
```

### Step 6: Deploy Single Worker
Deploy Worker script and static assets:
```bash
wrangler deploy
```

### Step 7: Live Remote Smoke Test
Execute smoke tests against the deployed URL using a dedicated, clearly labeled test tenant (`chkpt-d-remote-test`):
1. `GET /api/health` -> 200 OK
2. `GET /` and `/b/chkpt-d-remote-test` -> 200 OK (SPA HTML fallback)
3. `GET /api/unknown-endpoint` -> 404 JSON
4. Register test owner -> 201 Created
5. Publish business -> 200 OK
6. Query availability -> 200 OK with available slots
7. Book appointment -> 201 Created, slot occupied
8. Duplicate booking attempt on same slot -> 409 `slot_taken`
9. Cancel appointment via manage link -> 200 OK, slot freed and restored

---

## 3. Rollback Procedures

If an issue arises after a remote deployment, follow the corresponding rollback procedure:

### 3.1 Code Rollback
- **Subsequent Deployments:** Roll back to the previous deployment version:
  ```bash
  wrangler rollback
  ```
- **Alternative:** Check out the previous verified git release tag (e.g., `git checkout phase-4`) and redeploy:
  ```bash
  pnpm build && wrangler deploy
  ```
- **First Deployment:** If no previous Worker deployment exists, disable public traffic by deploying a minimal maintenance Worker or disabling routes in Cloudflare Dashboard.

### 3.2 Data Rollback (D1 Time Travel)
SlotSync schema migrations are strictly **additive** (no destructive column drops or data rewrites). If database corruption or bad migrations occur, restore using Cloudflare D1 Time Travel:
```bash
# Check available time-travel restore points
wrangler d1 time-travel info syncslot-db

# Restore to the recorded pre-migration restore point timestamp
wrangler d1 time-travel restore syncslot-db --timestamp="<RESTORE_POINT_TIMESTAMP>"
```
*(Reference: Official Cloudflare D1 Time Travel documentation).*

### 3.3 Cron Trigger Deactivation
If a background scheduled job misbehaves:
1. Temporarily remove the `"triggers"` block from `wrangler.jsonc`:
   ```jsonc
   // "triggers": { "crons": ["*/5 * * * *"] }
   ```
2. Redeploy the Worker:
   ```bash
   wrangler deploy
   ```
This immediately unregisters the Cron Trigger without modifying the application code.

### 3.4 Secret Rotation
If any secret is compromised:
1. Generate a new high-entropy random value.
2. Immediately overwrite the secret:
   ```bash
   wrangler secret put <SECRET_NAME>
   ```
3. Never reuse leaked or expired secrets.
