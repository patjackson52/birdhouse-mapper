import type { Photo } from '@/lib/types';
import type { PhotoGalleryConfig } from '@/lib/layout/types';
import PhotoViewer from '@/components/ui/PhotoViewer';

interface PhotoGalleryBlockProps {
  config: PhotoGalleryConfig;
  photos: Photo[];
  isEdgeToEdge?: boolean;
}

export default function PhotoGalleryBlock({ config, photos, isEdgeToEdge }: PhotoGalleryBlockProps) {
  if (!photos || photos.length === 0) return null;

  const limited = photos.slice(0, config.maxPhotos);

  return (
    <div className={isEdgeToEdge ? '-mx-4' : undefined}>
      <PhotoViewer photos={limited} />
    </div>
  );
}
