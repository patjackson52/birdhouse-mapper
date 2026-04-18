'use client';

import type { TypeLayoutV2, LayoutNodeV2, LayoutBlockV2, BlockPermissions, BlockAlign } from '@/lib/layout/types-v2';
import type { ItemWithDetails, CustomField } from '@/lib/types';
import { isLayoutRowV2 } from '@/lib/layout/types-v2';
import { SPACING } from '@/lib/layout/spacing';
import { usePermissions } from '@/lib/permissions/hooks';
import { ROLE_LEVELS } from '@/lib/permissions/resolve';
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
import RowBlockV2 from './blocks/RowBlockV2';
import DescriptionBlock from './blocks/DescriptionBlock';
import type { EntityDisplay } from './blocks/EntityListBlock';

export interface LayoutRendererV2Props {
  layout: TypeLayoutV2;
  item: ItemWithDetails;
  mode: 'live' | 'preview';
  context: 'bottom-sheet' | 'side-panel' | 'preview';
  sheetState?: 'peek' | 'half' | 'full';
  customFields: CustomField[];
  canEdit?: boolean;
  canAddUpdate?: boolean;
  isAuthenticated?: boolean;
  canEditUpdate?: boolean;
  canDeleteUpdate?: boolean;
  onDeleteUpdate?: (updateId: string) => void | Promise<void>;
  onEditUpdate?: (updateId: string) => void;
}

const WIDTH_TO_CSS: Record<string, string> = {
  '1/4': '25%',
  '1/3': '33.333%',
  '1/2': '50%',
  '2/3': '66.667%',
  '3/4': '75%',
};

const ALIGN_TO_JUSTIFY: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
};

/**
 * Map layout model roles to numeric levels for comparison.
 * Layout model uses 'viewer' | 'editor' | 'admin' (simplified).
 * editor → contributor level (2), admin → org_admin level (4).
 */
const LAYOUT_ROLE_LEVELS: Record<string, number> = {
  viewer: 1,
  editor: 2,
  admin: 4,
};

/**
 * Returns true if the user's base role meets or exceeds the required role.
 * If no permissions/requiredRole specified, access is granted.
 */
function hasAccess(userBaseRole: string, permissions?: BlockPermissions): boolean {
  if (!permissions?.requiredRole) return true;
  const userLevel = ROLE_LEVELS[userBaseRole] ?? 0;
  const requiredLevel = LAYOUT_ROLE_LEVELS[permissions.requiredRole] ?? 0;
  return userLevel >= requiredLevel;
}

function renderBlock(
  node: LayoutNodeV2,
  index: number,
  props: LayoutRendererV2Props,
  userBaseRole: string,
  isTopLevel = false,
): React.ReactNode {
  const { item, mode, context, customFields } = props;

  // Check permissions before rendering
  if (!hasAccess(userBaseRole, node.permissions)) {
    return null;
  }

  if (isLayoutRowV2(node)) {
    const children = node.children.map((child, childIndex) =>
      renderBlock(child, childIndex, props, userBaseRole, false)
    );
    return (
      <BlockErrorBoundary key={node.id} blockType="row">
        <RowBlockV2 row={node}>{children as React.ReactNode[]}</RowBlockV2>
      </BlockErrorBoundary>
    );
  }

  const block = node as LayoutBlockV2;

  // hideWhenEmpty: check for data presence before rendering
  if (block.hideWhenEmpty) {
    if (block.type === 'field_display') {
      const config = block.config as import('@/lib/layout/types').FieldDisplayConfig;
      const value = item.custom_field_values[config.fieldId];
      if (value === null || value === undefined) return null;
    }
    if (block.type === 'description') {
      if (!item.description) return null;
    }
  }

  const rendered = renderBlockContent(block, index, props);
  if (rendered === null) return null;

  let content: React.ReactNode = (
    <BlockErrorBoundary key={block.id} blockType={block.type}>
      {rendered}
    </BlockErrorBoundary>
  );

  // Wrap top-level blocks that have a non-full width
  if (isTopLevel && block.width && block.width !== 'full') {
    const maxWidth = WIDTH_TO_CSS[block.width];
    const justify = ALIGN_TO_JUSTIFY[(block.align as string) ?? 'start'];

    content = (
      <div
        key={block.id}
        data-block-width={block.width}
        style={{
          display: 'flex',
          maxWidth,
          justifyContent: justify,
        }}
      >
        <div style={{ width: '100%', maxWidth }}>
          {content}
        </div>
      </div>
    );
  }

  return content;
}

export function renderBlockContent(
  block: LayoutBlockV2,
  index: number,
  props: LayoutRendererV2Props
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
      return (
        <TimelineBlock
          config={config}
          updates={updates}
          updateTypeFields={[]}
          canEditUpdate={!!props.canEditUpdate}
          canDeleteUpdate={!!props.canDeleteUpdate}
          onDeleteUpdate={props.onDeleteUpdate}
          onEditUpdate={props.onEditUpdate}
        />
      );
    }

    case 'description': {
      const config = block.config as import('@/lib/layout/types-v2').DescriptionConfig;
      return <DescriptionBlock config={config} description={item.description} />;
    }

    default:
      return null;
  }
}

export default function LayoutRendererV2(props: LayoutRendererV2Props) {
  const { layout, sheetState, context } = props;
  const { userBaseRole } = usePermissions();
  const spacing = SPACING[layout.spacing];

  // Determine which blocks to render
  const isPeek = sheetState === 'peek' && context === 'bottom-sheet';
  const nodes = isPeek
    ? layout.blocks.slice(0, layout.peekBlockCount)
    : layout.blocks;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.blockGap }}>
      {nodes.map((node, index) => renderBlock(node, index, props, userBaseRole, true))}
    </div>
  );
}
