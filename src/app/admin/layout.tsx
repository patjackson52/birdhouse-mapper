import { getTenantContext } from '@/lib/tenant/server';
import { AdminShell } from './AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenantContext();
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
