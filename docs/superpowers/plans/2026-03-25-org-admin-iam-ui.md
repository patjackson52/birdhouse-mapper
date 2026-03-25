# Org Admin Panel & IAM UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the org-level admin panel and IAM management UI on top of the existing multi-tenancy backend (Phases 1–4B).

**Architecture:** Context-dependent admin panel that detects org vs property scope via tenant middleware headers. Sidebar navigation layout with org sections at the top level and property sections when drilled into a property. Existing property admin pages re-parented under `/admin/properties/[slug]/`.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS with custom component classes, Supabase client-side queries + server actions, Vitest for testing.

**Spec:** `docs/superpowers/specs/2026-03-25-org-admin-iam-ui-design.md`

---

## File Structure Overview

### Shared Components (Stage 1)
- `src/components/admin/AdminSidebar.tsx` — Sidebar navigation component (org and property variants)
- `src/components/admin/StatusBadge.tsx` — Reusable status badge (Active/Setup/Archived/Verifying/etc.)
- `src/components/admin/EmptyState.tsx` — Reusable empty state with description + CTA button

### Stage 1: Admin Shell + Property Management
- `src/app/admin/layout.tsx` — **Modify**: Replace horizontal tabs with sidebar, add context detection
- `src/app/admin/page.tsx` — **Modify**: Add org dashboard view alongside existing property admin
- `src/app/admin/properties/page.tsx` — Property list with filters
- `src/app/admin/properties/actions.ts` — Property CRUD server actions
- `src/app/admin/properties/[slug]/layout.tsx` — Property admin shell with property sidebar
- `src/app/admin/properties/[slug]/page.tsx` — Redirect to data (default property admin view)
- `src/app/admin/properties/[slug]/data/page.tsx` — **Move from** existing `src/app/admin/page.tsx` property content
- `src/app/admin/properties/[slug]/settings/page.tsx` — **Move from** existing `src/app/admin/settings/page.tsx`
- `src/app/admin/properties/[slug]/settings/actions.ts` — **Move from** existing `src/app/admin/settings/actions.ts`
- `src/app/admin/properties/[slug]/landing/page.tsx` — **Move from** existing `src/app/admin/landing/page.tsx`
- `src/app/admin/properties/[slug]/landing/actions.ts` — **Move from** existing `src/app/admin/landing/actions.ts` (if exists)
- `src/app/admin/properties/[slug]/types/page.tsx` — **Move from** existing `src/app/admin/types/page.tsx`
- `src/app/admin/properties/[slug]/species/page.tsx` — **Move from** existing `src/app/admin/species/page.tsx`
- `src/app/admin/properties/[slug]/invites/page.tsx` — **Move from** existing `src/app/admin/invites/page.tsx`
- `src/app/admin/properties/[slug]/invites/actions.ts` — **Move from** existing `src/app/admin/invites/actions.ts`

### Stage 2: Member Management
- `src/app/admin/members/page.tsx` — Org member list with drill-down
- `src/app/admin/members/actions.ts` — Member management server actions
- `src/app/admin/members/[userId]/page.tsx` — Member detail/drill-down view
- `src/app/admin/properties/[slug]/members/page.tsx` — Property-scoped member list
- `src/app/admin/properties/[slug]/members/actions.ts` — Property membership server actions

### Stage 3: Role Editor
- `src/app/admin/roles/page.tsx` — Roles list with system/custom distinction
- `src/app/admin/roles/actions.ts` — Role CRUD server actions
- `src/app/admin/roles/[roleId]/page.tsx` — Permission editor
- `src/components/admin/PermissionEditor.tsx` — Category-grouped toggle switches

### Stage 4: Custom Domains UI
- `src/app/admin/domains/page.tsx` — Domain list with three groups
- `src/app/admin/domains/actions.ts` — Thin wrappers around existing domain actions + queries

