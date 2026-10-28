# 06 — API Specifications & Contracts

**Project:** SlotSync  
**Author:** Senior Backend Engineer  
**Status:** COMPLETE (PHASE 1)  
**Error Envelope:** `{ "error": { "code": string, "message": string, "fields"?: Record<string, string> } }`

---

## 1. Authentication Endpoints

### 1.1 Register Business & Owner Account
* **Method & Path:** `POST /api/auth/register`
* **Auth:** Public
* **Request Body (Zod `RegisterInputSchema`):**
  ```json
  {
    "email": "owner@salon.com",
    "password": "SecurePassword123!",
    "businessName": "Luxe Salon & Spa",
    "slug": "luxe-salon",
    "timezone": "Asia/Kolkata",
    "industryPreset": "salon"
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "user": { "id": "uuid", "email": "owner@salon.com" },
    "business": { "id": "uuid", "name": "Luxe Salon & Spa", "slug": "luxe-salon", "timezone": "Asia/Kolkata" },
    "role": "owner"
  }
  ```
* **Sets Cookie:** `slotsync_session=<token>; HttpOnly; Secure (in prod); SameSite=Lax; Path=/`
* **Error Codes:** `validation_failed (422)`, `policy_violation (409 - email/slug taken)`.

### 1.2 Login
* **Method & Path:** `POST /api/auth/login`
* **Auth:** Public (Rate-limited by IP+email bucket hash)
* **Request Body (Zod `LoginInputSchema`):** `{ "email": "owner@salon.com", "password": "..." }`
* **Response (200 OK):** User, business, and role metadata; sets `slotsync_session` cookie.
* **Error Codes:** `validation_failed (422)`, `unauthenticated (401)`, `rate_limited (429)`.

### 1.3 Logout
* **Method & Path:** `POST /api/auth/logout`
* **Auth:** Required (`requireAuth`)
* **Response (200 OK):** `{ "success": true, "message": "Logged out successfully" }` (clears cookie).

### 1.4 Get Current Session (`Me`)
* **Method & Path:** `GET /api/auth/me`
* **Auth:** Required (`requireAuth`)
* **Response (200 OK):** `{ "user": { "id": "...", "email": "..." }, "business": { "id": "...", "name": "...", "slug": "..." }, "role": "owner" }`
* **Error Codes:** `unauthenticated (401)`.

---

## 2. Business Profile & Settings

### 2.1 Get Business Profile (Owner)
* **Method & Path:** `GET /api/owner/business`
* **Auth:** Required (`requireAuth`, tenant-scoped)
* **Response (200 OK):** Full business settings record.

### 2.2 Update Business Profile
* **Method & Path:** `PATCH /api/owner/business`
* **Auth:** Required (`requireOwnerRole`)
* **Request Body (Zod `UpdateBusinessSettingsSchema`):** Partial profile fields.
* **Response (200 OK):** Updated business object.
* **Error Codes:** `validation_failed (422)`, `policy_violation (409 - slug taken)`.

### 2.3 Public Business Profile
* **Method & Path:** `GET /api/public/business/:slug`
* **Auth:** Public
* **Response (200 OK):** `{ "name": "...", "slug": "...", "timezone": "...", "description": "...", "address": "...", "accessibility_info": "...", "services": [...] }`
* **Error Codes:** `not_found (404)`.

---

## 3. Services Management

### 3.1 List Services
* **Method & Path:** `GET /api/owner/services`
* **Auth:** Required (`requireAuth`)
* **Response (200 OK):** Array of service objects with `price_minor` (paise) and `duration_minutes`.

### 3.2 Create Service
* **Method & Path:** `POST /api/owner/services`
* **Auth:** Required (`requireOwnerRole`)
* **Request Body (Zod `CreateServiceSchema`):** `{ "name": "...", "duration_minutes": 30, "buffer_minutes": 15, "price_minor": 50000, "currency": "INR" }`
* **Response (201 Created):** Created service record.
* **Error Codes:** `validation_failed (422)`.

