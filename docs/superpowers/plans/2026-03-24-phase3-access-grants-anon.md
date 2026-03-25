# Phase 3: Access Grants & Anonymous Access — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the access control system with configurable per-property anonymous access, time-limited grants, token-based public access, and removal of all legacy `users.role` artifacts.

**Architecture:** Single atomic SQL migration (`010_access_grants_and_anon_access.sql`) with 16 execution steps, plus frontend changes to migrate 10 files from `profiles`/`users.role` to the new permission system. A cron endpoint handles auto-expiration of temporary grants.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, Next.js, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-phase3-access-grants-anon-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/010_access_grants_and_anon_access.sql` | All schema, functions, RLS, cleanup |
| Create | `src/app/api/cron/expire-access-grants/route.ts` | Cron endpoint for temp grant expiration |
| Create | `src/lib/__tests__/phase3-types.test.ts` | Type tests for new interfaces |
| Modify | `src/lib/types.ts` | Add PropertyAccessConfig, TemporaryAccessGrant, AnonymousAccessToken; remove profiles from Database |
| Modify | `src/lib/permissions/resolve.ts` | Add Level 4 (temp grants) + 'temporary_grant' source |
| Modify | `src/lib/permissions/__tests__/resolve.test.ts` | Add temp grant test |
| Modify | `src/lib/supabase/middleware.ts` | `profiles` → `users`, replace `role` check with org_membership check |
| Modify | `src/app/setup/actions.ts` | `profiles` → `users` |
| Modify | `src/app/invite/[token]/actions.ts` | `profiles` → `users` |
| Modify | `src/app/invite/[token]/page.tsx` | `profiles` → `users` |
| Modify | `src/app/manage/edit/[id]/page.tsx` | `profiles` → `users`, replace `role` check |
| Modify | `src/app/manage/layout.tsx` | `profiles` → `users` |
| Modify | `src/app/admin/page.tsx` | `profiles` → `users`, replace role management with org_memberships |
| Modify | `src/app/admin/invites/actions.ts` | `profiles` → `users`, replace all `role` checks |
| Modify | `src/app/api/cron/cleanup-temp-accounts/route.ts` | `profiles` → `users` |
| Modify | `src/components/manage/LocationHistory.tsx` | `profiles` → `users` |

---

## Task 1: Migration — New tables and data migration (steps 1-5)

**Files:**
- Create: `supabase/migrations/010_access_grants_and_anon_access.sql`

- [ ] **Step 1: Create migration file with new tables, token function, and data migration**

Create `supabase/migrations/010_access_grants_and_anon_access.sql` with:
- Header comment referencing spec
- Step 1: `CREATE TABLE property_access_config` — copy SQL from spec Section 1 (lines 72-97)
- Step 2: `CREATE TABLE temporary_access_grants` — copy SQL from spec Section 2 (lines 121-158)
- Step 3: `CREATE TABLE anonymous_access_tokens` — copy SQL from spec Section 3 (lines 194-219)
- Step 4: `CREATE FUNCTION validate_anonymous_token()` — copy from spec Section 3 (lines 225-233)
- Step 5: Data migration — `INSERT INTO property_access_config` for existing property from spec Section 1 (lines 106-110)

All SQL is fully specified in the spec. Copy verbatim.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/010_access_grants_and_anon_access.sql
git commit -m "feat(migration): Phase 3 tables, token validation, data migration (steps 1-5)"
```

---

## Task 2: Migration — Permission resolution function updates (steps 6-8)

**Files:**
- Modify: `supabase/migrations/010_access_grants_and_anon_access.sql`

Append to the existing file. These are `CREATE OR REPLACE` — they replace the Phase 2 versions.

- [ ] **Step 1: Append helper function and updated permission functions**

