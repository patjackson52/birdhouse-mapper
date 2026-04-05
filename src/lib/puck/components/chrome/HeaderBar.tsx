'use client';
import Link from 'next/link';
import { useConfig } from '@/lib/config/client';
import { getLogoUrl } from '@/lib/config/logo';
import type { HeaderBarProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';
import { IconRenderer } from '../../icons/IconRenderer';

const bgClasses = {
  primary: 'bg-[var(--color-primary)] text-white',
  'primary-dark': 'bg-[var(--color-primary-dark)] text-white',
  surface: 'bg-[var(--color-surface-light)] text-gray-900',
  default: 'bg-white text-gray-900 border-b border-gray-200',
};

const sizeClasses = {
  small: 'text-sm',
  medium: 'text-lg',
  large: 'text-xl',
  xl: 'text-2xl',
};

const weightClasses = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

export function HeaderBar({
  layout,
  showTagline,
  backgroundColor,
  logoUrl,
  icon,
  iconPosition = 'before-name',
  taglinePosition = 'below',
  nameSize = 'medium',
  nameWeight = 'bold',
  nameColor,
  taglineSize = 'small',
  taglineWeight = 'normal',
  taglineColor,
  links,
  linkColor,
}: HeaderBarProps) {
  const config = useConfig();
  const alignClass = layout === 'centered' ? 'text-center' : 'text-left';
  const displayLogo = logoUrl || (config.logoUrl ? getLogoUrl(config.logoUrl, 'original.png') : null);
  const isGrouped = taglinePosition === 'grouped' && showTagline && config.tagline;

  const nameNode = (
    <span
      className={`${sizeClasses[nameSize]} ${weightClasses[nameWeight]}`}
      style={nameColor ? { color: nameColor } : undefined}
    >
      {config.siteName}
    </span>
  );

  const taglineNode = (
    <span
      className={`opacity-80 ${sizeClasses[taglineSize]} ${weightClasses[taglineWeight]}`}
      style={taglineColor ? { color: taglineColor } : undefined}
    >
      {config.tagline}
    </span>
  );

  const titleStack = isGrouped ? (
    <div className="flex flex-col">
      {nameNode}
      {taglineNode}
    </div>
  ) : nameNode;

  const iconNode = icon ? <IconRenderer icon={icon} size={nameSize === 'xl' ? 28 : nameSize === 'large' ? 24 : 20} /> : null;

  return (
    <header className={`px-4 py-3 ${bgClasses[backgroundColor]}`}>
      <div className={`mx-auto max-w-6xl ${alignClass}`}>
        <div className={layout === 'centered' ? 'flex flex-col items-center gap-1' : 'flex items-center justify-between'}>
          <Link href="/" className="inline-flex items-center gap-3">
            {displayLogo && <img src={displayLogo} alt={config.siteName} className="h-8 w-auto" />}
            {iconPosition === 'above-name' && iconNode && (
              <div className="flex flex-col items-center gap-1">
                {iconNode}
                {titleStack}
              </div>
            )}
            {iconPosition !== 'above-name' && (
              <>
                {iconPosition === 'before-name' && iconNode}
                {titleStack}
                {iconPosition === 'after-name' && iconNode}
              </>
            )}
          </Link>

          {links && links.length > 0 && (
            <nav className="flex items-center gap-4">
              {links.map((link, i) => {
                const resolved = resolveLink(link.href);
                return (
                  <Link
                    key={i}
                    href={resolved.href}
                    target={resolved.target}
                    rel={resolved.target === '_blank' ? 'noopener noreferrer' : undefined}
                    className="text-sm hover:underline"
                    style={linkColor ? { color: linkColor } : undefined}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {showTagline && !isGrouped && config.tagline && (
          <p
            className={`mt-0.5 opacity-80 ${sizeClasses[taglineSize]} ${weightClasses[taglineWeight]}`}
            style={taglineColor ? { color: taglineColor } : undefined}
          >
            {config.tagline}
          </p>
        )}
      </div>
    </header>
  );
}
