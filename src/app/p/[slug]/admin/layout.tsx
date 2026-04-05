import { getTenantContext } from '@/lib/tenant/server';
import { redirect } from 'next/navigation';
import { PropertyAdminShell } from '@/components/layout/PropertyAdminShell';
import { createClient } from '@/lib/supabase/server';

export default async function PropertyAdminLayout({
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

  return (
    <PropertyAdminShell
      orgId={tenant.orgId}
      orgSlug={tenant.orgSlug}
      propertySlug={slug}
      userEmail={user?.email ?? ''}
    >
      {children}
    </PropertyAdminShell>
  );
}
