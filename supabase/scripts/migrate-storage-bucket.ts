/**
 * Storage bucket migration: birdhouse-photos → item-photos
 *
 * Usage: npx tsx supabase/scripts/migrate-storage-bucket.ts
 *
 * Requires environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const OLD_BUCKET = 'birdhouse-photos';
const NEW_BUCKET = 'item-photos';

async function migrate() {
  console.log(`Migrating storage from "${OLD_BUCKET}" to "${NEW_BUCKET}"...`);

  // List all files in old bucket
  const { data: files, error: listError } = await supabase.storage
    .from(OLD_BUCKET)
    .list('', { limit: 1000 });

  if (listError) {
    console.error('Failed to list files:', listError.message);
    process.exit(1);
  }

  if (!files || files.length === 0) {
    console.log('No files to migrate.');
  } else {
    // Copy each file
    for (const file of files) {
      // Files may be in subdirectories (e.g., {birdhouse_id}/photo.jpg)
      // We need to list recursively
      const { data: subFiles, error: subError } = await supabase.storage
        .from(OLD_BUCKET)
        .list(file.name, { limit: 1000 });

      if (subError) {
        console.warn(`Warning: could not list ${file.name}:`, subError.message);
        continue;
      }

      if (subFiles && subFiles.length > 0) {
        // It's a directory — copy each file inside
        for (const subFile of subFiles) {
          const path = `${file.name}/${subFile.name}`;
          await copyFile(path);
        }
      } else {
        // It's a top-level file
        await copyFile(file.name);
      }
    }
  }

  // Update photos table: replace old bucket name in storage_path.
  // The Supabase JS client cannot do string replace, so log the SQL for manual execution.
  console.log('\nRun this SQL in the Supabase SQL editor to update photo references:');
  console.log(`UPDATE photos SET storage_path = replace(storage_path, '${OLD_BUCKET}', '${NEW_BUCKET}');`);

  console.log('\nMigration complete.');
  console.log(`Old bucket "${OLD_BUCKET}" can be deleted manually once verified.`);
}

async function copyFile(path: string) {
  // Download from old bucket
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(OLD_BUCKET)
    .download(path);

  if (downloadError) {
    console.warn(`Warning: could not download ${path}:`, downloadError.message);
    return;
  }

  // Upload to new bucket
  const { error: uploadError } = await supabase.storage
    .from(NEW_BUCKET)
    .upload(path, fileData, { upsert: true });

  if (uploadError) {
    console.warn(`Warning: could not upload ${path}:`, uploadError.message);
    return;
  }

  console.log(`  Copied: ${path}`);
}

migrate().catch(console.error);
