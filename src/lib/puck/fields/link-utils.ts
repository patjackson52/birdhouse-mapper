/** A link value that can be stored as a string (legacy) or object (new) */
export interface LinkValue {
  href: string;
  target?: '_blank';
  color?: string;
}

/** Icon value stored in Puck data */
export interface IconValue {
  set: 'lucide' | 'heroicons';
  name: string;
  style?: 'outline' | 'solid';
}

/**
 * Normalize a link field value to a LinkValue object.
 * Handles backwards compatibility: plain strings become { href }.
 * External URLs (http/https) default to target="_blank".
 */
export function resolveLink(value: string | LinkValue | undefined): LinkValue {
  if (!value) {
    return { href: '', target: undefined, color: undefined };
  }
  if (typeof value === 'string') {
    const isExternal = value.startsWith('http');
    return {
      href: value,
      target: isExternal ? '_blank' : undefined,
      color: undefined,
    };
  }
  return {
    href: value.href,
    target: value.target ?? undefined,
    color: value.color ?? undefined,
  };
}
