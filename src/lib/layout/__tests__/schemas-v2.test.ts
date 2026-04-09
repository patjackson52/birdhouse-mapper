import { describe, it, expect } from 'vitest';
import { typeLayoutV2Schema } from '../schemas-v2';

describe('typeLayoutV2Schema', () => {
  it('accepts a valid v2 layout with blocks', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        {
          id: 'b2',
          type: 'field_display',
          config: { fieldId: 'f1', size: 'normal', showLabel: true },
          width: '1/2',
          permissions: { requiredRole: 'editor' },
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts a description block', () => {
    const layout = {
      version: 2,
      blocks: [
        { id: 'b1', type: 'description', config: { showLabel: true, maxLines: 3 } },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts blocks without width (defaults to full)', () => {
    const layout = {
      version: 2,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts blocks without permissions', () => {
    const layout = {
      version: 2,
      blocks: [{ id: 'b1', type: 'divider', config: {} }],
      spacing: 'compact',
      peekBlockCount: 0,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts a v2 row with fractional widths', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {}, width: '1/3' },
            { id: 'b2', type: 'field_display', config: { fieldId: 'f1', size: 'compact', showLabel: true }, width: '2/3' },
          ],
          gap: 'normal',
        },
      ],
      spacing: 'compact',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('accepts a row with permissions', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
          ],
          gap: 'tight',
          permissions: { requiredRole: 'admin' },
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('rejects row children widths exceeding 100%', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {}, width: '3/4' },
            { id: 'b2', type: 'divider', config: {}, width: '1/2' },
          ],
          gap: 'normal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('accepts row children widths at exactly 100%', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1',
          type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {}, width: '1/2' },
            { id: 'b2', type: 'divider', config: {}, width: '1/2' },
          ],
          gap: 'normal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('rejects version 1', () => {
    const layout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects empty blocks array', () => {
    const layout = {
      version: 2,
      blocks: [],
      spacing: 'comfortable',
      peekBlockCount: 0,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects description block without showLabel', () => {
    const layout = {
      version: 2,
      blocks: [{ id: 'b1', type: 'description', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects invalid fractional width', () => {
    const layout = {
      version: 2,
      blocks: [{ id: 'b1', type: 'status_badge', config: {}, width: '1/5' }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects invalid requiredRole', () => {
    const layout = {
      version: 2,
      blocks: [{ id: 'b1', type: 'status_badge', config: {}, permissions: { requiredRole: 'superadmin' } }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects row with fewer than 2 children', () => {
    const layout = {
      version: 2,
      blocks: [
        {
          id: 'r1', type: 'row',
          children: [{ id: 'b1', type: 'status_badge', config: {} }],
          gap: 'normal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('rejects row with more than 4 children', () => {
    const children = Array.from({ length: 5 }, (_, i) => ({
      id: `b${i}`, type: 'status_badge' as const, config: {}, width: '1/4' as const,
    }));
    const layout = {
      version: 2,
      blocks: [{ id: 'r1', type: 'row', children, gap: 'normal' }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });

  it('accepts description maxLines within range', () => {
    const layout = {
      version: 2,
      blocks: [{ id: 'b1', type: 'description', config: { showLabel: false, maxLines: 50 } }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('rejects description maxLines outside range', () => {
    const layout = {
      version: 2,
      blocks: [{ id: 'b1', type: 'description', config: { showLabel: true, maxLines: 0 } }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(false);
  });
});
