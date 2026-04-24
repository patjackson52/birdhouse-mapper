import Link from 'next/link';
import { MaintenanceStatusPill } from '@/components/maintenance/MaintenanceStatusPill';
import { KnowledgePreviewCard } from '@/components/knowledge/KnowledgePreviewCard';
import { classifyLastMaintained } from '@/lib/maintenance/logic';
import type { MaintenanceProject } from '@/lib/maintenance/types';

interface ItemRow {
  id: string;
  name: string;
  type_name: string | null;
  last_maintained_at: string | null;
}

interface KnowledgeRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  visibility: 'org' | 'public';
  cover_image_url: string | null;
}

interface Props {
  project: MaintenanceProject;
  propertySlug: string;
  propertyName: string;
  items: ItemRow[];
  knowledge: KnowledgeRow[];
  progress: { completed: number; total: number };
  isOrgMember: boolean;
}

function formatDate(iso: string | null, withYear = false): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
  });
}

const TONE_COLORS = {
  fresh: 'bg-green-600',
  normal: 'bg-gray-400',
  warn: 'bg-amber-600',
  danger: 'bg-red-600',
};

export function MaintenancePublicViewer({
  project,
  propertySlug,
  propertyName,
  items,
  knowledge,
  progress,
  isOrgMember,
}: Props) {
  const percent =
    progress.total === 0 ? 0 : Math.floor((progress.completed / progress.total) * 100);
  const signInRedirect = `/p/${propertySlug}/maintenance/${project.id}`;

  return (
    <div className="bg-parchment min-h-screen">
      <header className="bg-white border-b border-sage-light sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 md:px-10 py-3 md:py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="w-7 h-7 rounded-lg bg-forest text-white flex items-center justify-center text-sm">
              🐦
            </span>
            <span className="font-heading text-forest-dark text-sm font-semibold">
              {propertyName}
            </span>
          </div>
          <nav className="hidden md:flex gap-5 text-sm">
            <Link href={`/p/${propertySlug}`} className="text-forest-dark hover:text-forest">
              Map
            </Link>
            <Link href={`/p/${propertySlug}/list`} className="text-forest-dark hover:text-forest">
              List
            </Link>
            <Link href={`/p/${propertySlug}/about`} className="text-forest-dark hover:text-forest">
              About
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-10 py-6 md:py-10">
        <div className="mb-3 text-xs">
          <Link href={`/p/${propertySlug}`} className="text-golden hover:opacity-80 inline-flex items-center gap-1">
            ← Back to map
          </Link>
        </div>

        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-golden">
            Maintenance project
          </span>
          <MaintenanceStatusPill status={project.status} size="sm" />
        </div>

        <h1 className="font-heading text-forest-dark text-2xl md:text-4xl font-semibold leading-tight mb-4">
          {project.title}
        </h1>

        {project.description && (
          <p className="text-[15px] md:text-[17px] leading-relaxed text-gray-700 mb-5">
            {project.description}
          </p>
        )}

        <div className="card p-4 mb-5 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-[11px] text-gray-600 mb-0.5">Scheduled</div>
            <div className="text-sm font-semibold text-forest-dark">
              {formatDate(project.scheduled_for, true)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-gray-600 mb-0.5">Scope</div>
            <div className="text-sm font-semibold text-forest-dark">
              {items.length} item{items.length === 1 ? '' : 's'}
            </div>
          </div>
          {project.status === 'in_progress' && (
            <div className="col-span-2 md:col-span-1" data-testid="mpv-progress">
              <div className="text-[11px] text-gray-600 mb-1">
                Progress · {progress.completed}/{progress.total}
              </div>
              <div className="h-2 rounded-full bg-sage-light overflow-hidden">
                <div className="h-full bg-forest" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
        </div>

        <h2 className="font-heading text-forest-dark text-xl mt-6 mb-3">
          Items in this project
        </h2>
        {items.length === 0 ? (
          <div className="card p-6 text-sm text-gray-600 text-center">No items yet.</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            {items.map((it, idx) => {
              const last = classifyLastMaintained(it.last_maintained_at);
              const toneClass = TONE_COLORS[last.tone];
              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    idx < items.length - 1 ? 'border-b border-sage-light' : ''
                  }`}
                >
                  <span aria-hidden className={`w-2.5 h-2.5 rounded-full shrink-0 ${toneClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-forest-dark truncate">
                      {it.name}
                    </div>
                    <div className="text-[11px] text-gray-600">
                      {it.type_name ?? 'Item'} · Last maintained {last.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {knowledge.length > 0 && (
          <>
            <h2 className="font-heading text-forest-dark text-xl mt-8 mb-3">
              Reference material
            </h2>
            <div className="space-y-3">
              {knowledge.map((k) => (
                <KnowledgePreviewCard
                  key={k.id}
                  item={k}
                  isOrgMember={isOrgMember}
                  signInRedirect={signInRedirect}
                />
              ))}
            </div>
          </>
        )}

        <div className="h-12" />
      </main>
    </div>
  );
}
