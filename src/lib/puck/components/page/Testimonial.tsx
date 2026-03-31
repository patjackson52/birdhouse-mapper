import type { TestimonialProps } from '../../types';

export function Testimonial({ quote, attribution, photoUrl, style }: TestimonialProps) {
  const borderColor = style === 'accent' ? 'border-[var(--color-accent)]' : 'border-[var(--color-primary)]';
  return (
    <blockquote className={`mx-auto max-w-2xl border-l-4 ${borderColor} px-4 py-8 pl-6`}>
      <div className="text-lg italic text-gray-700 prose prose-lg max-w-none">
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
