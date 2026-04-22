'use client';

import { useEffect, useState } from 'react';
import type { PendingDelete } from '@/stores/deleteSlice';

const TOTAL_UI_MS = 8000;

export function UndoToast({
  pending,
  onUndo,
  onExpire,
}: {
  pending: PendingDelete | null;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const [, force] = useState(0);

  // Re-render every 100ms to drive the countdown + progress bar
  useEffect(() => {
    if (!pending) return;
    const i = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(i);
  }, [pending]);

  // Fire onExpire exactly once when the deadline passes
  useEffect(() => {
    if (!pending) return;
    const msLeft = pending.expiresAtMs - Date.now();
    if (msLeft <= 0) {
      onExpire();
      return;
    }
    const tid = setTimeout(onExpire, msLeft);
    return () => clearTimeout(tid);
  }, [pending, onExpire]);

  if (!pending) return null;
  const remainingMs = Math.max(0, pending.expiresAtMs - Date.now());
  const pct = Math.max(0, Math.min(100, (remainingMs / TOTAL_UI_MS) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-7 left-[14px] right-[14px] z-[250] flex items-center gap-[10px] overflow-hidden rounded-[12px] bg-forest-dark px-[14px] py-3 text-white shadow-[0_10px_28px_rgba(0,0,0,0.28)] font-body fm-toast-in"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-90">
        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">Update deleted</div>
        <div className="text-[11.5px] opacity-75">Permanent in {Math.ceil(remainingMs / 1000)}s</div>
      </div>
      <button
        type="button"
        onClick={onUndo}
        className="rounded-[8px] bg-white/15 px-[14px] py-2 text-[13px] font-semibold tracking-[0.2px] text-white"
      >
        Undo
      </button>
      <div
        className="absolute bottom-0 left-0 h-[3px] bg-golden transition-[width] duration-100 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
