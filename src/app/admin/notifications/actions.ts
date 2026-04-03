'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import type { UserNotificationPreference } from '@/lib/notifications/types';

export async function getNotificationPreferences(): Promise<{
  data?: UserNotificationPreference[];
  error?: string;
}> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };
  return { data: (data as UserNotificationPreference[]) ?? [] };
}

export async function updateNotificationPreference(params: {
  channel: string;
  notificationType: string;
  enabled: boolean;
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('user_notification_preferences')
    .upsert(
      {
        user_id: user.id,
        org_id: tenant.orgId,
        channel: params.channel,
        notification_type: params.notificationType,
        enabled: params.enabled,
      },
      { onConflict: 'user_id,org_id,channel,notification_type' }
    );

  if (error) return { error: error.message };
  return { success: true };
}
