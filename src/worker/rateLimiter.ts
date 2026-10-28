// SlotSync Rate Limiter
// Privacy-preserving rate limiting backed by D1 rate_limits table

import { computeBucketHash } from './auth';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5;

export async function checkLoginRateLimit(
  db: D1Database,
  identifier: string,
  salt: string
): Promise<RateLimitResult> {
  return checkCustomRateLimit(
    db,
    `login:${identifier.toLowerCase().trim()}`,
    MAX_LOGIN_ATTEMPTS,
    LOGIN_WINDOW_MS / 1000,
    salt
  );
}

export async function checkCustomRateLimit(
  db: D1Database,
  key: string,
  maxAttempts: number,
  windowSeconds: number,
  salt: string
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStartUtc = new Date(windowStartMs).toISOString();

  const bucketHash = await computeBucketHash(key, salt);

  const existing = await db
    .prepare('SELECT count FROM rate_limits WHERE bucket_hash = ? AND window_start_utc = ?')
    .bind(bucketHash, windowStartUtc)
    .first<{ count: number }>();

  const currentCount = existing?.count ?? 0;

  if (currentCount >= maxAttempts) {
    const retryAfter = Math.ceil((windowStartMs + windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfter),
    };
  }

  // Increment or create count
  await db
    .prepare(
      `INSERT INTO rate_limits (bucket_hash, window_start_utc, count)
       VALUES (?, ?, 1)
       ON CONFLICT(bucket_hash, window_start_utc) DO UPDATE SET count = count + 1`
    )
    .bind(bucketHash, windowStartUtc)
    .run();

  return {
    allowed: true,
    remaining: maxAttempts - (currentCount + 1),
  };
}
