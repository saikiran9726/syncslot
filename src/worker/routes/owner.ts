// SlotSync Owner Management Routes
// Business Configuration, Services, Working Hours, Breaks, Holidays, and Publishing Gate

import { Hono } from 'hono';
import { AppBindings, AuthContext, requireAuth, requireOwnerRole } from '../middleware';
import { ERROR_CODES, ApiErrorResponse } from '../../shared/errorCodes';
import {
  UpdateBusinessSettingsSchema,
  CreateServiceSchema,
  UpdateServiceSchema,
  BulkWorkingHoursSchema,
  CreateBreakSchema,
  CreateHolidaySchema,
  CreateBlockedPeriodSchema,
  OwnerCreateBookingSchema,
  StatusTransitionSchema,
  CreateCustomerNoteSchema,
  MergeCustomerSchema,
  UpdateCustomerSchema,
} from '../../shared/schemas';
import { generateUUID, generateReferenceCode, generateSecretToken, sha256Hex, deriveHmacToken } from '../../shared/idUtils';
import { recordAuditLog } from '../audit';
import { validateSlug } from '../../shared/slugUtils';
import { isValidTimezone } from '../../shared/timezoneUtils';
import { computeSlotCells } from '../../shared/slotCells';
import { normalizePhone } from '../../shared/phone';
import { localToUtc, utcToLocal } from '../../shared/availability';
import { dispatchBookingNotificationHook } from '../notificationsHook';
import { processNotificationQueue } from '../notifications/jobProcessor';

export const ownerRouter = new Hono<{ Bindings: AppBindings; Variables: AuthContext }>();

// All routes require authenticated tenant session
ownerRouter.use('*', requireAuth);

// --- 1. BUSINESS PROFILE & SETTINGS ---

// Get business profile with publish status
ownerRouter.get('/business', async (c) => {
  const businessId = c.get('business_id');

  const business = await c.env.DB.prepare(
    `SELECT id, name, slug, timezone, contact_phone, contact_email, description,
            address, accessibility_info, published, is_demo, country_code, currency,
            onboarding_step, booking_mode, requires_approval, min_notice_hours,
            max_days_ahead, cancel_cutoff_hours, cancellation_policy_text, industry_preset,
            quiet_hours_start, quiet_hours_end, created_at_utc, updated_at_utc
     FROM businesses
     WHERE id = ?`
  )
    .bind(businessId)
    .first();

  if (!business) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Business record not found',
        },
      },
      404
    );
  }

  // Check publish readiness
  const activeServices = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM services WHERE business_id = ? AND is_active = 1'
  )
    .bind(businessId)
    .first<{ count: number }>();

  const openHours = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM working_hours WHERE business_id = ? AND is_closed = 0'
  )
    .bind(businessId)
    .first<{ count: number }>();

  const hasServices = (activeServices?.count ?? 0) > 0;
  const hasHours = (openHours?.count ?? 0) > 0;

  const publishBlockers: string[] = [];
  if (!hasServices) publishBlockers.push('You must add at least one active bookable service');
  if (!hasHours) publishBlockers.push('You must configure at least one open day of working hours');

  return c.json({
    business,
    publish_readiness: {
      can_publish: publishBlockers.length === 0,
      publish_blockers: publishBlockers,
      active_services_count: activeServices?.count ?? 0,
      open_hours_count: openHours?.count ?? 0,
    },
  });
});

