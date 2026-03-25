import { getTenantContext } from '@/lib/tenant/server';
import { redirect } from 'next/navigation';
import { AdminShell } from './AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenantContext();

  // Admin is org-scoped — platform context should never reach here (middleware redirects),
  // but guard against it for type safety.
  if (tenant.source === 'platform' || !tenant.orgId) {
    redirect('/');
  }

  return (
    <AdminShell
      orgId={tenant.orgId}
      orgSlug={tenant.orgSlug}
      propertyId={tenant.propertyId ?? null}
      propertySlug={tenant.propertySlug ?? null}
    >
      {children}
    </AdminShell>
  );
}
