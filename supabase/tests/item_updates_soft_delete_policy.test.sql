-- item_updates_soft_delete_policy.test.sql
--
-- RLS regression tests for migration 047 (soft-delete + audit + helpers).
--
-- USAGE
-- -----
-- 1. Apply all migrations locally (`npx supabase db reset --local` or equivalent).
-- 2. Seed the fixtures described below.
-- 3. Run:
--      psql "$SUPABASE_DB_URL" -f supabase/tests/item_updates_soft_delete_policy.test.sql
-- 4. Inspect the "Expect:" annotations against the observed row counts.
--
-- FIXTURES REQUIRED
-- -----------------
-- - org_a (a seeded organization)
-- - org_b (a second organization, for cross-org isolation tests)
-- - users:
--     * admin_a_uuid      — active org_admin on org_a
--     * member_a_uuid     — active contributor (or similar) on org_a
--     * public_a_uuid     — active public_contributor on org_a
--     * admin_b_uuid      — active org_admin on org_b (cross-org)
-- - one property in org_a, one property in org_b
-- - item_updates rows in org_a:
--     * iu_member_authored  — created_by = member_a_uuid, anon_name NULL
--     * iu_admin_authored   — created_by = admin_a_uuid,  anon_name NULL
--     * iu_anon_authored    — created_by = public_a_uuid, anon_name = 'Sam'
--     * iu_with_species     — any row with update_entities pointing at an iNat species
-- - one item_updates row in org_b:
--     * iu_in_other_org
--
-- Replace the <…-uuid> and <iu_…> placeholders below with the actual UUIDs from
-- your seed before running.

begin;

-- =========================================================================
-- Case 1: author can soft-delete own non-anon update
-- =========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"<member-uuid>"}';
update item_updates
  set deleted_at = now(), deleted_by = '<member-uuid>', delete_reason = 'author'
  where id = '<iu_member_authored>';
-- Expect: UPDATE 1

-- =========================================================================
-- Case 2: author CANNOT delete someone else's update
-- =========================================================================
update item_updates
  set deleted_at = now()
  where id = '<iu_admin_authored>';
-- Expect: UPDATE 0 (RLS denies)

-- =========================================================================
-- Case 3: author CANNOT delete an anon update, even if they submitted it
-- =========================================================================
--   is_anon_update() returns true because the creator's active org role is
--   public_contributor; can_user_delete_update() should therefore short-circuit
--   to false on the author-path.
set local "request.jwt.claims" = '{"sub":"<public-contributor-uuid>"}';
update item_updates
  set deleted_at = now()
  where id = '<iu_anon_authored>';
-- Expect: UPDATE 0

-- =========================================================================
-- Case 4: admin can delete anything in their org (including anon submissions)
-- =========================================================================
set local "request.jwt.claims" = '{"sub":"<admin-uuid>"}';
update item_updates
  set deleted_at = now(), deleted_by = '<admin-uuid>', delete_reason = 'moderation'
  where id = '<iu_anon_authored>';
-- Expect: UPDATE 1

-- =========================================================================
-- Case 5: admin from a different org CANNOT delete cross-org
-- =========================================================================
set local "request.jwt.claims" = '{"sub":"<admin-b-uuid>"}';
update item_updates
  set deleted_at = now()
  where id = '<iu_in_other_org>';
-- Expect: UPDATE 0

-- =========================================================================
-- Case 6: deleted rows are hidden from anon (public) reads
-- =========================================================================
set local role anon;
reset "request.jwt.claims";
select count(*) as cnt
  from item_updates
  where id = '<iu_member_authored>';
-- Expect: cnt = 0  (row exists in the table but is filtered by RLS restrictive policy)

-- =========================================================================
-- Case 7: deleted rows are hidden from authenticated reads too
-- =========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"<member-uuid>"}';
select count(*) as cnt
  from item_updates
  where id = '<iu_member_authored>';
-- Expect: cnt = 0

-- =========================================================================
-- Case 8: species_sightings_v reflects soft-delete immediately (no trigger)
-- =========================================================================
--   The view is security_invoker = on, so RLS on item_updates applies when
--   the view is queried. When the underlying item_updates row is soft-deleted,
--   the view row disappears automatically.
set local role anon;
reset "request.jwt.claims";
select count(*) as cnt
  from species_sightings_v
  where update_id = '<iu_with_species>';
-- Expect: cnt = 0 when <iu_with_species> is soft-deleted
--        cnt = (number of species rows) when it is restored

-- =========================================================================
-- Case 9: audit_log is only visible to platform admins and org admins
-- =========================================================================
--   Assuming previous deletes inserted audit rows via server actions, a
--   volunteer should see zero rows. An org_admin should see rows for updates
--   in their org.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"<member-uuid>"}';
select count(*) as cnt from audit_log where update_id = '<iu_anon_authored>';
-- Expect: cnt = 0 (member is not admin)

set local "request.jwt.claims" = '{"sub":"<admin-uuid>"}';
select count(*) as cnt from audit_log where update_id = '<iu_anon_authored>';
-- Expect: cnt >= 1 (admin sees their own delete)

rollback;

-- NOTE on automation
-- ------------------
-- When the project adopts pgTAP or a similar SQL test framework, convert each
-- "Expect: cnt = N" annotation to a `SELECT is( … )` assertion so the script
-- self-verifies. Until then, this file is read-and-verify and the CI gate is
-- manual (run before releasing migration 047 changes).
