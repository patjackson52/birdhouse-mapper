# Platform Admin Panel — Design Spec

## Overview

A platform-level admin interface at `/platform/*` for platform operators (not customers). Provides org management, tier/feature configuration, and per-org feature overrides. Secured with the existing `is_platform_admin` flag on the users table.

## Goals

1. Browse and manage all organizations from a single interface
2. Define subscription tiers with feature defaults (in code)
3. Override features per-org for testing, trials, and special arrangements
4. Provide a clear, secure separation from org-level admin

## Non-Goals (v1)

- Platform admin user management (admin flag set directly in DB)
- Impersonation / "view as org"
- Billing/payment integration
- User browser (cross-org user search)
- Property browser (cross-org property search)
- Debug/logging tools
- Audit log

---

## Data Model

### Feature Definitions (in code)

All features and tier defaults live in `lib/platform/features.ts`. This is the single source of truth for what features exist and what each tier gets by default.

**Feature registry:**

| Feature Key | Type | Label |
|---|---|---|
| `tasks` | boolean | Tasks Module |
| `volunteers` | boolean | Volunteers Module |
| `public_forms` | boolean | Public Forms |
| `qr_codes` | boolean | QR Codes |
| `reports` | boolean | Reports |
| `ai_context` | boolean | AI Context |
| `custom_domains` | boolean | Custom Domains |
| `site_builder` | boolean | Site Builder |
| `max_properties` | numeric | Max Properties |
| `max_members` | numeric | Max Members |
| `storage_limit_mb` | numeric | Storage Limit (MB) |
| `max_ai_context_entries` | numeric | Max AI Context Entries |

**Tier defaults:**

| Feature | free | community | pro | municipal |
|---|---|---|---|---|
| tasks | false | true | true | true |
| volunteers | false | true | true | true |
| public_forms | true | true | true | true |
| qr_codes | false | true | true | true |
| reports | false | false | true | true |
| ai_context | false | false | true | true |
| custom_domains | false | false | true | true |
| site_builder | false | false | true | true |
| max_properties | 1 | 3 | unlimited | unlimited |
| max_members | 5 | 25 | unlimited | unlimited |
| storage_limit_mb | 100 | 500 | 5000 | unlimited |
| max_ai_context_entries | 0 | 10 | 100 | unlimited |

Unlimited is represented as `null` in code.

### Per-Org Overrides (in DB)

New table: `org_feature_overrides`

```sql
CREATE TABLE org_feature_overrides (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,
  value      JSONB NOT NULL,
  note       TEXT,
  set_by     UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, feature)
);
```

- `feature`: key from the feature registry (e.g., `'tasks'`, `'max_properties'`)
- `value`: `true`/`false` for booleans, number or `null` (unlimited) for numerics
- `note`: optional human-readable reason for the override (e.g., "trial until April")
- `set_by`: the platform admin who set the override

**RLS policy:** Only `is_platform_admin()` can SELECT, INSERT, UPDATE, DELETE.

### Feature Resolution

`resolveOrgFeatures(orgId)` in `lib/platform/features.ts`:

1. Load the org's `subscription_tier`
2. Get tier defaults from the in-code config
3. Fetch all rows from `org_feature_overrides` for this org
4. Merge: override values replace tier defaults
5. Return the fully resolved feature map

Results are cached per-request (not globally) to ensure freshness.

**Supabase client usage:** Platform admin pages use the standard `createClient()` from `@/lib/supabase/server` — the RLS policies on `org_feature_overrides` grant access to platform admins. For enforcement in org-context pages (where the user may not be a platform admin), `resolveOrgFeatures` reads the org's tier from already-loaded tenant context and fetches overrides using a service-role client (since regular org users don't have SELECT on `org_feature_overrides`).

---

## Security

Four layers protect the platform admin:

1. **Middleware gate:** Requests to `/platform/*` check `is_platform_admin` on the authenticated user. Non-admins are redirected to `/` with no indication the route exists (no 403, just a redirect or 404).

2. **Layout server component:** `app/platform/layout.tsx` performs a server-side `is_platform_admin` check before rendering any children. Defense-in-depth against middleware bypass.

3. **Server action checks:** Every server action in `app/platform/actions.ts` verifies `is_platform_admin` before proceeding.

