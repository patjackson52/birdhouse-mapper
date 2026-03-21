'use server';

import { createClient } from '@/lib/supabase/server';
import { getConfig, invalidateConfig } from '@/lib/config/server';
import { revalidateTag } from 'next/cache';
import type { LandingPageConfig, LandingAsset } from '@/lib/config/landing-types';
import { landingBlocksSchema } from '@/lib/landing/schemas';

export async function getLandingPageConfig(): Promise<LandingPageConfig | null> {
  const config = await getConfig();
  return config.landingPage;
}

export async function saveLandingPageConfig(config: LandingPageConfig) {
  const parseResult = landingBlocksSchema.safeParse(config.blocks);
  if (!parseResult.success) {
    return { error: 'Invalid block data' };
  }

  const supabase = createClient();

  const { error } = await supabase
    .from('site_config')
    .upsert({ key: 'landing_page', value: config as unknown as Record<string, unknown> });

  if (error) {
    return { error: error.message };
  }

  invalidateConfig();
  revalidateTag('landing-stats');
  return { error: null };
}

export async function uploadLandingAsset(
  formData: FormData
): Promise<{ asset: LandingAsset | null; error: string | null }> {
  const supabase = createClient();
  const file = formData.get('file') as File;
  const category = formData.get('category') as 'image' | 'document';
  const description = formData.get('description') as string | null;

  if (!file) return { asset: null, error: 'No file provided' };

  if (file.size > 10 * 1024 * 1024) {
    return { asset: null, error: 'File exceeds 10MB limit' };
  }

  const id = crypto.randomUUID();
  const prefix = category === 'image' ? 'images' : 'documents';
  const ext = file.name.split('.').pop() || '';
  const storagePath = `${prefix}/${id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('landing-assets')
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    return { asset: null, error: uploadError.message };
  }

  const { data: { publicUrl } } = supabase.storage
    .from('landing-assets')
    .getPublicUrl(storagePath);

  const asset: LandingAsset = {
    id,
    storagePath,
    publicUrl,
    fileName: file.name,
    mimeType: file.type,
    category,
    description: description || undefined,
    uploadedAt: new Date().toISOString(),
  };

  return { asset, error: null };
}

export async function deleteLandingAsset(storagePath: string) {
  const supabase = createClient();

  const { error } = await supabase.storage
    .from('landing-assets')
    .remove([storagePath]);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { generationBlocksSchema } from '@/lib/landing/schemas';
import type { LandingBlock } from '@/lib/config/landing-types';

export async function generateLandingPage(
  userPrompt: string,
  assets: LandingAsset[],
  referenceLinks: { label: string; url: string }[]
): Promise<{ blocks: LandingBlock[] | null; error: string | null }> {
  try {
    const config = await getConfig();
    const supabase = createClient();

    const [itemRes, typeRes, updateRes, speciesRes] = await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }).neq('status', 'removed'),
      supabase.from('item_types').select('name'),
      supabase.from('item_updates').select('id', { count: 'exact', head: true }),
      supabase.from('species').select('id', { count: 'exact', head: true }),
    ]);

    // Build image content blocks for Claude vision
    const imageAssets = assets.filter(a => a.category === 'image');
    const imageContentParts: Array<
      | { type: 'image'; image: string; mediaType: string }
      | { type: 'text'; text: string }
    > = [];

    for (const img of imageAssets) {
      const { data } = await supabase.storage.from('landing-assets').download(img.storagePath);
      if (data) {
        const base64 = Buffer.from(await data.arrayBuffer()).toString('base64');
        imageContentParts.push({ type: 'image', image: base64, mediaType: img.mimeType });
        if (img.description) {
          imageContentParts.push({ type: 'text', text: `[Image above: ${img.description}] (asset id: ${img.id})` });
        }
      }
    }

    // Extract document text
    const docAssets = assets.filter(a => a.category === 'document');
    let documentContext = '';
    for (const doc of docAssets) {
      const { data } = await supabase.storage.from('landing-assets').download(doc.storagePath);
      if (data) {
        if (doc.mimeType === 'text/plain' || doc.mimeType === 'text/markdown') {
          const text = await data.text();
          documentContext += `\n--- Document: ${doc.fileName} ---\n${text}\n`;
        } else {
          documentContext += `\n--- Document: ${doc.fileName} (content not extractable) ---\n`;
        }
      }
    }

    const linkContext = referenceLinks.length > 0
      ? '\nReference links:\n' + referenceLinks.map(l => `- ${l.label}: ${l.url}`).join('\n')
      : '';

    const systemPrompt = `You are a landing page designer for a field mapping application.
Generate a JSON array of content blocks for a landing page.

SITE CONTEXT:
- Name: "${config.siteName}"
- Location: "${config.locationName}"
- Tagline: "${config.tagline}"
- Tracks ${itemRes.count ?? 0} items across types: ${typeRes.data?.map(t => t.name).join(', ') || 'none yet'}
- ${updateRes.count ?? 0} field updates recorded
- ${speciesRes.count ?? 0} species tracked
${linkContext}
${documentContext ? '\nDOCUMENT CONTEXT:\n' + documentContext : ''}

AVAILABLE IMAGES (reference by asset id in image/hero/gallery blocks):
${imageAssets.map(img => `- id: "${img.id}" — ${img.description || img.fileName}`).join('\n') || '(none uploaded)'}

Guidelines:
- Start with a hero block with a compelling title
- Include descriptive text blocks with markdown
- Add a prominent button block linking to "/map"
- Use a stats block with source:"auto" to show live project numbers
- Keep it concise: 4-8 blocks total
- For image/hero/gallery blocks, set url/backgroundImageUrl to the asset id from AVAILABLE IMAGES (system resolves to public URLs). If no images available, use "placeholder"
- Incorporate reference links naturally into links blocks or inline markdown
- Use document context to write accurate, detailed descriptions
- Generate descriptive alt text for all image blocks for accessibility`;

    const { object: blocks } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: generationBlocksSchema,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          ...imageContentParts,
          { type: 'text', text: userPrompt },
        ],
      }],
      maxOutputTokens: 2000,
    });

    // Add UUIDs and resolve asset IDs to public URLs
    const assetMap = new Map(assets.map(a => [a.id, a.publicUrl]));
    const processedBlocks: LandingBlock[] = blocks.map((block) => {
      const withId = { ...block, id: crypto.randomUUID() } as LandingBlock;

      if ('url' in withId && typeof (withId as { url?: unknown }).url === 'string' && assetMap.has((withId as { url: string }).url)) {
        (withId as unknown as Record<string, unknown>).url = assetMap.get((withId as { url: string }).url)!;
      }
      if (withId.type === 'hero' && withId.backgroundImageUrl && assetMap.has(withId.backgroundImageUrl)) {
        withId.backgroundImageUrl = assetMap.get(withId.backgroundImageUrl)!;
      }
      if (withId.type === 'gallery') {
        withId.images = withId.images.map(img =>
          assetMap.has(img.url) ? { ...img, url: assetMap.get(img.url)! } : img
        );
      }

      return withId;
    });

    return { blocks: processedBlocks, error: null };
  } catch (err) {
    console.error('Landing page generation failed:', err);
    return { blocks: null, error: err instanceof Error ? err.message : 'Generation failed' };
  }
}
