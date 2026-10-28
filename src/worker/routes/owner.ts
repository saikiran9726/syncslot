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
} from '../../shared/schemas';
import { generateUUID, generateReferenceCode, generateSecretToken, sha256Hex } from '../../shared/idUtils';
import { recordAuditLog } from '../audit';
import { validateSlug } from '../../shared/slugUtils';
import { isValidTimezone } from '../../shared/timezoneUtils';
import { computeSlotCells } from '../../shared/slotCells';
import { normalizePhone } from '../../shared/phone';
import { localToUtc, utcToLocal } from '../../shared/availability';
import { dispatchBookingNotificationHook } from '../notificationsHook';

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
  let finalCustomerId = customer_id || generateUUID();
  let possibleMatch = 0;
  const nowIso = new Date().toISOString();

  const existingCustomer = await c.env.DB.prepare(
    'SELECT id, name, email FROM customers WHERE business_id = ? AND normalized_phone = ?'
  )
    .bind(businessId, phoneNormalized.e164)
    .first<{ id: string; name: string; email: string | null }>();

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

  // 7. Booking details
  const reference = generateReferenceCode();
  const rawManageToken = generateSecretToken();
  const manageTokenHash = await sha256Hex(rawManageToken);
  const bookingId = generateUUID();

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