- Step 6: `CREATE OR REPLACE FUNCTION check_anon_access()` — copy from spec Section 4 (lines 249-264)
- Step 7: `CREATE OR REPLACE FUNCTION check_permission()` — **full replacement** from spec Section 4 (lines 270-321). This adds Level 4 (temporary grants) to the hierarchy.
- Step 8: `CREATE OR REPLACE FUNCTION user_accessible_property_ids()` — **full replacement** from spec Section 4 (lines 326-361). Adds third UNION for temp grants.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/010_access_grants_and_anon_access.sql
git commit -m "feat(migration): update permission functions with temp grants + anon access (steps 6-8)"
```

---

## Task 3: Migration — SELECT policy rewrite (steps 9-10)

**Files:**
- Modify: `supabase/migrations/010_access_grants_and_anon_access.sql`

- [ ] **Step 1: Append policy drops and new anon-aware SELECT policies**

Step 9: Drop all existing public SELECT policies. Use `DROP POLICY IF EXISTS` for:

**Property-scoped tables** (Phase 2 created these as `<table>_public_read`):
- `items_public_read`, `item_updates_public_read`, `photos_public_read`, `location_history_public_read`

**Org-scoped tables** (Phase 2 created these):
- `item_types_public_read`, `custom_fields_public_read`, `update_types_public_read`, `species_public_read`, `item_species_public_read`, `update_species_public_read`

**Other:**
- `redirects_public_read`

Step 10: Create new SELECT policies from spec Section 5:

**Property-scoped** (`items`, `item_updates`, `photos`, `location_history`) — anon-aware 3-path policy from spec (lines 384-406). Each uses the same pattern with `check_anon_access(property_id, 'items')`.

**Org-scoped** (`item_types`, `custom_fields`, `update_types`, `species`, `item_species`, `update_species`) — keep as `USING (true)` (spec lines 418-421).

**`redirects`** — keep as `USING (true)` (spec lines 434-437).

**`properties`** — add `properties_anon_read` for publicly listed properties (spec lines 452-465).

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/010_access_grants_and_anon_access.sql
git commit -m "feat(migration): anon-aware SELECT policies (steps 9-10)"
```

---

## Task 4: Migration — Legacy cleanup (steps 11-13)

**Files:**
- Modify: `supabase/migrations/010_access_grants_and_anon_access.sql`

- [ ] **Step 1: Append legacy cleanup SQL**

Step 11: Drop profiles view and users.role column — **VIEW FIRST, then column** (spec lines 474-482):
```sql
DROP VIEW profiles;
ALTER TABLE users DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE users DROP COLUMN role;
```

Step 12: Update storage.objects policies — copy 3 policy drops/creates from spec Section 6 (lines 516-540).

Step 13: Update handle_new_user() trigger — copy from spec Section 6 (lines 490-507). Removes `role` from INSERT.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/010_access_grants_and_anon_access.sql
git commit -m "feat(migration): drop profiles view, users.role, update storage + trigger (steps 11-13)"
```

---

## Task 5: Migration — RLS, indexes, triggers (steps 14-16)

**Files:**
- Modify: `supabase/migrations/010_access_grants_and_anon_access.sql`

- [ ] **Step 1: Append RLS for new tables**

Step 14: Enable RLS and create policies for `property_access_config`, `temporary_access_grants`, `anonymous_access_tokens` — copy from spec Section 7 (lines 550-608).

- [ ] **Step 2: Append indexes**

Step 15: All indexes from spec Section 8 (lines 618-637).

- [ ] **Step 3: Append triggers**

Step 16: Both triggers from spec Section 9 (lines 645-651).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/010_access_grants_and_anon_access.sql
git commit -m "feat(migration): RLS, indexes, triggers for new tables (steps 14-16)"
```

---

## Task 6: TypeScript types — TDD

**Files:**
- Create: `src/lib/__tests__/phase3-types.test.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write failing type tests**

Create `src/lib/__tests__/phase3-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  PropertyAccessConfig,
  TemporaryAccessGrant,
  TemporaryAccessGrantStatus,
  AnonymousAccessToken,
  Database,
} from '../types';

