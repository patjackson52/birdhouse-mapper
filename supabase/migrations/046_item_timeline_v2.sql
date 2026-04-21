-- 046_item_timeline_v2.sql
-- Adds anon_name nickname to item_updates and species_sightings_v read model.

-- 1. Optional nickname for public-form submissions.
--    is_anon is NOT stored; it is derived from the author's active org role
--    (org_memberships.role_id -> roles.base_role = 'public_contributor').
alter table item_updates
  add column anon_name text null;

-- 2. Read model for species citings across item/property/org scopes.
--    security_invoker = on so RLS on the underlying tables applies to the
--    calling user, not the view owner. This is NOT the Postgres default.
create or replace view species_sightings_v
with (security_invoker = on)
as
select
  iu.id                 as update_id,
  e.external_id::bigint as species_id,   -- iNat taxon_id (bigint)
  iu.item_id,
  i.property_id,
  p.org_id,
  iu.update_date        as observed_on,
  iu.created_by
from item_updates iu
join update_entities ue on ue.update_id = iu.id
join entities e        on e.id = ue.entity_id
join entity_types et   on et.id = e.entity_type_id
join items i           on i.id = iu.item_id
join properties p      on p.id = i.property_id
where et.api_source = 'inaturalist'
  and e.external_id is not null;

comment on view species_sightings_v is
  'One row per (update, species) pair for iNaturalist-backed species. Used by the species detail scope toggle (item / property / org).';

-- RPC: bundle author card lookup (profile fields + org role + per-org update count).
-- SECURITY DEFINER so RLS on users/item_updates does not hide co-members or
-- under-count their contributions. Scoping is enforced via the function's own
-- WHERE clause on p_org_id + p_user_ids.
create or replace function get_author_cards(
  p_org_id uuid,
  p_user_ids uuid[]
)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  role text,
  update_count bigint
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    u.id,
    u.display_name,
    u.avatar_url,
    coalesce(r.base_role, 'viewer') as role,
    (select count(*) from item_updates
       where created_by = u.id and org_id = p_org_id) as update_count
  from users u
  left join org_memberships om
    on om.user_id = u.id
   and om.org_id = p_org_id
   and om.status = 'active'
  left join roles r on r.id = om.role_id
  where u.id = any(p_user_ids);
$$;

comment on function get_author_cards(uuid, uuid[]) is
  'Returns author card rows (display_name, avatar_url, base_role, update_count) for a set of user ids scoped to one org. SECURITY DEFINER — scope is enforced by the WHERE clause on p_org_id and p_user_ids.';

revoke execute on function get_author_cards(uuid, uuid[]) from public;
grant execute on function get_author_cards(uuid, uuid[]) to authenticated, anon;

-- Safety: iNat taxon IDs are always numeric integers. Enforce this on the
-- entities table so species_sightings_v's bigint cast cannot fail at runtime.
alter table entities
  add constraint entities_inaturalist_external_id_numeric
  check (
    external_id is null
    or external_id ~ '^\d+$'
  );
