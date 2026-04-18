// src/lib/layout/types.ts

export type SpacingPreset = 'compact' | 'comfortable' | 'spacious';

export interface TypeLayout {
  version: 1;
  blocks: LayoutNode[];
  spacing: SpacingPreset;
  peekBlockCount: number;
}

export type LayoutNode = LayoutBlock | LayoutRow;

export interface LayoutBlock {
  id: string;
  type: BlockType;
  config: BlockConfig;
  hideWhenEmpty?: boolean;
}

export interface LayoutRow {
  id: string;
  type: 'row';
  children: LayoutBlock[];
  gap: 'tight' | 'normal' | 'loose';
  distribution: 'equal' | 'auto' | number[];
}

export type BlockType =
  | 'field_display'
  | 'photo_gallery'
  | 'status_badge'
  | 'entity_list'
  | 'text_label'
  | 'divider'
  | 'action_buttons'
  | 'map_snippet'
  | 'timeline';

export type BlockConfig =
  | FieldDisplayConfig
  | PhotoGalleryConfig
  | StatusBadgeConfig
  | EntityListConfig
  | TimelineConfig
  | TextLabelConfig
  | DividerConfig
  | MapSnippetConfig
  | ActionButtonsConfig;

export interface FieldDisplayConfig {
  fieldId: string;
  size: 'compact' | 'normal' | 'large';
  showLabel: boolean;
}

export interface PhotoGalleryConfig {
  style: 'hero' | 'grid' | 'carousel';
  maxPhotos: number;
}

export interface StatusBadgeConfig {}

export interface EntityListConfig {
  entityTypeIds: string[];
}

export interface TimelineConfig {
  showUpdates: boolean;
  showScheduled: boolean;
  maxItems: number;
  showPhotos: boolean;
  showFieldValues: boolean;
  showEntityChips: boolean;
}

export interface TextLabelConfig {
  text: string;
  style: 'heading' | 'subheading' | 'body' | 'caption';
}

export interface DividerConfig {}

export interface MapSnippetConfig {}

export interface ActionButtonsConfig {}

// Type guard helpers
export function isLayoutRow(node: LayoutNode): node is LayoutRow {
  return node.type === 'row';
}

export function isLayoutBlock(node: LayoutNode): node is LayoutBlock {
  return node.type !== 'row';
}
