import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { app } from '../src/worker/index';
import { deriveHmacToken, sha256Hex } from '../src/shared/idUtils';
import { ERROR_CODES } from '../src/shared/errorCodes';

describe('Phase 9 — Security Hardening, Cryptography, and Accessibility Verifications', () => {
  const testEnv = {
    ...env,
    ENVIRONMENT: 'development',
    APP_BASE_URL: 'http://localhost:3000',
    COOKIE_NAME: 'slotsync_session',
    EMAIL_FROM: 'SlotSync <notifications@slotsync.local>',
    RATE_LIMIT_SALT: 'test-salt-secret-phase9',
    SESSION_SECRET: 'test-session-secret-phase9-hardening',
    TOKEN_SECRET: 'test-token-secret-phase9-hardening',
  };

  it('SEC-01: Verifies strict CSP, X-Content-Type-Options, X-Frame-Options, and Referrer-Policy headers', async () => {
    const res = await app.fetch(new Request('http://localhost:3000/api/health'), testEnv as any);
    expect(res.status).toBe(200);

    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toContain('geolocation=()');
  });

  it('SEC-04: HMAC Manage Token derivation is deterministic and strictly one-way hashed for DB storage', async () => {
    const businessId = 'biz-uuid-12345';
    const bookingId = 'book-uuid-67890';
    const tokenSecret = 'super-secret-key-for-hmac';

    const token1 = await deriveHmacToken(tokenSecret, `${businessId}:${bookingId}`);
    const token2 = await deriveHmacToken(tokenSecret, `${businessId}:${bookingId}`);

    // Deterministic replay
    expect(token1).toBe(token2);
    expect(token1.length).toBe(64); // 32 hex bytes

    // Different booking yields completely different token
    const tokenOther = await deriveHmacToken(tokenSecret, `${businessId}:other-booking`);
    expect(tokenOther).not.toBe(token1);

    // Stored hash
    const hash = await sha256Hex(token1);
    expect(hash.length).toBe(64);
    expect(hash).not.toBe(token1);
  });

  it('SEC-02: Rate limits registration to 5 attempts per window per IP', async () => {
    const ip = '198.51.100.42';
    const headers = {
      'Content-Type': 'application/json',
      'cf-connecting-ip': ip,
      Origin: 'http://localhost:3000',
    };

    // Make 5 registration attempts (even if failing validation, rate limiter decrements)
    for (let i = 0; i < 5; i++) {
      const res = await app.fetch(
        new Request('http://localhost:3000/api/auth/register', {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: `rl-${i}@test.com` }),
        }),
        testEnv as any
      );
      // First 5 shouldn't be 429
      expect(res.status).not.toBe(429);
    }

    // 6th attempt must be 429
    const blockedRes = await app.fetch(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: 'rl-blocked@test.com' }),
      }),
      testEnv as any
    );
    expect(blockedRes.status).toBe(429);
    const body = (await blockedRes.json()) as any;
    expect(body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(blockedRes.headers.get('Retry-After')).toBeDefined();
  });

  it('SEC-05: Returns 500 Internal Error at runtime when RATE_LIMIT_SALT is missing in production', async () => {
    const prodEnvWithoutSalt = {
      ...testEnv,
      ENVIRONMENT: 'production',
      RATE_LIMIT_SALT: '',
    };

    const res = await app.fetch(
      new Request('http://localhost:3000/api/health'),
      prodEnvWithoutSalt as any
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe(ERROR_CODES.INTERNAL);
    expect(body.error.message).toContain('RATE_LIMIT_SALT required in production');
  });

  it('SEC-07: Blocks cross-origin mutating requests', async () => {
    const res = await app.fetch(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://malicious-attacker.com',
        },
        body: JSON.stringify({ email: 'owner@test.com', password: 'password123' }),
      }),
      testEnv as any
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });
});
