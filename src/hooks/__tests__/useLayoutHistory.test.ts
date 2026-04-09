// src/hooks/__tests__/useLayoutHistory.test.ts
import { renderHook, act } from '@testing-library/react';
import { useLayoutHistory } from '../useLayoutHistory';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';

const makeLayout = (blockCount: number): TypeLayoutV2 => ({
  version: 2,
  blocks: Array.from({ length: blockCount }, (_, i) => ({
    id: `block-${i}`,
    type: 'divider' as const,
    config: {},
  })),
  spacing: 'comfortable',
  peekBlockCount: 3,
});

describe('useLayoutHistory', () => {
  it('returns initial layout as current', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    expect(result.current.layout).toBe(initial);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('pushes to history on update', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    const next = makeLayout(2);
    act(() => result.current.update(next));
    expect(result.current.layout).toBe(next);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undoes to previous state', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    const next = makeLayout(2);
    act(() => result.current.update(next));
    act(() => result.current.undo());
    expect(result.current.layout).toEqual(initial);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redoes after undo', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    const next = makeLayout(2);
    act(() => result.current.update(next));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.layout).toEqual(next);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('clears future on new update after undo', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    act(() => result.current.update(makeLayout(2)));
    act(() => result.current.undo());
    act(() => result.current.update(makeLayout(3)));
    expect(result.current.canRedo).toBe(false);
  });

  it('caps history at 30 entries', () => {
    const initial = makeLayout(0);
    const { result } = renderHook(() => useLayoutHistory(initial));
    for (let i = 1; i <= 35; i++) {
      act(() => result.current.update(makeLayout(i)));
    }
    let undoCount = 0;
    while (result.current.canUndo) {
      act(() => result.current.undo());
      undoCount++;
    }
    expect(undoCount).toBe(30);
  });

  it('hasUnsavedChanges compares to initial', () => {
    const initial = makeLayout(1);
    const { result } = renderHook(() => useLayoutHistory(initial));
    expect(result.current.hasUnsavedChanges).toBe(false);
    act(() => result.current.update(makeLayout(2)));
    expect(result.current.hasUnsavedChanges).toBe(true);
    act(() => result.current.undo());
    expect(result.current.hasUnsavedChanges).toBe(false);
  });
});
