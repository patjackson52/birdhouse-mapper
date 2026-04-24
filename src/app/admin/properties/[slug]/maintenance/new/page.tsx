import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MaintenanceCreateForm } from './MaintenanceCreateForm';

interface PageProps {
  params: { slug: string };
}

export default async function NewMaintenanceProjectPage({ params }: PageProps) {
  const supabase = createClient();
  const { data: property } = await supabase
    .from('properties')
    .select('id, org_id, name')
    .eq('slug', params.slug)
    .single();
  if (!property) notFound();

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="text-[11px] uppercase tracking-wider text-gray-500">Admin · Data · Maintenance</div>
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">New maintenance project</h1>
      <MaintenanceCreateForm
        orgId={property.org_id as string}
        propertyId={property.id as string}
        propertySlug={params.slug}
      />
    </div>
  );
}
