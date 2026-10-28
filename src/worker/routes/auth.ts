// SlotSync Auth Routes
// Registration, Login with Rate Limiting, Logout, and Session Verification

import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { AppBindings, AuthContext, requireAuth } from '../middleware';
import { ERROR_CODES, ApiErrorResponse } from '../../shared/errorCodes';
import { RegisterInputSchema, LoginInputSchema } from '../../shared/schemas';
import { generateSalt, hashPassword, verifyPassword } from '../auth';
import { generateUUID, generateSecretToken, sha256Hex } from '../../shared/idUtils';
import { checkLoginRateLimit, checkCustomRateLimit } from '../rateLimiter';
import { recordAuditLog } from '../audit';
import { INDUSTRY_PRESETS } from '../../shared/presets';

function getClientIp(c: any): string {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
}

export const authRouter = new Hono<{ Bindings: AppBindings; Variables: AuthContext }>();

// Register new business & owner
authRouter.post('/register', async (c) => {
  // Rate Limiting: 5 registrations per hour per IP (SEC-02)
  const ip = getClientIp(c);
  const rlSalt = c.env.RATE_LIMIT_SALT || 'salt';
  const rateCheck = await checkCustomRateLimit(c.env.DB, `register:${ip}`, 5, 3600, rlSalt);
  if (!rateCheck.allowed) {
    c.header('Retry-After', String(rateCheck.retryAfterSeconds ?? 3600));
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Too many registration attempts. Please try again later.',
        },
      },
      429
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = RegisterInputSchema.safeParse(body);

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    parsed.error.errors.forEach((e) => {
      if (e.path[0]) fields[e.path[0].toString()] = e.message;
    });
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid registration input',
          fields,
        },
      },
      422
    );
  }

  const { email, password, businessName, slug, timezone, industryPreset } = parsed.data;

  // Check if email or slug already taken
  const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existingUser) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.POLICY_VIOLATION,
          message: 'An account with this email already exists',
        },
      },
      409
    );
  }

  const existingSlug = await c.env.DB.prepare('SELECT id FROM businesses WHERE slug = ?').bind(slug).first();
  if (existingSlug) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.POLICY_VIOLATION,
          message: 'This public booking slug is already in use',
        },
      },
      409
    );
  }

  const userId = generateUUID();
  const businessId = generateUUID();
  const resourceId = generateUUID();
  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const sessionToken = generateSecretToken();
  const tokenHash = await sha256Hex(sessionToken);
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  // Prepare batch statements
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(userId, email, passwordHash, salt, nowIso, nowIso),

    c.env.DB.prepare(
      `INSERT INTO businesses (id, name, slug, timezone, industry_preset, onboarding_step, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(businessId, businessName, slug, timezone, industryPreset ?? 'salon', nowIso, nowIso),

    c.env.DB.prepare(
      `INSERT INTO memberships (id, business_id, user_id, role, created_at_utc)
       VALUES (?, ?, ?, 'owner', ?)`
    ).bind(generateUUID(), businessId, userId, nowIso),

    c.env.DB.prepare(
      `INSERT INTO resources (id, business_id, name, is_default, is_active, created_at_utc, updated_at_utc)
       VALUES (?, ?, 'Primary Staff', 1, 1, ?, ?)`
    ).bind(resourceId, businessId, nowIso, nowIso),

    c.env.DB.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at_utc, created_at_utc)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(generateUUID(), userId, tokenHash, expiresIso, nowIso),
  ];

  // Seed default working hours (Monday to Saturday 09:00 - 18:00, Sunday closed)
  for (let day = 0; day <= 6; day++) {
    const isClosed = day === 0 ? 1 : 0; // Sunday closed
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO working_hours (id, business_id, resource_id, day_of_week, open_time, close_time, is_closed, created_at_utc)
         VALUES (?, ?, ?, ?, '09:00', '18:00', ?, ?)`
      ).bind(generateUUID(), businessId, resourceId, day, isClosed, nowIso)
    );
  }

  // Seed default preset services if preset is salon or selected
  const selectedPreset = INDUSTRY_PRESETS[industryPreset ?? 'salon'];
  if (selectedPreset && selectedPreset.services) {
    for (const s of selectedPreset.services) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO services (id, business_id, name, description, duration_minutes, buffer_minutes, price_minor, currency, is_active, created_at_utc, updated_at_utc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        ).bind(
          generateUUID(),
          businessId,
          s.name,
          s.description,
          s.duration_minutes,
          s.buffer_minutes,
          s.price_minor,
          s.currency,
          nowIso,
          nowIso
        )
      );
    }
  }

  // Execute atomic registration batch
  await c.env.DB.batch(statements);

  // Record audit log
  await recordAuditLog(c.env.DB, {
    business_id: businessId,
    actor_user_id: userId,
    action: 'REGISTER_BUSINESS',
    target_type: 'business',
    target_id: businessId,
    payload_json: { name: businessName, slug, timezone, industryPreset },
  });

  // Set HttpOnly session cookie
  const cookieName = c.env.COOKIE_NAME || 'slotsync_session';
  const isProd = c.env.ENVIRONMENT === 'production';
  setCookie(c, cookieName, sessionToken, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60,
  });

  return c.json(
    {
      user: { id: userId, email },
      business: { id: businessId, name: businessName, slug, timezone, onboarding_step: 1, published: 0 },
      role: 'owner',
    },
    201
  );
});