### 3.3 Update Service
* **Method & Path:** `PATCH /api/owner/services/:id`
* **Auth:** Required (`requireOwnerRole`)
* **Error Codes:** `not_found (404)`, `validation_failed (422)`.

### 3.4 Delete / Deactivate Service
* **Method & Path:** `DELETE /api/owner/services/:id`
* **Auth:** Required (`requireOwnerRole`)
* **Behavior:** Soft delete (`is_active = 0`) to preserve historical appointments.

---

## 4. Operating Hours, Breaks & Holidays

* `GET /api/owner/hours` & `PUT /api/owner/hours`: Set weekly open/close times and closed days.
* `GET /api/owner/breaks`, `POST /api/owner/breaks`, `DELETE /api/owner/breaks/:id`: Recurring daily breaks.
* `GET /api/owner/holidays`, `POST /api/owner/holidays`, `DELETE /api/owner/holidays/:id`: Specific closure dates.
* `GET /api/owner/blocked-periods`, `POST /api/owner/blocked-periods`, `DELETE /api/owner/blocked-periods/:id`: Ad-hoc blocked intervals.

---

## 5. Public Booking & Availability Engine

### 5.1 Query Available Slots
* **Method & Path:** `GET /api/public/availability`
* **Auth:** Public
* **Query Parameters:** `slug` (string), `service_id` (UUID), `date` (`YYYY-MM-DD`), `resource_id` (optional UUID)
* **Response (200 OK):**
  ```json
  {
    "date": "2026-10-29",
    "timezone": "Asia/Kolkata",
    "service": { "id": "uuid", "duration_minutes": 30, "buffer_minutes": 15 },
    "available_slots": [
      { "start_at_utc": "2026-10-29T04:30:00.000Z", "local_time": "10:00" },
      { "start_at_utc": "2026-10-29T05:15:00.000Z", "local_time": "10:45" }
    ]
  }
  ```
* **Error Codes:** `not_found (404 - slug or service not found)`, `validation_failed (422)`.

### 5.2 Create Public Booking (Atomic Slot Reservation)
* **Method & Path:** `POST /api/public/bookings`
* **Auth:** Public (Rate-limited, Idempotency supported)
* **Request Body (Zod `PublicCreateBookingSchema`):**
  ```json
  {
    "service_id": "uuid",
    "start_at_utc": "2026-10-29T04:30:00.000Z",
    "customer_name": "Rahul Sharma",
    "customer_phone": "9876543210",
    "customer_email": "rahul@example.com",
    "notes": "First time visit",
    "consent_email_reminders": true,
    "source": "direct"
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "booking": {
      "id": "uuid",
      "reference": "SS-7K4M2QXA",
      "status": "confirmed",
      "start_at_utc": "2026-10-29T04:30:00.000Z",
      "end_at_utc": "2026-10-29T05:00:00.000Z",
      "manage_url": "/manage/secret_token_base64"
    }
  }
  ```
* **Error Codes:**
  - `slot_taken (409 Conflict)`: Returns `{ "error": { "code": "slot_taken", "message": "This slot was just claimed", "alternative_slots": [...] } }`
  - `validation_failed (422)`.

### 5.3 Customer Self-Service Booking Lookup
* **Method & Path:** `GET /api/public/manage/:token`
* **Auth:** Token-based (resolves via `manage_token_hash`)
* **Response (200 OK):** Booking details, business details, cancellation cutoff time, can_reschedule, can_cancel flags.

### 5.4 Customer Reschedule
* **Method & Path:** `POST /api/public/manage/:token/reschedule`
* **Request Body (Zod `RescheduleBookingSchema`):** `{ "new_start_at_utc": "..." }`
* **Response (200 OK):** Updated booking record; old slot cells deleted, new slot cells inserted, reminders re-queued.
* **Error Codes:** `slot_taken (409)`, `policy_violation (400 - late reschedule)`.

### 5.5 Customer Cancel
* **Method & Path:** `POST /api/public/manage/:token/cancel`
* **Request Body (Zod `CancelBookingSchema`):** `{ "reason": "Schedule clash" }`
* **Response (200 OK):** Frees slot cells, marks status `cancelled`, marks reminder jobs `cancelled`.
* **Error Codes:** `policy_violation (400 - cancellation cutoff exceeded)`.