// Update business profile (Owner only)
ownerRouter.patch('/business', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateBusinessSettingsSchema.safeParse(body);

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      if (e.path[0]) fields[e.path[0].toString()] = e.message;
    });
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid business settings input',
          fields,
        },
      },
      422
    );
  }

  const updates = parsed.data;

  // Slug uniqueness & validation
  if (updates.slug) {
    const slugErr = validateSlug(updates.slug);
    if (slugErr) {
      return c.json<ApiErrorResponse>(
        {
          error: {
            code: ERROR_CODES.VALIDATION_FAILED,
            message: slugErr,
            fields: { slug: slugErr },
          },
        },
        422
      );
    }

    const existingSlug = await c.env.DB.prepare(
      'SELECT id FROM businesses WHERE slug = ? AND id != ?'
    )
      .bind(updates.slug, businessId)
      .first();

    if (existingSlug) {
      return c.json<ApiErrorResponse>(
        {
          error: {
            code: ERROR_CODES.POLICY_VIOLATION,
            message: 'This public booking slug is already in use by another business',
            fields: { slug: 'Slug already taken' },
          },
        },
        409
      );
    }
  }

  // Timezone validation
  if (updates.timezone && !isValidTimezone(updates.timezone)) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid IANA timezone identifier',
          fields: { timezone: 'Invalid IANA timezone identifier' },
        },
      },
      422
    );
  }

  // Publish Gate check
  if (updates.published === 1) {
    const activeServices = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM services WHERE business_id = ? AND is_active = 1'
    )
      .bind(businessId)
      .first<{ count: number }>();

    const openHours = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM working_hours WHERE business_id = ? AND is_closed = 0'
    )
      .bind(businessId)
      .first<{ count: number }>();

    const blockers: string[] = [];
    if (!activeServices || activeServices.count === 0) {
      blockers.push('At least one active service is required to publish');
    }
    if (!openHours || openHours.count === 0) {
      blockers.push('At least one open day of working hours is required to publish');
    }

    if (blockers.length > 0) {
      return c.json<ApiErrorResponse>(
        {
          error: {
            code: ERROR_CODES.VALIDATION_FAILED,
            message: `Cannot publish business: ${blockers.join('; ')}`,
          },
        },
        422
      );
    }
  }

  // Fetch current state for audit
  const before = await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(businessId).first();

  // Dynamically build UPDATE query
  const setClauses: string[] = [];
  const bindings: any[] = [];

  const allowedKeys: (keyof typeof updates)[] = [
    'name',
    'slug',
    'timezone',
    'contact_phone',
    'contact_email',
    'description',
    'address',
    'accessibility_info',
    'min_notice_hours',
    'max_days_ahead',
    'cancel_cutoff_hours',
    'cancellation_policy_text',
    'booking_mode',
    'requires_approval',
    'published',
    'onboarding_step',
  ];

  for (const key of allowedKeys) {
    if (updates[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      bindings.push(updates[key]);
    }
  }

  const nowIso = new Date().toISOString();
  setClauses.push('updated_at_utc = ?');
  bindings.push(nowIso);
  bindings.push(businessId);

  await c.env.DB.prepare(`UPDATE businesses SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...bindings)
    .run();

  const after = await c.env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(businessId).first();

  await recordAuditLog(c.env.DB, {
    business_id: businessId,
    actor_user_id: c.get('user_id'),
    action: 'UPDATE_BUSINESS_SETTINGS',
    target_type: 'business',
    target_id: businessId,
    payload_json: { before, after },
  });

  return c.json({ business: after, success: true });
});

// --- 2. SERVICES MANAGEMENT ---

// List services (Staff or Owner)
ownerRouter.get('/services', async (c) => {
  const businessId = c.get('business_id');
  const showAll = c.req.query('all') === '1';

  const query = showAll
    ? 'SELECT * FROM services WHERE business_id = ? ORDER BY created_at_utc ASC'
    : 'SELECT * FROM services WHERE business_id = ? AND is_active = 1 ORDER BY created_at_utc ASC';

  const { results } = await c.env.DB.prepare(query).bind(businessId).all();
  return c.json({ services: results || [] });
});

// Create service (Owner only)
ownerRouter.post('/services', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateServiceSchema.safeParse(body);

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      if (e.path[0]) fields[e.path[0].toString()] = e.message;
    });
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid service parameters',
          fields,
        },
      },
      422
    );
  }

  const { name, description, duration_minutes, buffer_minutes, price_minor, currency, is_active } = parsed.data;
  const id = generateUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO services (
      id, business_id, name, description, duration_minutes, buffer_minutes,
      price_minor, currency, is_active, created_at_utc, updated_at_utc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      businessId,
      name,
      description ?? '',
      duration_minutes,
      buffer_minutes,
      price_minor,
      currency,
      is_active,
      nowIso,
      nowIso
    )
    .run();

  const created = await c.env.DB.prepare('SELECT * FROM services WHERE id = ?').bind(id).first();

  await recordAuditLog(c.env.DB, {
    business_id: businessId,
    actor_user_id: c.get('user_id'),
    action: 'CREATE_SERVICE',
    target_type: 'service',
    target_id: id,
    payload_json: created,
  });

  return c.json({ service: created }, 201);
});

// Update service (Owner only)
ownerRouter.patch('/services/:id', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const serviceId = c.req.param('id') || '';
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateServiceSchema.safeParse(body);

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      if (e.path[0]) fields[e.path[0].toString()] = e.message;
    });
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid service update parameters',
          fields,
        },
      },
      422
    );
  }

  // Cross-tenant verification
  const existing = await c.env.DB.prepare('SELECT * FROM services WHERE id = ? AND business_id = ?')
    .bind(serviceId, businessId)
    .first();

  if (!existing) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Service not found',
        },
      },
      404
    );
  }

  const updates = parsed.data;
  const setClauses: string[] = [];
  const bindings: any[] = [];

  const allowedFields: (keyof typeof updates)[] = [
    'name',
    'description',
    'duration_minutes',
    'buffer_minutes',
    'price_minor',
    'currency',
    'is_active',
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      bindings.push(updates[field]);
    }
  }

  const nowIso = new Date().toISOString();
  setClauses.push('updated_at_utc = ?');
  bindings.push(nowIso);
  bindings.push(serviceId);
  bindings.push(businessId);

  await c.env.DB.prepare(`UPDATE services SET ${setClauses.join(', ')} WHERE id = ? AND business_id = ?`)
    .bind(...bindings)
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM services WHERE id = ?').bind(serviceId).first();

  await recordAuditLog(c.env.DB, {
    business_id: businessId,
    actor_user_id: c.get('user_id'),
    action: 'UPDATE_SERVICE',
    target_type: 'service',
    target_id: serviceId,
    payload_json: { before: existing, after: updated },
  });

  return c.json({ service: updated });
});

// Delete or archive service (Owner only)
ownerRouter.delete('/services/:id', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const serviceId = c.req.param('id') || '';

  const existing = await c.env.DB.prepare('SELECT * FROM services WHERE id = ? AND business_id = ?')
    .bind(serviceId, businessId)
    .first();

  if (!existing) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Service not found',
        },
      },
      404
    );
  }

  // Check if service has bookings
  const bookingsCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM bookings WHERE service_id = ? AND status IN ("pending", "confirmed")'
  )
    .bind(serviceId)
    .first<{ count: number }>();

  const hasActiveBookings = (bookingsCount?.count ?? 0) > 0;

  // Always soft archive to preserve referential history
  await c.env.DB.prepare('UPDATE services SET is_active = 0, updated_at_utc = ? WHERE id = ? AND business_id = ?')
    .bind(new Date().toISOString(), serviceId, businessId)
    .run();

  await recordAuditLog(c.env.DB, {
    business_id: businessId,
    actor_user_id: c.get('user_id'),
    action: 'ARCHIVE_SERVICE',
    target_type: 'service',
    target_id: serviceId,
    payload_json: { ...existing, is_active: 0, has_active_bookings: hasActiveBookings },
  });

  return c.json({
    archived: true,
    message: hasActiveBookings
      ? 'Service has upcoming bookings and was archived to protect appointment history'
      : 'Service archived successfully',
  });
});

// --- 3. OPERATING HOURS ---

// Get working hours
ownerRouter.get('/hours', async (c) => {
  const businessId = c.get('business_id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM working_hours WHERE business_id = ? ORDER BY day_of_week ASC, open_time ASC'
  )
    .bind(businessId)
    .all();

  return c.json({ schedules: results || [] });
});

// Set working hours (Owner only)
ownerRouter.put('/hours', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const body = await c.req.json().catch(() => null);
  const parsed = BulkWorkingHoursSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid working hours schedule format',
        },
      },
      422
    );
  }

  const { schedules } = parsed.data;

  // Validate no intraday interval overlaps
  const byDay = new Map<number, typeof schedules>();
  for (const s of schedules) {
    if (s.is_closed === 1) continue;
    const list = byDay.get(s.day_of_week) || [];
    list.push(s);
    byDay.set(s.day_of_week, list);
  }

  for (const [day, list] of byDay.entries()) {
    list.sort((a, b) => a.open_time.localeCompare(b.open_time));
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].close_time > list[i + 1].open_time) {
        return c.json<ApiErrorResponse>(
          {
            error: {
              code: ERROR_CODES.VALIDATION_FAILED,
              message: `Overlapping hours on day ${day}: interval ${list[i].open_time}-${list[i].close_time} overlaps with ${list[i + 1].open_time}-${list[i + 1].close_time}`,
            },
          },
          422
        );
      }
    }
  }

  // Get primary resource
  const primaryResource = await c.env.DB.prepare(
    'SELECT id FROM resources WHERE business_id = ? AND is_default = 1 LIMIT 1'
  )
    .bind(businessId)
    .first<{ id: string }>();

  const resourceId = primaryResource?.id ?? null;
  const nowIso = new Date().toISOString();

  // Atomically replace working hours
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('DELETE FROM working_hours WHERE business_id = ?').bind(businessId),
  ];

  for (const s of schedules) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO working_hours (
          id, business_id, resource_id, day_of_week, open_time, close_time, is_closed, created_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(generateUUID(), businessId, resourceId, s.day_of_week, s.open_time, s.close_time, s.is_closed, nowIso)
    );
  }

  await c.env.DB.batch(statements);

  const { results: updatedSchedules } = await c.env.DB.prepare(
    'SELECT * FROM working_hours WHERE business_id = ? ORDER BY day_of_week ASC, open_time ASC'
  )
    .bind(businessId)
    .all();

  await recordAuditLog(c.env.DB, {
    business_id: businessId,
    actor_user_id: c.get('user_id'),
    action: 'UPDATE_WORKING_HOURS',
    target_type: 'working_hours',
    target_id: businessId,
    payload_json: updatedSchedules,
  });

  return c.json({ schedules: updatedSchedules, success: true });
});

// --- 4. BREAKS, HOLIDAYS & BLOCKED PERIODS ---

// List breaks
ownerRouter.get('/breaks', async (c) => {
  const businessId = c.get('business_id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM breaks WHERE business_id = ? ORDER BY day_of_week ASC, start_time ASC'
  )
    .bind(businessId)
    .all();
  return c.json({ breaks: results || [] });
});

// Add break (Owner only)
ownerRouter.post('/breaks', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateBreakSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid break parameters',
        },
      },
      422
    );
  }

  const { day_of_week, start_time, end_time } = parsed.data;
  const id = generateUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO breaks (id, business_id, day_of_week, start_time, end_time, created_at_utc)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, businessId, day_of_week, start_time, end_time, nowIso)
    .run();

  const created = await c.env.DB.prepare('SELECT * FROM breaks WHERE id = ?').bind(id).first();
  return c.json({ break: created }, 201);
});

// Delete break (Owner only)
ownerRouter.delete('/breaks/:id', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const breakId = c.req.param('id') || '';

  const res = await c.env.DB.prepare('DELETE FROM breaks WHERE id = ? AND business_id = ?')
    .bind(breakId, businessId)
    .run();

  if (res.meta.changes === 0) {
    return c.json<ApiErrorResponse>({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Break not found' } }, 404);
  }

  return c.json({ success: true });
});

// List holidays
ownerRouter.get('/holidays', async (c) => {
  const businessId = c.get('business_id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM holidays WHERE business_id = ? ORDER BY holiday_date ASC'
  )
    .bind(businessId)
    .all();
  return c.json({ holidays: results || [] });
});

// Add holiday (Owner only)
ownerRouter.post('/holidays', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateHolidaySchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid holiday parameters',
        },
      },
      422
    );
  }

  const { holiday_date, name } = parsed.data;
  const id = generateUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO holidays (id, business_id, holiday_date, name, created_at_utc)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, businessId, holiday_date, name, nowIso)
    .run();

  const created = await c.env.DB.prepare('SELECT * FROM holidays WHERE id = ?').bind(id).first();
  return c.json({ holiday: created }, 201);
});

// Delete holiday (Owner only)
ownerRouter.delete('/holidays/:id', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const holidayId = c.req.param('id') || '';

  const res = await c.env.DB.prepare('DELETE FROM holidays WHERE id = ? AND business_id = ?')
    .bind(holidayId, businessId)
    .run();

  if (res.meta.changes === 0) {
    return c.json<ApiErrorResponse>({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Holiday not found' } }, 404);
  }

  return c.json({ success: true });
});

// List blocked periods
ownerRouter.get('/blocked-periods', async (c) => {
  const businessId = c.get('business_id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM blocked_periods WHERE business_id = ? ORDER BY start_at_utc ASC'
  )
    .bind(businessId)
    .all();
  return c.json({ blocked_periods: results || [] });
});

// Add blocked period (Owner only)
ownerRouter.post('/blocked-periods', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const body = await c.req.json().catch(() => null);
  const parsed = CreateBlockedPeriodSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid blocked period parameters',
        },
      },
      422
    );
  }

  const { start_at_utc, end_at_utc, reason } = parsed.data;
  const id = generateUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO blocked_periods (id, business_id, start_at_utc, end_at_utc, reason, created_at_utc)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, businessId, start_at_utc, end_at_utc, reason ?? '', nowIso)
    .run();

  const created = await c.env.DB.prepare('SELECT * FROM blocked_periods WHERE id = ?').bind(id).first();
  return c.json({ blocked_period: created }, 201);
});

// Delete blocked period (Owner only)
ownerRouter.delete('/blocked-periods/:id', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const periodId = c.req.param('id') || '';

  const res = await c.env.DB.prepare('DELETE FROM blocked_periods WHERE id = ? AND business_id = ?')
    .bind(periodId, businessId)
    .run();

  if (res.meta.changes === 0) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Blocked period not found' } },
      404
    );
  }

  return c.json({ success: true });
});


// --- 6. OWNER DASHBOARD & APPOINTMENTS (C1-C5) ---

// Dynamic Today metrics, next appointment, and today's schedule
ownerRouter.get('/dashboard/today', async (c) => {
  const businessId = c.get('business_id');

  const business = await c.env.DB.prepare('SELECT id, timezone, currency FROM businesses WHERE id = ?')
    .bind(businessId)
    .first<{ id: string; timezone: string; currency: string }>();

  if (!business) {
    return c.json<ApiErrorResponse>({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Business not found' } }, 404);
  }

  const tz = business.timezone || 'Asia/Kolkata';
  const now = new Date();
  const nowUtcIso = now.toISOString();

  // Determine current local date in the business timezone
  const localParts = utcToLocal(nowUtcIso, tz);
  const todayDateStr = localParts.date; // 'YYYY-MM-DD'

  // Calculate start and end of today in business timezone converted to UTC ISO strings
  const todayStartUtc = localToUtc(todayDateStr, '00:00', tz);
  const [y, m, d] = todayDateStr.split('-').map(Number);
  const tomorrowD = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrowDateStr = tomorrowD.toISOString().slice(0, 10);
  const todayEndUtc = localToUtc(tomorrowDateStr, '00:00', tz);

  // Fetch all bookings for today
  const bookingsRes = await c.env.DB.prepare(
    `SELECT b.id, b.reference, b.start_at_utc, b.end_at_utc, b.status, b.source,
            b.price_minor, b.currency, b.notes, b.possible_match,
            c.id AS customer_id, c.name AS customer_name, c.display_phone AS customer_phone,
            c.normalized_phone, c.email AS customer_email,
            s.id AS service_id, s.name AS service_name, s.duration_minutes
     FROM bookings b
     JOIN customers c ON b.customer_id = c.id
     JOIN services s ON b.service_id = s.id
     WHERE b.business_id = ?
       AND b.start_at_utc >= ?
       AND b.start_at_utc < ?
     ORDER BY b.start_at_utc ASC`
  )
    .bind(businessId, todayStartUtc, todayEndUtc)
    .all();

  const bookings = bookingsRes.results || [];

  let totalBookings = bookings.length;
  let confirmedCount = 0;
  let pendingCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let noShowCount = 0;
  let completedRevenueMinor = 0;
  let expectedRevenueMinor = 0;

  for (const b of bookings as any[]) {
    if (b.status === 'confirmed') {
      confirmedCount++;
      expectedRevenueMinor += b.price_minor;
    } else if (b.status === 'pending') {
      pendingCount++;
      expectedRevenueMinor += b.price_minor;
    } else if (b.status === 'completed') {
      completedCount++;
      completedRevenueMinor += b.price_minor;
      expectedRevenueMinor += b.price_minor;
    } else if (b.status === 'cancelled') {
      cancelledCount++;
    } else if (b.status === 'no_show') {
      noShowCount++;
    }
  }

  // Next up appointment
  const nextUp = (bookings as any[]).find(
    (b) => ['pending', 'confirmed'].includes(b.status) && new Date(b.end_at_utc).getTime() > now.getTime()
  ) || null;

  // Needs Attention triage count (C4)
  const pendingApprovalsRes = await c.env.DB.prepare(
    `SELECT COUNT(*) as count FROM bookings WHERE business_id = ? AND status = 'pending'`
  ).bind(businessId).first<{ count: number }>();

  const needsAttentionCount = pendingApprovalsRes?.count || 0;

  return c.json({
    today_date: todayDateStr,
    timezone: tz,
    currency: business.currency || 'INR',
    metrics: {
      total: totalBookings,
      confirmed: confirmedCount,
      pending: pendingCount,
      completed: completedCount,
      cancelled: cancelledCount,
      no_show: noShowCount,
      completed_revenue_minor: completedRevenueMinor,
      expected_revenue_minor: expectedRevenueMinor,
      needs_attention: needsAttentionCount,
    },
    next_up: nextUp,
    bookings,
  });
});

// List bookings with date filter, status filter, search query, limit/offset
ownerRouter.get('/bookings', async (c) => {
  const businessId = c.get('business_id');

  const business = await c.env.DB.prepare('SELECT timezone FROM businesses WHERE id = ?')
    .bind(businessId)
    .first<{ timezone: string }>();

  const tz = business?.timezone || 'Asia/Kolkata';

  const dateParam = c.req.query('date');
  const statusParam = c.req.query('status');
  const queryParam = c.req.query('q')?.trim();
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);
  const offset = Number(c.req.query('offset')) || 0;

  let sql = `
    SELECT b.id, b.reference, b.start_at_utc, b.end_at_utc, b.business_timezone,
           b.source, b.status, b.price_minor, b.currency, b.version, b.notes,
           b.possible_match, b.cancelled_reason, b.created_at_utc,
           c.id AS customer_id, c.name AS customer_name, c.display_phone AS customer_phone,
           c.normalized_phone, c.email AS customer_email,
           s.id AS service_id, s.name AS service_name, s.duration_minutes
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN services s ON b.service_id = s.id
    WHERE b.business_id = ?
  `;
  const params: any[] = [businessId];

  if (dateParam) {
    const dayStartUtc = localToUtc(dateParam, '00:00', tz);
    const [y, m, d] = dateParam.split('-').map(Number);
    const nextD = new Date(Date.UTC(y, m - 1, d + 1));
    const nextDateStr = nextD.toISOString().slice(0, 10);
    const dayEndUtc = localToUtc(nextDateStr, '00:00', tz);

    sql += ` AND b.start_at_utc >= ? AND b.start_at_utc < ?`;
    params.push(dayStartUtc, dayEndUtc);
  }

  if (statusParam && statusParam !== 'all') {
    sql += ` AND b.status = ?`;
    params.push(statusParam);
  }

  if (queryParam) {
    sql += ` AND (c.name LIKE ? OR c.display_phone LIKE ? OR c.normalized_phone LIKE ? OR b.reference LIKE ?)`;
    const searchWildcard = `%${queryParam}%`;
    params.push(searchWildcard, searchWildcard, searchWildcard, searchWildcard);
  }

  sql += ` ORDER BY b.start_at_utc ASC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const stmt = c.env.DB.prepare(sql).bind(...params);
  const res = await stmt.all();

  return c.json({
    bookings: res.results || [],
    limit,
    offset,
  });
});

