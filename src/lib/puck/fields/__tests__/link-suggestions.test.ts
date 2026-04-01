import { describe, it, expect } from 'vitest';
import { extractExternalLinks, PUBLIC_ROUTES, type LinkSuggestion } from '../link-suggestions';

describe('PUBLIC_ROUTES', () => {
  it('contains the four public-facing routes', () => {
    const paths = PUBLIC_ROUTES.map((r) => r.href);
    expect(paths).toEqual(['/', '/map', '/about', '/list']);
  });

  it('each route has a label', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.label).toBeTruthy();
    }
  });
});

describe('extractExternalLinks', () => {
  it('returns empty array for empty content', () => {
    const data = { root: { props: {} }, content: [] };
    expect(extractExternalLinks(data)).toEqual([]);
  });

  it('extracts href from LinkValue objects', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: {
            id: 'hero-1',
            title: 'Test',
            ctaHref: { href: 'https://example.com', target: '_blank' },
          },
        },
      ],
    };
    const result = extractExternalLinks(data);
    expect(result).toEqual([{ href: 'https://example.com', label: 'example.com' }]);
  });

  it('extracts plain string URLs starting with http', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Card',
          props: { id: 'card-1', linkHref: 'https://troop1564.org/info' },
        },
      ],
    };
    const result = extractExternalLinks(data);
    expect(result).toEqual([{ href: 'https://troop1564.org/info', label: 'troop1564.org' }]);
  });

  it('ignores internal URLs', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: { id: 'hero-1', ctaHref: { href: '/map' } },
        },
        {
          type: 'Card',
          props: { id: 'card-1', linkHref: '/about' },
        },
      ],
    };
    expect(extractExternalLinks(data)).toEqual([]);
  });

  it('deduplicates by URL', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'Hero',
          props: { id: 'hero-1', ctaHref: { href: 'https://example.com' } },
        },
        {
          type: 'Card',
          props: { id: 'card-1', linkHref: 'https://example.com' },
        },
      ],
    };
    const result = extractExternalLinks(data);
    expect(result).toHaveLength(1);
  });

  it('extracts links from nested array props (buttons, items)', () => {
    const data = {
      root: { props: {} },
      content: [
        {
          type: 'ButtonGroup',
          props: {
            id: 'bg-1',
            buttons: [
              { label: 'Visit', href: { href: 'https://a.com' } },
              { label: 'More', href: { href: 'https://b.com' } },
            ],
          },
        },
      ],
    };
    const result = extractExternalLinks(data);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.href)).toContain('https://a.com');
    expect(result.map((r) => r.href)).toContain('https://b.com');
  });

  it('extracts links from zones', () => {
    const data = {
      root: { props: {} },
      content: [],
      zones: {
        'Section-1:content': [
          {
            type: 'Card',
            props: { id: 'card-z', linkHref: 'https://zone-link.com' },
          },
        ],
      },
    };
    const result = extractExternalLinks(data);
    expect(result).toEqual([{ href: 'https://zone-link.com', label: 'zone-link.com' }]);
  });

  it('handles malformed data gracefully', () => {
    expect(extractExternalLinks({ root: { props: {} }, content: [] })).toEqual([]);
    expect(extractExternalLinks(null as any)).toEqual([]);
    expect(extractExternalLinks(undefined as any)).toEqual([]);
  });
});
