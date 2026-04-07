import { getTenantContext } from '@/lib/tenant/server';
import { redirect } from 'next/navigation';
import { FieldModeShell } from '@/components/layout/FieldModeShell';
import { createClient } from '@/lib/supabase/server';
import { getActiveTopics } from '@/lib/communications/queries';
import { SubscribePrompt } from '@/components/communications/SubscribePrompt';

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
    .select('id, name, communications_enabled')
    .eq('slug', slug)
    .single();

  const { data: org } = await supabase
    .from('orgs')
    .select('communications_enabled')
    .eq('id', tenant.orgId)
    .single();

  const communicationsEnabled =
    (org?.communications_enabled ?? false) &&
    (property?.communications_enabled ?? false);

  const topics = communicationsEnabled && property?.id
    ? await getActiveTopics(tenant.orgId, property.id).catch(() => [])
    : [];

  return (
    <FieldModeShell
      propertyName={property?.name ?? slug}
      propertySlug={slug}
      userEmail={user?.email ?? ''}
    >
      {children}
      {topics.length > 0 && (
        <SubscribePrompt topics={topics} siteName={property?.name ?? slug} />
      )}
    </FieldModeShell>
  );
}
