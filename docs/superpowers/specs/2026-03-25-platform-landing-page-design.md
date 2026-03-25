# Platform Landing Page Design

**Date:** 2026-03-25
**Status:** Draft
**Depends on:** Multi-tenancy backend (Phases 1–4B), Org Admin Panel (Stages 1–5)

## Overview

FieldMapper needs a platform-level landing page at its root domain that introduces the product, allows sign-ups (free trial), and provides sign-in for existing org accounts. This is distinct from org/property-level pages — it's the SaaS product page.

Today the root domain always resolves to an org context (default org fallback). This spec adds a new "platform" context to the tenant resolution system and builds the platform landing page, auth pages, and onboarding flow.

## Goals

1. New users can discover FieldMapper, sign up for a free trial, and create their first org
2. Existing users can sign in and be routed to their org
3. The platform has its own visual identity (indigo/blue) distinct from org themes
4. The existing org/property routing is completely unaffected

## Non-Goals

- Pricing tiers (see #41)
- Testimonials / social proof (see #42)
- Detailed feature pages (see #43)
- Blog / docs (see #44)
- Demo video (see #45)
- Payment / billing integration
- Multi-org user experience (user with multiple orgs — deferred)
- Password reset flow (add "Forgot password?" link later — Supabase supports `resetPasswordForEmail()`)
- Rate limiting / CAPTCHA on sign-up (rely on Supabase built-in rate limiting for now)

---

## 1. Routing & Tenant Resolution

### Signal 0: Platform Root

Add a new top-priority signal to `resolveTenant()` in `src/lib/tenant/resolve.ts`:

When `PLATFORM_DOMAIN` is set and the request hostname matches it **exactly** (no subdomain prefix), return a platform context.

**Type change:** The current `TenantContext` has non-nullable `orgId: string` and `orgSlug: string`. Rather than making these nullable (which would break all downstream consumers), use a discriminated union:

```typescript
interface OrgTenantContext {
  orgId: string;
  orgSlug: string;
  propertyId: string | null;
  propertySlug: string | null;
  source: 'custom_domain' | 'platform_subdomain' | 'default';
}

interface PlatformContext {
  orgId: null;
  orgSlug: null;
  propertyId: null;
  propertySlug: null;
  source: 'platform';
}

type TenantContext = OrgTenantContext | PlatformContext;
```

Downstream code can check `if (tenant.source === 'platform')` to narrow the type. All existing code paths that use `tenant.orgId` are guaranteed to be in org context (they run after the middleware short-circuits platform routes).

This takes priority over all existing signals.

Existing signals remain unchanged:
- Signal A: Custom domain lookup
- Signal B/C: Platform subdomain (e.g., `org-slug.fieldmapper.org`)
- Signal D: Default org fallback (still used for localhost without `PLATFORM_DOMAIN`)

### Platform Routes

```
/                → platform landing page (unauthenticated) or redirect (authenticated)
/signup          → sign-up form
/signin          → sign-in form
/onboard         → setup wizard in new-org mode (requires auth)
```

### Middleware Changes

In `src/lib/supabase/middleware.ts`, add a platform-context early return **immediately after tenant resolution** (before the QR redirect handler, setup-complete check, or any org-scoped logic):

```
// Step 0: Tenant resolution
const tenant = await resolveTenant(...)

// Step 0.5: Platform context — handle entirely here, then return
if (tenant?.source === 'platform') {
  // Refresh session (always)
  const { data: { user } } = await supabase.auth.getUser()

  const isPlatformAuthRoute = ['/signup', '/signin'].includes(pathname)
  const isOnboard = pathname === '/onboard' || pathname.startsWith('/onboard')
  const isRoot = pathname === '/'
  const isAuthCallback = pathname.startsWith('/api/auth/')

  if (isAuthCallback) → pass through
  if (isOnboard && !user) → redirect to /signup
  if (isOnboard && user) → pass through
  if (isPlatformAuthRoute) → pass through
  if (isRoot && !user) → pass through (show landing page)
  if (isRoot && user) → check org membership:
    - has org → redirect to org-slug.PLATFORM_DOMAIN
    - no org → redirect to /onboard

  // Set x-tenant-source header for downstream layout detection
  response.headers.set('x-tenant-source', 'platform')
  return response
}

// All existing org/property middleware logic follows unchanged
```

This early return ensures no org-scoped guards (setup-complete, admin check, temp user) run in platform context. The `x-tenant-source` header allows the root layout to detect platform context.

No changes to existing org/property middleware flows.

---

## 2. Platform Landing Page

**Route:** `/` (platform context only)

### Visual Identity

Own brand palette, distinct from the forest/sage org themes:
- Primary: `#4f46e5` (indigo-600)
- Primary light: `#6366f1` (indigo-500)
- Primary bg: `#eef2ff` (indigo-50)
- Text dark: `#111827` (gray-900)
- Text muted: `#6b7280` (gray-500)
- White backgrounds, clean typography

### Layout

**Top Navigation:**
- FieldMapper logo (indigo branded)
- Links: Features (anchor scroll), About (anchor scroll)
- Sign In button (outlined)
- Start Free Trial button (filled indigo)

**Hero Section:**
- Tagline badge: "Map. Track. Collaborate."
- Headline: "Field mapping for conservation teams"
- Description: Brief product summary
- Two CTA buttons: "Start Free Trial" (primary) + "Sign In" (secondary)
- Subtle gradient background (indigo-50 to white)

**Feature Highlights** — 3-column grid:

1. **AI-Powered Setup** — "Describe your project and our AI builds your workspace — item types, map configuration, landing page, and more. Fully customizable if you want to fine-tune." (Lead feature — selling point is quick automatic setup)
2. **Multi-Property Maps** — "Manage multiple sites under one organization. Each property gets its own interactive map, team, and custom domain."
3. **Team Collaboration** — "Invite volunteers, assign roles, grant temporary access for events, and share public dashboards."

**Bottom CTA Bar:**
- Indigo background
- "Ready to get started?" heading
- "Free trial — no credit card required." subtext
- "Create Your Account" button (white on indigo)

**Footer:**
- Minimal: copyright line ("2026 FieldMapper. Built for conservation teams.")

---

## 3. Sign-Up Page

**Route:** `/signup`

### Layout

Centered card on white background with platform nav (simplified — logo + "Sign In" link only).

### Form

1. **"Sign up with Google" button** — primary, at top. Uses `supabase.auth.signInWithOAuth({ provider: 'google' })` with redirect to `/onboard`
2. **Divider** — "or" text between OAuth and email form
3. **Email + password form:**
   - Email input
   - Password input (with minimum length hint)
   - "Start Free Trial" submit button
   - Uses `supabase.auth.signUp({ email, password })`
4. **Footer link:** "Already have an account? Sign in"

### Post-Sign-Up

- Email/password: Supabase sends verification email. Show "Check your email" confirmation message. The Supabase email verification link should be configured to redirect to `/api/auth/callback?context=platform` (set via `emailRedirectTo` in the `signUp` options). The callback then checks org membership and redirects to `/onboard`.
- Google OAuth: No verification needed. Redirect directly to `/onboard` via callback (OAuth redirect URL includes `?context=platform`).

### Auth Callback

Reuse existing `/api/auth/callback` route. The callback needs to distinguish platform vs org context to redirect correctly. Pass a `context` query parameter in the OAuth redirect URL:

- Platform sign-up/sign-in: `redirectTo: '/api/auth/callback?context=platform'`
- Org sign-in (existing): `redirectTo: '/api/auth/callback'` (no context param, defaults to org)

In the callback route:
- If `context=platform`: check org membership → redirect to `/onboard` (no org) or org subdomain (has org)
- If no context param: redirect to `/manage` (existing behavior)

---

## 4. Sign-In Page

**Route:** `/signin`

### Layout

Same centered card layout as sign-up.

### Form

1. **"Sign in with Google" button**
2. **Divider**
3. **Email + password form** — uses `supabase.auth.signInWithPassword()`
4. **Footer link:** "Don't have an account? Start free trial"

### Relationship to Existing `/login`

The existing `/login` page at `src/app/login/page.tsx` remains for org-context authentication. When the middleware redirects an unauthenticated user from `/manage` or `/admin`, it redirects to `/login` (org context). The new `/signin` is for platform context only.

Summary:
- `/login` — org-context sign-in (existing, unchanged, uses org theme)
- `/signin` — platform-context sign-in (new, uses indigo theme)
- Middleware in org context redirects to `/login`; platform context redirects to `/signin`

### Post-Sign-In

Check the user's org memberships:
- **Has active org membership** → redirect to org's platform subdomain + `/manage` (e.g., `org-slug.fieldmapper.org/manage`). Use the first active org membership (multi-org selection is deferred per non-goals). Set `users.last_active_org_id` during onboarding so it's available for future multi-org support.
- **No org membership** → redirect to `/onboard`

---

## 5. Onboarding: Setup Wizard "New Org" Mode

**Route:** `/onboard`

### Guard

- Requires authentication → redirect to `/signup` if not logged in
- If user already has an active org membership → redirect to their org

### Reuse Strategy

Reuse the existing setup wizard component (`src/app/setup/page.tsx`) with a `mode` parameter. The wizard detects mode from the route or a prop:
- **`mode: 'initial'`** (existing) — first-time instance setup, includes admin account creation
- **`mode: 'new-org'`** (new) — authenticated user creating a new org, skips admin step

### Steps (New Org Mode)

1. **welcome** — "Let's set up your organization" (different copy from initial setup)
2. **name** — Org name, org slug (auto-derived from name, editable — used for subdomain: `slug.fieldmapper.org`), tagline, location name, map center/zoom
3. **theme** — Color preset picker
4. **custommap** — Optional custom map overlay (skippable)
5. **items** — Define item types (at least one required)
6. **about** — About page content (markdown)
7. **review** — Summary and "Launch" button

The **admin** step from the initial wizard is skipped — the user is already authenticated.

### On Launch

1. Insert new `orgs` row with `setup_complete = true`
2. Insert default `properties` row under the new org
3. Insert `org_membership` for the current user with org_admin role
4. Seed the 4 system roles for the new org (org_admin, org_staff, contributor, viewer)
5. Insert item types defined in the wizard
6. Generate default landing page for the property
7. Redirect to `org-slug.fieldmapper.org/admin` (or `/admin` on the platform domain with org context for now)

### Server Actions

New server actions for org creation (or extend existing setup actions):
- `onboardCreateOrg(config)` — creates org + default property + membership + roles + item types + landing page in one transaction-like flow
- Reuse `setupSaveLandingPage()` for landing page generation

---

## 6. File Structure

```
src/app/(platform)/                  — route group (own layout, no URL impact)
  layout.tsx                         — platform layout (indigo theme, PlatformNav)
  page.tsx                           — landing page
  signup/page.tsx                    — sign-up form
  signin/page.tsx                    — sign-in form
  onboard/page.tsx                   — setup wizard in new-org mode

src/components/platform/
  PlatformNav.tsx                    — top nav (logo, links, auth buttons)
  PlatformFooter.tsx                 — minimal footer

src/lib/tenant/resolve.ts            — modify: add 'platform' to source type, add Signal 0
src/lib/supabase/middleware.ts       — modify: handle platform context routes
```

### Route Group Behavior

The `(platform)` parenthesized directory is a Next.js App Router route group. Pages inside use `/` URLs (not `/(platform)/`) and have their own nested `layout.tsx`.

**Important:** Route groups still inherit the root `layout.tsx`. The root layout currently wraps everything with `ConfigProvider`, `UserLocationProvider`, and `Navigation`, and both the layout body and `generateMetadata()` call `getConfig()` which queries the `orgs` table. In platform context there's no org, so this will fail.

**Fix: Make the root layout conditional.** The root layout is a server component that can read the `x-tenant-source` header (injected by middleware):

```typescript
// src/app/layout.tsx
import { headers } from 'next/headers';

export async function generateMetadata() {
  const headersList = await headers();
  if (headersList.get('x-tenant-source') === 'platform') {
    return { title: 'FieldMapper', description: 'Field mapping for conservation teams' };
  }
  const config = await getConfig();
  // ... existing org metadata
}

export default async function RootLayout({ children }) {
  const headersList = await headers();
  const isPlatform = headersList.get('x-tenant-source') === 'platform';

  if (isPlatform) {
    // Platform context: no ConfigProvider, no org Navigation
    // The (platform)/layout.tsx handles its own nav and theme
    return (
      <html lang="en"><body>{children}</body></html>
    );
  }

  // Existing org context layout (ConfigProvider, Navigation, etc.)
  const config = await getConfig();
  // ... existing code
}
```

This keeps the `(platform)` route group fully self-contained with its own nav, theme, and layout.

---

## 7. Data Model

No new tables or migrations needed. The onboarding flow uses existing tables:

| Table | Usage |
|-------|-------|
| `auth.users` | Created by Supabase auth during sign-up |
| `users` | Created by `handle_new_user()` trigger |
| `orgs` | Created during onboard launch |
| `properties` | Default property created during onboard |
| `roles` | 4 system roles seeded per org |
| `org_memberships` | Links user to new org as org_admin |
| `item_types` | Created from wizard item types step |

---

## 8. Implementation Stages

### Stage 1: Tenant Resolution + Middleware
- Add `'platform'` source to TenantContext
- Implement Signal 0 in resolveTenant()
- Handle platform routes in middleware
- Conditional root layout (skip ConfigProvider for platform context)

### Stage 2: Platform Landing Page
- `(platform)` route group with layout
- PlatformNav and PlatformFooter components
- Landing page with hero, AI onboarding feature highlight, feature grid, CTA bar

### Stage 3: Auth Pages
- Sign-up page (email/password + Google OAuth)
- Sign-in page (email/password + Google OAuth)
- Post-auth routing (check org membership, redirect accordingly)
- Modify auth callback for platform context

### Stage 4: Onboarding Flow
- Setup wizard "new org" mode
- `onboardCreateOrg()` server action
- Org + property + membership + roles + item types creation
- Redirect to org admin after launch
