'use client';

import { useRouter } from 'next/navigation';
import { useDeleteStore } from '@/stores/deleteSlice';
import { UndoToast } from './UndoToast';
import { undoDeleteUpdate } from '@/app/items/[itemId]/updates/actions';
import { track } from '@/lib/telemetry/track';
import { getOfflineDb } from '@/lib/offline/db';

export function DeleteToastHost() {
  const pending = useDeleteStore((s) => s.pending);
  const clearPending = useDeleteStore((s) => s.clearPending);
  const unmarkHidden = useDeleteStore((s) => s.unmarkHidden);
  const router = useRouter();

  const handleUndo = async () => {
    if (!pending) return;
    const started = pending.expiresAtMs - 8000;
    const elapsedMs = Date.now() - started;
    const res = await undoDeleteUpdate({ updateId: pending.updateId, undoToken: pending.undoToken });
    if ('success' in res) {
      // Restore the row to the offline cache so the parent's next read sees it.
      // If we never saved the row (e.g. delete came from a code path that
      // didn't populate `pending.update`), skip — the next syncPropertyData
      // reconciliation will re-fetch it from the server.
      if (pending.update) {
        try {
          // Dexie accepts the enriched shape; sync will overwrite with the plain
          // row later. Cast at the boundary since `Cached<ItemUpdate>` requires
          // _synced_at which the saved row already has when it came from the
          // offline cache.
          await getOfflineDb().item_updates.put(pending.update as never);
        } catch {
          // best-effort
        }
      }
      unmarkHidden(pending.updateId);
      track('update.delete.undone', { update_id: pending.updateId, elapsed_ms: elapsedMs });
      clearPending();
      router.refresh();
    } else {
      // 'gone' or 'forbidden' — row stays deleted server-side. Keep it hidden
      // client-side; just dismiss the toast.
      clearPending();
    }
  };

  const handleExpire = () => {
    if (!pending) return;
    track('update.delete.expired', { update_id: pending.updateId });
    // Leave `hiddenUpdateIds` intact — the row is gone server-side and from
    // IndexedDB (evicted at delete time); staying in the hidden list is a
    // belt-and-suspenders filter until the page reloads.
    clearPending();
  };

  return <UndoToast pending={pending} onUndo={handleUndo} onExpire={handleExpire} />;
}
