# Phase 2: Properties & Permission Resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the platform from a flat single-site into orgs with properties, permission-based access control, and structured config — replacing `site_config` and all legacy `users.role` RLS policies.

**Architecture:** Single atomic SQL migration (`009_properties_and_permissions.sql`) with 18 execution steps, plus targeted frontend changes to the config server, admin actions, and TypeScript types. A BEFORE INSERT trigger auto-populates `org_id`/`property_id` so existing frontend code continues working.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, Next.js, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-phase2-properties-permissions-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/009_properties_and_permissions.sql` | All schema changes, data migration, permission functions, RLS policies, triggers, indexes |
| Create | `src/lib/permissions/resolve.ts` | TypeScript permission resolution utility (UI-layer mirror of DB functions) |
| Create | `src/lib/permissions/__tests__/resolve.test.ts` | Tests for permission resolution |
| Create | `src/lib/__tests__/phase2-types.test.ts` | Type-level tests for new/updated interfaces |
| Modify | `src/lib/types.ts` | Add Property, PropertyMembership; update Item, ItemUpdate, Photo, etc. with org_id/property_id; update Org with config columns; remove SiteConfigRow; update Database interface |
| Modify | `src/lib/config/server.ts` | Read from orgs+properties instead of site_config (use service role client) |
| Modify | `src/lib/config/types.ts` | Remove CONFIG_KEY_MAP; add property/org → SiteConfig mapping |
| Modify | `src/app/admin/settings/actions.ts` | Write to orgs/properties instead of site_config |
| Modify | `src/app/admin/landing/actions.ts` | Write landing_page to properties instead of site_config |
| Modify | `src/app/setup/actions.ts` | Write to orgs/properties during initial setup |

---

## Task 1: Migration — Schema creation (steps 1-4)

**Files:**
- Create: `supabase/migrations/009_properties_and_permissions.sql`

Creates the new tables and org config columns. This is steps 1-4 of the spec's execution order.

- [ ] **Step 1: Create migration file with org config columns and properties table**

Create `supabase/migrations/009_properties_and_permissions.sql` with:
- Header comment referencing the spec
- Step 1: `ALTER TABLE orgs ADD COLUMN` for logo_url, favicon_url, theme, tagline, setup_complete, default_property_id
- Step 2: `CREATE TABLE properties` — copy SQL exactly from spec Section 2 (lines 99-142)
- Step 3: `CREATE TABLE property_memberships` — copy SQL exactly from spec Section 3 (lines 175-193). Note: no table-level UNIQUE, uses partial unique index later
- Step 4: Wire FKs — `orgs_default_property_fk` and `org_memberships_default_property_fk` from spec Section 2 (lines 161-168)

All SQL is fully specified in the spec. Copy it verbatim.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/009_properties_and_permissions.sql
git commit -m "feat(migration): add properties, property_memberships, org config columns"
```

---

## Task 2: Migration — Add org_id/property_id columns to all content tables (steps 5-7)

**Files:**
- Modify: `supabase/migrations/009_properties_and_permissions.sql`

Appends nullable org_id/property_id columns to every content table. These are populated in Task 3.

- [ ] **Step 1: Append column additions for all 12 tables**

For each table, follow the pattern from spec Section 5 (lines 347-349):

**Property-scoped (org_id + property_id):**
```sql
ALTER TABLE items ADD COLUMN org_id uuid;
ALTER TABLE items ADD COLUMN property_id uuid;
```
Repeat for: `item_updates`, `photos`, `location_history`

**Org-scoped (org_id only):**
```sql
ALTER TABLE item_types ADD COLUMN org_id uuid;
```
Repeat for: `custom_fields`, `update_types`, `species`, `item_species`, `update_species`, `invites`, `redirects`

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/009_properties_and_permissions.sql
git commit -m "feat(migration): add org_id/property_id columns to all content tables"
```

---

## Task 3: Migration — Data migration (steps 8-11)

**Files:**
- Modify: `supabase/migrations/009_properties_and_permissions.sql`

Creates the default property, populates org config, fills org_id/property_id on all rows, then adds NOT NULL constraints and FKs.

- [ ] **Step 1: Append data migration SQL**

Copy SQL exactly from spec Section 6:
- Step 8: INSERT INTO properties from site_config (lines 380-400)
- Step 9: UPDATE orgs from site_config (lines 405-413)
- Step 10: UPDATE all 12 tables with org_id/property_id (lines 419-433)
- Step 11: ALTER COLUMN SET NOT NULL + ADD CONSTRAINT for FKs on all tables. Follow the pattern from spec lines 357-364, repeated for every table. Property-scoped tables get both org_fk and property_fk. Org-scoped tables get org_fk only.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/009_properties_and_permissions.sql
git commit -m "feat(migration): data migration - default property, org config, content scoping"
```

