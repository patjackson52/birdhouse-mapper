import { z } from 'zod';

// Block config schemas
const fieldDisplayConfigSchema = z.object({
  fieldId: z.string().min(1),
  size: z.enum(['compact', 'normal', 'large']),
  showLabel: z.boolean(),
});

const photoGalleryConfigSchema = z.object({
  style: z.enum(['hero', 'grid', 'carousel']),
  maxPhotos: z.number().int().min(1).max(20),
});

const statusBadgeConfigSchema = z.object({});

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

const emptyConfigSchema = z.object({});

// Discriminated block schemas
const fieldDisplayBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('field_display'),
  config: fieldDisplayConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const photoGalleryBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('photo_gallery'),
  config: photoGalleryConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const statusBadgeBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('status_badge'),
  config: statusBadgeConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const entityListBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('entity_list'),
  config: entityListConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const textLabelBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('text_label'),
  config: textLabelConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const timelineBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('timeline'),
  config: timelineConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const dividerBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('divider'),
  config: emptyConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const actionButtonsBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('action_buttons'),
  config: emptyConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

const mapSnippetBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('map_snippet'),
  config: emptyConfigSchema,
  hideWhenEmpty: z.boolean().optional(),
});

export const layoutBlockSchema = z.discriminatedUnion('type', [
  fieldDisplayBlockSchema,
  photoGalleryBlockSchema,
  statusBadgeBlockSchema,
  entityListBlockSchema,
  textLabelBlockSchema,
  timelineBlockSchema,
  dividerBlockSchema,
  actionButtonsBlockSchema,
  mapSnippetBlockSchema,
]);

const layoutRowSchema = z.object({
  id: z.string().min(1),
  type: z.literal('row'),
  children: z.array(layoutBlockSchema).min(2).max(4),
  gap: z.enum(['tight', 'normal', 'loose']),
  distribution: z.union([
    z.enum(['equal', 'auto']),
    z.array(z.number().positive()),
  ]),
});

export const layoutNodeSchema = z.union([layoutBlockSchema, layoutRowSchema]);

export const typeLayoutSchema = z.object({
  version: z.literal(1).default(1),
  blocks: z.array(layoutNodeSchema).min(1),
  spacing: z.enum(['compact', 'comfortable', 'spacious']),
  peekBlockCount: z.number().int().min(0).max(10),
});
