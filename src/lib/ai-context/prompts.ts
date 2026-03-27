import type { ParsedFileData } from './types';

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildFileAnalysisPrompt(orgContext: string): string {
  return `You are a conservation field data analyst. Analyze the provided file and extract structured information.

${orgContext ? `${orgContext}\n\n` : ''}Return a JSON object with exactly this structure:
{
  "content_summary": "A concise description of what this file contains (1-3 sentences)",
  "geo_features": [
    {
      "name": "Feature name",
      "description": "Optional description or null",
      "geometry_type": "point" | "polygon" | "linestring",
      "geometry": { /* GeoJSON geometry object */ },
      "properties": { /* key-value pairs */ },
      "confidence": 0.0 to 1.0
    }
  ],
  "suggested_org_metadata": {
    "name": "Organization name or null",
    "tagline": "Short tagline or null",
    "location_name": "Human-readable location name or null",
    "lat": latitude as number or null,
    "lng": longitude as number or null,
    "org_type": "Type of organization or null",
    "purpose": "Primary purpose/mission or null"
  }
}

Rules:
- Use null for any field you are uncertain about — never guess
- confidence must be a decimal between 0.0 (very uncertain) and 1.0 (certain)
- geo_features should include specific named locations with coordinates, not vague regions
- Include specific quantities and measurements when mentioned (e.g., "47 species", "12 monitoring stations")
- geometry must be a valid GeoJSON geometry object
- Return only valid JSON, no markdown, no commentary`;
}

export function buildFileAnalysisUserMessage(parsed: ParsedFileData): string {
  const lines: string[] = [
    `Filename: ${parsed.fileName}`,
    `MIME type: ${parsed.mimeType}`,
    `Size: ${formatBytes(parsed.fileSize)}`,
  ];

  if (parsed.url) {
    lines.push(`URL: ${parsed.url}`);
  }

  if (parsed.headers && parsed.headers.length > 0) {
    lines.push('');
    lines.push(`Headers: ${parsed.headers.join(', ')}`);
  }

  if (parsed.sampleRows && parsed.sampleRows.length > 0) {
    lines.push('');
    lines.push('Sample rows:');
    parsed.sampleRows.slice(0, 5).forEach((row, i) => {
      lines.push(`  Row ${i + 1}: ${row.join(', ')}`);
    });
  }

  if (parsed.geoFeatures && parsed.geoFeatures.length > 0) {
    lines.push('');
    lines.push(`GeoJSON features (first ${Math.min(5, parsed.geoFeatures.length)} of ${parsed.geoFeatures.length}):`);
    parsed.geoFeatures.slice(0, 5).forEach((feature, i) => {
      lines.push(`  Feature ${i + 1}: ${JSON.stringify(feature)}`);
    });
  }

  if (parsed.textContent) {
    lines.push('');
    lines.push('Text content:');
    lines.push(parsed.textContent);
  }

  if (parsed.base64Content) {
    lines.push('');
    lines.push('(Image content provided separately via Vision API)');
  }

  return lines.join('\n');
}

export function buildOrgSynthesisPrompt(): string {
  return `You are a conservation data strategist. You will be given summaries of multiple uploaded files belonging to a single organization. Synthesize them into a cohesive organizational profile.

Return a JSON object with exactly this structure:
{
  "org_profile": "A 2-4 sentence paragraph describing the organization — their focus, geography, species or habitats of interest, and the kinds of data they work with",
  "content_map": [
    {
      "item_id": "the item_id provided for each file",
      "filename": "the filename",
      "summary": "A concise one-sentence summary of this specific file's content"
    }
  ]
}

Rules:
- org_profile should be written in third person and read naturally
- Draw geographic context from the files (e.g., "focused on coastal Maine wetlands")
- Each content_map entry summary should be specific and mention key data (e.g., "47 bird species with GPS coordinates across 12 survey sites")
- Return only valid JSON, no markdown, no commentary`;
}

export function buildOnboardingPreFillPrompt(): string {
  return `You are a UX assistant helping pre-fill an onboarding form for a conservation mapping platform. Based on the organization context provided, suggest sensible defaults for each field.

Return a JSON object with exactly this structure:
{
  "orgName": "Organization name or null",
  "tagline": "Short catchy tagline (max 80 chars) or null",
  "locationName": "Primary location name (city, region, or area) or null",
  "lat": center latitude as number or null,
  "lng": center longitude as number or null,
  "zoom": map zoom level 1-18 (higher = more zoomed in) or null,
  "themePreset": one of "forest", "ocean", "desert", "wetland", "mountain", "grassland" or null,
  "itemTypes": [
    { "name": "Item type name", "icon": "emoji", "color": "#hexcolor" }
  ] or null,
  "entityTypes": [
    {
      "name": "Entity type name",
      "icon": "emoji",
      "color": "#hexcolor",
      "link_to": ["item type names this entity links to"],
      "fields": [
        { "name": "field name", "field_type": "text" | "number" | "date" | "select" | "boolean", "options": ["for select type"], "required": true | false }
      ]
    }
  ] or null,
  "aboutContent": "2-3 sentence about section for the public-facing map page or null"
}

Rules:
- Use null for fields you cannot confidently infer
- zoom: use 10-12 for regional areas, 13-15 for local areas, 6-9 for national/international
- themePreset: choose the most ecologically appropriate preset
- itemTypes: suggest 2-5 types representing the things being mapped (e.g., "Nest Box", "Survey Point")
- entityTypes: suggest 1-3 types for related entities (e.g., "Species", "Volunteer", "Survey Event")
- aboutContent: write in second person ("Your organization...")
- Return only valid JSON, no markdown, no commentary`;
}
