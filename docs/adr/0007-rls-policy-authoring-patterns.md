# ADR-0007: RLS Policy Authoring Patterns

**Status:** Accepted

**Date:** 2026-04-22

**Owners:** @patjackson52

## Context

FieldMapper enforces multi-tenant access, author-vs-admin permissions, anonymous-token access, and soft-delete visibility entirely through Postgres Row-Level Security. As of migration 047 we have ~40 policies across a dozen tables. Over the course of building those, we've hit the same class of bug three times:

- **#275** (shipped): migration 047 added a RESTRICTIVE `item_updates_hide_deleted` policy with `USING (deleted_at IS NULL)` to filter soft-deleted rows out of reads. Every subsequent delete attempt threw `new row violates row-level security policy "item_updates_hide_deleted"` — because PostgREST's `PATCH` default is `Prefer: return=representation`, which makes Supabase's `.update()` issue `UPDATE ... RETURNING`, which makes Postgres evaluate SELECT policies' `USING` against the new row, which fails on the new `deleted_at`-populated row, which for a RESTRICTIVE policy is an error rather than a filter.

- **#275 (same migration, second bug)**: `audit_log` had RLS enabled with only SELECT policies — no INSERT policy. The comment said *"server actions use service role for audit writes"* but the actual server action used the user-auth client. Every audit insert was silently denied.

- **#268** (earlier): `photos` insert RLS required the `property_id` in the row to match a property the user had access to, but the `auto_populate_org_property` trigger filled it from the user's *default* property, which was wrong for any photo attached to an item on a non-default property. Silent RLS rejection, no photos appeared. See also ADR-0004.

All three have the same shape: **RLS rejected a legitimate operation, the rejection was either silent or the error was generic, and none of the unit tests caught it because they mock the Supabase client instead of exercising RLS.** The debugging loop for each was long — the signal didn't arrive until someone manually reproduced the flow in prod or preview.

This ADR extracts the patterns that would have prevented each instance.

## Decision

### 1. Default to permissive policies with ANDed conditions

**Rule:** If you need to narrow access, express the narrowing as an additional AND inside a permissive policy's `USING`. Reserve RESTRICTIVE for cross-cutting security constraints that must never be OR'd away.

Multiple permissive policies OR together (each new permissive policy *widens* access). Multiple restrictive policies AND together with all permissive results. A lone restrictive policy is often mistakenly reached for as "just add a filter" — it isn't; it's a hard gate that applies to every command it covers and throws on violation.

Good uses of RESTRICTIVE:
- "Rows marked `is_legally_sensitive` must never be exposed to role `viewer`, regardless of other policies."
- "Any write to `audit_log` must set `actor_user_id = auth.uid()`" — this is the one case from #278 where restrictive (or at least a WITH CHECK clause) is appropriate.

Bad uses:
- "Hide soft-deleted rows from reads" — use a permissive SELECT policy that ANDs `deleted_at IS NULL` into the existing USING. That's what migration 048 does.
- "Require `published_at IS NOT NULL` for public visibility" — same pattern.
- "Filter out unverified emails" — same pattern.

If you catch yourself writing `AS RESTRICTIVE` for a visibility filter, stop and merge the condition into the relevant permissive policy instead.

### 2. Restrictive policies throw; permissive policies filter

For any UPDATE or INSERT with an implicit or explicit RETURNING clause, Postgres evaluates SELECT `USING` against the post-mutation state. A permissive policy whose USING fails against that state filters the row out of RETURNING — no error, mutation commits, client sees `data=[]`. A restrictive policy whose USING fails throws `new row violates row-level security policy "<name>"` and the mutation is rejected.

This means:

- If you write a RESTRICTIVE SELECT policy whose USING depends on a column your feature *mutates*, every mutation of that column via PostgREST will throw. Every time. This is an explosive gotcha that won't show up until the first non-mocked test.
- Conversely, if a permissive policy's USING depends on a column, the mutation still succeeds — you just can't read the new row back via the same request. That's usually fine (you have the primary key; re-read with a different client if you need the row).

Before merging any policy change, walk through the matrix: for every feature that mutates any column the policy references, does the post-mutation state still pass USING? If not, and the policy is RESTRICTIVE, expect errors.

### 3. Any UPDATE via PostgREST enforces SELECT USING on the new row

PostgREST's default `Prefer` header for `PATCH` is `return=representation`, so Supabase's `.update(...)` issues `UPDATE ... RETURNING` under the hood. Postgres then evaluates SELECT policies' `USING` against the **new row** to decide visibility for the returned result. When that evaluation fails — *including* for a permissive SELECT policy with a single USING branch — the UPDATE is rejected with `new row violates row-level security policy for table "<table>"` (no policy name, because the rejection is "no permissive policy allowed the new row's post-state to be visible").

This is the trap that bit PR #275 twice:

