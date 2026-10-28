// SlotSync Public Booking & Self-Service Routes
// Handles availability calculation, atomic slot reservations, collision handling, and manage token flows.

import { Hono, Context } from 'hono';
import { AppBindings, AuthContext } from '../middleware';
import { ERROR_CODES, ApiErrorResponse } from '../../shared/errorCodes';
import { PublicCreateBookingSchema, RescheduleBookingSchema, CancelBookingSchema } from '../../shared/schemas';
import { generateUUID, generateSecretToken, sha256Hex, generateHumanReference } from '../../shared/idUtils';
import { computeSlotCells } from '../../shared/slotCells';
import { normalizePhone } from '../../shared/phone';
import { computeAvailableSlots, findAlternativeSlots, localToUtc, getTimezoneLabel } from '../../shared/availability';
import { checkCustomRateLimit } from '../rateLimiter';
import { dispatchBookingNotificationHook } from '../notificationsHook';
import { SHARE_SOURCE_TAGS, ShareSourceTag } from '../../shared/slugUtils';
import { BookingSource } from '../../shared/statusEnums';

export const publicRouter = new Hono<{ Bindings: AppBindings; Variables: AuthContext }>();

// Helper to map marketing source tag to DB enum
function mapSourceTag(tag?: string | null): BookingSource {
  if (!tag) return 'direct';
  const clean = tag.toLowerCase().trim();
  if (['whatsapp', 'instagram', 'website', 'phone', 'walkin', 'other'].includes(clean)) {
    return clean as BookingSource;
  }
  return 'direct';
}

// Helper to get client IP
function getClientIp(c: Context<{ Bindings: AppBindings; Variables: AuthContext }>): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || '127.0.0.1';
}

// --- 1. BUSINESS PROFILE & SERVICES ---

// Support both /public/business/:slug and /public/:slug
async function handleGetBusiness(c: Context<{ Bindings: AppBindings; Variables: AuthContext }>) {
  const slug = (c.req.param('slug') || '').toLowerCase().trim();

  const business = await c.env.DB.prepare(
    `SELECT id, name, slug, timezone, description, address, accessibility_info,
            contact_phone, contact_email, published, booking_mode, min_notice_hours,
            max_days_ahead, cancel_cutoff_hours, cancellation_policy_text
     FROM businesses
     WHERE slug = ?`
  )
    .bind(slug)
    .first();

  if (!business) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Booking page not found' } },
      404
    );
  }

  // Unpublished check
  if (business.published === 0) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'This booking page is currently not accepting appointments',
        },
      },
      404
    );
  }

  // Active services
  const { results: services } = await c.env.DB.prepare(
    `SELECT id, name, description, duration_minutes, buffer_minutes, price_minor, currency
     FROM services
     WHERE business_id = ? AND is_active = 1
     ORDER BY name ASC`
  )
    .bind(business.id)
    .all();

  return c.json({
    business,
    services: services || [],
  });
}

publicRouter.get('/business/:slug', handleGetBusiness);
publicRouter.get('/:slug', handleGetBusiness);

// --- 2. LIVE AVAILABILITY ENGINE ---

