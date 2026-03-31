'use server';

import { getConfig } from '@/lib/config/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { puckDataSchema } from '@/lib/puck/schemas';
import type { Data } from '@puckeditor/core';

interface SiteContext {
  siteName: string;
  tagline: string;
  locationName: string;
  stats: { items: number; species: number; updates: number };
}

export function buildPuckGenerationPrompt(context: SiteContext): string {
  const { siteName, tagline, locationName, stats } = context;

  return `You are a landing page designer for a field mapping and conservation platform.
Generate a Puck page data object for a landing page.

SITE CONTEXT:
- Name: "${siteName}"
- Tagline: "${tagline}"
- Location: "${locationName}"
- Items tracked: ${stats.items}
- Species tracked: ${stats.species}
- Field updates recorded: ${stats.updates}

AVAILABLE COMPONENTS:
- Hero: { title: string, subtitle: string, backgroundImageUrl: string, overlay: "none"|"light"|"dark"|"primary", ctaLabel: string, ctaHref: string }
- RichText: { content: string (markdown), alignment: "left"|"center"|"right", columns: number }
- Stats: { source: "auto"|"manual", items: [{ label: string, value: string }] }
- ButtonGroup: { buttons: [{ label: string, href: string, style: "primary"|"secondary"|"ghost", size: "sm"|"md"|"lg" }] }
- Gallery: { images: [{ url: string, alt: string, caption?: string }], columns: number }
- Spacer: { size: "xs"|"sm"|"md"|"lg"|"xl" }
- Card: { imageUrl: string, title: string, text: string, linkHref: string, linkLabel: string }
- Testimonial: { quote: string, attribution: string, photoUrl: string, style: "default"|"large"|"minimal" }
- MapPreview: { height: number, zoom: number, showControls: boolean }
- Columns: { columnCount: number }
- Section: { backgroundColor: string, backgroundImageUrl: string, paddingY: "sm"|"md"|"lg"|"xl" }

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
  "root": { "props": {} },
  "content": [
    { "type": "ComponentName", "props": { ...componentProps } },
    ...
  ]
}

GUIDELINES:
- Use 4-7 components total
- Start with a Hero component
- Include a Stats component with source:"auto" to show live project numbers
- End with a ButtonGroup CTA linking to "/map"
- Use site context to write compelling, accurate copy
- Keep text concise and impactful
- Leave backgroundImageUrl as "" if no image is available

You MUST respond with ONLY a valid JSON object. No markdown fences, no explanation — just the JSON.`;
}

export async function generatePuckLandingPage(
  userPrompt: string,
  templateData?: Data
): Promise<{ data?: Data; error?: string }> {
  try {
    const config = await getConfig();
    const supabase = createClient();

    const [itemRes, updateRes, speciesRes] = await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }).neq('status', 'removed'),
      supabase.from('item_updates').select('id', { count: 'exact', head: true }),
      supabase.from('species').select('id', { count: 'exact', head: true }),
    ]);

    const context: SiteContext = {
      siteName: config.siteName,
      tagline: config.tagline,
      locationName: config.locationName,
      stats: {
        items: itemRes.count ?? 0,
        updates: updateRes.count ?? 0,
        species: speciesRes.count ?? 0,
      },
    };

    const systemPrompt = buildPuckGenerationPrompt(context);

    let fullUserPrompt = userPrompt;
    if (templateData) {
      fullUserPrompt =
        `${userPrompt}\n\nStart from this existing template and customize it:\n${JSON.stringify(templateData, null, 2)}`;
    }

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages: [{ role: 'user', content: fullUserPrompt }],
      maxOutputTokens: 2000,
    });

    let jsonText = text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonText);
    const parseResult = puckDataSchema.safeParse(parsed);
    if (!parseResult.success) {
      return { error: 'AI returned invalid Puck data structure: ' + parseResult.error.message };
    }

    return { data: parseResult.data as Data };
  } catch (err) {
    console.error('Puck landing page generation failed:', err);
    return { error: err instanceof Error ? err.message : 'Generation failed' };
  }
}
