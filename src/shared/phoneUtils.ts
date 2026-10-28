// SlotSync Phone Normalization & Formatting

/**
 * Normalizes phone numbers to standard E.164 format.
 * Default country is India (+91) for 10-digit input.
 * Strips spaces, dashes, parentheses.
 */
export function normalizePhone(rawPhone: string, defaultCountry = 'IN'): string {
  if (!rawPhone) return '';
  const trimmed = rawPhone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    return `+${digitsOnly}`;
  }

  // Handle Indian 10-digit numbers
  if (defaultCountry === 'IN') {
    if (digitsOnly.length === 10) {
      return `+91${digitsOnly}`;
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      return `+91${digitsOnly.slice(1)}`;
    }
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      return `+${digitsOnly}`;
    }
  }

  // Fallback: prepend + if not empty
  return digitsOnly ? `+${digitsOnly}` : '';
}

/**
 * Formats an E.164 phone into a readable local display format.
 * e.g. +919876543210 -> +91 98765 43210
 */
export function formatDisplayPhone(e164: string): string {
  if (!e164) return '';
  if (e164.startsWith('+91') && e164.length === 13) {
    return `+91 ${e164.slice(3, 8)} ${e164.slice(8)}`;
  }
  return e164;
}
