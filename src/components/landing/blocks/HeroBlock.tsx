import type { HeroBlock as HeroBlockType } from '@/lib/config/landing-types';
export function HeroBlock({ block }: { block: HeroBlockType }) {
  const overlay = block.overlay ?? true;
  return (
    <div data-block-type="hero" className="relative flex items-center justify-center min-h-[300px] bg-forest-dark text-white"
      style={block.backgroundImageUrl ? { backgroundImage: `url(${block.backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      {overlay && block.backgroundImageUrl && <div className="absolute inset-0 bg-black/40" />}
      <div className="relative z-10 text-center px-6 py-16">
        <h1 className="font-heading text-4xl md:text-5xl font-bold mb-4">{block.title}</h1>
        {block.subtitle && <p className="text-lg md:text-xl opacity-90 max-w-2xl mx-auto">{block.subtitle}</p>}
      </div>
    </div>
  );
}
