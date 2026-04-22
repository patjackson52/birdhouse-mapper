'use client';

import { useRouter } from 'next/navigation';
import { useDeleteStore } from '@/stores/deleteSlice';
import { UndoToast } from './UndoToast';
import { undoDeleteUpdate } from '@/app/items/[itemId]/updates/actions';
import { track } from '@/lib/telemetry/track';

export function DeleteToastHost() {
  const pending = useDeleteStore((s) => s.pending);
  const clearPending = useDeleteStore((s) => s.clearPending);
  const router = useRouter();

  const handleUndo = async () => {
    if (!pending) return;
    const started = pending.expiresAtMs - 8000;
    const elapsedMs = Date.now() - started;
    const res = await undoDeleteUpdate({ updateId: pending.updateId, undoToken: pending.undoToken });
    if ('success' in res) {
      track('update.delete.undone', { update_id: pending.updateId, elapsed_ms: elapsedMs });
      clearPending();
      router.refresh();
    } else {
      // 'gone' or 'forbidden' — toast will fall off on next tick via onExpire
      clearPending();
    }
  };

  const handleExpire = () => {
    if (!pending) return;
    track('update.delete.expired', { update_id: pending.updateId });
    clearPending();
  };

  return <UndoToast pending={pending} onUndo={handleUndo} onExpire={handleExpire} />;
}
