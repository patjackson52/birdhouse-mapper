'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import type {
  AiContextItem,
  AiContextSummary,
  FileAnalysisResult,
  OnboardingPreFill,
  ParsedFileData,
} from './types';
import {
  buildFileAnalysisPrompt,
  buildFileAnalysisUserMessage,
  buildOrgSynthesisPrompt,
  buildOnboardingPreFillPrompt,
} from './prompts';
import { buildOrgContextBlock } from './context-provider';

// ---------------------------------------------------------------------------
// uploadAiContextItem
// ---------------------------------------------------------------------------

export async function uploadAiContextItem(
  orgId: string,
  file: { name: string; type: string; size: number; base64: string },
  sourceType: 'file' | 'url' | 'text',
  batchId: string | null
): Promise<{ success: true; itemId: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const service = createServiceClient();

  // Insert the DB row first to get an ID
  const { data: item, error: insertError } = await service
    .from('ai_context_items')
    .insert({
      org_id: orgId,
      uploaded_by: user.id,
      source_type: sourceType,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      processing_status: 'pending',
      batch_id: batchId,
    })
    .select('id')
    .single();

  if (insertError || !item) {
    return { error: `Failed to create context item: ${insertError?.message ?? 'unknown'}` };
  }

  const itemId: string = item.id;

  // Derive extension from file name
  const dotIndex = file.name.lastIndexOf('.');
  const ext = dotIndex !== -1 ? file.name.slice(dotIndex) : '';
  const storagePath = `ai-context/${orgId}/${itemId}/original${ext}`;

  // Decode base64 and upload to storage
  const binaryBuffer = Buffer.from(file.base64, 'base64');
  const { error: uploadError } = await service.storage
    .from('ai-context')
    .upload(storagePath, binaryBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    return { error: `Failed to upload file: ${uploadError.message}` };
  }

  // Update storage_path on the row
  const { error: updateError } = await service
    .from('ai_context_items')
    .update({ storage_path: storagePath })
    .eq('id', itemId);

  if (updateError) {
    return { error: `Failed to update storage path: ${updateError.message}` };
  }

  return { success: true, itemId };
}

// ---------------------------------------------------------------------------
// analyzeAiContextItem
// ---------------------------------------------------------------------------

export async function analyzeAiContextItem(
  itemId: string,
  parsedData: ParsedFileData
): Promise<{ success: true; result: FileAnalysisResult } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const service = createServiceClient();

  // Get item from DB
  const { data: item, error: itemError } = await service
    .from('ai_context_items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (itemError || !item) {
    return { error: `Item not found: ${itemError?.message ?? 'unknown'}` };
  }

  // Mark as processing
  await service
    .from('ai_context_items')
    .update({ processing_status: 'processing' })
    .eq('id', itemId);

  try {
    // Get existing org context summary for richer analysis
    const { data: summaryRow } = await service
      .from('ai_context_summary')
      .select('*')
      .eq('org_id', item.org_id)
      .single();

    const orgContext = buildOrgContextBlock(summaryRow as AiContextSummary | null);
    const systemPrompt = buildFileAnalysisPrompt(orgContext);
    const userMessage = buildFileAnalysisUserMessage(parsedData);

    const { generateText } = await import('ai');
    const { anthropic } = await import('@ai-sdk/anthropic');

    const isImage = parsedData.mimeType.startsWith('image/');
    const isPdf = parsedData.mimeType === 'application/pdf';

    let messageContent: string;
    if (isImage && parsedData.base64Content) {
      // Vision: include image data URL in text for models that support it via user message
      messageContent = `${userMessage}\n\nImage data (base64): data:${parsedData.mimeType};base64,${parsedData.base64Content}`;
    } else if (isPdf && parsedData.base64Content) {
      messageContent = `${userMessage}\n\nPDF content (base64, mimeType: ${parsedData.mimeType}): ${parsedData.base64Content}`;
    } else {
      messageContent = userMessage;
    }

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
      maxOutputTokens: 2000,
    });

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON');
    }
    const result = JSON.parse(jsonMatch[0]) as FileAnalysisResult;

    // Update item with content_summary and status 'complete'
    await service
      .from('ai_context_items')
      .update({
        content_summary: result.content_summary,
        processing_status: 'complete',
        processing_error: null,
      })
      .eq('id', itemId);

    // Insert geo_features from AI response
    if (result.geo_features && result.geo_features.length > 0) {
      const aiGeoRows = result.geo_features.map((f) => ({
        org_id: item.org_id,
        source_item_id: itemId,
        name: f.name,
        description: f.description,
        geometry_type: f.geometry_type,
        geometry: f.geometry,
        properties: f.properties,
        confidence: f.confidence,
        status: 'pending',
      }));

      const { error: geoError } = await service
        .from('ai_context_geo_features')
        .insert(aiGeoRows);

      if (geoError) {
        console.error('Failed to insert AI geo features:', geoError);
      }
    }

    // Insert client-parsed geoFeatures with confidence 1.0
    if (parsedData.geoFeatures && parsedData.geoFeatures.length > 0) {
      const clientGeoRows = parsedData.geoFeatures
        .filter((f) => f.geometry)
        .map((f) => {
          const geomType = f.geometry.type.toLowerCase();
          const mappedType =
            geomType === 'point' || geomType === 'multipoint'
              ? 'point'
              : geomType === 'polygon' || geomType === 'multipolygon'
              ? 'polygon'
              : 'linestring';

          return {
            org_id: item.org_id,
            source_item_id: itemId,
            name: (f.properties?.name as string) ?? 'Unnamed feature',
            description: (f.properties?.description as string) ?? null,
            geometry_type: mappedType,
            geometry: f.geometry,
            properties: f.properties ?? {},
            confidence: 1.0,
            status: 'pending',
          };
        });

      if (clientGeoRows.length > 0) {
        const { error: clientGeoError } = await service
          .from('ai_context_geo_features')
          .insert(clientGeoRows);

        if (clientGeoError) {
          console.error('Failed to insert client geo features:', clientGeoError);
        }
      }
    }

    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';

    await service
      .from('ai_context_items')
      .update({
        processing_status: 'error',
        processing_error: message,
      })
      .eq('id', itemId);

    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// rebuildOrgSummary
