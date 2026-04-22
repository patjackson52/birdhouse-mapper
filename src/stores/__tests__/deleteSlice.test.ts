import { describe, it, expect, beforeEach } from 'vitest';
import { useDeleteStore } from '../deleteSlice';

describe('deleteSlice', () => {
  beforeEach(() => {
    useDeleteStore.getState().clearPending();
  });

  it('sets a pending delete and exposes expiresAt', () => {
    const expiresAt = Date.now() + 8000;
    useDeleteStore.getState().setPending({ updateId: 'u-1', undoToken: 'tok', expiresAtMs: expiresAt });
    const s = useDeleteStore.getState();
    expect(s.pending?.updateId).toBe('u-1');
    expect(s.pending?.expiresAtMs).toBe(expiresAt);
  });

  it('clearPending returns to null', () => {
    useDeleteStore.getState().setPending({ updateId: 'u-1', undoToken: 't', expiresAtMs: Date.now() + 8000 });
    useDeleteStore.getState().clearPending();
    expect(useDeleteStore.getState().pending).toBe(null);
  });
});
