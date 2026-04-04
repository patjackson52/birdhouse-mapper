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

export interface LayoutRendererProps {
  layout: TypeLayout;
  item: ItemWithDetails;
  mode: 'live' | 'preview';
  context: 'bottom-sheet' | 'side-panel' | 'preview';
  sheetState?: 'peek' | 'half' | 'full';
  customFields: CustomField[];
}

function renderBlock(
  node: LayoutNode,
  index: number,
  props: LayoutRendererProps
): React.ReactNode {
  const { item, mode, context, customFields } = props;

  if (isLayoutRow(node)) {
    const children = node.children.map((child, childIndex) =>
      renderBlock(child, childIndex, props)
    );
    return (
      <BlockErrorBoundary key={node.id} blockType="row">
        <RowBlock row={node}>{children as React.ReactNode[]}</RowBlock>
      </BlockErrorBoundary>
    );
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

  return (
    <BlockErrorBoundary key={block.id} blockType={block.type}>
      {rendered}
    </BlockErrorBoundary>
  );
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
          canEdit={true}
          canAddUpdate={true}
          mode={mode}
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
      const updates = item.updates.map((u) => ({
        id: u.id,
        item_id: u.item_id,
        update_type_id: u.update_type_id,
        content: u.content,
        update_date: u.update_date,
        created_at: u.created_at,
        created_by: u.created_by,
        org_id: u.org_id,
        property_id: u.property_id,
        custom_field_values: u.custom_field_values,
      }));
      return <TimelineBlock config={config} updates={updates} />;
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
