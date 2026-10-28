// SlotSync Timezone Utilities
// Provides full IANA timezones with static fallbacks and runtime validation

export const STATIC_TIMEZONE_FALLBACKS = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

export function getSupportedTimezones(): string[] {
  try {
    if (typeof Intl !== 'undefined' && typeof (Intl as any).supportedValuesOf === 'function') {
      const zones = (Intl as any).supportedValuesOf('timeZone') as string[];
      if (zones && zones.length > 0) {
        if (!zones.includes('Asia/Kolkata')) {
          return ['Asia/Kolkata', ...zones];
        }
        return zones;
      }
    }
  } catch {
    // Ignore and fallback
  }
  return STATIC_TIMEZONE_FALLBACKS;
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
