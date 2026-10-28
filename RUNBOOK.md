# SlotSync Production Runbook

## 1. Secrets & Environment Configuration (Names Only)

Before deploying to production, configure all necessary cryptographic secrets using `wrangler secret put`. **Never print, log, or commit secret values.**

```bash
# 1. Enforce privacy-preserving IP rate limiting (Required by production startup assertion)
npx wrangler secret put RATE_LIMIT_SALT

# 2. Session cookie signing secret (64+ character random string)
npx wrangler secret put SESSION_SECRET

# 3. Customer manage token HMAC secret (64+ character random string)
npx wrangler secret put TOKEN_SECRET

# 4. Optional: Resend API Key (Omit to operate in honest dry-run mode)
npx wrangler secret put RESEND_API_KEY
```

---

## 2. Remote Database Migration Runbook

All database schema updates are strictly additive and stored under `./migrations`.

### 1. Check Pending Migrations
```bash
npx wrangler d1 migrations list syncslot-db --remote
```

### 2. Record Pre-Migration Time Travel Point
Before applying any migration to production, record the current Time Travel bookmark:
```bash
npx wrangler d1 time-travel info syncslot-db
```

### 3. Apply Migrations
```bash
npx wrangler d1 migrations apply syncslot-db --remote
```

---

## 3. Production Deployment Runbook

### Prerequisites
1. Ensure git working tree is clean on the intended commit/tag:
   ```bash
   git status
   ```
2. Verify all tests, typechecks, and contrast audits pass:
   ```bash
   pnpm typecheck
   pnpm test
   pnpm check:contrast
   ```

### Deployment Steps
```bash
# 1. Build the frontend production bundle into ./dist
pnpm build

# 2. Deploy the Worker and static assets to Cloudflare
npx wrangler deploy
```

---

## 4. Verification & Health Monitoring

### Health Endpoint
```bash
curl -i https://<worker-name>.<subdomain>.workers.dev/api/health
```
Expected response: HTTP 200 with JSON:
```json
{
  "status": "ok",
  "service": "syncslot-api",
  "environment": "production",
  "timestamp": "2026-10-..."
}
```

### Notification Delivery Mode Banner
In the Owner Command Center (`/app/notifications`), inspect the top delivery mode banner:
- **`[Real Delivery Mode]`**: Active when `RESEND_API_KEY` is present and sandbox mode is disabled.
- **`[Sandbox Mode]`**: Active when `RESEND_API_KEY` is present and a `sandbox_recipient_email` is configured in preferences.
- **`[Dry-run Mode]`**: Active when `RESEND_API_KEY` is absent. Notice jobs are simulated locally without external calls.

### Cron Execution Monitoring
To observe cron trigger background execution in real time:
```bash
npx wrangler tail --format=pretty
```
Filter logs for `[Cron Trigger]` and verify batch counts.

---

## 5. Rollback & Emergency Procedures

### 1. Worker Rollback (Code Reversion)
To revert the Worker code and static assets to a previous deployment:
```bash
# List recent deployments to find target version ID
npx wrangler deployments list

# Roll back to target version
npx wrangler rollback <target-deployment-id>
```

### 2. D1 Database Time Travel Restore (Data Recovery)
If a critical data corruption occurs, restore the database to a known good timestamp:
```bash
npx wrangler d1 time-travel restore syncslot-db --timestamp="2026-10-28T22:00:00Z"
```

### 3. Emergency Cron Pause (Stop Background Reminders)
To immediately stop background reminder processing:
1. In `wrangler.jsonc`, comment out or delete the `crons` array:
   ```jsonc
   // "triggers": {
   //   "crons": ["*/5 * * * *"]
   // }
   ```
2. Redeploy the Worker:
   ```bash
   npx wrangler deploy
   ```
3. Once the issue is resolved, restore the `crons` configuration and redeploy.
