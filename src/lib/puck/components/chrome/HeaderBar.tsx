'use client';
import Link from 'next/link';
import { useConfig } from '@/lib/config/client';
import type { HeaderBarProps } from '../../types';

const bgClasses = {
  primary: 'bg-[var(--color-primary)] text-white',
  'primary-dark': 'bg-[var(--color-primary-dark)] text-white',
  surface: 'bg-[var(--color-surface-light)] text-gray-900',
  default: 'bg-white text-gray-900 border-b border-gray-200',
};

export function HeaderBar({ layout, showTagline, backgroundColor }: HeaderBarProps) {
  const config = useConfig();
  const alignClass = layout === 'centered' ? 'text-center' : 'text-left';
  return (
    <header className={`px-4 py-3 ${bgClasses[backgroundColor]}`}>
      <div className={`mx-auto max-w-6xl ${alignClass}`}>
        <Link href="/" className="inline-flex items-center gap-3">
          {config.logoUrl && <img src={config.logoUrl} alt={config.siteName} className="h-8 w-auto" />}
          <span className="text-lg font-bold">{config.siteName}</span>
        </Link>
        {showTagline && config.tagline && <p className="mt-0.5 text-sm opacity-80">{config.tagline}</p>}
      </div>
    </header>
  );
}