publicRouter.get('/:slug/availability', async (c) => {
  const slug = (c.req.param('slug') || '').toLowerCase().trim();
  const serviceId = c.req.query('serviceId') || c.req.query('service_id');
  const fromQuery = c.req.query('from');
  const toQuery = c.req.query('to');

  if (!serviceId) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.VALIDATION_FAILED, message: 'serviceId query parameter is required' } },
      422
    );
  }

  // Rate Limiting: 60 requests / minute per IP
  const ip = getClientIp(c);
  const salt = c.env.RATE_LIMIT_SALT || 'salt';
  const rateCheck = await checkCustomRateLimit(c.env.DB, `avail:${ip}`, 60, 60, salt);
  if (!rateCheck.allowed) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many availability requests. Please slow down.' } },
      429
    );
  }

  // Fetch business
  const business = await c.env.DB.prepare(
    'SELECT id, timezone, min_notice_hours, max_days_ahead, published FROM businesses WHERE slug = ?'
  )
    .bind(slug)
    .first<{ id: string; timezone: string; min_notice_hours: number; max_days_ahead: number; published: number }>();

  if (!business || business.published === 0) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Business not found or unavailable' } },
      404
    );
  }

  // Fetch service (never trust client duration or buffer)
  const service = await c.env.DB.prepare(
    'SELECT id, duration_minutes, buffer_minutes, price_minor FROM services WHERE id = ? AND business_id = ? AND is_active = 1'
  )
    .bind(serviceId, business.id)
    .first<{ id: string; duration_minutes: number; buffer_minutes: number; price_minor: number }>();

  if (!service) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Service not found or inactive' } },
      404
    );
  }

  // Default date window: today to +7 days in business timezone
  const dateQuery = c.req.query('date');
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const fromDate = fromQuery || dateQuery || todayIso;

  const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const toDate = toQuery || dateQuery || future.toISOString().slice(0, 10);

  // Fetch all scheduling constraints in parallel
  const [hoursRes, breaksRes, holidaysRes, blockedRes, slotCellsRes] = await Promise.all([
    c.env.DB.prepare('SELECT day_of_week, open_time, close_time, is_closed FROM working_hours WHERE business_id = ?')
      .bind(business.id)
      .all(),
    c.env.DB.prepare('SELECT day_of_week, start_time, end_time FROM breaks WHERE business_id = ?')
      .bind(business.id)
      .all(),
    c.env.DB.prepare('SELECT holiday_date FROM holidays WHERE business_id = ?')
      .bind(business.id)
      .all(),
    c.env.DB.prepare('SELECT start_at_utc, end_at_utc FROM blocked_periods WHERE business_id = ?')
      .bind(business.id)
      .all(),
    // Query reserved slot_cells for this business
    c.env.DB.prepare(
      `SELECT sc.cell_start_utc
       FROM slot_cells sc
       JOIN bookings b ON sc.booking_id = b.id
       WHERE b.business_id = ? AND b.status IN ('pending', 'confirmed')`
    )
      .bind(business.id)
      .all(),
  ]);

  const existingSlotCells = new Set((slotCellsRes.results || []).map((r: any) => r.cell_start_utc));

  const availableSlots = computeAvailableSlots({
    timezone: business.timezone,
    startDate: fromDate,
    endDate: toDate,
    serviceDurationMinutes: service.duration_minutes,
    bufferMinutes: service.buffer_minutes,
    minNoticeHours: business.min_notice_hours,
    maxDaysAhead: business.max_days_ahead,
    workingHours: (hoursRes.results as any) || [],
    breaks: (breaksRes.results as any) || [],
    holidays: (holidaysRes.results as any) || [],
    blockedPeriods: (blockedRes.results as any) || [],
    existingSlotCells,
    nowIso: now.toISOString(),
  });

  return c.json({
    timezone: business.timezone,
    timezone_label: getTimezoneLabel(business.timezone),
    service: {
      id: service.id,
      duration_minutes: service.duration_minutes,
      buffer_minutes: service.buffer_minutes,
    },
    from: fromDate,
    to: toDate,
    available_slots: availableSlots,
    slots: availableSlots,
  });
});

// --- 3. CREATE BOOKING (ATOMIC SLOT RESERVATION & COLLISION DEFENSE) ---

