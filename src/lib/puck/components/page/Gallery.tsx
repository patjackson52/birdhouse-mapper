import type { GalleryProps } from '../../types';

const colClasses: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

export function Gallery({ images, columns }: GalleryProps) {
  if (!images?.length) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className={`grid gap-4 ${colClasses[columns]}`}>
        {images.map((img, i) => (
          <div key={i} className="overflow-hidden rounded-lg">
            <img src={img.url} alt={img.alt} className="h-48 w-full object-cover" loading="lazy" />
            {img.caption && (
              <p className="bg-white p-2 text-center text-sm text-gray-600">{img.caption}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
