# Org Admin Panel & IAM UI Design

**Date:** 2026-03-25
**Status:** Draft
**Depends on:** Phase 1–4B multi-tenancy backend (complete)

## Overview

The multi-tenancy data model, permission resolution, tenant middleware, and custom domain integration are fully implemented at the database and server level (Phases 1–4B). No admin UI exists for these features. This spec defines the org-level admin panel and IAM management UI that sits on top of the existing backend.

## Goals

1. Org admins can manage properties, members, roles, domains, and access configuration from a single admin panel
2. The admin panel is context-aware: org domain shows org admin, property domain shows property admin
3. Existing property-level admin pages are preserved and re-parented under the new layout
4. Implementation is staged so each stage delivers testable value independently

## Non-Goals

- AI onboarding wizard for property creation (separate spec)
- Billing/subscription management UI (platform admin concern)
- Platform admin super-panel (out of scope)
- Wildcard subdomain resolution (future optimization)

---

## 1. Routing & Context Detection

### Route Structure

```
/admin/                              → org dashboard (org context) OR property admin (property context)
/admin/properties/                   → property list
/admin/properties/[slug]/            → property admin shell
/admin/properties/[slug]/data        → items/updates/users (existing)
/admin/properties/[slug]/settings    → property settings (existing)
/admin/properties/[slug]/members     → property-level member overrides
/admin/properties/[slug]/landing     → landing page editor (existing)
/admin/properties/[slug]/types       → item types (existing)
/admin/properties/[slug]/species     → species management (existing)
/admin/properties/[slug]/invites     → invite management (existing)
/admin/members/                      → org member list with drill-down
/admin/roles/                        → role editor (clone & customize)
/admin/domains/                      → custom domain management
/admin/access/                       → access config & tokens
/admin/settings/                     → org-level settings
```

### Context Detection Logic

The admin layout reads `getTenantContext()` from the tenant middleware headers:

1. If `propertyId` is present → render **property admin layout** (sidebar shows property sections, "Back to Org" link if org domain is known)
2. If only `orgId` is present → render **org admin layout** (sidebar shows org sections)

This means:
- `fairbanks-eagles.org/admin` → org admin (org domain, no property resolved)
- `fairbanks-eagles.org/admin/properties/elm-street` → property admin via org drill-down
- `elm-street.fairbanks-eagles.org/admin` → property admin (property resolved by middleware)
- `elmstreet-nestboxes.com/admin` → property admin (custom domain resolves to property)

### Navigation Layout

Both org and property admin use a **sidebar layout** replacing the current horizontal tab bar. This accommodates 6+ navigation sections.

**Org admin sidebar:**
- Org name (header)
- Dashboard
- Properties
- Members
- Roles
- Domains
- Access & Tokens
- Org Settings

**Property admin sidebar:**
- "← Back to Org" link (points to org primary domain + `/admin`)
- Property name (header)
- Data (items/updates/users — existing)
- Settings (existing)
- Landing Page (existing)
- Types (existing)
- Species (existing)
- Members (property-level overrides)
- Invites (existing)

---

## 2. Org Admin Dashboard

**Route:** `/admin/` (org context)

### Summary Cards Row

Three cards with counts and links:
- Properties (count, links to `/admin/properties/`)
- Members (count, links to `/admin/members/`)
- Custom Domains (count, links to `/admin/domains/`)

### Properties List

Compact table below summary cards:
- Columns: Name, Slug, Item count, Status badge
- Status values: Active, Setup, Archived
- Click row → navigates to `/admin/properties/[slug]`

### Quick Actions

- "Create Property" button at top of properties list
- "Invite Member" shortcut button

---

## 3. Property Management

**Route:** `/admin/properties/`

### Property List

- Table: Name, Slug, Status, Items count, Members count, Domain (if custom)
- Filter tabs: All / Active / Setup / Archived
- "Create Property" button top-right

### Create Property

Minimal creation form (modal or inline):
- **Name** (required)
- **Slug** (auto-generated from name, editable)
- **Description** (optional)

On submit: creates the property record and redirects to `/admin/properties/[slug]` where the admin configures details via the existing property settings UI.