- First attempt used a RESTRICTIVE policy with `USING (deleted_at IS NULL)`. New row with `deleted_at` populated failed → error named the policy explicitly.
- Second attempt (migration 048) moved the filter into the permissive `item_updates_select` policy. New row still failed → error lost the policy name but the UPDATE was still rejected.
- Third attempt (migration 048 + server-action refactor to service-role client) finally worked — because service role bypasses RLS entirely.

**Implication:** any UPDATE via `@supabase/supabase-js` that mutates a column referenced by a SELECT policy's USING will be rejected whenever the post-update state fails that USING. You cannot flip a visibility-filter column from "visible" to "hidden" through a user-auth Supabase client. You have three options:

1. **Use the service-role client for the mutation** (`createServiceClient()` from `@/lib/supabase/server`). Authorization must still be enforced via a pre-check (e.g., the `can_user_delete_update` RPC). This is the pragmatic fix for the update-delete flow.
2. **Wrap the mutation in a SECURITY DEFINER RPC** that performs its own permission check and the UPDATE. Callers invoke `supabase.rpc('soft_delete_update', ...)` instead of `.from(...).update(...)`. Cleaner architecturally; more migration work.
3. **Remove the visibility filter from RLS** and enforce it in application code. Rejected — loses defense in depth and every future read path has to remember to filter.

Column-mutation matrix (repeat of rule 2): before merging a policy change, walk through every feature that mutates any column the policy references. For each one, does the post-mutation state still pass USING? If the new state *intentionally* fails USING (as with soft-delete), the mutation path needs option 1 or 2 above. Mocked unit tests won't catch this — only a real mutation through PostgREST will.

### 4. RLS-enabled tables need policies for every command the app uses

When you enable RLS on a new table:

```sql
alter table <new_table> enable row level security;
```

...you have flipped the table's default from "anyone with grant can do anything" to "nobody can do anything until a policy says yes." If your application code does `insert`, you need an `INSERT` policy (or a `FOR ALL` policy that covers it). If it does `update`, you need `UPDATE`. Missing a command is silent — the mutation returns `{ error: null, data: null }` in many cases, or a vague RLS error with no policy name attached.

The `audit_log` bug from #275 / migration 047 was this exact mistake: SELECT policies defined, no INSERT policy, comment said "service role writes these" but the code actually used the user-auth client. Fix was to add `audit_log_authenticated_insert` with `WITH CHECK (actor_user_id = auth.uid())`.

**Checklist before merging a migration that enables RLS on a table:**

- [ ] Every mutation command (`INSERT`, `UPDATE`, `DELETE`) the app performs on this table has a corresponding policy.
- [ ] Every read path (`SELECT` for authenticated, anon, and anonymous-token-session) has a policy.
- [ ] Every policy's `TO` clause lists the roles the app actually uses (`authenticated`, `anon`).
- [ ] If you justify the absence of a policy with "we'll use service role for this", the server-side code uses `createServiceClient()` from `@/lib/supabase/server` — not `createClient()`. Assert this at the call site or in a review check.

### 5. `check_permission()` is the blessed authorization primitive for feature-level checks

Role-agnostic — checks a JSONB permission map on the `roles` table. New features that need permission should add the permission key via `jsonb_set` for the existing roles, not introduce a parallel role enum in app code or a new hard-coded role check in a policy.

```sql
-- Grant the new 'updates.delete_any' permission to existing admin roles.
update roles
set permissions = jsonb_set(permissions, '{updates,delete_any}', to_jsonb(true), true)
where base_role in ('org_admin', 'platform_admin');
```

Then your policy can `check_permission(auth.uid(), property_id, 'updates', 'delete_any')`. This composes with the existing platform-admin and org-admin bypass logic inside `check_permission`, and any future role can be granted the permission without touching SQL policies.

