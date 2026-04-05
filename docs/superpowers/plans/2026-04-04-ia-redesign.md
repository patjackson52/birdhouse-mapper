# IA Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the app's information architecture into three context-scoped shells (Property, Org, User) with new URL structure (`/p/[slug]/*`, `/org/*`, `/account/*`), mobile-first bottom tabs per context, and clean context switching.

**Architecture:** Thin new route pages import existing page components from the current `/admin` and `/manage` trees. New layout shells (OrgShell, PropertyAdminLayout, FieldModeLayout) replace the monolithic AdminShell. A shared ContextBar component provides breadcrumb navigation. Old routes redirect to new ones via Next.js middleware rewrites and redirect pages.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase, TanStack Query

**Spec:** `docs/superpowers/specs/2026-04-04-ia-redesign-design.md`

---

## File Structure

### New Files

```
src/components/layout/ContextBar.tsx          — Breadcrumb nav (Org > Property), context switching
src/components/layout/AvatarMenu.tsx          — User avatar dropdown (profile, notifications, sign out)
src/components/layout/MobileBottomTabs.tsx    — Reusable bottom tab bar component
src/components/layout/OrgShell.tsx            — Org admin shell (sidebar + context bar + mobile drawer)
src/components/layout/PropertyAdminShell.tsx  — Property admin shell (sidebar + context bar)
src/components/layout/FieldModeShell.tsx      — Field mode shell (top bar + bottom tabs)

src/app/org/layout.tsx                        — Server layout, tenant guard, wraps OrgShell
src/app/org/page.tsx                          — Org dashboard (re-exports existing)
src/app/org/properties/page.tsx               — Properties list
src/app/org/members/page.tsx                  — Org members
src/app/org/members/[userId]/page.tsx         — Edit member
src/app/org/roles/page.tsx                    — Roles
src/app/org/roles/[roleId]/page.tsx           — Edit role
src/app/org/types/page.tsx                    — Item types (moved from property level)
src/app/org/entity-types/page.tsx             — Entity types (moved from property level)
src/app/org/vault/page.tsx                    — Org data vault
src/app/org/ai-context/page.tsx               — AI context
src/app/org/geo-layers/page.tsx               — Geo layers
src/app/org/domains/page.tsx                  — Custom domains
src/app/org/access/page.tsx                   — Access & tokens
src/app/org/settings/page.tsx                 — Org settings

src/app/p/[slug]/layout.tsx                   — Property context layout (determines field vs admin)
src/app/p/[slug]/page.tsx                     — Field mode: map
src/app/p/[slug]/list/page.tsx                — Field mode: list
src/app/p/[slug]/add/page.tsx                 — Field mode: add item
src/app/p/[slug]/activity/page.tsx            — Field mode: activity feed
src/app/p/[slug]/edit/[id]/page.tsx           — Field mode: edit item
src/app/p/[slug]/admin/layout.tsx             — Property admin layout, wraps PropertyAdminShell
src/app/p/[slug]/admin/page.tsx               — Property admin dashboard
src/app/p/[slug]/admin/data/page.tsx          — Items table
src/app/p/[slug]/admin/vault/page.tsx         — Property data vault
src/app/p/[slug]/admin/landing/page.tsx       — Landing page editor
src/app/p/[slug]/admin/site-builder/layout.tsx
src/app/p/[slug]/admin/site-builder/landing/page.tsx
src/app/p/[slug]/admin/site-builder/chrome/page.tsx
src/app/p/[slug]/admin/site-builder/templates/page.tsx
src/app/p/[slug]/admin/qr-codes/page.tsx      — QR codes
src/app/p/[slug]/admin/members/page.tsx        — Property members
src/app/p/[slug]/admin/invites/page.tsx        — Property invites
src/app/p/[slug]/admin/settings/page.tsx       — Property settings

src/app/account/layout.tsx                     — User context layout
src/app/account/page.tsx                       — Profile (placeholder)
src/app/account/notifications/page.tsx         — Notification prefs (placeholder)
```

### Modified Files

```
src/lib/supabase/middleware.ts:215-287        — Update protected route patterns for /org, /p, /account
src/app/layout.tsx:30-101                     — Suppress public Navigation on /org, /p/*/admin, /account routes
src/components/layout/Navigation.tsx:51-112   — Update links: /manage → /p/[slug], settings → /org/settings
```

### Preserved (old routes become redirects)

```
src/app/admin/*                               — Will redirect to /org/* or /p/[slug]/admin/*
src/app/manage/*                              — Will redirect to /p/[slug]/*
```

---

### Task 1: MobileBottomTabs Component

**Files:**
- Create: `src/components/layout/MobileBottomTabs.tsx`
- Test: `src/components/layout/__tests__/MobileBottomTabs.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/__tests__/MobileBottomTabs.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MobileBottomTabs, type TabItem } from '../MobileBottomTabs';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
}));

describe('MobileBottomTabs', () => {
  const tabs: TabItem[] = [
    { href: '/test', label: 'Tab 1', icon: () => <span data-testid="icon-1">1</span> },
    { href: '/other', label: 'Tab 2', icon: () => <span data-testid="icon-2">2</span> },
  ];

  it('renders all tabs with labels', () => {
    render(<MobileBottomTabs tabs={tabs} />);
    expect(screen.getByText('Tab 1')).toBeDefined();
    expect(screen.getByText('Tab 2')).toBeDefined();
  });

  it('marks active tab based on pathname', () => {
    render(<MobileBottomTabs tabs={tabs} />);
    const activeLink = screen.getByText('Tab 1').closest('a');
    expect(activeLink?.className).toContain('text-forest');
  });

  it('is hidden on desktop (md:hidden)', () => {
    const { container } = render(<MobileBottomTabs tabs={tabs} />);
    const nav = container.querySelector('nav');
    expect(nav?.className).toContain('md:hidden');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/MobileBottomTabs.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement MobileBottomTabs**

```tsx
// src/components/layout/MobileBottomTabs.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

