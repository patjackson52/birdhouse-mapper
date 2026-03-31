import { describe, it, expect } from 'vitest';
import { puckDataSchema, puckPagesSchema, isAllowedEmbedUrl } from '../schemas';

describe('puckDataSchema', () => {
  it('validates minimal Puck data', () => {
    const data = { root: { props: {} }, content: [] };
    expect(puckDataSchema.parse(data)).toEqual(data);
  });

  it('validates Puck data with components', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'Hero', props: { title: 'Hello', subtitle: 'World' } },
        { type: 'Stats', props: { source: 'auto' } },
      ],
    };
    expect(puckDataSchema.parse(data)).toEqual(data);
  });

  it('validates Puck data with zones', () => {
    const data = {
      root: { props: {} },
      content: [
        { type: 'Columns', props: { columnCount: 2 } },
      ],
      zones: {
        'Columns-1:column-0': [
          { type: 'RichText', props: { content: 'Left col' } },
        ],
        'Columns-1:column-1': [
          { type: 'ImageBlock', props: { url: '/img.jpg' } },
        ],
      },
    };
    expect(puckDataSchema.parse(data)).toEqual(data);
  });

  it('applies defaults for missing root/content', () => {
    const result = puckDataSchema.parse({});
    expect(result.root).toEqual({ props: {} });
    expect(result.content).toEqual([]);
  });

  it('rejects content items without type', () => {
    expect(() =>
      puckDataSchema.parse({ content: [{ props: {} }] })
    ).toThrow();
  });
});

describe('puckPagesSchema', () => {
  it('validates a pages map', () => {
    const pages = {
      '/': { root: { props: {} }, content: [{ type: 'Hero', props: { title: 'Home' } }] },
    };
    expect(puckPagesSchema.parse(pages)).toEqual(pages);
  });
});

describe('isAllowedEmbedUrl', () => {
  it('allows YouTube URLs', () => {
    expect(isAllowedEmbedUrl('https://www.youtube.com/embed/abc123')).toBe(true);
    expect(isAllowedEmbedUrl('https://youtu.be/abc123')).toBe(true);
  });

  it('allows Vimeo URLs', () => {
    expect(isAllowedEmbedUrl('https://player.vimeo.com/video/123')).toBe(true);
  });

  it('allows Google Maps embeds', () => {
    expect(isAllowedEmbedUrl('https://www.google.com/maps/embed?pb=...')).toBe(true);
  });

  it('rejects unknown hosts', () => {
    expect(isAllowedEmbedUrl('https://evil.com/embed')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedEmbedUrl('not-a-url')).toBe(false);
  });
});
