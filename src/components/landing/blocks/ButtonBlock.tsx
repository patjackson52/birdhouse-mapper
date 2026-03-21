import Link from 'next/link';
import type { ButtonBlock as ButtonBlockType } from '@/lib/config/landing-types';
export function ButtonBlock({ block }: { block: ButtonBlockType }) {
  const style = block.style ?? 'primary';
  const size = block.size ?? 'default';
  const baseClasses = 'inline-block rounded-lg font-semibold transition-colors text-center';
  const sizeClasses = size === 'large' ? 'px-8 py-4 text-lg' : 'px-6 py-3 text-base';
  const styleClasses = style === 'primary'
    ? 'bg-forest text-white hover:bg-forest-dark'
    : 'border-2 border-forest text-forest hover:bg-forest hover:text-white';
  const isExternal = block.href.startsWith('http');
  if (isExternal) {
    return (
      <div data-block-type="button" className="text-center py-4">
        <a href={block.href} target="_blank" rel="noopener noreferrer" className={`${baseClasses} ${sizeClasses} ${styleClasses}`}>{block.label}</a>
      </div>
    );
  }
  return (
    <div data-block-type="button" className="text-center py-4">
      <Link href={block.href} className={`${baseClasses} ${sizeClasses} ${styleClasses}`}>{block.label}</Link>
    </div>
  );
}
