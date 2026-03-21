import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextBlock as TextBlockType } from '@/lib/config/landing-types';
export function TextBlock({ block }: { block: TextBlockType }) {
  const alignment = block.alignment ?? 'left';
  return (
    <div data-block-type="text" className={`max-w-3xl mx-auto px-6 py-4 ${alignment === 'center' ? 'text-center' : ''}`}>
      <div className="prose prose-forest max-w-none text-forest-dark/80">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content}</ReactMarkdown>
      </div>
    </div>
  );
}