---

## Task 4: Migration — Permission resolution functions and auto-populate trigger (steps 12-13)

**Files:**
- Modify: `supabase/migrations/009_properties_and_permissions.sql`

- [ ] **Step 1: Append auto_populate_org_property trigger function and triggers**

Copy from spec Section 11 (lines 790-824):
- `auto_populate_org_property()` function
- CREATE TRIGGER for all 12 content tables (property-scoped with `'property_scoped'` arg, org-scoped with `'org_scoped'` arg)

- [ ] **Step 2: Append permission resolution functions**

Copy from spec Section 4:
- `resolve_property_role_id()` (lines 222-236)
- `check_permission()` (lines 243-283)
- `user_accessible_property_ids()` (lines 290-314)

All are SECURITY DEFINER STABLE. Copy verbatim from spec.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_properties_and_permissions.sql
git commit -m "feat(migration): add permission functions and auto-populate trigger"
```

---

## Task 5: Migration — RLS rewrite (steps 14-15)

**Files:**
- Modify: `supabase/migrations/009_properties_and_permissions.sql`

Drops all legacy write policies and creates permission-based replacements.

- [ ] **Step 1: Append DROP POLICY statements**

Drop every policy listed in spec Section 7 (lines 576-594). For each table, drop INSERT, UPDATE, DELETE policies. Also drop all existing SELECT policies that will be recreated (the public read ones).

Use `DROP POLICY IF EXISTS` for safety. Full list from spec:
- items: "Public can view items", "Authenticated users can insert items", "Authenticated users can update items", "Admins can delete items"
- item_updates: same pattern with "item updates"
- photos: "Public can view photos", "Authenticated users can insert photos", "Authenticated users can update photos", "Admins can delete photos"
- site_config: all policies (table about to be dropped)
- item_types: "Public can view item types", "Admins can insert/update/delete item types"
- custom_fields: "Public can view custom fields", "Admins can insert/update/delete custom fields"
- update_types: "Public can view update types", "Admins can insert/update/delete update types"
- invites: "Admins can view/create/update/delete invites" (keep "Users can view their own claimed invite")
- redirects: "Public can view redirects", "Admins can insert/update/delete redirects"
- location_history: "Public can view location history", "Authenticated users can insert location history"
- species: "Public can view species", "Authenticated users can insert/update/delete species"
- item_species: "Public can view item species", "Authenticated users can insert/delete item species"
- update_species: "Public can view update species", "Authenticated users can insert/delete update species"

- [ ] **Step 2: Append new RLS policies**

Enable RLS on new tables and create all policies from spec Section 7:

**properties** (lines 539-550): org_member_read, admin_manage, platform_admin
**property_memberships** (lines 553-563): read, admin_manage, platform_admin

**items** (lines 450-469): public_read, insert, update (with edit_any note), delete
**item_updates**: same pattern with category 'updates'
**photos** (lines 476-491): public_read, insert (upload), update (upload), delete (delete_any)
**location_history** (lines 497-505): public_read, insert (items/edit_any)

**item_types** (lines 512-529): public_read, insert, update, delete (org_admin scoped)
Same pattern for: custom_fields, update_types, species, item_species, update_species

**invites**: public_read for own claimed invite (kept), admin CRUD scoped to org
**redirects**: public_read, admin CRUD scoped to org

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_properties_and_permissions.sql
git commit -m "feat(migration): full RLS rewrite with permission-based policies"
```

---

## Task 6: Migration — Drop site_config, triggers, indexes (steps 16-18)

**Files:**
- Modify: `supabase/migrations/009_properties_and_permissions.sql`

- [ ] **Step 1: Append site_config drop**

```sql
DROP TABLE site_config;
```

- [ ] **Step 2: Append updated_at triggers**

