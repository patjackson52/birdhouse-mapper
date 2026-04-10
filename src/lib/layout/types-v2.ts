// src/lib/layout/types-v2.ts

import type {
  SpacingPreset,
  FieldDisplayConfig,
  PhotoGalleryConfig,
  StatusBadgeConfig,
  EntityListConfig,
  TimelineConfig,
  TextLabelConfig,
  DividerConfig,
  MapSnippetConfig,
  ActionButtonsConfig,
} from './types';

// Re-export shared types
export type { SpacingPreset } from './types';

export type FractionalWidth = '1/4' | '1/3' | '1/2' | '2/3' | '3/4' | 'full';

export type BlockAlign = 'start' | 'center' | 'end';

export interface BlockPermissions {
  requiredRole?: 'viewer' | 'editor' | 'admin';
}

export interface DescriptionConfig {
  showLabel: boolean;
  maxLines?: number;
}

export type BlockTypeV2 =
  | 'field_display'
  | 'photo_gallery'
  | 'status_badge'
  | 'entity_list'
  | 'text_label'
  | 'divider'
  | 'action_buttons'
  | 'map_snippet'
  | 'timeline'
  | 'description';

export type BlockConfigV2 =
  | FieldDisplayConfig
  | PhotoGalleryConfig
  | StatusBadgeConfig
  | EntityListConfig
  | TimelineConfig
  | TextLabelConfig
  | DividerConfig
  | MapSnippetConfig
  | ActionButtonsConfig
  | DescriptionConfig;

export interface LayoutBlockV2 {
  id: string;
  type: BlockTypeV2;
  config: BlockConfigV2;
  width?: FractionalWidth;
  align?: BlockAlign;
  hideWhenEmpty?: boolean;
  permissions?: BlockPermissions;
}

export interface LayoutRowV2 {
  id: string;
  type: 'row';
  children: LayoutBlockV2[];
  gap: 'tight' | 'normal' | 'loose';
  permissions?: BlockPermissions;
}

export type LayoutNodeV2 = LayoutBlockV2 | LayoutRowV2;

export interface TypeLayoutV2 {
  version: 2;
  blocks: LayoutNodeV2[];
  spacing: SpacingPreset;
  peekBlockCount: number;
}

// Type guards
export function isLayoutRowV2(node: LayoutNodeV2): node is LayoutRowV2 {
  return node.type === 'row';
}

export function isLayoutBlockV2(node: LayoutNodeV2): node is LayoutBlockV2 {
  return node.type !== 'row';
}
