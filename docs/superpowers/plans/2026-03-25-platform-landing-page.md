# Platform Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FieldMapper platform landing page at the root domain with sign-up, sign-in, and org onboarding flow.

**Architecture:** New "platform" tenant context (Signal 0) in the resolution hierarchy short-circuits middleware before any org-scoped logic. A `(platform)` Next.js route group with its own layout provides the indigo-branded landing, auth, and onboarding pages. The root layout conditionally skips ConfigProvider when in platform context.

**Tech Stack:** Next.js 15 App Router, Supabase Auth (email/password + Google OAuth), Tailwind CSS (indigo palette), existing setup wizard (reused in new-org mode).

**Spec:** `docs/superpowers/specs/2026-03-25-platform-landing-page-design.md`

---

## File Structure Overview

### Stage 1: Tenant Resolution + Middleware
- `src/lib/tenant/resolve.ts` — **Modify**: Add `PlatformContext` type, `OrgTenantContext` type, update `TenantContext` union, add Signal 0
- `src/lib/tenant/server.ts` — **Modify**: Handle platform context (null orgId)
- `src/lib/supabase/middleware.ts` — **Modify**: Add platform early return after tenant resolution
- `src/app/layout.tsx` — **Modify**: Conditional rendering based on `x-tenant-source` header

### Stage 2: Platform Landing Page
- `src/app/(platform)/layout.tsx` — Platform layout (indigo theme, system fonts)
- `src/app/(platform)/page.tsx` — Landing page (hero, features, CTAs)
- `src/components/platform/PlatformNav.tsx` — Top navigation
- `src/components/platform/PlatformFooter.tsx` — Minimal footer

### Stage 3: Auth Pages
- `src/app/(platform)/signup/page.tsx` — Sign-up form
- `src/app/(platform)/signin/page.tsx` — Sign-in form
- `src/app/api/auth/callback/route.ts` — **Modify**: Handle `context=platform` param

### Stage 4: Onboarding Flow
- `src/app/(platform)/onboard/page.tsx` — Setup wizard in new-org mode
- `src/app/(platform)/onboard/actions.ts` — `onboardCreateOrg()` server action

---

## Stage 1: Tenant Resolution + Middleware

### Task 1.1: Update TenantContext Type and Add Signal 0

**Files:**
- Modify: `src/lib/tenant/resolve.ts`

- [ ] **Step 1: Read the current file**

Read `src/lib/tenant/resolve.ts` to understand the current `TenantContext` interface and `resolveTenant()` function.

- [ ] **Step 2: Update TenantContext to discriminated union**

Replace the current `TenantContext` interface with:

```typescript
export interface OrgTenantContext {
  orgId: string;
  orgSlug: string;
  propertyId: string | null;
  propertySlug: string | null;
  source: 'custom_domain' | 'platform_subdomain' | 'default';
}

export interface PlatformContext {
  orgId: null;
  orgSlug: null;
  propertyId: null;
  propertySlug: null;
  source: 'platform';
}

export type TenantContext = OrgTenantContext | PlatformContext;
```

- [ ] **Step 3: Add Signal 0 at the top of resolveTenant()**

Before existing Signal A (custom domain lookup), add:

```typescript
// Signal 0: Platform root — exact match on PLATFORM_DOMAIN with no subdomain
const platformDomain = process.env.PLATFORM_DOMAIN;
if (platformDomain && hostname === platformDomain) {
  return {
    orgId: null,
    orgSlug: null,
    propertyId: null,
    propertySlug: null,
    source: 'platform' as const,
  };
}
```

This must go BEFORE the existing `if (platformDomain && ...)` check in Signal B/C that handles subdomains.

- [ ] **Step 4: Verify existing tests still pass**

Run: `npm run test`

- [ ] **Step 5: Commit**

```bash
git add src/lib/tenant/resolve.ts
git commit -m "feat: add platform context to tenant resolution (Signal 0)"
```

### Task 1.2: Update Server-Side Tenant Context Reader

**Files:**
- Modify: `src/lib/tenant/server.ts`

- [ ] **Step 1: Read the current file**

