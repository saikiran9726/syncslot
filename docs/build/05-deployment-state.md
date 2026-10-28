# 05 — Cloudflare Deployment & Infrastructure State

**Project:** SlotSync  
**Verification Date:** 2026-10-28 18:55 IST  
**Environment Audited:** Host System Local CLI & Cloudflare Tooling  
**Author:** Senior Full-Stack Engineer

---

## 1. Cloudflare Environment Verification Results

Every statement below was verified via actual CLI command execution:

| Verification Item | Command Executed | Result / Output | Documented State |
| :--- | :--- | :--- | :--- |
| **Wrangler CLI Installation** | `npx wrangler -v` | `4.86.0` | **INSTALLED / VERIFIED** (via npx) |
| **Cloudflare Authentication** | `npx wrangler whoami` | `You are not authenticated. Please run wrangler login.` | **UNAUTHENTICATED** |
| **Cloudflare Account ID** | `npx wrangler whoami` | N/A | **UNKNOWN** |
| **Cloudflare Project Name** | Inspect directory | No `wrangler.jsonc` or `wrangler.toml` exists | **UNKNOWN** |
| **Cloudflare D1 Database (Remote)** | CLI query blocked by auth | N/A | **UNKNOWN** (Not provisioned remotely) |
| **Cloudflare D1 Database (Local)** | Inspect `.wrangler/` | No local `.wrangler/` state exists | **NOT PROVISIONED** |
| **Cloudflare Cron Trigger** | Inspect config | No worker config exists | **UNKNOWN** |
| **Deployed Production URL** | Domain inspection | No production deployment exists | **UNKNOWN** / **NOT DEPLOYED** |
| **Resend API Credentials** | Environment scan | No `.env` or `.dev.vars` exists | **NOT CONFIGURED** |

---

## 2. Infrastructure Bindings Target (For Phase 1 & Deployment)

The target architecture requires the following bindings to be configured in `wrangler.jsonc` when scaffolding begins:

### 2.1 Target D1 Database Binding
```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "slotsync-db",
    "database_id": "UNKNOWN" // To be populated upon `wrangler d1 create`
  }
]
```

### 2.2 Target Static Assets Binding
```jsonc
"assets": {
  "directory": "./dist",
  "binding": "ASSETS"
}
```

### 2.3 Target Cron Triggers (Reminder Engine)
```jsonc
"triggers": {
  "crons": ["*/5 * * * *"] // Process due reminder jobs every 5 minutes
}
```

### 2.4 Required Secrets / Environment Variables
- `RESEND_API_KEY`: Cloudflare Worker Secret (Optional: if omitted, application safely uses built-in **Labelled Sandbox Mode**).
- `RESEND_FROM_EMAIL`: Sender address (e.g. `appointments@slotsync.dev` or `onboarding@resend.dev`).
- `SESSION_SECRET`: Cryptographic secret for signing session cookies.

---

## 3. Operational Strategy for Unauthenticated Local Development

Because the host Wrangler CLI is currently unauthenticated:
1. **Local Development (Phases 1–11):** All development, database migrations, and testing will execute against **local SQLite / local D1 emulation** (`wrangler dev` local mode and Vitest in-memory/local SQLite). This requires zero Cloudflare account access and zero cloud spend.
2. **Production Deployment (Phase 12):** When remote deployment is requested, user will run `npx wrangler login` or provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
