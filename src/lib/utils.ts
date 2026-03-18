import type { ItemStatus } from './types';

/**
 * Resize an image file to a maximum width, returning a Blob.
 */
export async function resizeImage(
  file: File,
  maxWidth: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Could not create blob'));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = URL.createObjectURL(file);
  });
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const statusColors: Record<ItemStatus, string> = {
  active: '#5D7F3A',
  planned: '#9CA3AF',
  damaged: '#D97706',
  removed: '#6B7280',
};

export const statusLabels: Record<ItemStatus, string> = {
  active: 'Active',
  planned: 'Planned',
  damaged: 'Needs Repair',
  removed: 'Removed',
};
