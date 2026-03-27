'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { createDefaultLandingPage } from '@/lib/config/landing-defaults';
import { buildOrgContextBlock } from '@/lib/ai-context/context-provider';
import type { AiContextSummary } from '@/lib/ai-context/types';

export interface EntityTypeSuggestion {
  name: string;
  icon: string;
  color: string;
  link_to: string[];
  fields: Array<{ name: string; field_type: string; options?: string[]; required?: boolean }>;
}

export interface OnboardConfig {
  orgName: string;
  orgSlug: string;
  tagline: string;
  locationName: string;
  lat: number;
  lng: number;
  zoom: number;
  themePreset: string;
  overlayConfig?: unknown;
  itemTypes: Array<{ name: string; icon: string; color: string }>;
  aboutContent: string;
  entityTypes?: EntityTypeSuggestion[];
}

/**
 * Returns the JSONB permissions object for a given base role.
 * Structures match the seeded role permissions in 008_multi_tenant_foundation.sql.
 */
function getDefaultPermissions(baseRole: string): Record<string, unknown> {
  switch (baseRole) {
    case 'org_admin':
      return {
        org: { manage_settings: true, manage_members: true, manage_billing: true, manage_roles: true, view_audit_log: true },
        properties: { create: true, manage_all: true, view_all: true },
        items: { view: true, create: true, edit_any: true, edit_assigned: true, delete: true },
        updates: { view: true, create: true, edit_own: true, edit_any: true, delete: true, approve_public_submissions: true },
        tasks: { view_assigned: true, view_all: true, create: true, assign: true, complete: true },
        attachments: { upload: true, delete_own: true, delete_any: true },
        reports: { view: true, export: true },
        modules: { tasks: true, volunteers: true, public_forms: true, qr_codes: true, reports: true },
        ai_context: { view: true, download: true, upload: true, manage: true },
      };
    case 'org_staff':
      return {
        org: { manage_settings: false, manage_members: false, manage_billing: false, manage_roles: false, view_audit_log: false },
        properties: { create: false, manage_all: false, view_all: true },
        items: { view: true, create: true, edit_any: true, edit_assigned: true, delete: false },
        updates: { view: true, create: true, edit_own: true, edit_any: false, delete: false, approve_public_submissions: false },
        tasks: { view_assigned: true, view_all: true, create: true, assign: true, complete: true },
        attachments: { upload: true, delete_own: true, delete_any: false },
        reports: { view: true, export: false },
        modules: { tasks: true, volunteers: false, public_forms: false, qr_codes: false, reports: false },
        ai_context: { view: true, download: true, upload: true, manage: false },
      };
    case 'contributor':
      return {
        org: { manage_settings: false, manage_members: false, manage_billing: false, manage_roles: false, view_audit_log: false },
        properties: { create: false, manage_all: false, view_all: true },
        items: { view: true, create: false, edit_any: false, edit_assigned: true, delete: false },
        updates: { view: true, create: true, edit_own: true, edit_any: false, delete: false, approve_public_submissions: false },
        tasks: { view_assigned: true, view_all: false, create: false, assign: false, complete: true },
        attachments: { upload: true, delete_own: true, delete_any: false },
        reports: { view: false, export: false },
        modules: { tasks: true, volunteers: false, public_forms: false, qr_codes: false, reports: false },
        ai_context: { view: true, download: true, upload: false, manage: false },
      };
    case 'viewer':
    default:
      return {
        org: { manage_settings: false, manage_members: false, manage_billing: false, manage_roles: false, view_audit_log: false },
        properties: { create: false, manage_all: false, view_all: true },
        items: { view: true, create: false, edit_any: false, edit_assigned: false, delete: false },
        updates: { view: true, create: false, edit_own: false, edit_any: false, delete: false, approve_public_submissions: false },
        tasks: { view_assigned: true, view_all: false, create: false, assign: false, complete: false },
        attachments: { upload: false, delete_own: false, delete_any: false },
        reports: { view: false, export: false },
        modules: { tasks: false, volunteers: false, public_forms: false, qr_codes: false, reports: false },
        ai_context: { view: false, download: false, upload: false, manage: false },
      };
  }
}

/**
 * Creates a complete org with all associated data for a new tenant.
 *
 * Uses createServiceClient() for all writes to bypass RLS, since the user
 * does not yet have an org membership at the time of creation.
 *
 * Returns { success: true, orgSlug: string } or { error: string }.
 */
