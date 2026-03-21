import type { GalleryBlock as GalleryBlockType } from '@/lib/config/landing-types';
const columnClasses: Record<number, string> = { 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3', 4: 'grid-cols-2 md:grid-cols-4' };
export function GalleryBlock({ block }: { block: GalleryBlockType }) {
  const columns = block.columns ?? 3;
  const validImages = block.images.filter((img) => img.url);
  if (validImages.length === 0) return null;
  return (
    <div data-block-type="gallery" className={`grid ${columnClasses[columns]} gap-4 px-6 py-4 max-w-5xl mx-auto`}>
      {validImages.map((img, i) => (
        <figure key={i} className="overflow-hidden rounded-lg">
          <img src={img.url} alt={img.alt} className="w-full aspect-square object-cover" loading="lazy" />
          {img.caption && <figcaption className="text-center text-sm text-sage mt-2 px-2">{img.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
