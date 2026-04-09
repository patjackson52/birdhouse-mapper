'use client';

import { useCallback, useRef, useState } from 'react';
import type { TypeLayoutV2 } from '@/lib/layout/types-v2';

const MAX_HISTORY = 30;

export function useLayoutHistory(initialLayout: TypeLayoutV2) {
  const initialRef = useRef(initialLayout);
  const [layout, setLayout] = useState(initialLayout);
  const pastRef = useRef<TypeLayoutV2[]>([]);
  const futureRef = useRef<TypeLayoutV2[]>([]);
  const [, forceRender] = useState(0);

  const update = useCallback((next: TypeLayoutV2) => {
    setLayout((current) => {
      pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), current];
      futureRef.current = [];
      return next;
    });
    forceRender((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    setLayout((current) => {
      const prev = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [...futureRef.current, current];
      return prev;
    });
    forceRender((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    setLayout((current) => {
      const next = futureRef.current[futureRef.current.length - 1];
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [...pastRef.current, current];
      return next;
    });
    forceRender((n) => n + 1);
  }, []);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  const hasUnsavedChanges =
    layout !== initialRef.current &&
    JSON.stringify(layout) !== JSON.stringify(initialRef.current);

  return { layout, update, undo, redo, canUndo, canRedo, hasUnsavedChanges };
}
