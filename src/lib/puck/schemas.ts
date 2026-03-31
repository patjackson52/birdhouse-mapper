import { z } from 'zod';

const puckComponentSchema = z.object({
  type: z.string(),
  props: z.record(z.string(), z.unknown()),
});

const puckRootSchema = z.object({
  props: z.record(z.string(), z.unknown()).optional(),
});

export const puckDataSchema = z.object({
  root: puckRootSchema.optional().default({ props: {} }),
  content: z.array(puckComponentSchema).default([]),
  zones: z.record(z.string(), z.array(puckComponentSchema)).optional(),
});

export const puckPagesSchema = z.record(z.string(), puckDataSchema);
export const puckRootDataSchema = puckDataSchema;

const ALLOWED_EMBED_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'google.com',
  'www.google.com',
  'open.spotify.com',
  'calendar.google.com',
];

export function isAllowedEmbedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_EMBED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
    );
  } catch {
    return false;
  }
}
