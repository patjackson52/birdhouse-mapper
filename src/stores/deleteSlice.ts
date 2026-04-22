'use client';

import { create } from 'zustand';
import type { ItemUpdate } from '@/lib/types';

export type PendingDelete = {
  updateId: string;
  undoToken: string;
  expiresAtMs: number;
  /**
   * The original row, saved so we can restore it to the offline cache on undo.
   * Null if the caller couldn't locate the row (undo-restore will rely on the
   * next syncPropertyData reconciliation instead).
   */
  update: ItemUpdate | null;
};

type State = {
  pending: PendingDelete | null;
  /**
   * Client-side filter for optimistically-hidden updates. Added on soft-delete,
   * removed on successful undo, retained on toast expiry (row is gone
   * server-side too, so staying hidden is correct).
   */
  hiddenUpdateIds: string[];
  setPending: (p: PendingDelete) => void;
  clearPending: () => void;
  markHidden: (id: string) => void;
  unmarkHidden: (id: string) => void;
};

export const useDeleteStore = create<State>((set) => ({
  pending: null,
  hiddenUpdateIds: [],
  setPending: (p) => set({ pending: p }),
  clearPending: () => set({ pending: null }),
  markHidden: (id) =>
    set((s) => (s.hiddenUpdateIds.includes(id) ? s : { hiddenUpdateIds: [...s.hiddenUpdateIds, id] })),
  unmarkHidden: (id) =>
    set((s) => ({ hiddenUpdateIds: s.hiddenUpdateIds.filter((x) => x !== id) })),
}));
