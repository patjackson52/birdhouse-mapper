-- 048_fix_soft_delete_rls.sql
--
-- Fixes two RLS bugs introduced in migration 047:
--
-- 1. The RESTRICTIVE policy `item_updates_hide_deleted` blocks legitimate
--    soft-delete UPDATEs. PostgREST's PATCH default is Prefer: return=representation
--    (Supabase's `.update()` uses this), which asks Postgres to return the
--    updated row. Postgres then applies SELECT policies' USING to the new row
--    to decide visibility. Our restrictive policy has USING (deleted_at IS NULL);
--    the new row has deleted_at populated; the USING fails; because the policy
--    is RESTRICTIVE, Postgres throws "new row violates row-level security
--    policy 'item_updates_hide_deleted'" instead of silently filtering.
--
--    Observed in prod: every delete attempt surfaced this error in the browser
--    console and the server action returned { error }, so no row was ever
--    soft-deleted and no audit row written.
--
--    Fix: drop the restrictive policy, AND `deleted_at IS NULL` into the
--    permissive `item_updates_select` policy (from migration 010). Permissive
--    policies whose USING fails on the new row just filter it out of the
--    RETURNING result — no error — while still hiding deleted rows from
--    SELECT.
--
-- 2. `audit_log` has RLS enabled (migration 047) with only SELECT policies.
--    With no INSERT policy, Postgres denies all inserts from non-superuser
--    roles. The comment in migration 047 said "server actions use service
--    role for audit writes", but the server action in
--    src/app/items/[itemId]/updates/actions.ts uses the user-auth client,
--    not the service role. Audit rows were never written.
--
--    Fix: add an INSERT policy that requires the caller to be the actor.
--    Audit inserts from future service-role code paths still work because
--    service role bypasses RLS entirely.

begin;

-- ============================================================================
-- Fix 1: item_updates SELECT policy (merge soft-delete filter into permissive)
-- ============================================================================

drop policy if exists item_updates_hide_deleted on item_updates;
drop policy if exists "item_updates_select" on item_updates;

create policy "item_updates_select" on item_updates for select
  to anon, authenticated
  using (
    deleted_at is null
    and (
      (auth.uid() is not null and property_id in (
        select user_accessible_property_ids(auth.uid())
      ))
      or
      (auth.uid() is null and check_anon_access(property_id, 'items'))
      or
      (auth.uid() is null
        and current_setting('app.access_mode', true) = 'anonymous_token'
        and property_id::text = current_setting('app.current_property_id', true)
        and exists (
          select 1 from anonymous_access_tokens aat
          where aat.id::text = current_setting('app.anonymous_token_id', true)
            and aat.is_active = true
            and aat.can_view_items = true
            and (aat.expires_at is null or aat.expires_at > now())
        ))
    )
  );

-- ============================================================================
-- Fix 2: audit_log INSERT policy
-- ============================================================================

create policy audit_log_authenticated_insert on audit_log for insert
  to authenticated
  with check (actor_user_id = auth.uid());

commit;
