# Known Limitations & Design Boundaries

This document provides a transparent accounting of intentional design constraints, deferred features, and operational boundaries in SlotSync v1.0.

---

## 1. Notification Delivery Receipts & Webhooks
- **No Mailbox Delivery Proof:** When integrating with external email providers (e.g. Resend), an HTTP 200 response confirms that the provider accepted the email for transmission. It does **not** prove that the message was delivered to the recipient's inbox or opened.
- **Honest Status Labels:** SlotSync explicitly marks this state as `"Accepted by provider, delivery unconfirmed"` (status: `accepted`). The UI never claims `"delivered"`.
- **Deferred Webhooks:** Inbound webhook endpoints for bounce or delivery status are intentionally deferred to prevent unauthenticated database mutation seams.
- **Dry-Run Mode:** When `RESEND_API_KEY` is omitted, the system falls back to honest dry-run simulation mode (`simulated`), displaying `"Dry-run (not sent)"` on all notices.

---

## 2. WhatsApp Integration
- **Manual Prefilled Links Only:** SlotSync does **not** integrate with the official Meta/WhatsApp Cloud API, BSPs, or automated WhatsApp bots.
- **Transparency:** All WhatsApp contact triggers generate explicit `https://wa.me/<phone>?text=...` links that open in the owner's WhatsApp client or browser. The owner manually clicks send. The application never sets a `"sent"` or `"delivered"` state for WhatsApp messages.

---

## 3. Payments & Online Settlements
- **Out of Scope:** Online payment gateways (Stripe, Razorpay, etc.) are explicitly out of scope for v1.0.
- **In-Person Settlement:** All appointments operate on an in-person settlement model (cash, UPI QR, or salon POS terminal). Services record prices in minor currency units (paise/cents) for revenue tracking, but no online transactions are processed.

---

## 4. Multi-Staff Resource Scheduling
- **Primary Resource Model:** While the database schema supports multi-resource relationships (`resources`, `working_hours`, `breaks`), the scheduling UI in v1.0 operates under the primary resource model (single active stylist/operator per business).
- **Phase 8 (Staff Scheduling):** Advanced multi-staff scheduling, staff availability overrides, and staff assignment selectors are part of the optional Phase 8 extension.

---

## 5. Waitlists & Overflow Handling
- **No Automated Waitlist:** If an appointment slot is fully occupied, clients receive up to 3 nearest alternative available time slots. There is no automated queue or waitlist alert system when a slot is cancelled.

---

## 6. Remote Deployment Verification
- **Local Emulation:** In Phase 10, `DEPLOY_AUTHORIZED = NO` and `RUN_PRODUCTION_MIGRATIONS_AUTHORIZED = NO`. Consequently, live remote checks on `*.workers.dev` were marked `NOT RUN` or `NOT VERIFIED REMOTELY`, and were instead verified against local production-like Miniflare/Cloudflare Workers environments.
