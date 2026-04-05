export const RESERVED_SLUGS = new Set([
  'map', 'list', 'about', 'admin', 'auth', 'api', 'p',
]);

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export interface PageMeta {
  title: string;
  slug: string;
  createdAt: string;
}

/**
 * Validate a page slug. Returns an error message or null if valid.
 */
export function validatePageSlug(
  slug: string,
  existingMeta: Record<string, PageMeta>
): string | null {
  if (!slug) return 'URL slug is required';
  if (RESERVED_SLUGS.has(slug)) return 'This URL is reserved by the system';
  const path = `/${slug}`;
  if (path in existingMeta) return 'A page with this URL already exists';
  return null;
}
