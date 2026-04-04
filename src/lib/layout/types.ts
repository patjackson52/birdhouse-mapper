// ======================
// Layout block configs
// ======================

export interface FieldDisplayConfig {
  fieldId: string;
  size: 'normal' | 'large';
  showLabel: boolean;
}

export interface PhotoGalleryConfig {
  style: 'hero' | 'grid' | 'strip';
  maxPhotos: number;
}

export interface TextLabelConfig {
  text: string;
  style: string;
}

export interface TimelineConfig {
  showUpdates: boolean;
  showScheduled: boolean;
  maxItems: number;
}

// ======================
// Layout block types
// ======================

export type LayoutBlockType =
  | 'field_display'
  | 'photo_gallery'
  | 'text_label'
  | 'status_badge'
  | 'entity_list'
  | 'timeline'
  | 'map_snippet'
  | 'action_buttons'
  | 'divider'
  | 'row';

interface BaseLayoutBlock {
  id: string;
  type: LayoutBlockType;
}

export interface FieldDisplayBlock extends BaseLayoutBlock {
  type: 'field_display';
  config: FieldDisplayConfig;
}

export interface PhotoGalleryBlock extends BaseLayoutBlock {
  type: 'photo_gallery';
  config: PhotoGalleryConfig;
}

export interface TextLabelBlock extends BaseLayoutBlock {
  type: 'text_label';
  config: TextLabelConfig;
}

export interface StatusBadgeBlock extends BaseLayoutBlock {
  type: 'status_badge';
  config: Record<string, unknown>;
}

export interface EntityListBlock extends BaseLayoutBlock {
  type: 'entity_list';
  config: Record<string, unknown>;
}

export interface TimelineBlock extends BaseLayoutBlock {
  type: 'timeline';
  config: TimelineConfig;
}

export interface MapSnippetBlock extends BaseLayoutBlock {
  type: 'map_snippet';
  config: Record<string, unknown>;
}

export interface ActionButtonsBlock extends BaseLayoutBlock {
  type: 'action_buttons';
  config: Record<string, unknown>;
}

export interface DividerBlock extends BaseLayoutBlock {
  type: 'divider';
  config?: Record<string, unknown>;
}

export interface LayoutRow extends BaseLayoutBlock {
  type: 'row';
  children: LayoutBlock[];
  gap: 'normal' | 'tight' | 'wide';
  distribution: 'equal' | 'auto';
}

export type LayoutBlock =
  | FieldDisplayBlock
  | PhotoGalleryBlock
  | TextLabelBlock
  | StatusBadgeBlock
  | EntityListBlock
  | TimelineBlock
  | MapSnippetBlock
  | ActionButtonsBlock
  | DividerBlock
  | LayoutRow;

export type LayoutNode = LayoutBlock;

// ======================
// Top-level layout type
// ======================

export interface TypeLayout {
  version: number;
  blocks: LayoutBlock[];
  spacing: 'comfortable' | 'compact' | 'spacious';
  peekBlockCount: number;
}

// ======================
// Type guards
// ======================

export function isLayoutRow(block: LayoutBlock): block is LayoutRow {
  return block.type === 'row';
}
