# Phase 2: Properties & Permission Resolution — Design Spec

> **Date:** 2026-03-24
> **Phase:** 2 of 4 (IAM Northstar implementation)
> **Scope:** Properties, property memberships, permission resolution, content table migration, config split, RLS rewrite
> **Approach:** Big-bang migration + targeted frontend changes
> **Prerequisite:** Phase 1 (`feature/phase1-multi-tenant-foundation` / PR #23)

---

## Context

Phase 1 delivered the core multi-tenant data model: `users` (renamed from `profiles`), `orgs`,
`roles`, `org_memberships`, and SECURITY DEFINER helper functions for RLS.

Phase 2 transforms the platform from "one flat site" to "orgs with properties and permission-based
access control." Every content table gets `org_id`/`property_id` columns, the `site_config`
key-value table is replaced with structured columns on `orgs` and `properties`, and all write
policies are rewritten from `users.role` checks to `check_permission()` calls.

### Phase roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Users, orgs, org_memberships, roles | Complete (PR #23) |
| **2** | **Properties, property_memberships, permission resolution, content migration, config split, RLS rewrite** | **This spec** |
| 3 | Temporary access grants, anonymous access tokens, property_access_config, drop users.role | Planned |
| 4 | Custom domains, tenant resolution middleware, Caddy integration | Planned |

### Design decisions made

- **`property_access_config` deferred to Phase 3** — keeps Phase 2 focused on authenticated user path
- **Structured config columns** on `orgs`/`properties` (not key-value tables)
- **Full RLS rewrite for write policies** — replace all `users.role` checks with `check_permission()`
- **Keep public SELECT policies** (`USING (true)`) — replaced by `property_access_config` in Phase 3
- **Keep `users.role` and `profiles` view** — needed by `storage.objects` policies until Phase 3
- **Hybrid permission resolution** — PostgreSQL functions for enforcement, TypeScript for UI
- **Landing page as JSONB column** on `properties` (matches current `site_config` pattern)
- **Denormalize `org_id`/`property_id`** onto child tables for RLS performance
- **Drop `site_config` table** — update config server to read from orgs/properties directly

---

## Migration: `009_properties_and_permissions.sql`

### Execution order

```
 1. Add config columns to orgs
 2. Create properties table
 3. Create property_memberships table
 4. Wire org_memberships.default_property_id FK
 5. Add org_id to org-scoped tables (item_types, custom_fields, update_types, species)
 6. Add org_id + property_id to property-scoped tables (items, item_updates, photos, location_history)
 7. Add org_id to invites, redirects
 8. Create default property from site_config values
 9. Populate org config columns from site_config
10. Populate org_id/property_id on all content rows
11. Make org_id/property_id NOT NULL, add FKs
12. Create permission resolution functions
13. Drop all legacy write policies on content tables
14. Create new permission-based write policies
15. Drop site_config table
16. Add updated_at triggers for new tables
17. Add indexes
```

---

## Section 1: Org Config Columns

Add structured config columns to `orgs` (values migrated from `site_config`):

```sql
ALTER TABLE orgs ADD COLUMN logo_url text;
ALTER TABLE orgs ADD COLUMN favicon_url text;
ALTER TABLE orgs ADD COLUMN theme jsonb;              -- {preset, overrides}
ALTER TABLE orgs ADD COLUMN tagline text;
ALTER TABLE orgs ADD COLUMN setup_complete boolean NOT NULL DEFAULT false;
ALTER TABLE orgs ADD COLUMN default_property_id uuid; -- FK added after properties table created
```

### `site_config` → org column mapping

| site_config key | Destination |
|----------------|-------------|
| `site_name` | `orgs.name` (already migrated in Phase 1) |
| `tagline` | `orgs.tagline` |
| `logo_url` | `orgs.logo_url` |
| `favicon_url` | `orgs.favicon_url` |
| `theme` | `orgs.theme` |
| `setup_complete` | `orgs.setup_complete` |

---

## Section 2: `properties` Table

```sql
CREATE TABLE properties (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name              text NOT NULL,
  slug              text NOT NULL,
  description       text,
  is_active         boolean NOT NULL DEFAULT true,

  -- Map defaults
  map_default_lat   float8,
  map_default_lng   float8,
  map_default_zoom  int,
  map_style         text,              -- tile provider ID
  map_bounds        jsonb,             -- optional explicit bounds, independent of custom_map
  custom_map        jsonb,             -- overlay image config

  -- Landing page
  landing_headline  text,
  landing_body      text,
  landing_image_url text,
  landing_page      jsonb,             -- full LandingPageConfig (blocks, assets)

  -- Theming (overrides org if set)
  primary_color     text,
  logo_url          text,

  -- Content (migrated from site_config)
  about_content     text,              -- markdown about page
  footer_text       text,
  footer_links      jsonb,             -- array of {label, url}
  custom_nav_items  jsonb,             -- array of nav items

  -- Access
  is_publicly_listed boolean NOT NULL DEFAULT false,

  -- Metadata
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,

  UNIQUE (org_id, slug)
);
```

### `site_config` → property column mapping

| site_config key | Destination |
|----------------|-------------|
| `location_name` | `properties.description` |
| `map_center` | `properties.map_default_lat/lng/zoom` |
| `map_style` | `properties.map_style` |
| `custom_map` | `properties.custom_map` |
| `about_content` | `properties.about_content` |
| `footer_text` | `properties.footer_text` |
| `footer_links` | `properties.footer_links` |
| `custom_nav_items` | `properties.custom_nav_items` |
| `landing_page` | `properties.landing_page` |

### Wire FKs

```sql
-- orgs.default_property_id → properties
ALTER TABLE orgs ADD CONSTRAINT orgs_default_property_fk
  FOREIGN KEY (default_property_id) REFERENCES properties(id) ON DELETE SET NULL;

-- org_memberships.default_property_id → properties (column exists from Phase 1, FK missing)
ALTER TABLE org_memberships ADD CONSTRAINT org_memberships_default_property_fk
  FOREIGN KEY (default_property_id) REFERENCES properties(id) ON DELETE SET NULL;
```

---

## Section 3: `property_memberships` Table

```sql
CREATE TABLE property_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES roles(id),
                -- ON DELETE defaults to RESTRICT: roles cannot be deleted
                -- while property memberships reference them

  grant_type    text NOT NULL DEFAULT 'explicit'
                CHECK (grant_type IN ('explicit', 'temporary')),

  granted_by    uuid REFERENCES users(id),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

);
```

Note: No table-level `UNIQUE (property_id, user_id)` — uniqueness for non-null user_id
is enforced by the partial unique index in Section 9 (same pattern as Phase 1 `org_memberships`).

### How permission resolution works

```
Permission resolution order (most specific wins):
  1. is_platform_admin on users    → full access to everything
  2. org_admin base_role           → full access within org
  3. property_memberships row      → use this role for this property
  4. org_memberships role          → inherited from org-level role
  5. (Phase 3: temporary_access_grants)
  6. (Phase 3: anonymous_access_config)
  7. No match                      → 403
```

---

## Section 4: Permission Resolution Functions

All `SECURITY DEFINER` to bypass RLS and prevent recursion.

### `resolve_property_role_id()`

Returns the effective role_id for a user on a property:

```sql
CREATE OR REPLACE FUNCTION resolve_property_role_id(p_user_id uuid, p_property_id uuid)
RETURNS uuid AS $$
  SELECT COALESCE(
    -- Level 1: explicit property membership override
    (SELECT pm.role_id FROM public.property_memberships pm
     WHERE pm.user_id = p_user_id AND pm.property_id = p_property_id),
    -- Level 2: inherited from org membership
    (SELECT om.role_id FROM public.org_memberships om
     JOIN public.properties p ON p.org_id = om.org_id
     WHERE om.user_id = p_user_id AND p.id = p_property_id
       AND om.status = 'active'
       AND p.is_active = true AND p.deleted_at IS NULL)
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### `check_permission()`

The core enforcement function — called by all write RLS policies:

```sql
CREATE OR REPLACE FUNCTION check_permission(
  p_user_id uuid,
  p_property_id uuid,
  p_category text,    -- 'items', 'updates', 'tasks', 'attachments', etc.
  p_action text       -- 'view', 'create', 'edit_any', 'delete', etc.
)
RETURNS boolean AS $$
DECLARE
  v_role_id uuid;
  v_permissions jsonb;
BEGIN
  -- Level 0: platform admin bypasses everything
  IF (SELECT is_platform_admin FROM public.users WHERE id = p_user_id) THEN
    RETURN true;
  END IF;

  -- Level 1: org_admin bypasses property-level checks
  IF EXISTS (
    SELECT 1 FROM public.org_memberships om
    JOIN public.roles r ON r.id = om.role_id
    JOIN public.properties p ON p.org_id = om.org_id
    WHERE om.user_id = p_user_id AND p.id = p_property_id
      AND om.status = 'active' AND r.base_role = 'org_admin'
  ) THEN
    RETURN true;
  END IF;

  -- Levels 2-3: resolve effective role (property override or org inherited)
  v_role_id := resolve_property_role_id(p_user_id, p_property_id);

  IF v_role_id IS NULL THEN
    RETURN false;  -- no access at all
  END IF;

  -- Look up permission from role's JSONB
  SELECT permissions INTO v_permissions FROM public.roles WHERE id = v_role_id;

  RETURN COALESCE((v_permissions -> p_category ->> p_action)::boolean, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### `user_accessible_property_ids()`

For RLS SELECT policies — returns all property IDs a user can access:

```sql
CREATE OR REPLACE FUNCTION user_accessible_property_ids(p_user_id uuid)
RETURNS SETOF uuid AS $$
BEGIN
  -- Platform admins: all properties
  IF (SELECT is_platform_admin FROM public.users WHERE id = p_user_id) THEN
    RETURN QUERY SELECT id FROM public.properties WHERE deleted_at IS NULL;
    RETURN;
  END IF;

  -- Properties in orgs where user has active membership
  RETURN QUERY
  SELECT p.id FROM public.properties p
  JOIN public.org_memberships om ON om.org_id = p.org_id
  WHERE om.user_id = p_user_id AND om.status = 'active'
    AND p.deleted_at IS NULL

  UNION

  -- Properties with explicit property_membership
  SELECT pm.property_id FROM public.property_memberships pm
  JOIN public.properties p2 ON p2.id = pm.property_id
  WHERE pm.user_id = p_user_id AND p2.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

---

## Section 5: Content Table Migration

### Columns added

| Table | Add columns | Scope |
|-------|------------|-------|
| `items` | `org_id uuid NOT NULL`, `property_id uuid NOT NULL` | Property-scoped |
| `item_updates` | `org_id uuid NOT NULL`, `property_id uuid NOT NULL` | Property-scoped (denormalized) |
| `photos` | `org_id uuid NOT NULL`, `property_id uuid NOT NULL` | Property-scoped (denormalized) |
| `location_history` | `org_id uuid NOT NULL`, `property_id uuid NOT NULL` | Property-scoped (denormalized) |
| `item_types` | `org_id uuid NOT NULL` | Org-scoped |
| `custom_fields` | `org_id uuid NOT NULL` | Org-scoped (via item_types) |
| `update_types` | `org_id uuid NOT NULL` | Org-scoped |
| `species` | `org_id uuid NOT NULL` | Org-scoped |
| `item_species` | `org_id uuid NOT NULL` | Org-scoped (junction table) |
| `update_species` | `org_id uuid NOT NULL` | Org-scoped (junction table) |
| `invites` | `org_id uuid NOT NULL` | Org-scoped |
| `redirects` | `org_id uuid NOT NULL` | Org-scoped |

**Why denormalize `org_id`/`property_id` onto child tables (`item_updates`, `photos`, `location_history`)?**

RLS policies run on every row access. If `photos` only had `item_id`, every SELECT on photos
would need a JOIN to `items` to check `items.property_id` — expensive on every query.
Denormalizing avoids the join in RLS.

### Migration SQL pattern (per table)

```sql
-- 1. Add columns as nullable
ALTER TABLE items ADD COLUMN org_id uuid;
ALTER TABLE items ADD COLUMN property_id uuid;

-- 2. Populate from existing data (in step 10 of execution order)
UPDATE items SET
  org_id = (SELECT id FROM orgs LIMIT 1),
  property_id = (SELECT id FROM properties LIMIT 1);

-- 3. Make NOT NULL (in step 11)
ALTER TABLE items ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE items ALTER COLUMN property_id SET NOT NULL;

-- 4. Add FKs
ALTER TABLE items ADD CONSTRAINT items_org_fk
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE;
ALTER TABLE items ADD CONSTRAINT items_property_fk
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;

-- 5. Add indexes
CREATE INDEX idx_items_org ON items (org_id);
CREATE INDEX idx_items_property ON items (property_id);
CREATE INDEX idx_items_org_property ON items (org_id, property_id);
```

Repeated for all tables listed above. Org-scoped tables get `org_id` only (no `property_id`).

---

## Section 6: Data Migration

### Step 1 — Create default property from site_config

```sql
INSERT INTO properties (org_id, name, slug, description,
  map_default_lat, map_default_lng, map_default_zoom,
  map_style, custom_map, about_content, footer_text,
  footer_links, custom_nav_items, landing_page)
VALUES (
  (SELECT id FROM orgs LIMIT 1),
  COALESCE((SELECT value#>>'{}' FROM site_config WHERE key = 'site_name'), 'Default Property'),
  'default',
  (SELECT value#>>'{}' FROM site_config WHERE key = 'location_name'),
  (SELECT (value->>'lat')::float8 FROM site_config WHERE key = 'map_center'),
  (SELECT (value->>'lng')::float8 FROM site_config WHERE key = 'map_center'),
  (SELECT (value->>'zoom')::int FROM site_config WHERE key = 'map_center'),
  (SELECT value#>>'{}' FROM site_config WHERE key = 'map_style'),
  (SELECT value FROM site_config WHERE key = 'custom_map'),
  (SELECT value#>>'{}' FROM site_config WHERE key = 'about_content'),
  (SELECT value#>>'{}' FROM site_config WHERE key = 'footer_text'),
  (SELECT value FROM site_config WHERE key = 'footer_links'),
  (SELECT value FROM site_config WHERE key = 'custom_nav_items'),
  (SELECT value FROM site_config WHERE key = 'landing_page')
);
```

### Step 2 — Populate org config columns

```sql
UPDATE orgs SET
  logo_url = (SELECT value#>>'{}' FROM site_config WHERE key = 'logo_url'),
  favicon_url = (SELECT value#>>'{}' FROM site_config WHERE key = 'favicon_url'),
  theme = (SELECT value FROM site_config WHERE key = 'theme'),
  tagline = (SELECT value#>>'{}' FROM site_config WHERE key = 'tagline'),
  setup_complete = COALESCE((SELECT (value#>>'{}')::boolean FROM site_config WHERE key = 'setup_complete'), false),
  default_property_id = (SELECT id FROM properties LIMIT 1)
WHERE id = (SELECT id FROM orgs LIMIT 1);
```

### Step 3 — Populate org_id/property_id on all content rows

```sql
-- All rows point to the single org and single property
UPDATE items SET org_id = (SELECT id FROM orgs LIMIT 1), property_id = (SELECT id FROM properties LIMIT 1);
UPDATE item_updates SET org_id = (SELECT id FROM orgs LIMIT 1), property_id = (SELECT id FROM properties LIMIT 1);
UPDATE photos SET org_id = (SELECT id FROM orgs LIMIT 1), property_id = (SELECT id FROM properties LIMIT 1);
UPDATE location_history SET org_id = (SELECT id FROM orgs LIMIT 1), property_id = (SELECT id FROM properties LIMIT 1);

-- Org-scoped tables
UPDATE item_types SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE custom_fields SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE update_types SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE species SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE item_species SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE update_species SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE invites SET org_id = (SELECT id FROM orgs LIMIT 1);
UPDATE redirects SET org_id = (SELECT id FROM orgs LIMIT 1);
```

---

## Section 7: RLS Rewrite

### Strategy

- **Public SELECT policies**: kept as `USING (true)` — replaced by `property_access_config` in Phase 3
- **Write policies**: all replaced with `check_permission()` / `user_org_admin_org_ids()`
- **`users.role` column**: kept for `storage.objects` policies only
- **`profiles` view**: kept (depends on `users.role`)

### Property-scoped tables (`items`, `item_updates`, `photos`)

```sql
-- items: public read unchanged, permission-based writes
CREATE POLICY "items_public_read" ON items FOR SELECT
  TO anon, authenticated
  USING (true);  -- Phase 3 replaces with property_access_config

CREATE POLICY "items_insert" ON items FOR INSERT
  TO authenticated
  WITH CHECK (check_permission(auth.uid(), property_id, 'items', 'create'));

CREATE POLICY "items_update" ON items FOR UPDATE
  TO authenticated
  USING (check_permission(auth.uid(), property_id, 'items', 'edit_any'));
  -- NOTE: Only checks edit_any. The edit_assigned permission exists in the JSONB
  -- but has no RLS enforcement yet — requires a task/assignment system (future).
  -- Contributors (edit_any=false, edit_assigned=true) cannot edit items via RLS
  -- in Phase 2. They can still create updates.

CREATE POLICY "items_delete" ON items FOR DELETE
  TO authenticated
  USING (check_permission(auth.uid(), property_id, 'items', 'delete'));
```

Same pattern for:
- `item_updates` — category `'updates'`
- `photos` — category `'attachments'`

### `location_history` — append-only

```sql
CREATE POLICY "location_history_public_read" ON location_history FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "location_history_insert" ON location_history FOR INSERT
  TO authenticated
  WITH CHECK (check_permission(auth.uid(), property_id, 'items', 'edit_any'));
  -- Editing an item's location requires item edit permission
```

No UPDATE or DELETE policies (append-only audit log).

### Org-scoped tables (`item_types`, `custom_fields`, `update_types`, `species`)

```sql
-- Public read unchanged
CREATE POLICY "<table>_public_read" ON <table> FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin writes scoped to org
CREATE POLICY "<table>_insert" ON <table> FOR INSERT
  TO authenticated
  WITH CHECK (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "<table>_update" ON <table> FOR UPDATE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "<table>_delete" ON <table> FOR DELETE
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));
```

### `invites` and `redirects`

Same as org-scoped pattern above — admin-only writes scoped to org.

### `properties` and `property_memberships`

```sql
-- properties: org members can read, org admins can manage, platform admins full access
CREATE POLICY "properties_org_member_read" ON properties FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

CREATE POLICY "properties_admin_manage" ON properties FOR ALL
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "properties_platform_admin" ON properties FOR ALL
  TO authenticated
  USING (is_platform_admin());

-- property_memberships: org members can read, org admins can manage, platform admins full access
CREATE POLICY "property_memberships_read" ON property_memberships FOR SELECT
  TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

CREATE POLICY "property_memberships_admin_manage" ON property_memberships FOR ALL
  TO authenticated
  USING (org_id IN (SELECT user_org_admin_org_ids()));

CREATE POLICY "property_memberships_platform_admin" ON property_memberships FOR ALL
  TO authenticated
  USING (is_platform_admin());
```

### `storage.objects` — unchanged

Storage policies continue using `users.role = 'admin'`. Updated in Phase 3 when `users.role`
is dropped.

### Policies dropped (all legacy `users.role`-based writes)

Every `DROP POLICY` from Phase 1's migration 008 section 14 is superseded. The Phase 2 migration
drops the Phase 1 permission-based policies and creates the new `check_permission()`-based ones.

Full list of policies to drop:
- `items`: insert, update, delete
- `item_updates`: insert, update, delete
- `photos`: insert, update, delete
- `site_config`: all (table dropped)
- `item_types`: insert, update, delete
- `custom_fields`: insert, update, delete
- `update_types`: insert, update, delete
- `invites`: select (admin), insert, update, delete
- `redirects`: insert, update, delete
- `location_history`: insert (if exists)
- `species`: insert, update, delete (these use `to authenticated using (true)` — tighten to org-scoped)
- `item_species`: insert, delete (tighten to org-scoped)
- `update_species`: insert, delete (tighten to org-scoped)

**Note on `redirects`:** The `redirects` table uses `slug text PRIMARY KEY`. After adding `org_id`,
slugs remain globally unique (not per-org). The `increment_scan_count()` function continues to
work as-is. In a future phase, if per-org slug uniqueness is needed, the PK should change to
`(org_id, slug)`. For now this is a known limitation with one org.

---

## Section 8: Drop `site_config`

```sql
DROP TABLE site_config;
```

The `site_config` updated_at trigger is also implicitly dropped.

---

## Section 9: Triggers and Indexes

### Triggers

```sql
CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER property_memberships_updated_at
  BEFORE UPDATE ON property_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Indexes

```sql
-- properties
CREATE INDEX idx_properties_org ON properties (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_properties_org_slug ON properties (org_id, slug);
CREATE INDEX idx_properties_publicly_listed ON properties (is_publicly_listed)
  WHERE is_publicly_listed = true;

-- property_memberships
CREATE INDEX idx_property_memberships_user ON property_memberships (user_id);
CREATE INDEX idx_property_memberships_property ON property_memberships (property_id);
CREATE UNIQUE INDEX idx_property_memberships_property_user
  ON property_memberships (property_id, user_id) WHERE user_id IS NOT NULL;

-- Content tables (org_id/property_id indexes)
CREATE INDEX idx_items_org ON items (org_id);
CREATE INDEX idx_items_property ON items (property_id);
CREATE INDEX idx_items_org_property ON items (org_id, property_id);

CREATE INDEX idx_item_updates_org ON item_updates (org_id);
CREATE INDEX idx_item_updates_property ON item_updates (property_id);

CREATE INDEX idx_photos_org ON photos (org_id);
CREATE INDEX idx_photos_property ON photos (property_id);

CREATE INDEX idx_location_history_org ON location_history (org_id);
CREATE INDEX idx_location_history_property ON location_history (property_id);

-- Org-scoped tables
CREATE INDEX idx_item_types_org ON item_types (org_id);
CREATE INDEX idx_custom_fields_org ON custom_fields (org_id);
CREATE INDEX idx_update_types_org ON update_types (org_id);
CREATE INDEX idx_species_org ON species (org_id);
CREATE INDEX idx_item_species_org ON item_species (org_id);
CREATE INDEX idx_update_species_org ON update_species (org_id);
CREATE INDEX idx_invites_org ON invites (org_id);
CREATE INDEX idx_redirects_org ON redirects (org_id);
```

---

## Section 10: TypeScript Changes

### New types in `src/lib/types.ts`

```typescript
export interface Property {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  map_default_lat: number | null;
  map_default_lng: number | null;
  map_default_zoom: number | null;
  map_style: string | null;
  map_bounds: unknown | null;
  custom_map: unknown | null;
  landing_headline: string | null;
  landing_body: string | null;
  landing_image_url: string | null;
  landing_page: unknown | null;
  primary_color: string | null;
  logo_url: string | null;
  about_content: string | null;
  footer_text: string | null;
  footer_links: unknown | null;
  custom_nav_items: unknown | null;
  is_publicly_listed: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PropertyMembership {
  id: string;
  org_id: string;
  property_id: string;
  user_id: string | null;
  role_id: string;
  grant_type: 'explicit' | 'temporary';
  granted_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
```

### Updated existing types

Add `org_id` and `property_id` to property-scoped types:

```typescript
export interface Item {
  // ... existing fields
  org_id: string;
  property_id: string;
}

// Same for ItemUpdate, Photo, LocationHistory
```

Add `org_id` to org-scoped types:

```typescript
export interface ItemType {
  // ... existing fields
  org_id: string;
}

// Same for CustomField, UpdateType, Species, Invite
```

### Database interface

- Add `properties`, `property_memberships` to `Database.public.Tables`
- Remove `site_config` from `Database.public.Tables`
- Update existing table Row/Insert/Update types to include `org_id`/`property_id`

### New permission utility: `src/lib/permissions/resolve.ts`

```typescript
export interface ResolvedAccess {
  role: Role;
  permissions: RolePermissions;
  source: 'platform_admin' | 'org_admin' | 'property_membership' | 'org_membership';
}

export async function resolveUserAccess(
  supabase: SupabaseClient,
  userId: string,
  propertyId: string
): Promise<ResolvedAccess | null>;

export function hasPermission(
  access: ResolvedAccess,
  category: keyof RolePermissions,
  action: string
): boolean;
```

---

## Section 11: Frontend Changes (Targeted)

### Config server update

`src/lib/config/server.ts` — read from `orgs` + `properties` instead of `site_config`:

```typescript
export async function getConfig(propertyId?: string): Promise<SiteConfig> {
  // If no propertyId, use the org's default property
  // Query: SELECT o.*, p.* FROM properties p JOIN orgs o ON o.id = p.org_id
  // Map columns back to SiteConfig shape
}
```

The `SiteConfig` interface stays the same — only the data source changes. Components using
`useConfig()` are unaffected.

### BEFORE INSERT trigger for org_id/property_id auto-population

To avoid breaking every content creation path, add a BEFORE INSERT trigger that auto-populates
`org_id` and `property_id` from the user's context when not explicitly provided:

```sql
CREATE OR REPLACE FUNCTION auto_populate_org_property()
RETURNS trigger AS $$
BEGIN
  -- Auto-populate org_id from user's active org if not set
  IF NEW.org_id IS NULL THEN
    NEW.org_id := (SELECT last_active_org_id FROM public.users WHERE id = auth.uid());
  END IF;

  -- Auto-populate property_id from org's default property if not set
  IF TG_ARGV[0] = 'property_scoped' AND NEW.property_id IS NULL THEN
    NEW.property_id := (SELECT default_property_id FROM public.orgs WHERE id = NEW.org_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Applied to all content tables:
```sql
-- Property-scoped tables
CREATE TRIGGER items_auto_org_property BEFORE INSERT ON items
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('property_scoped');
CREATE TRIGGER item_updates_auto_org_property BEFORE INSERT ON item_updates
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('property_scoped');
CREATE TRIGGER photos_auto_org_property BEFORE INSERT ON photos
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('property_scoped');
CREATE TRIGGER location_history_auto_org_property BEFORE INSERT ON location_history
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('property_scoped');

-- Org-scoped tables
CREATE TRIGGER item_types_auto_org BEFORE INSERT ON item_types
  FOR EACH ROW EXECUTE FUNCTION auto_populate_org_property('org_scoped');
-- ... same for custom_fields, update_types, species, item_species, update_species, invites, redirects
```

This allows existing frontend code to INSERT without supplying `org_id`/`property_id` — the
trigger fills them in. New code should supply them explicitly.

### Files that need updating

| File | Change |
|------|--------|
| `src/lib/config/server.ts` | Read from orgs+properties instead of site_config. **Note:** must use service role or add public SELECT on properties/orgs, since current anon client won't have access to these RLS-protected tables. |
| `src/lib/config/types.ts` | Keep SiteConfig, add mapping from Property + Org columns |
| `src/app/admin/settings/actions.ts` | Write to orgs/properties instead of site_config |
| `src/app/admin/landing/actions.ts` | Write landing_page to properties instead of site_config |
| `src/app/setup/actions.ts` | Write to orgs/properties during initial setup |
| `src/app/manage/add/actions.ts` | Supply `org_id`/`property_id` on item creation (or rely on trigger) |
| `src/app/manage/update/actions.ts` | Supply `org_id`/`property_id` on update creation (or rely on trigger) |
| `src/lib/permissions/resolve.ts` | NEW — TypeScript permission resolution utility |
| `src/lib/types.ts` | Add Property, PropertyMembership, update existing types with org_id/property_id. Update Org interface with new config columns. Remove SiteConfigRow (dead type). |

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `check_permission()` called on every write — performance | Function is `STABLE` (cached within transaction). Indexes on org_id/property_id make lookups fast. |
| Denormalized org_id/property_id can drift from parent | Application layer always sets from parent item. Future: trigger to enforce consistency. |
| Dropping site_config breaks frontend | Config server change is one file. SiteConfig interface unchanged. Deploy migration + code together. |
| Permission resolution function has bugs | TypeScript mirror for UI testing. DB function tested via SQL editor before deploy. |
| storage.objects policies still use users.role | Acceptable — kept until Phase 3. Only affects admin delete on storage. |
| Large migration touching every table | Single transaction — atomic rollback on failure. Small dataset. |

---

## What This Phase Does NOT Touch

| Concern | Deferred to |
|---------|-------------|
| `property_access_config` (anon access config) | Phase 3 |
| `temporary_access_grants` | Phase 3 |
| `anonymous_access_tokens` | Phase 3 |
| Replace public SELECT policies | Phase 3 |
| Drop `users.role` column | Phase 3 |
| Drop `profiles` compatibility view | Phase 3 |
| `custom_domains`, tenant resolution | Phase 4 |
| Org switcher / property selector UI | Future |

---

## Northstar Test Scenario Coverage (Phase 2)

| Scenario | Phase 2 coverage |
|----------|-----------------|
| A. Multi-org consultant | **Fully supported.** Data scoped to orgs, properties within orgs. |
| B. Property-scoped volunteer | **Fully supported.** `property_memberships` enables per-property role override. Permission resolution picks property override over org role. |
| C. Day-of volunteer event | Not yet — requires Phase 3 `temporary_access_grants`. |
| D. Public trail map | Not yet — requires Phase 3 `property_access_config`. |
| E. Password-protected property | Not yet — requires Phase 3 `property_access_config`. |
| F. Embedded public map | Not yet — requires Phase 3 + Phase 4. |
