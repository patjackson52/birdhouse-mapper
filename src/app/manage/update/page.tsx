import { redirect } from 'next/navigation';
import { resolveTenant } from '@/lib/tenant/resolve';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';

interface AddUpdatePageProps {
  searchParams: { item?: string };
}

export default async function AddUpdatePage({ searchParams }: AddUpdatePageProps) {
  const hostname = headers().get('host') ?? 'localhost';
  const tenantClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const tenant = await resolveTenant(hostname, '/manage/update', tenantClient);

  let slug = tenant?.propertySlug ?? null;
  if (!slug && tenant?.orgId) {
    const { data: property } = await tenantClient
      .from('properties')
      .select('slug')
      .eq('org_id', tenant.orgId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    slug = property?.slug ?? null;
  }

  if (!slug) {
    redirect('/');
  }

  const itemId = searchParams.item;
  redirect(itemId ? `/p/${slug}/update/${itemId}` : `/p/${slug}`);
}
