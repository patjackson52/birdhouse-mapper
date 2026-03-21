import type { ImageBlock as ImageBlockType } from '@/lib/config/landing-types';
const widthClasses = { small: 'max-w-sm', medium: 'max-w-2xl', full: 'max-w-full' };
export function ImageBlock({ block }: { block: ImageBlockType }) {
  const width = block.width ?? 'medium';
  if (!block.url) return null;
  return (
    <figure data-block-type="image" className={`mx-auto ${widthClasses[width]} py-4`}>
      <img src={block.url} alt={block.alt} className="w-full rounded-lg" loading="lazy" />
      {block.caption && <figcaption className="text-center text-sm text-sage mt-2">{block.caption}</figcaption>}
    </figure>
  );
}