The current `getTenantContext()` uses non-null assertions for orgId/orgSlug. In platform context these headers won't be set.

- [ ] **Step 2: Update to handle platform context**

```typescript
import { headers } from 'next/headers';

export async function getTenantContext() {
  const h = await headers();
  const source = h.get('x-tenant-source');

  if (source === 'platform') {
    return {
      orgId: null as null,
      orgSlug: null as null,
      propertyId: null,
      propertySlug: null,
      source: 'platform' as const,
    };
  }

  return {
    orgId: h.get('x-org-id')!,
    orgSlug: h.get('x-org-slug')!,
    propertyId: h.get('x-property-id'),
    propertySlug: h.get('x-property-slug'),
    source: (h.get('x-tenant-source') || 'default') as 'custom_domain' | 'platform_subdomain' | 'default',
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tenant/server.ts
git commit -m "feat: handle platform context in getTenantContext()"
```

### Task 1.3: Add Platform Middleware Early Return

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Read the current middleware**

Read `src/lib/supabase/middleware.ts` — the `updateSession()` function. Understand the step order: tenant resolution → header injection → QR redirect → setup check → session refresh → auth checks.

- [ ] **Step 2: Add platform early return after tenant resolution**

Insert this block **immediately after the `if (!tenant)` null-check/rewrite block (~line 51) and BEFORE the header injection at ~line 53** (`supabaseResponse.headers.set('x-org-id', tenant.orgId)`). This is critical — if placed after header injection, `tenant.orgId` will be `null` and crash:

```typescript
// Platform context — handle entirely here, then return
if (tenant?.source === 'platform') {
  // Refresh session
  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPlatformAuthRoute = ['/signup', '/signin'].includes(pathname);
  const isOnboard = pathname === '/onboard' || pathname.startsWith('/onboard');
  const isRoot = pathname === '/';
  const isAuthCallback = pathname.startsWith('/api/auth/');
  const isStaticAsset = pathname.startsWith('/_next/') || pathname.startsWith('/favicon');

  // Always pass through static assets and auth callbacks
  if (isStaticAsset || isAuthCallback) {
    supabaseResponse.headers.set('x-tenant-source', 'platform');
    return supabaseResponse;
  }

  // Onboard requires auth
  if (isOnboard && !user) {
    return NextResponse.redirect(new URL('/signup', request.url));
  }

  // Authenticated user on root — route to org or onboard
  if (isRoot && user) {
    const { data: membership } = await supabase
      .from('org_memberships')
      .select('orgs(slug)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (membership?.orgs?.slug) {
      const platformDomain = process.env.PLATFORM_DOMAIN;
      return NextResponse.redirect(
        new URL(`https://${membership.orgs.slug}.${platformDomain}/manage`)
      );
    }
    return NextResponse.redirect(new URL('/onboard', request.url));
  }

  // All other platform routes (/, /signup, /signin, /onboard with auth) — pass through
  supabaseResponse.headers.set('x-tenant-source', 'platform');
  return supabaseResponse;
}
```

Also add `'platform'` to the `x-tenant-source` header alongside existing org headers after this block (the existing header injection section should also set `x-tenant-source` to the tenant's source value for the root layout to read).

- [ ] **Step 3: Add x-tenant-source header for org context too**

In the existing header injection section (after tenant resolution for org context), add:

```typescript
supabaseResponse.headers.set('x-tenant-source', tenant.source);
```

This lets the root layout distinguish platform vs org context.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat: add platform middleware early return with auth routing"
```

### Task 1.4: Conditional Root Layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Read the current root layout**

Read `src/app/layout.tsx` — understand how `getConfig()`, `ConfigProvider`, `Navigation`, and theme CSS vars are set up.

- [ ] **Step 2: Add platform context detection and conditional rendering**

Import `headers` from `next/headers`. In both `generateMetadata()` and `RootLayout`, check the `x-tenant-source` header:

```typescript
import { headers } from 'next/headers';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  if (headersList.get('x-tenant-source') === 'platform') {
    return {
      title: 'FieldMapper — Field mapping for conservation teams',
      description: 'Track nest boxes, wildlife stations, and field assets. Interactive maps, team collaboration, and public dashboards.',
    };
  }
  // Existing org metadata logic
  const config = await getConfig();
  return { title: config.siteName, description: config.tagline };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const isPlatform = headersList.get('x-tenant-source') === 'platform';

  if (isPlatform) {
    return (
      <html lang="en">
        <body className="antialiased">{children}</body>
      </html>
    );
  }

  // Existing org layout with ConfigProvider, Navigation, theme CSS vars
  const config = await getConfig();
  // ... rest of existing code unchanged
}
```

- [ ] **Step 3: Verify the app builds**

Run: `npm run build` (or `npx tsc --noEmit`)

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: conditional root layout for platform vs org context"
```

---

## Stage 2: Platform Landing Page

### Task 2.1: Platform Layout and Components

**Files:**
- Create: `src/app/(platform)/layout.tsx`
- Create: `src/components/platform/PlatformNav.tsx`
- Create: `src/components/platform/PlatformFooter.tsx`

- [ ] **Step 1: Create PlatformNav component**

```tsx
// src/components/platform/PlatformNav.tsx
'use client';

import Link from 'next/link';

interface PlatformNavProps {
  minimal?: boolean; // For auth pages — just logo + one link
}