No setup wizard — full configuration happens inside the property admin panel.

### Property Status Derivation

Status is derived from two columns:
- **Active** = `is_active = true AND deleted_at IS NULL`
- **Setup** = `is_active = false AND deleted_at IS NULL`
- **Archived** = `deleted_at IS NOT NULL`

### Property Row Actions

- Click row → drill into property admin at `/admin/properties/[slug]`
- Archive / Unarchive (sets/clears `deleted_at` for soft delete)
- No hard delete from UI

### Property Admin Shell

**Route:** `/admin/properties/[slug]/`

- Sidebar switches to property sections
- "← Back to Org" link at top
- Existing admin page components render in the main content area
- Minimal code changes: existing pages re-parented under new layout

---

## 4. Member Management

**Route:** `/admin/members/`

### Org Members List

- Table: Name, Email, Org Role, Property Access (summary count), Joined date
- "Invite Member" button top-right
- Search/filter by name or email

### Invite Flow

- Email address input + org role selection dropdown
- Creates `org_membership` with chosen role
- Integrates with existing invite infrastructure for auth account creation

### Member Drill-Down

Clicking a member row expands or navigates to a detail view:

**Org role section:**
- Dropdown to change org role (org_admin, org_staff, contributor, viewer)

**Per-property access table:**
- Lists all properties in the org
- Each row shows:
  - Property name
  - Effective role (inherited from org role — shown in grey/muted)
  - Override role (from `property_memberships` — shown highlighted)
  - "Add Override" button → dropdown to select a different role for this property
  - "Remove Override" button → reverts to org-inherited role

**Remove from org:**
- Button to remove org membership (cascades: removes property access too)
- Confirmation required

### Guardrails

- **Last admin protection:** Cannot remove the last `org_admin` from an org. Server action must check admin count before allowing removal.
- **Last admin downgrade protection:** Cannot change the role of the last `org_admin` to a non-admin role. The dropdown disables non-admin options when the user is the sole admin.

### Relationship to Property Members Page

`/admin/properties/[slug]/members` shows the same data but scoped to one property. Both views read from `org_memberships` and `property_memberships`. Changes in either view are reflected in both.

---

## 5. Role Editor

**Route:** `/admin/roles/`

### Roles List

- Cards or table showing all roles in the org
- System roles (org_admin, org_staff, contributor, viewer) marked with a "System" badge, read-only
- Custom roles show Edit and Delete actions
- "Create Role" button top-right

### Create Role Flow

1. Select a system role to clone as starting point — available base roles: `org_admin`, `org_staff`, `contributor`, `viewer` (cannot clone `platform_admin` or `public`)
2. Name the new role (e.g., "Field Volunteer")
3. Permission editor opens with toggles pre-set from cloned role

### Permission Editor

Grouped by category matching the JSONB `permissions` structure. Each category is a collapsible section with toggle switches.

**Categories and permissions:**

| Category (display name) | JSONB key | Permissions |
|-------------------------|-----------|------------|
| Organization | `org` | manage_settings, manage_members, manage_billing, manage_roles, view_audit_log |
| Properties | `properties` | create, manage_all, view_all |
| Items | `items` | view, create, edit_any, edit_assigned, delete |
| Updates | `updates` | view, create, edit_own, edit_any, delete, approve_public_submissions |
| Tasks | `tasks` | view_assigned, view_all, create, assign, complete |
| Attachments | `attachments` | upload, delete_own, delete_any |
| Reports | `reports` | view, export |
| Modules | `modules` | tasks, volunteers, public_forms, qr_codes, reports |

The base role's defaults are shown as reference text ("inherited from Contributor") so the admin understands what they're changing relative to the parent.

### Guardrails

- Cannot clone `platform_admin` (only assignable by platform)
- Cannot grant permissions higher than the admin's own role
- System roles cannot be edited or deleted
- Custom roles show usage count ("Used by X members") before allowing delete. If the role is in use, deletion requires reassigning all members to another role first (the server action enforces this via the FK `RESTRICT` constraint on `org_memberships.role_id` and `property_memberships.role_id`)

