'use server';

import { createClient } from '@/lib/supabase/server';
import { signUndoToken, verifyUndoToken } from '@/lib/delete-updates/undo-token';

const UNDO_WINDOW_MS = 13_000; // 8s UI + 5s grace

type SoftDeleteSuccess = { undoToken: string; expiresAtMs: number; deletedAt: string };
type SoftDeleteError = { error: string };

export async function softDeleteUpdate(
  updateId: string
): Promise<SoftDeleteSuccess | SoftDeleteError> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { error: 'unauthenticated' };
  const actorId = userRes.user.id;

  // Permission check is enforced by RLS; we still pre-check for a clean error
  const { data: canDelete, error: rpcErr } = await supabase.rpc(
    'can_user_delete_update',
    { p_user_id: actorId, p_update_id: updateId }
  );
  if (rpcErr) return { error: rpcErr.message };
  if (!canDelete) return { error: 'forbidden' };

  // Read the update first (for audit metadata + reason classification)
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
  const { error: updErr } = await supabase
    .from('item_updates')
    .update({ deleted_at: deletedAt, deleted_by: actorId, delete_reason: reason })
    .eq('id', updateId);
  if (updErr) return { error: updErr.message };

  // Audit
  await supabase.from('audit_log').insert({
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

  const { data: row } = await supabase
    .from('item_updates')
    .select('id, created_by, deleted_at')
    .eq('id', args.updateId)
    .single();
  if (!row) return { error: 'not_found' };
  if (!row.deleted_at) return { success: true }; // already restored; idempotent

  const { error: updErr } = await supabase
    .from('item_updates')
    .update({ deleted_at: null, deleted_by: null, delete_reason: null })
    .eq('id', args.updateId);
  if (updErr) return { error: updErr.message };

  await supabase.from('audit_log').insert({
    action: 'update.undo_delete',
    update_id: args.updateId,
    actor_user_id: actorId,
    target_author_user_id: row.created_by,
    was_anon: false,
    metadata: {},
  });

  return { success: true };
}
