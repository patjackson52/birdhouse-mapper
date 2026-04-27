import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import { MaintenanceListView } from '@/components/maintenance/MaintenanceListView';
import { classifyScheduled } from '@/lib/maintenance/logic';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

export const metadata = {
  title: 'Scheduled Maintenance',
};

export default async function OrgMaintenancePage() {
  const tenant = await getTenantContext();
  if (tenant.source === 'platform' || !tenant.orgId) redirect('/');
  const orgId = tenant.orgId;

  const supabase = createClient();

  const { data: properties } = await supabase
    .from('properties')
    .select('id, name, slug')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name');

  const propertyList = (properties ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? (p.slug as string),
    slug: p.slug as string,
  }));
  const propertyIds = propertyList.map((p) => p.id);

  const SENTINEL = '00000000-0000-0000-0000-000000000000';

  const { data: projects } = await supabase
    .from('maintenance_projects')
    .select('*')
    .in('property_id', propertyIds.length > 0 ? propertyIds : [SENTINEL])
    .order('updated_at', { ascending: false });

  const projectIds = (projects ?? []).map((p) => (p as { id: string }).id);

  const [{ data: itemCounts }, { data: knowledgeCounts }] = await Promise.all([
    supabase
      .from('maintenance_project_items')
      .select('maintenance_project_id, completed_at')
      .in('maintenance_project_id', projectIds.length > 0 ? projectIds : [SENTINEL]),
    supabase
      .from('maintenance_project_knowledge')
      .select('maintenance_project_id')
      .in('maintenance_project_id', projectIds.length > 0 ? projectIds : [SENTINEL]),
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
    const proj = p as unknown as MaintenanceProjectRowData;
    const agg = byProject.get(proj.id) ?? { completed: 0, total: 0, knowledge: 0 };
    return {
      ...proj,
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

  const slugById: Record<string, string> = {};
  for (const p of propertyList) slugById[p.id] = p.slug;

  const detailHrefByRowId: Record<string, string> = {};
  for (const r of rows) {
    const slug = slugById[r.property_id ?? ''] ?? '';
    detailHrefByRowId[r.id] = `/admin/properties/${slug}/maintenance/${r.id}`;
  }

  const createHrefBySlug: Record<string, string> = {};
  for (const p of propertyList) {
    createHrefBySlug[p.slug] = `/admin/properties/${p.slug}/maintenance/new`;
  }

  return (
    <MaintenanceListView
      mode="org"
      rows={rows}
      properties={propertyList}
      stats={{
        in_progress: inProgress,
        due_soon: dueSoon,
        overdue,
        completed_this_year: completedThisYear,
      }}
      today={today}
      detailHrefByRowId={detailHrefByRowId}
      createHrefBySlug={createHrefBySlug}
    />
  );
}
