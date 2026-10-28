import { describe, it, expect } from 'vitest';
import { generateSalt, hashPassword, verifyPassword, timingSafeEqualHex, computeBucketHash, PBKDF2_ITERATIONS } from '../src/worker/auth';
import { generateReferenceCode, generateSecretToken, sha256Hex } from '../src/shared/idUtils';
import { normalizePhone, formatDisplayPhone } from '../src/shared/phoneUtils';
import { calculateSlotCells, calculateEndAtUtc, isAlignedToGrid } from '../src/shared/timeUtils';

describe('Cryptography, Auth, and Utility Primitives', () => {
  it('derives PBKDF2-SHA256 at 100,000 iterations within platform limits', async () => {
    expect(PBKDF2_ITERATIONS).toBe(100000);

    const password = 'TestSecurePassword123!';
    const salt = generateSalt();

    const startTime = Date.now();
    const hash = await hashPassword(password, salt);
    const durationMs = Date.now() - startTime;

    console.log(`[PBKDF2 Benchmark] 100,000 iterations took ${durationMs}ms`);
    expect(hash.length).toBe(64); // 256 bits = 64 hex chars
    expect(durationMs).toBeGreaterThan(0);

    // Verify password with correct credentials
    const isMatch = await verifyPassword(password, salt, hash);
    expect(isMatch).toBe(true);

    // Verify password with incorrect credentials
    const isFalse = await verifyPassword('WrongPassword!', salt, hash);
    expect(isFalse).toBe(false);
  });

  it('generates unique salts producing different hashes for identical passwords', async () => {
    const password = 'SamePasswordForBoth';
    const salt1 = generateSalt();
    const salt2 = generateSalt();

    expect(salt1).not.toBe(salt2);

    const hash1 = await hashPassword(password, salt1);
    const hash2 = await hashPassword(password, salt2);

    expect(hash1).not.toBe(hash2);
  });

  it('performs timing-safe hex comparison accurately', () => {
    const a = 'abcdef1234567890';
    const b = 'abcdef1234567890';
    const c = 'abcdef1234567891';
    const d = 'abcdef';

    expect(timingSafeEqualHex(a, b)).toBe(true);
    expect(timingSafeEqualHex(a, c)).toBe(false);
    expect(timingSafeEqualHex(a, d)).toBe(false);
  });

  it('generates 8-character Crockford base32 human reference codes without ambiguous characters', () => {
    for (let i = 0; i < 20; i++) {
      const ref = generateReferenceCode();
      expect(ref).toMatch(/^SS-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
      expect(ref).not.toMatch(/[01OIL]/); // No zero, one, O, I, L
    }
  });

  it('generates 32-byte secret tokens and computes SHA-256 hashes', async () => {
    const token = generateSecretToken();
    expect(token.length).toBeGreaterThanOrEqual(42);

    const hash1 = await sha256Hex(token);
    const hash2 = await sha256Hex(token);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it('computes privacy-safe deterministic HMAC bucket hashes for rate limiting', async () => {
    const salt = 'test-salt-123';
    const ip = '192.168.1.100';

    const hash1 = await computeBucketHash(salt, ip);
    const hash2 = await computeBucketHash(salt, ip);
    const hashOther = await computeBucketHash(salt, '192.168.1.101');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashOther);
    expect(hash1.length).toBe(64);
  });

  it('normalizes Indian phone numbers accurately to E.164 format', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('+1 (555) 234-5678')).toBe('+15552345678');
    expect(formatDisplayPhone('+919876543210')).toBe('+91 98765 43210');
  });

  it('computes slot cell intervals and grid alignment correctly', () => {
    expect(isAlignedToGrid('2026-10-29T10:00:00.000Z')).toBe(true);
    expect(isAlignedToGrid('2026-10-29T10:15:00.000Z')).toBe(true);
    expect(isAlignedToGrid('2026-10-29T10:07:00.000Z')).toBe(false);

    // 45 min total (30m service + 15m buffer) -> 3 cells
    const cells45 = calculateSlotCells('2026-10-29T10:00:00.000Z', 30, 15);
    expect(cells45).toEqual([
      '2026-10-29T10:00:00.000Z',
      '2026-10-29T10:15:00.000Z',
      '2026-10-29T10:30:00.000Z',
    ]);

    // Visible appointment end is strictly start + duration (ignoring buffer)
    expect(calculateEndAtUtc('2026-10-29T10:00:00.000Z', 30)).toBe('2026-10-29T10:30:00.000Z');
  });
});
