#!/usr/bin/env tsx
/**
 * One-time backfill: re-saves every property's puck_pages and puck_pages_draft
 * (and puck_root / puck_root_draft) through sanitizePuckDataForWrite.
 *
 * Usage:
 *   # dry-run: show what would change, no writes
 *   npm run backfill:puck-sanitize
 *
 *   # apply: actually update rows where content changed
 *   npm run backfill:puck-sanitize -- --apply
 *
 * Requires:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env (load via vercel env pull
 *   or .env.local).
 */
import { createClient } from '@supabase/supabase-js';
import { sanitizePuckDataForWrite } from '../src/lib/puck/sanitize-data';
import type { Data } from '@puckeditor/core';

const APPLY = process.argv.includes('--apply');

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env.');
  console.error('Hint: run `vercel env pull .env.local` then export the vars before running.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

interface Row {
  id: string;
  puck_pages: Record<string, unknown> | null;
  puck_pages_draft: Record<string, unknown> | null;
  puck_root: Record<string, unknown> | null;
  puck_root_draft: Record<string, unknown> | null;
}

function sanitizePagesMap(map: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!map) return null;
  const out: Record<string, unknown> = {};
  for (const [path, data] of Object.entries(map)) {
    out[path] = sanitizePuckDataForWrite(data as Data);
  }
  return out;
}

function sanitizeRoot(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  return sanitizePuckDataForWrite(data as Data) as unknown as Record<string, unknown>;
}

async function main() {
  console.log(APPLY ? 'Mode: APPLY (writes will happen)' : 'Mode: DRY-RUN (no writes)');

  const { data: rows, error } = await supabase
    .from('properties')
    .select('id, puck_pages, puck_pages_draft, puck_root, puck_root_draft');

  if (error) {
    console.error('Failed to read properties:', error.message);
    process.exit(1);
  }

  let scanned = 0;
  let changed = 0;
  let updated = 0;
  let errors = 0;

  for (const row of (rows ?? []) as Row[]) {
    scanned++;
    const next = {
      puck_pages: sanitizePagesMap(row.puck_pages),
      puck_pages_draft: sanitizePagesMap(row.puck_pages_draft),
      puck_root: sanitizeRoot(row.puck_root),
      puck_root_draft: sanitizeRoot(row.puck_root_draft),
    };

    const beforeJson = JSON.stringify({
      puck_pages: row.puck_pages,
      puck_pages_draft: row.puck_pages_draft,
      puck_root: row.puck_root,
      puck_root_draft: row.puck_root_draft,
    });
    const afterJson = JSON.stringify(next);

    if (beforeJson === afterJson) {
      continue;
    }

    changed++;
    console.log(
      `[${row.id}] would change: ` +
        `pages=${row.puck_pages ? 'yes' : 'no'} ` +
        `pagesDraft=${row.puck_pages_draft ? 'yes' : 'no'} ` +
        `root=${row.puck_root ? 'yes' : 'no'} ` +
        `rootDraft=${row.puck_root_draft ? 'yes' : 'no'} ` +
        `(bytes ${beforeJson.length} → ${afterJson.length})`
    );

    if (!APPLY) continue;

    const { error: updateError } = await supabase
      .from('properties')
      .update(next)
      .eq('id', row.id);

    if (updateError) {
      errors++;
      console.error(`[${row.id}] UPDATE failed: ${updateError.message}`);
    } else {
      updated++;
    }
  }

  console.log('---');
  console.log(`Scanned:  ${scanned}`);
  console.log(`Changed:  ${changed}`);
  console.log(`Updated:  ${updated}`);
  console.log(`Errors:   ${errors}`);
  if (!APPLY && changed > 0) {
    console.log('\nDry run complete. Re-run with `-- --apply` to persist.');
  }
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
