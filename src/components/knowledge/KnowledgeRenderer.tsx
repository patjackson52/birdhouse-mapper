import type { KnowledgeItem } from '@/lib/knowledge/types';

interface KnowledgeRendererProps {
  item: KnowledgeItem;
  showTitle?: boolean;
  showTags?: boolean;
  showAttachments?: boolean;
  textSize?: 'small' | 'medium' | 'large';
  attachments?: Array<{ vault_item_id: string; file_name: string; mime_type: string | null; file_size: number }>;
}

export default function KnowledgeRenderer({
  item,
  showTitle = true,
  showTags = true,
  showAttachments = true,
  textSize = 'medium',
  attachments = [],
}: KnowledgeRendererProps) {
  const proseSizeClass = textSize === 'small' ? 'prose-sm' : textSize === 'large' ? 'prose-lg' : 'prose-base';

  return (
    <article className="space-y-4">
      {showTitle && (
        <h2 className="text-2xl font-heading font-semibold text-forest-dark">{item.title}</h2>
      )}

      {showTags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span key={tag} className="bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {item.cover_image_url && (
        <img
          src={item.cover_image_url}
          alt={item.title}
          className="w-full max-h-64 object-cover rounded-lg"
        />
      )}

      {item.body_html && (
        <div
          className={`prose ${proseSizeClass} max-w-none prose-headings:text-[var(--color-primary-dark)] prose-a:text-[var(--color-primary)]`}
          dangerouslySetInnerHTML={{ __html: item.body_html }}
        />
      )}

      {showAttachments && attachments.length > 0 && (
        <div className="border-t border-sage-light pt-4">
          <h3 className="text-sm font-medium text-forest-dark mb-2">Attachments</h3>
          <div className="space-y-2">
            {attachments.map((a) => (
              <div key={a.vault_item_id} className="flex items-center gap-2 text-sm">
                <span className="text-sage">📎</span>
                <span className="text-forest-dark">{a.file_name}</span>
                <span className="text-sage text-xs">
                  ({(a.file_size / 1024).toFixed(0)} KB)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
