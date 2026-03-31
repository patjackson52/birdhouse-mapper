import Link from 'next/link';
import type { ButtonGroupProps } from '../../types';

export function ButtonGroup({ buttons }: ButtonGroupProps) {
  if (!buttons?.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-4">
      {buttons.map((btn, i) => {
        const isExternal = btn.href.startsWith('http');
        const className =
          btn.style === 'primary'
            ? `inline-block rounded-lg px-6 py-3 font-semibold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] transition${btn.size === 'large' ? ' px-8 py-4 text-lg' : ''}`
            : `inline-block rounded-lg px-6 py-3 font-semibold border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition${btn.size === 'large' ? ' px-8 py-4 text-lg' : ''}`;
        if (isExternal) {
          return (
            <a key={i} href={btn.href} target="_blank" rel="noopener noreferrer" className={className}>
              {btn.label}
            </a>
          );
        }
        return (
          <Link key={i} href={btn.href} className={className}>
            {btn.label}
          </Link>
        );
      })}
    </div>
  );
}
