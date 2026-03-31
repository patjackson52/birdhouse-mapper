'use client';
import { useConfig } from '@/lib/config/client';
import type { FooterColumnsProps } from '../../types';

export function FooterColumns({ columns, showBranding, copyrightText }: FooterColumnsProps) {
  const config = useConfig();
  const gridClass = columns.length <= 2 ? 'md:grid-cols-2' : columns.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4';
  return (
    <footer className="bg-[var(--color-primary-dark)] px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        {showBranding && (
          <div className="mb-8">
            <div className="text-lg font-bold">{config.siteName}</div>
            {config.tagline && <p className="mt-1 text-sm opacity-70">{config.tagline}</p>}
          </div>
        )}
        <div className={`grid gap-8 ${gridClass}`}>
          {columns.map((col, i) => (
            <div key={i}>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider opacity-70">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link, j) => (
                  <li key={j}><a href={link.url} className="text-sm opacity-80 transition hover:opacity-100 hover:underline">{link.label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {copyrightText && <div className="mt-8 border-t border-white/20 pt-4 text-center text-xs opacity-60">{copyrightText}</div>}
      </div>
    </footer>
  );
}
