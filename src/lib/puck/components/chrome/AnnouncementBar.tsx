'use client';
import { useState } from 'react';
import type { AnnouncementBarProps } from '../../types';

const bgClasses = {
  primary: 'bg-[var(--color-primary)] text-white',
  accent: 'bg-[var(--color-accent)] text-white',
  surface: 'bg-[var(--color-surface-light)] text-gray-900',
};

export function AnnouncementBar({ text, linkUrl, backgroundColor }: AnnouncementBarProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !text) return <></>;
  const content = linkUrl ? <a href={linkUrl} className="underline hover:no-underline">{text}</a> : <span>{text}</span>;
  return (
    <div className={`relative px-4 py-2 text-center text-sm ${bgClasses[backgroundColor]}`}>
      {content}
      <button onClick={() => setDismissed(true)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
    </div>
  );
}