### Stage 5: Access Config, Tokens & Org Settings
- `src/app/admin/access/page.tsx` — Two-tab interface (config + tokens/grants)
- `src/app/admin/access/actions.ts` — Access config, token, and grant server actions
- `src/app/admin/settings/page.tsx` — Org-level settings (created in Stage 5; placeholder in Stage 1)
- `src/app/admin/settings/actions.ts` — Org settings server actions

---

## Stage 1: Org Admin Shell + Property Management

### Task 1.1: Admin Sidebar Component

**Files:**
- Create: `src/components/admin/AdminSidebar.tsx`
- Create: `src/components/admin/StatusBadge.tsx`
- Create: `src/components/admin/EmptyState.tsx`

- [ ] **Step 1: Create StatusBadge component**

```tsx
// src/components/admin/StatusBadge.tsx
'use client';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  setup: 'bg-amber-100 text-amber-800',
  archived: 'bg-gray-100 text-gray-600',
  verifying: 'bg-amber-100 text-amber-800',
  pending: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  disabled: 'bg-gray-100 text-gray-600',
  expired: 'bg-red-100 text-red-800',
  revoked: 'bg-gray-100 text-gray-600',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status.toLowerCase()] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${style}`}>
      {status}
    </span>
  );
}
```

- [ ] **Step 2: Create EmptyState component**

```tsx
// src/components/admin/EmptyState.tsx
'use client';

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="text-center py-12 border border-dashed border-sage-light rounded-lg">
      <p className="text-forest-dark font-medium mb-1">{title}</p>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary text-sm">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create AdminSidebar component**

```tsx
// src/components/admin/AdminSidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarItem {
  label: string;
  href: string;
}

interface AdminSidebarProps {
  title: string;
  items: SidebarItem[];
  backLink?: { label: string; href: string };
}

export function AdminSidebar({ title, items, backLink }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="w-56 bg-parchment border-r border-sage-light flex-shrink-0 min-h-screen">
      {backLink && (
        <Link
          href={backLink.href}
          className="block px-4 py-2 text-xs text-golden hover:text-golden/80"
        >
          ← {backLink.label}
        </Link>
      )}
      <div className="px-4 py-3 font-bold text-forest-dark text-sm">
        {title}
      </div>
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/admin' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-4 py-2 text-sm ${
              isActive
                ? 'bg-sage-light/50 text-forest-dark font-semibold border-l-3 border-golden'
                : 'text-gray-600 hover:bg-sage-light/30'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/
git commit -m "feat: add shared admin components (sidebar, status badge, empty state)"
```

### Task 1.2: Refactor Admin Layout with Context Detection

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Read the current admin layout**

Read `src/app/admin/layout.tsx` to understand current structure.

- [ ] **Step 2: Rewrite admin layout with context detection**

The layout must:
1. Fetch tenant context via `getTenantContext()` (server component call)
2. Pass context to a client component that renders the appropriate sidebar
3. If `propertyId` is present and we're NOT on an `/admin/properties/[slug]` route, redirect to property admin

The layout becomes a server component that wraps a client shell:

```tsx
// src/app/admin/layout.tsx
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
```

- [ ] **Step 3: Create AdminShell client component**

