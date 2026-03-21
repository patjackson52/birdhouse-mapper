import type { LinksBlock as LinksBlockType } from '@/lib/config/landing-types';
export function LinksBlock({ block }: { block: LinksBlockType }) {
  const layout = block.layout ?? 'stacked';
  const containerClasses = layout === 'inline'
    ? 'flex flex-wrap justify-center gap-4 py-4'
    : 'flex flex-col gap-3 py-4 max-w-2xl mx-auto';
  return (
    <div data-block-type="links" className={containerClasses}>
      {block.items.map((item, i) => (
        <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
          className={`group ${layout === 'stacked' ? 'block p-4 rounded-lg bg-sage-light hover:bg-forest/10 transition-colors' : 'text-forest hover:text-forest-dark underline'}`}>
          <span className="font-medium text-forest-dark group-hover:text-forest">{item.label}</span>
          {item.description && layout === 'stacked' && <span className="block text-sm text-sage mt-1">{item.description}</span>}
        </a>
      ))}
    </div>
  );
}
