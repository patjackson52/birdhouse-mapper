import type { ImageBlockProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';

const widthClasses = {
  small: 'max-w-sm',
  medium: 'max-w-2xl',
  full: 'max-w-full',
};

export function ImageBlock({ url, alt, caption, width, linkHref }: ImageBlockProps) {
  const link = resolveLink(linkHref);
  const img = (
    <div className={`mx-auto px-4 py-4 ${widthClasses[width]}`}>
      <img src={url} alt={alt} className="h-auto w-full rounded-lg" loading="lazy" />
      {caption && <p className="mt-2 text-center text-sm text-gray-600">{caption}</p>}
    </div>
  );
  if (link.href) {
    return (
      <a
        href={link.href}
        target={link.target}
        rel="noopener noreferrer"
        style={link.color ? { color: link.color } : undefined}
      >
        {img}
      </a>
    );
  }
  return img;
}