---

## 6. Custom Domains Management

**Route:** `/admin/domains/`

### Domain List

Three grouped sections:

**Organization Domains** — domains resolving to the org:
- e.g., `fairbanks-eagles.org` (apex, primary), `www.fairbanks-eagles.org` (subdomain, redirect)

**Property Subdomains** (under org domain) — auto-suggested from property slugs:
- e.g., `elm-street.fairbanks-eagles.org`, `riverside.fairbanks-eagles.org`
- Properties without a subdomain show a ghosted row with **"+ Add Subdomain"** button
- One-click action: pre-fills `[property-slug].[org-primary-domain]` and calls `addCustomDomain()`

**Property Custom Domains** — independent domains pointing to a property:
- e.g., `elmstreet-nestboxes.com`

### Domain Row Display

Each domain row shows:
- Domain name
- Type label (Apex / Subdomain)
- Scope (org or property name)
- Status badge: Active (green), Verifying/Pending (amber), Failed (red), Disabled (grey). The DB column `status` has values: `pending`, `verifying`, `active`, `failed`, `disabled`. Display `pending` and `verifying` with the same amber badge.
- SSL status badge (for active domains)
- Actions: DNS Info (expandable), Remove

### Add Domain Flow

1. **Enter domain** — domain name input + scope selector (org-wide or specific property dropdown)
2. **DNS instructions** — shows required DNS records with copy-to-clipboard. Domain registered with Vercel via `addCustomDomain()` server action automatically.
3. **Verification** — automatic via `/api/cron/verify-domains`. "Check Now" button for manual poll via `checkDomainStatus()`. 72-hour timeout before marking failed.

### DNS Info Panel

Expandable per domain. Shows exact records needed:
- Apex domains: A record pointing to Vercel IP
- Subdomains: CNAME record pointing to `cname.vercel-dns.com`

### Implementation Note

All three existing server actions are reused directly:
- `addCustomDomain(orgId, domain, propertyId?)` from `src/lib/domains/actions.ts`
- `removeCustomDomain(domainId)`
- `checkDomainStatus(domainId)`

Each property subdomain is registered as its own row in `custom_domains` (explicit registration, not wildcard). This works with existing middleware and Vercel's domain system.

### Admin Routing

- `fairbanks-eagles.org/admin` → org admin
- `elm-street.fairbanks-eagles.org/admin` → Elm Street property admin (middleware resolves property)
- `elmstreet-nestboxes.com/admin` → Elm Street property admin (custom domain resolves property)
- "Back to Org" link in property admin points to org's primary custom domain + `/admin`

---

## 7. Access Config & Tokens

**Route:** `/admin/access/`

Two tabs: **Access Config** and **Tokens & Grants**

### Access Config Tab

Per-property anonymous access configuration from `property_access_config`:

- Table listing each property with current access status (enabled/disabled)
- Click row → expand inline editor with toggles:
  - Anonymous access enabled (master switch)
  - Can view map
  - Can view items
  - Can view item details
  - Can submit forms
  - Password protection (with password field)
  - Embed allowed (with allowed origins list)
  - Visible field keys for anonymous users (`anon_visible_field_keys` JSONB — multi-select of item fields)

### Tokens & Grants Tab

**Anonymous Access Tokens** — for unauthenticated public/embed access:

- Table: Token (truncated), Property, Label, Use Count (`use_count` column), Expires At, Status
- "Status" is a derived display value: `is_active = true AND expires_at > now()` → Active, `is_active = true AND expires_at <= now()` → Expired, `is_active = false` → Revoked
- "Create Token" → form: property (dropdown), expiration date, label/description
- Row actions: Copy full token, Revoke (sets `is_active = false`), View usage stats

Anonymous tokens are like API keys for read-only public access. They're used by embeds on third-party websites or public links. No user account is involved. Domain restrictions for embeds are configured per-property via `property_access_config.embed_allowed_origins`, not per-token.

**Temporary Access Grants** — for time-limited authenticated user access:

