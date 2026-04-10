'use client';

import React from 'react';
import type { TypeLayoutV2, LayoutNodeV2, LayoutBlockV2 } from '@/lib/layout/types-v2';
import { isLayoutRowV2 } from '@/lib/layout/types-v2';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import { SPACING } from '@/lib/layout/spacing';
import { renderBlockContent } from '../LayoutRendererV2';
import BlockErrorBoundary from '../BlockErrorBoundary';
import EditableBlock from './EditableBlock';
import EditableRow from './EditableRow';
import DropZone from './DropZone';

interface EditableLayoutRendererProps {
  layout: TypeLayoutV2;
  item: ItemWithDetails;
  customFields: CustomField[];
  selectedBlockId: string | null;
  isDragActive: boolean;
  onSelect: (blockId: string) => void;
}

export default function EditableLayoutRenderer({
  layout,
  item,
  customFields,
  selectedBlockId,
  isDragActive,
  onSelect,
}: EditableLayoutRendererProps) {
  const spacing = SPACING[layout.spacing];

  const rendererProps = {
    layout,
    item,
    mode: 'preview' as const,
    context: 'preview' as const,
    customFields,
  };

  const renderEditableBlock = (
    block: LayoutBlockV2,
    index: number,
    isInRow: boolean,
    rowChildCount: number,
  ) => (
    <EditableBlock
      key={block.id}
      blockId={block.id}
      blockIndex={index}
      isInRow={isInRow}
      isSelected={selectedBlockId === block.id}
      isDragDisabled={false}
      rowChildCount={rowChildCount}
      onSelect={onSelect}
    >
      <BlockErrorBoundary blockType={block.type}>
        {renderBlockContent(block, index, rendererProps)}
      </BlockErrorBoundary>
    </EditableBlock>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.blockGap }}>
      {/* Drop zone before first block */}
      {isDragActive && (
        <DropZone
          id="drop-top-0"
          data={{ zone: 'top-level', index: 0 }}
          direction="vertical"
        />
      )}

      {layout.blocks.map((node, index) => (
        <React.Fragment key={node.id}>
          {isLayoutRowV2(node) ? (
            <EditableRow
              row={node}
              rowIndex={index}
              selectedBlockId={selectedBlockId}
              isDragActive={isDragActive}
              onSelect={onSelect}
              renderBlock={renderEditableBlock}
            />
          ) : (
            renderEditableBlock(node as LayoutBlockV2, index, false, 0)
          )}

          {/* Drop zone after each block */}
          {isDragActive && (
            <DropZone
              id={`drop-top-${index + 1}`}
              data={{ zone: 'top-level', index: index + 1 }}
              direction="vertical"
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
