import { z } from 'zod';

// --- Shared v2 field schemas ---

export const fractionalWidthSchema = z.enum(['1/4', '1/3', '1/2', '2/3', '3/4', 'full']);

export const blockPermissionsSchema = z.object({
  requiredRole: z.enum(['viewer', 'editor', 'admin']).optional(),
});

// --- Config schemas (reused from v1 definitions) ---

const fieldDisplayConfigSchema = z.object({
  fieldId: z.string().min(1),
  size: z.enum(['compact', 'normal', 'large']),
  showLabel: z.boolean(),
});

const photoGalleryConfigSchema = z.object({
  style: z.enum(['hero', 'grid', 'carousel']),
  maxPhotos: z.number().int().min(1).max(20),
});

const entityListConfigSchema = z.object({
  entityTypeIds: z.array(z.string()),
});

const timelineConfigSchema = z.object({
  showUpdates: z.boolean(),
  showScheduled: z.boolean(),
  maxItems: z.number().int().min(1).max(50),
});

const textLabelConfigSchema = z.object({
  text: z.string(),
  style: z.enum(['heading', 'subheading', 'body', 'caption']),
});

const descriptionConfigSchema = z.object({
  showLabel: z.boolean(),
  maxLines: z.number().int().min(1).max(50).optional(),
});

const emptyConfigSchema = z.object({});

// --- V2 block schemas (config + width + permissions) ---

const v2CommonFields = {
  width: fractionalWidthSchema.optional(),
  hideWhenEmpty: z.boolean().optional(),
  permissions: blockPermissionsSchema.optional(),
};

const fieldDisplayBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('field_display'),
  config: fieldDisplayConfigSchema,
  ...v2CommonFields,
});

const photoGalleryBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('photo_gallery'),
  config: photoGalleryConfigSchema,
  ...v2CommonFields,
});

const statusBadgeBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('status_badge'),
  config: emptyConfigSchema,
  ...v2CommonFields,
});

const entityListBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('entity_list'),
  config: entityListConfigSchema,
  ...v2CommonFields,
});

const textLabelBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('text_label'),
  config: textLabelConfigSchema,
  ...v2CommonFields,
});

const timelineBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('timeline'),
  config: timelineConfigSchema,
  ...v2CommonFields,
});

const dividerBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('divider'),
  config: emptyConfigSchema,
  ...v2CommonFields,
});

const actionButtonsBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('action_buttons'),
  config: emptyConfigSchema,
  ...v2CommonFields,
});

const mapSnippetBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('map_snippet'),
  config: emptyConfigSchema,
  ...v2CommonFields,
});

const descriptionBlockV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('description'),
  config: descriptionConfigSchema,
  ...v2CommonFields,
});

export const layoutBlockV2Schema = z.discriminatedUnion('type', [
  fieldDisplayBlockV2Schema,
  photoGalleryBlockV2Schema,
  statusBadgeBlockV2Schema,
  entityListBlockV2Schema,
  textLabelBlockV2Schema,
  timelineBlockV2Schema,
  dividerBlockV2Schema,
  actionButtonsBlockV2Schema,
  mapSnippetBlockV2Schema,
  descriptionBlockV2Schema,
]);

// --- Row width map for validation ---

const WIDTH_VALUES: Record<string, number> = {
  '1/4': 0.25,
  '1/3': 0.333,
  '1/2': 0.5,
  '2/3': 0.667,
  '3/4': 0.75,
  'full': 1,
};

const layoutRowV2Schema = z.object({
  id: z.string().min(1),
  type: z.literal('row'),
  children: z.array(layoutBlockV2Schema).min(2).max(4),
  gap: z.enum(['tight', 'normal', 'loose']),
  permissions: blockPermissionsSchema.optional(),
}).refine((row) => {
  // Only validate when all children have explicit widths set
  const childrenWithWidths = row.children.filter((child) => child.width !== undefined);
  if (childrenWithWidths.length !== row.children.length) return true;
  const total = childrenWithWidths.reduce((sum, child) =>
    sum + (WIDTH_VALUES[child.width!] ?? 1), 0);
  return total <= 1.01;
}, 'Row children widths must not exceed 100%');

export const layoutNodeV2Schema = z.union([layoutBlockV2Schema, layoutRowV2Schema]);

export const typeLayoutV2Schema = z.object({
  version: z.literal(2),
  blocks: z.array(layoutNodeV2Schema).min(1),
  spacing: z.enum(['compact', 'comfortable', 'spacious']),
  peekBlockCount: z.number().int().min(0).max(10),
});
