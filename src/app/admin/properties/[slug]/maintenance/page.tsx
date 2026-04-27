import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MaintenanceListView } from '@/components/maintenance/MaintenanceListView';
import { classifyScheduled } from '@/lib/maintenance/logic';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

interface PageProps {
  params: { slug: string };
}

export default async function MaintenanceListPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: property } = await supabase
    .from('properties')
    .select('id, name, slug, org_id')
    .eq('slug', params.slug)
    .single();
  if (!property) notFound();

  const { data: projects } = await supabase
    .from('maintenance_projects')
    .select('*')
    .eq('property_id', property.id)
    .order('updated_at', { ascending: false });

  const projectIds = (projects ?? []).map((p) => p.id as string);

  const [{ data: itemCounts }, { data: knowledgeCounts }] = await Promise.all([
    supabase
      .from('maintenance_project_items')
      .select('maintenance_project_id, completed_at')
      .in('maintenance_project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('maintenance_project_knowledge')
      .select('maintenance_project_id')
      .in('maintenance_project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000']),
  ]);

  const byProject = new Map<string, { completed: number; total: number; knowledge: number }>();
  for (const id of projectIds) byProject.set(id, { completed: 0, total: 0, knowledge: 0 });
  for (const row of itemCounts ?? []) {
    const bucket = byProject.get(row.maintenance_project_id as string);
    if (!bucket) continue;
    bucket.total++;
    if (row.completed_at) bucket.completed++;
  }
  for (const row of knowledgeCounts ?? []) {
    const bucket = byProject.get(row.maintenance_project_id as string);
    if (bucket) bucket.knowledge++;
  }

  const rows: MaintenanceProjectRowData[] = (projects ?? []).map((p) => {
    const agg = byProject.get(p.id as string) ?? { completed: 0, total: 0, knowledge: 0 };
    return {
      ...(p as unknown as MaintenanceProjectRowData),
      items_completed: agg.completed,
      items_total: agg.total,
      knowledge_count: agg.knowledge,
      creator_name: null,
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);

  let inProgress = 0;
  let dueSoon = 0;
  let overdue = 0;
  let completedThisYear = 0;
  for (const r of rows) {
    if (r.status === 'in_progress') inProgress++;
    const c = classifyScheduled(r.scheduled_for, r.status, today);
    if (c.tone === 'overdue') overdue++;
    else if (c.tone === 'soon') dueSoon++;
    if (r.status === 'completed' && r.updated_at.slice(0, 4) === year) completedThisYear++;
  }

  const propertySlug = params.slug;

  const detailHrefByRowId: Record<string, string> = {};
  for (const r of rows) {
    detailHrefByRowId[r.id] = `/p/${propertySlug}/admin/maintenance/${r.id}`;
  }
  const createHrefBySlug: Record<string, string> = {
    [property.slug]: `/p/${property.slug}/admin/maintenance/new`,
  };

  return (
    <MaintenanceListView
      mode="property"
      rows={rows}
      properties={[{ id: property.id, name: property.name, slug: property.slug }]}
      stats={{
        in_progress: inProgress,
        due_soon: dueSoon,
        overdue: overdue,
        completed_this_year: completedThisYear,
      }}
      today={today}
      detailHrefByRowId={detailHrefByRowId}
      createHrefBySlug={createHrefBySlug}
      createHref={`/p/${propertySlug}/admin/maintenance/new`}
    />
  );
}