// Quick Add walk-in / phone / whatsapp booking by owner
ownerRouter.post('/bookings', async (c) => {
  const businessId = c.get('business_id');
  const userId = c.get('user_id');

  const body = await c.req.json().catch(() => ({}));
  const parsed = OwnerCreateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid booking data',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        },
      },
      422
    );
  }

  const {
    customer_id,
    customer_name,
    customer_phone,
    customer_email,
    service_id,
    resource_id,
    start_at_utc,
    source,
    notes,
  } = parsed.data;

  // 1. Fetch business
  const business = await c.env.DB.prepare(
    'SELECT id, timezone, country_code, currency FROM businesses WHERE id = ?'
  )
    .bind(businessId)
    .first<{ id: string; timezone: string; country_code: string; currency: string }>();

  if (!business) {
    return c.json<ApiErrorResponse>({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Business not found' } }, 404);
  }

  // 2. Fetch service
  const service = await c.env.DB.prepare(
    'SELECT id, name, duration_minutes, buffer_minutes, price_minor, currency FROM services WHERE id = ? AND business_id = ? AND is_active = 1'
  )
    .bind(service_id, businessId)
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
      { error: { code: ERROR_CODES.NOT_FOUND, message: 'Selected service is invalid or inactive' } },
      404
    );
  }

  // 3. Normalize phone
  const phoneNormalized = normalizePhone(customer_phone, (business.country_code as any) || 'IN');
  if (!phoneNormalized.valid) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Please provide a valid phone number',
          fields: { customer_phone: 'Invalid phone number format' },
        },
      },
      422
    );
  }

  // 4. Default resource if not provided
  let assignedResourceId = resource_id;
  if (!assignedResourceId) {
    const resRow = await c.env.DB.prepare(
      'SELECT id FROM resources WHERE business_id = ? AND is_default = 1 LIMIT 1'
    ).bind(businessId).first<{ id: string }>();

    assignedResourceId = resRow?.id || (await c.env.DB.prepare('SELECT id FROM resources WHERE business_id = ? LIMIT 1').bind(businessId).first<{ id: string }>())?.id;
  }

  if (!assignedResourceId) {
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.INTERNAL, message: 'No scheduling resource configured' } },
      500
    );
  }

  // 5. Calculate slot intervals
  const startMs = new Date(start_at_utc).getTime();
  const endMs = startMs + service.duration_minutes * 60 * 1000;
  const bufferEndMs = endMs + service.buffer_minutes * 60 * 1000;
  const endAtUtc = new Date(endMs).toISOString();
  const bufferEndAtUtc = new Date(bufferEndMs).toISOString();

  const requiredCells = computeSlotCells(start_at_utc, bufferEndAtUtc);

  // 6. Customer lookup or creation
  let finalCustomerId = customer_id;
  let possibleMatch = 0;
  const nowIso = new Date().toISOString();

  let existingCustomer: { id: string; name: string; email: string | null; pending_deletion?: number } | null = null;

  if (finalCustomerId) {
    existingCustomer = await c.env.DB.prepare(
      'SELECT id, name, email, pending_deletion FROM customers WHERE id = ? AND business_id = ?'
    )
      .bind(finalCustomerId, businessId)
      .first<{ id: string; name: string; email: string | null; pending_deletion: number }>();

    // Check alias if not found directly
    if (!existingCustomer) {
      const alias = await c.env.DB.prepare(
        'SELECT new_customer_id FROM customer_aliases WHERE old_customer_id = ? AND business_id = ?'
      )
        .bind(finalCustomerId, businessId)
        .first<{ new_customer_id: string }>();

      if (alias) {
        finalCustomerId = alias.new_customer_id;
        existingCustomer = await c.env.DB.prepare(
          'SELECT id, name, email, pending_deletion FROM customers WHERE id = ? AND business_id = ?'
        )
          .bind(finalCustomerId, businessId)
          .first<{ id: string; name: string; email: string | null; pending_deletion: number }>();
      }
    }
  }

  if (!existingCustomer) {
    existingCustomer = await c.env.DB.prepare(
      'SELECT id, name, email, pending_deletion FROM customers WHERE business_id = ? AND normalized_phone = ?'
    )
      .bind(businessId, phoneNormalized.e164)
      .first<{ id: string; name: string; email: string | null; pending_deletion: number }>();
  }

  // Pending deletion check
  if (existingCustomer && existingCustomer.pending_deletion === 1) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Cannot create appointments for a customer marked for deletion',
        },
      },
      422
    );
  }

  const statements: D1PreparedStatement[] = [];

  if (existingCustomer) {
    finalCustomerId = existingCustomer.id;
    if (existingCustomer.name.trim().toLowerCase() !== customer_name.trim().toLowerCase()) {
      possibleMatch = 1;
    }
    if (!existingCustomer.email && customer_email) {
      statements.push(
        c.env.DB.prepare('UPDATE customers SET email = ?, updated_at_utc = ? WHERE id = ?')
          .bind(customer_email.trim(), nowIso, finalCustomerId)
      );
    }
  } else {
    finalCustomerId = generateUUID();
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO customers (
          id, business_id, normalized_phone, display_phone, name, email,
          consent_email_reminders, consent_whatsapp_reminders, consent_at_utc,
          created_at_utc, updated_at_utc
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`
      ).bind(
        finalCustomerId,
        businessId,
        phoneNormalized.e164,
        phoneNormalized.display,
        customer_name.trim(),
        customer_email ? customer_email.trim() : null,
        nowIso,
        nowIso,
        nowIso
      )
    );
  }

  // 7. Booking details (HMAC-derived token, SEC-04)
  const reference = generateReferenceCode();
  const bookingId = generateUUID();
  const tokenSecret = c.env.TOKEN_SECRET || c.env.SESSION_SECRET || 'syncslot_token_secret_fallback';
  const rawManageToken = await deriveHmacToken(tokenSecret, `${businessId}:${bookingId}`);
  const manageTokenHash = await sha256Hex(rawManageToken);

  statements.push(
    c.env.DB.prepare(
      `INSERT INTO bookings (
        id, reference, manage_token_hash, business_id, customer_id, service_id, resource_id,
        start_at_utc, end_at_utc, business_timezone, source, status, price_minor, currency,
        version, notes, possible_match, consent_email_reminders, created_at_utc, updated_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, 1, ?, ?, 1, ?, ?)`
    ).bind(
      bookingId,
      reference,
      manageTokenHash,
      businessId,
      finalCustomerId,
      service.id,
      assignedResourceId,
      start_at_utc,
      endAtUtc,
      business.timezone,
      source || 'phone',
      service.price_minor,
      business.currency || 'INR',
      notes ? notes.trim() : '',
      possibleMatch,
      nowIso,
      nowIso
    )
  );

  // 8. Slot Cells
  for (const cell of requiredCells) {
    statements.push(
      c.env.DB.prepare(
        'INSERT INTO slot_cells (resource_id, cell_start_utc, booking_id) VALUES (?, ?, ?)'
      ).bind(assignedResourceId, cell, bookingId)
    );
  }

  // 9. Booking Audit Event
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO booking_events (
        id, booking_id, business_id, actor_type, actor_id, event_type,
        to_status, payload_json, created_at_utc
      ) VALUES (?, ?, ?, 'owner', ?, 'BOOKING_CREATED', 'confirmed', ?, ?)`
    ).bind(
      generateUUID(),
      bookingId,
      businessId,
      userId,
      JSON.stringify({ source: source || 'phone', cells_count: requiredCells.length, quick_add: true }),
      nowIso
    )
  );

  // Execute atomic batch
  try {
    await c.env.DB.batch(statements);
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('UNIQUE constraint failed') || errMsg.includes('slot_cells')) {
      return c.json<ApiErrorResponse>(
        { error: { code: ERROR_CODES.SLOT_TAKEN, message: 'This slot is already booked. Please choose another time.' } },
        409
      );
    }
    console.error('Owner Quick Add booking error:', errMsg);
    return c.json<ApiErrorResponse>(
      { error: { code: ERROR_CODES.INTERNAL, message: 'Could not create booking. Please retry.' } },
      500
    );
  }

  // Seam notification
  await dispatchBookingNotificationHook(c.env.DB, bookingId, 'BOOKING_CREATED');

  // Fetch created booking for response
  const created = await c.env.DB.prepare(
    `SELECT b.id, b.reference, b.start_at_utc, b.end_at_utc, b.business_timezone,
            b.source, b.status, b.price_minor, b.currency, b.version, b.notes,
            b.possible_match,
            c.id AS customer_id, c.name AS customer_name, c.display_phone AS customer_phone,
            s.id AS service_id, s.name AS service_name, s.duration_minutes
     FROM bookings b
     JOIN customers c ON b.customer_id = c.id
     JOIN services s ON b.service_id = s.id
     WHERE b.id = ?`
  ).bind(bookingId).first();

  return c.json({ booking: created }, 201);
});