export function PlatformNav({ minimal }: PlatformNavProps) {
  return (
    <nav className="flex justify-between items-center px-6 md:px-10 py-4 border-b border-gray-200">
      <Link href="/" className="text-xl font-bold">
        <span className="text-indigo-500">Field</span>
        <span className="text-indigo-700">Mapper</span>
      </Link>
      {minimal ? (
        <Link href="/signin" className="text-sm text-gray-600 hover:text-gray-900">
          Sign In
        </Link>
      ) : (
        <div className="flex gap-6 items-center">
          <a href="#features" className="text-sm text-gray-500 hover:text-gray-900 hidden md:inline">
            Features
          </a>
          <Link
            href="/signin"
            className="text-sm px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="text-sm px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            Start Free Trial
          </Link>
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Create PlatformFooter component**

```tsx
// src/components/platform/PlatformFooter.tsx
export function PlatformFooter() {
  return (
    <footer className="py-6 px-10 text-center text-sm text-gray-400 border-t border-gray-200">
      &copy; {new Date().getFullYear()} FieldMapper. Built for conservation teams.
    </footer>
  );
}
```

- [ ] **Step 3: Create platform layout**

The layout is a minimal shell — it does NOT include PlatformNav or PlatformFooter. Each page renders its own nav variant (full nav on landing page, minimal nav on auth pages). This avoids double-wrapping issues.

```tsx
// src/app/(platform)/layout.tsx
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white font-sans antialiased">
      {children}
    </div>
  );
}
```

Each page is responsible for rendering `<PlatformNav />` (or `<PlatformNav minimal />`) and `<PlatformFooter />` directly.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(platform\)/layout.tsx src/components/platform/
git commit -m "feat: add platform layout, nav, and footer components"
```

### Task 2.2: Platform Landing Page

**Files:**
- Create: `src/app/(platform)/page.tsx`

- [ ] **Step 1: Create the landing page**

Build the landing page with:
- Hero section with tagline badge, headline, description, two CTA buttons
- Feature highlights (3-column grid): AI-Powered Setup, Multi-Property Maps, Team Collaboration
- Bottom CTA bar (indigo background)

Use Tailwind classes — indigo palette (`bg-indigo-600`, `text-indigo-500`, `bg-indigo-50`, etc.). All links to `/signup` and `/signin`.

The page should be a server component (no client interactivity needed). Use `Link` from `next/link` for internal navigation.

- [ ] **Step 2: Verify it renders**

Run: `npm run dev`
Set `PLATFORM_DOMAIN` to match your dev hostname. Visit the root URL.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(platform\)/page.tsx
git commit -m "feat: add platform landing page with hero and features"
```

---

## Stage 3: Auth Pages

### Task 3.1: Sign-Up Page

**Files:**
- Create: `src/app/(platform)/signup/page.tsx`

- [ ] **Step 1: Create the sign-up page**

'use client' component with:
- Centered card layout (max-w-md mx-auto, white card with shadow)
- "Start your free trial" heading
- "Sign up with Google" button — calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/api/auth/callback?context=platform` } })`
- Divider ("or" text with lines)
- Email + password form — calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/api/auth/callback?context=platform` } })`
- On email signup success: show "Check your email for a verification link" message
- Error display for validation/auth errors
- "Already have an account? Sign in" link to `/signin`
- Loading states on buttons

Import `createClient` from `@/lib/supabase/client` (SYNCHRONOUS).

Since the platform layout is a minimal shell (no nav/footer baked in), the sign-up page renders `<PlatformNav minimal />` and `<PlatformFooter />` directly in its JSX.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(platform\)/signup/
git commit -m "feat: add platform sign-up page with Google OAuth and email/password"
```

### Task 3.2: Sign-In Page

**Files:**
- Create: `src/app/(platform)/signin/page.tsx`

- [ ] **Step 1: Create the sign-in page**

Very similar to sign-up but:
- "Welcome back" heading
- Uses `supabase.auth.signInWithPassword({ email, password })` for email login
- Uses `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/api/auth/callback?context=platform` } })` for Google
- On successful email login: check org membership client-side, redirect to org subdomain or `/onboard`
- "Don't have an account? Start free trial" link to `/signup`

Post-sign-in redirect: after `signInWithPassword` success, redirect to `/` via `window.location.href = '/'`. The middleware handles the org membership check and redirects to the org subdomain or `/onboard`. This avoids needing `NEXT_PUBLIC_PLATFORM_DOMAIN` on the client for the sign-in flow.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(platform\)/signin/
git commit -m "feat: add platform sign-in page"
```

### Task 3.3: Modify Auth Callback for Platform Context

**Files:**
- Modify: `src/app/api/auth/callback/route.ts`

- [ ] **Step 1: Read the current callback**

Read `src/app/api/auth/callback/route.ts` — currently exchanges code and redirects to `next` param or `/manage`.

- [ ] **Step 2: Add platform context handling**

After exchanging the code, check the `context` query param:

```typescript
const context = requestUrl.searchParams.get('context');
const next = requestUrl.searchParams.get('next') ?? '/manage';

if (!error) {
  if (context === 'platform') {
    // Check if user has an org — redirect to org or onboard
    const { data: membership } = await supabase
      .from('org_memberships')
      .select('orgs(slug)')
      .eq('user_id', (await supabase.auth.getUser()).data.user!.id)
      .eq('status', 'active')
      .limit(1)
      .single();

    if (membership?.orgs?.slug) {
      const platformDomain = process.env.PLATFORM_DOMAIN;
      return NextResponse.redirect(
        new URL(`https://${membership.orgs.slug}.${platformDomain}/manage`)
      );
    }
    return NextResponse.redirect(new URL('/onboard', requestUrl.origin));
  }
  // Existing behavior — redirect to next (default /manage)
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
```

On error with platform context, redirect to `/signin?error=auth` instead of `/login?error=auth`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/callback/route.ts
git commit -m "feat: handle platform context in auth callback routing"
```

---

## Stage 4: Onboarding Flow

### Task 4.1: Onboard Server Action

**Files:**
- Create: `src/app/(platform)/onboard/actions.ts`

- [ ] **Step 1: Read existing setup actions for patterns**

Read `src/app/setup/actions.ts` to understand how the existing setup creates orgs, item types, and landing pages. Note function signatures for `setupSaveConfig`, `setupCreateItemType`, `setupSaveLandingPage`.

- [ ] **Step 2: Create onboardCreateOrg server action**

```tsx
// src/app/(platform)/onboard/actions.ts
'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

interface OnboardConfig {
  orgName: string;
  orgSlug: string;
  tagline: string;
  locationName: string;
  lat: number;
  lng: number;
  zoom: number;
  themePreset: string;
  overlayConfig?: any;
  itemTypes: Array<{ name: string; icon: string; color: string }>;
  aboutContent: string;
}

export async function onboardCreateOrg(config: OnboardConfig) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const serviceClient = createServiceClient();

  // 1. Create org
  const { data: org, error: orgError } = await serviceClient
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
    if (orgError.code === '23505') return { error: 'An org with this slug already exists' };
    return { error: orgError.message };
  }

  // 2. Create default property
  const { data: property, error: propError } = await serviceClient
    .from('properties')
    .insert({
      org_id: org.id,
      name: config.locationName || config.orgName,
      slug: 'default',
      description: config.tagline,
      map_default_lat: config.lat,
      map_default_lng: config.lng,
      map_default_zoom: config.zoom,
      about_content: config.aboutContent,
      custom_map: config.overlayConfig || null,
      is_active: true,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (propError) return { error: propError.message };

  // Set default property on org
  await serviceClient
    .from('orgs')
    .update({ default_property_id: property.id })
    .eq('id', org.id);

  // 3. Seed system roles
  const systemRoles = [
    { name: 'Admin', base_role: 'org_admin', sort_order: 1 },
    { name: 'Staff', base_role: 'org_staff', sort_order: 2 },
    { name: 'Contributor', base_role: 'contributor', sort_order: 3 },
    { name: 'Viewer', base_role: 'viewer', sort_order: 4 },
  ];

  const { data: roles } = await serviceClient
    .from('roles')
    .insert(systemRoles.map(r => ({
      org_id: org.id,
      name: r.name,
      base_role: r.base_role,
      is_system_role: true,
      sort_order: r.sort_order,
      permissions: getDefaultPermissions(r.base_role),
    })))
    .select('id, base_role');

  // 4. Create org_membership for user as org_admin
  const adminRole = roles?.find(r => r.base_role === 'org_admin');
  if (adminRole) {
    await serviceClient.from('org_memberships').insert({
      org_id: org.id,
      user_id: user.id,
      role_id: adminRole.id,
      status: 'active',
      is_primary_org: true,
    });
  }

  // 5. Set last_active_org_id on user
  await serviceClient
    .from('users')
    .update({ last_active_org_id: org.id })
    .eq('id', user.id);

  // 6. Create item types
  for (const itemType of config.itemTypes) {
    await serviceClient.from('item_types').insert({
      org_id: org.id,
      name: itemType.name,
      icon: itemType.icon,
      color: itemType.color,
    });
  }

  // 7. Generate default landing page
  // Reuse the landing page generation logic from setup
  const { createDefaultLandingPage } = await import('@/lib/config/landing-defaults');
  const landingPage = createDefaultLandingPage(
    config.orgName,
    config.tagline,
    config.locationName,
    false
  );
  await serviceClient
    .from('properties')
    .update({ landing_page: landingPage })
    .eq('id', property.id);

  return { success: true, orgSlug: org.slug };
}

function getDefaultPermissions(baseRole: string) {
  // Return the default JSONB permissions for each base role
  // Copy from migration 008 seed data or existing setup logic
  const defaults: Record<string, any> = {
    org_admin: {
      org: { manage_settings: true, manage_members: true, manage_billing: true, manage_roles: true, view_audit_log: true },
      properties: { create: true, manage_all: true, view_all: true },
      items: { view: true, create: true, edit_any: true, edit_assigned: true, delete: true },
      updates: { view: true, create: true, edit_own: true, edit_any: true, delete: true, approve_public_submissions: true },
      tasks: { view_assigned: true, view_all: true, create: true, assign: true, complete: true },
      attachments: { upload: true, delete_own: true, delete_any: true },
      reports: { view: true, export: true },
      modules: { tasks: true, volunteers: true, public_forms: true, qr_codes: true, reports: true },
    },
    org_staff: {
      org: { manage_settings: false, manage_members: false, manage_billing: false, manage_roles: false, view_audit_log: false },
      properties: { create: false, manage_all: false, view_all: true },
      items: { view: true, create: true, edit_any: true, edit_assigned: true, delete: false },
      updates: { view: true, create: true, edit_own: true, edit_any: true, delete: false, approve_public_submissions: false },
      tasks: { view_assigned: true, view_all: true, create: true, assign: false, complete: true },
      attachments: { upload: true, delete_own: true, delete_any: false },
      reports: { view: true, export: false },
      modules: { tasks: true, volunteers: false, public_forms: false, qr_codes: true, reports: true },
    },
    contributor: {
      org: { manage_settings: false, manage_members: false, manage_billing: false, manage_roles: false, view_audit_log: false },
      properties: { create: false, manage_all: false, view_all: false },
      items: { view: true, create: true, edit_any: false, edit_assigned: true, delete: false },
      updates: { view: true, create: true, edit_own: true, edit_any: false, delete: false, approve_public_submissions: false },
      tasks: { view_assigned: true, view_all: false, create: false, assign: false, complete: true },
      attachments: { upload: true, delete_own: true, delete_any: false },
      reports: { view: false, export: false },
      modules: { tasks: true, volunteers: false, public_forms: false, qr_codes: false, reports: false },
    },
    viewer: {
      org: { manage_settings: false, manage_members: false, manage_billing: false, manage_roles: false, view_audit_log: false },
      properties: { create: false, manage_all: false, view_all: false },
      items: { view: true, create: false, edit_any: false, edit_assigned: false, delete: false },
      updates: { view: true, create: false, edit_own: false, edit_any: false, delete: false, approve_public_submissions: false },
      tasks: { view_assigned: true, view_all: false, create: false, assign: false, complete: false },
      attachments: { upload: false, delete_own: false, delete_any: false },
      reports: { view: true, export: false },
      modules: { tasks: false, volunteers: false, public_forms: false, qr_codes: false, reports: false },
    },
  };
  return defaults[baseRole] || defaults.viewer;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(platform\)/onboard/actions.ts
git commit -m "feat: add onboardCreateOrg server action for new org creation"
```

### Task 4.2: Onboard Page (Setup Wizard New-Org Mode)

**Files:**
- Create: `src/app/(platform)/onboard/page.tsx`

- [ ] **Step 1: Read the existing setup wizard**

Read `src/app/setup/page.tsx` fully to understand the step structure, form state, validation, and UI patterns.

- [ ] **Step 2: Create the onboard page**

Create a new-org mode wizard that reuses the same step-by-step pattern but:
- Steps: welcome, name (with org slug field), theme, custommap, items, about, review (7 steps — no admin step)
- Welcome copy: "Let's set up your organization"
- Name step: adds org slug field (auto-derived from org name, editable) with hint: "Your site will be at slug.fieldmapper.org"
- On launch: calls `onboardCreateOrg()` with all collected config
- On success: redirects to `org-slug.PLATFORM_DOMAIN/admin` (use `window.location.href` for cross-domain redirect)

This can be a standalone component that copies the setup wizard pattern (not importing the setup page directly, since the setup page is tightly coupled to its route/actions). Reuse any extracted step components if they exist, otherwise build self-contained.

- [ ] **Step 3: Add onboard guard**

The onboard page should check on mount:
- If user is not authenticated → middleware handles redirect to /signup
- If user already has an org → redirect to their org (client-side check)

```typescript
useEffect(() => {
  const supabase = createClient();
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return; // middleware handles this
    supabase
      .from('org_memberships')
      .select('orgs(slug)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.orgs?.slug) {
          window.location.href = `https://${data.orgs.slug}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN}/admin`;
        } else {
          setReady(true);
        }
      });
  });
}, []);
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(platform\)/onboard/
git commit -m "feat: add onboard page with new-org setup wizard"
```

---

## Environment Variables

Add to `.env.local` (and document):

```
PLATFORM_DOMAIN=fieldmapper.org        # or localhost:3000 for dev
NEXT_PUBLIC_PLATFORM_DOMAIN=fieldmapper.org  # client-side access for redirects
```

The `PLATFORM_DOMAIN` is already used by tenant resolution. `NEXT_PUBLIC_PLATFORM_DOMAIN` is new — needed for client-side cross-domain redirects in sign-in and onboard flows.
