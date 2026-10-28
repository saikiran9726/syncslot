// SlotSync ID and Token Generation Utilities

// Crockford base32 excluding confusing characters (0, O, 1, I, L)
const CROCKFORD_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generates an 8-character human-readable reference code: SS-XXXXXXXX
 * Crockford base32 ensures ease of phone reading and zero 0/O or 1/I confusion.
 */
export function generateReferenceCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CROCKFORD_ALPHABET[bytes[i] % CROCKFORD_ALPHABET.length];
  }
  return `SS-${code}`;
}

export const generateHumanReference = generateReferenceCode;


/**
 * Generates a 32-byte secure random token encoded as base64url.
 * Used for customer self-service manage links and session tokens.
 */
export function generateSecretToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Convert to base64url
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Computes a standard SHA-256 hex hash of a string using WebCrypto.
 * Stored in DB for token authentication (never plain token).
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
