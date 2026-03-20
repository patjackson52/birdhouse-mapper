# Temporary Accounts & Invite System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable admins to create short-lived invite links/QR codes that onboard field volunteers and event participants as temporary editors with end-of-day expiry, optional conversion to permanent accounts, and automatic cleanup.

**Architecture:** Supabase Anonymous Auth + hashed invite tokens in a new `invites` table. Temp users get real Supabase auth sessions (anonymous), so existing RLS policies work unchanged. Middleware enforces session expiry. A cleanup cron removes expired anonymous auth users while preserving profile rows for attribution.

**Tech Stack:** Next.js 14 (App Router), Supabase (Anonymous Auth, PostgreSQL, Edge Functions), `qrcode.react` for QR generation, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-03-20-temp-accounts-invite-system-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/004_invites_and_temp_accounts.sql` | DB schema: invites table, profiles columns, trigger update, FK change, RLS |
| `src/lib/invites/tokens.ts` | Token generation (randomBytes) and hashing (SHA-256) |
| `src/lib/invites/constants.ts` | Invite constants (expiry durations, rate limits) |
| `src/app/admin/invites/page.tsx` | Admin invite management UI (list, create, share, convert, revoke) |
| `src/app/admin/invites/actions.ts` | Server actions: createInvite, convertAccount, revokeAccess |
| `src/app/invite/[token]/page.tsx` | Invite claim landing page |
| `src/app/invite/[token]/actions.ts` | Server actions: validateToken, claimInvite |
| `src/app/session-expired/page.tsx` | Session expired page |
| `src/components/manage/GuestBadge.tsx` | Amber/red guest expiry badge for nav |
| `src/lib/invites/__tests__/tokens.test.ts` | Tests for token generation and hashing |
| `src/lib/__tests__/invite-types.test.ts` | Tests for Invite/Profile type structures |
| `supabase/functions/cleanup-temp-accounts/index.ts` | Edge Function for hourly cleanup |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/types.ts` | Add `Invite` interface, update `Profile` with temp fields, update `Database` schema |
| `src/lib/supabase/middleware.ts` | Combined profile query with temp expiry + admin block checks |
| `src/middleware.ts` | Add `/invite` and `/session-expired` to public route patterns |
| `src/app/manage/layout.tsx` | Add GuestBadge component to nav |
| `package.json` | Add `qrcode.react` dependency |

---

## Chunk 1: Foundation (Database, Types, Tokens)

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/004_invites_and_temp_accounts.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ======================
-- Invites table
-- ======================

