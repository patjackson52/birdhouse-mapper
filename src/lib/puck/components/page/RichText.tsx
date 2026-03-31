import type { RichTextProps } from '../../types';

export function RichText({ content, alignment, columns }: RichTextProps) {
  const alignClass = alignment === 'center' ? 'text-center' : 'text-left';
  const colClass = columns === 2 ? 'md:columns-2 md:gap-8' : '';

  return (
    <div className={`mx-auto max-w-4xl px-4 py-8 ${alignClass} ${colClass}`}>
      <div className="prose prose-lg max-w-none prose-headings:text-[var(--color-primary-dark)] prose-a:text-[var(--color-primary)]">
        <RichTextContent content={content} />
      </div>
    </div>
  );
}

/**
 * Renders rich text content. Handles three formats:
 * - ReactNode (from Puck richtext field at edit time)
 * - HTML string (from Puck richtext field when saved)
 * - Plain text / markdown (legacy textarea content)
 */
function RichTextContent({ content }: { content: any }) {
  // ReactNode from Puck richtext field (not a string)
  if (typeof content !== 'string') {
    return <>{content}</>;
  }

  // Empty content
  if (!content) return null;

  // HTML string (from saved richtext data)
  const isHtml = content.startsWith('<') || content.includes('<p>') || content.includes('<h');
  if (isHtml) {
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }

  // Legacy plain text / markdown
  const ReactMarkdown = require('react-markdown').default;
  const remarkGfm = require('remark-gfm').default;
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
}
