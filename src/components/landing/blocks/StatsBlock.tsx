import type { StatsBlock as StatsBlockType } from '@/lib/config/landing-types';
import { fetchLandingStats } from '@/lib/landing/stats';

export async function StatsBlock({ block }: { block: StatsBlockType }) {
  let items: { label: string; value: string }[] | null = null;
  if (block.source === 'auto') {
    items = await fetchLandingStats();
    if (!items) return null;
  } else {
    items = block.items ?? [];
    if (items.length === 0) return null;
  }
  return (
    <div data-block-type="stats" className="bg-sage-light py-8">
      <div className="flex flex-wrap justify-center gap-8 md:gap-16 max-w-4xl mx-auto px-6">
        {items.map((item, i) => (
          <div key={i} className="text-center">
            <div className="text-3xl font-bold text-forest-dark">{item.value}</div>
            <div className="text-sm text-sage uppercase tracking-wide mt-1">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
