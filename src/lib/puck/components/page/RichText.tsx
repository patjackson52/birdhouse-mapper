import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RichTextProps } from '../../types';

export function RichText({ content, alignment, columns }: RichTextProps) {
  const alignClass = alignment === 'center' ? 'text-center' : 'text-left';
  const colClass = columns === 2 ? 'md:columns-2 md:gap-8' : '';
  return (
    <div className={`mx-auto max-w-4xl px-4 py-8 ${alignClass} ${colClass}`}>
      <div className="prose prose-lg max-w-none prose-headings:text-[var(--color-primary-dark)] prose-a:text-[var(--color-primary)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
