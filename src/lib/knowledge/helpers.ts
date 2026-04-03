/**
 * Generate a URL-friendly slug from a title.
 * Appends a short random suffix to avoid collisions.
 */
export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/**
 * Strip HTML tags and extract plain text excerpt.
 */
export function generateExcerpt(html: string, maxLength = 200): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s\S*$/, '') + '…';
}

/**
 * Strip HTML to plain text for AI context inclusion.
 */
export function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
