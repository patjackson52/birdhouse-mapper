import { describe, it, expect } from 'vitest';
import { typeLayoutSchema } from '../schemas';

describe('typeLayoutSchema', () => {
  it('accepts a valid layout with blocks', () => {
    const layout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 4 } },
        {
          id: 'b3',
          type: 'field_display',
          config: { fieldId: 'f1', size: 'normal', showLabel: true },
          hideWhenEmpty: true,
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts a layout with a row', () => {
    const layout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'field_display', config: { fieldId: 'f1', size: 'compact', showLabel: true } },
            { id: 'b2', type: 'field_display', config: { fieldId: 'f2', size: 'compact', showLabel: true } },
          ],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'compact',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts row with number[] distribution', () => {
    const layout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'text_label', config: { text: 'Hello', style: 'heading' } },
          ],
          gap: 'tight',
          distribution: [2, 1],
        },
      ],
      spacing: 'spacious',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('rejects empty blocks array', () => {
    const layout = {
      version: 1,
      blocks: [],
      spacing: 'comfortable',
      peekBlockCount: 0,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects invalid block type', () => {
    const layout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'unknown_block', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects row with fewer than 2 children', () => {
    const layout = {
      version: 1,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [{ id: 'b1', type: 'status_badge', config: {} }],
          gap: 'normal',
          distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects row with more than 4 children', () => {
    const children = Array.from({ length: 5 }, (_, i) => ({
      id: `b${i}`,
      type: 'status_badge' as const,
      config: {},
    }));
    const layout = {
      version: 1,
      blocks: [{ id: 'r1', type: 'row', children, gap: 'normal', distribution: 'equal' }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects maxPhotos outside 1-20', () => {
    const layout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 25 } }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects invalid spacing preset', () => {
    const layout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'divider', config: {} }],
      spacing: 'extra-wide',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('defaults to version 1', () => {
    const layout = {
      blocks: [{ id: 'b1', type: 'divider', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
    }
  });
});
