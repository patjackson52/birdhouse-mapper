'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ActionButtonsBlockProps {
  itemId: string;
  canEdit: boolean;
  canAddUpdate: boolean;
  isAuthenticated?: boolean;
  mode: 'live' | 'preview';
}

export default function ActionButtonsBlock({ itemId, canEdit, canAddUpdate, isAuthenticated = false, mode }: ActionButtonsBlockProps) {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : null;
  const addUpdatePath = slug
    ? `/p/${slug}/update/${itemId}`
    : `/manage/update?item=${itemId}`;

  if (mode === 'preview') {
    return (
      <div className="flex flex-wrap gap-2 opacity-60">
        {canEdit && (
          <button disabled className="btn-secondary text-sm cursor-not-allowed">
            Edit
          </button>
        )}
        {canAddUpdate && (
          <button disabled className="btn-primary text-sm cursor-not-allowed">
            Add Update
          </button>
        )}
      </div>
    );
  }

  const addUpdateHref = isAuthenticated
    ? addUpdatePath
    : `/login?redirect=${encodeURIComponent(addUpdatePath)}`;

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && (
        <Link href={`/manage/edit/${itemId}`} className="btn-secondary text-sm">
          Edit
        </Link>
      )}
      {canAddUpdate && (
        <Link href={addUpdateHref} className="btn-primary text-sm">
          Add Update
        </Link>
      )}
    </div>
  );
}