export async function onboardCreateOrg(
  config: OnboardConfig
): Promise<{ success: true; orgSlug: string } | { error: string }> {
  // Step 1: Auth check — get current user
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated. Please sign in and try again.' };
  }

  const userId = user.id;

  // All writes use the service client to bypass RLS
  const service = createServiceClient();

  // Step 2: Create org
  const { data: org, error: orgError } = await service
    .from('orgs')
    .insert({
      name: config.orgName,
      slug: config.orgSlug,
      tagline: config.tagline,
      theme: { preset: config.themePreset },
      setup_complete: true,
    })
    .select('id, slug')
    .single();

  if (orgError) {
    if (orgError.code === '23505') {
      return { error: `The URL slug "${config.orgSlug}" is already taken. Please choose a different one.` };
    }
    return { error: `Failed to create organization: ${orgError.message}` };
  }

  const orgId = org.id;

  // Step 3: Create default property
  const propertyName = config.locationName || config.orgName;
  const { data: property, error: propertyError } = await service
    .from('properties')
    .insert({
      org_id: orgId,
      name: propertyName,
      slug: 'default',
      description: config.locationName,
      map_default_lat: config.lat,
      map_default_lng: config.lng,
      map_default_zoom: config.zoom,
      custom_map: config.overlayConfig ?? null,
      about_content: config.aboutContent,
      is_active: true,
      created_by: userId,
    })
    .select('id')
    .single();

  if (propertyError) {
    return { error: `Failed to create property: ${propertyError.message}` };
  }

  const propertyId = property.id;

  // Step 4: Update org.default_property_id
  const { error: orgUpdateError } = await service
    .from('orgs')
    .update({ default_property_id: propertyId })
    .eq('id', orgId);

  if (orgUpdateError) {
    return { error: `Failed to set default property: ${orgUpdateError.message}` };
  }

  // Step 5: Seed 4 system roles
  const systemRoles = [
    {
      org_id: orgId,
      name: 'Admin',
      description: 'Full control within the org. Can manage members, config, and billing.',
      base_role: 'org_admin',
      permissions: getDefaultPermissions('org_admin'),
      is_default_new_member_role: false,
      is_system_role: true,
      sort_order: 0,
    },
    {
      org_id: orgId,
      name: 'Staff',
      description: 'Can create and edit all content. Cannot manage org settings.',
      base_role: 'org_staff',
      permissions: getDefaultPermissions('org_staff'),
      is_default_new_member_role: false,
      is_system_role: true,
      sort_order: 1,
    },
    {
      org_id: orgId,
      name: 'Contributor',
      description: 'Can create and edit content they are assigned to. Limited visibility.',
      base_role: 'contributor',
      permissions: getDefaultPermissions('contributor'),
      is_default_new_member_role: true,
      is_system_role: true,
      sort_order: 2,
    },
    {
      org_id: orgId,
      name: 'Viewer',
      description: 'Read-only access across org or property.',
      base_role: 'viewer',
      permissions: getDefaultPermissions('viewer'),
      is_default_new_member_role: false,
      is_system_role: true,
      sort_order: 3,
    },
  ];

  const { data: roles, error: rolesError } = await service
    .from('roles')
    .insert(systemRoles)
    .select('id, base_role');

  if (rolesError || !roles) {
    return { error: `Failed to create roles: ${rolesError?.message ?? 'unknown error'}` };
  }

  // Find the org_admin role ID for membership creation
  const adminRole = roles.find((r) => r.base_role === 'org_admin');
  if (!adminRole) {
    return { error: 'Failed to locate admin role after creation.' };
  }

  // Step 6: Create org_membership for current user as org_admin
  const { error: membershipError } = await service
    .from('org_memberships')
    .insert({
      org_id: orgId,
      user_id: userId,
      role_id: adminRole.id,
      status: 'active',
      is_primary_org: false,
      joined_at: new Date().toISOString(),
    });

  if (membershipError) {
    return { error: `Failed to create membership: ${membershipError.message}` };
  }

  // Step 7: Set users.last_active_org_id
  const { error: userUpdateError } = await service
    .from('users')
    .update({ last_active_org_id: orgId })
    .eq('id', userId);

  if (userUpdateError) {
    return { error: `Failed to update user org: ${userUpdateError.message}` };
  }

  // Step 8: Create item types from config
  if (config.itemTypes.length > 0) {
    const itemTypeRows = config.itemTypes.map((it, index) => ({
      org_id: orgId,
      name: it.name,
      icon: it.icon,
      color: it.color,
      sort_order: index,
    }));

    const { error: itemTypesError } = await service
      .from('item_types')
      .insert(itemTypeRows);

    if (itemTypesError) {
      return { error: `Failed to create item types: ${itemTypesError.message}` };
    }
  }

  // Step 8b: Create entity types from config
  if (config.entityTypes && config.entityTypes.length > 0) {
    for (let i = 0; i < config.entityTypes.length; i++) {
      const et = config.entityTypes[i];

      const { data: entityType, error: etError } = await service
        .from('entity_types')
        .insert({
          org_id: orgId,
          name: et.name,
          icon: et.icon,
          color: et.color,
          link_to: et.link_to,
          sort_order: i,
        })
        .select('id')
        .single();

      if (etError) {
        return { error: `Failed to create entity type "${et.name}": ${etError.message}` };
      }

      if (et.fields.length > 0) {
        const fieldRows = et.fields.map((f, fi) => ({
          entity_type_id: entityType.id,
          org_id: orgId,
          name: f.name,
          field_type: f.field_type,
          options: f.options && f.options.length > 0 ? f.options : null,
          required: f.required ?? false,
          sort_order: fi,
        }));

        const { error: fieldsError } = await service
          .from('entity_type_fields')
          .insert(fieldRows);

        if (fieldsError) {
          return { error: `Failed to create fields for "${et.name}": ${fieldsError.message}` };
        }
      }
    }
  }

  // Step 9: Generate default landing page
  const landingPage = createDefaultLandingPage(
    config.orgName,
    config.tagline,
    config.locationName,
    true
  );

  const { error: landingError } = await service
    .from('properties')
    .update({ landing_page: landingPage })
    .eq('id', propertyId);

  if (landingError) {
    return { error: `Failed to create landing page: ${landingError.message}` };
  }

  return { success: true, orgSlug: org.slug };
}

