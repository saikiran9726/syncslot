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
} from '../../shared/schemas';
import { generateUUID } from '../../shared/idUtils';
import { recordAuditLog } from '../audit';
import { validateSlug } from '../../shared/slugUtils';
import { isValidTimezone } from '../../shared/timezoneUtils';

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
