import { getTenantContext } from '@/lib/tenant/server';
import { redirect } from 'next/navigation';
import { FieldModeShell } from '@/components/layout/FieldModeShell';
import { createClient } from '@/lib/supabase/server';

export default async function PropertyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getTenantContext();

  if (tenant.source === 'platform' || !tenant.orgId) {
    redirect('/');
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: property } = await supabase
    .from('properties')
    .select('name')
    .eq('slug', slug)
    .single();

  return (
    <FieldModeShell
      propertyName={property?.name ?? slug}
      propertySlug={slug}
      userEmail={user?.email ?? ''}
    >
      {children}
    </FieldModeShell>
  );
}
