# 07 — Environment Variables & Secrets Specification

**Project:** SlotSync  
**Status:** COMPLETE (PHASE 1)  
**Security Principle:** Zero secrets in client-side code, git repositories, or logs.

---

## 1. Environment Variables Registry

| Variable Name | Classification | Storage Location (Dev) | Storage Location (Prod) | Default / Example Value | Behavior When Missing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | Configuration | `wrangler.jsonc` `vars` | `wrangler.jsonc` `vars` | `"development"` / `"production"` | Defaults to `"development"`. Enables verbose error details and relaxes cookie `Secure` flag for HTTP localhost. |
| `APP_BASE_URL` | Configuration | `wrangler.jsonc` `vars` | `wrangler.jsonc` `vars` | `"http://localhost:8787"` / `"https://slotsync.dev"` | Defaults to `http://localhost:8787`. Used for CSRF Origin validation and constructing email links. |
| `COOKIE_NAME` | Configuration | `wrangler.jsonc` `vars` | `wrangler.jsonc` `vars` | `"slotsync_session"` | Defaults to `"slotsync_session"`. Identifies the HttpOnly session cookie. |
| `EMAIL_FROM` | Configuration | `wrangler.jsonc` `vars` | `wrangler.jsonc` `vars` | `"SlotSync <appointments@slotsync.dev>"` | Defaults to `"SlotSync <onboarding@resend.dev>"`. Displayed as the sender in outgoing emails. |
| `SESSION_SECRET` | **Secret** | `.dev.vars` (Gitignored) | `wrangler secret put SESSION_SECRET` | 32-byte high-entropy string | Uses fallback dev secret in development with warning; rejects startup in production. |
| `RATE_LIMIT_SALT` | **Secret** | `.dev.vars` (Gitignored) | `wrangler secret put RATE_LIMIT_SALT` | 32-byte cryptographic salt | Uses dev salt in development; required in production to hash IPs into privacy-safe HMAC buckets. |
| `RESEND_API_KEY` | **Secret** | `.dev.vars` (Gitignored) | `wrangler secret put RESEND_API_KEY` | `re_123456789...` | **Graceful Sandbox Fallback:** If missing, system automatically operates in **Labelled Sandbox Mode**. Outbox records status as `simulated`, renders visible UI badge, and enables manual WhatsApp fallback (`wa.me`). Zero crashes. |

---

## 2. Local Development Secret Template (`.dev.vars.example`)

Developers can copy this template to `.dev.vars` for local execution:

```ini
# .dev.vars (DO NOT COMMIT - Verified Gitignored)
ENVIRONMENT=development
APP_BASE_URL=http://localhost:8787
COOKIE_NAME=slotsync_session
EMAIL_FROM=SlotSync <onboarding@resend.dev>
SESSION_SECRET=dev_session_secret_min_32_characters_long_12345
RATE_LIMIT_SALT=dev_rate_limit_salt_min_32_chars_12345
# Optional: supply your Resend key for live email testing, or leave blank for Simulated Sandbox Mode
RESEND_API_KEY=
```

---

## 3. Production Provisioning Instructions

When deploying to Cloudflare in Phase 12:

```bash
# Set secrets securely in Cloudflare Workers environment
npx wrangler secret put SESSION_SECRET
npx wrangler secret put RATE_LIMIT_SALT
npx wrangler secret put RESEND_API_KEY
```
