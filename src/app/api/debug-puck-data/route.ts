import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Temporary debug endpoint to inspect raw Puck data from Supabase.
 * DELETE THIS FILE after debugging.
 */
export async function GET() {
  const supabase = createClient();

  const { data: org } = await supabase
    .from('orgs')
    .select('default_property_id')
    .limit(1)
    .single();

  if (!org?.default_property_id) {
    return NextResponse.json({ error: 'No property found' }, { status: 404 });
  }

  const { data: property, error } = await supabase
    .from('properties')
    .select('puck_pages, puck_pages_draft, puck_root, puck_root_draft')
    .eq('id', org.default_property_id)
    .single();

  if (error || !property) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }

  // Find all empty text nodes in the data
  const emptyTextNodes: Array<{ path: string; node: unknown }> = [];

  function findEmptyTextNodes(obj: unknown, path: string) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => findEmptyTextNodes(item, `${path}[${i}]`));
      return;
    }
    const record = obj as Record<string, unknown>;
    if (record.type === 'text' && !record.text) {
      emptyTextNodes.push({ path, node: record });
    }
    // Also check stringified JSON
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string' && value.startsWith('{') && value.includes('"type"')) {
        try {
          const parsed = JSON.parse(value);
          findEmptyTextNodes(parsed, `${path}.${key}(parsed)`);
        } catch { /* not JSON */ }
      } else {
        findEmptyTextNodes(value, `${path}.${key}`);
      }
    }
  }

  findEmptyTextNodes(property.puck_pages_draft, 'puck_pages_draft');
  findEmptyTextNodes(property.puck_pages, 'puck_pages');
  findEmptyTextNodes(property.puck_root_draft, 'puck_root_draft');
  findEmptyTextNodes(property.puck_root, 'puck_root');

  // Also find what content types are used in richtext fields
  const richTextFormats: Array<{ path: string; type: string; preview: string }> = [];

  function findRichTextContent(obj: unknown, path: string) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => findRichTextContent(item, `${path}[${i}]`));
      return;
    }
    const record = obj as Record<string, unknown>;
    // Check if this is a Puck component with richtext content
    if (record.type && record.props && typeof record.props === 'object') {
      const props = record.props as Record<string, unknown>;
      for (const [key, value] of Object.entries(props)) {
        if (key === 'content' || key === 'quote' || key === 'text') {
          const preview = typeof value === 'string'
            ? value.substring(0, 100)
            : JSON.stringify(value)?.substring(0, 100);
          richTextFormats.push({
            path: `${path}.props.${key}`,
            type: typeof value === 'object' ? 'object (ProseMirror JSON)' : typeof value,
            preview: preview || '(empty)',
          });
        }
      }
    }
    for (const [key, value] of Object.entries(record)) {
      findRichTextContent(value, `${path}.${key}`);
    }
  }

  findRichTextContent(property.puck_pages_draft, 'puck_pages_draft');
  findRichTextContent(property.puck_root_draft, 'puck_root_draft');

  return NextResponse.json({
    emptyTextNodes,
    richTextFormats,
    summary: {
      emptyTextNodeCount: emptyTextNodes.length,
      richTextFieldCount: richTextFormats.length,
    },
  }, { status: 200 });
}