From spec Section 9 (lines 612-619):
```sql
CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER property_memberships_updated_at
  BEFORE UPDATE ON property_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 3: Append all indexes**

Copy all indexes from spec Section 9 (lines 624-659). This includes:
- properties: idx_properties_org, idx_properties_publicly_listed
- property_memberships: idx_property_memberships_user, idx_property_memberships_property, idx_property_memberships_property_user (partial unique)
- Content table indexes: idx_items_org, idx_items_property, idx_items_org_property, and similar for item_updates, photos, location_history
- Org-scoped indexes: idx_item_types_org, idx_custom_fields_org, idx_update_types_org, idx_species_org, idx_item_species_org, idx_update_species_org, idx_invites_org, idx_redirects_org

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/009_properties_and_permissions.sql
git commit -m "feat(migration): drop site_config, add triggers and indexes"
```

---

## Task 7: TypeScript types — Write failing tests

**Files:**
- Create: `src/lib/__tests__/phase2-types.test.ts`

- [ ] **Step 1: Write type tests**

Create `src/lib/__tests__/phase2-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  Property,
  PropertyMembership,
  Item,
  ItemUpdate,
  Photo,
  LocationHistory,
  ItemType,
  CustomField,
  UpdateType,
  Species,
  Invite,
  Org,
  Database,
} from '../types';

describe('Phase 2 types', () => {
  describe('Property', () => {
    it('has required fields', () => {
      const prop: Property = {
        id: 'test',
        org_id: 'org-1',
        name: 'Test Property',
        slug: 'test-property',
        description: null,
        is_active: true,
        map_default_lat: 47.6,
        map_default_lng: -122.5,
        map_default_zoom: 14,
        map_style: null,
        map_bounds: null,
        custom_map: null,
        landing_headline: null,
        landing_body: null,
        landing_image_url: null,
        landing_page: null,
        primary_color: null,
        logo_url: null,
        about_content: null,
        footer_text: null,
        footer_links: null,
        custom_nav_items: null,
        is_publicly_listed: false,
        created_by: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      };
      expect(prop.org_id).toBe('org-1');
    });
  });

  describe('PropertyMembership', () => {
    it('has required fields', () => {
      const pm: PropertyMembership = {
        id: 'test',
        org_id: 'org-1',
        property_id: 'prop-1',
        user_id: 'user-1',
        role_id: 'role-1',
        grant_type: 'explicit',
        granted_by: null,
        note: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      expect(pm.grant_type).toBe('explicit');
    });

    it('rejects invalid grant_type at compile time', () => {
      // @ts-expect-error - 'permanent' is not a valid grant_type
      const _bad: PropertyMembership['grant_type'] = 'permanent';
    });
  });

  describe('Updated content types have org_id/property_id', () => {
    it('Item has org_id and property_id', () => {
      const item = {} as Item;
      const _orgId: string = item.org_id;
      const _propId: string = item.property_id;
      expect(true).toBe(true);
    });

    it('ItemUpdate has org_id and property_id', () => {
      const update = {} as ItemUpdate;
      const _orgId: string = update.org_id;
      const _propId: string = update.property_id;
      expect(true).toBe(true);
    });

    it('Photo has org_id and property_id', () => {
      const photo = {} as Photo;
      const _orgId: string = photo.org_id;
      const _propId: string = photo.property_id;
      expect(true).toBe(true);
    });

    it('LocationHistory has org_id and property_id', () => {
      const loc = {} as LocationHistory;
      const _orgId: string = loc.org_id;
      const _propId: string = loc.property_id;
      expect(true).toBe(true);
    });

    it('ItemType has org_id', () => {
      const type = {} as ItemType;
      const _orgId: string = type.org_id;
      expect(true).toBe(true);
    });

    it('Species has org_id', () => {
      const sp = {} as Species;
      const _orgId: string = sp.org_id;
      expect(true).toBe(true);
    });

    it('Invite has org_id', () => {
      const inv = {} as Invite;
      const _orgId: string = inv.org_id;
      expect(true).toBe(true);
    });
  });

  describe('Org has config columns', () => {
    it('has logo_url, favicon_url, theme, tagline, setup_complete', () => {
      const org = {} as Org;
      const _logo: string | null = org.logo_url;
      const _favicon: string | null = org.favicon_url;
      const _theme: unknown = org.theme;
      const _tagline: string | null = org.tagline;
      const _setup: boolean = org.setup_complete;
      const _defaultProp: string | null = org.default_property_id;
      expect(true).toBe(true);
    });
  });

  describe('Database interface', () => {
    it('includes properties table', () => {
      type PropertiesRow = Database['public']['Tables']['properties']['Row'];
      const _check: PropertiesRow extends Property ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes property_memberships table', () => {
      type PmRow = Database['public']['Tables']['property_memberships']['Row'];
      const _check: PmRow extends PropertyMembership ? true : never = true;
      expect(_check).toBe(true);
    });

    it('does not include site_config', () => {
      // @ts-expect-error - site_config should be removed from Database
      type _Dead = Database['public']['Tables']['site_config'];
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/__tests__/phase2-types.test.ts`

