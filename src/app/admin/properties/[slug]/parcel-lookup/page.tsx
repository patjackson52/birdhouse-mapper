import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import { redirect } from 'next/navigation';
import ParcelLookup from '@/components/geo/ParcelLookup';

export default async function ParcelLookupPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenant = await getTenantContext();
  if (!tenant.orgId) redirect('/login');

  const { data: property } = await supabase
    .from('properties')
    .select('id, name')
    .eq('org_id', tenant.orgId)
    .eq('slug', params.slug)
    .single();

  if (!property) redirect('/admin/properties');

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-4">Parcel Lookup</h2>
      <p className="text-sm text-gray-500 mb-6">
        Search for parcel boundaries from public county GIS records and save them as geo layers.
      </p>
      <ParcelLookup
        propertyId={property.id}
        propertyName={property.name}
        orgId={tenant.orgId}
      />
    </div>
  );
}
