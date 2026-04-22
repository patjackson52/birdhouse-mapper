# Update Delete Flow (Variant A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the kebab → confirm → undo toast delete flow on the update detail screen, with soft-delete + signed undo token + audit trail.

**Architecture:**
- Soft-delete via new columns on `item_updates` (`deleted_at`, `deleted_by`, `delete_reason`) and a new `audit_log` table.
- RLS restricts UPDATE of `deleted_at` to the author (on their own non-anon updates) or org admin/coordinator. All SELECT policies now require `deleted_at IS NULL`.
- `species_sightings_v` (a view over `item_updates`) reflects soft-delete automatically; **no trigger is needed** — this supersedes the handoff's "trigger that removes rows" instruction (the codebase derives sightings from a view, not a table).
- Two `'use server'` server actions: `softDeleteUpdate()` returns `{ undoToken, expiresAt }` with an HMAC-signed token (13s TTL: 8s UI + 5s grace). `undoDeleteUpdate({ undoToken })` verifies and reverses.
- Frontend: Zustand `deleteSlice` (new dep) hosts pending-delete state at the item page level. `DropdownMenu`, `DeleteConfirmModal`, `UndoToast` are new components matching the prototype spec 1:1.
- Telemetry: new minimal `track()` helper emits the 5 events listed in the handoff.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), TypeScript, Tailwind with project tokens (`forest`, `forest-dark`, `golden`, `parchment`, `sage`, `sage-light`), Zustand (new), Vitest, Playwright.

---

## Out-of-scope (do NOT implement here)

- Admin "recently deleted" recovery view.
- Hard-delete sweeper cron (default 30 days — separate PR).
- Variant B (swipe + moderation mode).
- Resuming the undo toast across navigation reload (undo_token is memory-only; a crashed/reloaded client loses the undo handle, and that is intentional).

---

## Open questions (answered by handoff, codified here so implementers don't re-litigate)

1. **Anon deletion.** Only admins/coordinators can delete anon updates. Authors of anon submissions cannot self-delete. `is_anon_update(u)` SQL helper returns `true` when `created_by IS NULL` OR the creator's active org membership has `roles.base_role = 'public_contributor'`.
2. **Hard-delete retention.** Assumed 30 days before a sweeper hard-deletes. The sweeper is out of scope but the `deleted_at` column and `audit_log` rows make it trivial to add later.
3. **Background-and-return mid-countdown.** Not supported — if user leaves the client, the toast does not resume on return. Server timer keeps ticking regardless.

---

## File structure

### Backend (SQL)

- Create: `supabase/migrations/047_update_soft_delete.sql`
  - Add columns to `item_updates`: `deleted_at timestamptz null`, `deleted_by uuid null references users(id)`, `delete_reason text null check (delete_reason in ('author','moderation'))`.
  - Create `audit_log` table: `id, action text, update_id uuid, actor_user_id uuid, target_author_user_id uuid, was_anon boolean, metadata jsonb, created_at timestamptz default now()`.
  - Create helper `is_anon_update(p_update_id uuid) returns boolean`.
  - Create helper `can_user_delete_update(p_user_id uuid, p_update_id uuid) returns boolean`.
  - Create helper `can_user_undo_delete(p_user_id uuid, p_update_id uuid) returns boolean` — same rule set but also allows the original deleter.
  - Update `item_updates_public_read` policy: add `AND deleted_at IS NULL`.
  - Update `item_updates_update` policy: allow when `check_permission(..., 'updates', 'delete')` **or** `can_user_delete_update(auth.uid(), id)`.
  - Add `audit_log` RLS: only platform_admin + org_admin SELECT; all INSERT via server (no direct client write).
  - Index: `idx_item_updates_deleted_at on item_updates(deleted_at) where deleted_at is not null`.

### Backend (server actions + util)

- Create: `src/lib/delete-updates/undo-token.ts` — HMAC sign/verify (expires_at + update_id + actor_id).
- Create: `src/app/items/[itemId]/updates/actions.ts` — `'use server'` — exports `softDeleteUpdate(updateId)` and `undoDeleteUpdate({ updateId, undoToken })`.
- Create: `src/lib/telemetry/track.ts` — minimal event emitter (console logs + optional POST to internal endpoint stub).

### Frontend (components)

- Create: `src/components/ui/DropdownMenu.tsx` — generic menu + menu item (covers the kebab menu UI in the prototype).
- Create: `src/components/delete/DeleteConfirmModal.tsx` — bottom-sheet confirm with photo/species collateral summary and admin badge.
- Create: `src/components/delete/UndoToast.tsx` — 8s countdown toast with gold progress bar.
- Create: `src/stores/deleteSlice.ts` — Zustand store `{ pending, expiresAt, setPending, clearPending }`.
- Create: `src/components/delete/DeleteToastHost.tsx` — renders `UndoToast` at the item-page root from Zustand state.
- Modify: `src/components/item/timeline/UpdateDetailSheet.tsx` — replace direct `onDelete` call with `DropdownMenu` + open `DeleteConfirmModal` via new props.
- Modify: `src/components/item/timeline/TimelineRail.tsx` — pass `canDelete`, `currentUserId`, `userRole` props through; wire `onDeleteUpdate` to server action + Zustand store.

### Tests

- Create: `src/lib/delete-updates/__tests__/undo-token.test.ts` — sign/verify/expiry.
- Create: `src/app/items/[itemId]/updates/__tests__/actions.test.ts` — server action unit tests with mocked Supabase.
- Modify: `src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx` — permission matrix.
- Create: `src/components/delete/__tests__/DeleteConfirmModal.test.tsx`, `UndoToast.test.tsx`, `DropdownMenu.test.tsx`.
- Create: `e2e/tests/items/update-delete-flow.spec.ts` — full golden path + undo + admin badge.
- Create: `supabase/tests/item_updates_soft_delete_policy.test.sql` (or add to existing RLS test suite).

### Docs

- Create: `docs/adr/0005-update-soft-delete-and-undo-tokens.md` — decision record for the pattern.

---

## Task 1: ADR 0005 — soft-delete architecture

**Files:**
- Create: `docs/adr/0005-update-soft-delete-and-undo-tokens.md`

- [ ] **Step 1: Write the ADR**

Use `scripts/new-adr.sh` if available, otherwise copy `docs/adr/template.md`. Capture:

```markdown
# ADR 0005: Update soft-delete and undo tokens

## Status
Accepted — 2026-04-22

## Context
We are adding a user-initiated delete flow for item_updates. Requirements:
- Authors can delete their own non-anon updates.
- Org admins and coordinators can delete any update in their org (moderation).
- Undo must be available for 8 seconds.
- Deleted updates must not appear in public reads.
- All deletes and undos must be audited.
- species_sightings_v (view over item_updates) must reflect deletes immediately.

## Decision
- **Soft-delete column model.** Add deleted_at/deleted_by/delete_reason to item_updates.
  Do not introduce a tombstone table. Simpler, and leaves room for a future hard-delete
  sweeper.
- **No trigger for species_sightings_v.** The view already projects from item_updates.
  Once the SELECT RLS filter requires deleted_at IS NULL, species_sightings_v
  automatically stops including rows from deleted updates — and restores them on undo.
- **HMAC undo tokens with a 13-second server TTL.** 8s UI window + 5s grace. Token
  payload is {update_id, actor_id, expires_at_ms} signed with server-only secret.
  Token is returned once from softDeleteUpdate and never re-issued.
- **Client-side optimism via Zustand.** Update detail closes immediately, item page
  renders UndoToast driven by a top-level deleteSlice store.

## Consequences
- Positive: Reads stay fast (no join required to filter out deletes; just an index).
- Positive: Anyone writing a new query against item_updates must remember to filter
  deleted_at; this is enforced at the RLS layer for anon + authenticated reads.
- Negative: Internal tooling that bypasses RLS (service role) must include the
  filter manually. Document this near the admin views.
- Negative: Adds a new secret (UPDATE_UNDO_HMAC_SECRET). Must be provisioned in
  Vercel + Supabase environments before rollout.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0005-update-soft-delete-and-undo-tokens.md
git commit -m "docs(adr): 0005 update soft-delete + undo tokens"
```

