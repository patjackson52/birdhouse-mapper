// e2e/fixtures/seed-knowledge.ts

import { createTestClient } from './seed';

/**
 * Clean up test knowledge items created during E2E tests.
 * Deletes by title prefix to avoid touching real data.
 */
export async function cleanupTestKnowledge(titlePrefix: string) {
  const client = createTestClient();
  const { data: items } = await client
    .from('knowledge_items')
    .select('id')
    .like('title', `${titlePrefix}%`);

  if (items && items.length > 0) {
    for (const item of items) {
      await client.from('knowledge_items').delete().eq('id', item.id);
    }
  }
}