publicRouter.post('/:slug/bookings', async (c) => {
  const slug = (c.req.param('slug') || '').toLowerCase().trim();
  const body = await c.req.json().catch(() => null);
  if (body && body.source_tag && !body.source) {
    body.source = mapSourceTag(body.source_tag);
  }
  const parsed = PublicCreateBookingSchema.safeParse(body);

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      if (e.path[0]) fields[e.path[0].toString()] = e.message;
    });
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.VALIDATION_FAILED, message: 'Invalid booking data', fields } },
      422
    );
  }

  // Rate Limiting: 10 booking requests / 10 minutes per IP
  const ip = getClientIp(c);
  const salt = c.env.RATE_LIMIT_SALT || 'salt';
  const rateCheck = await checkCustomRateLimit(c.env.DB, `booking:${ip}`, 10, 600, salt);
  if (!rateCheck.allowed) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many booking attempts. Please wait a few minutes.' } },
      429
    );
  }

  const {
    service_id,
    start_at_utc,
    customer_name,
    customer_phone,
    customer_email,
    notes,
    source,
    consent_email_reminders,
    consent_whatsapp_reminders,
  } = parsed.data;

  // 1. Fetch business
  const business = await c.env.DB.prepare(
    `SELECT id, name, slug, timezone, country_code, currency, booking_mode, published,
            min_notice_hours, max_days_ahead
     FROM businesses WHERE slug = ?`
  )
    .bind(slug)
    .first<{
      id: string;
      name: string;
      slug: string;
      timezone: string;
      country_code: string;
      currency: string;
      booking_mode: 'instant' | 'approval';
      published: number;
      min_notice_hours: number;
      max_days_ahead: number;
    }>();

  if (!business || business.published === 0) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Business is not accepting appointments' } },
      404
    );
  }

  // 2. Fetch service details (snapshot server-side price and duration; ignore client price)
  const service = await c.env.DB.prepare(
    'SELECT id, name, duration_minutes, buffer_minutes, price_minor, currency FROM services WHERE id = ? AND business_id = ? AND is_active = 1'
  )
    .bind(service_id, business.id)
    .first<{
      id: string;
      name: string;
      duration_minutes: number;
      buffer_minutes: number;
      price_minor: number;
      currency: string;
    }>();

  if (!service) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Selected service is no longer available' } },
      404
    );
  }

  // 3. Normalize phone number (E.164)
  const phoneNormalized = normalizePhone(customer_phone, (business.country_code as any) || 'IN');
  if (!phoneNormalized.valid) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Please provide a valid mobile phone number',
          fields: { customer_phone: 'Invalid phone number format' },
        },
      },
      422
    );
  }

  // 4. Default primary resource
  const resource = await c.env.DB.prepare(
    'SELECT id FROM resources WHERE business_id = ? AND is_default = 1 LIMIT 1'
  )
    .bind(business.id)
    .first<{ id: string }>();

  const resourceId = resource?.id || (await c.env.DB.prepare('SELECT id FROM resources WHERE business_id = ? LIMIT 1').bind(business.id).first<{ id: string }>())?.id;

  if (!resourceId) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.INTERNAL, message: 'No scheduling resource configured for business' } },
      500
    );
  }

  // 5. Calculate timestamps and slot cells
  const startMs = new Date(start_at_utc).getTime();
  const endMs = startMs + service.duration_minutes * 60 * 1000;
  const bufferEndMs = endMs + service.buffer_minutes * 60 * 1000;

  const endAtUtc = new Date(endMs).toISOString();
  const bufferEndAtUtc = new Date(bufferEndMs).toISOString();

  const requiredCells = computeSlotCells(start_at_utc, bufferEndAtUtc);

  // 6. Customer lookup or creation
  let customerId = generateUUID();
  let possibleMatch = 0;
  const nowIso = new Date().toISOString();

  const existingCustomer = await c.env.DB.prepare(
    'SELECT id, name, email FROM customers WHERE business_id = ? AND normalized_phone = ?'
  )
    .bind(business.id, phoneNormalized.e164)
    .first<{ id: string; name: string; email: string | null }>();

  const statements: D1PreparedStatement[] = [];

  if (existingCustomer) {
    customerId = existingCustomer.id;
    // Flag if name differs materially
    if (existingCustomer.name.trim().toLowerCase() !== customer_name.trim().toLowerCase()) {
      possibleMatch = 1;
    }
    // Update email if previously empty
    if (!existingCustomer.email && customer_email) {
      statements.push(
        c.env.DB.prepare('UPDATE customers SET email = ?, updated_at_utc = ? WHERE id = ?')
          .bind(customer_email.trim(), nowIso, customerId)
      );
    }
  } else {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO customers (
          id, business_id, normalized_phone, display_phone, name, email,
          consent_email_reminders, consent_whatsapp_reminders, consent_at_utc,
          created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        customerId,
        business.id,
        phoneNormalized.e164,
        phoneNormalized.display,
        customer_name.trim(),
        customer_email ? customer_email.trim() : null,
        consent_email_reminders ? 1 : 0,
        consent_whatsapp_reminders ? 1 : 0,
        nowIso,
        nowIso,
        nowIso
      )
    );
  }

  // 7. Human reference code & Secret Manage Token
  const reference = generateHumanReference();
  const rawManageToken = generateSecretToken();
  const manageTokenHash = await sha256Hex(rawManageToken);
  const bookingId = generateUUID();

  // Determine initial status (instant = confirmed; approval = pending)
  const bookingStatus = business.booking_mode === 'approval' ? 'pending' : 'confirmed';

  // Raw marketing source tag
  const querySrc = c.req.query('src');
  const rawSourceTag = querySrc || source || 'link';
  const mappedSource = mapSourceTag(rawSourceTag);

  // Insert booking statement
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO bookings (
        id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id,
        start_at_utc, end_at_utc, business_timezone, source, status, price_minor, currency,
        version, notes, possible_match, consent_email_reminders, created_at_utc, updated_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
    ).bind(
      bookingId,
      reference,
      manageTokenHash,
      business.id,
      customerId,
      service.id,
      resourceId,
      start_at_utc,
      endAtUtc,
      business.timezone,
      mappedSource,
      bookingStatus,
      service.price_minor,
      business.currency || 'INR',
      notes ? notes.trim() : '',
      possibleMatch,
      consent_email_reminders ? 1 : 0,
      nowIso,
      nowIso
    )
  );

  // Insert slot_cells statements (each 15-min cell)
  for (const cell of requiredCells) {
    statements.push(
      c.env.DB.prepare(
        'INSERT INTO slot_cells (resource_id, cell_start_utc, booking_id) VALUES (?, ?, ?)'
      ).bind(resourceId, cell, bookingId)
    );
  }

  // Insert booking_events audit statement
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO booking_events (
        id, booking_id, business_id, actor_type, actor_id, event_type,
        to_status, payload_json, created_at_utc
      ) VALUES (?, ?, ?, 'customer', ?, 'BOOKING_CREATED', ?, ?, ?)`
    ).bind(
      generateUUID(),
      bookingId,
      business.id,
      customerId,
      bookingStatus,
      JSON.stringify({ source_tag: rawSourceTag, cells_count: requiredCells.length }),
      nowIso
    )
  );

  // 8. Atomic Commit with Collision Handling
  try {
    await c.env.DB.batch(statements);
  } catch (err: any) {
    // Check if error is due to UNIQUE constraint on slot_cells
    if (err.message && (err.message.includes('slot_cells') || err.message.includes('UNIQUE'))) {
      // Slot collision! Find up to 3 nearest alternatives
      const dateStr = start_at_utc.slice(0, 10);
      const [hoursRes, breaksRes, holidaysRes, blockedRes, slotCellsRes] = await Promise.all([
        c.env.DB.prepare('SELECT day_of_week, open_time, close_time, is_closed FROM working_hours WHERE business_id = ?').bind(business.id).all(),
        c.env.DB.prepare('SELECT day_of_week, start_time, end_time FROM breaks WHERE business_id = ?').bind(business.id).all(),
        c.env.DB.prepare('SELECT holiday_date FROM holidays WHERE business_id = ?').bind(business.id).all(),
        c.env.DB.prepare('SELECT start_at_utc, end_at_utc FROM blocked_periods WHERE business_id = ?').bind(business.id).all(),
        c.env.DB.prepare(`SELECT sc.cell_start_utc FROM slot_cells sc JOIN bookings b ON sc.booking_id = b.id WHERE b.business_id = ? AND b.status IN ('pending', 'confirmed')`).bind(business.id).all(),
      ]);

      const cellSet = new Set((slotCellsRes.results || []).map((r: any) => r.cell_start_utc));
      const freshAvailable = computeAvailableSlots({
        timezone: business.timezone,
        startDate: dateStr,
        endDate: dateStr,
        serviceDurationMinutes: service.duration_minutes,
        bufferMinutes: service.buffer_minutes,
        minNoticeHours: business.min_notice_hours,
        maxDaysAhead: business.max_days_ahead,
        workingHours: (hoursRes.results as any) || [],
        breaks: (breaksRes.results as any) || [],
        holidays: (holidaysRes.results as any) || [],
        blockedPeriods: (blockedRes.results as any) || [],
        existingSlotCells: cellSet,
      });

      const alternatives = findAlternativeSlots(freshAvailable, start_at_utc, 3);

      return c.json<ApiErrorResponse>(
        {
          error: {
            code: ERROR_CODES.SLOT_TAKEN,
            message: 'The selected appointment slot has just been taken by another booking.',
            details: {
              alternative_slots: alternatives,
            },
          },
          alternative_slots: alternatives,
        } as any,
        409
      );
    }

    throw err;
  }

  // 9. Call Notification Seam (non-blocking hook)
  await dispatchBookingNotificationHook(c.env.DB, bookingId, 'BOOKING_CREATED');

  return c.json(
    {
      booking: {
        id: bookingId,
        reference,
        status: bookingStatus,
        start_at_utc,
        end_at_utc: endAtUtc,
        business_timezone: business.timezone,
        price_minor: service.price_minor,
        currency: business.currency || 'INR',
        manage_token: rawManageToken,
        manage_url: `/b/${business.slug}/manage/${rawManageToken}`,
      },
    },
    201
  );
});

// --- 4. MANAGE BOOKING BY SECURE TOKEN (VIEW, CANCEL, RESCHEDULE) ---

// View booking by token
publicRouter.get('/:slug/manage/:token', async (c) => {
  const slug = (c.req.param('slug') || '').toLowerCase().trim();
  const token = c.req.param('token') || '';

  // Security headers per Patch 4 Item H
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');

  // Rate Limiting: 30 requests / min
  const ip = getClientIp(c);
  const salt = c.env.RATE_LIMIT_SALT || 'salt';
  const rateCheck = await checkCustomRateLimit(c.env.DB, `manage:${ip}`, 30, 60, salt);
  if (!rateCheck.allowed) {
    return c.json<ApiErrorResponse>({ error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests' } }, 429);
  }

  const tokenHash = await sha256Hex(token);

  const booking = await c.env.DB.prepare(
    `SELECT b.id, b.reference, b.start_at_utc, b.end_at_utc, b.business_timezone,
            b.status, b.price_minor, b.currency, b.version, b.notes,
            s.name as service_name, s.duration_minutes, s.buffer_minutes,
            c.name as customer_name, c.display_phone, c.email as customer_email,
            biz.name as business_name, biz.slug as business_slug, biz.address,
            biz.contact_phone, biz.cancel_cutoff_hours, biz.cancellation_policy_text
     FROM bookings b
     JOIN services s ON b.service_id = s.id
     JOIN customers c ON b.customer_id = c.id
     JOIN businesses biz ON b.business_id = biz.id
     WHERE b.manage_token_hash = ? AND biz.slug = ?
     LIMIT 1`
  )
    .bind(tokenHash, slug)
    .first();

  if (!booking) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Booking not found or link has expired' } },
      404
    );
  }

  const startMs = new Date((booking as any).start_at_utc).getTime();
  const cutoffHours = (booking as any).cancel_cutoff_hours || 2;
  const canCancel = (booking as any).status === 'confirmed' && (Date.now() < startMs - cutoffHours * 3600 * 1000);
  const canReschedule = (booking as any).status === 'confirmed' && (Date.now() < startMs - cutoffHours * 3600 * 1000);

  return c.json({
    booking: {
      ...(booking as any),
      can_cancel: canCancel,
      can_reschedule: canReschedule,
    },
  });
});

// Cancel booking via token
publicRouter.post('/:slug/manage/:token/cancel', async (c) => {
  const slug = (c.req.param('slug') || '').toLowerCase().trim();
  const token = c.req.param('token') || '';
  const body = await c.req.json().catch(() => ({}));
  const parsed = CancelBookingSchema.safeParse(body);

  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');

  const tokenHash = await sha256Hex(token);

  const booking = await c.env.DB.prepare(
    `SELECT b.id, b.business_id, b.status, b.start_at_utc, b.version,
            biz.cancel_cutoff_hours
     FROM bookings b
     JOIN businesses biz ON b.business_id = biz.id
     WHERE b.manage_token_hash = ? AND biz.slug = ?
     LIMIT 1`
  )
    .bind(tokenHash, slug)
    .first<{
      id: string;
      business_id: string;
      status: string;
      start_at_utc: string;
      version: number;
      cancel_cutoff_hours: number;
    }>();

  if (!booking) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Booking not found' } },
      404
    );
  }

  // Idempotent cancellation
  if (booking.status === 'cancelled') {
    return c.json({ success: true, message: 'Booking is already cancelled', status: 'cancelled' });
  }

  // Enforce cancellation cutoff window server-side
  const startMs = new Date(booking.start_at_utc).getTime();
  const cutoffMs = (booking.cancel_cutoff_hours || 2) * 60 * 60 * 1000;
  if (Date.now() > startMs - cutoffMs) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.POLICY_VIOLATION,
          message: `Cancellations must be made at least ${booking.cancel_cutoff_hours || 2} hours before appointment time.`,
        },
      },
      422
    );
  }

  const nowIso = new Date().toISOString();
  const reason = parsed.success && parsed.data.reason ? parsed.data.reason : 'Customer self-service cancellation';

  // Atomic batch: mark booking cancelled, free slot_cells, write event
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE bookings
       SET status = 'cancelled', cancelled_reason = ?, version = version + 1, updated_at_utc = ?
       WHERE id = ?`
    ).bind(reason, nowIso, booking.id),

    c.env.DB.prepare('DELETE FROM slot_cells WHERE booking_id = ?').bind(booking.id),

    c.env.DB.prepare(
      `INSERT INTO booking_events (
        id, booking_id, business_id, actor_type, actor_id, event_type,
        from_status, to_status, payload_json, created_at_utc
      ) VALUES (?, ?, ?, 'customer', 'token', 'BOOKING_CANCELLED', ?, 'cancelled', ?, ?)`
    ).bind(
      generateUUID(),
      booking.id,
      booking.business_id,
      booking.status,
      JSON.stringify({ reason }),
      nowIso
    ),
  ]);

  await dispatchBookingNotificationHook(c.env.DB, booking.id, 'BOOKING_CANCELLED');

  return c.json({
    success: true,
    message: 'Booking cancelled successfully',
    status: 'cancelled',
    booking: {
      id: booking.id,
      status: 'cancelled',
    },
  });
});

