# Fix Members Page — PostgREST Embed Ambiguity

**Issue:** [#305](https://github.com/patjackson52/birdhouse-mapper/issues/305)
**Date:** 2026-05-03
**Branch:** `fix/member-page`

## Problem

Admin Members page (`/admin/members`) fails with:

```
Could not embed because more than one relationship was found for 'org_memberships' and 'users'
```

### Root cause

`org_memberships` declares two foreign keys to `users` (migration `008_multi_tenant_foundation.sql`):

```sql
user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
invited_by uuid REFERENCES users(id),
```

PostgREST cannot disambiguate `users(...)` in `.select()`, returns HTTP 300.

### Affected queries

| File | Line | Function |
|---|---|---|
| `src/app/admin/members/actions.ts` | 17 | `getOrgMembers` (the visible failure) |
| `src/app/admin/members/actions.ts` | 143 | `getMemberDetail` |
| `src/app/admin/properties/[slug]/members/actions.ts` | 52 | property-scoped members |

`property_memberships` has the same multi-FK pattern (`user_id` + `granted_by`) but no current callers embed `users(...)` — covered preemptively by the static guard.

## Fix

Replace bare `users (...)` with FK-hinted `users!user_id (...)` in all three queries. PostgREST resolves via the column name to the correct constraint. Identical query plan, identical result shape.

## Prevention

Two complementary guards.

### 1. Static guard (Vitest)

New: `src/__tests__/postgrest-embed-disambiguation.test.ts`.

**Approach:** TypeScript compiler API (not regex).

- Auto-derive `MULTI_FK_TABLES` map by parsing `supabase/migrations/*.sql` for tables with >1 `REFERENCES <child>(id)` entries. Result: `{ org_memberships: ['users'], property_memberships: ['users'], ... }`.
- Walk `src/**/*.{ts,tsx}` AST. For each `CallExpression` matching `.from('<table>').select(\`...\`)`, parse the template-literal argument and check that any embed of a multi-FK child uses `child!column(...)` form.
- On violation, fail with file + line + offending snippet. Lists every offender at once.

**Why TS AST over regex:** template literals with comments/interpolation defeat regex. AST is robust, ~50–80 lines, no new deps (`typescript` already present).

**Drift protection:** auto-derived map means new migrations adding multi-FK pairs automatically extend coverage. No hand-maintenance.

### 2. Integration smoke (Playwright)

New: `e2e/tests/admin/members.spec.ts`, tagged for `:smoke` set.

**Why E2E:** PostgREST embed ambiguity surfaces only at the HTTP boundary. Mocked Vitest tests pass on broken queries; only a real PostgREST call returns 300.

**Scenario:**
1. Log in as org admin (existing fixture user).
2. Visit `/admin/members`.
3. Assert: `<tbody> <tr>` count ≥ 1; absence of error text matching `/Could not embed|relationship was found/i`.

**Resilient assertions:** structural row presence + error-text absence. No brittle selectors, no exact-row counts (resists seed changes).

**Seed:** verify `e2e/fixtures/seed.ts` produces ≥1 active `org_memberships` row for the admin fixture user. Extend if not.

**CI:** existing `.github/workflows/e2e.yml` already runs `supabase start` + seeds — no infra changes.

## ADR

New: `docs/adr/0008-membership-data-relationships.md`.

**Decisions:**
1. PostgREST embeds on `org_memberships` and `property_memberships` MUST use FK-hinted form: `users!user_id(...)`.
2. New multi-FK relationships introduced via migration are picked up automatically by the static guard's auto-derived map; the ADR mandates not silencing the guard.
3. `org_memberships` and `property_memberships` are the canonical user↔org/property linkage. `invited_by` and `granted_by` are audit columns, never primary user lookups.
4. RLS-policy-neutral: the fix changes which FK PostgREST follows; column visibility still governed by existing `users` RLS (incl. `user_visible_to_org_admin`).

**Cross-links:** issue #305, this spec.

## Out of scope (known limitations)

- **Unbounded `getOrgMembers` SELECT.** Returns all active memberships; large orgs (>1000 members) will pay memory + render cost. Pagination is a separate ticket.
- **DB schema cleanup.** No migration changes. FK constraints unchanged.

## Verification

- `npm test -- postgrest-embed` → static guard green
- `npm run test:e2e:smoke` → members smoke green
- Manual: `npm run dev`, log in as admin, visit `/admin/members` → list renders, no error
- `npm run type-check` → 0 errors
- `npm run build` → succeeds

## Order of work

1. Write static-guard test (red — finds 3 violations).
2. Fix the 3 queries (green).
3. Write E2E smoke (red without local Supabase, green in CI).
4. Verify/extend seed for admin org_membership.
5. ADR with cross-links.
6. Run full verification commands.

## File summary

**Edits:**
- `src/app/admin/members/actions.ts` (2 query disambiguations)
- `src/app/admin/properties/[slug]/members/actions.ts` (1 query disambiguation)

**New:**
- `src/__tests__/postgrest-embed-disambiguation.test.ts`
- `e2e/tests/admin/members.spec.ts`
- `docs/adr/0008-membership-data-relationships.md`

**Possibly:** `e2e/fixtures/seed.ts` (extend if admin org_membership absent).
