import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client for test data setup/teardown.
 * Bypasses RLS — use only in test fixtures, never in app code.
 */
export function createTestClient() {
  const url = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing TEST_SUPABASE_URL or TEST_SUPABASE_SERVICE_ROLE_KEY env vars');
  }

  return createClient(url, key);
}

/**
 * Clean up test data created during a test run.
 * Deletes by name prefix to avoid touching seed data.
 */
export async function cleanupTestOrgs(namePrefix: string) {
  const client = createTestClient();
  const { data: orgs } = await client
    .from('orgs')
    .select('id')
    .like('name', `${namePrefix}%`);

  if (orgs && orgs.length > 0) {
    for (const org of orgs) {
      await client.from('orgs').delete().eq('id', org.id);
    }
  }
}

/**
 * Clean up a test item created during a test.
 */
export async function cleanupTestItem(itemName: string) {
  const client = createTestClient();
  await client.from('items').delete().like('name', `${itemName}%`);
}