4. **RLS on `org_feature_overrides`:** Database-level enforcement. Even if a server action were called directly, the DB rejects unauthorized access.

Platform admin access is controlled by the `is_platform_admin` boolean on the `users` table, set directly in the database. No self-service admin provisioning in v1.

---

## Routing

```
/platform                  → Dashboard
/platform/orgs             → Org list
/platform/orgs/[slug]      → Org detail + feature overrides
/platform/tiers            → Tier reference (read-only)
```

All routes live under `app/platform/` route group with a shared `PlatformShell` layout.

---

## Layout & Styling

### PlatformShell

- Same structural pattern as `AdminShell` (sidebar + main content area)
- Distinct accent color on the header/sidebar to signal "platform mode" (e.g., deep indigo or amber)
- Sidebar navigation: Dashboard, Organizations, Tier Reference
- Shows logged-in admin's name
- No org context in the header (this is cross-org)
- Reuses existing component primitives: `.card`, `.btn-primary`, `.btn-secondary`, `.input-field`, `.label`

---

## Pages

### 1. Dashboard (`/platform`)

Summary cards:
- Total organizations (with breakdown by tier)
- Total users across all orgs
- Total properties across all orgs
- Orgs by status (active, trialing, past_due, cancelled)

Quick links to recently created orgs.

### 2. Org List (`/platform/orgs`)

Searchable, sortable table of all organizations.

**Columns:** Name, Slug, Tier, Status, Members (count), Properties (count), Created Date

**Filters:** Tier dropdown, Status dropdown

**Actions:** Click row to navigate to org detail page.

### 3. Org Detail (`/platform/orgs/[slug]`)

Three sections:

**Info card:**
- Org name, slug, logo
- Subscription tier (editable dropdown)
- Subscription status (editable dropdown)
- Created date
- Save button for edits

**Overview:**
- Member count
- Property list (name, slug, active/inactive)
- Quick stats

**Feature overrides table:**

| Feature | Tier Default | Override | Resolved Value | Note |
|---|---|---|---|---|
| Tasks Module | false (free) | ✓ true | **true** | trial until April |
| Max Properties | 1 (free) | ✓ 5 | **5** | early adopter |
| Reports | false (free) | — | false | — |

- Toggle "Override" column to set a custom value
- Boolean features: toggle switch
- Numeric features: number input (empty = unlimited)
- Note field: inline editable text
- Clear override to revert to tier default

### 4. Tier Reference (`/platform/tiers`)

Read-only comparison table. Rows = features, columns = tiers. Shows what each tier provides out of the box. Reference for when deciding overrides.

---

## Feature Enforcement

### Two-Layer Gating Model

```
Platform features (does this org have access to this feature?)
  → Role permissions (does this user have permission to use it?)
```

A feature must pass both gates. If the platform says `tasks: false` for an org, no user in that org sees the tasks module regardless of their role permissions.

### Enforcement Points

**Server actions:** Actions that create properties, add members, upload to storage, etc. call `resolveOrgFeatures()` and check limits before proceeding. Return descriptive errors like `{ error: 'Property limit reached (5/5)' }`.

**UI components:** Module-gated UI (tasks tab, reports tab, site builder, etc.) checks the resolved feature map to conditionally render or show an upgrade/contact prompt.

**Existing role permissions:** Unchanged. The `modules` object in role permissions continues to control who within the org can use a feature. Platform features are a prerequisite layer above this.

### Performance

- One additional indexed query per request (`SELECT * FROM org_feature_overrides WHERE org_id = ?`, typically 0-12 rows)
- Resolved features cached per-request alongside existing tenant context
- No external API calls, no complex joins
- Negligible impact (~1-5ms) on top of existing auth + tenant resolution

---

## Server Actions

All in `app/platform/actions.ts`:

- `updateOrg(orgId, { subscription_tier?, subscription_status?, name?, slug? })` — edit org basics
- `setFeatureOverride(orgId, feature, value, note?)` — upsert an override
- `removeFeatureOverride(orgId, feature)` — delete override, revert to tier default

All actions verify `is_platform_admin` before proceeding and return `{ success: true }` or `{ error: string }`.