Expected: FAIL — Property, PropertyMembership types don't exist; org_id/property_id missing from Item, etc.

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/phase2-types.test.ts
git commit -m "test: add failing Phase 2 type tests"
```

---

## Task 8: TypeScript types — Make tests pass

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add Property and PropertyMembership interfaces**

After the `OrgMembership` interface (around line 153), add the `Property` and `PropertyMembership` interfaces from spec Section 10 (lines 668-710).

- [ ] **Step 2: Add org_id/property_id to existing types**

Update these interfaces in `src/lib/types.ts`:

```typescript
// Item: add after created_by field
  org_id: string;
  property_id: string;

// ItemUpdate: add after created_by field
  org_id: string;
  property_id: string;

// Photo: add after created_at field
  org_id: string;
  property_id: string;

// LocationHistory: add after created_at field
  org_id: string;
  property_id: string;

// ItemType: add after created_at field
  org_id: string;

// CustomField: add after sort_order field
  org_id: string;

// UpdateType: add after sort_order field
  org_id: string;

// Species: add after updated_at field
  org_id: string;

// Invite: add after created_at field
  org_id: string;

// ItemSpecies: add org_id
  org_id: string;

// UpdateSpecies: add org_id
  org_id: string;
```

- [ ] **Step 3: Update Org interface with config columns**

Add to the `Org` interface (after primary_custom_domain_id):

```typescript
  logo_url: string | null;
  favicon_url: string | null;
  theme: unknown | null;
  tagline: string | null;
  setup_complete: boolean;
  default_property_id: string | null;
```

- [ ] **Step 4: Remove SiteConfigRow and site_config from Database**

- Delete the `SiteConfigRow` interface
- Remove the `site_config` entry from `Database.public.Tables`
- Add `properties` and `property_memberships` entries to `Database.public.Tables`:

```typescript
      properties: {
        Row: Property;
        Insert: Omit<Property, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Property, 'id' | 'created_at'>>;
        Relationships: [];
      };
      property_memberships: {
        Row: PropertyMembership;
        Insert: Omit<PropertyMembership, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PropertyMembership, 'id' | 'created_at'>>;
        Relationships: [];
      };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/__tests__/phase2-types.test.ts`

Expected: PASS

- [ ] **Step 6: Run all tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

Expected: Phase 1 multi-tenant-types tests still pass. Phase 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Phase 2 types (Property, PropertyMembership, org_id/property_id on content types)"
```

---

## Task 9: Permission resolution utility — TDD

**Files:**
- Create: `src/lib/permissions/resolve.ts`
- Create: `src/lib/permissions/__tests__/resolve.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/permissions/__tests__/resolve.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { hasPermission, type ResolvedAccess } from '../resolve';
import type { Role, RolePermissions } from '../../types';

// Helper to create a minimal Role for testing
function makeRole(overrides: Partial<RolePermissions> = {}): Role {
  const defaultPerms: RolePermissions = {
    org: { manage_settings: false, manage_members: false, manage_billing: false, manage_roles: false, view_audit_log: false },
    properties: { create: false, manage_all: false, view_all: true },
    items: { view: true, create: false, edit_any: false, edit_assigned: false, delete: false },
    updates: { view: true, create: false, edit_own: false, edit_any: false, delete: false, approve_public_submissions: false },
    tasks: { view_assigned: false, view_all: false, create: false, assign: false, complete: false },
    attachments: { upload: false, delete_own: false, delete_any: false },
    reports: { view: false, export: false },
    modules: { tasks: false, volunteers: false, public_forms: false, qr_codes: false, reports: false },
  };
  return {
    id: 'role-1', org_id: 'org-1', name: 'Test', description: null,
    base_role: 'viewer', color: null, icon: null,
    permissions: { ...defaultPerms, ...overrides },
    is_default_new_member_role: false, is_public_role: false, is_system_role: false,
    sort_order: 0, created_at: '', updated_at: '',
  };
}

describe('hasPermission', () => {
  it('returns true for platform_admin regardless of permissions', () => {
    const access: ResolvedAccess = {
      role: makeRole(),
      permissions: makeRole().permissions,
      source: 'platform_admin',
    };
    expect(hasPermission(access, 'items', 'delete')).toBe(true);
  });

  it('returns true for org_admin regardless of permissions', () => {
    const access: ResolvedAccess = {
      role: makeRole(),
      permissions: makeRole().permissions,
      source: 'org_admin',
    };
    expect(hasPermission(access, 'items', 'delete')).toBe(true);
  });

  it('checks permission JSONB for org_membership source', () => {
    const role = makeRole({ items: { view: true, create: true, edit_any: false, edit_assigned: false, delete: false } });
    const access: ResolvedAccess = {
      role,
      permissions: role.permissions,
      source: 'org_membership',
    };
    expect(hasPermission(access, 'items', 'create')).toBe(true);
    expect(hasPermission(access, 'items', 'delete')).toBe(false);
  });

  it('returns false for unknown category/action', () => {
    const role = makeRole();
    const access: ResolvedAccess = {
      role,
      permissions: role.permissions,
      source: 'org_membership',
    };
    expect(hasPermission(access, 'nonexistent' as any, 'anything')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/permissions/__tests__/resolve.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement resolve.ts**

Create `src/lib/permissions/resolve.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Role, RolePermissions } from '../types';