// ---------------------------------------------------------------------------

export async function rebuildOrgSummary(
  orgId: string
): Promise<{ success: true; summary: AiContextSummary } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const service = createServiceClient();

  // Get all completed items for the org
  const { data: items, error: itemsError } = await service
    .from('ai_context_items')
    .select('id, file_name, content_summary')
    .eq('org_id', orgId)
    .eq('processing_status', 'complete');

  if (itemsError) {
    return { error: `Failed to fetch items: ${itemsError.message}` };
  }

  if (!items || items.length === 0) {
    return { error: 'No completed items to summarize.' };
  }

  try {
    const systemPrompt = buildOrgSynthesisPrompt();

    const fileSummaries = items
      .map(
        (it: { id: string; file_name: string; content_summary: string | null }) =>
          `item_id: ${it.id}\nfilename: ${it.file_name}\nsummary: ${it.content_summary ?? '(no summary)'}`
      )
      .join('\n\n---\n\n');

    const { generateText } = await import('ai');
    const { anthropic } = await import('@ai-sdk/anthropic');

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Organization ID: ${orgId}\n\nFile summaries:\n\n${fileSummaries}`,
        },
      ],
      maxOutputTokens: 1500,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON');
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      org_profile: string;
      content_map: Array<{ item_id: string; filename: string; summary: string }>;
    };

    // Check if summary exists to determine insert vs update
    const { data: existing } = await service
      .from('ai_context_summary')
      .select('id, version')
      .eq('org_id', orgId)
      .single();

    let summaryRow: AiContextSummary;

    if (existing) {
      const { data: updated, error: updateError } = await service
        .from('ai_context_summary')
        .update({
          org_profile: parsed.org_profile,
          content_map: parsed.content_map,
          last_rebuilt_at: new Date().toISOString(),
          version: (existing.version ?? 0) + 1,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updateError || !updated) {
        return { error: `Failed to update summary: ${updateError?.message ?? 'unknown'}` };
      }

      summaryRow = updated as AiContextSummary;
    } else {
      const { data: inserted, error: insertError } = await service
        .from('ai_context_summary')
        .insert({
          org_id: orgId,
          org_profile: parsed.org_profile,
          content_map: parsed.content_map,
          last_rebuilt_at: new Date().toISOString(),
          version: 1,
        })
        .select('*')
        .single();

      if (insertError || !inserted) {
        return { error: `Failed to insert summary: ${insertError?.message ?? 'unknown'}` };
      }

      summaryRow = inserted as AiContextSummary;
    }

    return { success: true, summary: summaryRow };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Synthesis failed' };
  }
}

// ---------------------------------------------------------------------------
// generateOnboardingPreFill
// ---------------------------------------------------------------------------

export async function generateOnboardingPreFill(
  orgId: string
): Promise<{ success: true; preFill: OnboardingPreFill } | { error: string }> {
  const service = createServiceClient();

  // Get summary
  const { data: summaryRow } = await service
    .from('ai_context_summary')
    .select('*')
    .eq('org_id', orgId)
    .single();

  // Get items
  const { data: items } = await service
    .from('ai_context_items')
    .select('id, file_name, content_summary, source_type, mime_type, file_size')
    .eq('org_id', orgId)
    .eq('processing_status', 'complete');

  const orgContext = buildOrgContextBlock(summaryRow as AiContextSummary | null);

  const itemDetails =
    items && items.length > 0
      ? items
          .map(
            (it: {
              id: string;
              file_name: string;
              content_summary: string | null;
              source_type: string;
              mime_type: string | null;
              file_size: number | null;
            }) =>
              `- ${it.file_name} (${it.source_type}, ${it.mime_type ?? 'unknown type'}): ${it.content_summary ?? '(no summary)'}`
          )
          .join('\n')
      : '(no uploaded files)';

  try {
    const systemPrompt = buildOnboardingPreFillPrompt();

    const { generateText } = await import('ai');
    const { anthropic } = await import('@ai-sdk/anthropic');

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${orgContext}\n\nUploaded files:\n${itemDetails}`,
        },
      ],
      maxOutputTokens: 2000,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON');
    }
    const preFill = JSON.parse(jsonMatch[0]) as OnboardingPreFill;

    return { success: true, preFill };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Pre-fill generation failed' };
  }
}

