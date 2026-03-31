import type { RichTextProps } from '../../types';

export function RichText({ content, alignment, columns }: RichTextProps) {
  const alignClass = alignment === 'center' ? 'text-center' : 'text-left';
  const colClass = columns === 2 ? 'md:columns-2 md:gap-8' : '';

  const isHtml = content.startsWith('<') || content.includes('<p>') || content.includes('<h');

  return (
    <div className={`mx-auto max-w-4xl px-4 py-8 ${alignClass} ${colClass}`}>
      <div className="prose prose-lg max-w-none prose-headings:text-[var(--color-primary-dark)] prose-a:text-[var(--color-primary)]">
        {isHtml ? (
          <div dangerouslySetInnerHTML={{ __html: content }} />
        ) : (
          <MarkdownContent content={content} />
        )}
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const ReactMarkdown = require('react-markdown').default;
  const remarkGfm = require('remark-gfm').default;
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
}