---

## 6. Owner Command Center Endpoints

### 6.1 List Bookings
* **Method & Path:** `GET /api/owner/bookings`
* **Query Params:** `view` (`day` | `week` | `agenda`), `date` (`YYYY-MM-DD`), `status`, `resource_id`
* **Auth:** Required (`requireAuth`)
* **Response (200 OK):** List of bookings with customer details, service name, status, and source badge.

### 6.2 Quick Add Booking
* **Method & Path:** `POST /api/owner/bookings`
* **Auth:** Required (`requireAuth`)
* **Request Body (Zod `OwnerCreateBookingSchema`):** Phone/WhatsApp/walk-in intake.
* **Error Codes:** `slot_taken (409)`, `validation_failed (422)`.

### 6.3 Booking Detail & Audit Trail
* **Method & Path:** `GET /api/owner/bookings/:id`
* **Response (200 OK):** Full booking record, linked customer profile summary, and chronological `booking_events` history.
* **Error Codes:** `not_found (404 - cross-tenant returns 404)`.

### 6.4 Update Booking Status
* **Method & Path:** `PATCH /api/owner/bookings/:id/status`
* **Request Body (Zod `StatusTransitionSchema`):** `{ "status": "completed" | "cancelled" | "no_show" | "confirmed", "reason": "..." }`
* **Error Codes:** `illegal_transition (400)`, `not_found (404)`.

---

## 7. Customer Relationship Management (CRM)

### 7.1 Customer Directory Search
* **Method & Path:** `GET /api/owner/customers`
* **Query Params:** `q` (name or phone search), `page`, `limit`
* **Response (200 OK):** Scoped customers with total visits, last visit, upcoming visit.

### 7.2 Customer Profile & Timeline
* **Method & Path:** `GET /api/owner/customers/:id`
* **Response (200 OK):** Profile details, notes list, chronological appointment timeline.

### 7.3 Create Customer Note
* **Method & Path:** `POST /api/owner/customers/:id/notes`
* **Request Body (Zod `CreateCustomerNoteSchema`):** `{ "note_text": "...", "is_private": false }`
* **Constraint:** Enforces industry data minimization.

### 7.4 Controlled Customer Merge
* **Method & Path:** `POST /api/owner/customers/merge`
* **Auth:** Required (`requireOwnerRole`)
* **Request Body (Zod `MergeCustomerSchema`):** `{ "old_customer_id": "...", "new_customer_id": "..." }`
* **Response (200 OK):** Reassigns all bookings, writes tombstone to `customer_aliases`, records audit event.

---

## 8. Notifications & Reminder Health

* `GET /api/owner/notifications`: List jobs (filters: `queued`, `failed`, `simulated`, `sent`).
* `POST /api/owner/notifications/:id/resend`: Manual trigger of a reminder.
* `GET /api/owner/notifications/preferences` & `PATCH`: Communication settings.
* `GET /api/owner/reminder-rules` & `PUT`: Configure 24h / 2h reminder rules.

---

## 9. Reviews & Reputation

* `GET /api/public/reviews/:slug`: Public published reviews.
* `POST /api/public/reviews/:token`: Submit review (verified completed appointments only).
* `GET /api/owner/reviews`: Owner dashboard review list.
* `PATCH /api/owner/reviews/:id/reply`: Post owner response.

---

## 10. Analytics & Data Export

* `GET /api/owner/analytics/today`: Daily overview, Needs Attention panel counts, expected revenue.
* `GET /api/owner/analytics/summary`: Aggregate stored-data metrics (completion rate, repeat rate, source distribution; zero synthetic numbers).
* `GET /api/owner/bookings/export?format=csv`: Tenant-scoped CSV appointment export.

---

## 11. P2 Scope Cut Line Summary (Waitlist & Widgets)
Per the Phase 1 cut line, the following secondary contracts are deferred to post-MVP:
- `POST /api/public/waitlist`: Client self-service waitlist queue entry.
- `GET /api/public/embed/:slug`: External website iframe widget loader.
