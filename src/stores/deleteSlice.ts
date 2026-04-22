'use client';

import { create } from 'zustand';

export type PendingDelete = {
  updateId: string;
  undoToken: string;
  expiresAtMs: number;
};

type State = {
  pending: PendingDelete | null;
  setPending: (p: PendingDelete) => void;
  clearPending: () => void;
};

export const useDeleteStore = create<State>((set) => ({
  pending: null,
  setPending: (p) => set({ pending: p }),
  clearPending: () => set({ pending: null }),
}));
