import { getKnowledgeItem, getAttachments } from '@/lib/knowledge/actions';
import KnowledgeRenderer from '@/components/knowledge/KnowledgeRenderer';
import { notFound } from 'next/navigation';

interface Props {
  params: { slug: string };
}

export default async function PublicKnowledgePage({ params }: Props) {
  const { item } = await getKnowledgeItem(params.slug);

  if (!item || item.visibility !== 'public') {
    notFound();
  }

  const { attachments } = await getAttachments(item.id);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <KnowledgeRenderer
        item={item}
        showTitle
        showTags
        showAttachments
        textSize="large"
        attachments={attachments}
      />
    </div>
  );
}
