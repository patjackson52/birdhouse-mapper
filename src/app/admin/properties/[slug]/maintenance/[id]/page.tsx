import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MaintenanceDetailForm } from './MaintenanceDetailForm';
import type { LinkedItem, LinkedKnowledge, MaintenanceProject } from '@/lib/maintenance/types';

interface PageProps {
  params: { slug: string; id: string };
}

export default async function MaintenanceDetailPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('*')
    .eq('id', params.id)
    .single();
  if (!project) notFound();

  const { data: linkedItemsRaw } = await supabase
    .from('maintenance_project_items')
    .select('item_id, completed_at, completed_by, items(name, item_type_id, item_types(name, icon))')
    .eq('maintenance_project_id', params.id);

  const linkedItems: LinkedItem[] = (linkedItemsRaw ?? []).map((row) => {
    const item = (row.items ?? {}) as { name?: string; item_types?: { name?: string; icon?: string } };
    return {
      item_id: row.item_id as string,
      name: item.name ?? 'Unknown item',
      type_name: item.item_types?.name ?? null,
      icon: item.item_types?.icon ?? null,
      last_maintained_at: null, // not surfaced in PR 1
      completed_at: (row.completed_at as string | null) ?? null,
      completed_by: (row.completed_by as string | null) ?? null,
    };
  });

  const { data: linkedKnowledgeRaw } = await supabase
    .from('maintenance_project_knowledge')
    .select('knowledge_item_id, knowledge_items(title, slug, visibility)')
    .eq('maintenance_project_id', params.id);

  const linkedKnowledge: LinkedKnowledge[] = (linkedKnowledgeRaw ?? []).map((row) => {
    const k = (row.knowledge_items ?? {}) as { title?: string; slug?: string; visibility?: 'org' | 'public' };
    return {
      knowledge_item_id: row.knowledge_item_id as string,
      title: k.title ?? 'Untitled',
      slug: k.slug ?? '',
      visibility: k.visibility ?? 'org',
    };
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Admin · Data · Maintenance</div>
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-5">{project.title}</h1>
      <MaintenanceDetailForm
        project={project as unknown as MaintenanceProject}
        propertySlug={params.slug}
        linkedItems={linkedItems}
        linkedKnowledge={linkedKnowledge}
      />
    </div>
  );
}