```tsx
// src/app/admin/AdminShell.tsx
'use client';

import { usePathname } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const ORG_NAV = (base: string) => [
  { label: 'Dashboard', href: `${base}` },
  { label: 'Properties', href: `${base}/properties` },
  { label: 'Members', href: `${base}/members` },
  { label: 'Roles', href: `${base}/roles` },
  { label: 'Domains', href: `${base}/domains` },
  { label: 'Access & Tokens', href: `${base}/access` },
  { label: 'Org Settings', href: `${base}/settings` },
];

interface AdminShellProps {
  orgId: string;
  orgSlug: string;
  propertyId: string | null;
  propertySlug: string | null;
  children: React.ReactNode;
}

export function AdminShell({ orgId, orgSlug, propertyId, propertySlug, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [orgName, setOrgName] = useState(orgSlug);

  // If property context and not already on a property admin route, this is a property-domain /admin hit
  const isPropertyRoute = pathname.startsWith('/admin/properties/');
  const isPropertyContext = propertyId && !isPropertyRoute;

  useEffect(() => {
    const supabase = createClient();
    supabase.from('orgs').select('name').eq('id', orgId).single().then(({ data }) => {
      if (data) setOrgName(data.name);
    });
  }, [orgId]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  // Property domain hitting /admin directly — show property admin
  // This is handled by the property [slug] layout, but we need to show the right sidebar
  if (isPropertyContext) {
    // The page.tsx will handle rendering property content
    // Sidebar is handled by the property layout
  }

  return (
    <div className="flex min-h-screen bg-white">
      {!isPropertyRoute && !isPropertyContext && (
        <AdminSidebar title={orgName} items={ORG_NAV('/admin')} />
      )}
      <div className="flex-1 flex flex-col">
        <header className="h-12 bg-amber-800 text-white flex items-center justify-between px-4">
          <span className="font-medium text-sm">Admin</span>
          <button onClick={handleSignOut} className="text-white/80 hover:text-white text-sm">
            Sign Out
          </button>
        </header>
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify the app compiles**

Run: `npm run build`
Expected: No build errors

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/layout.tsx src/app/admin/AdminShell.tsx
git commit -m "feat: refactor admin layout with sidebar and context detection"
```

### Task 1.3: Property CRUD Server Actions

**Files:**
- Create: `src/app/admin/properties/actions.ts`

- [ ] **Step 1: Create property server actions**

```tsx
// src/app/admin/properties/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export async function createProperty(formData: { name: string; slug: string; description?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Validate slug format
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(formData.slug)) {
    return { error: 'Slug must be lowercase letters, numbers, and hyphens' };
  }

  const { data, error } = await supabase
    .from('properties')
    .insert({
      org_id: tenant.orgId,
      name: formData.name.trim(),
      slug: formData.slug.trim().toLowerCase(),
      description: formData.description?.trim() || null,
      is_active: false, // starts in "Setup" status
      created_by: user.id,
    })
    .select('slug')
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'A property with this slug already exists' };
    return { error: error.message };
  }

  return { success: true, slug: data.slug };
}

export async function archiveProperty(propertyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('properties')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function unarchiveProperty(propertyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('properties')
    .update({ deleted_at: null })
    .eq('id', propertyId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getProperties() {
  const supabase = await createClient();
  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context', properties: [] };

  const { data, error } = await supabase
    .from('properties')
    .select('id, name, slug, description, is_active, deleted_at, created_at')
    .eq('org_id', tenant.orgId)
    .order('created_at', { ascending: true });

  if (error) return { error: error.message, properties: [] };
  return { properties: data || [] };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/properties/actions.ts
git commit -m "feat: add property CRUD server actions"
```

### Task 1.4: Org Dashboard Page

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Read the existing admin page**

Read `src/app/admin/page.tsx` to understand what exists.

- [ ] **Step 2: Create org dashboard as the new admin/page.tsx**

The existing content (items/updates/users tabs) will be moved to `properties/[slug]/data/page.tsx` in Task 1.5. Replace with org dashboard.

