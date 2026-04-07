'use client';

import { useMemo } from 'react';
import type { LayoutNode, TypeLayout } from '@/lib/layout/types';
import type { CustomField, ItemWithDetails } from '@/lib/types';
import LayoutRenderer from '../LayoutRenderer';

interface Props {
  node: LayoutNode;
  customFields: CustomField[];
  mockItem: ItemWithDetails;
}

export default function DragOverlayContent({ node, customFields, mockItem }: Props) {
  const overlayLayout = useMemo<TypeLayout>(() => ({
    version: 1,
    blocks: [node],
    spacing: 'comfortable',
    peekBlockCount: 1,
  }), [node]);

  return (
    <div
      style={{ opacity: 0.7, pointerEvents: 'none' }}
      className="bg-white rounded-xl shadow-lg p-4 max-w-md"
    >
      <LayoutRenderer
        layout={overlayLayout}
        item={mockItem}
        mode="preview"
        context="preview"
        customFields={customFields}
      />
    </div>
  );
}
