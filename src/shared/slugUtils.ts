// SlotSync Slug & Share Source Utilities

export const RESERVED_SLUGS = new Set([
  'app',
  'api',
  'b',
  'admin',
  'login',
  'register',
  'signup',
  'dev',
  'assets',
  'static',
  'www',
  'health',
  'status',
  'support',
  'help',
  'docs',
  'demo-admin',
]);

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * Validates a slug against length, formatting, and reserved words.
 * Returns null if valid, or an error string if invalid.
 */
export function validateSlug(rawSlug: string): string | null {
  const slug = rawSlug.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 40) {
    return 'Slug must be between 3 and 40 characters';
  }
  if (!SLUG_REGEX.test(slug)) {
    return 'Slug must only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `The slug "${slug}" is reserved and cannot be used`;
  }
  return null;
}

/**
 * Generates a clean URL slug from a business name.
 */
export function generateSlugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 35);

  const fallback = base.length >= 3 ? base : `biz-${Math.random().toString(36).slice(2, 6)}`;
  return RESERVED_SLUGS.has(fallback) ? `${fallback}-booking` : fallback;
}

/**
 * Whitelisted share link source tags.
 */
export const SHARE_SOURCE_TAGS = ['qr', 'whatsapp', 'instagram', 'website', 'link', 'other'] as const;
export type ShareSourceTag = (typeof SHARE_SOURCE_TAGS)[number];

export function buildShareUrl(baseUrl: string, slug: string, source: ShareSourceTag): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/b/${slug}?src=${source}`;
}
