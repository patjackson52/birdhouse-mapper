'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export async function addPropertyOverride(
  userId: string,
  propertyId: string,
  roleId: string,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Upsert so re-adding an override updates the role instead of failing
  const { error } = await supabase
    .from('property_memberships')
    .upsert(
      {
        org_id: tenant.orgId,
        property_id: propertyId,
        user_id: userId,
        role_id: roleId,
        grant_type: 'explicit',
      },
      { onConflict: 'org_id,property_id,user_id' },
    );

  if (error) return { error: error.message };
  return { success: true };
}

export async function removePropertyOverride(propertyMembershipId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { error } = await supabase
    .from('property_memberships')
    .delete()
    .eq('id', propertyMembershipId)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };
  return { success: true };
}
