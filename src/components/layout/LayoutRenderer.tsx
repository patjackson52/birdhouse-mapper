'use client';

import type { TypeLayout, LayoutNode, LayoutBlock } from '@/lib/layout/types';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import { isLayoutRow } from '@/lib/layout/types';
import { SPACING } from '@/lib/layout/spacing';
import BlockErrorBoundary from './BlockErrorBoundary';
import StatusBadgeBlock from './blocks/StatusBadgeBlock';
import FieldDisplayBlock from './blocks/FieldDisplayBlock';
import PhotoGalleryBlock from './blocks/PhotoGalleryBlock';
import TextLabelBlock from './blocks/TextLabelBlock';
import DividerBlock from './blocks/DividerBlock';
import ActionButtonsBlock from './blocks/ActionButtonsBlock';
import MapSnippetBlock from './blocks/MapSnippetBlock';
import EntityListBlock from './blocks/EntityListBlock';
import TimelineBlock from './blocks/TimelineBlock';
import RowBlock from './blocks/RowBlock';
import type { EntityDisplay } from './blocks/EntityListBlock';
import type { DeletePermission } from '@/components/delete/DeleteConfirmModal';

export interface LayoutRendererProps {
  layout: TypeLayout;
  item: ItemWithDetails;
  mode: 'live' | 'preview' | 'edit';
  context: 'bottom-sheet' | 'side-panel' | 'preview';
  sheetState?: 'peek' | 'half' | 'full';
  customFields: CustomField[];
  canEdit?: boolean;
  canAddUpdate?: boolean;
  isAuthenticated?: boolean;
  selectedBlockId?: string;
  onBlockSelect?: (blockId: string | null) => void;
  canEditUpdate?: boolean;
  canDeleteUpdate?: boolean;
  currentUserId?: string | null;
  userRole?: 'admin' | 'coordinator' | 'member' | 'public_contributor' | null;
  onDeleteUpdate?: (updateId: string, permission: DeletePermission) => void;
  onEditUpdate?: (updateId: string) => void;
}

function EditBlockWrapper({
  id,
  selectedBlockId,
  onBlockSelect,
  children,
}: {
  id: string;
  selectedBlockId?: string;
  onBlockSelect?: (blockId: string | null) => void;
  children: React.ReactNode;
}) {
  const isSelected = selectedBlockId === id;
  return (
    <div
      data-testid={`edit-block-${id}`}
      className={`cursor-pointer rounded transition-all ${
        isSelected ? 'ring-2 ring-forest/40' : 'hover:ring-1 hover:ring-sage-light'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onBlockSelect?.(isSelected ? null : id);
      }}
    >
      {children}
    </div>
  );
}

function renderBlock(
  node: LayoutNode,
  index: number,
  props: LayoutRendererProps
): React.ReactNode {
  const { item, mode, context, customFields, selectedBlockId, onBlockSelect } = props;

  if (isLayoutRow(node)) {
    const children = node.children.map((child, childIndex) =>
      renderBlock(child, childIndex, props)
    );
    const rowContent = (
      <BlockErrorBoundary key={node.id} blockType="row">
        <RowBlock row={node}>{children as React.ReactNode[]}</RowBlock>
      </BlockErrorBoundary>
    );

    if (mode === 'edit') {
      return (
        <EditBlockWrapper
          key={node.id}
          id={node.id}
          selectedBlockId={selectedBlockId}
          onBlockSelect={onBlockSelect}
        >
          {rowContent}
        </EditBlockWrapper>
      );
    }

    return rowContent;
  }

  const block = node as LayoutBlock;

  // hideWhenEmpty: check for data presence before rendering
  if (block.hideWhenEmpty) {
    if (block.type === 'field_display') {
      const config = block.config as import('@/lib/layout/types').FieldDisplayConfig;
      const value = item.custom_field_values[config.fieldId];
      if (value === null || value === undefined) return null;
    }
  }

  const rendered = renderBlockContent(block, index, props);
  if (rendered === null) return null;

  const blockContent = (
    <BlockErrorBoundary key={block.id} blockType={block.type}>
      {rendered}
    </BlockErrorBoundary>
  );

  if (mode === 'edit') {
    return (
      <EditBlockWrapper
        key={block.id}
        id={block.id}
        selectedBlockId={selectedBlockId}
        onBlockSelect={onBlockSelect}
      >
        {blockContent}
      </EditBlockWrapper>
    );
  }

  return blockContent;
}

function renderBlockContent(
  block: LayoutBlock,
  index: number,
  props: LayoutRendererProps
): React.ReactNode {
  const { item, mode, context, customFields } = props;

  switch (block.type) {
    case 'status_badge': {
      return <StatusBadgeBlock status={item.status} />;
    }

    case 'field_display': {
      const config = block.config as import('@/lib/layout/types').FieldDisplayConfig;
      const field = customFields.find((f) => f.id === config.fieldId);
      const value = item.custom_field_values[config.fieldId];
      return <FieldDisplayBlock config={config} field={field} value={value} />;
    }

    case 'photo_gallery': {
      const config = block.config as import('@/lib/layout/types').PhotoGalleryConfig;
      const isEdgeToEdge =
        context === 'bottom-sheet' && config.style === 'hero' && index <= 1;
      return (
        <PhotoGalleryBlock
          config={config}
          photos={item.photos}
          isEdgeToEdge={isEdgeToEdge}
        />
      );
    }

    case 'text_label': {
      const config = block.config as import('@/lib/layout/types').TextLabelConfig;
      return <TextLabelBlock config={config} />;
    }

    case 'divider': {
      return <DividerBlock />;
    }

    case 'action_buttons': {
      return (
        <ActionButtonsBlock
          itemId={item.id}
          canEdit={props.canEdit ?? false}
          canAddUpdate={props.canAddUpdate ?? false}
          isAuthenticated={props.isAuthenticated ?? false}
          mode={mode === 'edit' ? 'preview' : mode}
        />
      );
    }

    case 'map_snippet': {
      return (
        <MapSnippetBlock
          latitude={item.latitude}
          longitude={item.longitude}
          context={context}
        />
      );
    }

    case 'entity_list': {
      const config = block.config as import('@/lib/layout/types').EntityListConfig;
      const entities: EntityDisplay[] = item.entities.map((e) => ({
        id: e.id,
        name: e.name,
        entity_type: {
          id: e.entity_type.id,
          name: e.entity_type.name,
          icon: e.entity_type.icon,
        },
      }));
      return <EntityListBlock config={config} entities={entities} />;
    }

    case 'timeline': {
      const config = block.config as import('@/lib/layout/types').TimelineConfig;
      return (
        <TimelineBlock
          config={config}
          updates={item.updates}
          updateTypeFields={[]}
          canEditUpdate={!!props.canEditUpdate}
          canDeleteUpdate={!!props.canDeleteUpdate}
          currentUserId={props.currentUserId ?? null}
          userRole={props.userRole ?? null}
          onDeleteUpdate={props.onDeleteUpdate}
          onEditUpdate={props.onEditUpdate}
        />
      );
    }

    default:
      return null;
  }
}

export default function LayoutRenderer(props: LayoutRendererProps) {
  const { layout, sheetState, context } = props;
  const spacing = SPACING[layout.spacing];

  // Determine which blocks to render
  const isPeek = sheetState === 'peek' && context === 'bottom-sheet';
  const nodes = isPeek
    ? layout.blocks.slice(0, layout.peekBlockCount)
    : layout.blocks;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.blockGap }}>
      {nodes.map((node, index) => renderBlock(node, index, props))}
    </div>
  );
}
