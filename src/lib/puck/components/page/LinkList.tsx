import type { LinkListProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';

export function LinkList({ items, layout }: LinkListProps) {
  if (!items?.length) return <></>;
  const containerClass =
    layout === 'inline'
      ? 'flex flex-wrap items-center justify-center gap-4'
      : 'flex flex-col gap-3';
  return (
    <div className={`mx-auto max-w-2xl px-4 py-4 ${containerClass}`}>
      {items.map((item, i) => {
        const link = resolveLink(item.url);
        return (
          <a
            key={i}
            href={link.href}
            target={link.target}
            rel="noopener noreferrer"
            className="group block rounded-lg border border-gray-200 p-3 transition hover:border-[var(--color-primary)] hover:shadow-sm"
            style={link.color ? { color: link.color } : undefined}
          >
            <span className="font-medium text-[var(--color-primary)] group-hover:underline">{item.label}</span>
            {item.description && (
              <span className="mt-1 block text-sm text-gray-600">{item.description}</span>
            )}
          </a>
        );
      })}
    </div>
  );
}
