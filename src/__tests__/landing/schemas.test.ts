import { describe, it, expect } from 'vitest';
import { landingBlocksSchema } from '@/lib/landing/schemas';

describe('landingBlocksSchema', () => {
  it('validates a valid hero block', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'hero', title: 'Hello', subtitle: 'World' },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a valid text block', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'text', content: '# Hello' },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a valid button block', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'button', label: 'Click', href: '/map' },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a stats block with auto source', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'stats', source: 'auto' },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a stats block with manual source and items', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'stats', source: 'manual', items: [{ label: 'Count', value: '42' }] },
    ]);
    expect(result.success).toBe(true);
  });

  it('validates a complete block array with multiple types', () => {
    const blocks = [
      { id: '1', type: 'hero', title: 'Welcome' },
      { id: '2', type: 'text', content: 'Description' },
      { id: '3', type: 'image', url: 'img.jpg', alt: 'Photo' },
      { id: '4', type: 'button', label: 'Go', href: '/map' },
      { id: '5', type: 'links', items: [{ label: 'Link', url: 'https://example.com' }] },
      { id: '6', type: 'stats', source: 'auto' },
      { id: '7', type: 'gallery', images: [{ url: 'a.jpg', alt: 'A' }] },
      { id: '8', type: 'spacer', size: 'medium' },
    ];
    const result = landingBlocksSchema.safeParse(blocks);
    expect(result.success).toBe(true);
  });

  it('rejects invalid block type', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'invalid', content: 'test' },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects hero block missing title', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'hero' },
    ]);
    expect(result.success).toBe(false);
  });

  it('applies default values for optional fields', () => {
    const result = landingBlocksSchema.safeParse([
      { id: '1', type: 'button', label: 'Click', href: '/map' },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const button = result.data[0];
      if (button.type === 'button') {
        expect(button.style).toBe('primary');
        expect(button.size).toBe('default');
      }
    }
  });
});
