'use client';

import { useMemo } from 'react';
import type { LayoutNode, TypeLayout } from '@/lib/layout/types';
import type { LayoutNodeV2, TypeLayoutV2 } from '@/lib/layout/types-v2';
import type { CustomField, ItemWithDetails } from '@/lib/types';
import LayoutRendererDispatch from '../LayoutRendererDispatch';

interface Props {
  node: LayoutNode | LayoutNodeV2;
  customFields: CustomField[];
  mockItem: ItemWithDetails;
  version?: 1 | 2;
}

export default function DragOverlayContent({ node, customFields, mockItem, version = 1 }: Props) {
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