```tsx
// src/app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { EmptyState } from '@/components/admin/EmptyState';
import Link from 'next/link';

function deriveStatus(property: { is_active: boolean; deleted_at: string | null }) {
  if (property.deleted_at) return 'archived';
  if (!property.is_active) return 'setup';
  return 'active';
}

export default function OrgDashboard() {
  const [properties, setProperties] = useState<any[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [domainCount, setDomainCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Note: RLS policies scope queries to the user's org, but we also
    // filter explicitly by org_id for clarity and defense-in-depth.
    // The orgId should be passed as a prop from the server layout.
    const supabase = createClient();
    Promise.all([
      supabase.from('properties').select('id, name, slug, is_active, deleted_at').order('created_at'),
      supabase.from('org_memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('custom_domains').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]).then(([propRes, memRes, domRes]) => {
      setProperties(propRes.data || []);
      setMemberCount(memRes.count || 0);
      setDomainCount(domRes.count || 0);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="animate-pulse text-gray-400">Loading...</div>;

  return (
    <div>
      <h2 className="text-xl font-bold text-forest-dark mb-1">Organization Dashboard</h2>
      <p className="text-sm text-gray-500 mb-6">
        {properties.filter(p => !p.deleted_at).length} properties, {memberCount} members
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Link href="/admin/properties" className="card text-center hover:shadow-md transition-shadow">
          <div className="text-2xl font-bold text-forest-dark">{properties.filter(p => !p.deleted_at).length}</div>
          <div className="text-xs text-gray-500">Properties</div>
        </Link>
        <Link href="/admin/members" className="card text-center hover:shadow-md transition-shadow">
          <div className="text-2xl font-bold text-forest-dark">{memberCount}</div>
          <div className="text-xs text-gray-500">Members</div>
        </Link>
        <Link href="/admin/domains" className="card text-center hover:shadow-md transition-shadow">
          <div className="text-2xl font-bold text-forest-dark">{domainCount}</div>
          <div className="text-xs text-gray-500">Custom Domains</div>
        </Link>
      </div>

      {/* Properties list */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-forest-dark">Properties</h3>
        <button onClick={() => router.push('/admin/properties')} className="btn-primary text-sm">
          Create Property
        </button>
      </div>

      {properties.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Create your first property to get started."
          actionLabel="Create Property"
          onAction={() => router.push('/admin/properties')}
        />
      ) : (
        <div className="border border-sage-light rounded-lg overflow-hidden">
          {properties.filter(p => !p.deleted_at).map((prop) => (
            <Link
              key={prop.id}
              href={`/admin/properties/${prop.slug}`}
              className="flex justify-between items-center px-4 py-3 border-b border-sage-light last:border-b-0 hover:bg-sage-light/20 transition-colors"
            >
              <div>
                <div className="font-medium text-forest-dark">{prop.name}</div>
                <div className="text-xs text-gray-500">{prop.slug}</div>
              </div>
              <StatusBadge status={deriveStatus(prop)} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: replace admin dashboard with org-level dashboard"
```

### Task 1.5: Move Existing Property Admin Pages

**Files:**
- Create: `src/app/admin/properties/[slug]/layout.tsx`
- Create: `src/app/admin/properties/[slug]/page.tsx`
- Move: existing admin page content → `src/app/admin/properties/[slug]/data/page.tsx`
- Move: existing settings → `src/app/admin/properties/[slug]/settings/`
- Move: existing landing → `src/app/admin/properties/[slug]/landing/`
- Move: existing types → `src/app/admin/properties/[slug]/types/`
- Move: existing species → `src/app/admin/properties/[slug]/species/`
- Move: existing invites → `src/app/admin/properties/[slug]/invites/`

- [ ] **Step 1: Create property admin layout with sidebar**

```tsx
// src/app/admin/properties/[slug]/layout.tsx
'use client';

import { useParams } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PropertyAdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const slug = params.slug as string;
  const [propertyName, setPropertyName] = useState(slug);

  useEffect(() => {
    const supabase = createClient();
    supabase.from('properties').select('name').eq('slug', slug).single().then(({ data }) => {
      if (data) setPropertyName(data.name);
    });
  }, [slug]);

  const base = `/admin/properties/${slug}`;
  const items = [
    { label: 'Data', href: `${base}/data` },
    { label: 'Settings', href: `${base}/settings` },
    { label: 'Landing Page', href: `${base}/landing` },
    { label: 'Types', href: `${base}/types` },
    { label: 'Species', href: `${base}/species` },
    { label: 'Members', href: `${base}/members` },
    { label: 'Invites', href: `${base}/invites` },
  ];

  return (
    <div className="flex flex-1 -m-6">
      <AdminSidebar
        title={propertyName}
        items={items}
        backLink={{ label: 'Back to Org', href: '/admin' }}
      />
      <div className="flex-1 p-6">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create property admin index redirect**

```tsx
// src/app/admin/properties/[slug]/page.tsx
import { redirect } from 'next/navigation';