// Booking details + audit event log
ownerRouter.get('/bookings/:id', async (c) => {
  const businessId = c.get('business_id');
  const bookingId = c.req.param('id');

  const booking = await c.env.DB.prepare(
    `SELECT b.id, b.reference, b.start_at_utc, b.end_at_utc, b.business_timezone,
            b.source, b.status, b.price_minor, b.currency, b.version, b.notes,
            b.possible_match, b.cancelled_reason, b.created_at_utc, b.updated_at_utc,
            c.id AS customer_id, c.name AS customer_name, c.display_phone AS customer_phone,
            c.normalized_phone, c.email AS customer_email,
            s.id AS service_id, s.name AS service_name, s.duration_minutes, s.buffer_minutes,
            r.id AS resource_id, r.name AS resource_name
     FROM bookings b
     JOIN customers c ON b.customer_id = c.id
     JOIN services s ON b.service_id = s.id
     LEFT JOIN resources r ON b.resource_id = r.id
     WHERE b.id = ? AND b.business_id = ?`
  )
    .bind(bookingId, businessId)
    .first();

  if (!booking) {
    return c.json<ApiErrorResponse>({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Booking not found' } }, 404);
  }

  // Audit event log
  const eventsRes = await c.env.DB.prepare(
    `SELECT id, actor_type, actor_id, event_type, from_status, to_status, payload_json, created_at_utc
     FROM booking_events
     WHERE booking_id = ? AND business_id = ?
     ORDER BY created_at_utc ASC`
  )
    .bind(bookingId, businessId)
    .all();

  return c.json({
    booking,
    events: eventsRes.results || [],
  });
});

// Update booking status with state machine checks and slot freeing
ownerRouter.patch('/bookings/:id/status', async (c) => {
  const businessId = c.get('business_id');
  const userId = c.get('user_id');
  const bookingId = c.req.param('id');

  const body = await c.req.json().catch(() => ({}));
  const parsed = StatusTransitionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid status transition input',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        },
      },
      422
    );
  }

  const { status: targetStatus, reason } = parsed.data;

  // Fetch current booking
  const current = await c.env.DB.prepare(
    `SELECT id, status, version FROM bookings WHERE id = ? AND business_id = ?`
  )
    .bind(bookingId, businessId)
    .first<{ id: string; status: string; version: number }>();

  if (!current) {
    return c.json<ApiErrorResponse>({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Booking not found' } }, 404);
  }

  const currentStatus = current.status;

  // State machine rules:
  // Cannot alter a cancelled booking
  if (currentStatus === 'cancelled' && targetStatus !== 'cancelled') {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.ILLEGAL_TRANSITION,
          message: 'Cannot change status of a cancelled booking',
        },
      },
      400
    );
  }

  // Cannot alter a completed booking
  if (currentStatus === 'completed' && targetStatus !== 'completed') {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.ILLEGAL_TRANSITION,
          message: 'Cannot change status of an already completed booking',
        },
      },
      400
    );
  }

  // If already at target status, return early
  if (currentStatus === targetStatus) {
    return c.json({ success: true, status: targetStatus, version: current.version });
  }

  const nowIso = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];

  // If transitioning to cancelled: free the reserved slot cells
  if (targetStatus === 'cancelled') {
    statements.push(
      c.env.DB.prepare('DELETE FROM slot_cells WHERE booking_id = ?').bind(bookingId)
    );
  }

  // Update booking status
  statements.push(
    c.env.DB.prepare(
      `UPDATE bookings
       SET status = ?,
           cancelled_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_reason END,
           version = version + 1,
           updated_at_utc = ?
       WHERE id = ? AND business_id = ?`
    ).bind(targetStatus, targetStatus, reason || null, nowIso, bookingId, businessId)
  );

  // Audit event
  statements.push(
    c.env.DB.prepare(
      `INSERT INTO booking_events (
        id, booking_id, business_id, actor_type, actor_id, event_type,
        from_status, to_status, payload_json, created_at_utc
      ) VALUES (?, ?, ?, 'owner', ?, 'STATUS_CHANGED', ?, ?, ?, ?)`
    ).bind(
      generateUUID(),
      bookingId,
      businessId,
      userId,
      currentStatus,
      targetStatus,
      JSON.stringify({ reason: reason || null }),
      nowIso
    )
  );

  await c.env.DB.batch(statements);

  if (targetStatus === 'cancelled') {
    await dispatchBookingNotificationHook(c.env.DB, bookingId, 'BOOKING_CANCELLED');
  }

  const updated = await c.env.DB.prepare(
    `SELECT b.id, b.reference, b.start_at_utc, b.end_at_utc, b.status, b.version, b.cancelled_reason,
            c.name AS customer_name, s.name AS service_name
     FROM bookings b
     JOIN customers c ON b.customer_id = c.id
     JOIN services s ON b.service_id = s.id
     WHERE b.id = ?`
  ).bind(bookingId).first();

  return c.json({ success: true, booking: updated });
});


