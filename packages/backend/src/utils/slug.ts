export const RESERVED_SLUGS = new Set<string>([
  'api',
  'admin',
  'dashboard',
  'status',
  'auth',
  'login',
  'signup',
  'logout',
  '_app',
  'health',
]);

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Validates a slug. Returns an error message string if invalid, null if valid.
 */
export function validateSlug(slug: string): string | null {
  if (slug.length < 2 || slug.length > 50) {
    return 'Slug must be between 2 and 50 characters';
  }
  if (RESERVED_SLUGS.has(slug)) {
    return `"${slug}" is a reserved slug`;
  }
  if (!SLUG_REGEX.test(slug)) {
    return 'Slug must be lowercase letters, numbers, and hyphens';
  }
  return null;
}