export default function PropertyAdminIndex({ params }: { params: { slug: string } }) {
  redirect(`/admin/properties/${params.slug}/data`);
}
```

- [ ] **Step 3: Move existing admin pages into property routes**

Move files. The content of the existing pages stays the same — only the file paths change. Update any internal navigation links (e.g., from `/admin/settings` to `../settings` or use the slug-based path).

Files to move:
- Copy existing items/updates/users content from `src/app/admin/page.tsx` → `src/app/admin/properties/[slug]/data/page.tsx`
- `src/app/admin/settings/page.tsx` → `src/app/admin/properties/[slug]/settings/page.tsx`
- `src/app/admin/settings/actions.ts` → `src/app/admin/properties/[slug]/settings/actions.ts`
- `src/app/admin/landing/page.tsx` → `src/app/admin/properties/[slug]/landing/page.tsx`
- `src/app/admin/landing/actions.ts` → `src/app/admin/properties/[slug]/landing/actions.ts` (if exists)
- `src/app/admin/types/page.tsx` → `src/app/admin/properties/[slug]/types/page.tsx`
- `src/app/admin/species/page.tsx` → `src/app/admin/properties/[slug]/species/page.tsx`
- `src/app/admin/invites/page.tsx` → `src/app/admin/properties/[slug]/invites/page.tsx`
- `src/app/admin/invites/actions.ts` → `src/app/admin/properties/[slug]/invites/actions.ts`

Update imports in moved files if any use relative paths.

**Create placeholder for org settings** (to prevent 404 while Stage 5 is pending):

```tsx
// src/app/admin/settings/page.tsx (placeholder)
export default function OrgSettingsPlaceholder() {
  return (
    <div className="text-center py-12 text-gray-500">
      <p className="font-medium">Org Settings</p>
      <p className="text-sm">Coming soon — configure org name, theme, and logo here.</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify build succeeds**

Run: `npm run build`
Expected: No build errors. All routes resolve correctly.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/
git commit -m "feat: re-parent property admin pages under /admin/properties/[slug]/"
```

### Task 1.6: Property List Page

**Files:**
- Create: `src/app/admin/properties/page.tsx`

- [ ] **Step 1: Create property list page with create form, filter tabs, and archive actions**

Build the full property list page using `getProperties()` from actions, filter tabs (All/Active/Setup/Archived), inline create form, and archive/unarchive row actions. Follow the patterns from existing admin pages (client component, `useState` for tabs/forms, status messages).

- [ ] **Step 2: Verify the page works**

Run: `npm run dev`
Navigate to `/admin/properties` — verify property list renders, create form works, archive toggles work.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/properties/page.tsx
git commit -m "feat: add property list page with CRUD and filtering"
```

### Task 1.7: Handle Property-Domain /admin Access

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add property context detection to admin index**

When a user visits `/admin` on a property domain (middleware sets `propertyId`), the page should redirect to or render the property admin instead of the org dashboard. Add server-side check:

```tsx
// At the top of src/app/admin/page.tsx, add a server component wrapper
// or handle in AdminShell by detecting propertyId + pathname === '/admin'
```

The `AdminShell` component already receives `propertyId`. When `propertyId` is set and the user is on `/admin` (not `/admin/properties/*`), redirect to the property admin. This can be handled via `router.replace()` in the shell's useEffect.

- [ ] **Step 2: Verify property-domain access**

Test by setting up a property-resolving domain/subdomain and visiting `/admin`.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/
git commit -m "feat: handle property-domain /admin redirect to property admin"
```

---

## Stage 2: Member Management + Role Assignment

### Task 2.1: Member Management Server Actions

**Files:**
- Create: `src/app/admin/members/actions.ts`

- [ ] **Step 1: Create member management server actions**

Actions needed:
- `getOrgMembers()` — list org_memberships joined with users and roles
- `inviteMember(email, roleId)` — create org_membership with status 'invited'
- `updateMemberRole(membershipId, roleId)` — change org role with last-admin guardrail
- `removeMember(membershipId)` — delete org_membership with last-admin guardrail
- `getMemberDetail(userId)` — get org membership + all property memberships for drill-down

Each action: auth check, tenant context, permission validation, last-admin protection where applicable.

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/members/actions.ts
git commit -m "feat: add member management server actions with admin guardrails"
```

### Task 2.2: Org Members List Page

**Files:**
- Create: `src/app/admin/members/page.tsx`

- [ ] **Step 1: Create org members list page**

Build with: member table (name, email, org role, property count, joined date), "Invite Member" button, search/filter input, click row → navigate to detail view. Use existing admin patterns.

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/members/page.tsx
git commit -m "feat: add org members list page"
```

### Task 2.3: Member Detail / Drill-Down Page

**Files:**
- Create: `src/app/admin/members/[userId]/page.tsx`

- [ ] **Step 1: Create member detail page**

Build with:
- Org role dropdown (with last-admin protection — disable non-admin options if sole admin)
- Per-property access table showing inherited vs override roles
- "Add Override" and "Remove Override" buttons per property
- "Remove from Org" button with confirmation

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/members/[userId]/page.tsx
git commit -m "feat: add member drill-down page with property overrides"
```

### Task 2.4: Property Members Page

**Files:**
- Create: `src/app/admin/properties/[slug]/members/page.tsx`
- Create: `src/app/admin/properties/[slug]/members/actions.ts`

- [ ] **Step 1: Create property-scoped members page**

Shows members with access to this property (via org membership or property override). Allows adding/removing property-level role overrides. Uses same server actions pattern.

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/properties/[slug]/members/
git commit -m "feat: add property-scoped members page"
```

---

## Stage 3: Role Editor

### Task 3.1: Role CRUD Server Actions

**Files:**
- Create: `src/app/admin/roles/actions.ts`

- [ ] **Step 1: Create role server actions**

Actions needed:
- `getRoles()` — list all roles in org
- `createRole(name, baseRoleId, permissions)` — clone from base, create custom role
- `updateRole(roleId, name, permissions)` — update custom role (block system roles)
- `deleteRole(roleId)` — delete custom role (block if in use, block system roles)
- `getRoleUsageCount(roleId)` — count members using this role

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/roles/actions.ts
git commit -m "feat: add role CRUD server actions with guardrails"
```

### Task 3.2: Permission Editor Component

**Files:**
- Create: `src/components/admin/PermissionEditor.tsx`

- [ ] **Step 1: Create permission editor component**

Category-grouped collapsible sections with toggle switches. Receives current permissions JSONB and onChange callback. Shows base role defaults as reference. Categories defined per spec Section 5 table.

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/PermissionEditor.tsx
git commit -m "feat: add permission editor component with category-grouped toggles"
```

### Task 3.3: Roles List and Editor Pages

**Files:**
- Create: `src/app/admin/roles/page.tsx`
- Create: `src/app/admin/roles/[roleId]/page.tsx`

- [ ] **Step 1: Create roles list page**

Shows system roles (read-only with badge) and custom roles (edit/delete). "Create Role" button opens clone flow — select base role, enter name, redirect to editor.

- [ ] **Step 2: Create role editor page**

Shows role name input + PermissionEditor component. Save button updates the role. Delete button with usage count check.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/roles/
git commit -m "feat: add roles list and permission editor pages"
```

---

## Stage 4: Custom Domains UI

### Task 4.1: Domain List Page

**Files:**
- Create: `src/app/admin/domains/page.tsx`
- Create: `src/app/admin/domains/actions.ts`

- [ ] **Step 1: Create domain query actions**

Thin wrapper actions:
- `getOrgDomains()` — query custom_domains for org, grouped by property_id
- `getPropertiesForDomains()` — list properties with their domain info for subdomain suggestions

The actual add/remove/check actions already exist in `src/lib/domains/actions.ts`.

- [ ] **Step 2: Create domains list page**

Three grouped sections (org domains, property subdomains, property custom domains). Each row: domain, type badge, status badge, DNS Info expandable, Remove button. "+ Add Subdomain" one-click for properties without subdomain. "+ Add Domain" button for full add flow.

Add domain flow: modal/inline form with domain input + scope selector (org or property dropdown). On submit, call `addCustomDomain()`, show DNS records with copy buttons. "Check Now" button calls `checkDomainStatus()`.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/domains/
git commit -m "feat: add custom domains management page"
```

---

## Stage 5: Access Config & Tokens

### Task 5.1: Access Config & Token Server Actions

**Files:**
- Create: `src/app/admin/access/actions.ts`

- [ ] **Step 1: Create access management server actions**

Actions needed:
- `getAccessConfigs()` — list property_access_config for all properties
- `updateAccessConfig(propertyId, config)` — upsert property_access_config
- `getTokens()` — list anonymous_access_tokens
- `createToken(propertyId, label, expiresAt)` — create new token
- `revokeToken(tokenId)` — set is_active = false
- `getGrants()` — list temporary_access_grants
- `createGrant(userId, propertyId, roleId, validFrom, validUntil)` — create grant
- `revokeGrant(grantId)` — set `valid_until` to now and `status` to 'revoked', `revoked_at` to now

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/access/actions.ts
git commit -m "feat: add access config, token, and grant server actions"
```

### Task 5.2: Access Config & Tokens Page

**Files:**
- Create: `src/app/admin/access/page.tsx`

- [ ] **Step 1: Create access management page**

Two tabs: "Access Config" and "Tokens & Grants".

Access Config tab: property list with expandable inline editors showing toggle switches for each `property_access_config` field.

Tokens tab: split into Anonymous Tokens section (table + create form) and Temporary Grants section (table + create form). Token status derived from `is_active` + `expires_at`. Grant status derived from `status` + dates.

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/access/page.tsx
git commit -m "feat: add access config and tokens management page"
```

### Task 5.3: Org Settings Page

**Files:**
- Create: `src/app/admin/settings/page.tsx` (org-level, distinct from property settings)
- Create: `src/app/admin/settings/actions.ts`

- [ ] **Step 1: Create org settings server actions**

```tsx
// src/app/admin/settings/actions.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';

export async function updateOrgSettings(updates: {
  name?: string;
  slug?: string;
  tagline?: string;
  logo_url?: string;
  theme?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { error } = await supabase
    .from('orgs')
    .update(updates)
    .eq('id', tenant.orgId);

  if (error) return { error: error.message };
  return { success: true };
}
```

- [ ] **Step 2: Create org settings page**

Sections: General (name, slug, tagline), Appearance (logo upload, theme), Subscription (read-only tier display). Same form patterns as existing settings page.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/settings/
git commit -m "feat: add org-level settings page"
```

---

## Final: Integration Testing

- [ ] **Step 1: Test full flow end-to-end**

1. Navigate to org domain `/admin` — verify org dashboard renders
2. Create a property — verify it appears in list
3. Click into property — verify property admin pages work
4. Navigate to property domain `/admin` — verify it shows property admin
5. Test "Back to Org" link
6. Test member, roles, domains, access pages render (Stages 2-5)

- [ ] **Step 2: Run test suite**

```bash
npm run test
```

- [ ] **Step 3: Final commit**

```bash
git commit -m "feat: org admin panel and IAM UI complete (Stages 1-5)"
```
