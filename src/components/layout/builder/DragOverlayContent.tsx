'use client';

import { useMemo } from 'react';
import type { LayoutNode, TypeLayout } from '@/lib/layout/types';
import type { LayoutNodeV2, TypeLayoutV2, BlockTypeV2 } from '@/lib/layout/types-v2';
import { isLayoutRowV2 } from '@/lib/layout/types-v2';
import type { CustomField, ItemWithDetails } from '@/lib/types';
import LayoutRendererDispatch from '../LayoutRendererDispatch';

const BLOCK_LABELS: Record<BlockTypeV2, { icon: string; label: string }> = {
  field_display: { icon: '📊', label: 'Field' },
  photo_gallery: { icon: '📷', label: 'Photo' },
  status_badge: { icon: '🏷', label: 'Status' },
  entity_list: { icon: '🔗', label: 'Entities' },
  timeline: { icon: '📋', label: 'Timeline' },
  text_label: { icon: '✏️', label: 'Text' },
  description: { icon: '📝', label: 'Description' },
  divider: { icon: '➖', label: 'Divider' },
  map_snippet: { icon: '📍', label: 'Map' },
  action_buttons: { icon: '🔘', label: 'Actions' },
};

interface Props {
  node: LayoutNode | LayoutNodeV2;
  customFields: CustomField[];
  mockItem: ItemWithDetails;
  version?: 1 | 2;
  isFromPalette?: boolean;
}

export default function DragOverlayContent({ node, customFields, mockItem, version = 1, isFromPalette = false }: Props) {
  const overlayLayout = useMemo<TypeLayout | TypeLayoutV2>(() => {
    if (version === 2) {
      return {
        version: 2,
        blocks: [node as LayoutNodeV2],
        spacing: 'comfortable' as const,
        peekBlockCount: 1,
      };
    }
    return {
      version: 1,
      blocks: [node as LayoutNode],
      spacing: 'comfortable' as const,
      peekBlockCount: 1,
    };
  }, [node, version]);

  // For palette items, show a chip-style preview instead of rendering the
  // (often empty) block content
  if (isFromPalette && !isLayoutRowV2(node as LayoutNodeV2)) {
    const blockType = (node as LayoutNodeV2).type as BlockTypeV2;
    const meta = BLOCK_LABELS[blockType];
    return (
      <div
        style={{ opacity: 0.85, pointerEvents: 'none' }}
        className="flex items-center gap-2 rounded-lg border border-sage-light bg-white px-4 py-3 shadow-lg text-sm font-medium text-forest-dark"
      >
        <span>{meta?.icon ?? '📦'}</span>
        <span>{meta?.label ?? blockType}</span>
      </div>
    );
  }

  return (
    <div
      style={{ opacity: 0.7, pointerEvents: 'none' }}
      className="bg-white rounded-xl shadow-lg p-4 max-w-md"
    >
      <LayoutRendererDispatch
        layout={overlayLayout}
        item={mockItem}
        mode="preview"
        context="preview"
        customFields={customFields}
      />
    </div>
  );
}
