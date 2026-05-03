# 0008 — Membership Data Relationships

**Status:** Accepted
**Date:** 2026-05-03
**Issue:** [#305](https://github.com/patjackson52/birdhouse-mapper/issues/305)
**Spec:** [docs/superpowers/specs/2026-05-03-fix-members-page-embed-ambiguity-design.md](../superpowers/specs/2026-05-03-fix-members-page-embed-ambiguity-design.md)

## Context

Two membership tables in the multi-tenant schema each declare more than one foreign key to `users`:

- `org_memberships`: `user_id` → `users(id)` (the member) and `invited_by` → `users(id)` (audit).
- `property_memberships`: `user_id` → `users(id)` (the member) and `granted_by` → `users(id)` (audit).

A third table, `temporary_access_grants`, has three FKs to `users` (`user_id`, `granted_by`, `revoked_by`).

PostgREST cannot disambiguate `users(...)` in a `.select()` embed when more than one FK exists to the same child table; the request fails with HTTP 300 ("more than one relationship was found"). Issue #305 captured the failure on `/admin/members`.

## Decision

1. **Always FK-hint embeds on these tables.** Any PostgREST `.select()` that embeds a child with more than one FK from the parent MUST use the column-name FK hint:

   ```ts
   .from('org_memberships').select(`
     id, joined_at, user_id,
     users!user_id ( id, display_name, email ),
     roles ( id, name, base_role )
   `)
   ```

2. **Static guard auto-derives the rule.** A Vitest test (`src/__tests__/postgrest-embed-disambiguation.test.ts`) parses `supabase/migrations/*.sql` (both `CREATE TABLE` and `ALTER TABLE ... ADD CONSTRAINT` forms) to discover any table with multiple FKs to the same child, then AST-walks `src/` to fail on bare embeds. New multi-FK relationships introduced by migrations are picked up automatically — no hand-maintained map.

3. **Membership tables are the canonical user↔org/property linkage.** `invited_by`, `granted_by`, and `revoked_by` are audit columns; never the primary user lookup. Embed them only with explicit hints when needed (e.g. `users!invited_by ( ... )`) and only when the audit identity is actually surfaced to the caller.

4. **The fix is RLS-policy-neutral.** Existing `users` RLS (including `user_visible_to_org_admin`) governs which rows are visible. Adding the FK hint changes which constraint PostgREST follows, not which rows the row-level security policy admits.

## Consequences

- Embeds gain a small amount of verbosity (`!user_id`) — acceptable for unambiguous, fail-fast queries.
- Schema-driven coverage means adding a new audit FK (e.g. `archived_by`) cannot silently break embeds — the guard fails until callers update.
- Existing tests for the affected actions (Vitest unit tests with mocked Supabase) cannot detect this class of bug; the static guard plus the Playwright `@smoke` test on `/admin/members` together cover both compile-time and runtime regressions.

## Alternatives considered

- **Drop `invited_by` / `granted_by` / `revoked_by`.** Rejected — audit information is required by IAM workflows.
- **Rename FK columns to make hints unnecessary.** Rejected — PostgREST disambiguation requires multiple distinct relationships to one table; renaming would not change that. Nothing about the column name alone resolves ambiguity.
- **Catch ambiguity at runtime only (E2E).** Rejected — relying on E2E for a static-detectable error is slow and forgiving. Static guard fails before code reaches CI.
