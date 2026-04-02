import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { BatchStatusResponse } from '@/lib/ai-context/types';

export async function GET(request: Request) {
  // Extract org_id and batch_id from URL search params
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('org_id');
  const batchId = searchParams.get('batch_id');

  if (!orgId) {
    return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
  }

  // Auth check
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();

  // Query vault_items flagged as ai_context filtered by org_id (and batch_id if provided)
  // processing_status, content_summary, and batch_id are stored in the metadata jsonb field
  let query = service
    .from('vault_items')
    .select('id, metadata')
    .eq('org_id', orgId)
    .eq('is_ai_context', true);

  if (batchId) {
    query = query.eq('metadata->>batch_id', batchId);
  }

  const { data: rawItems, error: itemsError } = await query;

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  type RawItem = { id: string; metadata: Record<string, unknown> | null };
  const items = (rawItems ?? []).map((it: RawItem) => ({
    id: it.id,
    processing_status: ((it.metadata?.processing_status as string) ?? 'pending'),
    content_summary: ((it.metadata?.content_summary as string) ?? null) as string | null,
  }));

  // Get geo feature counts per item
  const itemIds = items.map((it: { id: string }) => it.id);

  type GeoCountRow = { source_item_id: string; count: number };
  let geoCounts: GeoCountRow[] = [];

  if (itemIds.length > 0) {
    const { data: geoData, error: geoError } = await service
      .from('ai_context_geo_features')
      .select('source_item_id')
      .in('source_item_id', itemIds);

    if (!geoError && geoData) {
      // Count manually since Supabase aggregate queries require RPC
      const countMap: Record<string, number> = {};
      for (const row of geoData) {
        countMap[row.source_item_id] = (countMap[row.source_item_id] ?? 0) + 1;
      }
      geoCounts = Object.entries(countMap).map(([source_item_id, count]) => ({
        source_item_id,
        count,
      }));
    }
  }

  const geoCountMap: Record<string, number> = {};
  for (const gc of geoCounts) {
    geoCountMap[gc.source_item_id] = gc.count;
  }

  // Check if ai_context_summary exists for the org
  const { data: summaryRow } = await service
    .from('ai_context_summary')
    .select('id')
    .eq('org_id', orgId)
    .single();

  const response: BatchStatusResponse = {
    items: (items ?? []).map(
      (it: { id: string; processing_status: string; content_summary: string | null }) => ({
        id: it.id,
        processing_status: it.processing_status as BatchStatusResponse['items'][0]['processing_status'],
        content_summary: it.content_summary,
        geo_count: geoCountMap[it.id] ?? 0,
      })
    ),
    summary_ready: !!summaryRow,
  };

  return NextResponse.json(response);
}