/**
 * Uses AI to suggest entity types based on the org's description and item types.
 */
export async function generateEntityTypeSuggestions(input: {
  orgName: string;
  itemTypes: string[];
  userPrompt: string;
  orgContext?: AiContextSummary | null;
}): Promise<{ suggestions: EntityTypeSuggestion[] } | { error: string }> {
  try {
    const { generateText } = await import('ai');
    const { anthropic } = await import('@ai-sdk/anthropic');

    const contextBlock = buildOrgContextBlock(input.orgContext ?? null);
    const systemPrompt = `You are helping set up a field mapping application for "${input.orgName}".
They track these item types: ${input.itemTypes.join(', ')}.
${contextBlock ? `\n${contextBlock}\n` : ''}
Based on the user's description, suggest 1-3 entity types that would be useful to track.
Entity types are rich, reusable records that can be linked to items and/or updates.

Each entity type automatically has: name, description, photo, and external_link fields.
You should suggest additional custom fields specific to each entity type.

Valid field types: text, number, dropdown, date, url
For dropdown fields, provide an "options" array.

Respond with ONLY a valid JSON array. Example:
[
  {
    "name": "Species",
    "icon": "🐦",
    "color": "#5D7F3A",
    "link_to": ["items", "updates"],
    "fields": [
      { "name": "Scientific Name", "field_type": "text", "required": false },
      { "name": "Conservation Status", "field_type": "dropdown", "options": ["LC", "NT", "VU", "EN", "CR"], "required": false }
    ]
  }
]`;

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages: [{ role: 'user', content: input.userPrompt }],
      maxOutputTokens: 1500,
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { error: 'Failed to parse AI response.' };
    }

    const parsed = JSON.parse(jsonMatch[0]) as EntityTypeSuggestion[];

    const validated = parsed
      .filter((et) => et.name && et.icon && Array.isArray(et.link_to) && Array.isArray(et.fields))
      .map((et) => ({
        name: et.name,
        icon: et.icon,
        color: et.color || '#5D7F3A',
        link_to: et.link_to.filter((t: string) => ['items', 'updates'].includes(t)),
        fields: (et.fields || []).map((f) => ({
          name: f.name,
          field_type: ['text', 'number', 'dropdown', 'date', 'url'].includes(f.field_type) ? f.field_type : 'text',
          options: f.options,
          required: f.required ?? false,
        })),
      }));

    return { suggestions: validated };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to generate suggestions.' };
  }
}
