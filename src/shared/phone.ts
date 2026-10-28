// SlotSync Shared Phone Normalization Module
// Uses libphonenumber-js (min metadata) to validate, format E.164, and format display strings

import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js/min';

export interface NormalizedPhone {
  e164: string;
  display: string;
  valid: boolean;
}

/**
 * Normalizes phone numbers to standard E.164 and local display formats.
 * @param input Raw input string from customer
 * @param defaultCountry ISO-3166-1 alpha-2 country code (default 'IN')
 */
export function normalizePhone(
  input: string,
  defaultCountry: CountryCode = 'IN'
): NormalizedPhone {
  if (!input || typeof input !== 'string') {
    return { e164: '', display: '', valid: false };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { e164: '', display: '', valid: false };
  }

  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);

    if (parsed && parsed.isValid()) {
      return {
        e164: parsed.format('E.164'),
        display: parsed.formatInternational(),
        valid: true,
      };
    }

    return {
      e164: trimmed,
      display: trimmed,
      valid: false,
    };
  } catch {
    return {
      e164: trimmed,
      display: trimmed,
      valid: false,
    };
  }
}