export interface TabItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface MobileBottomTabsProps {
  tabs: TabItem[];
}

export function MobileBottomTabs({ tabs }: MobileBottomTabsProps) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-sage-light z-30 safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive ? 'text-forest' : 'text-sage'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/MobileBottomTabs.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/components/layout/MobileBottomTabs.tsx src/components/layout/__tests__/MobileBottomTabs.test.tsx
git commit -m "feat(ia): add reusable MobileBottomTabs component"
```

---

### Task 2: ContextBar Component

**Files:**
- Create: `src/components/layout/ContextBar.tsx`
- Test: `src/components/layout/__tests__/ContextBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/__tests__/ContextBar.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContextBar } from '../ContextBar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('ContextBar', () => {
  it('renders org name only at org level', () => {
    render(<ContextBar orgName="Audubon Society" orgHref="/org" />);
    expect(screen.getByText('Audubon Society')).toBeDefined();
    expect(screen.queryByText('>')).toBeNull();
  });

  it('renders breadcrumb at property level', () => {
    render(
      <ContextBar
        orgName="Audubon Society"
        orgHref="/org"
        propertyName="Central Park"
        propertyHref="/p/central-park/admin"
      />
    );
    expect(screen.getByText('Audubon Society')).toBeDefined();
    expect(screen.getByText('Central Park')).toBeDefined();
  });

  it('org name is a link when at property level', () => {
    render(
      <ContextBar
        orgName="Audubon Society"
        orgHref="/org"
        propertyName="Central Park"
        propertyHref="/p/central-park/admin"
      />
    );
    const orgLink = screen.getByText('Audubon Society').closest('a');
    expect(orgLink?.getAttribute('href')).toBe('/org');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/ContextBar.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ContextBar**

```tsx
// src/components/layout/ContextBar.tsx
'use client';

import Link from 'next/link';

interface ContextBarProps {
  orgName: string;
  orgHref: string;
  propertyName?: string;
  propertyHref?: string;
  rightContent?: React.ReactNode;
}

export function ContextBar({ orgName, orgHref, propertyName, propertyHref, rightContent }: ContextBarProps) {
  return (
    <div className="bg-amber-800 text-white flex-shrink-0">
      <div className="px-4 flex items-center justify-between h-12">
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          {propertyName ? (
            <>
              {/* Mobile: back chevron + property name */}
              <Link
                href={orgHref}
                className="md:hidden text-white/80 hover:text-white flex items-center gap-1 shrink-0"
                title={`Back to ${orgName}`}
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </Link>
              {/* Desktop: full breadcrumb */}
              <Link
                href={orgHref}
                className="hidden md:inline text-white/70 hover:text-white transition-colors truncate"
              >
                {orgName}
              </Link>
              <span className="hidden md:inline text-white/40">/</span>
              {propertyHref ? (
                <span className="font-medium truncate">{propertyName}</span>
              ) : (
                <span className="font-medium truncate">{propertyName}</span>
              )}
            </>
          ) : (
            <span className="font-medium truncate">{orgName}</span>
          )}
        </div>
        {rightContent && <div className="flex items-center gap-2 shrink-0">{rightContent}</div>}
      </div>
    </div>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/ContextBar.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/components/layout/ContextBar.tsx src/components/layout/__tests__/ContextBar.test.tsx
git commit -m "feat(ia): add ContextBar breadcrumb component"
```

---

### Task 3: AvatarMenu Component

**Files:**
- Create: `src/components/layout/AvatarMenu.tsx`
- Test: `src/components/layout/__tests__/AvatarMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/__tests__/AvatarMenu.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AvatarMenu } from '../AvatarMenu';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}));

describe('AvatarMenu', () => {
  it('renders avatar button', () => {
    render(<AvatarMenu userEmail="test@example.com" />);
    const button = screen.getByLabelText('User menu');
    expect(button).toBeDefined();
  });

  it('shows menu items when clicked', () => {
    render(<AvatarMenu userEmail="test@example.com" />);
    fireEvent.click(screen.getByLabelText('User menu'));
    expect(screen.getByText('Profile')).toBeDefined();
    expect(screen.getByText('Sign Out')).toBeDefined();
  });

  it('shows user initial in avatar', () => {
    render(<AvatarMenu userEmail="test@example.com" />);
    expect(screen.getByText('T')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/AvatarMenu.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AvatarMenu**

```tsx
// src/components/layout/AvatarMenu.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface AvatarMenuProps {
  userEmail: string;
}

export function AvatarMenu({ userEmail }: AvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const initial = userEmail.charAt(0).toUpperCase();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="User menu"
        className="w-8 h-8 rounded-full bg-white/20 text-white text-sm font-medium flex items-center justify-center hover:bg-white/30 transition-colors"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-sage-light py-1 z-50">
          <div className="px-3 py-2 text-xs text-sage border-b border-sage-light truncate">
            {userEmail}
          </div>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-sage-light/30"
          >
            Profile
          </Link>
          <Link
            href="/account/notifications"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-gray-700 hover:bg-sage-light/30"
          >
            Notifications
          </Link>
          <div className="border-t border-sage-light mt-1 pt-1">
            <button
              onClick={handleSignOut}
              className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/AvatarMenu.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/components/layout/AvatarMenu.tsx src/components/layout/__tests__/AvatarMenu.test.tsx
git commit -m "feat(ia): add AvatarMenu component with sign out"
```

---

### Task 4: OrgShell Component

**Files:**
- Create: `src/components/layout/OrgShell.tsx`
- Test: `src/components/layout/__tests__/OrgShell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/__tests__/OrgShell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OrgShell } from '../OrgShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/org',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { name: 'Test Org' } }),
        }),
      }),
    }),
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}));