// ---------------------------------------------------------------------------
// deleteAiContextItem
// ---------------------------------------------------------------------------

export async function deleteAiContextItem(
  itemId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const service = createServiceClient();

  // Get item from DB
  const { data: item, error: itemError } = await service
    .from('ai_context_items')
    .select('id, storage_path')
    .eq('id', itemId)
    .single();

  if (itemError || !item) {
    return { error: `Item not found: ${itemError?.message ?? 'unknown'}` };
  }

  // Delete from storage if path exists
  if (item.storage_path) {
    const { error: storageError } = await service.storage
      .from('ai-context')
      .remove([item.storage_path]);

    if (storageError) {
      console.error('Failed to delete from storage:', storageError);
      // Continue — don't block deletion of DB record
    }
  }

  // Delete from DB (cascades to geo_features)
  const { error: deleteError } = await service
    .from('ai_context_items')
    .delete()
    .eq('id', itemId);

  if (deleteError) {
    return { error: `Failed to delete item: ${deleteError.message}` };
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// processUrlContext
// ---------------------------------------------------------------------------

export async function processUrlContext(
  orgId: string,
  url: string,
  batchId: string | null
): Promise<{ success: true; itemId: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const service = createServiceClient();

  // Insert DB record with source_type 'url'
  const { data: item, error: insertError } = await service
    .from('ai_context_items')
    .insert({
      org_id: orgId,
      uploaded_by: user.id,
      source_type: 'url',
      file_name: url,
      mime_type: 'text/html',
      file_size: null,
      processing_status: 'pending',
      batch_id: batchId,
    })
    .select('id')
    .single();

  if (insertError || !item) {
    return { error: `Failed to create URL item: ${insertError?.message ?? 'unknown'}` };
  }

  const itemId: string = item.id;

  try {
    // Fetch URL with 15s timeout and custom User-Agent
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let html: string;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FieldMapper-ContextBot/1.0 (+https://fieldmapper.io)',
        },
      });
      html = await response.text();
    } finally {
      clearTimeout(timeoutId);
    }

    // Strip HTML to text: remove script/style tags, then all tags
    const withoutScripts = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    const textContent = withoutScripts
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Store snapshot.html in storage
    const storagePath = `ai-context/${orgId}/${itemId}/snapshot.html`;
    const htmlBuffer = Buffer.from(html, 'utf-8');
    const { error: uploadError } = await service.storage
      .from('ai-context')
      .upload(storagePath, htmlBuffer, {
        contentType: 'text/html',
        upsert: false,
      });

    if (!uploadError) {
      await service
        .from('ai_context_items')
        .update({ storage_path: storagePath })
        .eq('id', itemId);
    }

    // Analyze with extracted text
    const parsedData: ParsedFileData = {
      fileName: url,
      mimeType: 'text/html',
      fileSize: htmlBuffer.length,
      sourceType: 'url',
      textContent: textContent.slice(0, 20000), // cap at 20k chars
      url,
    };

    const analysisResult = await analyzeAiContextItem(itemId, parsedData);
    if ('error' in analysisResult) {
      return { error: analysisResult.error };
    }

    return { success: true, itemId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'URL fetch failed';

    await service
      .from('ai_context_items')
      .update({
        processing_status: 'error',
        processing_error: message,
      })
      .eq('id', itemId);

    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// analyzeFilesForOnboarding  (no DB — purely AI analysis + pre-fill)
// ---------------------------------------------------------------------------

export async function analyzeFilesForOnboarding(
  parsedFiles: ParsedFileData[]
): Promise<
  | {
      success: true;
      preFill: OnboardingPreFill;
      orgProfile: string;
      fileSummaries: Array<{ fileName: string; summary: string }>;
    }
  | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  if (parsedFiles.length === 0) {
    return { error: 'No files to analyze.' };
  }

  try {
    const { generateText } = await import('ai');
    const { anthropic } = await import('@ai-sdk/anthropic');

    // Step 1: Analyze each file individually
    const fileSummaries: Array<{ fileName: string; summary: string }> = [];

    for (const parsed of parsedFiles) {
      const systemPrompt = buildFileAnalysisPrompt('');
      const userMessage = buildFileAnalysisUserMessage(parsed);

      const isImage = parsed.mimeType.startsWith('image/');
      const isPdf = parsed.mimeType === 'application/pdf';

      let messageContent: string;
      if (isImage && parsed.base64Content) {
        messageContent = `${userMessage}\n\nImage data (base64): data:${parsed.mimeType};base64,${parsed.base64Content}`;
      } else if (isPdf && parsed.base64Content) {
        messageContent = `${userMessage}\n\nPDF content (base64, mimeType: ${parsed.mimeType}): ${parsed.base64Content}`;
      } else {
        messageContent = userMessage;
      }

      const { text } = await generateText({
        model: anthropic('claude-sonnet-4-6'),
        system: systemPrompt,
        messages: [{ role: 'user', content: messageContent }],
        maxOutputTokens: 2000,
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as FileAnalysisResult;
        fileSummaries.push({
          fileName: parsed.fileName,
          summary: result.content_summary,
        });
      } else {
        fileSummaries.push({
          fileName: parsed.fileName,
          summary: '(analysis failed)',
        });
      }
    }

    // Step 2: Synthesize org profile from all summaries
    const synthPrompt = buildOrgSynthesisPrompt();
    const summaryBlock = fileSummaries
      .map(
        (fs, i) =>
          `item_id: onboard-${i}\nfilename: ${fs.fileName}\nsummary: ${fs.summary}`
      )
      .join('\n\n---\n\n');

    const { text: synthText } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: synthPrompt,
      messages: [
        {
          role: 'user',
          content: `Organization ID: onboarding\n\nFile summaries:\n\n${summaryBlock}`,
        },
      ],
      maxOutputTokens: 1500,
    });

    let orgProfile = '';
    const synthMatch = synthText.match(/\{[\s\S]*\}/);
    if (synthMatch) {
      const synthResult = JSON.parse(synthMatch[0]) as {
        org_profile: string;
      };
      orgProfile = synthResult.org_profile;
    }

    // Step 3: Generate pre-fill suggestions
    const preFillPrompt = buildOnboardingPreFillPrompt();
    const orgContext = orgProfile
      ? `<org-context>\n${orgProfile}\n</org-context>`
      : '';

    const itemDetails = fileSummaries
      .map((fs) => `- ${fs.fileName}: ${fs.summary}`)
      .join('\n');

    const { text: preFillText } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: preFillPrompt,
      messages: [
        {
          role: 'user',
          content: `${orgContext}\n\nUploaded files:\n${itemDetails}`,
        },
      ],
      maxOutputTokens: 2000,
    });

    const preFillMatch = preFillText.match(/\{[\s\S]*\}/);
    if (!preFillMatch) {
      return { error: 'Failed to generate onboarding suggestions.' };
    }
    const preFill = JSON.parse(preFillMatch[0]) as OnboardingPreFill;

    return { success: true, preFill, orgProfile, fileSummaries };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Onboarding analysis failed',
    };
  }
}
