import Link from 'next/link';
import type { HeroProps } from '../../types';

const overlayClasses = {
  primary: 'bg-[var(--color-primary)]/70',
  dark: 'bg-black/60',
  none: '',
};

export function Hero({ title, subtitle, backgroundImageUrl, overlay, ctaLabel, ctaHref }: HeroProps) {
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
        {title && <h1 className="text-4xl font-bold md:text-5xl">{title}</h1>}
        {subtitle && <p className="mt-4 text-lg opacity-90 md:text-xl">{subtitle}</p>}
        {ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className="mt-8 inline-block rounded-lg bg-white px-8 py-3 font-semibold text-[var(--color-primary-dark)] transition hover:bg-opacity-90"
          >
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
