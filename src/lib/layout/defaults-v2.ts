import { nanoid } from 'nanoid';
import type { TypeLayoutV2, LayoutBlockV2 } from './types-v2';
import type { CustomField } from '@/lib/types';

export function generateDefaultLayoutV2(customFields: CustomField[]): TypeLayoutV2 {
  const sorted = [...customFields].sort((a, b) => a.sort_order - b.sort_order);

  const fieldBlocks: LayoutBlockV2[] = sorted.map((field) => ({
    id: nanoid(10),
    type: 'field_display',
    config: { fieldId: field.id, size: 'normal' as const, showLabel: true },
  }));

  return {
    version: 2,
    spacing: 'comfortable',
    peekBlockCount: 2,
    blocks: [
      { id: nanoid(10), type: 'status_badge', config: {} },
      { id: nanoid(10), type: 'photo_gallery', config: { style: 'hero' as const, maxPhotos: 4 } },
      ...fieldBlocks,
      { id: nanoid(10), type: 'description', config: { showLabel: true } },
      { id: nanoid(10), type: 'action_buttons', config: {} },
    ],
  };
}