- Table: User, Property, Role, Start Date, End Date, Status (active/expired)
- "Create Grant" → form: user (search/select), property (dropdown), role (dropdown), start date, end date
- Row actions: Revoke (set end date to now)

Temporary grants are invisible to the end user — they just see the property appear in their accessible list during the grant period. Useful for events, seasonal volunteers, auditors.

---

## 8. Org Settings

**Route:** `/admin/settings/` (org context)

Manages org-level fields from the `orgs` table. Distinct from property settings at `/admin/properties/[slug]/settings`.

### Sections

**General:**
- Org name
- Slug
- Tagline

**Appearance:**
- Logo upload
- Primary theme/colors (inherited by properties as defaults)

**Subscription:**
- Tier display (read-only)
- Managed by platform admin or future billing integration

Standard form page using same patterns as existing property settings UI.

---

## 9. Implementation Stages

Each stage delivers independently testable value. Planned as GitHub Issues.

### Stage 1: Org Admin Shell + Property Management
- Admin layout with sidebar navigation
- Context detection (org vs property)
- Org dashboard with summary cards and property list
- Property CRUD (create, archive)
- Re-parent existing property admin pages under `/admin/properties/[slug]/`

### Stage 2: Member Management + Role Assignment
- Org member list with search/filter
- Invite member flow
- Member drill-down: org role + per-property overrides
- Property members page integration

### Stage 3: Role Editor
- Roles list with system role display
- Clone-and-customize flow
- Permission editor with category-grouped toggles
- Guardrails (no platform_admin clone, usage count on delete)

### Stage 4: Custom Domains UI
- Domain list with three grouped sections
- Add domain flow with DNS instructions
- Property subdomain one-click registration
- Verification status display and manual check
- Reuses existing server actions

### Stage 5: Access Config & Tokens
- Per-property anonymous access toggles
- Anonymous access token CRUD
- Temporary access grant CRUD

---

## 10. Data Model Reference

All tables referenced in this spec already exist from Phases 1–4B:

| Table | Used By |
|-------|---------|
| `orgs` | Org settings, dashboard |
| `properties` | Property management, dashboard |
| `roles` | Role editor |
| `org_memberships` | Member management |
| `property_memberships` | Member drill-down, property members |
| `custom_domains` | Domain management |
| `property_access_config` | Access config |
| `anonymous_access_tokens` | Token management |
| `temporary_access_grants` | Grant management |

No new tables or migrations are needed. All server-side permission functions (`check_permission()`, `resolve_property_role_id()`, `user_accessible_property_ids()`) are in place.

### Existing Server Actions (Reused)

- `addCustomDomain()`, `removeCustomDomain()`, `checkDomainStatus()` — `src/lib/domains/actions.ts`
- `resolveUserAccess()`, `hasPermission()` — `src/lib/permissions/resolve.ts`
- `getTenantContext()` — `src/lib/tenant/server.ts`

### New Server Actions Required

- Property CRUD (create, update, archive)
- Org member management (list, invite, update role, remove)
- Property membership management (add override, remove override)
- Role CRUD (create, update, delete)
- Access config updates (toggle settings per property)
- Token CRUD (create, revoke)
- Temporary grant CRUD (create, revoke)
- Org settings update

---

## 11. UI Patterns

Follows existing codebase conventions:
- **Tailwind CSS** with custom component classes (`.btn-primary`, `.card`, `.input-field`, `.label`)
- **No external UI library** — all components custom-built
- **Client-side data fetching** with Supabase `createClient()`
- **Server actions** for mutations with auth/permission checks
- **Color-coded status badges** (green=active, amber=pending, red=failed)
- **Loading states** on buttons (text change + disabled)
- **Success/error message banners** at top of forms

### New Pattern: Sidebar Navigation

Replaces horizontal tab bar for admin layout. Consistent between org and property contexts with different section lists. Active section highlighted with left border accent.

### Empty States

All list views show an empty state when no items exist. Each empty state includes:
- A brief description of what belongs in the list
- The primary action button (e.g., "Create your first property", "Invite a member")

This applies to: property list, member list, roles list (custom only — system roles always shown), domain list, tokens list, grants list, and access config list.
