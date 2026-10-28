// SlotSync Cloudflare Worker Entrypoint
// Serves React SPA via static assets, handles /api/* REST routes, and executes Cron Triggers.

import { Hono } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { AppBindings, AuthContext, securityHeaders, verifyOrigin, requireAuth, handleIdempotency } from './middleware';
import { ERROR_CODES, ApiErrorResponse } from '../shared/errorCodes';
import { RegisterInputSchema, LoginInputSchema } from '../shared/schemas';
import { generateSalt, hashPassword, verifyPassword } from './auth';
import { generateUUID, generateSecretToken, sha256Hex } from '../shared/idUtils';

const app = new Hono<{ Bindings: AppBindings; Variables: AuthContext }>();

// Global Middleware
app.use('*', securityHeaders);
app.use('*', verifyOrigin);

// Global Error Handler
app.onError((err, c) => {
  console.error('[Worker Error]:', err.message);
  return c.json<ApiErrorResponse>(
    {
      error: {
        code: ERROR_CODES.INTERNAL,
        message: 'An internal server error occurred',
      },
    },
    500
  );
});

// --- API ROUTES ---
const api = new Hono<{ Bindings: AppBindings; Variables: AuthContext }>();

// Apply Idempotency to API mutations
api.use('*', handleIdempotency);

// Health check
api.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    service: 'syncslot-api',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

// --- AUTHENTICATION ROUTES ---

api.post('/auth/register', async (c) => {
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

  // Atomic batch creation: user, business, membership, default primary resource, session
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(userId, email, passwordHash, salt, nowIso, nowIso),

    c.env.DB.prepare(
      `INSERT INTO businesses (id, name, slug, timezone, industry_preset, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(businessId, businessName, slug, timezone, industryPreset, nowIso, nowIso),

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
  ]);

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
      business: { id: businessId, name: businessName, slug, timezone },
      role: 'owner',
    },
    201
  );
});

api.post('/auth/login', async (c) => {
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

  const user = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.password_salt,
            m.business_id, m.role,
            b.name as business_name, b.slug as business_slug, b.timezone
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
    }>();

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
    },
    role: user.role,
  });
});

api.post('/auth/logout', requireAuth, async (c) => {
  const cookieName = c.env.COOKIE_NAME || 'slotsync_session';
  const token = c.req.header('Cookie') ? getCookie(c, cookieName) : null;
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  deleteCookie(c, cookieName, { path: '/' });
  return c.json({ success: true, message: 'Logged out successfully' });
});

api.get('/auth/me', requireAuth, async (c) => {
  return c.json({
    user: { id: c.get('user_id'), email: c.get('email') },
    business: {
      id: c.get('business_id'),
      name: c.get('business_name'),
      slug: c.get('business_slug'),
    },
    role: c.get('role'),
  });
});

// API 404 handler
api.all('*', (c) => {
  return c.json<ApiErrorResponse>(
    {
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Endpoint not found',
      },
    },
    404
  );
});

// Mount /api
app.route('/api', api);

// SPA Static Assets Fallback
app.all('*', async (c) => {
  // In development without built assets, return a placeholder HTML page
  if (c.env.ASSETS) {
    try {
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    } catch {
      // Fallback
    }
  }

  return c.html(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SlotSync - Local Service Booking</title>
  </head>
  <body>
    <div id="root">
      <h1>SlotSync Worker Online</h1>
      <p>Frontend assets will be served here upon build.</p>
    </div>
  </body>
</html>`
  );
});

export default {
  fetch: app.fetch,

  /**
   * Cloudflare Cron Trigger Handler
   * Executes scheduled background tasks (appointment reminders)
   */
  async scheduled(event: ScheduledEvent, env: AppBindings, ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron Trigger] Executing at ${new Date(event.scheduledTime).toISOString()}`);
    // Phase 7 reminder claim and dispatch logic will be wired here
  },
};
