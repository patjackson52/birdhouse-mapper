-- 028_rich_update_types.sql
-- Rich update types: custom fields + role-based permissions

-- 1. New table: update_type_fields
create table public.update_type_fields (
  id uuid primary key default gen_random_uuid(),
  update_type_id uuid not null references public.update_types(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  field_type text not null check (field_type in ('text', 'number', 'dropdown', 'date')),
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0
);

create index idx_update_type_fields_type on public.update_type_fields(update_type_id);
create index idx_update_type_fields_org on public.update_type_fields(org_id);

create trigger update_type_fields_auto_org
  before insert on public.update_type_fields
  for each row execute function public.auto_populate_org_property('org_scoped');

alter table public.update_type_fields enable row level security;

create policy "update_type_fields_public_read" on public.update_type_fields
  for select using (true);

create policy "update_type_fields_insert" on public.update_type_fields
  for insert with check (
    org_id in (select public.user_org_admin_org_ids())
    or public.is_platform_admin()
  );

create policy "update_type_fields_update" on public.update_type_fields
  for update using (
    org_id in (select public.user_org_admin_org_ids())
    or public.is_platform_admin()
  );

create policy "update_type_fields_delete" on public.update_type_fields
  for delete using (
    org_id in (select public.user_org_admin_org_ids())
    or public.is_platform_admin()
  );

-- 2. Role threshold columns on update_types
alter table public.update_types
  add column min_role_create text check (min_role_create in ('contributor', 'org_staff', 'org_admin')),
  add column min_role_edit text check (min_role_edit in ('contributor', 'org_staff', 'org_admin')),
  add column min_role_delete text check (min_role_delete in ('contributor', 'org_staff', 'org_admin'));

-- 3. Custom field values on item_updates
alter table public.item_updates
  add column custom_field_values jsonb not null default '{}';
