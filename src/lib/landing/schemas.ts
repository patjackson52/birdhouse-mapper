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

/**
 * Lenient schemas for AI generation — no `id` field (added post-generation),
 * and sensible defaults for fields Claude might omit.
 */
export const generationBlocksSchema = z.array(
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('hero'),
      title: z.string().default('Welcome'),
      subtitle: z.string().optional(),
      backgroundImageUrl: z.string().optional(),
      overlay: z.boolean().default(true),
    }),
    z.object({
      type: z.literal('text'),
      content: z.string().default(''),
      alignment: z.enum(['left', 'center']).default('left'),
    }),
    z.object({
      type: z.literal('image'),
      url: z.string().default('placeholder'),
      alt: z.string().default('Image'),
      caption: z.string().optional(),
      width: z.enum(['small', 'medium', 'full']).default('medium'),
    }),
    z.object({
      type: z.literal('button'),
      label: z.string().default('Explore the Map'),
      href: z.string().default('/map'),
      style: z.enum(['primary', 'outline']).default('primary'),
      size: z.enum(['default', 'large']).default('default'),
    }),
    z.object({
      type: z.literal('links'),
      items: z.array(z.object({
        label: z.string(),
        url: z.string(),
        description: z.string().optional(),
      })).default([]),
      layout: z.enum(['inline', 'stacked']).default('stacked'),
    }),
    z.object({
      type: z.literal('stats'),
      source: z.enum(['manual', 'auto']).default('auto'),
      items: z.array(z.object({
        label: z.string(),
        value: z.string(),
      })).optional(),
    }),
    z.object({
      type: z.literal('gallery'),
      images: z.array(z.object({
        url: z.string(),
        alt: z.string().default('Image'),
        caption: z.string().optional(),
      })).default([]),
      columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    }),
    z.object({
      type: z.literal('spacer'),
      size: z.enum(['small', 'medium', 'large']).default('medium'),
    }),
  ])
);