---

## Task 2: Migration — schema, audit_log, RLS, helpers

**Files:**
- Create: `supabase/migrations/047_update_soft_delete.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 047_update_soft_delete.sql
-- Soft-delete for item_updates: adds deleted_at/deleted_by/delete_reason columns,
-- an audit_log table, helper functions for permission checks, and updates the RLS
-- to (a) hide soft-deleted rows from reads and (b) permit the delete/undo update
-- path for authors and org admins/coordinators.

begin;

-- 1. Soft-delete columns
alter table item_updates
  add column deleted_at    timestamptz null,
  add column deleted_by    uuid null references public.users(id),
  add column delete_reason text null
    check (delete_reason in ('author','moderation'));

create index if not exists idx_item_updates_deleted_at
  on item_updates (deleted_at)
  where deleted_at is not null;

-- 2. Audit log
create table if not exists audit_log (
  id                       uuid primary key default gen_random_uuid(),
  action                   text not null,
  update_id                uuid null references item_updates(id) on delete set null,
  actor_user_id            uuid null references public.users(id),
  target_author_user_id    uuid null references public.users(id),
  was_anon                 boolean not null default false,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now()
);

create index if not exists idx_audit_log_update_id on audit_log(update_id);
create index if not exists idx_audit_log_action_created on audit_log(action, created_at desc);

alter table audit_log enable row level security;

-- Only platform admins + org admins see audit rows; no direct client INSERT
-- (server actions use service role for audit writes).
create policy audit_log_platform_admin on audit_log for select
  to authenticated
  using (is_platform_admin());

create policy audit_log_org_admin on audit_log for select
  to authenticated
  using (
    exists (
      select 1 from item_updates iu
      join properties p on p.id = iu.property_id
      where iu.id = audit_log.update_id
        and p.org_id in (select * from user_org_admin_org_ids())
    )
  );

-- 3. is_anon_update(update_id)
--    True if the update was submitted via the public form (created_by null)
--    OR the creator's ACTIVE org membership on the update's org has base_role
--    'public_contributor'.
create or replace function is_anon_update(p_update_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case
      when iu.created_by is null then true
      when exists (
        select 1
        from org_memberships om
        join roles r on r.id = om.role_id
        where om.user_id = iu.created_by
          and om.org_id = iu.org_id
          and om.status = 'active'
          and r.base_role = 'public_contributor'
      ) then true
      else false
    end
  from item_updates iu
  where iu.id = p_update_id;
$$;

revoke execute on function is_anon_update(uuid) from public;
grant execute on function is_anon_update(uuid) to authenticated, anon;

-- 4. can_user_delete_update(user_id, update_id)
--    Admin/coordinator on the property's org OR author of a non-anon update.
create or replace function can_user_delete_update(p_user_id uuid, p_update_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_property_id uuid;
  v_created_by  uuid;
  v_is_anon     boolean;
begin
  select iu.property_id, iu.created_by into v_property_id, v_created_by
  from item_updates iu where iu.id = p_update_id;

  if v_property_id is null then return false; end if;

  -- Admin/coordinator path
  if check_permission(p_user_id, v_property_id, 'updates', 'delete_any') then
    return true;
  end if;

  -- Author path (non-anon only)
  v_is_anon := is_anon_update(p_update_id);
  if v_is_anon then return false; end if;
  return v_created_by = p_user_id;
end;
$$;

revoke execute on function can_user_delete_update(uuid, uuid) from public;
grant execute on function can_user_delete_update(uuid, uuid) to authenticated;

-- 5. Ensure the 'updates.delete_any' permission exists on roles. The seeded
--    role JSON for org_admin + coordinator needs it. This is idempotent.
update roles
set permissions = jsonb_set(
  permissions,
  '{updates,delete_any}',
  to_jsonb(true),
  true
)
where base_role in ('org_admin','coordinator','platform_admin');

-- 6. RLS: public_read must hide deleted rows
drop policy if exists item_updates_public_read on item_updates;
create policy item_updates_public_read on item_updates for select
  to anon, authenticated
  using (deleted_at is null);

-- 7. RLS: the existing update policy already allows edits via
--    check_permission(..., 'updates', 'edit_any'). Add a second policy that
--    permits updates when can_user_delete_update() is true, so that authors
--    can write deleted_at on their own updates without having edit_any.
create policy item_updates_soft_delete on item_updates for update
  to authenticated
  using (can_user_delete_update(auth.uid(), id))
  with check (can_user_delete_update(auth.uid(), id));

commit;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up` (or the project's equivalent — check AGENTS.md for the exact command).

Expected: Migration applies without error. Re-running is a no-op for idempotent parts.

- [ ] **Step 3: Verify schema in the Supabase SQL editor or psql**

```sql
\d item_updates
-- expect columns deleted_at, deleted_by, delete_reason

select proname from pg_proc where proname in ('is_anon_update','can_user_delete_update');
-- expect 2 rows

select policyname from pg_policies where tablename = 'item_updates';
-- expect: item_updates_public_read, item_updates_insert, item_updates_update,
-- item_updates_soft_delete, item_updates_delete
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/047_update_soft_delete.sql
git commit -m "feat(db): soft-delete columns + audit_log + RLS for item_updates"
```

- [ ] **Step 5: Open WIP PR after this commit** (per handoff)

```bash
git push -u origin update-deletes
gh pr create --draft --title "WIP: update delete flow" --body "Data model + RLS landed. Rest of flow in follow-up commits."
```

---

## Task 3: Undo token — HMAC sign/verify

**Files:**
- Create: `src/lib/delete-updates/undo-token.ts`
- Create: `src/lib/delete-updates/__tests__/undo-token.test.ts`

- [ ] **Step 1: Write failing tests**

Paste into `src/lib/delete-updates/__tests__/undo-token.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { signUndoToken, verifyUndoToken } from '../undo-token';

beforeAll(() => {
  process.env.UPDATE_UNDO_HMAC_SECRET = 'test-secret-key-32-bytes-minimum-aaaa';
});

describe('undo-token', () => {
  it('signs and verifies a valid token', () => {
    const token = signUndoToken({
      updateId: '00000000-0000-0000-0000-000000000001',
      actorId: '00000000-0000-0000-0000-000000000002',
      expiresAtMs: Date.now() + 10_000,
    });
    const payload = verifyUndoToken(token);
    expect(payload.ok).toBe(true);
    if (payload.ok) {
      expect(payload.updateId).toBe('00000000-0000-0000-0000-000000000001');
      expect(payload.actorId).toBe('00000000-0000-0000-0000-000000000002');
    }
  });

  it('rejects an expired token', () => {
    const token = signUndoToken({
      updateId: 'u1',
      actorId: 'a1',
      expiresAtMs: Date.now() - 1,
    });
    const result = verifyUndoToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('rejects a tampered token', () => {
    const token = signUndoToken({
      updateId: 'u1',
      actorId: 'a1',
      expiresAtMs: Date.now() + 10_000,
    });
    const tampered = token.slice(0, -4) + 'xxxx';
    const result = verifyUndoToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/lib/delete-updates/__tests__/undo-token.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Paste into `src/lib/delete-updates/undo-token.ts`:

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET_ENV = 'UPDATE_UNDO_HMAC_SECRET';

export type UndoTokenPayload = {
  updateId: string;
  actorId: string;
  expiresAtMs: number;
};

export type VerifyResult =
  | ({ ok: true } & UndoTokenPayload)
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

function getSecret(): string {
  const s = process.env[SECRET_ENV];
  if (!s || s.length < 32) {
    throw new Error(`${SECRET_ENV} must be set to at least 32 bytes`);
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function signUndoToken(p: UndoTokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(p), 'utf8'));
  const sig = b64url(createHmac('sha256', getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyUndoToken(token: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts;
  const expected = createHmac('sha256', getSecret()).update(body).digest();
  const given = b64urlDecode(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }
  let payload: UndoTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.expiresAtMs !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (Date.now() > payload.expiresAtMs) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, ...payload };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test -- src/lib/delete-updates/__tests__/undo-token.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/delete-updates/
git commit -m "feat(delete): HMAC undo token sign/verify"
```

---

## Task 4: Server action — soft-delete

**Files:**
- Create: `src/app/items/[itemId]/updates/actions.ts`
- Create: `src/app/items/[itemId]/updates/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test** (only the soft-delete half for this task)

Paste into `src/app/items/[itemId]/updates/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdate = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn((table: string) => {
  if (table === 'item_updates') {
    return {
      update: mockUpdate,
      select: () => ({ eq: () => ({ single: mockSingle }) }),
    };
  }
  if (table === 'audit_log') return { insert: mockInsert };
  throw new Error('unexpected table: ' + table);
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: mockFrom,
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.UPDATE_UNDO_HMAC_SECRET = 'test-secret-key-32-bytes-minimum-aaaa';
});

import { softDeleteUpdate } from '../actions';

describe('softDeleteUpdate', () => {
  it('returns an undo token and expiresAt on success', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'u-1', created_by: 'user-1', org_id: 'org-1' },
      error: null,
    });
    mockUpdate.mockReturnValue({
      eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'u-1' }, error: null }) }) }),
    });
    mockInsert.mockResolvedValue({ error: null });

    const result = await softDeleteUpdate('u-1');
    expect('undoToken' in result).toBe(true);
    if ('undoToken' in result) {
      expect(typeof result.undoToken).toBe('string');
      expect(result.expiresAtMs).toBeGreaterThan(Date.now());
    }
  });

  it('returns { error } when unauthenticated', async () => {
    // re-mock auth
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockReturnValueOnce({
      from: mockFrom,
      auth: { getUser: async () => ({ data: { user: null } }) },
      rpc: vi.fn(),
    } as any);
    const result = await softDeleteUpdate('u-1');
    expect('error' in result).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect failure (module missing)**

Run: `npm run test -- src/app/items/[itemId]/updates/__tests__/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement softDeleteUpdate**

Paste into `src/app/items/[itemId]/updates/actions.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { signUndoToken, verifyUndoToken } from '@/lib/delete-updates/undo-token';

const UNDO_WINDOW_MS = 13_000; // 8s UI + 5s grace

type SoftDeleteSuccess = { undoToken: string; expiresAtMs: number; deletedAt: string };
type SoftDeleteError = { error: string };

export async function softDeleteUpdate(
  updateId: string
): Promise<SoftDeleteSuccess | SoftDeleteError> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { error: 'unauthenticated' };
  const actorId = userRes.user.id;

  // Permission check is enforced by RLS; we still pre-check for a clean error
  const { data: canDelete, error: rpcErr } = await supabase.rpc(
    'can_user_delete_update',
    { p_user_id: actorId, p_update_id: updateId }
  );
  if (rpcErr) return { error: rpcErr.message };
  if (!canDelete) return { error: 'forbidden' };

  // Read the update first (for audit metadata + reason classification)
  const { data: row, error: readErr } = await supabase
    .from('item_updates')
    .select('id, created_by, org_id, property_id')
    .eq('id', updateId)
    .single();
  if (readErr || !row) return { error: readErr?.message ?? 'not_found' };

  const { data: wasAnonRpc } = await supabase.rpc('is_anon_update', { p_update_id: updateId });
  const wasAnon = Boolean(wasAnonRpc);
  const isSelfDelete = row.created_by === actorId && !wasAnon;
  const reason = isSelfDelete ? 'author' : 'moderation';

  const deletedAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('item_updates')
    .update({ deleted_at: deletedAt, deleted_by: actorId, delete_reason: reason })
    .eq('id', updateId);
  if (updErr) return { error: updErr.message };

  // Audit
  await supabase.from('audit_log').insert({
    action: 'update.delete',
    update_id: updateId,
    actor_user_id: actorId,
    target_author_user_id: row.created_by,
    was_anon: wasAnon,
    metadata: { reason },
  });

  const expiresAtMs = Date.now() + UNDO_WINDOW_MS;
  const undoToken = signUndoToken({ updateId, actorId, expiresAtMs });
  return { undoToken, expiresAtMs, deletedAt };
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/app/items/[itemId]/updates/__tests__/actions.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/items/[itemId]/updates/
git commit -m "feat(delete): softDeleteUpdate server action + audit write"
```

---

## Task 5: Server action — undo

**Files:**
- Modify: `src/app/items/[itemId]/updates/actions.ts`
- Modify: `src/app/items/[itemId]/updates/__tests__/actions.test.ts`

- [ ] **Step 1: Add failing tests for undo**

Append to the existing test file:

```typescript
import { undoDeleteUpdate } from '../actions';
import { signUndoToken } from '@/lib/delete-updates/undo-token';

describe('undoDeleteUpdate', () => {
  it('clears deleted_at when token is valid and actor matches', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'u-1', created_by: 'user-1', org_id: 'org-1', deleted_at: new Date().toISOString() },
      error: null,
    });
    mockUpdate.mockReturnValue({
      eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'u-1' }, error: null }) }) }),
    });
    mockInsert.mockResolvedValue({ error: null });

    const token = signUndoToken({
      updateId: 'u-1',
      actorId: 'user-1',
      expiresAtMs: Date.now() + 10_000,
    });
    const result = await undoDeleteUpdate({ updateId: 'u-1', undoToken: token });
    expect('success' in result && result.success).toBe(true);
  });

  it('rejects an expired token with status: gone', async () => {
    const token = signUndoToken({
      updateId: 'u-1',
      actorId: 'user-1',
      expiresAtMs: Date.now() - 1,
    });
    const result = await undoDeleteUpdate({ updateId: 'u-1', undoToken: token });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toBe('gone');
  });

  it('rejects a mismatched actor with forbidden', async () => {
    const token = signUndoToken({
      updateId: 'u-1',
      actorId: 'someone-else',
      expiresAtMs: Date.now() + 10_000,
    });
    const result = await undoDeleteUpdate({ updateId: 'u-1', undoToken: token });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toBe('forbidden');
  });

  it('rejects a mismatched updateId', async () => {
    const token = signUndoToken({
      updateId: 'different',
      actorId: 'user-1',
      expiresAtMs: Date.now() + 10_000,
    });
    const result = await undoDeleteUpdate({ updateId: 'u-1', undoToken: token });
    expect('error' in result).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect fail (undoDeleteUpdate missing)**

Run: `npm run test -- src/app/items/[itemId]/updates/__tests__/actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement undoDeleteUpdate**

Append to `src/app/items/[itemId]/updates/actions.ts`:

```typescript
type UndoSuccess = { success: true };
type UndoError = { error: 'unauthenticated' | 'gone' | 'forbidden' | 'not_found' | string };

export async function undoDeleteUpdate(
  args: { updateId: string; undoToken: string }
): Promise<UndoSuccess | UndoError> {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { error: 'unauthenticated' };
  const actorId = userRes.user.id;

  const verified = verifyUndoToken(args.undoToken);
  if (!verified.ok) {
    if (verified.reason === 'expired') return { error: 'gone' };
    return { error: 'forbidden' };
  }
  if (verified.updateId !== args.updateId) return { error: 'forbidden' };
  if (verified.actorId !== actorId) return { error: 'forbidden' };

  const { data: row } = await supabase
    .from('item_updates')
    .select('id, created_by, deleted_at')
    .eq('id', args.updateId)
    .single();
  if (!row) return { error: 'not_found' };
  if (!row.deleted_at) return { success: true }; // already restored; idempotent

  const { error: updErr } = await supabase
    .from('item_updates')
    .update({ deleted_at: null, deleted_by: null, delete_reason: null })
    .eq('id', args.updateId);
  if (updErr) return { error: updErr.message };

  await supabase.from('audit_log').insert({
    action: 'update.undo_delete',
    update_id: args.updateId,
    actor_user_id: actorId,
    target_author_user_id: row.created_by,
    was_anon: false,
    metadata: {},
  });

  return { success: true };
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/app/items/[itemId]/updates/__tests__/actions.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/items/[itemId]/updates/
git commit -m "feat(delete): undoDeleteUpdate server action"
```

---

## Task 6: Telemetry helper

**Files:**
- Create: `src/lib/telemetry/track.ts`
- Create: `src/lib/telemetry/__tests__/track.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/telemetry/__tests__/track.test.ts
import { describe, it, expect, vi } from 'vitest';
import { track } from '../track';

describe('track', () => {
  it('logs event name and properties in dev', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    track('update.delete.initiated', { update_id: 'u-1', role: 'author', is_own: true, is_anon_update: false });
    expect(spy).toHaveBeenCalledWith('[telemetry]', 'update.delete.initiated', expect.objectContaining({ update_id: 'u-1' }));
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/lib/telemetry/track.ts
export type TrackEvent =
  | 'update.delete.initiated'
  | 'update.delete.confirmed'
  | 'update.delete.cancelled_from_modal'
  | 'update.delete.undone'
  | 'update.delete.expired';

export function track(event: TrackEvent, props: Record<string, unknown> = {}): void {
  if (typeof window !== 'undefined') {
    // Browser: log for now; a provider can be wired later.
    console.info('[telemetry]', event, props);
  } else {
    console.info('[telemetry]', event, props);
  }
}
```

- [ ] **Step 3: Run + commit**

Run: `npm run test -- src/lib/telemetry`
Expected: PASS.

```bash
git add src/lib/telemetry/
git commit -m "feat(telemetry): minimal track() helper for delete events"
```

---

## Task 7: Add Zustand dep + deleteSlice store

**Files:**
- Modify: `package.json`
- Create: `src/stores/deleteSlice.ts`
- Create: `src/stores/__tests__/deleteSlice.test.ts`

- [ ] **Step 1: Install Zustand**

Run: `npm install zustand`
Expected: added 1 package.

- [ ] **Step 2: Write failing test**

```typescript
// src/stores/__tests__/deleteSlice.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDeleteStore } from '../deleteSlice';

describe('deleteSlice', () => {
  beforeEach(() => {
    useDeleteStore.getState().clearPending();
  });

  it('sets a pending delete and exposes expiresAt', () => {
    const expiresAt = Date.now() + 8000;
    useDeleteStore.getState().setPending({ updateId: 'u-1', undoToken: 'tok', expiresAtMs: expiresAt });
    const s = useDeleteStore.getState();
    expect(s.pending?.updateId).toBe('u-1');
    expect(s.pending?.expiresAtMs).toBe(expiresAt);
  });

  it('clearPending returns to null', () => {
    useDeleteStore.getState().setPending({ updateId: 'u-1', undoToken: 't', expiresAtMs: Date.now() + 8000 });
    useDeleteStore.getState().clearPending();
    expect(useDeleteStore.getState().pending).toBe(null);
  });
});
```

- [ ] **Step 3: Implement**

```typescript
// src/stores/deleteSlice.ts
'use client';

import { create } from 'zustand';

export type PendingDelete = {
  updateId: string;
  undoToken: string;
  expiresAtMs: number;
};

type State = {
  pending: PendingDelete | null;
  setPending: (p: PendingDelete) => void;
  clearPending: () => void;
};

export const useDeleteStore = create<State>((set) => ({
  pending: null,
  setPending: (p) => set({ pending: p }),
  clearPending: () => set({ pending: null }),
}));
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/stores/`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/stores/
git commit -m "feat(stores): Zustand deleteSlice for pending undo state"
```

---

## Task 8: DropdownMenu component

**Files:**
- Create: `src/components/ui/DropdownMenu.tsx`
- Create: `src/components/ui/__tests__/DropdownMenu.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/ui/__tests__/DropdownMenu.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DropdownMenu, DropdownMenuItem } from '../DropdownMenu';

describe('DropdownMenu', () => {
  it('renders children when open', () => {
    render(
      <DropdownMenu open onClose={() => {}}>
        <DropdownMenuItem onSelect={() => {}}>Share</DropdownMenuItem>
      </DropdownMenu>
    );
    expect(screen.getByText('Share')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <DropdownMenu open={false} onClose={() => {}}>
        <DropdownMenuItem onSelect={() => {}}>Share</DropdownMenuItem>
      </DropdownMenu>
    );
    expect(container.textContent).not.toContain('Share');
  });

  it('disabled item shows note and is not clickable', () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu open onClose={() => {}}>
        <DropdownMenuItem onSelect={onSelect} disabled note="Only author or admin">
          Delete
        </DropdownMenuItem>
      </DropdownMenu>
    );
    expect(screen.getByText('Only author or admin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('danger variant with ADMIN badge renders the badge', () => {
    render(
      <DropdownMenu open onClose={() => {}}>
        <DropdownMenuItem onSelect={() => {}} danger badge="ADMIN">
          Delete (admin)
        </DropdownMenuItem>
      </DropdownMenu>
    );
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect fail**

Run: `npm run test -- src/components/ui/`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/components/ui/DropdownMenu.tsx
'use client';

import { ReactNode } from 'react';

export function DropdownMenu({
  open,
  onClose,
  children,
  align = 'right',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'right' | 'left';
}) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="fixed inset-0 z-[200] cursor-default"
      />
      <div
        role="menu"
        className={[
          'absolute top-[100px] z-[201] min-w-[200px] overflow-hidden rounded-xl border border-forest-border-soft bg-white shadow-[0_12px_32px_rgba(0,0,0,0.18)]',
          align === 'right' ? 'right-[14px]' : 'left-[14px]',
          'fm-menu-in',
        ].join(' ')}
      >
        {children}
      </div>
    </>
  );
}

export function DropdownMenuDivider() {
  return <div className="h-px bg-forest-border-soft" />;
}

export function DropdownMenuItem({
  children,
  onSelect,
  icon,
  danger,
  disabled,
  note,
  badge,
}: {
  children: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  note?: string;
  badge?: string;
}) {
  const textColor = disabled ? 'text-sage' : danger ? 'text-[#B3321F]' : 'text-forest-dark';
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={[
        'flex w-full items-center gap-[10px] px-[14px] py-3 text-left font-body text-[14px] font-medium',
        textColor,
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-parchment',
      ].join(' ')}
    >
      {icon && <span className="flex h-[17px] w-[17px] items-center justify-center">{icon}</span>}
      <span className="flex-1">{children}</span>
      {badge && (
        <span className="rounded-[3px] bg-[#B3321F] px-[5px] py-[1.5px] text-[9px] font-bold uppercase tracking-[0.4px] text-white">
          {badge}
        </span>
      )}
      {note && <span className="text-[11px] font-normal text-sage">{note}</span>}
    </button>
  );
}
```

Also add the `fm-menu-in` keyframe in `src/components/item/timeline/timeline.css` (or create a new shared stylesheet):

```css
@keyframes fm-menu-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
.fm-menu-in { animation: fm-menu-in 0.16s ease-out; }
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/components/ui/`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ src/components/item/timeline/timeline.css
git commit -m "feat(ui): DropdownMenu + menu item primitives"
```

---

## Task 9: DeleteConfirmModal component

**Files:**
- Create: `src/components/delete/DeleteConfirmModal.tsx`
- Create: `src/components/delete/__tests__/DeleteConfirmModal.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/delete/__tests__/DeleteConfirmModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeleteConfirmModal } from '../DeleteConfirmModal';

describe('DeleteConfirmModal', () => {
  const base = {
    open: true,
    onCancel: () => {},
    onConfirm: () => {},
    photoCount: 0,
    speciesCount: 0,
    permission: { kind: 'author' as const },
  };

  it('shows the admin badge when permission.kind is admin', () => {
    render(<DeleteConfirmModal {...base} permission={{ kind: 'admin' }} />);
    expect(screen.getByText(/DELETE OTHERS' UPDATE/)).toBeInTheDocument();
  });

  it('omits " along with:" when no collateral', () => {
    render(<DeleteConfirmModal {...base} />);
    const body = screen.getByText(/This cannot be reversed after 8 seconds/);
    expect(body.textContent).not.toContain('along with:');
  });

  it('includes " along with:" + photos bullet when photoCount > 0', () => {
    render(<DeleteConfirmModal {...base} photoCount={3} />);
    expect(screen.getByText(/along with:/)).toBeInTheDocument();
    expect(screen.getByText(/3/).closest('li')?.textContent).toMatch(/photos/);
  });

  it('shows species-count-propagation copy when speciesCount > 0', () => {
    render(<DeleteConfirmModal {...base} speciesCount={2} />);
    expect(
      screen.getByText(/counts update everywhere this species appears/i)
    ).toBeInTheDocument();
  });

  it('pluralizes photo/sighting correctly for count = 1', () => {
    render(<DeleteConfirmModal {...base} photoCount={1} speciesCount={1} />);
    expect(screen.getByText(/1 photo\b/)).toBeInTheDocument();
    expect(screen.getByText(/1 species sighting\b/)).toBeInTheDocument();
  });

  it('Cancel button calls onCancel', () => {
    const onCancel = vi.fn();
    render(<DeleteConfirmModal {...base} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('Delete permanently button calls onConfirm', () => {
    const onConfirm = vi.fn();
    render(<DeleteConfirmModal {...base} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/delete/DeleteConfirmModal.tsx
'use client';

export type DeletePermission = { kind: 'author' | 'admin' };

export function DeleteConfirmModal({
  open,
  onCancel,
  onConfirm,
  photoCount,
  speciesCount,
  permission,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  photoCount: number;
  speciesCount: number;
  permission: DeletePermission;
}) {
  if (!open) return null;
  const isAdmin = permission.kind === 'admin';
  const hasCollateral = photoCount > 0 || speciesCount > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      className="fixed inset-0 z-[300] flex items-end justify-center bg-[rgba(31,42,31,0.55)] backdrop-blur-[2px] fm-fade"
    >
      <div className="w-full rounded-t-[18px] bg-white px-5 pb-4 pt-5 font-body fm-sheet-up">
        <div className="mx-auto mb-[14px] h-1 w-9 rounded-full bg-forest-border" />
        {isAdmin && (
          <div className="mb-[10px] inline-flex items-center gap-[5px] rounded-full bg-[#FBE9E5] px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.8px] text-[#7A1B0F]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 1l3 6 6 1-4.5 4.5 1 6.5L12 16l-5.5 3 1-6.5L3 8l6-1z" />
            </svg>
            ADMIN · DELETE OTHERS' UPDATE
          </div>
        )}
        <h2
          id="delete-confirm-title"
          className="m-0 font-heading text-[22px] font-medium leading-tight text-forest-dark"
        >
          Delete this update?
        </h2>
        <p className="my-2 mb-[14px] text-[14px] leading-[1.5] text-sage">
          This cannot be reversed after 8 seconds. The update will be permanently removed from the timeline
          {hasCollateral ? ' along with:' : '.'}
        </p>
        {hasCollateral && (
          <ul className="mb-4 ml-[18px] list-disc text-[13.5px] leading-[1.7] text-forest-dark">
            {photoCount > 0 && (
              <li>
                <b className="font-semibold">{photoCount}</b> {photoCount === 1 ? 'photo' : 'photos'}
              </li>
            )}
            {speciesCount > 0 && (
              <li>
                <b className="font-semibold">{speciesCount}</b> species {speciesCount === 1 ? 'sighting' : 'sightings'}{' '}
                <span className="text-sage">(counts update everywhere this species appears)</span>
              </li>
            )}
          </ul>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[10px] border border-forest-border bg-white px-3 py-[13px] text-[14px] font-medium text-forest-dark"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-[1.2] rounded-[10px] bg-[#B3321F] px-3 py-[13px] text-[14px] font-semibold text-white"
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
```

Append to `timeline.css` (or shared CSS):

```css
@keyframes fm-fade { from { opacity: 0; } to { opacity: 1; } }
.fm-fade { animation: fm-fade 0.2s ease-out; }
@keyframes fm-sheet-up { from { transform: translateY(100%); } to { transform: none; } }
.fm-sheet-up { animation: fm-sheet-up 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); }
```

- [ ] **Step 3: Run tests + commit**

Run: `npm run test -- src/components/delete/`
Expected: 7 passing.

```bash
git add src/components/delete/ src/components/item/timeline/timeline.css
git commit -m "feat(delete): DeleteConfirmModal bottom sheet"
```

---

## Task 10: UndoToast component

**Files:**
- Create: `src/components/delete/UndoToast.tsx`
- Create: `src/components/delete/__tests__/UndoToast.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/delete/__tests__/UndoToast.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UndoToast } from '../UndoToast';

describe('UndoToast', () => {
  it('returns null when no pending', () => {
    const { container } = render(<UndoToast pending={null} onUndo={() => {}} onExpire={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('shows "Permanent in Ns" with rounded-up seconds', () => {
    const expiresAtMs = Date.now() + 5500;
    render(
      <UndoToast
        pending={{ updateId: 'u-1', undoToken: 't', expiresAtMs }}
        onUndo={() => {}}
        onExpire={() => {}}
      />
    );
    expect(screen.getByText(/Permanent in 6s/)).toBeInTheDocument();
  });

  it('calls onUndo when the Undo button is clicked', () => {
    const onUndo = vi.fn();
    render(
      <UndoToast
        pending={{ updateId: 'u-1', undoToken: 't', expiresAtMs: Date.now() + 8000 }}
        onUndo={onUndo}
        onExpire={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(onUndo).toHaveBeenCalled();
  });

  it('fires onExpire after the deadline passes', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    render(
      <UndoToast
        pending={{ updateId: 'u-1', undoToken: 't', expiresAtMs: Date.now() + 200 }}
        onUndo={() => {}}
        onExpire={onExpire}
      />
    );
    act(() => { vi.advanceTimersByTime(400); });
    expect(onExpire).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/delete/UndoToast.tsx
'use client';

import { useEffect, useState } from 'react';
import type { PendingDelete } from '@/stores/deleteSlice';

const TOTAL_UI_MS = 8000;

export function UndoToast({
  pending,
  onUndo,
  onExpire,
}: {
  pending: PendingDelete | null;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!pending) return;
    const i = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(i);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    if (Date.now() >= pending.expiresAtMs) onExpire();
  });

  if (!pending) return null;
  const remainingMs = Math.max(0, pending.expiresAtMs - Date.now());
  const pct = Math.max(0, Math.min(100, (remainingMs / TOTAL_UI_MS) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed bottom-7 left-[14px] right-[14px] z-[250] flex items-center gap-[10px] overflow-hidden rounded-[12px] bg-forest-dark px-[14px] py-3 text-white shadow-[0_10px_28px_rgba(0,0,0,0.28)] font-body fm-toast-in"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-90">
        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
      </svg>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">Update deleted</div>
        <div className="text-[11.5px] opacity-75">Permanent in {Math.ceil(remainingMs / 1000)}s</div>
      </div>
      <button
        type="button"
        onClick={onUndo}
        className="rounded-[8px] bg-white/15 px-[14px] py-2 text-[13px] font-semibold tracking-[0.2px] text-white"
      >
        Undo
      </button>
      <div
        className="absolute bottom-0 left-0 h-[3px] bg-golden transition-[width] duration-100 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
```

Append to `timeline.css`:

```css
@keyframes fm-toast-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.fm-toast-in { animation: fm-toast-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); }
```

- [ ] **Step 3: Run tests + commit**

Run: `npm run test -- src/components/delete/`
Expected: 11 passing total (7 from Task 9 + 4 new).

```bash
git add src/components/delete/ src/components/item/timeline/timeline.css
git commit -m "feat(delete): UndoToast with countdown + gold progress bar"
```

---

## Task 11: DeleteToastHost — mounts UndoToast + wires server actions

**Files:**
- Create: `src/components/delete/DeleteToastHost.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/delete/DeleteToastHost.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useDeleteStore } from '@/stores/deleteSlice';
import { UndoToast } from './UndoToast';
import { undoDeleteUpdate } from '@/app/items/[itemId]/updates/actions';
import { track } from '@/lib/telemetry/track';

export function DeleteToastHost() {
  const pending = useDeleteStore((s) => s.pending);
  const clearPending = useDeleteStore((s) => s.clearPending);
  const router = useRouter();

  const handleUndo = async () => {
    if (!pending) return;
    const started = pending.expiresAtMs - 8000;
    const elapsedMs = Date.now() - started;
    const res = await undoDeleteUpdate({ updateId: pending.updateId, undoToken: pending.undoToken });
    if ('success' in res) {
      track('update.delete.undone', { update_id: pending.updateId, elapsed_ms: elapsedMs });
      clearPending();
      router.refresh();
    } else {
      // 'gone' or 'forbidden' — toast will fall off on next tick via onExpire
      clearPending();
    }
  };

  const handleExpire = () => {
    if (!pending) return;
    track('update.delete.expired', { update_id: pending.updateId });
    clearPending();
  };

  return <UndoToast pending={pending} onUndo={handleUndo} onExpire={handleExpire} />;
}
```

- [ ] **Step 2: Commit** (no new tests — behavior covered by UndoToast + deleteSlice tests + E2E)

```bash
git add src/components/delete/DeleteToastHost.tsx
git commit -m "feat(delete): DeleteToastHost wires UndoToast to server actions"
```

---

## Task 12: Wire DropdownMenu + DeleteConfirmModal into UpdateDetailSheet

**Files:**
- Modify: `src/components/item/timeline/UpdateDetailSheet.tsx`
- Modify: `src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx`

- [ ] **Step 1: Update the props contract and rendering**

Replace the kebab section (lines 65-76) and add imports at the top. Full replacement:

```tsx
// Top of UpdateDetailSheet.tsx — add imports
import { useState } from 'react';
import { DropdownMenu, DropdownMenuDivider, DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { DeleteConfirmModal, type DeletePermission } from '@/components/delete/DeleteConfirmModal';
```

Change the component signature to:

```tsx
export function UpdateDetailSheet({
  update,
  onClose,
  onRequestDelete,
  deletePermission,
  currentUserId,
}: {
  update: EnrichedUpdate | null;
  onClose: () => void;
  /** Called when user clicks "Delete permanently" in the confirm modal. */
  onRequestDelete: (update: EnrichedUpdate, permission: DeletePermission) => void;
  /** null = user cannot delete and the menu item is disabled with "Only author or admin" */
  deletePermission: DeletePermission | null;
  currentUserId: string | null;
}) {
```

Inside the component (after `if (!update) return null;`):

```tsx
const [menuOpen, setMenuOpen] = useState(false);
const [confirmOpen, setConfirmOpen] = useState(false);
const photos = update.photos ?? [];
const species = update.species ?? [];
const photoCount = photos.length;
const speciesCount = species.length;
```

Replace the kebab button block with:

```tsx
<div className="absolute right-[14px] top-[58px]">
  <button
    type="button"
    aria-label="More"
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur"
    onClick={() => setMenuOpen((v) => !v)}
  >
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" className="text-forest-dark">
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  </button>
  <DropdownMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
    <DropdownMenuItem onSelect={() => { /* share — wire later */ setMenuOpen(false); }}>Share</DropdownMenuItem>
    <DropdownMenuItem onSelect={() => { /* copy link — wire later */ setMenuOpen(false); }}>Copy link</DropdownMenuItem>
    <DropdownMenuDivider />
    {deletePermission ? (
      <DropdownMenuItem
        danger
        badge={deletePermission.kind === 'admin' ? 'ADMIN' : undefined}
        onSelect={() => { setMenuOpen(false); setConfirmOpen(true); }}
      >
        {deletePermission.kind === 'admin' ? 'Delete (admin)' : 'Delete'}
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem disabled note="Only author or admin" danger onSelect={() => {}}>
        Delete
      </DropdownMenuItem>
    )}
  </DropdownMenu>
</div>

{deletePermission && (
  <DeleteConfirmModal
    open={confirmOpen}
    permission={deletePermission}
    photoCount={photoCount}
    speciesCount={speciesCount}
    onCancel={() => setConfirmOpen(false)}
    onConfirm={() => {
      setConfirmOpen(false);
      onRequestDelete(update, deletePermission);
    }}
  />
)}
```

- [ ] **Step 2: Update existing test file**

Replace the old prop contract. Paste into `src/components/item/timeline/__tests__/UpdateDetailSheet.test.tsx` (merging with existing cases — add new describe block):

```typescript
describe('UpdateDetailSheet delete flow', () => {
  const base = {
    update: {
      id: 'u-1',
      item_id: 'i-1',
      property_id: 'p-1',
      org_id: 'o-1',
      update_type_id: 'ut-1',
      content: 'x',
      update_date: '2026-04-10',
      created_at: '2026-04-10T00:00:00Z',
      created_by: 'user-1',
      anon_name: null,
      custom_field_values: {},
      photos: [],
      species: [],
      fields: [],
      update_type: { id: 'ut-1', name: 'Observation', icon: '📝' },
    } as any,
    onClose: () => {},
    onRequestDelete: () => {},
    currentUserId: 'user-1',
  };

  it('disabled delete item renders "Only author or admin" when deletePermission is null', async () => {
    render(<UpdateDetailSheet {...base} deletePermission={null} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText(/Only author or admin/)).toBeInTheDocument();
  });

  it('admin permission shows "Delete (admin)" with ADMIN badge', () => {
    render(<UpdateDetailSheet {...base} deletePermission={{ kind: 'admin' }} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.getByText('Delete (admin)')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
  });

  it('clicking Delete then Delete permanently calls onRequestDelete', () => {
    const onRequestDelete = vi.fn();
    render(<UpdateDetailSheet {...base} deletePermission={{ kind: 'author' }} onRequestDelete={onRequestDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete$/ }));
    fireEvent.click(screen.getByRole('button', { name: /delete permanently/i }));
    expect(onRequestDelete).toHaveBeenCalledWith(base.update, { kind: 'author' });
  });
});
```

Remove any test cases that reference the old `canDelete`/`canEdit`/`onDelete` props.

- [ ] **Step 3: Update TimelineRail to new contract**

In `src/components/item/timeline/TimelineRail.tsx`:

```tsx
// Replace the UpdateDetailSheet render with:
<UpdateDetailSheet
  update={open}
  onClose={() => setOpenId(null)}
  currentUserId={currentUserId ?? null}
  deletePermission={computeDeletePermission(open, currentUserId, userRole)}
  onRequestDelete={(u, perm) => {
    setOpenId(null);
    onDeleteUpdate(u.id, perm);
  }}
/>
```

And the TimelineRail prop contract changes:

```tsx
export function TimelineRail({
  updates,
  maxItems,
  showScheduled = true,
  canAddUpdate,
  currentUserId,
  userRole,
  onAddUpdate,
  onDeleteUpdate,
}: {
  updates: EnrichedUpdate[];
  maxItems?: number;
  showScheduled?: boolean;
  canAddUpdate: boolean;
  currentUserId: string | null;
  userRole: 'admin' | 'coordinator' | 'member' | 'public_contributor' | null;
  onAddUpdate?: () => void;
  onDeleteUpdate: (id: string, permission: DeletePermission) => void;
}) {
```

Add `computeDeletePermission` helper at the bottom of `TimelineRail.tsx`:

```tsx
import type { DeletePermission } from '@/components/delete/DeleteConfirmModal';

function computeDeletePermission(
  update: EnrichedUpdate | null,
  currentUserId: string | null,
  role: 'admin' | 'coordinator' | 'member' | 'public_contributor' | null
): DeletePermission | null {
  if (!update || !currentUserId) return null;
  if (role === 'admin' || role === 'coordinator') return { kind: 'admin' };
  const isAnon = !update.created_by || update.anon_name != null;
  if (!isAnon && update.created_by === currentUserId) return { kind: 'author' };
  return null;
}
```

(`EnrichedUpdate` already extends `ItemUpdate` with `created_by` and `anon_name` — no type change needed.)

- [ ] **Step 4: Run tests**

Run: `npm run test -- src/components/item/timeline/`
Expected: all passing.

- [ ] **Step 5: Run type-check**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/item/timeline/ src/lib/types.ts
git commit -m "feat(timeline): kebab menu + DeleteConfirmModal integration"
```

---

## Task 13: Page-level wiring — call server action, mount DeleteToastHost

**Files:**
- Modify: the item page that renders `<TimelineRail />`. Find it via `grep -r "TimelineRail" src/app`. Likely `src/app/(...)/items/[itemId]/page.tsx` or a client child component.

- [ ] **Step 1: Locate the parent**

Run: `grep -rn "TimelineRail" src/app src/components | grep -v __tests__`
Note the parent file path — use it in Step 2.

- [ ] **Step 2: Wire softDeleteUpdate + Zustand + DeleteToastHost**

In the parent (which must be a client component — add `'use client'` if not already):

```tsx
// imports
import { useDeleteStore } from '@/stores/deleteSlice';
import { softDeleteUpdate } from '@/app/items/[itemId]/updates/actions';
import { DeleteToastHost } from '@/components/delete/DeleteToastHost';
import { track } from '@/lib/telemetry/track';

// inside the component
const setPending = useDeleteStore((s) => s.setPending);

const handleDelete = async (
  updateId: string,
  permission: { kind: 'author' | 'admin' }
) => {
  track('update.delete.initiated', {
    update_id: updateId,
    role: permission.kind,
    is_own: permission.kind === 'author',
  });
  const res = await softDeleteUpdate(updateId);
  if ('error' in res) {
    // surface a simple inline error; do NOT optimistic-delete if server refused
    console.error('delete failed:', res.error);
    return;
  }
  track('update.delete.confirmed', { update_id: updateId, role: permission.kind });
  setPending({
    updateId,
    undoToken: res.undoToken,
    expiresAtMs: res.expiresAtMs,
  });
  router.refresh(); // removes row from server-rendered list
};

// JSX
<>
  <TimelineRail
    updates={updates}
    canAddUpdate={canAddUpdate}
    currentUserId={currentUserId}
    userRole={userRole}
    onAddUpdate={...}
    onDeleteUpdate={handleDelete}
  />
  <DeleteToastHost />
</>
```

- [ ] **Step 3: Run type-check + visible smoke**

Run: `npm run type-check`
Expected: clean.

Run: `npm run dev` and manually walk through as author:
1. Open item page → kebab on an update → Delete → confirm.
2. Expect detail sheet to close, the row to disappear from the feed, the toast to appear at the bottom.
3. Click Undo within 8s → row returns.
4. Do it again, let it time out → row stays gone.

- [ ] **Step 4: Capture before/after screenshots per playbook**

See `docs/playbooks/visual-diff-screenshots.md`. Attach to the PR.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "feat(delete): wire soft-delete + undo toast into item page"
```

---

## Task 14: E2E test — full golden path + admin + undo

**Files:**
- Create: `e2e/tests/items/update-delete-flow.spec.ts`

- [ ] **Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test';

test.describe('update delete flow (Variant A)', () => {
  test('author can delete own update, see toast, undo restores', async ({ page }) => {
    // TODO: seed a fixture update for TEST_AUTHOR with known id. Use the
    // existing auth/login helper (see e2e/tests/auth/login.spec.ts).
    await page.goto('/login');
    // ... login as author
    // ... navigate to item page containing the seeded update
    await page.getByRole('button', { name: /more/i }).first().click();
    await page.getByRole('menuitem', { name: /^Delete$/ }).click();
    await page.getByRole('button', { name: /delete permanently/i }).click();

    // Toast appears
    await expect(page.getByRole('status')).toContainText(/Update deleted/);

    // Undo
    await page.getByRole('button', { name: /undo/i }).click();

    // Toast gone, row back
    await expect(page.getByRole('status')).toHaveCount(0);
    // Update row visible again
    // await expect(...)
  });

  test('admin sees ADMIN badge in menu and confirm sheet', async ({ page }) => {
    // login as org admin, navigate to someone else's update
    await page.getByRole('button', { name: /more/i }).first().click();
    await expect(page.getByText('ADMIN')).toBeVisible();
    await page.getByRole('menuitem', { name: /Delete \(admin\)/ }).click();
    await expect(page.getByText(/DELETE OTHERS' UPDATE/)).toBeVisible();
  });

  test('non-author without admin sees disabled delete with helper text', async ({ page }) => {
    // login as a volunteer viewing a colleague's update
    await page.getByRole('button', { name: /more/i }).first().click();
    await expect(page.getByText('Only author or admin')).toBeVisible();
  });

  test('toast expires after 8s and update stays gone after refresh', async ({ page }) => {
    // delete as author
    // wait 9 seconds
    await page.waitForTimeout(9000);
    await expect(page.getByRole('status')).toHaveCount(0);
    await page.reload();
    // confirm update row absent
  });
});
```

- [ ] **Step 2: Run the smoke subset**

Run: `npm run test:e2e:smoke`
(Expect these new tests to be part of or adjacent to smoke; add them to the smoke filter if that's how the repo tags them.)

- [ ] **Step 3: Run full E2E**

Run: `npm run test:e2e`
Expected: new tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/items/update-delete-flow.spec.ts
git commit -m "test(e2e): update delete flow — author, admin, volunteer, expiry"
```

---

## Task 15: SQL policy tests

**Files:**
- Create: `supabase/tests/item_updates_soft_delete_policy.test.sql`

This project hasn't formalized SQL tests yet (explore found none). If the repo has a `supabase/tests/` harness already, add to it; otherwise treat this as documentation that runs locally.

- [ ] **Step 1: Write the test script**

```sql
-- supabase/tests/item_updates_soft_delete_policy.test.sql
-- Run with: psql $SUPABASE_URL -f supabase/tests/item_updates_soft_delete_policy.test.sql

begin;
-- Assumes seed data: one org, one property, one admin user, one member user,
-- one public_contributor user, and item_updates rows:
--   iu_admin_authored:    created_by = admin,  anon_name null
--   iu_member_authored:   created_by = member, anon_name null
--   iu_anon_authored:     created_by = public_contributor_user, anon_name 'Sam'

-- === Case 1: author can soft-delete own non-anon ===
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"<member-uuid>"}';
update item_updates set deleted_at = now(), deleted_by = '<member-uuid>', delete_reason = 'author'
  where id = '<iu_member_authored>';
-- Expect: affected = 1

-- === Case 2: author CANNOT delete someone else's update ===
update item_updates set deleted_at = now() where id = '<iu_admin_authored>';
-- Expect: affected = 0 (RLS denies)

-- === Case 3: author CANNOT delete an anon update even if they submitted it ===
-- Even if created_by matches, is_anon_update() must return true, blocking.
set local "request.jwt.claims" = '{"sub":"<public-contributor-uuid>"}';
update item_updates set deleted_at = now() where id = '<iu_anon_authored>';
-- Expect: affected = 0

-- === Case 4: admin can delete anything in their org ===
set local "request.jwt.claims" = '{"sub":"<admin-uuid>"}';
update item_updates set deleted_at = now(), deleted_by = '<admin-uuid>', delete_reason = 'moderation'
  where id = '<iu_anon_authored>';
-- Expect: affected = 1

-- === Case 5: admin CANNOT delete across orgs ===
update item_updates set deleted_at = now() where id = '<iu_in_other_org>';
-- Expect: affected = 0

-- === Case 6: deleted rows hidden from public read ===
set local role anon;
select count(*) from item_updates where id = '<iu_member_authored>';
-- Expect: 0

-- === Case 7: species_sightings_v reflects soft-delete ===
-- If the deleted update had any update_entities rows:
select count(*) from species_sightings_v where update_id = '<iu_with_species>';
-- Expect: 0

rollback;
```

- [ ] **Step 2: Run against local Supabase**

Run: `psql "$SUPABASE_DB_URL" -f supabase/tests/item_updates_soft_delete_policy.test.sql`
Expected: each `Expect:` annotation holds.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/
git commit -m "test(db): soft-delete RLS policy coverage"
```

---

## Task 16: Verification + PR flip

- [ ] **Step 1: Full test sweep**

Run in parallel:
```bash
npm run test
npm run type-check
npm run test:e2e:smoke
```
Expected: all clean.

- [ ] **Step 2: Visual diff screenshots**

Follow `docs/playbooks/visual-diff-screenshots.md`:
- Before: update detail, kebab-closed
- After: update detail with kebab, kebab-open, confirm sheet (author), confirm sheet (admin with badge), undo toast mid-countdown, post-undo feed

Attach all screenshots to the PR body.

- [ ] **Step 3: Provision the HMAC secret**

Before merging, provision `UPDATE_UNDO_HMAC_SECRET` (≥32 random bytes) in:
- Local `.env.local` (for dev)
- Vercel production + preview environments
- Any Supabase edge-function config if relevant

Flag this in the PR description so reviewers know the deploy checklist.

- [ ] **Step 4: Flip PR to ready**

```bash
gh pr ready
```

---

## Self-review checklist (for the implementer)

Before requesting review, verify against the handoff's "Acceptance" list:

- [ ] Author delete → toast → Undo → row returns in correct position (order preserved because `id` + `update_date` unchanged).
- [ ] Toast counts down, ignore it, refresh → update still gone.
- [ ] Admin delete → ADMIN badge on both menu item AND confirm sheet.
- [ ] Volunteer viewing a colleague's update → Delete is disabled with "Only author or admin".
- [ ] Delete with 3 species → `species_sightings_v` has 3 fewer rows for that update; Undo restores them (verify via SQL or E2E).
- [ ] All five telemetry events fire on their expected paths (grep for `track(` in the browser console during manual test).
- [ ] `UPDATE_UNDO_HMAC_SECRET` is listed in the PR description as a required env var for deploy.