// --- 7. NOTIFICATIONS & REMINDER HEALTH (E1-E9) ---

// List notification jobs with filtering and delivery mode banner
ownerRouter.get('/notifications', async (c) => {
  const businessId = c.get('business_id');
  const statusParam = c.req.query('status');
  const bookingIdParam = c.req.query('booking_id');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);
  const offset = Number(c.req.query('offset')) || 0;

  // Determine delivery mode: real, sandbox, or dry_run
  const apiKey = c.env.RESEND_API_KEY?.trim();
  const pref = await c.env.DB.prepare(
    'SELECT sandbox_recipient_email FROM notification_preferences WHERE business_id = ?'
  ).bind(businessId).first<{ sandbox_recipient_email: string | null }>();

  let deliveryMode: 'real' | 'sandbox' | 'dry_run' = 'dry_run';
  if (apiKey && apiKey !== 'dry-run' && apiKey !== 'test') {
    deliveryMode = pref?.sandbox_recipient_email ? 'sandbox' : 'real';
  }

  let sql = `
    SELECT nj.id, nj.booking_id, nj.booking_version, nj.customer_id, nj.channel,
           nj.template_key, nj.due_at_utc, nj.status, nj.attempt_count, nj.next_attempt_at,
           nj.provider_message_id, nj.last_error_category, nj.created_at_utc, nj.updated_at_utc,
           c.name AS customer_name, c.display_phone AS customer_phone, c.normalized_phone, c.email AS customer_email,
           b.reference AS booking_reference, b.start_at_utc AS appointment_start_at_utc
    FROM notification_jobs nj
    JOIN customers c ON nj.customer_id = c.id
    JOIN bookings b ON nj.booking_id = b.id
    WHERE nj.business_id = ?
  `;
  const params: any[] = [businessId];

  if (statusParam && statusParam !== 'all') {
    if (statusParam === 'failed') {
      sql += ` AND nj.status IN ('failed', 'permanently_failed')`;
    } else {
      sql += ` AND nj.status = ?`;
      params.push(statusParam);
    }
  }

  if (bookingIdParam) {
    sql += ` AND nj.booking_id = ?`;
    params.push(bookingIdParam);
  }

  sql += ` ORDER BY nj.due_at_utc DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const res = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({
    delivery_mode: deliveryMode,
    sandbox_recipient: pref?.sandbox_recipient_email || null,
    jobs: res.results || [],
    limit,
    offset,
  });
});

// Manual retry of a failed or permanently_failed job through the claim function
ownerRouter.post('/notifications/:id/retry', async (c) => {
  const businessId = c.get('business_id');
  const jobId = c.req.param('id');

  const job = await c.env.DB.prepare(
    'SELECT id, status FROM notification_jobs WHERE id = ? AND business_id = ?'
  ).bind(jobId, businessId).first<{ id: string; status: string }>();

  if (!job) {
    return c.json<ApiErrorResponse>({ error: { code: ERROR_CODES.NOT_FOUND, message: 'Notification job not found' } }, 404);
  }

  const nowIso = new Date().toISOString();

  // Reset to queued and clear lock
  await c.env.DB.prepare(
    `UPDATE notification_jobs
     SET status = 'queued',
         next_attempt_at = ?,
         locked_until = NULL,
         updated_at_utc = ?
     WHERE id = ? AND business_id = ?`
  ).bind(nowIso, nowIso, jobId, businessId).run();

  // Execute processing through standard claim function
  await processNotificationQueue(c.env, 1);

  const updated = await c.env.DB.prepare(
    `SELECT nj.*, c.name AS customer_name, b.reference AS booking_reference
     FROM notification_jobs nj
     JOIN customers c ON nj.customer_id = c.id
     JOIN bookings b ON nj.booking_id = b.id
     WHERE nj.id = ?`
  ).bind(jobId).first();

  return c.json({ success: true, job: updated });
});

// Get notification preferences & quiet hours
ownerRouter.get('/notifications/preferences', async (c) => {
  const businessId = c.get('business_id');

  const [biz, pref, rules] = await Promise.all([
    c.env.DB.prepare('SELECT quiet_hours_start, quiet_hours_end FROM businesses WHERE id = ?')
      .bind(businessId)
      .first<{ quiet_hours_start: string; quiet_hours_end: string }>(),
    c.env.DB.prepare('SELECT * FROM notification_preferences WHERE business_id = ?')
      .bind(businessId)
      .first(),
    c.env.DB.prepare('SELECT * FROM reminder_rules WHERE business_id = ? ORDER BY offset_minutes DESC')
      .bind(businessId)
      .all(),
  ]);

  return c.json({
    preferences: pref || {},
    quiet_hours: {
      start: biz?.quiet_hours_start || '22:00',
      end: biz?.quiet_hours_end || '08:00',
    },
    reminder_rules: rules.results || [],
  });
});

// Update notification preferences & quiet hours
ownerRouter.patch('/notifications/preferences', async (c) => {
  const businessId = c.get('business_id');
  const body = (await c.req.json().catch(() => ({}))) as any;
  const nowIso = new Date().toISOString();

  const statements: D1PreparedStatement[] = [];

  // Quiet hours update on businesses table
  if (body.quiet_hours_start !== undefined || body.quiet_hours_end !== undefined) {
    const qStart = body.quiet_hours_start ?? '22:00';
    const qEnd = body.quiet_hours_end ?? '08:00';
    statements.push(
      c.env.DB.prepare(
        'UPDATE businesses SET quiet_hours_start = ?, quiet_hours_end = ?, updated_at_utc = ? WHERE id = ?'
      ).bind(qStart, qEnd, nowIso, businessId)
    );
  }

  // Preferences update
  if (
    body.enable_email !== undefined ||
    body.enable_whatsapp_manual !== undefined ||
    body.sender_name !== undefined ||
    body.reply_to_email !== undefined ||
    body.consent_copy_text !== undefined ||
    body.sandbox_recipient_email !== undefined
  ) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE notification_preferences
         SET enable_email = COALESCE(?, enable_email),
             enable_whatsapp_manual = COALESCE(?, enable_whatsapp_manual),
             sender_name = COALESCE(?, sender_name),
             reply_to_email = COALESCE(?, reply_to_email),
             consent_copy_text = COALESCE(?, consent_copy_text),
             sandbox_recipient_email = ?,
             created_at_utc = created_at_utc
         WHERE business_id = ?`
      ).bind(
        body.enable_email !== undefined ? (body.enable_email ? 1 : 0) : null,
        body.enable_whatsapp_manual !== undefined ? (body.enable_whatsapp_manual ? 1 : 0) : null,
        body.sender_name ?? null,
        body.reply_to_email ?? null,
        body.consent_copy_text ?? null,
        body.sandbox_recipient_email || null,
        businessId
      )
    );
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({ success: true });
});

