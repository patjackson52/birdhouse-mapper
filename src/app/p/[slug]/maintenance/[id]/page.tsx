import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MaintenancePublicViewer } from './MaintenancePublicViewer';
import type { MaintenanceProject } from '@/lib/maintenance/types';

interface PageProps {
  params: { slug: string; id: string };
}

async function loadData(slug: string, id: string) {
  const supabase = createClient();

  const { data: property } = await supabase
    .from('properties')
    .select('id, name, slug, org_id, is_active')
    .eq('slug', slug)
    .single();
  if (!property || !property.is_active) return null;

  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('*')
    .eq('id', id)
    .eq('property_id', property.id)
    .single();
  if (!project) return null;

  const [{ data: itemLinks }, { data: knowledgeLinks }] = await Promise.all([
    supabase
      .from('maintenance_project_items')
      .select(
        'item_id, completed_at, items(id, name, item_type_id, item_types(name))',
      )
      .eq('maintenance_project_id', id),
    supabase
      .from('maintenance_project_knowledge')
      .select(
        'knowledge_item_id, knowledge_items(id, slug, title, excerpt, visibility, cover_image_url)',
      )
      .eq('maintenance_project_id', id),
  ]);

  const itemIds = (itemLinks ?? [])
    .map((l) => (l.items as { id?: string } | null)?.id)
    .filter((v): v is string => typeof v === 'string');

  // Fetch last-maintained via item_updates of type 'Maintenance'
  let lastMaintById = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data: updates } = await supabase
      .from('item_updates')
      .select('item_id, created_at, update_types!inner(name)')
      .in('item_id', itemIds)
      .eq('update_types.name', 'Maintenance')
      .order('created_at', { ascending: false });
    for (const u of (updates ?? []) as Array<{ item_id: string; created_at: string }>) {
      if (!lastMaintById.has(u.item_id)) lastMaintById.set(u.item_id, u.created_at);
    }
  }

  const items = (itemLinks ?? [])
    .map((l) => {
      const item = l.items as {
        id?: string;
        name?: string;
        item_types?: { name?: string } | null;
      } | null;
      if (!item?.id) return null;
      return {
        id: item.id,
        name: item.name ?? 'Unnamed',
        type_name: item.item_types?.name ?? null,
        last_maintained_at: lastMaintById.get(item.id) ?? null,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const knowledge = (knowledgeLinks ?? [])
    .map((l) => {
      const k = l.knowledge_items as {
        id?: string;
        slug?: string;
        title?: string;
        excerpt?: string | null;
        visibility?: 'org' | 'public';
        cover_image_url?: string | null;
      } | null;
      if (!k?.id || !k.slug) return null;
      return {
        id: k.id,
        slug: k.slug,
        title: k.title ?? 'Untitled',
        excerpt: k.excerpt ?? null,
        visibility: k.visibility ?? 'org',
        cover_image_url: k.cover_image_url ?? null,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  // Progress rollup
  const completed = (itemLinks ?? []).filter((l) => l.completed_at !== null).length;
  const total = itemLinks?.length ?? 0;

  // isOrgMember: current user has active membership in this property's org
  const { data: { user } } = await supabase.auth.getUser();
  let isOrgMember = false;
  if (user) {
    const { data: membership } = await supabase
      .from('org_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('org_id', property.org_id)
      .eq('status', 'active')
      .maybeSingle();
    isOrgMember = !!membership;
  }

  return {
    property,
    project: project as unknown as MaintenanceProject,
    items,
    knowledge,
    progress: { completed, total },
    isOrgMember,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await loadData(params.slug, params.id);
  if (!data) return { title: 'Maintenance project' };
  return {
    title: `${data.project.title} — ${data.property.name}`,
    description: (data.project.description ?? 'Maintenance project').slice(0, 160),
  };
}

export default async function PublicMaintenanceProjectPage({ params }: PageProps) {
  const data = await loadData(params.slug, params.id);
  if (!data) notFound();

  return (
    <MaintenancePublicViewer
      project={data.project}
      propertySlug={params.slug}
      propertyName={data.property.name}
      items={data.items}
      knowledge={data.knowledge}
      progress={data.progress}
      isOrgMember={data.isOrgMember}
    />
  );
}