describe('OrgShell', () => {
  it('renders sidebar with org nav items', () => {
    render(
      <OrgShell orgId="org-1" orgSlug="test-org" userEmail="test@example.com">
        <div>Content</div>
      </OrgShell>
    );
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Properties')).toBeDefined();
    expect(screen.getByText('Members')).toBeDefined();
    expect(screen.getByText('Item Types')).toBeDefined();
    expect(screen.getByText('Entity Types')).toBeDefined();
  });

  it('renders children in main area', () => {
    render(
      <OrgShell orgId="org-1" orgSlug="test-org" userEmail="test@example.com">
        <div>Test Content</div>
      </OrgShell>
    );
    expect(screen.getByText('Test Content')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/OrgShell.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement OrgShell**

```tsx
// src/components/layout/OrgShell.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AdminSidebar, type SidebarItem } from '@/components/admin/AdminSidebar';
import { ContextBar } from './ContextBar';
import { AvatarMenu } from './AvatarMenu';

interface OrgShellProps {
  orgId: string;
  orgSlug: string;
  userEmail: string;
  children: React.ReactNode;
}

const ORG_NAV_ITEMS: SidebarItem[] = [
  { label: 'Dashboard', href: '/org' },
  { label: 'Properties', href: '/org/properties' },
  { type: 'section', label: 'People' },
  { label: 'Members', href: '/org/members' },
  { label: 'Roles', href: '/org/roles' },
  { type: 'section', label: 'Data' },
  { label: 'Item Types', href: '/org/types' },
  { label: 'Entity Types', href: '/org/entity-types' },
  { label: 'Data Vault', href: '/org/vault' },
  { label: 'AI Context', href: '/org/ai-context' },
  { label: 'Geo Layers', href: '/org/geo-layers' },
  { type: 'section', label: 'Config' },
  { label: 'Domains', href: '/org/domains' },
  { label: 'Access & Tokens', href: '/org/access' },
  { label: 'Settings', href: '/org/settings' },
];

export function OrgShell({ orgId, orgSlug, userEmail, children }: OrgShellProps) {
  const [orgName, setOrgName] = useState<string>(orgSlug);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    const supabase = createClient();
    supabase
      .from('orgs')
      .select('name')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (data?.name) setOrgName(data.name);
      });
  }, [orgId]);

  return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
      <ContextBar
        orgName={orgName}
        orgHref="/org"
        rightContent={
          <div className="flex items-center gap-2">
            <button
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="md:hidden text-white/80 hover:text-white transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <rect x="2" y="4" width="16" height="2" rx="1" />
                <rect x="2" y="9" width="16" height="2" rx="1" />
                <rect x="2" y="14" width="16" height="2" rx="1" />
              </svg>
            </button>
            <AvatarMenu userEmail={userEmail} />
          </div>
        }
      />

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 bottom-0 shadow-xl">
            <AdminSidebar
              title={orgName}
              items={ORG_NAV_ITEMS}
              onNavClick={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="hidden md:block">
          <AdminSidebar title={orgName} items={ORG_NAV_ITEMS} />
        </div>
        <main className="flex-1 overflow-auto flex flex-col">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/OrgShell.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/components/layout/OrgShell.tsx src/components/layout/__tests__/OrgShell.test.tsx
git commit -m "feat(ia): add OrgShell with new nav structure (types at org level)"
```

---

### Task 5: Org Route Pages

**Files:**
- Create: `src/app/org/layout.tsx`
- Create: `src/app/org/page.tsx`
- Create: `src/app/org/properties/page.tsx`
- Create: `src/app/org/members/page.tsx`
- Create: `src/app/org/members/[userId]/page.tsx`
- Create: `src/app/org/roles/page.tsx`
- Create: `src/app/org/roles/[roleId]/page.tsx`
- Create: `src/app/org/types/page.tsx`
- Create: `src/app/org/entity-types/page.tsx`
- Create: `src/app/org/vault/page.tsx`
- Create: `src/app/org/ai-context/page.tsx`
- Create: `src/app/org/geo-layers/page.tsx`
- Create: `src/app/org/domains/page.tsx`
- Create: `src/app/org/access/page.tsx`
- Create: `src/app/org/settings/page.tsx`

Each page re-exports the existing admin page component to avoid duplication during migration.

- [ ] **Step 1: Create org layout**

```tsx
// src/app/org/layout.tsx
import { getTenantContext } from '@/lib/tenant/server';
import { redirect } from 'next/navigation';
import { OrgShell } from '@/components/layout/OrgShell';
import { createClient } from '@/lib/supabase/server';

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenantContext();

  if (tenant.source === 'platform' || !tenant.orgId) {
    redirect('/');
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <OrgShell
      orgId={tenant.orgId}
      orgSlug={tenant.orgSlug}
      userEmail={user?.email ?? ''}
    >
      {children}
    </OrgShell>
  );
}
```

- [ ] **Step 2: Create org dashboard page**

```tsx
// src/app/org/page.tsx
// Re-export the existing admin dashboard
export { default } from '@/app/admin/page';
```

- [ ] **Step 3: Create org sub-pages (properties, members, roles)**

```tsx
// src/app/org/properties/page.tsx
export { default } from '@/app/admin/properties/page';
```

```tsx
// src/app/org/members/page.tsx
export { default } from '@/app/admin/members/page';
```

```tsx
// src/app/org/members/[userId]/page.tsx
export { default } from '@/app/admin/members/[userId]/page';
```

```tsx
// src/app/org/roles/page.tsx
export { default } from '@/app/admin/roles/page';
```

```tsx
// src/app/org/roles/[roleId]/page.tsx
export { default } from '@/app/admin/roles/[roleId]/page';
```

- [ ] **Step 4: Create org data pages (types, entity-types, vault, ai-context, geo-layers)**

```tsx
// src/app/org/types/page.tsx
// Item types moved from property level to org level
// Reuses the existing property types page component
export { default } from '@/app/admin/properties/[slug]/types/page';
```

```tsx
// src/app/org/entity-types/page.tsx
export { default } from '@/app/admin/properties/[slug]/entity-types/page';
```

```tsx
// src/app/org/vault/page.tsx
export { default } from '@/app/admin/vault/page';
```

```tsx
// src/app/org/ai-context/page.tsx
export { default } from '@/app/admin/ai-context/page';
```

```tsx
// src/app/org/geo-layers/page.tsx
export { default } from '@/app/admin/geo-layers/page';
```

- [ ] **Step 5: Create org config pages (domains, access, settings)**

```tsx
// src/app/org/domains/page.tsx
export { default } from '@/app/admin/domains/page';
```

```tsx
// src/app/org/access/page.tsx
export { default } from '@/app/admin/access/page';
```

```tsx
// src/app/org/settings/page.tsx
export { default } from '@/app/admin/settings/page';
```

- [ ] **Step 6: Verify org routes render**

Run: `cd /Users/patrick/birdhouse-mapper && npm run build 2>&1 | head -40`
Expected: Build succeeds (or only pre-existing warnings). Check for any import resolution errors on `/org` routes.

- [ ] **Step 7: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/app/org/
git commit -m "feat(ia): add /org route pages re-exporting existing admin pages"
```

---

### Task 6: PropertyAdminShell Component

**Files:**
- Create: `src/components/layout/PropertyAdminShell.tsx`
- Test: `src/components/layout/__tests__/PropertyAdminShell.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/__tests__/PropertyAdminShell.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PropertyAdminShell } from '../PropertyAdminShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/p/test-prop/admin',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { name: 'Test Org' } }),
          order: () => ({ then: (cb: any) => cb({ data: [] }) }),
        }),
      }),
    }),
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}));

