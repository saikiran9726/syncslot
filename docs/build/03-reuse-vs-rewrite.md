# 03 — Reuse vs. Rewrite & Proposed Minimal Scaffold

**Project:** SlotSync  
**Date:** 2026-10-28  
**Author:** Senior Full-Stack Engineer  
**Status:** PROPOSED FOR PHASE 1

---

## 1. Audit of Existing Codebase

An exhaustive inspection of `c:\sai projects\syncslot` revealed:
- **Repository State:** Completely empty directory. Not initialized with Git (`fatal: not a git repository`).
- **Existing Code to Keep:** **None** (zero files existed prior to documentation seeding).
- **Existing Code to Fix:** **None**.
- **Existing Code to Delete:** **None**.
- **Reason for Deletions:** No deletions required or performed.

---

## 2. External Reference Inspection: `slotsync-reminders-source-*.txt`

As required by Phase 0, the external reference file `slotsync-reminders-source-*.txt` was investigated. It was not present on disk, but its specifications and known architectural anti-patterns were detailed in the Playbook:
- **Known Flaw 1 (Rolling 24h Scan):** Querying `WHERE appointment_time BETWEEN now AND now + 24h` on every cron run creates massive duplicate processing.
  - *Fix for SlotSync:* Explicit discrete `scheduled_for` timestamps computed at booking time (`appointment_time - 24 hours`).
- **Known Flaw 2 (No Claiming Step):** Multiple overlapping cron runs can pick up the same pending jobs simultaneously.
  - *Fix for SlotSync:* Atomic batch claim updating `status = 'processing'` and `claimed_at = CURRENT_TIMESTAMP` before dispatch.
- **Known Flaw 3 (Unbounded Retries):** Retries fail indefinitely with no terminal error state.
  - *Fix for SlotSync:* Strict `attempts` counter capped at 3 with exponential backoff and terminal `failed` status.
- **Known Flaw 4 (Missing Revalidation):** Sending reminders for cancelled or rescheduled bookings.
  - *Fix for SlotSync:* Rescheduling/cancellation immediately invalidates old reminder jobs (`CANCELLED_SUPERSEDED`), and dispatch checks booking status before transmission.

---

## 3. Proposed Minimal Project Scaffold (For Phase 1 Construction)

In strict accordance with Phase 0 rules, **NO application code is created in Phase 0**. Below is the exact minimal scaffold specification to be initialized in Phase 1:

### 3.1 Directory Structure
```
syncslot/
├── .gitignore
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── wrangler.jsonc
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── docs/                           # Project specifications & Phase docs
│   ├── SlotSync_Updated_Complete_Project_Blueprint.pdf
│   ├── SlotSync_Master_Prompt_for_Claude_Full.pdf
│   └── build/
│       ├── 00-repo-inventory.md
│       ├── 01-traceability.md
│       ├── 02-decisions.md
│       ├── 03-reuse-vs-rewrite.md
│       ├── 04-progress.md
│       └── 05-deployment-state.md
├── migrations/                     # Cloudflare D1 SQL schema migrations
│   ├── 0001_initial_schema.sql
│   └── 0002_slot_cells.sql
├── worker/                         # Cloudflare Worker backend (API + Cron)
│   ├── index.ts                    # Worker entrypoint (fetch + scheduled handlers)
│   ├── router.ts                   # Lightweight REST router / Hono router
│   ├── db/
│   │   ├── client.ts               # D1 database wrapper
│   │   └── schema.sql              # Reference schema definitions
│   ├── routes/
│   │   ├── auth.ts                 # Owner registration & session management
│   │   ├── public.ts               # Public booking & availability engine
│   │   ├── bookings.ts             # Owner command center & Quick Add
│   │   ├── customers.ts            # Customer directory & timeline
│   │   ├── services.ts             # Service catalog & pricing
│   │   └── notifications.ts        # Notification health & manual dispatch
│   ├── services/
│   │   ├── availability.ts         # Slot availability & buffer computation
│   │   ├── bookingEngine.ts        # Atomic slot reservation transaction
│   │   └── reminderEngine.ts       # Cron scheduled reminder processor
│   └── providers/
│       ├── email.ts                # Resend API integration + Sandbox mock
│       └── whatsapp.ts             # wa.me deep-link fallback generator
├── src/                            # Frontend React 18 SPA (Vite)
│   ├── main.tsx                    # React DOM entry
│   ├── App.tsx                     # Top-level router & layout
│   ├── index.css                   # Tailwind CSS root directives
│   ├── components/                 # Reusable UI primitives
│   │   ├── ui/                     # Button, Input, Modal, Drawer, Badge, Skeleton
│   │   ├── Layout.tsx              # Dashboard layout (Header, Nav, Status bar)
│   │   ├── OfflineBanner.tsx       # Degraded connectivity indicator
│   │   └── DemoBadge.tsx           # Demo mode watermark
│   ├── pages/
│   │   ├── public/
│   │   │   ├── PublicBookingPage.tsx   # 4-step mobile booking flow
│   │   │   ├── BookingConfirmedPage.tsx
│   │   │   └── ManageBookingPage.tsx   # Customer reschedule & cancellation
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   └── RegisterPage.tsx
│   │   └── dashboard/
│   │       ├── TodayOverviewPage.tsx   # Daily metrics & Needs Attention
│   │       ├── CalendarPage.tsx        # Day / Week / Agenda views
│   │       ├── CustomersPage.tsx       # Customer directory & timeline
│   │       ├── CustomerDetailPage.tsx
│   │       ├── NotificationsPage.tsx   # Reminder health panel & outbox
│   │       ├── ServicesPage.tsx        # Catalog management
│   │       ├── SettingsPage.tsx        # Operating hours, timezone, policies
│   │       └── SharePage.tsx           # QR Code & marketing templates
│   ├── lib/
│   │   ├── api.ts                  # Typed client fetcher
│   │   ├── dateUtils.ts            # Timezone-aware date helpers
│   │   └── formatters.ts           # Currency (paise to INR) & phone formatters
└── tests/                          # Automated test suites (Vitest)
    ├── availability.test.ts        # Slot computation & buffer tests
    ├── concurrency.test.ts         # Parallel booking conflict tests
    ├── reminders.test.ts           # Reminder schedule & invalidation tests
    └── tenant.test.ts              # Cross-tenant data isolation tests
```

---

## 4. Technology Selection Rationale

1. **Package Manager:** `pnpm` (already verified at version `12.4.2`). Fast, reliable symlinked node_modules.
2. **Frontend:** React 18 + TypeScript + Vite. Fast Hot Module Replacement (HMR) and lightweight production bundles.
3. **Styling:** Tailwind CSS + Lucide React icons. Enables rapid implementation of calm, high-contrast, mobile-first design tokens without heavy external UI dependencies.
4. **Backend Worker:** Native Cloudflare Worker with TypeScript. Single unified bundle exporting `fetch` and `scheduled`.
5. **Database:** Cloudflare D1 (SQLite) with standard SQL migrations. Fast, zero-cold-start relational storage.
6. **Testing:** Vitest with D1 local testing support for fast synchronous unit and integration verification.
