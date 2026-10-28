# SlotSync 5-Minute Product Demo Walkthrough

**Target Demo Business:** Luxe Studio Salon (Demo)  
**Public Slug:** `luxe-demo-salon`  
**Demo Owner Credentials:** `demo-owner@example.com` / `DemoPassword123!`  
**Estimated Time:** ~5 minutes

---

## Pre-Demo Setup (Local Run)
Ensure the local server is running with the demo seed:
```bash
# 1. Seed demo data locally
npx wrangler d1 execute syncslot-db --local --file=./scripts/seed-demo.sql

# 2. Start the application
pnpm dev:worker
```
Open your browser to `http://localhost:8787` (or the live URL if authorized).

---

## Step 1: Owner Authentication & Command Center
- **Action:** Navigate to `http://localhost:8787/login`. Enter email `demo-owner@example.com` and password `DemoPassword123!`. Click **Sign In**.
- **Expected Result:**
  - Authenticates and redirects to `/app/today`.
  - Top header displays "Luxe Studio Salon (Demo)" with a green "Live" badge.
  - Metrics cards display:
    - Total Appointments today.
    - Confirmed count.
    - Completed revenue in ₹.
  - "Next Up" card displays the upcoming appointment countdown.
  - Chronological schedule shows appointments with status badges (`Confirmed`, `Completed`, `Cancelled`).

---

## Step 2: Calendar Day View & Schedule Inspection
- **Action:** Click **Calendar** in the sidebar navigation (`/app/calendar`).
- **Expected Result:**
  - Day view displays hourly grid from 08:00 to 20:00.
  - Visual appointment blocks display service name, customer name, price (e.g. ₹850), and time range.
  - Date navigation buttons (`<`, `>`, `Today`) allow smooth calendar day stepping.

---

## Step 3: Owner Quick Add (Walk-in / Phone Intake)
- **Action:** Click **+ New Appointment** (or press the Quick Add button).
- **Form Input:**
  - Customer Name: `Kabir Das (Demo)`
  - Phone: `9876543299` (notice live normalization to `+91 98765 43299`)
  - Email: `kabir.demo@example.com`
  - Service: Select `Signature Haircut & Style` (₹850)
  - Date: Tomorrow's date
  - Time: Select an open slot (e.g. 10:00 AM)
  - Source: Select `Walk-in`
  - Click **Confirm Booking**.
- **Expected Result:**
  - Modal closes, success toast appears.
  - Appointment is immediately visible on the schedule.
  - Under the hood, discrete 15-minute `slot_cells` are reserved atomically in D1.

---

## Step 4: Booking Detail Drawer & Contact Triggers
- **Action:** Click on the newly created appointment for Kabir Das in the list or calendar.
- **Expected Result:**
  - Slide-over drawer opens showing customer details, reference code (`SS-XXXXXXXX`), and service price.
  - Click the **WhatsApp** icon button.
  - Verifies that a new tab opens to `https://wa.me/919876543299?text=...` with prefilled greeting text.
  - Note: System never claims "message sent automatically"; WhatsApp opens manually in client.

---

## Step 5: Public Booking & Real Availability Flow
- **Action:** Open an Incognito / private browser window (or separate tab) and navigate to `http://localhost:8787/b/luxe-demo-salon`.
- **Expected Result:**
  - Public booking portal renders with business branding, address, opening hours, and service catalog.
  - Select `Signature Haircut & Style` (45 min, ₹850).
  - Select tomorrow's date.
  - Availability grid calculates and renders discrete open slots in `Asia/Kolkata` timezone. Notice that 10:00 AM is absent (already reserved in Step 3!).
- **Action:** Select 11:00 AM. Enter:
  - Name: `Rohan Gupta (Demo)`
  - Phone: `+91 98765 43255`
  - Email: `rohan.demo@example.com`
  - Check email reminders consent.
  - Click **Confirm Appointment**.
- **Expected Result:**
  - Booking confirmation screen appears with booking reference (`SS-XXXXXXXX`), calendar add links, and private manage URL.

---

## Step 6: Concurrency Collision Defense Verification
- **Action:** In a second browser tab, attempt to book the exact same slot (11:00 AM) for the same service.
- **Expected Result:**
  - System catches the SQLite `UNIQUE` constraint on `slot_cells`.
  - HTTP 409 `slot_taken` is returned.
  - UI displays friendly guidance: *"This appointment slot was just taken by another client."* and renders up to 3 nearest alternative available time slots.

---

## Step 7: Customer Self-Service Manage Link & Cancellation
- **Action:** Click the **Manage Booking** link from Step 5's confirmation screen (or open `/b/luxe-demo-salon/manage/<token>`).
- **Expected Result:**
  - Renders secure management view. Headers return `Cache-Control: no-store` and `Pragma: no-cache`.
  - Click **Cancel Appointment**, enter reason *"Work meeting conflict"*, and confirm.
  - Status updates to `Cancelled`.
  - Return to public availability page: 11:00 AM is immediately available again!

---

## Step 8: Customer Directory, History & "Book Again"
- **Action:** Switch back to the authenticated Owner window and navigate to `/app/customers`.
- **Expected Result:**
  - Customer directory renders with search input and status pills.
  - Search for `"Priya"`. The list updates instantly.
  - Click on Priya Patel. The Customer Profile Drawer opens showing:
    - Total Visits, Completed Appointments, Total Spend in ₹.
    - Chronological appointment timeline.
    - Relationship notes (including private owner note).
  - Click **Book Again** next to a past service:
    - Quick Add modal opens prefilled with Priya's details and past service.

---

## Step 9: Notification Queue & Honest Delivery Mode
- **Action:** In the owner navigation, click **Notifications** (`/app/notifications`).
- **Expected Result:**
  - Top banner displays: `[Dry-run Mode] Local simulation active. Notification jobs are simulated without sending external emails.`
  - Jobs list shows transactional notices (`booking_confirmed`, `booking_cancelled`) and reminder jobs.
  - Badges display transparent status: `"Dry-run (not sent)"` (or `"Accepted by provider, delivery unconfirmed"` in real mode).
  - Zero false "Delivered" claims.

---

## Post-Demo Clean-up
To reset the demo business to pristine initial state:
```bash
npx wrangler d1 execute syncslot-db --local --file=./scripts/remove-demo.sql
npx wrangler d1 execute syncslot-db --local --file=./scripts/seed-demo.sql
```