// Reschedule booking via token
publicRouter.post('/:slug/manage/:token/reschedule', async (c) => {
  const slug = (c.req.param('slug') || '').toLowerCase().trim();
  const token = c.req.param('token') || '';
  const body = await c.req.json().catch(() => null);
  const parsed = RescheduleBookingSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.VALIDATION_FAILED, message: 'new_start_at_utc ISO string required' } },
      422
    );
  }

  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');

  const { new_start_at_utc } = parsed.data;
  const tokenHash = await sha256Hex(token);

  const booking = await c.env.DB.prepare(
    `SELECT b.id, b.business_id, b.service_id, b.resource_id, b.status, b.start_at_utc,
            b.version, biz.timezone, biz.cancel_cutoff_hours, s.duration_minutes, s.buffer_minutes
     FROM bookings b
     JOIN businesses biz ON b.business_id = biz.id
     JOIN services s ON b.service_id = s.id
     WHERE b.manage_token_hash = ? AND biz.slug = ?
     LIMIT 1`
  )
    .bind(tokenHash, slug)
    .first<{
      id: string;
      business_id: string;
      service_id: string;
      resource_id: string;
      status: string;
      start_at_utc: string;
      version: number;
      timezone: string;
      cancel_cutoff_hours: number;
      duration_minutes: number;
      buffer_minutes: number;
    }>();

  if (!booking) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Booking not found' } },
      404
    );
  }

  if (booking.status === 'cancelled') {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.POLICY_VIOLATION, message: 'Cancelled bookings cannot be rescheduled' } },
      422
    );
  }

  // Enforce reschedule cutoff window
  const startMs = new Date(booking.start_at_utc).getTime();
  const cutoffMs = (booking.cancel_cutoff_hours || 2) * 60 * 60 * 1000;
  if (Date.now() > startMs - cutoffMs) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.POLICY_VIOLATION,
          message: `Rescheduling must be made at least ${booking.cancel_cutoff_hours || 2} hours before appointment time.`,
        },
      },
      422
    );
  }

  // Calculate new end time and slot cells
  const newStartMs = new Date(new_start_at_utc).getTime();
  const newEndMs = newStartMs + booking.duration_minutes * 60 * 1000;
  const newBufEndMs = newEndMs + booking.buffer_minutes * 60 * 1000;

  const newEndAtUtc = new Date(newEndMs).toISOString();
  const newBufEndAtUtc = new Date(newBufEndMs).toISOString();
  const newCells = computeSlotCells(new_start_at_utc, newBufEndAtUtc);

  const nowIso = new Date().toISOString();

  // Atomically move cells: delete old cells and insert new cells
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE bookings
       SET start_at_utc = ?, end_at_utc = ?, version = version + 1, updated_at_utc = ?
       WHERE id = ?`
    ).bind(new_start_at_utc, newEndAtUtc, nowIso, booking.id),

    c.env.DB.prepare('DELETE FROM slot_cells WHERE booking_id = ?').bind(booking.id),
  ];

  for (const cell of newCells) {
    statements.push(
      c.env.DB.prepare(
        'INSERT INTO slot_cells (resource_id, cell_start_utc, booking_id) VALUES (?, ?, ?)'
      ).bind(booking.resource_id, cell, booking.id)
    );
  }

  statements.push(
    c.env.DB.prepare(
      `INSERT INTO booking_events (
        id, booking_id, business_id, actor_type, actor_id, event_type,
        payload_json, created_at_utc
      ) VALUES (?, ?, ?, 'customer', 'token', 'BOOKING_RESCHEDULED', ?, ?)`
    ).bind(
      generateUUID(),
      booking.id,
      booking.business_id,
      JSON.stringify({ from_start: booking.start_at_utc, to_start: new_start_at_utc }),
      nowIso
    )
  );

  try {
    await c.env.DB.batch(statements);
  } catch (err: any) {
    if (err.message && (err.message.includes('slot_cells') || err.message.includes('UNIQUE'))) {
      return c.json<ApiErrorResponse>(
        { error: { code: ERROR_CODES.SLOT_TAKEN, message: 'The requested reschedule slot is already occupied.' } },
        409
      );
    }
    throw err;
  }

  await dispatchBookingNotificationHook(c.env.DB, booking.id, 'BOOKING_RESCHEDULED');

  return c.json({
    success: true,
    message: 'Booking rescheduled successfully',
    booking: {
      id: booking.id,
      start_at_utc: new_start_at_utc,
      end_at_utc: newEndAtUtc,
      version: booking.version + 1,
    },
  });
});