export interface ResolvedAccess {
  role: Role;
  permissions: RolePermissions;
  source: 'platform_admin' | 'org_admin' | 'property_membership' | 'org_membership';
}

/**
 * Check if a resolved access grant permits a specific action.
 * Platform admins and org admins bypass all permission checks.
 */
export function hasPermission(
  access: ResolvedAccess,
  category: keyof RolePermissions,
  action: string
): boolean {
  if (access.source === 'platform_admin' || access.source === 'org_admin') {
    return true;
  }
  const categoryPerms = access.permissions[category];
  if (!categoryPerms || typeof categoryPerms !== 'object') return false;
  return (categoryPerms as Record<string, boolean>)[action] ?? false;
}

/**
 * Resolve the effective access for a user on a property.
 * Mirrors the PostgreSQL permission resolution hierarchy for UI use.
 *
 * Resolution order:
 * 1. Platform admin → full access
 * 2. Org admin → full access within org
 * 3. Property membership → explicit override
 * 4. Org membership → inherited role
 * 5. No access → null
 *
 * NOTE: For org_admins, the returned role is the org_admin role, not any
 * property_membership override. The org_admin bypass is intentional —
 * org_admins always have full access regardless of property_memberships.
 */
export async function resolveUserAccess(
  supabase: SupabaseClient,
  userId: string,
  propertyId: string
): Promise<ResolvedAccess | null> {
  // 1. Check platform admin
  const { data: user } = await supabase
    .from('users')
    .select('is_platform_admin')
    .eq('id', userId)
    .single();

  if (user?.is_platform_admin) {
    // Return a synthetic admin role — all permissions true
    const adminRole = await getOrgAdminRole(supabase, propertyId);
    if (adminRole) {
      return { role: adminRole, permissions: adminRole.permissions, source: 'platform_admin' };
    }
  }

  // Get property's org_id
  const { data: property } = await supabase
    .from('properties')
    .select('org_id')
    .eq('id', propertyId)
    .single();

  if (!property) return null;

  // 2. Check org_admin
  const { data: orgMembership } = await supabase
    .from('org_memberships')
    .select('id, role_id, roles(id, name, description, base_role, color, icon, permissions, is_default_new_member_role, is_public_role, is_system_role, sort_order, org_id, created_at, updated_at)')
    .eq('user_id', userId)
    .eq('org_id', property.org_id)
    .eq('status', 'active')
    .single();

  if (!orgMembership) return null;

  const orgRole = (orgMembership as any).roles as Role;
  if (orgRole?.base_role === 'org_admin') {
    return { role: orgRole, permissions: orgRole.permissions, source: 'org_admin' };
  }

  // 3. Check property membership override
  const { data: propMembership } = await supabase
    .from('property_memberships')
    .select('role_id, roles(id, name, description, base_role, color, icon, permissions, is_default_new_member_role, is_public_role, is_system_role, sort_order, org_id, created_at, updated_at)')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (propMembership) {
    const propRole = (propMembership as any).roles as Role;
    return { role: propRole, permissions: propRole.permissions, source: 'property_membership' };
  }

  // 4. Fall back to org membership role
  return { role: orgRole, permissions: orgRole.permissions, source: 'org_membership' };
}

