import { z } from 'zod';

const heroBlockSchema = z.object({
  id: z.string(),
  type: z.literal('hero'),
  title: z.string(),
  subtitle: z.string().optional(),
  backgroundImageUrl: z.string().optional(),
  overlay: z.boolean().default(true),
});

const textBlockSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  content: z.string(),
  alignment: z.enum(['left', 'center']).default('left'),
});

const imageBlockSchema = z.object({
  id: z.string(),
  type: z.literal('image'),
  url: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
  width: z.enum(['small', 'medium', 'full']).default('medium'),
});

const buttonBlockSchema = z.object({
  id: z.string(),
  type: z.literal('button'),
  label: z.string(),
  href: z.string(),
  style: z.enum(['primary', 'outline']).default('primary'),
  size: z.enum(['default', 'large']).default('default'),
});

const linksBlockSchema = z.object({
  id: z.string(),
  type: z.literal('links'),
  items: z.array(z.object({
    label: z.string(),
    url: z.string(),
    description: z.string().optional(),
  })),
  layout: z.enum(['inline', 'stacked']).default('stacked'),
});

const statsBlockSchema = z.object({
  id: z.string(),
  type: z.literal('stats'),
  source: z.enum(['manual', 'auto']),
  items: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
});

const galleryBlockSchema = z.object({
  id: z.string(),
  type: z.literal('gallery'),
  images: z.array(z.object({
    url: z.string(),
    alt: z.string(),
    caption: z.string().optional(),
  })),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
});

const spacerBlockSchema = z.object({
  id: z.string(),
  type: z.literal('spacer'),
  size: z.enum(['small', 'medium', 'large']),
});

const landingBlockSchema = z.discriminatedUnion('type', [
  heroBlockSchema,
  textBlockSchema,
  imageBlockSchema,
  buttonBlockSchema,
  linksBlockSchema,
  statsBlockSchema,
  galleryBlockSchema,
  spacerBlockSchema,
]);

export const landingBlocksSchema = z.array(landingBlockSchema);

export const generationBlocksSchema = z.array(
  z.discriminatedUnion('type', [
    heroBlockSchema.omit({ id: true }),
    textBlockSchema.omit({ id: true }),
    imageBlockSchema.omit({ id: true }),
    buttonBlockSchema.omit({ id: true }),
    linksBlockSchema.omit({ id: true }),
    statsBlockSchema.omit({ id: true }),
    galleryBlockSchema.omit({ id: true }),
    spacerBlockSchema.omit({ id: true }),
  ])
);
