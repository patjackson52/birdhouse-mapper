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

-- 6. RLS: hide deleted rows from reads.
--    The live SELECT policy on item_updates is `item_updates_select` (migration
--    010) — a 3-path anon-aware policy that enforces property access grants.
--    We must NOT replace it with a permissive `deleted_at is null` policy,
--    because multiple PERMISSIVE policies are OR'd together and that would
--    bypass access-grant checks. Instead, add a RESTRICTIVE policy that is
--    AND'd with every other SELECT policy, enforcing "no deleted rows" on top
--    of the existing access rules without weakening them.
drop policy if exists item_updates_hide_deleted on item_updates;
create policy item_updates_hide_deleted on item_updates
  as restrictive
  for select
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