Avoid policies that hard-code role names (`WHERE base_role = 'org_admin'`) except inside the permission-resolution helper itself. They are brittle against role schema evolution (what we saw when the handoff's "coordinator" role didn't exist in the codebase's role enum).

### 6. Soft-delete specifically

Pattern:

- `alter table <t> add column deleted_at timestamptz null, deleted_by uuid null references users(id), delete_reason text null;`
- Drop any existing permissive SELECT policy on the table.
- Recreate it with `deleted_at IS NULL AND (<existing USING expression>)`.
- Do NOT create a separate RESTRICTIVE policy for the filter (see rules 1 and 2).
- Add an UPDATE policy scoped to who can soft-delete (authors on their own, admins on any, via `check_permission`).
- Add a client-side eviction path from the offline cache (see ADR-0006).

### 7. Policy changes require an end-to-end mutation test

Testing a policy by running `UPDATE ... WHERE id = ...` in the Supabase SQL editor proves nothing — the SQL editor connects as `postgres`, which bypasses RLS entirely. A policy that's broken in production can test fine in the SQL editor.

Acceptable testing paths:

- **Playwright E2E with a seeded user.** The real JWT, the real PostgREST, the real RLS evaluation. Most faithful.
- **Server action integration test** that creates a real Supabase client bound to a test user's session, issues the mutation, reads back the result. See `src/app/api/public-contribute/__tests__/actions.test.ts` for shape.
- **SQL-level simulation** via `SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claims" = '{"sub":"..."}';` followed by the mutation. This works but skips PostgREST behavior (no `return=representation` implicit RETURNING), so it can't catch bugs of the form migration 047 introduced.

Mocked unit tests (`vi.mock('@/lib/supabase/server')`) validate application logic around the mutation but CANNOT catch RLS bugs. They are complementary to end-to-end tests, not replacements.

## Alternatives Considered

- **Disable RLS, enforce everything in application code.** Aligns with how some non-Supabase Postgres apps handle auth. Rejected: we rely on RLS as defense-in-depth (direct SQL access, future admin scripts, worker processes) and the cost of duplicating every check in application code is large. Keeping RLS as the authoritative layer is the right call.

- **Wrap every table in views with `security_invoker`.** Would let us centralize visibility filters in one place per table. Already use this for `species_sightings_v` (migration 046). Rejected as a general pattern: adds indirection for every read path, and Postgres's query planner struggles with views in some cases.

- **Adopt a declarative RLS DSL (e.g. pgrls, pg-rls-gen).** Would catch the restrictive-vs-permissive trap at authoring time. Attractive but premature — we have 40 policies, not 400. Revisit if the policy count doubles.

- **Require a `.select()` check on every mutation.** Forces developers to think about the return-state visibility. Rejected: fighting the tool. Better to document the `return=representation` behavior and teach.

## Decision Drivers

- **Three incidents, same shape.** If there were one, we'd chalk it up to unfamiliarity. Three (#268, both halves of #275) is a pattern, and a pattern deserves a document.
- **Failure modes are silent.** Every one of these bugs got through CI and merged. Only end-to-end testing in a real deploy surfaced them. The cost of catching them earlier (shorter debugging loops, fewer production bug reports) far exceeds the cost of the ADR.
- **The rules generalize.** Rules 1, 2, 3, 4 aren't specific to soft-delete or update-delete — they apply to every future RLS-adjacent feature. Publishing them centrally means future feature PRs can be reviewed against a shared checklist.
- **Sibling ADRs already exist for the inbound/outbound cache sides.** This ADR completes the story for the DB-authorization side; together with 0002, 0004, and 0006 they form the full offline + RLS contract.

## Consequences

**Positive:**
- Future migrations that touch RLS can be reviewed against a concrete checklist (rules 1, 2, 4) instead of case-by-case.
- Fewer instances of the "worked in SQL editor, broke in prod" failure mode; rule 7 names the root cause.
- New developers have a single document to read for the RLS mental model, rather than piecing it together from migrations 008, 009, 010, 026, 043.
- Rule 3 documents a footgun in the underlying tooling (PostgREST + Supabase default behavior) that's invisible unless you hit it.

**Negative:**
- Authoring new policies takes longer. The column-matrix walkthrough (rule 2) is real work; mostly worth it, but some simple policies will feel over-reviewed.
- Rule 1 rejects a genuinely clean mental model (restrictive for filters) in favor of a less clean one (ANDed conditions inside permissive), because the tooling can't cope with the clean version. This is a compromise.

**Neutral:**
- The existing 40 policies should be audited against rule 2 (column-matrix walkthrough). That's a one-time cost; backlog it. Any known-breaking policies should get a separate fix PR like #278 did for 047.

## Related Files

- `supabase/migrations/047_update_soft_delete.sql` — introduced the restrictive-trap bug and the audit_log INSERT bug; fixed by 048
- `supabase/migrations/048_fix_soft_delete_rls.sql` — fix migration referenced by this ADR
- `supabase/migrations/008_multi_tenant_foundation.sql` — defines `is_platform_admin()`, `user_active_org_ids()`, `user_org_admin_org_ids()`
- `supabase/migrations/009_properties_and_permissions.sql` — defines `check_permission()` and the seed role JSONB; the blessed authorization primitive
- `supabase/migrations/010_access_grants_and_anon_access.sql` — `item_updates_select` and the 3-path anon-aware read pattern
- `src/lib/supabase/server.ts` — defines both `createClient()` (user-auth) and `createServiceClient()` (bypass RLS). Rule 4 relies on this distinction.
- `docs/adr/0004-offline-outbound-mutation-invariants.md` — sibling ADR on the outbound-sync side; the `photos` RLS bug documented there is an instance of rule 4
- `docs/adr/0006-offline-cache-soft-delete-visibility.md` — companion ADR on the client-cache side of soft-delete

## Related Issues / PRs

- #275 — introduced migration 047 with two RLS bugs
- #278 — fix migration 048 (restrictive-trap + audit_log INSERT)
- #268 — earlier RLS bug on `photos` insert scope
- #269, #270, #271, #272, #273 — photo pipeline bug chain; ADR-0004 is the writeup

## Tags

`rls`, `supabase`, `postgrest`, `restrictive-policy`, `permissive-policy`, `authorization`, `cache-invariants`
