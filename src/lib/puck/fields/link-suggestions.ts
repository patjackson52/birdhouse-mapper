export interface LinkSuggestion {
  href: string;
  label: string;
}

export const PUBLIC_ROUTES: LinkSuggestion[] = [
  { href: '/', label: 'Home' },
  { href: '/map', label: 'Map' },
  { href: '/about', label: 'About' },
  { href: '/list', label: 'List' },
];

/**
 * Extract deduplicated external URLs from puck data.
 * Walks content and zones, inspects all props for LinkValue objects
 * or plain strings starting with "http".
 */
export function extractExternalLinks(data: any): LinkSuggestion[] {
  if (!data) return [];

  const seen = new Set<string>();
  const results: LinkSuggestion[] = [];

  function addIfExternal(value: unknown) {
    let href: string | undefined;
    if (typeof value === 'string' && value.startsWith('http')) {
      href = value;
    } else if (
      value &&
      typeof value === 'object' &&
      'href' in value &&
      typeof (value as any).href === 'string' &&
      (value as any).href.startsWith('http')
    ) {
      href = (value as any).href;
    }
    if (href && !seen.has(href)) {
      seen.add(href);
      try {
        const hostname = new URL(href).hostname;
        results.push({ href, label: hostname });
      } catch {
        results.push({ href, label: href });
      }
    }
  }

  function walkProps(props: Record<string, unknown>) {
    for (const value of Object.values(props)) {
      if (value === null || value === undefined) continue;
      addIfExternal(value);
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') {
            walkProps(item as Record<string, unknown>);
          }
        }
      }
    }
  }

  function walkComponents(components: any[]) {
    if (!Array.isArray(components)) return;
    for (const component of components) {
      if (component?.props) {
        walkProps(component.props);
      }
    }
  }

  walkComponents(data.content);

  if (data.zones && typeof data.zones === 'object') {
    for (const zoneComponents of Object.values(data.zones)) {
      walkComponents(zoneComponents as any[]);
    }
  }

  return results;
}
