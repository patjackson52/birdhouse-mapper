'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccessConfig = {
  anon_access_enabled: boolean;
  anon_can_view_map: boolean;
  anon_can_view_items: boolean;
  anon_can_view_item_details: boolean;
  anon_can_submit_forms: boolean;
  password_protected: boolean;
  password_hash: string | null;
  allow_embed: boolean;
  embed_allowed_origins: string[];
  anon_visible_field_keys: string[];
};

// ---------------------------------------------------------------------------
// Access Configs
// ---------------------------------------------------------------------------

export async function getAccessConfigs() {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context', configs: [] };

  const { data: properties, error: propError } = await supabase
    .from('properties')
    .select('id, name, slug')
    .eq('org_id', tenant.orgId)
    .is('deleted_at', null)
    .order('name');

  if (propError) return { error: propError.message, configs: [] };

  const propertyIds = (properties || []).map((p) => p.id);

  let configMap: Record<string, Record<string, unknown>> = {};
  if (propertyIds.length > 0) {
    const { data: configs } = await supabase
      .from('property_access_config')
      .select('*')
      .in('property_id', propertyIds);

    for (const c of configs || []) {
      configMap[c.property_id] = c;
    }
  }

  const result = (properties || []).map((p) => {
    const config = configMap[p.id] ?? null;
    return {
      property_id: p.id,
      property_name: p.name,
      property_slug: p.slug,
      config_id: config?.id ?? null,
      anon_access_enabled: config?.anon_access_enabled ?? false,
      anon_can_view_map: config?.anon_can_view_map ?? false,
      anon_can_view_items: config?.anon_can_view_items ?? false,
      anon_can_view_item_details: config?.anon_can_view_item_details ?? false,
      anon_can_submit_forms: config?.anon_can_submit_forms ?? false,
      password_protected: config?.password_protected ?? false,
      password_hash: config?.password_hash ?? null,
      allow_embed: config?.allow_embed ?? false,
      embed_allowed_origins: config?.embed_allowed_origins ?? [],
      anon_visible_field_keys: config?.anon_visible_field_keys ?? [],
    };
  });

  return { configs: result };
}

export async function updateAccessConfig(
  propertyId: string,
  config: Partial<AccessConfig>,
) {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { error } = await supabase
    .from('property_access_config')
    .upsert(
      {
        org_id: tenant.orgId,
        property_id: propertyId,
        ...config,
      },
      { onConflict: 'property_id' },
    );

  if (error) return { error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Anonymous Access Tokens
// ---------------------------------------------------------------------------

export async function getTokens() {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context', tokens: [] };

  const { data, error } = await supabase
    .from('anonymous_access_tokens')
    .select(`
      id,
      token,
      label,
      property_id,
      can_view_map,
      can_view_items,
      can_submit_forms,
      expires_at,
      use_count,
      last_used_at,
      is_active,
      created_by,
      properties ( id, name, slug )
    `)
    .eq('org_id', tenant.orgId)
    .order('created_at' as never, { ascending: false });

  if (error) return { error: error.message, tokens: [] };

  const now = new Date();

  const tokens = (data || []).map((t) => {
    const property = t.properties as unknown as { id: string; name: string; slug: string } | null;

    let status: 'active' | 'expired' | 'revoked';
    if (!t.is_active) {
      status = 'revoked';
    } else if (t.expires_at && new Date(t.expires_at) <= now) {
      status = 'expired';
    } else {
      status = 'active';
    }

    return {
      id: t.id,
      token: t.token,
      label: t.label,
      property_id: t.property_id,
      property_name: property?.name ?? '',
      property_slug: property?.slug ?? '',
      can_view_map: t.can_view_map,
      can_view_items: t.can_view_items,
      can_submit_forms: t.can_submit_forms,
      expires_at: t.expires_at,
      use_count: t.use_count,
      last_used_at: t.last_used_at,
      is_active: t.is_active,
      status,
    };
  });

  return { tokens };
}

export async function createToken(
  propertyId: string,
  label: string,
  expiresAt?: string,
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data, error } = await supabase
    .from('anonymous_access_tokens')
    .insert({
      org_id: tenant.orgId,
      property_id: propertyId,
      label,
      expires_at: expiresAt ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { success: true, token: data };
}

export async function revokeToken(tokenId: string) {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { error } = await supabase
    .from('anonymous_access_tokens')
    .update({ is_active: false })
    .eq('id', tokenId)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Temporary Access Grants
// ---------------------------------------------------------------------------

export async function getGrants() {
  const supabase = createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context', grants: [] };

  const { data, error } = await supabase
    .from('temporary_access_grants')
    .select(`
      id,
      org_id,
      property_id,
      user_id,
      granted_email,
      role_id,
      valid_from,
      valid_until,
      status,
      revoked_at,
      revoked_by,
      granted_by,
      note,
      users!user_id ( id, display_name, email ),
      properties ( id, name, slug ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .order('valid_from' as never, { ascending: false });

  if (error) return { error: error.message, grants: [] };

  const grants = (data || []).map((g) => {
    const grantUser = g.users as unknown as { id: string; display_name: string; email: string } | null;
    const property = g.properties as unknown as { id: string; name: string; slug: string } | null;
    const role = g.roles as unknown as { id: string; name: string; base_role: string } | null;

    return {
      id: g.id,
      property_id: g.property_id,
      property_name: property?.name ?? '',
      property_slug: property?.slug ?? '',
      user_id: g.user_id,
      user_display_name: grantUser?.display_name ?? '',
      user_email: grantUser?.email ?? g.granted_email ?? '',
      granted_email: g.granted_email,
      role_id: g.role_id,
      role_name: role?.name ?? '',
      role_base_role: role?.base_role ?? '',
      valid_from: g.valid_from,
      valid_until: g.valid_until,
      status: g.status,
      revoked_at: g.revoked_at,
      revoked_by: g.revoked_by,
      granted_by: g.granted_by,
      note: g.note,
    };
  });

  return { grants };
}

export async function createGrant(data: {
  userId: string;
  propertyId: string;
  roleId: string;
  validFrom: string;
  validUntil: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { error } = await supabase
    .from('temporary_access_grants')
    .insert({
      org_id: tenant.orgId,
      user_id: data.userId,
      property_id: data.propertyId,
      role_id: data.roleId,
      valid_from: data.validFrom,
      valid_until: data.validUntil,
      status: 'active',
      granted_by: user.id,
    });

  if (error) return { error: error.message };
  return { success: true };
}

export async function revokeGrant(grantId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('temporary_access_grants')
    .update({
      valid_until: now,
      status: 'revoked',
      revoked_at: now,
      revoked_by: user.id,
    })
    .eq('id', grantId)
    .eq('org_id', tenant.orgId);

  if (error) return { error: error.message };
  return { success: true };
}
