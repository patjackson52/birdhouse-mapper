import { describe, it, expect, beforeEach } from 'vitest';
import { useDeleteStore } from '../deleteSlice';

describe('deleteSlice', () => {
  beforeEach(() => {
    useDeleteStore.getState().clearPending();
    useDeleteStore.getState().hiddenUpdateIds.forEach((id) => {
      useDeleteStore.getState().unmarkHidden(id);
    });
  });

  it('sets a pending delete and exposes expiresAt', () => {
    const expiresAt = Date.now() + 8000;
    useDeleteStore.getState().setPending({
      updateId: 'u-1',
      undoToken: 'tok',
      expiresAtMs: expiresAt,
      update: null,
    });
    const s = useDeleteStore.getState();
    expect(s.pending?.updateId).toBe('u-1');
    expect(s.pending?.expiresAtMs).toBe(expiresAt);
  });

  it('clearPending returns to null', () => {
    useDeleteStore.getState().setPending({
      updateId: 'u-1',
      undoToken: 't',
      expiresAtMs: Date.now() + 8000,
      update: null,
    });
    useDeleteStore.getState().clearPending();
    expect(useDeleteStore.getState().pending).toBe(null);
  });

  it('markHidden adds an id; unmarkHidden removes it', () => {
    const store = useDeleteStore.getState();
    store.markHidden('u-1');
    store.markHidden('u-2');
    expect(useDeleteStore.getState().hiddenUpdateIds).toEqual(['u-1', 'u-2']);
    store.unmarkHidden('u-1');
    expect(useDeleteStore.getState().hiddenUpdateIds).toEqual(['u-2']);
  });

  it('markHidden is idempotent', () => {
    const store = useDeleteStore.getState();
    store.markHidden('u-1');
    store.markHidden('u-1');
    expect(useDeleteStore.getState().hiddenUpdateIds).toEqual(['u-1']);
  });
});
