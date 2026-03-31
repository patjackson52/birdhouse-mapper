import type { StatsProps } from '../../types';

export function Stats({ items }: StatsProps) {
  if (!items?.length) return null;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl bg-[var(--color-surface-light)] p-6 text-center">
            <div className="text-3xl font-bold text-[var(--color-primary)]">{item.value}</div>
            <div className="mt-1 text-sm text-gray-600">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
