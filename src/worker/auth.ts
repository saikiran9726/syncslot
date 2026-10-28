// SlotSync Authentication & Cryptographic Utilities
// Implements WebCrypto PBKDF2-SHA256, constant-time compare, and session token hashing.

export const PBKDF2_ITERATIONS = 100000; // Cloudflare workerd hard limit
export const SALT_BYTE_LENGTH = 16;
export const KEY_BYTE_LENGTH = 32;

/**
 * Generates a random cryptographic salt as a hex string.
 */
export function generateSalt(): string {
  const bytes = new Uint8Array(SALT_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derives a PBKDF2-SHA256 hash using WebCrypto.
 * Returns a hex-encoded 256-bit key.
 */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const saltBytes = new Uint8Array(
    saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_BYTE_LENGTH * 8
  );

  return Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time comparison of two hex strings to protect against timing attacks.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies a plaintext password against a stored salt and hash.
 */
export async function verifyPassword(password: string, saltHex: string, storedHash: string): Promise<boolean> {
  const computedHash = await hashPassword(password, saltHex);
  return timingSafeEqualHex(computedHash, storedHash);
}

/**
 * Computes HMAC-SHA256 for privacy-preserving rate limit buckets.
 * Raw IP addresses or emails are never saved to disk.
 */
export async function computeBucketHash(salt: string, rawInput: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawInput.toLowerCase().trim()));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
