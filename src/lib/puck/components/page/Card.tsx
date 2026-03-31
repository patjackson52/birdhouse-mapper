import type { CardProps } from '../../types';

export function Card({ imageUrl, title, text, linkHref, linkLabel }: CardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      {imageUrl && <img src={imageUrl} alt={title} className="h-48 w-full object-cover" loading="lazy" />}
      <div className="p-4">
        {title && <h3 className="text-lg font-semibold text-[var(--color-primary-dark)]">{title}</h3>}
        {text && <p className="mt-2 text-sm text-gray-600">{text}</p>}
        {linkHref && linkLabel && (
          <a href={linkHref} className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline">
            {linkLabel} &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
