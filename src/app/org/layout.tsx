import { getTenantContext } from '@/lib/tenant/server';
import { redirect } from 'next/navigation';
import { OrgShell } from '@/components/layout/OrgShell';
import { createClient } from '@/lib/supabase/server';

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenantContext();

  if (tenant.source === 'platform' || !tenant.orgId) {
    redirect('/');
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <OrgShell
      orgId={tenant.orgId}
      orgSlug={tenant.orgSlug}
      userEmail={user?.email ?? ''}
    >
      {children}
    </OrgShell>
  );
}