describe('Phase 3 types', () => {
  describe('PropertyAccessConfig', () => {
    it('has required fields', () => {
      const pac: PropertyAccessConfig = {
        id: 'test', org_id: 'org-1', property_id: 'prop-1',
        anon_access_enabled: true, anon_can_view_map: true,
        anon_can_view_items: true, anon_can_view_item_details: false,
        anon_can_submit_forms: false, anon_visible_field_keys: null,
        password_protected: false, password_hash: null,
        allow_embed: false, embed_allowed_origins: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      expect(pac.anon_access_enabled).toBe(true);
    });
  });

  describe('TemporaryAccessGrant', () => {
    it('has required fields with nullable property_id for org-wide grants', () => {
      const tag: TemporaryAccessGrant = {
        id: 'test', org_id: 'org-1', property_id: null,
        user_id: 'user-1', granted_email: null, invite_token: null,
        role_id: 'role-1', valid_from: '2026-01-01T00:00:00Z',
        valid_until: '2026-01-02T00:00:00Z', is_single_use: false,
        item_ids: null, status: 'active', revoked_at: null,
        revoked_by: null, revoke_reason: null, first_used_at: null,
        granted_by: 'admin-1', note: 'Volunteer workday',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      };
      expect(tag.property_id).toBeNull();
      expect(tag.status).toBe('active');
    });

    it('rejects invalid status at compile time', () => {
      // @ts-expect-error - 'pending' is not valid
      const _bad: TemporaryAccessGrantStatus = 'pending';
    });
  });

  describe('AnonymousAccessToken', () => {
    it('has required fields', () => {
      const aat: AnonymousAccessToken = {
        id: 'test', org_id: 'org-1', property_id: 'prop-1',
        token: 'abc123', can_view_map: true, can_view_items: true,
        can_submit_forms: false, expires_at: null, use_count: 0,
        last_used_at: null, is_active: true, label: 'Public map embed',
        created_by: 'user-1', created_at: '2026-01-01T00:00:00Z',
      };
      expect(aat.is_active).toBe(true);
    });
  });

  describe('Database interface', () => {
    it('includes property_access_config', () => {
      type Row = Database['public']['Tables']['property_access_config']['Row'];
      const _check: Row extends PropertyAccessConfig ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes temporary_access_grants', () => {
      type Row = Database['public']['Tables']['temporary_access_grants']['Row'];
      const _check: Row extends TemporaryAccessGrant ? true : never = true;
      expect(_check).toBe(true);
    });

    it('includes anonymous_access_tokens', () => {
      type Row = Database['public']['Tables']['anonymous_access_tokens']['Row'];
      const _check: Row extends AnonymousAccessToken ? true : never = true;
      expect(_check).toBe(true);
    });

    it('does not include profiles (view dropped)', () => {
      // @ts-expect-error - profiles should be removed
      type _Dead = Database['public']['Tables']['profiles'];
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/__tests__/phase3-types.test.ts`

Expected: FAIL

- [ ] **Step 3: Add types to make tests pass**

In `src/lib/types.ts`:
1. Add `PropertyAccessConfig`, `TemporaryAccessGrantStatus`, `TemporaryAccessGrant`, `AnonymousAccessToken` interfaces from spec Section 10 (lines 663-722)
2. Add `property_access_config`, `temporary_access_grants`, `anonymous_access_tokens` to `Database.public.Tables`
3. Remove `profiles` entry from `Database.public.Tables`

- [ ] **Step 4: Run tests to verify pass**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/__tests__/phase3-types.test.ts`

Expected: PASS

- [ ] **Step 5: Run all tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add src/lib/__tests__/phase3-types.test.ts src/lib/types.ts
git commit -m "feat: add Phase 3 types (PropertyAccessConfig, TemporaryAccessGrant, AnonymousAccessToken)"
```

---

## Task 7: Update permission resolution with temp grants

**Files:**
- Modify: `src/lib/permissions/resolve.ts`
- Modify: `src/lib/permissions/__tests__/resolve.test.ts`

- [ ] **Step 1: Add test for temporary_grant source**

In `src/lib/permissions/__tests__/resolve.test.ts`, add:

```typescript
  it('checks permission JSONB for temporary_grant source', () => {
    const role = makeRole({ items: { view: true, create: true, edit_any: false, edit_assigned: false, delete: false } });
    const access: ResolvedAccess = {
      role,
      permissions: role.permissions,
      source: 'temporary_grant',
    };
    expect(hasPermission(access, 'items', 'create')).toBe(true);
    expect(hasPermission(access, 'items', 'delete')).toBe(false);
  });
```

- [ ] **Step 2: Update ResolvedAccess.source union type**

In `src/lib/permissions/resolve.ts`, update:

```typescript
export interface ResolvedAccess {
  role: Role;
  permissions: RolePermissions;
  source: 'platform_admin' | 'org_admin' | 'property_membership' | 'org_membership' | 'temporary_grant';
}
```

- [ ] **Step 3: Add Level 4 to resolveUserAccess()**

In `resolveUserAccess()`, after the Level 3 org_membership fallback (before `return null`), add the temp grant query from spec Section 10 (lines 738-751).

- [ ] **Step 4: Run tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run src/lib/permissions/__tests__/resolve.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions/resolve.ts src/lib/permissions/__tests__/resolve.test.ts
git commit -m "feat: add temporary_grant to permission resolution"
```

---

## Task 8: Create cron endpoint for temp grant expiration

**Files:**
- Create: `src/app/api/cron/expire-access-grants/route.ts`

- [ ] **Step 1: Create the cron endpoint**

Copy the code from spec Section 2 (lines 167-183). Use the same pattern as the existing `/api/cron/cleanup-temp-accounts/route.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('temporary_access_grants')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'active')
    .lt('valid_until', new Date().toISOString())
    .select('id');

  return Response.json({ expired: data?.length ?? 0, error: error?.message });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/expire-access-grants/route.ts
git commit -m "feat: add cron endpoint for temp grant auto-expiration"
```

---

## Task 9: Migrate frontend files from `profiles` to `users`

**Files:**
- Modify: 10 frontend files (see file map above)

This is the most complex task. Each file needs `profiles` → `users` table name changes, and files that read `role` need authorization logic updates.

- [ ] **Step 1: Simple renames (6 files that don't read `role`)**

These files only need `.from('profiles')` → `.from('users')`:

1. **`src/app/setup/actions.ts`** — lines 126, 149: change `'profiles'` to `'users'`
2. **`src/app/invite/[token]/actions.ts`** — lines 86, 113: change `'profiles'` to `'users'`
3. **`src/app/invite/[token]/page.tsx`** — line 18: change `'profiles'` to `'users'`
4. **`src/app/manage/layout.tsx`** — line 25: change `'profiles'` to `'users'`
5. **`src/app/api/cron/cleanup-temp-accounts/route.ts`** — lines 35, 66: change `'profiles'` to `'users'`
6. **`src/components/manage/LocationHistory.tsx`** — line 37: change `'profiles'` to `'users'`

Read each file, find `.from('profiles')`, replace with `.from('users')`.

**Important note for all `profiles` → `users` changes:** The `is_temporary`, `session_expires_at`, `invite_id`, `display_name`, and `email` columns all exist on the `users` table and are NOT affected by this migration. Only `role` is dropped. The Phase 1 helper functions (`is_platform_admin()`, `user_org_admin_org_ids()`, `user_active_org_ids()`) exist from Phase 1/2 migrations and can be used in RLS policies.

- [ ] **Step 2: Middleware — replace role check**

In `src/lib/supabase/middleware.ts` (line 116):
- Change `.from('profiles')` to `.from('users')`
- Change the column selection from `'role, is_temporary, session_expires_at, invite_id'` to `'is_platform_admin, is_temporary, session_expires_at, invite_id'`
- Replace `profile.role !== 'admin'` with a check against org_memberships. For the middleware (which runs on every request and needs to be fast), check `is_platform_admin` first, then query `org_memberships` with a JOIN to `roles` to check for `org_admin` base_role.

Pattern:
```typescript
// Before
const isAdmin = profile.role === 'admin';
// After
const isAdmin = profile.is_platform_admin || await checkIsOrgAdmin(supabase, user.id);
```

Where `checkIsOrgAdmin` does:
```typescript
const { data } = await supabase
  .from('org_memberships')
  .select('id, roles!inner(base_role)')
  .eq('user_id', userId)
  .eq('status', 'active')
  .eq('roles.base_role', 'org_admin')
  .limit(1);
return (data?.length ?? 0) > 0;
```

**Performance note:** The `checkIsOrgAdmin` query only runs when `is_platform_admin` is false AND the route is an `/admin` route. For non-admin routes, the middleware only checks `is_temporary` / `session_expires_at` — no extra query needed.

- [ ] **Step 3: Manage edit page — replace role check**

In `src/app/manage/edit/[id]/page.tsx` (line 49) — this is a `'use client'` component using browser Supabase client:
- Change `.from('profiles')` to `.from('users')`
- Replace `profile?.role === 'admin'` with a client-side admin check:

```typescript
// Before
const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
const isAdmin = profile?.role === 'admin';

// After
const { data: user } = await supabase.from('users').select('is_platform_admin').eq('id', userId).single();
let isAdmin = user?.is_platform_admin ?? false;
if (!isAdmin) {
  const { data: membership } = await supabase
    .from('org_memberships')
    .select('id, roles!inner(base_role)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('roles.base_role', 'org_admin')
    .limit(1);
  isAdmin = (membership?.length ?? 0) > 0;
}
```

- [ ] **Step 4: Admin invites — replace all role checks**

In `src/app/admin/invites/actions.ts`:
- Change all `.from('profiles')` to `.from('users')` (lines 19, 70, 97, 130, 141, 172, 194, 204)
- For the 4 places that check `role !== 'admin'` (lines 19, 70, 130, 194): replace with the org_admin check pattern from Step 2. Consider extracting a shared helper function `isOrgAdmin(supabase, userId)` to avoid repeating the query.

- [ ] **Step 5: Admin page — replace role management**

In `src/app/admin/page.tsx` — this is the most complex change. Read the file first to understand the full component. Here are the specific changes:

**Type change (line 5):** Replace `Profile` import with a local type:
```typescript
// Before
import type { Item, ItemUpdate, UpdateType, Profile } from '@/lib/types';
// After
import type { Item, ItemUpdate, UpdateType, Role } from '@/lib/types';

type UserWithMembership = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_temporary: boolean;
  created_at: string;
  role_name: string;
  role_id: string;
  membership_id: string;
};
```

**State (line 13):** Change `Profile[]` to `UserWithMembership[]`:
```typescript
const [users, setUsers] = useState<UserWithMembership[]>([]);
const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
```

**Data fetch (line 24-25):** Replace the profiles query:
```typescript
// Before
supabase.from('profiles').select('*').order('created_at', { ascending: true }),
// After — join users with org_memberships and roles
supabase.from('org_memberships')
  .select('id, role_id, users!inner(id, display_name, email, is_temporary, created_at), roles!inner(id, name)')
  .eq('status', 'active')
  .order('created_at', { ascending: true }),
// Also fetch available roles for the dropdown
supabase.from('roles').select('*').order('sort_order', { ascending: true }),
```

Then map the joined data into `UserWithMembership[]`:
```typescript
if (membershipRes.data) {
  setUsers(membershipRes.data.map((m: any) => ({
    id: m.users.id,
    display_name: m.users.display_name,
    email: m.users.email,
    is_temporary: m.users.is_temporary,
    created_at: m.users.created_at,
    role_name: m.roles.name,
    role_id: m.role_id,
    membership_id: m.id,
  })));
}
if (roleRes.data) setAvailableRoles(roleRes.data);
```

**handleRoleChange (lines 73-85):** Update org_membership instead of profiles:
```typescript
async function handleRoleChange(membershipId: string, newRoleId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from('org_memberships')
    .update({ role_id: newRoleId })
    .eq('id', membershipId);

  if (!error) {
    const roleName = availableRoles.find(r => r.id === newRoleId)?.name ?? '';
    setUsers((prev) =>
      prev.map((u) => u.membership_id === membershipId
        ? { ...u, role_id: newRoleId, role_name: roleName }
        : u)
    );
  }
}
```

**Role dropdown (lines 157-166):** Replace hardcoded admin/editor with available roles:
```typescript
<select
  value={u.role_id}
  onChange={(e) => handleRoleChange(u.membership_id, e.target.value)}
  className="input-field w-auto text-sm py-1"
>
  {availableRoles.map((role) => (
    <option key={role.id} value={role.id}>{role.name}</option>
  ))}
</select>
```

**Display name column (line 154):** Show email too since users now have it:
```typescript
{u.display_name || u.email || 'Unnamed User'}
```

**Note:** The `Profile` interface stays in `types.ts` (used by invites). But admin page no longer imports it.

- [ ] **Step 6: Run all tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

- [ ] **Step 7: Run TypeScript check**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit`

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase/middleware.ts src/app/setup/actions.ts src/app/invite/ src/app/manage/ src/app/admin/ src/app/api/cron/cleanup-temp-accounts/route.ts src/components/manage/LocationHistory.tsx
git commit -m "feat: migrate all frontend files from profiles to users, replace role checks with org_memberships"
```

---

## Task 10: Final verification

- [ ] **Step 1: Review the complete migration file**

Read `supabase/migrations/010_access_grants_and_anon_access.sql` end-to-end. Verify all 16 steps present and in order.

- [ ] **Step 2: Run all tests**

Run: `cd /Users/patrick/birdhousemapper && npx vitest run`

Expected: All tests pass.

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd /Users/patrick/birdhousemapper && npx tsc --noEmit`

Expected: No new type errors.

- [ ] **Step 4: Grep for remaining `profiles` references**

Run: `cd /Users/patrick/birdhousemapper && grep -r "from('profiles')" src/ --include="*.ts" --include="*.tsx"`

Expected: Zero results (all migrated to `users`).

- [ ] **Step 5: Grep for remaining `users.role` or `profile.role` references**

Run: `cd /Users/patrick/birdhousemapper && grep -rn "\.role\b" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test." | grep -v "base_role" | grep -v "UserRole"`

Review results — some `role` references are legitimate (e.g., `org_memberships.role_id`, `Role` interface). But any `profile.role` or `users.role` or `data.role === 'admin'` patterns are stale and need updating.

- [ ] **Step 6: Commit any remaining fixes**

```bash
git add -u
git commit -m "fix: address issues found during final Phase 3 review"
```

---

## Post-Implementation Notes

### How to apply the migration

Deploy migration and code changes together — the `profiles` view drop and frontend migration must happen simultaneously. The migration is atomic (transactional).

### How to verify after applying

1. Check new tables: `SELECT * FROM property_access_config;` (should have one row for default property)
2. Verify anonymous access still works: open the public map in an incognito window
3. Test temp grant function: `SELECT check_permission('<user-id>', '<property-id>', 'items', 'create');`
4. Verify `profiles` view is gone: `SELECT * FROM profiles;` (should error)
5. Verify `users.role` is gone: `SELECT role FROM users;` (should error)
6. Test admin panel: login as admin, verify user management works via org_memberships
7. Test cron: `curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/expire-access-grants`

### What comes next

Phase 4: Custom domains, tenant resolution middleware, Caddy integration. This adds the `custom_domains` table, the middleware for resolving org/property from hostname, and the anonymous token validation middleware.