create table invites (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  created_by uuid not null references profiles(id),
  display_name text,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  convertible boolean not null default false,
  session_expires_at timestamptz not null,
  expires_at timestamptz not null,
  claimed_by uuid references profiles(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for token lookup (claim flow)
create index idx_invites_token on invites (token);

-- Index for admin listing
create index idx_invites_created_by on invites (created_by, created_at desc);

-- Prevent double-claims at the database level
create unique index idx_invites_claimed_by on invites (claimed_by) where claimed_by is not null;

alter table invites enable row level security;

-- RLS: Admin only for all operations
create policy "Admins can view invites"
  on invites for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can create invites"
  on invites for insert
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update invites"
  on invites for update
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete invites"
  on invites for delete
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Allow temp users to read their own invite (needed by middleware for convertible check)
create policy "Users can view their own claimed invite"
  on invites for select
  using (claimed_by = auth.uid());

-- ======================
-- Profiles: add temp account columns
-- ======================

alter table profiles add column is_temporary boolean not null default false;
alter table profiles add column session_expires_at timestamptz;
alter table profiles add column invite_id uuid references invites(id);
alter table profiles add column deleted_at timestamptz;

-- Index for cleanup cron
create index idx_profiles_temp_cleanup
  on profiles (is_temporary, session_expires_at)
  where is_temporary = true and deleted_at is null;

-- ======================
-- Update handle_new_user trigger to skip anonymous users
-- ======================

create or replace function handle_new_user()
returns trigger as $$
begin
  -- Skip profile creation for anonymous users;
  -- the claim server action creates the profile with temp fields instead.
  if new.is_anonymous = true then
    return new;
  end if;

  insert into profiles (id, display_name, role)
  values (new.id, new.raw_user_meta_data->>'display_name', 'editor');
  return new;
end;
$$ language plpgsql security definer;

-- ======================
-- Drop CASCADE FK on profiles.id → auth.users
-- Re-add without cascade so cleanup can delete auth users
-- without losing profile rows (needed for attribution).
-- ======================

alter table profiles drop constraint profiles_id_fkey;
-- FK intentionally dropped (not re-added). Cleanup cron soft-deletes
-- the profile (sets deleted_at) then deletes the auth user. Without a FK,
-- PostgreSQL won't block the auth user deletion.
```

- [ ] **Step 2: Verify migration file exists and is valid SQL**

Run: `cat supabase/migrations/004_invites_and_temp_accounts.sql | head -5`
Expected: First lines of the migration file

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_invites_and_temp_accounts.sql
git commit -m "feat: add invites table and temp account profile columns"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts:9,77-82,130-213`
- Test: `src/lib/__tests__/invite-types.test.ts`

- [ ] **Step 1: Write the failing test for Invite and updated Profile types**

Create `src/lib/__tests__/invite-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { Invite, Profile } from '../types';

describe('Invite type structure', () => {
  it('accepts a valid unclaimed Invite', () => {
    const invite: Invite = {
      id: 'inv-1',
      token: 'hashed-token-abc',
      created_by: 'admin-1',
      display_name: 'Sarah M.',
      role: 'editor',
      convertible: true,
      session_expires_at: '2026-03-20T23:59:00Z',
      expires_at: '2026-03-20T10:15:00Z',
      claimed_by: null,
      claimed_at: null,
      created_at: '2026-03-20T10:00:00Z',
    };
    expect(invite.display_name).toBe('Sarah M.');
    expect(invite.claimed_by).toBeNull();
  });

  it('accepts a claimed Invite', () => {
    const invite: Invite = {
      id: 'inv-2',
      token: 'hashed-token-def',
      created_by: 'admin-1',
      display_name: null,
      role: 'editor',
      convertible: false,
      session_expires_at: '2026-03-20T23:59:00Z',
      expires_at: '2026-03-20T10:15:00Z',
      claimed_by: 'user-1',
      claimed_at: '2026-03-20T10:05:00Z',
      created_at: '2026-03-20T10:00:00Z',
    };
    expect(invite.claimed_by).toBe('user-1');
    expect(invite.display_name).toBeNull();
  });
});

describe('Profile with temp account fields', () => {
  it('accepts a permanent user profile', () => {
    const profile: Profile = {
      id: 'user-1',
      display_name: 'Admin User',
      role: 'admin',
      created_at: '2026-01-01T00:00:00Z',
      is_temporary: false,
      session_expires_at: null,
      invite_id: null,
      deleted_at: null,
    };
    expect(profile.is_temporary).toBe(false);
    expect(profile.session_expires_at).toBeNull();
  });

  it('accepts a temporary user profile', () => {
    const profile: Profile = {
      id: 'user-2',
      display_name: 'Volunteer',
      role: 'editor',
      created_at: '2026-03-20T10:05:00Z',
      is_temporary: true,
      session_expires_at: '2026-03-20T23:59:00Z',
      invite_id: 'inv-1',
      deleted_at: null,
    };
    expect(profile.is_temporary).toBe(true);
    expect(profile.invite_id).toBe('inv-1');
  });

  it('accepts a soft-deleted temp profile', () => {
    const profile: Profile = {
      id: 'user-3',
      display_name: 'Past Volunteer',
      role: 'editor',
      created_at: '2026-03-19T10:00:00Z',
      is_temporary: true,
      session_expires_at: '2026-03-19T23:59:00Z',
      invite_id: 'inv-3',
      deleted_at: '2026-03-20T01:00:00Z',
    };
    expect(profile.deleted_at).toBe('2026-03-20T01:00:00Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/invite-types.test.ts`
Expected: FAIL — `Invite` type does not exist, `Profile` missing new fields

- [ ] **Step 3: Update types in `src/lib/types.ts`**

Add `Invite` interface after `Profile` (after line 82):

```typescript
export interface Invite {
  id: string;
  token: string;
  created_by: string;
  display_name: string | null;
  role: UserRole;
  convertible: boolean;
  session_expires_at: string;
  expires_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
}
```

Update `Profile` interface (lines 77-82) to add new fields:

```typescript
export interface Profile {
  id: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
  is_temporary: boolean;
  session_expires_at: string | null;
  invite_id: string | null;
  deleted_at: string | null;
}
```

Add `invites` to the `Database` interface inside `Tables` (after the `profiles` entry around line 174):

```typescript
      invites: {
        Row: Invite;
        Insert: Omit<Invite, 'id' | 'created_at' | 'claimed_by' | 'claimed_at'>;
        Update: Partial<Omit<Invite, 'id' | 'created_at'>>;
        Relationships: [];
      };
```

Update the `profiles` entry's `Insert` and `Update` types to include new fields:

```typescript
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'is_temporary' | 'session_expires_at' | 'invite_id' | 'deleted_at'> & Partial<Pick<Profile, 'is_temporary' | 'session_expires_at' | 'invite_id' | 'deleted_at'>>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
        Relationships: [];
      };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/invite-types.test.ts`
Expected: PASS

- [ ] **Step 5: Fix existing types.test.ts**

The existing `src/lib/__tests__/types.test.ts` creates `Profile` objects without the new fields. Update all `Profile` literals in that file to include:

```typescript
is_temporary: false,
session_expires_at: null,
invite_id: null,
deleted_at: null,
```

Note: Check if any Profile objects exist in `types.test.ts` — if they do, add the fields. If not, no changes needed.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/__tests__/invite-types.test.ts src/lib/__tests__/types.test.ts
git commit -m "feat: add Invite type and temp account fields to Profile"
```

---

### Task 3: Token Utilities

**Files:**
- Create: `src/lib/invites/tokens.ts`
- Create: `src/lib/invites/constants.ts`
- Test: `src/lib/invites/__tests__/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/invites/__tests__/tokens.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateToken, hashToken } from '../tokens';

describe('generateToken', () => {
  it('returns a URL-safe base64 string', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns a string of ~43 characters (32 bytes base64url)', () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThanOrEqual(42);
    expect(token.length).toBeLessThanOrEqual(44);
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});

describe('hashToken', () => {
  it('returns a hex string', () => {
    const hash = hashToken('test-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/invites/__tests__/tokens.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/invites/constants.ts`:

```typescript
/** How long an invite link stays valid after creation (milliseconds) */
export const INVITE_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Maximum number of active (unclaimed, unexpired) invites per admin */
export const MAX_ACTIVE_INVITES = 20;

/** Days after session expiry before a convertible account is cleaned up */
export const CONVERSION_WINDOW_DAYS = 7;
```

Create `src/lib/invites/tokens.ts`:

```typescript
import { randomBytes, createHash } from 'crypto';

/**
 * Generate a cryptographically random, URL-safe invite token.
 * 32 bytes = 256 bits of entropy.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hash a raw token for storage.
 * The raw token only exists in the invite URL — we store the hash.
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/invites/__tests__/tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/invites/tokens.ts src/lib/invites/constants.ts src/lib/invites/__tests__/tokens.test.ts
git commit -m "feat: add invite token generation and hashing utilities"
```

---

## Chunk 2: Middleware & Route Protection

### Task 4: Update Middleware for Temp User Expiry

**Files:**
- Modify: `src/lib/supabase/middleware.ts:76-107`
- Modify: `src/middleware.ts:17`

- [ ] **Step 1: Update the route matcher in `src/middleware.ts`**

No code change needed — the existing matcher already catches all routes except static assets. The `/invite/[token]` and `/session-expired` routes will be handled by the middleware's logic for non-protected routes (they'll pass through as public routes since they don't start with `/manage` or `/admin`).

Verify: `/invite` and `/session-expired` don't start with `/manage` or `/admin`, so they are already public. No change to `src/middleware.ts`.

- [ ] **Step 2: Refactor middleware auth checks in `src/lib/supabase/middleware.ts`**

Replace lines 76-107 (the auth checks section) with a combined profile query approach:

```typescript
  // --- Auth checks (only for protected routes) ---
  const isProtectedRoute =
    pathname.startsWith('/manage') ||
    pathname.startsWith('/admin');

  if (!isProtectedRoute) {
    return supabaseResponse;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Single combined profile query for role + temp status
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_temporary, session_expires_at, invite_id')
    .eq('id', user.id)
    .single();

  // Temp user session expired — sign out and redirect
  if (
    profile?.is_temporary &&
    profile.session_expires_at &&
    new Date(profile.session_expires_at) < new Date()
  ) {
    // Check if invite was convertible (for session-expired page message)
    let convertible = false;
    if (profile.invite_id) {
      const { data: invite } = await supabase
        .from('invites')
        .select('convertible')
        .eq('id', profile.invite_id)
        .single();
      convertible = invite?.convertible ?? false;
    }

    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/session-expired';
    if (convertible) url.searchParams.set('convertible', 'true');
    return NextResponse.redirect(url);
  }

  // Temp users cannot access admin routes
  if (profile?.is_temporary && pathname.startsWith('/admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/manage';
    return NextResponse.redirect(url);
  }

  // Non-admin users cannot access admin routes
  if (pathname.startsWith('/admin') && (!profile || profile.role !== 'admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/manage';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
```

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "feat: add temp user expiry and admin blocking to middleware"
```

---

### Task 5: Session Expired Page

**Files:**
- Create: `src/app/session-expired/page.tsx`

- [ ] **Step 1: Create the session expired page**

```tsx
import Link from 'next/link';
import Footer from '@/components/layout/Footer';

export default function SessionExpiredPage({
  searchParams,
}: {
  searchParams: { convertible?: string };
}) {
  const isConvertible = searchParams.convertible === 'true';

  return (
    <div className="pb-20 md:pb-0">
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <span className="text-4xl mb-3 block">👋</span>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-2">
            Session Ended
          </h1>
          <p className="text-sm text-sage mb-6">
            Your guest session has ended. Thanks for contributing!
          </p>
          {isConvertible && (
            <p className="text-xs text-sage mb-6">
              Your admin may convert your account to permanent access.
              Check back with them if needed.
            </p>
          )}
          <Link
            href="/"
            className="btn-primary inline-block"
          >
            View the Map
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Run build check**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds (or only pre-existing errors)

- [ ] **Step 3: Commit**

```bash
git add src/app/session-expired/page.tsx
git commit -m "feat: add session expired page for temp users"
```

---

## Chunk 3: Invite Claim Flow

### Task 6: Invite Claim Server Actions

**Files:**
- Create: `src/app/invite/[token]/actions.ts`

- [ ] **Step 1: Write the claim server actions**

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hashToken } from '@/lib/invites/tokens';

/**
 * Validate an invite token. Called on page load to render the landing page.
 * Uses service role because invites table has admin-only RLS.
 */
export async function validateInviteToken(rawToken: string) {
  const service = createServiceClient();
  const tokenHash = hashToken(rawToken);

  const { data: invite, error } = await service
    .from('invites')
    .select('id, display_name, session_expires_at, expires_at, claimed_by')
    .eq('token', tokenHash)
    .single();

  if (error || !invite) {
    return { valid: false, reason: 'not_found' as const };
  }

  if (invite.claimed_by) {
    return { valid: false, reason: 'already_claimed' as const };
  }

  if (new Date(invite.expires_at) < new Date()) {
    return { valid: false, reason: 'expired' as const };
  }

  return {
    valid: true,
    invite: {
      id: invite.id,
      display_name: invite.display_name,
      session_expires_at: invite.session_expires_at,
    },
  };
}

/**
 * Complete the claim after the client has already called signInAnonymously().
 * The client component handles signInAnonymously() directly (via the browser
 * Supabase client) so that session cookies are properly set. Then it passes
 * the resulting userId to this server action for profile creation and invite
 * claiming via service role.
 */
export async function completeInviteClaim(
  rawToken: string,
  userId: string,
  displayName: string
) {
  const service = createServiceClient();
  const tokenHash = hashToken(rawToken);

  // Verify the userId belongs to an anonymous auth user
  const { data: authUser, error: authUserError } = await service.auth.admin.getUserById(userId);
  if (authUserError || !authUser?.user?.is_anonymous) {
    return { error: 'Invalid session. Please try again.' };
  }

  // Re-validate token (prevent race conditions)
  const { data: invite, error: inviteError } = await service
    .from('invites')
    .select('id, display_name, role, session_expires_at, expires_at, claimed_by, convertible')
    .eq('token', tokenHash)
    .single();

  if (inviteError || !invite) {
    return { error: 'Invite not found' };
  }

  if (invite.claimed_by) {
    return { error: 'This invite has already been claimed' };
  }

  if (new Date(invite.expires_at) < new Date()) {
    return { error: 'This invite has expired' };
  }

  const name = displayName.trim() || invite.display_name || 'Guest';

  // Insert profile via service role
  const { error: profileError } = await service
    .from('profiles')
    .insert({
      id: userId,
      display_name: name,
      role: invite.role,
      is_temporary: true,
      session_expires_at: invite.session_expires_at,
      invite_id: invite.id,
    });

  if (profileError) {
    return { error: 'Failed to create profile. Please try again.' };
  }

  // Mark invite as claimed
  const { error: claimError } = await service
    .from('invites')
    .update({
      claimed_by: userId,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  if (claimError) {
    return { error: 'Failed to complete invite claim.' };
  }

  return { success: true, convertible: invite.convertible };
}
```

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/invite/[token]/actions.ts
git commit -m "feat: add invite claim server actions"
```

---

### Task 7: Invite Claim Landing Page

**Files:**
- Create: `src/app/invite/[token]/page.tsx`

- [ ] **Step 1: Create the invite claim page**

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { validateInviteToken } from './actions';
import InviteClaimForm from './InviteClaimForm';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';

export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  // Check if already authenticated
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Already signed in — don't allow claiming
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    return (
      <div className="pb-20 md:pb-0">
        <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <span className="text-4xl mb-3 block">👤</span>
            <h1 className="font-heading text-xl font-semibold text-forest-dark mb-2">
              Already Signed In
            </h1>
            <p className="text-sm text-sage mb-6">
              You&apos;re signed in as {profile?.display_name || 'a user'}.
            </p>
            <Link href="/manage" className="btn-primary inline-block">
              Go to Dashboard
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Validate the token
  const result = await validateInviteToken(params.token);

  if (!result.valid) {
    return (
      <div className="pb-20 md:pb-0">
        <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <span className="text-4xl mb-3 block">
              {result.reason === 'expired' ? '⏰' : '🔒'}
            </span>
            <h1 className="font-heading text-xl font-semibold text-forest-dark mb-2">
              {result.reason === 'expired'
                ? 'Invite Expired'
                : result.reason === 'already_claimed'
                ? 'Invite Already Used'
                : 'Invite Not Found'}
            </h1>
            <p className="text-sm text-sage mb-6">
              {result.reason === 'expired'
                ? 'This invite link is no longer valid. Ask your organizer for a new one.'
                : result.reason === 'already_claimed'
                ? 'This invite has already been claimed. Ask your organizer for a new one.'
                : 'This invite could not be found. Check the link and try again.'}
            </p>
            <Link href="/" className="btn-primary inline-block">
              View the Map
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-0">
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center px-4">
        <InviteClaimForm
          token={params.token}
          displayName={result.invite!.display_name}
          sessionExpiresAt={result.invite!.session_expires_at}
        />
      </div>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Create the client-side claim form component**

Create `src/app/invite/[token]/InviteClaimForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { completeInviteClaim } from './actions';

export default function InviteClaimForm({
  token,
  displayName,
  sessionExpiresAt,
}: {
  token: string;
  displayName: string | null;
  sessionExpiresAt: string;
}) {
  const [name, setName] = useState(displayName || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const expiryDate = new Date(sessionExpiresAt);
  const expiryDisplay = expiryDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Step 1: Call signInAnonymously via browser client (sets session cookies)
    const supabase = createClient();
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

    if (authError || !authData.user) {
      setError('Failed to create session. Please try again.');
      setLoading(false);
      return;
    }

    // Step 2: Server action creates profile and claims invite via service role
    const result = await completeInviteClaim(token, authData.user.id, name);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Full page navigation to ensure middleware picks up the new session
    window.location.href = '/manage';
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <span className="text-4xl mb-3 block">📍</span>
        {displayName ? (
          <>
            <h1 className="font-heading text-2xl font-semibold text-forest-dark">
              Welcome, {displayName}!
            </h1>
            <p className="text-sm text-sage mt-1">
              You&apos;ve been invited to contribute
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-2xl font-semibold text-forest-dark">
              Welcome!
            </h1>
            <p className="text-sm text-sage mt-1">
              You&apos;ve been invited to contribute
            </p>
          </>
        )}
      </div>

      <div className="card">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        <div className="rounded-lg bg-sage-light px-4 py-3 mb-4">
          <div className="text-xs text-sage mb-1">Your access expires</div>
          <div className="text-sm font-semibold text-forest-dark">
            Today at {expiryDisplay}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!displayName && (
            <div>
              <label htmlFor="name" className="label">
                Your Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field"
                placeholder="Enter your name"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (!displayName && !name.trim())}
            className="btn-primary w-full"
          >
            {loading ? 'Setting up...' : 'Get Started'}
          </button>
        </form>

        <p className="text-xs text-sage text-center mt-3">
          By continuing you agree to contribute observations to this project
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/invite/[token]/page.tsx src/app/invite/[token]/InviteClaimForm.tsx
git commit -m "feat: add invite claim landing page and form"
```

---

## Chunk 3: Guest Badge & Manage Layout

### Task 8: Guest Badge Component

**Files:**
- Create: `src/components/manage/GuestBadge.tsx`
- Modify: `src/app/manage/layout.tsx`

- [ ] **Step 1: Create the GuestBadge component**

```tsx
'use client';

import { useEffect, useState } from 'react';

export default function GuestBadge({
  expiresAt,
}: {
  expiresAt: string;
}) {
  const [timeLeft, setTimeLeft] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    function update() {
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diffMs = expiry.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeLeft('expired');
        setUrgent(true);
        return;
      }

      const diffMin = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;

      setUrgent(diffMin < 30);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m`);
      } else {
        setTimeLeft(`${mins}m`);
      }
    }

    update();
    const interval = setInterval(update, 60000); // update every minute
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        urgent
          ? 'bg-red-500/20 text-red-200'
          : 'bg-amber-500/20 text-amber-200'
      }`}
    >
      Guest — {timeLeft} left
    </span>
  );
}
```

- [ ] **Step 2: Update manage layout to show guest badge**

Modify `src/app/manage/layout.tsx`. The layout is a client component, so it needs to fetch the user's profile to check `is_temporary`. Add a `useEffect` to fetch profile data and conditionally render the GuestBadge.

Replace the full file content:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import GuestBadge from '@/components/manage/GuestBadge';

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [guestExpiresAt, setGuestExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    async function checkTempStatus() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_temporary, session_expires_at')
        .eq('id', user.id)
        .single();

      if (profile?.is_temporary && profile.session_expires_at) {
        setGuestExpiresAt(profile.session_expires_at);
      }
    }

    checkTempStatus();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const tabs = [
    { href: '/manage', label: 'Dashboard' },
    { href: '/manage/add', label: 'Add Item' },
    { href: '/manage/update', label: 'Add Update' },
  ];

  return (
    <div className="pb-20 md:pb-0">
      <div className="bg-forest-dark text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12">
            <div className="flex items-center gap-4 overflow-x-auto">
              {tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`whitespace-nowrap px-3 py-1.5 rounded text-sm transition-colors ${
                    pathname === tab.href
                      ? 'bg-white/20 text-white font-medium'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {guestExpiresAt && <GuestBadge expiresAt={guestExpiresAt} />}
              <button
                onClick={handleSignOut}
                className="text-white/60 hover:text-white text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/manage/GuestBadge.tsx src/app/manage/layout.tsx
git commit -m "feat: add guest badge to manage layout for temp users"
```

---

## Chunk 4: Admin Invite Management

### Task 9: Install QR Code Dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install qrcode.react**

Run: `npm install qrcode.react`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add qrcode.react dependency"
```

---

### Task 10: Admin Invite Server Actions

**Files:**
- Create: `src/app/admin/invites/actions.ts`

- [ ] **Step 1: Write the admin invite server actions**

```typescript
'use server';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateToken, hashToken } from '@/lib/invites/tokens';
import { INVITE_LINK_TTL_MS, MAX_ACTIVE_INVITES } from '@/lib/invites/constants';

/**
 * Create a new invite. Returns the raw token (for QR/link) — never stored in DB.
 */
export async function createInvite(opts: {
  displayName: string | null;
  sessionExpiresAt: string;
  convertible: boolean;
}) {
  const supabase = createClient();
  const service = createServiceClient();

  // Verify caller is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin access required' };
  }

  // Rate limit: max active invites
  const { count } = await service
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .is('claimed_by', null)
    .gt('expires_at', new Date().toISOString());

  if ((count ?? 0) >= MAX_ACTIVE_INVITES) {
    return { error: `Maximum ${MAX_ACTIVE_INVITES} active invites allowed` };
  }

  // Generate token
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_LINK_TTL_MS).toISOString();

  // Insert invite via service role
  const { error: insertError } = await service
    .from('invites')
    .insert({
      token: tokenHash,
      created_by: user.id,
      display_name: opts.displayName || null,
      role: 'editor',
      convertible: opts.convertible,
      session_expires_at: opts.sessionExpiresAt,
      expires_at: expiresAt,
    });

  if (insertError) {
    return { error: `Failed to create invite: ${insertError.message}` };
  }

  // Return the RAW token (not hash) — this is what goes in the URL
  return { token: rawToken, expiresAt };
}

/**
 * Fetch all invites for the admin panel list view.
 */
export async function getInvites() {
  const supabase = createClient();
  const service = createServiceClient();

  // Verify caller is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin access required' };
  }

  const { data, error } = await service
    .from('invites')
    .select(`
      id, display_name, role, convertible,
      session_expires_at, expires_at,
      claimed_by, claimed_at, created_at
    `)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };

  // Fetch display names for claimed profiles
  const claimedIds = data
    .filter((i) => i.claimed_by)
    .map((i) => i.claimed_by!);

  let profileMap: Record<string, string> = {};
  if (claimedIds.length > 0) {
    const { data: profiles } = await service
      .from('profiles')
      .select('id, display_name')
      .in('id', claimedIds);

    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map((p) => [p.id, p.display_name || 'Guest'])
      );
    }
  }

  return {
    invites: data.map((invite) => ({
      ...invite,
      claimed_display_name: invite.claimed_by
        ? profileMap[invite.claimed_by] || 'Guest'
        : null,
    })),
  };
}

/**
 * Convert a temp account to permanent. Admin provides email + password.
 */
export async function convertAccount(opts: {
  userId: string;
  email: string;
  password: string;
}) {
  const supabase = createClient();
  const service = createServiceClient();

  // Verify caller is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!adminProfile || adminProfile.role !== 'admin') {
    return { error: 'Admin access required' };
  }

  // Convert anonymous user to permanent
  const { error: updateError } = await service.auth.admin.updateUser(
    opts.userId,
    { email: opts.email, password: opts.password }
  );

  if (updateError) {
    return { error: `Failed to convert account: ${updateError.message}` };
  }

  // Update profile
  const { error: profileError } = await service
    .from('profiles')
    .update({
      is_temporary: false,
      session_expires_at: null,
    })
    .eq('id', opts.userId);

  if (profileError) {
    return { error: `Failed to update profile: ${profileError.message}` };
  }

  return { success: true };
}

/**
 * Revoke a temp user's access immediately.
 */
export async function revokeAccess(userId: string) {
  const supabase = createClient();
  const service = createServiceClient();

  // Verify caller is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!adminProfile || adminProfile.role !== 'admin') {
    return { error: 'Admin access required' };
  }

  // Set session_expires_at to now — middleware will catch it on next request
  const { error } = await service
    .from('profiles')
    .update({ session_expires_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    return { error: `Failed to revoke access: ${error.message}` };
  }

  return { success: true };
}
```

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/invites/actions.ts
git commit -m "feat: add admin invite server actions (create, list, convert, revoke)"
```

---

### Task 11: Admin Invites Page

**Files:**
- Create: `src/app/admin/invites/page.tsx`

- [ ] **Step 1: Create the admin invites page**

This is the largest UI file. It has three states: list view, create dialog, and share screen (with QR code).

```tsx
'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createInvite, getInvites, convertAccount, revokeAccess } from './actions';
import { formatShortDate } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type InviteRow = {
  id: string;
  display_name: string | null;
  convertible: boolean;
  session_expires_at: string;
  expires_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  claimed_display_name: string | null;
};

type View = 'list' | 'create' | 'share' | 'convert';

function getInviteStatus(invite: InviteRow): 'active' | 'pending' | 'expired' {
  const now = new Date();
  if (invite.claimed_by) {
    return new Date(invite.session_expires_at) > now ? 'active' : 'expired';
  }
  return new Date(invite.expires_at) > now ? 'pending' : 'expired';
}

const statusStyles = {
  active: 'bg-green-500/10 text-green-700',
  pending: 'bg-amber-500/10 text-amber-700',
  expired: 'bg-red-500/10 text-red-700',
};

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createExpiry, setCreateExpiry] = useState('23:59');
  const [createConvertible, setCreateConvertible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Share state
  const [shareToken, setShareToken] = useState('');
  const [shareExpiresAt, setShareExpiresAt] = useState('');

  // Convert form state
  const [convertUserId, setConvertUserId] = useState('');
  const [convertName, setConvertName] = useState('');
  const [convertEmail, setConvertEmail] = useState('');
  const [convertPassword, setConvertPassword] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState('');

  async function loadInvites() {
    const result = await getInvites();
    if (result.invites) setInvites(result.invites);
    setLoading(false);
  }

  useEffect(() => { loadInvites(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);

    const expiryTime = new Date();
    const [hours, mins] = createExpiry.split(':').map(Number);
    expiryTime.setHours(hours, mins, 0, 0);

    if (expiryTime <= new Date()) {
      setCreateError('Session expiry must be in the future');
      setCreating(false);
      return;
    }

    const result = await createInvite({
      displayName: createName.trim() || null,
      sessionExpiresAt: expiryTime.toISOString(),
      convertible: createConvertible,
    });

    setCreating(false);

    if (result.error) {
      setCreateError(result.error);
      return;
    }

    setShareToken(result.token!);
    setShareExpiresAt(result.expiresAt!);
    setView('share');
    loadInvites();
  }

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    setConvertError('');
    setConverting(true);

    const result = await convertAccount({
      userId: convertUserId,
      email: convertEmail,
      password: convertPassword,
    });

    setConverting(false);

    if (result.error) {
      setConvertError(result.error);
      return;
    }

    setView('list');
    loadInvites();
  }

  async function handleRevoke(userId: string) {
    const result = await revokeAccess(userId);
    if (!result.error) loadInvites();
  }

  function openConvert(userId: string, displayName: string) {
    setConvertUserId(userId);
    setConvertName(displayName);
    setConvertEmail('');
    setConvertPassword('');
    setConvertError('');
    setView('convert');
  }

  const inviteUrl = shareToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${shareToken}`
    : '';

  if (loading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">
          Invites
        </h1>
        {view === 'list' && (
          <button
            onClick={() => {
              setCreateName('');
              setCreateExpiry('23:59');
              setCreateConvertible(false);
              setCreateError('');
              setView('create');
            }}
            className="btn-primary text-sm"
          >
            + Create Invite
          </button>
        )}
        {view !== 'list' && (
          <button
            onClick={() => setView('list')}
            className="text-sm text-sage hover:text-forest-dark transition-colors"
          >
            Back to list
          </button>
        )}
      </div>

      {/* Create form */}
      {view === 'create' && (
        <div className="card max-w-md">
          <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">
            Create New Invite
          </h2>
          {createError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
              {createError}
            </div>
          )}
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="invite-name" className="label">
                Display Name (optional)
              </label>
              <input
                id="invite-name"
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="input-field"
                placeholder="e.g. Sarah M."
              />
              <p className="text-xs text-sage mt-1">
                Leave blank to let the user enter their name
              </p>
            </div>
            <div>
              <label htmlFor="invite-expiry" className="label">
                Session Expires
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="invite-expiry"
                  type="time"
                  value={createExpiry}
                  onChange={(e) => setCreateExpiry(e.target.value)}
                  className="input-field"
                />
                <span className="text-sm text-sage">today</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createConvertible}
                onChange={(e) => setCreateConvertible(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-forest-dark">
                Allow conversion to permanent account
              </span>
            </label>
            <button
              type="submit"
              disabled={creating}
              className="btn-primary w-full"
            >
              {creating ? 'Generating...' : 'Generate Invite'}
            </button>
          </form>
        </div>
      )}

      {/* Share screen */}
      {view === 'share' && shareToken && (
        <div className="card max-w-md text-center">
          <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">
            Invite Ready
          </h2>
          <div className="bg-white inline-block p-4 rounded-lg mb-4">
            <QRCodeSVG value={inviteUrl} size={200} />
          </div>
          <p className="text-xs text-sage mb-2">or copy link</p>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={inviteUrl}
              readOnly
              className="input-field text-xs flex-1"
            />
            <button
              onClick={() => navigator.clipboard.writeText(inviteUrl)}
              className="btn-primary text-sm px-3"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-sage">
            Link expires at{' '}
            {new Date(shareExpiresAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      )}

      {/* Convert form */}
      {view === 'convert' && (
        <div className="card max-w-md">
          <h2 className="font-heading text-lg font-semibold text-forest-dark mb-4">
            Convert to Permanent Account
          </h2>
          <p className="text-sm text-sage mb-4">
            Converting <strong>{convertName}</strong> to a permanent editor account.
          </p>
          {convertError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">
              {convertError}
            </div>
          )}
          <form onSubmit={handleConvert} className="space-y-4">
            <div>
              <label htmlFor="convert-email" className="label">Email</label>
              <input
                id="convert-email"
                type="email"
                value={convertEmail}
                onChange={(e) => setConvertEmail(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label htmlFor="convert-password" className="label">Password</label>
              <input
                id="convert-password"
                type="password"
                value={convertPassword}
                onChange={(e) => setConvertPassword(e.target.value)}
                className="input-field"
                minLength={6}
                required
              />
            </div>
            <button
              type="submit"
              disabled={converting}
              className="btn-primary w-full"
            >
              {converting ? 'Converting...' : 'Convert Account'}
            </button>
          </form>
        </div>
      )}

      {/* Invite list */}
      {view === 'list' && (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-sage-light bg-sage-light">
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Convertible</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-sage uppercase hidden sm:table-cell">Created</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-sage uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-light">
              {invites.map((invite) => {
                const status = getInviteStatus(invite);
                return (
                  <tr key={invite.id}>
                    <td className="px-4 py-3 text-sm text-forest-dark">
                      {invite.claimed_display_name || invite.display_name || '(unnamed)'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyles[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                      {invite.convertible ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-3 text-sm text-sage hidden sm:table-cell">
                      {formatShortDate(invite.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {status === 'active' && invite.convertible && invite.claimed_by && (
                        <button
                          onClick={() =>
                            openConvert(
                              invite.claimed_by!,
                              invite.claimed_display_name || invite.display_name || 'Guest'
                            )
                          }
                          className="text-xs text-forest hover:text-forest-dark transition-colors"
                        >
                          Convert
                        </button>
                      )}
                      {status === 'active' && invite.claimed_by && (
                        <button
                          onClick={() => handleRevoke(invite.claimed_by!)}
                          className="text-xs text-red-600 hover:text-red-800 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                      {status !== 'active' && (
                        <span className="text-xs text-sage">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-sage">
                    No invites yet. Click &quot;+ Create Invite&quot; to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/invites/page.tsx
git commit -m "feat: add admin invite management page with QR codes"
```

---

## Chunk 5: Cleanup & Final Integration

### Task 12: Update Admin Navigation

**Files:**
- Modify: `src/app/admin/layout.tsx:59-68`

The admin layout at `src/app/admin/layout.tsx` has nav links: Data, Settings, Types, Species, Back. Add an "Invites" link after Species (after line 68).

- [ ] **Step 1: Add Invites link to admin layout**

In `src/app/admin/layout.tsx`, after the Species `<Link>` block (after line 68), insert:

```tsx
              <Link
                href="/admin/invites"
                className={`text-sm transition-colors ${
                  pathname.startsWith('/admin/invites')
                    ? 'text-white font-medium'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Invites
              </Link>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat: add invites link to admin navigation"
```

---

### Task 13: Cleanup Edge Function

**Files:**
- Create: `supabase/functions/cleanup-temp-accounts/index.ts`

- [ ] **Step 1: Create the cleanup Edge Function**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CONVERSION_WINDOW_DAYS = 7;

Deno.serve(async (req) => {
  // Verify this is called with the service role key
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date().toISOString();
  const conversionCutoff = new Date(
    Date.now() - CONVERSION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // 1. Delete unclaimed expired invites
  const { error: deleteInvitesError } = await supabase
    .from('invites')
    .delete()
    .is('claimed_by', null)
    .lt('expires_at', now);

  if (deleteInvitesError) {
    console.error('Failed to delete expired invites:', deleteInvitesError);
  }

  // 2. Find expired temp profiles ready for cleanup
  // Non-convertible: clean up after session expires
  // Convertible: clean up after conversion window passes
  const { data: expiredProfiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, invite_id')
    .eq('is_temporary', true)
    .is('deleted_at', null)
    .lt('session_expires_at', now);

  if (profilesError) {
    console.error('Failed to fetch expired profiles:', profilesError);
    return new Response(JSON.stringify({ error: profilesError.message }), {
      status: 500,
    });
  }

  let cleaned = 0;
  for (const profile of expiredProfiles || []) {
    // Check if convertible and within conversion window
    if (profile.invite_id) {
      const { data: invite } = await supabase
        .from('invites')
        .select('convertible, session_expires_at')
        .eq('id', profile.invite_id)
        .single();

      if (
        invite?.convertible &&
        new Date(invite.session_expires_at) > new Date(conversionCutoff)
      ) {
        continue; // Still within conversion window
      }
    }

    // 3. Soft-delete the profile
    await supabase
      .from('profiles')
      .update({ deleted_at: now })
      .eq('id', profile.id);

    // 4. Delete the anonymous auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(
      profile.id
    );

    if (deleteError) {
      console.error(`Failed to delete auth user ${profile.id}:`, deleteError);
    } else {
      cleaned++;
    }
  }

  return new Response(
    JSON.stringify({
      message: `Cleanup complete. Cleaned ${cleaned} expired temp accounts.`,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/cleanup-temp-accounts/index.ts
git commit -m "feat: add cleanup Edge Function for expired temp accounts"
```

---

### Task 14: Final Type-Check and Build Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run build**

Run: `npx next build 2>&1 | tail -30`
Expected: Build succeeds

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build/type issues from invite system integration"
```

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: Foundation | 1-3 | DB schema, TypeScript types, token utilities |
| 2: Middleware | 4-5 | Temp user expiry enforcement, session expired page |
| 3: Claim Flow | 6-7 | Invite claim server actions and landing page |
| 3b: Guest Badge | 8 | Guest badge in manage layout |
| 4: Admin UI | 9-11 | QR code dep, admin server actions, invite management page |
| 5: Integration | 12-14 | Admin nav, cleanup cron, build verification |

**Total: 14 tasks across 5 chunks**

**Prerequisites before starting:**
1. Enable Anonymous Sign-ins in Supabase Dashboard: Authentication > Settings
2. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
