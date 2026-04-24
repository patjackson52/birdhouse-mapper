interface KnowledgePreviewItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  visibility: 'org' | 'public';
  cover_image_url: string | null;
}

interface Props {
  item: KnowledgePreviewItem;
  isOrgMember: boolean;
  /** Optional override for the sign-in redirect URL. Defaults to current path. */
  signInRedirect?: string;
}

export function KnowledgePreviewCard({ item, isOrgMember, signInRedirect }: Props) {
  const isPublic = item.visibility === 'public';

  let href: string;
  let ctaLabel: string;

  if (isPublic) {
    href = `/knowledge/${item.slug}`;
    ctaLabel = 'Read article ↗';
  } else if (isOrgMember) {
    href = `/admin/knowledge/${item.slug}`;
    ctaLabel = 'Read full article';
  } else {
    const redirect = signInRedirect ?? (typeof window !== 'undefined' ? window.location.pathname : '/');
    href = `/login?redirect=${encodeURIComponent(redirect)}`;
    ctaLabel = 'Sign in to read full article';
  }

  return (
    <article className="card overflow-hidden">
      {item.cover_image_url && (
        <img
          src={item.cover_image_url}
          alt={item.title}
          className="w-full aspect-video object-cover"
        />
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span
            aria-label={`Visibility: ${isPublic ? 'Public' : 'Org'}`}
            className={`inline-flex items-center rounded-full text-[10px] px-2 py-0.5 font-medium ${
              isPublic ? 'bg-green-100 text-green-800' : 'bg-indigo-100 text-indigo-800'
            }`}
          >
            {isPublic ? 'Public' : 'Org'}
          </span>
        </div>
        <h3 className="font-heading text-forest-dark text-base">{item.title}</h3>
        {item.excerpt && (
          <p className="text-sm text-gray-700 line-clamp-3">{item.excerpt}</p>
        )}
        <div className="pt-1">
          <a href={href} className="text-sm text-forest hover:text-forest-dark inline-flex items-center gap-1">
            {ctaLabel}
          </a>
        </div>
      </div>
    </article>
  );
}
