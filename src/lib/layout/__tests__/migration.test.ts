import { describe, it, expect } from 'vitest';
import { migrateV1toV2 } from '../migration';
import { typeLayoutV2Schema } from '../schemas-v2';
import type { TypeLayout } from '../types';
import type { LayoutBlockV2 } from '../types-v2';

describe('migrateV1toV2', () => {
  it('sets version to 2', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const v2 = migrateV1toV2(v1);
    expect(v2.version).toBe(2);
  });

  it('preserves spacing and peekBlockCount', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'divider', config: {} }],
      spacing: 'spacious',
      peekBlockCount: 5,
    };
    const v2 = migrateV1toV2(v1);
    expect(v2.spacing).toBe('spacious');
    expect(v2.peekBlockCount).toBe(5);
  });

  it('preserves block configs, ids, and hideWhenEmpty', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'fd1',
          type: 'field_display',
          config: { fieldId: 'f1', size: 'large', showLabel: false },
          hideWhenEmpty: true,
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const block = v2.blocks[0] as LayoutBlockV2;
    expect(block.id).toBe('fd1');
    expect(block.type).toBe('field_display');
    expect(block.config).toEqual({ fieldId: 'f1', size: 'large', showLabel: false });
    expect(block.hideWhenEmpty).toBe(true);
  });

  it('does not add permissions to blocks', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const block = v2.blocks[0];
    expect('permissions' in block).toBe(false);
  });

  it('does not add width to top-level blocks', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [{ id: 'b1', type: 'status_badge', config: {} }],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const block = v2.blocks[0];
    expect('width' in block).toBe(false);
  });

  it('maps equal distribution with 2 children to 1/2 widths', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1', type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
          ],
          gap: 'normal', distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children[0].width).toBe('1/2');
      expect(row.children[1].width).toBe('1/2');
    }
  });

  it('maps equal distribution with 3 children to 1/3 widths', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1', type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
            { id: 'b3', type: 'divider', config: {} },
          ],
          gap: 'tight', distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children[0].width).toBe('1/3');
      expect(row.children[1].width).toBe('1/3');
      expect(row.children[2].width).toBe('1/3');
    }
  });

  it('maps equal distribution with 4 children to 1/4 widths', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1', type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
            { id: 'b3', type: 'divider', config: {} },
            { id: 'b4', type: 'divider', config: {} },
          ],
          gap: 'loose', distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children.every((c) => c.width === '1/4')).toBe(true);
    }
  });

  it('maps auto distribution to undefined widths', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1', type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
          ],
          gap: 'normal', distribution: 'auto',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children[0].width).toBeUndefined();
      expect(row.children[1].width).toBeUndefined();
    }
  });

  it('maps number[] distribution to nearest fractions', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1', type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
          ],
          gap: 'normal', distribution: [1, 2],
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children[0].width).toBe('1/3');
      expect(row.children[1].width).toBe('2/3');
    }
  });

  it('snaps 40% to 1/3 (closer to 33.3% than 50%)', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1', type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
          ],
          gap: 'normal', distribution: [2, 3],
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.children[0].width).toBe('1/3');
      expect(row.children[1].width).toBe('2/3');
    }
  });

  it('preserves row gap', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        {
          id: 'r1', type: 'row',
          children: [
            { id: 'b1', type: 'status_badge', config: {} },
            { id: 'b2', type: 'divider', config: {} },
          ],
          gap: 'loose', distribution: 'equal',
        },
      ],
      spacing: 'comfortable',
      peekBlockCount: 1,
    };
    const v2 = migrateV1toV2(v1);
    const row = v2.blocks[0];
    if (row.type === 'row') {
      expect(row.gap).toBe('loose');
    }
  });

  it('produces a valid v2 schema output (round-trip)', () => {
    const v1: TypeLayout = {
      version: 1,
      blocks: [
        { id: 'b1', type: 'status_badge', config: {} },
        { id: 'b2', type: 'photo_gallery', config: { style: 'hero', maxPhotos: 4 } },
        {
          id: 'r1', type: 'row',
          children: [
            { id: 'b3', type: 'field_display', config: { fieldId: 'f1', size: 'normal', showLabel: true } },
            { id: 'b4', type: 'field_display', config: { fieldId: 'f2', size: 'compact', showLabel: true } },
          ],
          gap: 'normal', distribution: 'equal',
        },
        { id: 'b5', type: 'action_buttons', config: {} },
      ],
      spacing: 'comfortable',
      peekBlockCount: 2,
    };
    const v2 = migrateV1toV2(v1);
    const result = typeLayoutV2Schema.safeParse(v2);
    expect(result.success).toBe(true);
  });
});