describe('PropertyAdminShell', () => {
  it('renders property admin sidebar items', () => {
    render(
      <PropertyAdminShell
        orgId="org-1"
        orgSlug="test-org"
        propertySlug="test-prop"
        userEmail="test@example.com"
      >
        <div>Content</div>
      </PropertyAdminShell>
    );
    expect(screen.getByText('Dashboard')).toBeDefined();
    expect(screen.getByText('Data')).toBeDefined();
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Members')).toBeDefined();
  });

  it('includes back-to-org link', () => {
    render(
      <PropertyAdminShell
        orgId="org-1"
        orgSlug="test-org"
        propertySlug="test-prop"
        userEmail="test@example.com"
      >
        <div>Content</div>
      </PropertyAdminShell>
    );
    const backLink = screen.getByText(/Back to/);
    expect(backLink.closest('a')?.getAttribute('href')).toBe('/org');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/PropertyAdminShell.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PropertyAdminShell**

```tsx
// src/components/layout/PropertyAdminShell.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AdminSidebar, type SidebarItem } from '@/components/admin/AdminSidebar';
import { ContextBar } from './ContextBar';
import { AvatarMenu } from './AvatarMenu';
import type { EntityType } from '@/lib/types';

interface PropertyAdminShellProps {
  orgId: string;
  orgSlug: string;
  propertySlug: string;
  userEmail: string;
  children: React.ReactNode;
}

export function PropertyAdminShell({
  orgId,
  orgSlug,
  propertySlug,
  userEmail,
  children,
}: PropertyAdminShellProps) {
  const [orgName, setOrgName] = useState<string>(orgSlug);
  const [propertyName, setPropertyName] = useState<string>(propertySlug);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('orgs')
      .select('name')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (data?.name) setOrgName(data.name);
      });

    supabase
      .from('properties')
      .select('name, org_id')
      .eq('slug', propertySlug)
      .single()
      .then(({ data }) => {
        if (data) {
          setPropertyName(data.name);
          supabase
            .from('entity_types')
            .select('*')
            .eq('org_id', data.org_id)
            .order('sort_order', { ascending: true })
            .then(({ data: etData }) => {
              if (etData) setEntityTypes(etData);
            });
        }
      });
  }, [orgId, propertySlug]);

  const base = `/p/${propertySlug}/admin`;
  const items: SidebarItem[] = [
    { label: 'Dashboard', href: base },
    { type: 'section', label: 'Field Work' },
    { label: 'Map', href: `/p/${propertySlug}` },
    { label: 'Data', href: `${base}/data` },
    { type: 'section', label: 'Content' },
    { label: 'Data Vault', href: `${base}/vault` },
    { type: 'section', label: 'Site' },
    { label: 'Landing Page', href: `${base}/landing` },
    { label: 'Site Builder', href: `${base}/site-builder/templates` },
    { label: 'QR Codes', href: `${base}/qr-codes` },
    ...entityTypes.map((et) => ({
      label: `${et.icon} ${et.name}`,
      href: `${base}/entities/${et.id}`,
    })),
    { type: 'section', label: 'People' },
    { label: 'Members', href: `${base}/members` },
    { label: 'Invites', href: `${base}/invites` },
    { type: 'section', label: 'Config' },
    { label: 'Settings', href: `${base}/settings` },
  ];

  const backLink = { label: `Back to ${orgName}`, href: '/org' };

  return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
      <ContextBar
        orgName={orgName}
        orgHref="/org"
        propertyName={propertyName}
        propertyHref={base}
        rightContent={
          <div className="flex items-center gap-2">
            <button
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="md:hidden text-white/80 hover:text-white transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <rect x="2" y="4" width="16" height="2" rx="1" />
                <rect x="2" y="9" width="16" height="2" rx="1" />
                <rect x="2" y="14" width="16" height="2" rx="1" />
              </svg>
            </button>
            <AvatarMenu userEmail={userEmail} />
          </div>
        }
      />

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 bottom-0 shadow-xl">
            <AdminSidebar
              title={propertyName}
              items={items}
              backLink={backLink}
              onNavClick={() => setDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="hidden md:block">
          <AdminSidebar title={propertyName} items={items} backLink={backLink} />
        </div>
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/patrick/birdhouse-mapper && npx vitest run src/components/layout/__tests__/PropertyAdminShell.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/components/layout/PropertyAdminShell.tsx src/components/layout/__tests__/PropertyAdminShell.test.tsx
git commit -m "feat(ia): add PropertyAdminShell with context bar and back-to-org link"
```

---

### Task 7: Property Route Pages (Admin)

**Files:**
- Create: `src/app/p/[slug]/admin/layout.tsx`
- Create: `src/app/p/[slug]/admin/page.tsx`
- Create: all property admin sub-pages
- Create: `src/app/p/[slug]/admin/site-builder/layout.tsx`

- [ ] **Step 1: Create property admin layout**

```tsx
// src/app/p/[slug]/admin/layout.tsx
import { getTenantContext } from '@/lib/tenant/server';
import { redirect } from 'next/navigation';
import { PropertyAdminShell } from '@/components/layout/PropertyAdminShell';
import { createClient } from '@/lib/supabase/server';

export default async function PropertyAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getTenantContext();

  if (tenant.source === 'platform' || !tenant.orgId) {
    redirect('/');
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <PropertyAdminShell
      orgId={tenant.orgId}
      orgSlug={tenant.orgSlug}
      propertySlug={slug}
      userEmail={user?.email ?? ''}
    >
      {children}
    </PropertyAdminShell>
  );
}
```

- [ ] **Step 2: Create property admin pages (re-exports)**

```tsx
// src/app/p/[slug]/admin/page.tsx
// Property admin dashboard — reuses existing property overview
export { default } from '@/app/admin/properties/[slug]/page';
```

```tsx
// src/app/p/[slug]/admin/data/page.tsx
export { default } from '@/app/admin/properties/[slug]/data/page';
```

```tsx
// src/app/p/[slug]/admin/vault/page.tsx
export { default } from '@/app/admin/properties/[slug]/vault/page';
```

```tsx
// src/app/p/[slug]/admin/landing/page.tsx
export { default } from '@/app/admin/properties/[slug]/landing/page';
```

```tsx
// src/app/p/[slug]/admin/qr-codes/page.tsx
export { default } from '@/app/admin/properties/[slug]/qr-codes/page';
```

```tsx
// src/app/p/[slug]/admin/members/page.tsx
export { default } from '@/app/admin/properties/[slug]/members/page';
```

```tsx
// src/app/p/[slug]/admin/invites/page.tsx
export { default } from '@/app/admin/properties/[slug]/invites/page';
```

```tsx
// src/app/p/[slug]/admin/settings/page.tsx
export { default } from '@/app/admin/properties/[slug]/settings/page';
```

```tsx
// src/app/p/[slug]/admin/entities/[entityTypeId]/page.tsx
export { default } from '@/app/admin/properties/[slug]/entities/[entityTypeId]/page';
```

- [ ] **Step 3: Create site-builder sub-routes**

```tsx
// src/app/p/[slug]/admin/site-builder/layout.tsx
export { default } from '@/app/admin/properties/[slug]/site-builder/layout';
```

```tsx
// src/app/p/[slug]/admin/site-builder/landing/page.tsx
export { default } from '@/app/admin/properties/[slug]/site-builder/landing/page';
```

```tsx
// src/app/p/[slug]/admin/site-builder/chrome/page.tsx
export { default } from '@/app/admin/properties/[slug]/site-builder/chrome/page';
```

```tsx
// src/app/p/[slug]/admin/site-builder/templates/page.tsx
export { default } from '@/app/admin/properties/[slug]/site-builder/templates/page';
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/patrick/birdhouse-mapper && npm run build 2>&1 | tail -20`
Expected: Build succeeds. Property admin pages may show warnings if existing components reference `/admin/properties/[slug]` paths internally — note these for Task 11.

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/app/p/
git commit -m "feat(ia): add /p/[slug]/admin route pages re-exporting existing property admin"
```

---

### Task 8: FieldModeShell and Field Mode Routes

**Files:**
- Create: `src/components/layout/FieldModeShell.tsx`
- Create: `src/app/p/[slug]/layout.tsx`
- Create: `src/app/p/[slug]/page.tsx`
- Create: `src/app/p/[slug]/list/page.tsx`
- Create: `src/app/p/[slug]/add/page.tsx`
- Create: `src/app/p/[slug]/activity/page.tsx`
- Create: `src/app/p/[slug]/edit/[id]/page.tsx`

- [ ] **Step 1: Create FieldModeShell**

```tsx
// src/components/layout/FieldModeShell.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MobileBottomTabs, type TabItem } from './MobileBottomTabs';
import { AvatarMenu } from './AvatarMenu';

interface FieldModeShellProps {
  propertyName: string;
  propertySlug: string;
  userEmail: string;
  children: React.ReactNode;
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function FieldModeShell({ propertyName, propertySlug, userEmail, children }: FieldModeShellProps) {
  const pathname = usePathname();
  const base = `/p/${propertySlug}`;

  const tabs: TabItem[] = [
    { href: base, label: 'Map', icon: MapIcon },
    { href: `${base}/list`, label: 'List', icon: ListIcon },
    { href: `${base}/add`, label: 'Add', icon: PlusIcon },
    { href: `${base}/activity`, label: 'Activity', icon: ActivityIcon },
  ];

  // Don't show field mode chrome on admin sub-routes
  const isAdminRoute = pathname.startsWith(`${base}/admin`);
  if (isAdminRoute) {
    return <>{children}</>;
  }

  return (
    <div className="pb-20 md:pb-0">
      {/* Top bar */}
      <div className="bg-forest-dark text-white sticky top-0 z-30">
        <div className="px-4 flex items-center justify-between h-12">
          <span className="text-sm font-medium truncate">{propertyName}</span>
          <div className="flex items-center gap-2">
            <Link
              href={`${base}/admin`}
              className="p-1.5 text-white/60 hover:text-white transition-colors"
              title="Admin"
            >
              <GearIcon className="w-4 h-4" />
            </Link>
            <AvatarMenu userEmail={userEmail} />
          </div>
        </div>
      </div>

      {children}

      {/* Mobile bottom tabs */}
      <MobileBottomTabs tabs={tabs} />
    </div>
  );
}
```

- [ ] **Step 2: Create property context layout**

```tsx
// src/app/p/[slug]/layout.tsx
import { getTenantContext } from '@/lib/tenant/server';
import { redirect } from 'next/navigation';
import { FieldModeShell } from '@/components/layout/FieldModeShell';
import { createClient } from '@/lib/supabase/server';

export default async function PropertyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getTenantContext();

  if (tenant.source === 'platform' || !tenant.orgId) {
    redirect('/');
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch property name for the shell
  const { data: property } = await supabase
    .from('properties')
    .select('name')
    .eq('slug', slug)
    .single();

  return (
    <FieldModeShell
      propertyName={property?.name ?? slug}
      propertySlug={slug}
      userEmail={user?.email ?? ''}
    >
      {children}
    </FieldModeShell>
  );
}
```

- [ ] **Step 3: Create field mode pages**

```tsx
// src/app/p/[slug]/page.tsx
// Field mode map — reuses the root map page (or /map)
export { default } from '@/app/page';
```

```tsx
// src/app/p/[slug]/list/page.tsx
export { default } from '@/app/list/page';
```

```tsx
// src/app/p/[slug]/add/page.tsx
export { default } from '@/app/manage/add/page';
```

```tsx
// src/app/p/[slug]/edit/[id]/page.tsx
export { default } from '@/app/manage/edit/[id]/page';
```

```tsx
// src/app/p/[slug]/activity/page.tsx
// Activity feed — placeholder for now, will be built out later
'use client';

export default function ActivityPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-4">Activity</h1>
      <p className="text-sage">Recent activity will appear here.</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/patrick/birdhouse-mapper && npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/components/layout/FieldModeShell.tsx src/app/p/
git commit -m "feat(ia): add /p/[slug] field mode routes and FieldModeShell"
```

---

### Task 9: User Context (Account) Routes

**Files:**
- Create: `src/app/account/layout.tsx`
- Create: `src/app/account/page.tsx`
- Create: `src/app/account/notifications/page.tsx`

- [ ] **Step 1: Create account layout**

```tsx
// src/app/account/layout.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/account');
  }

  return (
    <div className="min-h-screen bg-parchment">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">Account</h1>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create profile page**

```tsx
// src/app/account/page.tsx
import { createClient } from '@/lib/supabase/server';

export default async function ProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="card p-6">
      <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">Profile</h2>
      <div className="space-y-3">
        <div>
          <span className="label">Email</span>
          <p className="text-sm text-gray-700">{user?.email ?? 'Unknown'}</p>
        </div>
        <div>
          <span className="label">Member since</span>
          <p className="text-sm text-gray-700">
            {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create notifications page**

```tsx
// src/app/account/notifications/page.tsx
export default function NotificationsPage() {
  return (
    <div className="card p-6">
      <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">
        Notification Preferences
      </h2>
      <p className="text-sage text-sm">Notification settings coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/app/account/
git commit -m "feat(ia): add /account user context routes (profile, notifications)"
```

---

### Task 10: Middleware Updates for New Routes

**Files:**
- Modify: `src/lib/supabase/middleware.ts:215-287`

The middleware needs to protect `/org/*` (admin-only), `/p/[slug]/admin/*` (admin-only), `/p/[slug]/*` field routes (authenticated), and `/account/*` (authenticated).

- [ ] **Step 1: Update protected route detection in middleware**

In `src/lib/supabase/middleware.ts`, find the protected route check (around line 215):

```typescript
// OLD:
const isProtectedRoute =
  pathname.startsWith('/manage') ||
  pathname.startsWith('/admin');
```

Replace with:

```typescript
const isProtectedRoute =
  pathname.startsWith('/manage') ||
  pathname.startsWith('/admin') ||
  pathname.startsWith('/org') ||
  pathname.startsWith('/p/') ||
  pathname.startsWith('/account');
```

- [ ] **Step 2: Update admin route check**

In the same file, find the admin check (around line 269):

```typescript
// OLD:
if (pathname.startsWith('/admin')) {
```

Replace with:

```typescript
const isAdminRoute =
  pathname.startsWith('/admin') ||
  pathname.startsWith('/org') ||
  /^\/p\/[^/]+\/admin/.test(pathname);

if (isAdminRoute) {
```

- [ ] **Step 3: Update temp user redirect**

Find the temp user admin redirect (around line 262):

```typescript
// OLD:
if (profile?.is_temporary && pathname.startsWith('/admin')) {
  const url = request.nextUrl.clone();
  url.pathname = '/manage';
  return NextResponse.redirect(url);
}
```

Replace with:

```typescript
if (profile?.is_temporary && (pathname.startsWith('/admin') || pathname.startsWith('/org') || /^\/p\/[^/]+\/admin/.test(pathname))) {
  // Temp users can't access admin — redirect to field mode or manage
  const url = request.nextUrl.clone();
  url.pathname = '/manage';
  return NextResponse.redirect(url);
}
```

- [ ] **Step 4: Run type-check**

Run: `cd /Users/patrick/birdhouse-mapper && npm run type-check`
Expected: No new TypeScript errors

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/lib/supabase/middleware.ts
git commit -m "feat(ia): update middleware to protect /org, /p/[slug]/admin, /account routes"
```

---

### Task 11: Suppress Public Navigation on New Admin Routes

**Files:**
- Modify: `src/app/layout.tsx:68-84`

The root layout renders `<Navigation>` for public pages. On `/org/*`, `/p/[slug]/admin/*`, and `/account/*`, the new shells handle their own nav — so the public Navigation should be suppressed.

- [ ] **Step 1: Update root layout to detect new admin routes**

In `src/app/layout.tsx`, the Navigation is rendered inside the providers block. We need the server layout to know whether to render public nav. Read `pathname` from headers (already available via `headers()`).

Find (around line 73-83):

```tsx
{puckRoot ? (
  <PuckRootRenderer data={puckRoot}>
    <main className="flex-1">{children}</main>
  </PuckRootRenderer>
) : (
  <>
    <Navigation isAuthenticated={!!user} />
    <main className="flex-1">{children}</main>
  </>
)}
```

Replace with:

```tsx
{puckRoot ? (
  <PuckRootRenderer data={puckRoot}>
    <main className="flex-1">{children}</main>
  </PuckRootRenderer>
) : (
  <>
    <NavigationWrapper isAuthenticated={!!user} />
    <main className="flex-1">{children}</main>
  </>
)}
```

Then add a client wrapper component at the top of the file or inline. The simplest approach: update Navigation.tsx to also hide on `/org`, `/p/*/admin`, and `/account` routes.

- [ ] **Step 2: Update Navigation.tsx to hide on new shell routes**

In `src/components/layout/Navigation.tsx`, find the platform detection (around line 30):

```tsx
if (typeof document !== 'undefined' && document.cookie.includes('x-tenant-source=platform')) {
  return null;
}
```

Add below it:

```tsx
// Hide on routes that have their own shell navigation
if (pathname.startsWith('/org') || pathname.startsWith('/account') || /^\/p\/[^/]+\/(admin|add|edit|list|activity)/.test(pathname) || /^\/p\/[^/]+$/.test(pathname)) {
  return null;
}
```

- [ ] **Step 3: Run type-check and dev server test**

Run: `cd /Users/patrick/birdhouse-mapper && npm run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/components/layout/Navigation.tsx
git commit -m "feat(ia): hide public nav on routes with their own shell"
```

---

### Task 12: Migration Redirects from Old Routes

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

Add redirects from old `/admin/*` and `/manage/*` routes to new equivalents. These run before route protection so existing bookmarks and links still work.

- [ ] **Step 1: Add redirect logic to middleware**

In `src/lib/supabase/middleware.ts`, after the QR code handler and before the setup check (around line 170), add:

```typescript
// --- IA migration redirects ---
// Redirect old /admin and /manage routes to new IA structure
const iaRedirect = getIaRedirect(pathname);
if (iaRedirect) {
  const url = request.nextUrl.clone();
  url.pathname = iaRedirect;
  return NextResponse.redirect(url, 308); // permanent redirect
}
```

Then add this function at the bottom of the file:

```typescript
/**
 * Map old /admin and /manage routes to new IA routes.
 * Returns the new pathname, or null if no redirect needed.
 */
function getIaRedirect(pathname: string): string | null {
  // /admin/properties/[slug]/* → /p/[slug]/admin/*
  const propertyMatch = pathname.match(/^\/admin\/properties\/([^/]+)(\/.*)?$/);
  if (propertyMatch) {
    const slug = propertyMatch[1];
    const rest = propertyMatch[2] ?? '';
    // /admin/properties/[slug] → /p/[slug]/admin
    // /admin/properties/[slug]/data → /p/[slug]/admin/data
    // /admin/properties/[slug]/types → /org/types (moved to org level)
    // /admin/properties/[slug]/entity-types → /org/entity-types (moved to org level)
    if (rest === '/types') return '/org/types';
    if (rest === '/entity-types') return '/org/entity-types';
    return `/p/${slug}/admin${rest}`;
  }

  // /admin/* → /org/*
  const adminMap: Record<string, string> = {
    '/admin': '/org',
    '/admin/properties': '/org/properties',
    '/admin/members': '/org/members',
    '/admin/roles': '/org/roles',
    '/admin/vault': '/org/vault',
    '/admin/ai-context': '/org/ai-context',
    '/admin/geo-layers': '/org/geo-layers',
    '/admin/domains': '/org/domains',
    '/admin/access': '/org/access',
    '/admin/settings': '/org/settings',
  };

  // Check /admin/members/[userId] and /admin/roles/[roleId]
  const memberMatch = pathname.match(/^\/admin\/members\/(.+)$/);
  if (memberMatch) return `/org/members/${memberMatch[1]}`;

  const roleMatch = pathname.match(/^\/admin\/roles\/(.+)$/);
  if (roleMatch) return `/org/roles/${roleMatch[1]}`;

  if (adminMap[pathname]) return adminMap[pathname];

  // /manage/* → /p/[slug]/* (needs property slug from tenant context — handled separately)
  // For /manage redirects, we need the default property slug which requires a DB lookup.
  // These are handled in a separate step below.
  return null;
}
```

- [ ] **Step 2: Add /manage redirect (requires default property lookup)**

After the session refresh and auth check in middleware, add a redirect for `/manage` routes. Find where `isProtectedRoute` check happens and the user is confirmed authenticated. After the admin role check (end of file, around line 287), add:

```typescript
// --- /manage → /p/[slug] redirect ---
if (pathname.startsWith('/manage') && tenant.orgId) {
  // Look up the default property for this org
  const { data: org } = await tenantClient
    .from('orgs')
    .select('default_property_id, properties(slug)')
    .eq('id', tenant.orgId)
    .single();

  const defaultPropSlug = tenant.propertySlug || (org?.properties as any)?.[0]?.slug;
  if (defaultPropSlug) {
    const url = request.nextUrl.clone();
    const manageMap: Record<string, string> = {
      '/manage': `/p/${defaultPropSlug}`,
      '/manage/add': `/p/${defaultPropSlug}/add`,
      '/manage/update': `/p/${defaultPropSlug}/activity`,
      '/manage/offline': `/p/${defaultPropSlug}`,
    };

    // /manage/edit/[id] → /p/[slug]/edit/[id]
    const editMatch = pathname.match(/^\/manage\/edit\/(.+)$/);
    if (editMatch) {
      url.pathname = `/p/${defaultPropSlug}/edit/${editMatch[1]}`;
      return NextResponse.redirect(url, 308);
    }

    if (manageMap[pathname]) {
      url.pathname = manageMap[pathname];
      return NextResponse.redirect(url, 308);
    }
  }
}
```

- [ ] **Step 3: Run type-check**

Run: `cd /Users/patrick/birdhouse-mapper && npm run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/lib/supabase/middleware.ts
git commit -m "feat(ia): add migration redirects from /admin and /manage to new routes"
```

---

### Task 13: Update Internal Links

**Files:**
- Modify: `src/components/layout/Navigation.tsx` — update /manage and /admin/settings links
- Modify: `src/components/admin/AdminSidebar.tsx` — update active state detection for `/org` prefix

- [ ] **Step 1: Update Navigation.tsx links**

In `src/components/layout/Navigation.tsx`, find the authenticated links section (around line 88-112). The `/manage` and `/admin/settings` links need to point to new routes. However, since these links require knowing the property slug (which Navigation doesn't currently have), and Navigation is already hidden on the new routes (from Task 11), the simplest fix is to leave these links as-is — they'll redirect via middleware. The old links are only shown on public pages where the user might click "Manage".

No change needed here — middleware redirects handle it.

- [ ] **Step 2: Update AdminSidebar active state for /org prefix**

In `src/components/admin/AdminSidebar.tsx`, the active state check uses:

```tsx
const isActive =
  pathname === navItem.href ||
  (navItem.href !== '/admin' && pathname.startsWith(navItem.href));
```

This works for `/org` routes since `/org/members` starts with `/org/members`. But the base `/org` route needs the same exact-match treatment as `/admin` had. Update:

```tsx
const isActive =
  pathname === navItem.href ||
  (navItem.href !== '/admin' && navItem.href !== '/org' && pathname.startsWith(navItem.href));
```

- [ ] **Step 3: Run type-check**

Run: `cd /Users/patrick/birdhouse-mapper && npm run type-check`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add src/components/admin/AdminSidebar.tsx
git commit -m "feat(ia): update sidebar active state detection for /org prefix"
```

---

### Task 14: Smoke Test and Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full type-check**

Run: `cd /Users/patrick/birdhouse-mapper && npm run type-check`
Expected: PASS — no TypeScript errors

- [ ] **Step 2: Run unit tests**

Run: `cd /Users/patrick/birdhouse-mapper && npm run test`
Expected: All tests pass, including the 3 new test files

- [ ] **Step 3: Run build**

Run: `cd /Users/patrick/birdhouse-mapper && npm run build`
Expected: Build succeeds. Note any warnings for future cleanup.

- [ ] **Step 4: Run E2E smoke tests**

Run: `cd /Users/patrick/birdhouse-mapper && npm run test:e2e:smoke`
Expected: Smoke tests pass. If any fail due to route changes, note them — they likely need URL updates in the E2E test fixtures.

- [ ] **Step 5: Commit any test fixes**

If E2E tests needed URL updates:

```bash
cd /Users/patrick/birdhouse-mapper
git add -A
git commit -m "test(ia): update E2E tests for new route structure"
```

---

### Task 15: Fix Re-Export Compatibility Issues

**Context:** The re-exported pages from Task 5 and Task 7 may have issues because the existing page components use `useParams()` to get the `slug` from `/admin/properties/[slug]/*` — but under `/p/[slug]/admin/*` the param key is the same (`slug`), so this should work. However, some components may hardcode `/admin/properties/${slug}` for internal links. This task audits and fixes those.

**Files:**
- Modify: Various existing page components that hardcode `/admin/properties/` paths

- [ ] **Step 1: Search for hardcoded admin property paths**

Run: `cd /Users/patrick/birdhouse-mapper && grep -r "\/admin\/properties\/" src/app/admin/properties/ src/components/ --include="*.tsx" --include="*.ts" -l`

This will list all files that reference `/admin/properties/` — these may need updates to use the new `/p/[slug]/admin/` paths, or use relative navigation.

- [ ] **Step 2: Audit each file**

For each file found, check if the hardcoded path is:
1. A navigation link (needs update or dynamic base path)
2. An API/server action call (no change needed)
3. A redirect (needs update)

For navigation links, the cleanest fix is to derive the base path from the current URL rather than hardcoding. Create a utility:

```tsx
// In components that need it, use usePathname() to derive the base
const pathname = usePathname();
const base = pathname.match(/^(\/p\/[^/]+\/admin|\/admin\/properties\/[^/]+)/)?.[1] ?? '';
```

Or update specific components case-by-case. The exact changes depend on what the grep in Step 1 finds.

- [ ] **Step 3: Fix identified issues**

Apply fixes to each file. For each file, ensure links work under both the old `/admin/properties/[slug]` and new `/p/[slug]/admin` paths (since both route trees exist during migration).

- [ ] **Step 4: Run tests**

Run: `cd /Users/patrick/birdhouse-mapper && npm run test && npm run type-check`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
cd /Users/patrick/birdhouse-mapper
git add -A
git commit -m "fix(ia): update hardcoded admin property paths for new route structure"
```

---

## Notes

### What This Plan Does NOT Cover (Future Work)

- **Removing old `/admin` and `/manage` route files** — kept for backward compatibility during migration. Remove once traffic has shifted.
- **Mobile bottom tabs for org admin and property admin** — the design spec includes these but they require significant work on the stacked-list navigation pattern. The current mobile drawer pattern works for now.
- **Billing page** — placeholder slot in org nav, no page yet.
- **Multi-org switcher** — slot reserved in AvatarMenu, hidden until needed.
- **Activity feed implementation** — placeholder page created; needs real content.
- **Property switcher dropdown** — mentioned in mobile context bar design; deferred.
- **Visual context cues** (property theme color accent in sidebar) — polish item.

### Migration Strategy

The plan uses a "parallel routes" approach:
1. New routes (`/org/*`, `/p/[slug]/*`, `/account/*`) are created alongside old ones
2. New routes re-export existing page components to avoid duplication
3. Middleware redirects old URLs to new ones (308 permanent)
4. Old routes can be removed in a future cleanup PR once stable

### Key Architectural Decision: Re-Export Pattern

Rather than moving all page components to new directories (massive diff, high risk), pages at `/org/members/page.tsx` do `export { default } from '@/app/admin/members/page'`. This means:
- Zero logic duplication
- Old routes still work (via redirect)
- Gradual migration: replace re-exports with standalone pages over time
- Easy rollback: just delete the `/org` and `/p` directories
