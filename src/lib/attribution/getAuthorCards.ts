import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthorCard } from '@/lib/types';

/**
 * Load author cards for the given user ids. Calls the `get_author_cards` RPC
 * (SECURITY DEFINER, defined in migration 046) which bundles the users join
 * with org_memberships + roles + per-org update_count. Returns a Map keyed by
 * user id. Users without an active membership in the org are returned with
 * role='viewer' as a defensive default; "is anon" is derived downstream via
 * role === 'public_contributor'.
 */
export async function getAuthorCards(
  supabase: SupabaseClient,
  orgId: string,
  userIds: string[],
): Promise<Map<string, AuthorCard>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase.rpc('get_author_cards', {
    p_org_id: orgId,
    p_user_ids: ids,
  });

  if (error) throw new Error(`getAuthorCards: ${error.message}`);

  const map = new Map<string, AuthorCard>();
  for (const row of (data ?? []) as AuthorCard[]) {
    map.set(row.id, row);
  }
  return map;
}
