import { nanoid } from 'nanoid';
import type { TypeLayout, LayoutBlock } from './types';
import type { CustomField } from '@/lib/types';

export function generateDefaultLayout(customFields: CustomField[]): TypeLayout {
  const sorted = [...customFields].sort((a, b) => a.sort_order - b.sort_order);

  const fieldBlocks: LayoutBlock[] = sorted.map((field) => ({
    id: nanoid(10),
    type: 'field_display',
    config: { fieldId: field.id, size: 'normal' as const, showLabel: true },
  }));

  return {
    version: 1,
    spacing: 'comfortable',
    peekBlockCount: 2,
    blocks: [
      { id: nanoid(10), type: 'status_badge', config: {} },
      { id: nanoid(10), type: 'photo_gallery', config: { style: 'hero' as const, maxPhotos: 4 } },
      ...fieldBlocks,
      { id: nanoid(10), type: 'action_buttons', config: {} },
    ],
  };
}
