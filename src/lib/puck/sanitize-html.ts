/**
 * HTML sanitization for Puck richtext field content.
 *
 * Allowlist lives in this file. To extend (e.g. permit tables in Puck pages),
 * add the tag to ALLOWED_TAGS and any new attributes to ALLOWED_ATTR.
 *
 * Called from sanitizePuckDataForWrite (sanitize-data.ts) on every save.
 */
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'a',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'h4',
  'br',
  'hr',
  'img',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'width', 'height'];

// DOMPurify defaults reject javascript:, data:, vbscript: in URI attributes.
// We rely on those defaults rather than overriding ALLOWED_URI_REGEXP.

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // Auto-add rel for target=_blank links.
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
  // Strip any data-* attributes that DOMPurify lets through by default.
  const toRemove: string[] = [];
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i];
    if (attr.name.startsWith('data-')) toRemove.push(attr.name);
  }
  toRemove.forEach((name) => node.removeAttribute(name));
});

/**
 * Sanitize a single richtext HTML string.
 *
 * Strips all tags not on the allowlist (text content kept), drops all
 * attributes not on the allowlist, removes javascript:/data: URI schemes,
 * auto-adds rel="noopener noreferrer" to target=_blank links, and collapses
 * runs of 2+ NBSP/space characters to a single ASCII space (isolated NBSPs
 * preserved).
 */
export function sanitizeRichTextHtml(input: string): string {
  if (!input) return '';
  try {
    const sanitized = DOMPurify.sanitize(input, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
    });
    // DOMPurify (via jsdom) encodes U+00A0 as &nbsp; — decode it back so
    // callers receive the literal character, and NBSP normalization works.
    const decoded = sanitized.replace(/&nbsp;/g, ' ');
    return normalizeNbsp(decoded);
  } catch {
    return '';
  }
}

// Match runs of 2+ of: U+0020 (ASCII space) or U+00A0 (NBSP), in any mix.
const NBSP_RUN_REGEX = /[  ]{2,}/g;

function normalizeNbsp(html: string): string {
  return html.replace(NBSP_RUN_REGEX, ' ');
}
