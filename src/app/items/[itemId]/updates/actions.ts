'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { signUndoToken, verifyUndoToken } from '@/lib/delete-updates/undo-token';

const UNDO_WINDOW_MS = 13_000; // 8s UI + 5s grace

type SoftDeleteSuccess = { undoToken: string; expiresAtMs: number; deletedAt: string };
type SoftDeleteError = { error: string };

/**
 * Why the service-role client is used for the mutations below:
 *
 * The item_updates_select SELECT policy includes `deleted_at IS NULL` in its
 * USING expression (migration 048). Postgres enforces SELECT USING against
 * the NEW row during UPDATE — not just for RETURNING, and not only when the
 * policy is restrictive. When an authenticated user flips deleted_at to a
 * non-null value, the new row no longer matches the SELECT USING, and
 * Postgres throws 'new row violates row-level security policy for table
 * "item_updates"'. See ADR-0007 and issue/PR thread on #278 for the full
 * analysis.
 *
 * We've already authorized the caller via the `can_user_delete_update` RPC
 * pre-check. Running the UPDATE + audit insert as the service role bypasses
 * RLS on the mutation (which is what we need to transition deleted_at from
 * null to not-null), without skipping authorization. Similarly for undo: the
 * service role is needed to READ the soft-deleted row (hidden under RLS) and
 * to UPDATE it back to visible.
 */

export async function softDeleteUpdate(
  updateId: string
): Promise<SoftDeleteSuccess | SoftDeleteError> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { error: 'unauthenticated' };
  const actorId = userRes.user.id;

  const { data: canDelete, error: rpcErr } = await supabase.rpc(
    'can_user_delete_update',
    { p_user_id: actorId, p_update_id: updateId }
  );
  if (rpcErr) return { error: rpcErr.message };
  if (!canDelete) return { error: 'forbidden' };

  const { data: row, error: readErr } = await supabase
    .from('item_updates')
    .select('id, created_by, org_id, property_id')
    .eq('id', updateId)
    .single();
  if (readErr || !row) return { error: readErr?.message ?? 'not_found' };

  const { data: wasAnonRpc } = await supabase.rpc('is_anon_update', { p_update_id: updateId });
  const wasAnon = Boolean(wasAnonRpc);
  const isSelfDelete = row.created_by === actorId && !wasAnon;
  const reason = isSelfDelete ? 'author' : 'moderation';

  const deletedAt = new Date().toISOString();
  const service = createServiceClient();

  const { error: updErr } = await service
    .from('item_updates')
    .update({ deleted_at: deletedAt, deleted_by: actorId, delete_reason: reason })
    .eq('id', updateId);
  if (updErr) return { error: updErr.message };

  await service.from('audit_log').insert({
    action: 'update.delete',
    update_id: updateId,
    actor_user_id: actorId,
    target_author_user_id: row.created_by,
    was_anon: wasAnon,
    metadata: { reason },
  });

  const expiresAtMs = Date.now() + UNDO_WINDOW_MS;
  const undoToken = signUndoToken({ updateId, actorId, expiresAtMs });
  return { undoToken, expiresAtMs, deletedAt };
}

type UndoSuccess = { success: true };
type UndoError = { error: 'unauthenticated' | 'gone' | 'forbidden' | 'not_found' | string };

export async function undoDeleteUpdate(
  args: { updateId: string; undoToken: string }
): Promise<UndoSuccess | UndoError> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { error: 'unauthenticated' };
  const actorId = userRes.user.id;

  const verified = verifyUndoToken(args.undoToken);
  if (!verified.ok) {
    if (verified.reason === 'expired') return { error: 'gone' };
    return { error: 'forbidden' };
  }
  if (verified.updateId !== args.updateId) return { error: 'forbidden' };
  if (verified.actorId !== actorId) return { error: 'forbidden' };

  // Soft-deleted rows are invisible under the user-auth SELECT RLS, so use
  // service role to read and to flip deleted_at back to null.
  const service = createServiceClient();
  const { data: row } = await service
    .from('item_updates')
    .select('id, created_by, deleted_at')
    .eq('id', args.updateId)
    .single();
  if (!row) return { error: 'not_found' };
  if (!row.deleted_at) return { success: true }; // already restored; idempotent

  const { error: updErr } = await service
    .from('item_updates')
    .update({ deleted_at: null, deleted_by: null, delete_reason: null })
    .eq('id', args.updateId);
  if (updErr) return { error: updErr.message };

  await service.from('audit_log').insert({
    action: 'update.undo_delete',
    update_id: args.updateId,
    actor_user_id: actorId,
    target_author_user_id: row.created_by,
    was_anon: false,
    metadata: {},
  });

  return { success: true };
}
