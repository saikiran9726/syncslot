// SlotSync Middleware: Security Headers, CSRF/Origin Check,
// Rate Limiting, Idempotency, and Strict Tenant Isolation.

import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { StatusCode } from 'hono/utils/http-status';
import { ERROR_CODES, ApiErrorResponse } from '../shared/errorCodes';
import { sha256Hex } from '../shared/idUtils';
import { computeBucketHash } from './auth';

export interface AppBindings {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  APP_BASE_URL: string;
  COOKIE_NAME: string;
  EMAIL_FROM: string;
  RATE_LIMIT_SALT: string;
  SESSION_SECRET: string;
  TOKEN_SECRET?: string;
  RESEND_API_KEY?: string;
}

export interface AuthContext {
  user_id: string;
  email: string;
  business_id: string;
  business_slug: string;
  business_name: string;
  role: 'owner' | 'staff';
}

/**
 * Standard Security Headers Middleware
 */
export async function securityHeaders(c: Context, next: Next) {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'accelerometer=(), camera=(), microphone=(), geolocation=()');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
  );
}

/**
 * Origin Verification Middleware for Mutating HTTP Requests (CSRF Defense)
 */
export async function verifyOrigin(c: Context<{ Bindings: AppBindings }>, next: Next) {
  const method = c.req.method.toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = c.req.header('Origin');
    const allowedBase = c.env.APP_BASE_URL;

    // Allow requests if origin matches allowedBase or localhost during development
    if (origin) {
      const isAllowed =
        origin === allowedBase ||
        ((c.env.ENVIRONMENT === 'development' || c.env.ENVIRONMENT === 'test' || !c.env.ENVIRONMENT) &&
          (origin === 'http://localhost' || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1')));

      if (!isAllowed) {
        return c.json<ApiErrorResponse>(
          {
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: 'Cross-origin request blocked',
            },
          },
          403
        );
      }
    } else if (c.env.ENVIRONMENT === 'production') {
      const secFetchSite = c.req.header('Sec-Fetch-Site');
      if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site' && secFetchSite !== 'none') {
        return c.json<ApiErrorResponse>(
          {
            error: {
              code: ERROR_CODES.FORBIDDEN,
              message: 'Cross-origin request blocked',
            },
          },
          403
        );
      }
    }
  }
  await next();
}

/**
 * Strict Multi-Tenant Auth Middleware
 * Resolves session -> user -> membership -> business_id.
 * Private handlers never take business_id from the client body or params.
 */
export async function requireAuth(c: Context<{ Bindings: AppBindings; Variables: AuthContext }>, next: Next) {
  const cookieName = c.env.COOKIE_NAME || 'slotsync_session';
  const token = getCookie(c, cookieName);

  if (!token) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.UNAUTHENTICATED,
          message: 'Authentication session required',
        },
      },
      401
    );
  }

  const tokenHash = await sha256Hex(token);
  const nowIso = new Date().toISOString();

  // Resolve session, user, and business membership in one SQL query
  const sessionRecord = await c.env.DB.prepare(
    `SELECT s.id as session_id, s.expires_at_utc,
            u.id as user_id, u.email,
            m.business_id, m.role,
            b.slug as business_slug, b.name as business_name
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     JOIN memberships m ON m.user_id = u.id
     JOIN businesses b ON m.business_id = b.id
     WHERE s.token_hash = ? AND s.expires_at_utc > ?
     LIMIT 1`
  )
    .bind(tokenHash, nowIso)
    .first<{
      session_id: string;
      expires_at_utc: string;
      user_id: string;
      email: string;
      business_id: string;
      role: 'owner' | 'staff';
      business_slug: string;
      business_name: string;
    }>();

  if (!sessionRecord) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.UNAUTHENTICATED,
          message: 'Session invalid or expired',
        },
      },
      401
    );
  }

  // Inject resolved tenant context into Hono state
  c.set('user_id', sessionRecord.user_id);
  c.set('email', sessionRecord.email);
  c.set('business_id', sessionRecord.business_id);
  c.set('business_slug', sessionRecord.business_slug);
  c.set('business_name', sessionRecord.business_name);
  c.set('role', sessionRecord.role);

  await next();
}

/**
 * Ensures user has 'owner' role within their resolved tenant
 */
export async function requireOwnerRole(c: Context<{ Bindings: AppBindings; Variables: AuthContext }>, next: Next) {
  const role = c.get('role');
  if (role !== 'owner') {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Owner privileges required for this action',
        },
      },
      403
    );
  }
  await next();
}

/**
 * Idempotency Middleware
 * Returns cached response if (business_id, route, key) matches with same request_hash.
 * Returns 422 if key is reused with different request payload.
 */
export async function handleIdempotency(c: Context<{ Bindings: AppBindings; Variables: AuthContext }>, next: Next) {
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!idempotencyKey || !['POST', 'PUT', 'PATCH'].includes(c.req.method.toUpperCase())) {
    return next();
  }

  let businessId = c.get('business_id');
  if (!businessId) {
    const match = c.req.path.match(/\/api\/public\/([^/]+)/);
    if (match) {
      const slug = match[1].toLowerCase().trim();
      const row = await c.env.DB.prepare('SELECT id FROM businesses WHERE slug = ?').bind(slug).first<{ id: string }>();
      if (row) {
        businessId = row.id;
      }
    }
  }

  if (!businessId) {
    await next();
    return;
  }

  const route = c.req.path;
  const rawBody = await c.req.raw.clone().text();
  const requestHash = await sha256Hex(rawBody);

  const existing = await c.env.DB.prepare(
    `SELECT request_hash, response_status, response_json, expires_at_utc
     FROM idempotency_keys
     WHERE business_id = ? AND route = ? AND key = ?
     LIMIT 1`
  )
    .bind(businessId, route, idempotencyKey)
    .first<{
      request_hash: string;
      response_status: number;
      response_json: string;
      expires_at_utc: string;
    }>();

  if (existing) {
    if (new Date(existing.expires_at_utc) > new Date()) {
      if (existing.request_hash === requestHash) {
        return c.newResponse(existing.response_json, existing.response_status as StatusCode, {
          'Content-Type': 'application/json',
          'X-Idempotent-Replay': 'true',
        });
      } else {
        return c.json<ApiErrorResponse>(
          {
            error: {
              code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
              message: 'Idempotency key reused with differing request payload',
            },
          },
          422
        );
      }
    }
  }

  await next();

  // If response is successful (2xx), save it to idempotency_keys
  if (c.res.status >= 200 && c.res.status < 300) {
    try {
      const cloned = c.res.clone();
      const responseJson = await cloned.text();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await c.env.DB.prepare(
        `INSERT INTO idempotency_keys (key, business_id, route, request_hash, response_status, response_json, expires_at_utc)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(business_id, route, key) DO UPDATE SET
           request_hash = excluded.request_hash,
           response_status = excluded.response_status,
           response_json = excluded.response_json,
           expires_at_utc = excluded.expires_at_utc`
      )
        .bind(idempotencyKey, businessId, route, requestHash, c.res.status, responseJson, expiresAt)
        .run();
    } catch {
      // Non-fatal if idempotency caching fails
    }
  }
}