// Login with Rate Limiting
authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = LoginInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Email and password required',
        },
      },
      422
    );
  }

  const { email, password } = parsed.data;

  // Rate Limiting (5 attempts per 15 min per IP/Email)
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const rateLimitSalt = c.env.RATE_LIMIT_SALT || 'slotsync-rate-limit-salt';
  const rateCheck = await checkLoginRateLimit(c.env.DB, `${ip}:${email}`, rateLimitSalt);

  if (!rateCheck.allowed) {
    c.header('Retry-After', String(rateCheck.retryAfterSeconds ?? 900));
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Too many login attempts. Please try again later.',
        },
      },
      429
    );
  }

  const user = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.password_salt,
            m.business_id, m.role,
            b.name as business_name, b.slug as business_slug, b.timezone,
            b.onboarding_step, b.published, b.is_demo
     FROM users u
     JOIN memberships m ON m.user_id = u.id
     JOIN businesses b ON m.business_id = b.id
     WHERE u.email = ?
     LIMIT 1`
  )
    .bind(email)
    .first<{
      id: string;
      email: string;
      password_hash: string;
      password_salt: string;
      business_id: string;
      role: 'owner' | 'staff';
      business_name: string;
      business_slug: string;
      timezone: string;
      onboarding_step: number;
      published: number;
      is_demo: number;
    }>();

  // Generic 401 error to prevent user enumeration
  if (!user) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.UNAUTHENTICATED,
          message: 'Invalid email or password',
        },
      },
      401
    );
  }

  const isValid = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!isValid) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.UNAUTHENTICATED,
          message: 'Invalid email or password',
        },
      },
      401
    );
  }

  // Create new session
  const sessionToken = generateSecretToken();
  const tokenHash = await sha256Hex(sessionToken);
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at_utc, created_at_utc)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(generateUUID(), user.id, tokenHash, expiresIso, nowIso)
    .run();

  const cookieName = c.env.COOKIE_NAME || 'slotsync_session';
  const isProd = c.env.ENVIRONMENT === 'production';
  setCookie(c, cookieName, sessionToken, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60,
  });

  return c.json({
    user: { id: user.id, email: user.email },
    business: {
      id: user.business_id,
      name: user.business_name,
      slug: user.business_slug,
      timezone: user.timezone,
      onboarding_step: user.onboarding_step,
      published: user.published,
      is_demo: user.is_demo,
    },
    role: user.role,
  });
});

// Logout
authRouter.post('/logout', requireAuth, async (c) => {
  const cookieName = c.env.COOKIE_NAME || 'slotsync_session';
  const token = c.req.header('Cookie') ? getCookie(c, cookieName) : null;
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  deleteCookie(c, cookieName, { path: '/' });
  return c.json({ success: true, message: 'Logged out successfully' });
});

// Session Info
authRouter.get('/me', requireAuth, async (c) => {
  const businessId = c.get('business_id');
  const biz = await c.env.DB.prepare(
    'SELECT onboarding_step, published, is_demo, timezone FROM businesses WHERE id = ?'
  )
    .bind(businessId)
    .first<{ onboarding_step: number; published: number; is_demo: number; timezone: string }>();

  return c.json({
    user: { id: c.get('user_id'), email: c.get('email') },
    business: {
      id: businessId,
      name: c.get('business_name'),
      slug: c.get('business_slug'),
      timezone: biz?.timezone || 'Asia/Kolkata',
      onboarding_step: biz?.onboarding_step ?? 1,
      published: biz?.published ?? 0,
      is_demo: biz?.is_demo ?? 0,
    },
    role: c.get('role'),
  });
});
