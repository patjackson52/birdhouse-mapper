import type { TestimonialProps } from '../../types';
import { proseSizeClasses } from '../../text-styles';

const borderClasses = {
  default: 'border-[var(--color-primary)]',
  accent: 'border-[var(--color-accent)]',
};

export function Testimonial({ quote, attribution, photoUrl, style, textSize = 'large' }: TestimonialProps) {
  const proseSize = proseSizeClasses[textSize];
  return (
    <blockquote className={`mx-auto max-w-2xl border-l-4 ${borderClasses[style]} px-4 py-8 pl-6`}>
      <div className={`italic text-gray-700 prose ${proseSize} max-w-none`}>
        &ldquo;{typeof quote === 'string'
          ? <span dangerouslySetInnerHTML={{ __html: quote }} />
          : <span>{quote}</span>
        }&rdquo;
      </div>
      <footer className="mt-4 flex items-center gap-3">
        {photoUrl && <img src={photoUrl} alt={attribution} className="h-10 w-10 rounded-full object-cover" />}
        <cite className="text-sm font-medium not-italic text-gray-600">{attribution}</cite>
      </footer>
    </blockquote>
  );
}