// Configure reminder rules (enable / disable)
ownerRouter.put('/reminder-rules', async (c) => {
  const businessId = c.get('business_id');
  const body = (await c.req.json().catch(() => ({}))) as any;
  const rules = Array.isArray(body.rules) ? body.rules : [];
  const nowIso = new Date().toISOString();

  const statements: D1PreparedStatement[] = [];

  for (const r of rules) {
    if (r.offset_minutes && r.enabled !== undefined) {
      statements.push(
        c.env.DB.prepare(
          `UPDATE reminder_rules
           SET enabled = ?, updated_at_utc = ?
           WHERE business_id = ? AND offset_minutes = ?`
        ).bind(r.enabled ? 1 : 0, nowIso, businessId, Number(r.offset_minutes))
      );
    }
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  const updatedRules = await c.env.DB.prepare(
    'SELECT * FROM reminder_rules WHERE business_id = ? ORDER BY offset_minutes DESC'
  ).bind(businessId).all();

  return c.json({ rules: updatedRules.results || [] });
});

// ==========================================
// 8. CUSTOMER DIRECTORY & PROFILES (D1 - D6)
// ==========================================

// GET /api/owner/customers - Directory list with search, pagination, and visit stats
ownerRouter.get('/customers', async (c) => {
  const businessId = c.get('business_id');
  const q = c.req.query('q')?.trim();
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);
  const offset = Number(c.req.query('offset')) || 0;
  const pendingDelParam = c.req.query('pending_deletion');

  let whereSql = 'c.business_id = ?';
  const whereParams: any[] = [businessId];

  if (pendingDelParam !== undefined && pendingDelParam !== '') {
    whereSql += ' AND c.pending_deletion = ?';
    whereParams.push(pendingDelParam === '1' || pendingDelParam === 'true' ? 1 : 0);
  }

  if (q) {
    const wildcard = `%${q}%`;
    const phoneNorm = normalizePhone(q);
    if (phoneNorm.valid) {
      whereSql += ' AND (c.name LIKE ? OR c.display_phone LIKE ? OR c.normalized_phone = ? OR c.normalized_phone LIKE ? OR c.email LIKE ?)';
      whereParams.push(wildcard, wildcard, phoneNorm.e164, wildcard, wildcard);
    } else {
      whereSql += ' AND (c.name LIKE ? OR c.display_phone LIKE ? OR c.normalized_phone LIKE ? OR c.email LIKE ?)';
      whereParams.push(wildcard, wildcard, wildcard, wildcard);
    }
  }

  // Count total matching
  const countRes = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT c.id) AS total
     FROM customers c
     WHERE ${whereSql}`
  ).bind(...whereParams).first<{ total: number }>();

  const total = countRes?.total ?? 0;

  // Fetch paginated customers with aggregated visit metrics
  const listSql = `
    SELECT 
      c.id, c.business_id, c.name, c.display_phone, c.normalized_phone, c.email,
      c.pending_deletion, c.pending_deletion_at_utc,
      c.opted_out_at_utc, c.created_at_utc,
      COUNT(DISTINCT CASE WHEN b.status != 'cancelled' THEN b.id END) AS total_visits,
      MAX(CASE WHEN b.status != 'cancelled' THEN b.start_at_utc END) AS last_visit_at_utc,
      SUM(CASE WHEN b.status = 'completed' THEN b.price_minor ELSE 0 END) AS total_spend_minor
    FROM customers c
    LEFT JOIN bookings b ON c.id = b.customer_id AND b.business_id = c.business_id
    WHERE ${whereSql}
    GROUP BY c.id
    ORDER BY c.created_at_utc DESC
    LIMIT ? OFFSET ?
  `;

  const listParams = [...whereParams, limit, offset];
  const listRes = await c.env.DB.prepare(listSql).bind(...listParams).all();

  return c.json({
    customers: listRes.results || [],
    total,
    limit,
    offset,
  });
});

// POST /api/owner/customers/merge - Controlled duplicate merge (Owner only, D5)
ownerRouter.post('/customers/merge', requireOwnerRole, async (c) => {
  const businessId = c.get('business_id');
  const userId = c.get('user_id');

  const body = await c.req.json().catch(() => ({}));
  const parsed = MergeCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid merge request parameters',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        },
      },
      422
    );
  }

  const { old_customer_id, new_customer_id } = parsed.data;

  if (old_customer_id === new_customer_id) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Cannot merge a customer into themselves',
        },
      },
      422
    );
  }

  // Verify both exist in tenant
  const [oldCust, newCust] = await Promise.all([
    c.env.DB.prepare('SELECT id, name FROM customers WHERE id = ? AND business_id = ?').bind(old_customer_id, businessId).first<{ id: string; name: string }>(),
    c.env.DB.prepare('SELECT id, name FROM customers WHERE id = ? AND business_id = ?').bind(new_customer_id, businessId).first<{ id: string; name: string }>(),
  ]);

  if (!oldCust || !newCust) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'One or both customers could not be found in this business',
        },
      },
      404
    );
  }

  const nowIso = new Date().toISOString();

  // Perform atomic merge:
  // 1. Reassign bookings to new customer
  // 2. Reassign notes to new customer
  // 3. Insert into customer_aliases
  // 4. Delete old customer
  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE bookings SET customer_id = ?, updated_at_utc = ? WHERE customer_id = ? AND business_id = ?'
    ).bind(new_customer_id, nowIso, old_customer_id, businessId),
    c.env.DB.prepare(
      'UPDATE customer_notes SET customer_id = ? WHERE customer_id = ? AND business_id = ?'
    ).bind(new_customer_id, old_customer_id, businessId),
    c.env.DB.prepare(
      'INSERT OR REPLACE INTO customer_aliases (old_customer_id, new_customer_id, business_id, merged_at_utc) VALUES (?, ?, ?, ?)'
    ).bind(old_customer_id, new_customer_id, businessId, nowIso),
    c.env.DB.prepare(
      'DELETE FROM customers WHERE id = ? AND business_id = ?'
    ).bind(old_customer_id, businessId),
  ]);

  // Log audit event (no PII in payload)
  await recordAuditLog(c.env.DB, {
    business_id: businessId,
    actor_user_id: userId,
    action: 'CUSTOMER_MERGED',
    target_type: 'customer',
    target_id: new_customer_id,
    payload_json: JSON.stringify({ old_customer_id, new_customer_id }),
  });

  return c.json({
    success: true,
    old_customer_id,
    new_customer_id,
    merged_at_utc: nowIso,
  });
});

// GET /api/owner/customers/:id - Customer profile, timeline, and notes (D2, D6)
ownerRouter.get('/customers/:id', async (c) => {
  const businessId = c.get('business_id');
  const role = c.get('role');
  let customerId = c.req.param('id');

  let customer = await c.env.DB.prepare(
    `SELECT id, business_id, name, display_phone, normalized_phone, email,
            consent_email_reminders, consent_whatsapp_reminders, consent_at_utc,
            opted_out_at_utc, opt_out_reason, pending_deletion, pending_deletion_at_utc,
            created_at_utc, updated_at_utc
     FROM customers
     WHERE id = ? AND business_id = ?`
  ).bind(customerId, businessId).first<any>();

  let isMergedAlias = false;

  // Check alias if not found
  if (!customer) {
    const alias = await c.env.DB.prepare(
      'SELECT new_customer_id FROM customer_aliases WHERE old_customer_id = ? AND business_id = ?'
    ).bind(customerId, businessId).first<{ new_customer_id: string }>();

    if (alias) {
      isMergedAlias = true;
      customerId = alias.new_customer_id;
      customer = await c.env.DB.prepare(
        `SELECT id, business_id, name, display_phone, normalized_phone, email,
                consent_email_reminders, consent_whatsapp_reminders, consent_at_utc,
                opted_out_at_utc, opt_out_reason, pending_deletion, pending_deletion_at_utc,
                created_at_utc, updated_at_utc
         FROM customers
         WHERE id = ? AND business_id = ?`
      ).bind(customerId, businessId).first<any>();
    }
  }

  if (!customer) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Customer not found',
        },
      },
      404
    );
  }

  // Summary metrics
  const summaryRes = await c.env.DB.prepare(
    `SELECT 
       COUNT(id) AS total_bookings,
       COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_bookings,
       COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_bookings,
       COUNT(CASE WHEN status = 'no_show' THEN 1 END) AS no_show_bookings,
       COUNT(CASE WHEN status = 'confirmed' THEN 1 END) AS confirmed_bookings,
       SUM(CASE WHEN status = 'completed' THEN price_minor ELSE 0 END) AS total_spend_minor,
       MAX(CASE WHEN status IN ('completed', 'confirmed') THEN start_at_utc END) AS last_visit_at_utc
     FROM bookings
     WHERE customer_id = ? AND business_id = ?`
  ).bind(customerId, businessId).first<any>();

  // Next upcoming booking
  const nowIso = new Date().toISOString();
  const nextBooking = await c.env.DB.prepare(
    `SELECT b.id, b.reference, b.start_at_utc, b.end_at_utc, b.status, s.name AS service_name
     FROM bookings b
     JOIN services s ON b.service_id = s.id
     WHERE b.customer_id = ? AND b.business_id = ? AND b.status IN ('confirmed', 'pending') AND b.start_at_utc >= ?
     ORDER BY b.start_at_utc ASC
     LIMIT 1`
  ).bind(customerId, businessId, nowIso).first<any>();

  // Full booking history
  const bookingsRes = await c.env.DB.prepare(
    `SELECT b.id, b.reference, b.start_at_utc, b.end_at_utc, b.business_timezone,
            b.source, b.status, b.price_minor, b.currency, b.notes, b.possible_match,
            b.cancelled_reason, b.created_at_utc,
            s.id AS service_id, s.name AS service_name, s.duration_minutes
     FROM bookings b
     JOIN services s ON b.service_id = s.id
     WHERE b.customer_id = ? AND b.business_id = ?
     ORDER BY b.start_at_utc DESC`
  ).bind(customerId, businessId).all<any>();

  // Customer notes: filter is_private if user is staff (not owner)
  let notesSql = `
    SELECT cn.id, cn.note_text, cn.is_private, cn.created_at_utc,
           COALESCE(u.email, 'Staff') AS author_name,
           COALESCE(m.role, 'staff') AS author_role
    FROM customer_notes cn
    LEFT JOIN users u ON cn.author_user_id = u.id
    LEFT JOIN memberships m ON m.user_id = u.id AND m.business_id = cn.business_id
    WHERE cn.customer_id = ? AND cn.business_id = ?
  `;
  const notesParams: any[] = [customerId, businessId];

  if (role !== 'owner') {
    notesSql += ' AND cn.is_private = 0';
  }

  notesSql += ' ORDER BY cn.created_at_utc DESC';
  const notesRes = await c.env.DB.prepare(notesSql).bind(...notesParams).all();

  return c.json({
    customer: {
      ...customer,
      is_merged_alias: isMergedAlias,
    },
    summary: {
      total_bookings: summaryRes?.total_bookings ?? 0,
      completed_bookings: summaryRes?.completed_bookings ?? 0,
      cancelled_bookings: summaryRes?.cancelled_bookings ?? 0,
      no_show_bookings: summaryRes?.no_show_bookings ?? 0,
      confirmed_bookings: summaryRes?.confirmed_bookings ?? 0,
      total_spend_minor: summaryRes?.total_spend_minor ?? 0,
      last_visit_at_utc: summaryRes?.last_visit_at_utc ?? null,
      next_booking: nextBooking ?? null,
    },
    bookings: bookingsRes.results || [],
    notes: notesRes.results || [],
  });
});

// POST /api/owner/customers/:id/notes - Add relationship note (D2, D6, D7)
ownerRouter.post('/customers/:id/notes', async (c) => {
  const businessId = c.get('business_id');
  const userId = c.get('user_id');
  const customerId = c.req.param('id');

  // Verify customer exists
  const customer = await c.env.DB.prepare(
    'SELECT id FROM customers WHERE id = ? AND business_id = ?'
  ).bind(customerId, businessId).first();

  if (!customer) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Customer not found',
        },
      },
      404
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateCustomerNoteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid note data',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        },
      },
      422
    );
  }

  const { note_text, is_private } = parsed.data;
  const noteId = generateUUID();
  const nowIso = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO customer_notes (
      id, business_id, customer_id, author_user_id, note_text, is_private, created_at_utc
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    noteId,
    businessId,
    customerId,
    userId,
    note_text,
    is_private ? 1 : 0,
    nowIso
  ).run();

  const author = await c.env.DB.prepare(
    `SELECT u.email, COALESCE(m.role, 'staff') AS role
     FROM users u
     LEFT JOIN memberships m ON m.user_id = u.id AND m.business_id = ?
     WHERE u.id = ?`
  ).bind(businessId, userId).first<{ email: string; role: string }>();

  return c.json(
    {
      note: {
        id: noteId,
        business_id: businessId,
        customer_id: customerId,
        note_text,
        is_private: is_private ? 1 : 0,
        author_name: author?.email || 'Staff',
        author_role: author?.role || 'staff',
        created_at_utc: nowIso,
      },
    },
    201
  );
});

// DELETE /api/owner/customers/:id/notes/:noteId - Delete note
ownerRouter.delete('/customers/:id/notes/:noteId', async (c) => {
  const businessId = c.get('business_id');
  const customerId = c.req.param('id');
  const noteId = c.req.param('noteId');

  const note = await c.env.DB.prepare(
    'SELECT id FROM customer_notes WHERE id = ? AND customer_id = ? AND business_id = ?'
  ).bind(noteId, customerId, businessId).first();

  if (!note) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Note not found',
        },
      },
      404
    );
  }

  await c.env.DB.prepare(
    'DELETE FROM customer_notes WHERE id = ? AND customer_id = ? AND business_id = ?'
  ).bind(noteId, customerId, businessId).run();

  return c.json({ success: true });
});

// PATCH /api/owner/customers/:id - Update customer profile or pending_deletion status (D6)
ownerRouter.patch('/customers/:id', async (c) => {
  const businessId = c.get('business_id');
  const customerId = c.req.param('id');

  const customer = await c.env.DB.prepare(
    'SELECT id, name, email, pending_deletion FROM customers WHERE id = ? AND business_id = ?'
  ).bind(customerId, businessId).first<{ id: string; name: string; email: string | null; pending_deletion: number }>();

  if (!customer) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Customer not found',
        },
      },
      404
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid customer update fields',
          fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
        },
      },
      422
    );
  }

  const { name, email, pending_deletion } = parsed.data;
  const nowIso = new Date().toISOString();

  let newName = customer.name;
  if (name !== undefined) newName = name.trim();

  let newEmail = customer.email;
  if (email !== undefined) newEmail = email ? email.trim() : null;

  let newPendingDel = customer.pending_deletion;
  let newPendingDelAt: string | null = null;

  if (pending_deletion !== undefined) {
    newPendingDel = pending_deletion ? 1 : 0;
    newPendingDelAt = pending_deletion ? nowIso : null;
  }

  await c.env.DB.prepare(
    `UPDATE customers
     SET name = ?,
         email = ?,
         pending_deletion = ?,
         pending_deletion_at_utc = CASE WHEN ? IS NOT NULL THEN ? ELSE pending_deletion_at_utc END,
         updated_at_utc = ?
     WHERE id = ? AND business_id = ?`
  ).bind(
    newName,
    newEmail,
    newPendingDel,
    pending_deletion !== undefined ? newPendingDelAt : null,
    newPendingDelAt,
    nowIso,
    customerId,
    businessId
  ).run();

  const updated = await c.env.DB.prepare(
    'SELECT * FROM customers WHERE id = ? AND business_id = ?'
  ).bind(customerId, businessId).first();

  return c.json({ customer: updated });
});
