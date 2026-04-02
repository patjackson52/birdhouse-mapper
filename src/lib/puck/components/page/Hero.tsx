import Link from 'next/link';
import type { HeroProps } from '../../types';
import { resolveLink } from '../../fields/link-utils';
import { IconRenderer } from '../../icons/IconRenderer';
import { heroTitleClasses, heroSubtitleClasses } from '../../text-styles';

const overlayClasses = {
  primary: 'bg-[var(--color-primary)]/70',
  dark: 'bg-black/60',
  none: '',
};

export function Hero({ title, subtitle, backgroundImageUrl, overlay, ctaLabel, ctaHref, icon, textSize = 'large' }: HeroProps) {
  const cta = resolveLink(ctaHref);
  return (
    <section
      className="relative flex min-h-[300px] items-center justify-center"
      style={backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {!backgroundImageUrl && (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)]" />
      )}
      {overlay !== 'none' && (
        <div className={`absolute inset-0 ${overlayClasses[overlay]}`} />
      )}
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-16 text-center text-white">
        {icon && (
          <div className="mb-4 flex justify-center">
            <IconRenderer icon={icon} size={48} className="text-white" />
          </div>
        )}
        {title && <h1 className={`${heroTitleClasses[textSize]} font-bold`}>{title}</h1>}
        {subtitle && <p className={`mt-4 ${heroSubtitleClasses[textSize]} opacity-90`}>{subtitle}</p>}
        {ctaLabel && cta.href && (
          <Link
            href={cta.href}
            target={cta.target}
            className="mt-8 inline-block rounded-lg bg-white px-8 py-3 font-semibold text-[var(--color-primary-dark)] transition hover:bg-opacity-90"
            style={cta.color ? { color: cta.color } : undefined}
          >
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