/** Helper to get the org_admin role for a property's org */
async function getOrgAdminRole(supabase: SupabaseClient, propertyId: string): Promise<Role | null> {
  const { data } = await supabase
    .from('properties')
    .select('org_id')
    .eq('id', propertyId)
    .single();

  if (!data) return null;

  const { data: role } = await supabase
    .from('roles')
    .select('*')
    .eq('org_id', data.org_id)
    .eq('base_role', 'org_admin')
    .single();

  return role as Role | null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/permissions/__tests__/resolve.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions/resolve.ts src/lib/permissions/__tests__/resolve.test.ts
git commit -m "feat: add TypeScript permission resolution utility with tests"
```

---

## Task 10: Update config server to read from orgs + properties

**Files:**
- Modify: `src/lib/config/server.ts`
- Modify: `src/lib/config/types.ts`

- [ ] **Step 1: Update config types**

In `src/lib/config/types.ts`:
- Remove `CONFIG_KEY_MAP` (no longer needed — we're not reading from site_config)
- Keep `SiteConfig` interface unchanged
- Add a mapping function:

```typescript
import type { LandingPageConfig } from './landing-types';

export interface SiteConfig {
  // ... unchanged
}

// Removed: CONFIG_KEY_MAP

/**
 * Build a SiteConfig from org + property structured columns.
 * This replaces the old CONFIG_KEY_MAP approach that read from site_config.
 */
export function buildSiteConfig(
  org: {
    name: string;
    tagline: string | null;
    logo_url: string | null;
    favicon_url: string | null;
    theme: { preset: string; overrides?: Record<string, string> } | null;
    setup_complete: boolean;
  },
  property: {
    description: string | null;
    map_default_lat: number | null;
    map_default_lng: number | null;
    map_default_zoom: number | null;
    map_style: string | null;
    custom_map: unknown | null;
    about_content: string | null;
    footer_text: string | null;
    footer_links: unknown | null;
    custom_nav_items: unknown | null;
    landing_page: unknown | null;
    logo_url: string | null;
  }
): SiteConfig {
  return {
    siteName: org.name,
    tagline: org.tagline ?? '',
    locationName: property.description ?? '',
    mapCenter: {
      lat: property.map_default_lat ?? 0,
      lng: property.map_default_lng ?? 0,
      zoom: property.map_default_zoom ?? 2,
    },
    theme: org.theme ?? { preset: 'forest' },
    aboutContent: property.about_content ?? '',
    logoUrl: property.logo_url ?? org.logo_url,
    faviconUrl: org.favicon_url,
    footerText: property.footer_text ?? '',
    footerLinks: (property.footer_links as { label: string; url: string }[]) ?? [],
    customMap: property.custom_map as SiteConfig['customMap'],
    mapStyle: property.map_style,
    customNavItems: (property.custom_nav_items as { label: string; href: string }[]) ?? [],
    setupComplete: org.setup_complete,
    landingPage: property.landing_page as LandingPageConfig | null,
  };
}
```

- [ ] **Step 2: Update config server**

Replace `src/lib/config/server.ts`:

```typescript
import { unstable_cache, revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_CONFIG } from './defaults';
import { buildSiteConfig, type SiteConfig } from './types';
import { createDefaultLandingPage } from './landing-defaults';

const CACHE_TAG = 'site-config';

/**
 * Creates a Supabase client with service role for config reads.
 * Uses service role because orgs/properties have RLS requiring authentication,
 * but config needs to be readable for public pages (landing, about, map).
 */
function createConfigClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Fetches site config by reading from orgs + properties.
 * Cached for 60 seconds, busted immediately via revalidateTag on admin save.
 */
export const getConfig = unstable_cache(
  async (): Promise<SiteConfig> => {
    const supabase = createConfigClient();

    // Get the first org and its default property
    const { data: org, error: orgError } = await supabase
      .from('orgs')
      .select('name, tagline, logo_url, favicon_url, theme, setup_complete, default_property_id')
      .limit(1)
      .single();

    if (orgError || !org) {
      console.error('Failed to fetch org config:', orgError?.message);
      return { ...DEFAULT_CONFIG };
    }

    const propertyId = org.default_property_id;
    if (!propertyId) {
      console.error('No default property configured');
      return { ...DEFAULT_CONFIG };
    }

    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('description, map_default_lat, map_default_lng, map_default_zoom, map_style, custom_map, about_content, footer_text, footer_links, custom_nav_items, landing_page, logo_url')
      .eq('id', propertyId)
      .single();

    if (propError || !property) {
      console.error('Failed to fetch property config:', propError?.message);
      return { ...DEFAULT_CONFIG };
    }

    const config = buildSiteConfig(org, property);

    // Backfill landing page for existing sites
    if (config.landingPage === null && config.setupComplete) {
      config.landingPage = createDefaultLandingPage(
        config.siteName,
        config.tagline,
        config.locationName,
        false
      );
    }

    return config;
  },
  [CACHE_TAG],
  { revalidate: 60, tags: [CACHE_TAG] }
);

/**
 * Call this after saving config in admin to immediately bust the cache.
 */
export function invalidateConfig() {
  revalidateTag(CACHE_TAG);
}
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

Expected: All existing tests pass (config tests may need adjustment if they mock site_config).

- [ ] **Step 4: Commit**

```bash
git add src/lib/config/server.ts src/lib/config/types.ts
git commit -m "feat: update config server to read from orgs+properties instead of site_config"
```

---

## Task 11: Update admin server actions

**Files:**
- Modify: `src/app/admin/settings/actions.ts`
- Modify: `src/app/admin/landing/actions.ts`
- Modify: `src/app/setup/actions.ts`

These files currently write to `site_config`. They need to write to `orgs` and `properties` instead. The exact changes depend on the current code structure — the implementer should:

- [ ] **Step 1: Read and update admin settings actions**

Read `src/app/admin/settings/actions.ts`. Replace all `.from('site_config').upsert(...)` calls with writes to `orgs` (for org-level settings) and `properties` (for property-level settings). Use the org/property mapping tables from spec Sections 1-2.

Key pattern change:
```typescript
// Before:
await supabase.from('site_config').upsert({ key: 'site_name', value: name });

// After:
await supabase.from('orgs').update({ name }).eq('id', orgId);
```

- [ ] **Step 2: Read and update landing page actions**

Read `src/app/admin/landing/actions.ts`. Replace `.from('site_config').upsert({ key: 'landing_page', ...})` with `.from('properties').update({ landing_page: ... }).eq('id', propertyId)`.

- [ ] **Step 3: Read and update setup actions**

Read `src/app/setup/actions.ts`. This creates the initial config during first-run setup. Update it to write to `orgs`/`properties` instead of `site_config`. The setup flow should update the existing org (created by migration) and default property rather than inserting site_config rows.

- [ ] **Step 4: Run tests and verify**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/settings/actions.ts src/app/admin/landing/actions.ts src/app/setup/actions.ts
git commit -m "feat: update admin actions to write to orgs/properties instead of site_config"
```

---

## Task 12: Final verification

- [ ] **Step 1: Review the complete migration file**

Read `supabase/migrations/009_properties_and_permissions.sql` end-to-end. Verify:
- All 18 execution steps are present in order
- No syntax errors
- Every DROP POLICY has a matching CREATE POLICY
- All permission function SQL matches the spec

- [ ] **Step 2: Run all tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

Expected: All tests pass.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit`

Expected: No new type errors.

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: address issues found during final Phase 2 review"
```

---

## Post-Implementation Notes

### How to apply the migration

Same as Phase 1: `supabase db push` or paste into SQL editor. Deploy migration and code changes together since the config server change must happen simultaneously with dropping `site_config`.

### How to verify after applying

1. Check properties exist: `SELECT * FROM properties;`
2. Check org config populated: `SELECT name, tagline, logo_url, setup_complete FROM orgs;`
3. Check items have org/property: `SELECT id, name, org_id, property_id FROM items LIMIT 5;`
4. Test permission function: `SELECT check_permission('<user-uuid>', '<property-uuid>', 'items', 'create');`
5. Test auto-populate trigger: INSERT a row without org_id — verify it gets auto-populated
6. Verify public map still loads (config reads from orgs+properties now)
7. Verify admin settings page can save changes

### What comes next

Phase 3: Temporary access grants, anonymous access tokens, property_access_config. This will replace the public SELECT policies with configurable per-property anonymous access, drop `users.role` and the `profiles` view, and add time-limited access grants.
