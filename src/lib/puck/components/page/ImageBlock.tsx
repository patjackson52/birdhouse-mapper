import type { ImageBlockProps } from '../../types';

const widthClasses = {
  small: 'max-w-sm',
  medium: 'max-w-2xl',
  full: 'max-w-full',
};

export function ImageBlock({ url, alt, caption, width, linkHref }: ImageBlockProps) {
  const img = (
    <div className={`mx-auto px-4 py-4 ${widthClasses[width]}`}>
      <img src={url} alt={alt} className="h-auto w-full rounded-lg" loading="lazy" />
      {caption && <p className="mt-2 text-center text-sm text-gray-600">{caption}</p>}
    </div>
  );
  if (linkHref) {
    return (
      <a
        href={linkHref}
        target={linkHref.startsWith('/') ? undefined : '_blank'}
        rel="noopener noreferrer"
      >
        {img}
      </a>
    );
  }
  return img;
}
