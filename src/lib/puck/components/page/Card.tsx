import type { CardProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';
import { IconRenderer } from '../../icons/IconRenderer';
import { proseSizeClasses } from '../../text-styles';

export function Card({ imageUrl, title, text, linkHref, linkLabel, icon, textSize = 'small' }: CardProps) {
  const link = resolveLink(linkHref);
  const proseSize = proseSizeClasses[textSize];
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      {imageUrl && <img src={imageUrl} alt={title} className="h-48 w-full object-cover" loading="lazy" />}
      <div className="p-4">
        {icon && (
          <div className="mb-2">
            <IconRenderer icon={icon} size={24} className="text-[var(--color-primary)]" />
          </div>
        )}
        {title && <h3 className="text-lg font-semibold text-[var(--color-primary-dark)]">{title}</h3>}
        {text && (
          typeof text === 'string'
            ? <div className={`mt-2 text-gray-600 prose ${proseSize} max-w-none`} dangerouslySetInnerHTML={{ __html: text }} />
            : <div className={`mt-2 text-gray-600 prose ${proseSize} max-w-none`}>{text}</div>
        )}
        {link.href && linkLabel && (
          <a
            href={link.href}
            target={link.target}
            className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)] hover:underline"
            style={link.color ? { color: link.color } : undefined}
          >
            {linkLabel} &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
