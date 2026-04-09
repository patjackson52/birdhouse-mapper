import { describe, it, expect } from 'vitest';
import { generateDefaultLayoutV2 } from '../defaults-v2';
import { typeLayoutV2Schema } from '../schemas-v2';
import type { CustomField } from '@/lib/types';

describe('generateDefaultLayoutV2', () => {
  it('generates v2 layout with no custom fields', () => {
    const layout = generateDefaultLayoutV2([]);
    expect(layout.version).toBe(2);
    expect(layout.spacing).toBe('comfortable');
    expect(layout.peekBlockCount).toBe(2);
    // status_badge, photo_gallery, description, action_buttons
    expect(layout.blocks).toHaveLength(4);
    expect(layout.blocks[0].type).toBe('status_badge');
    expect(layout.blocks[1].type).toBe('photo_gallery');
    expect(layout.blocks[2].type).toBe('description');
    expect(layout.blocks[3].type).toBe('action_buttons');
  });

  it('inserts field_display blocks for custom fields', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'Species', field_type: 'text', options: null, required: false, sort_order: 0, org_id: 'o1' },
      { id: 'f2', item_type_id: 't1', name: 'Date', field_type: 'date', options: null, required: false, sort_order: 1, org_id: 'o1' },
    ];
    const layout = generateDefaultLayoutV2(fields);
    // status_badge, photo_gallery, f1, f2, description, action_buttons
    expect(layout.blocks).toHaveLength(6);
    expect(layout.blocks[2].type).toBe('field_display');
    expect(layout.blocks[3].type).toBe('field_display');
  });

  it('produces valid v2 schema output', () => {
    const fields: CustomField[] = [
      { id: 'f1', item_type_id: 't1', name: 'A', field_type: 'text', options: null, required: false, sort_order: 0, org_id: 'o1' },
    ];
    const layout = generateDefaultLayoutV2(fields);
    const result = typeLayoutV2Schema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  it('generates unique IDs for all blocks', () => {
    const layout = generateDefaultLayoutV2([]);
    const ids = layout.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
