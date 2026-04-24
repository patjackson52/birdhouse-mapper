-- =============================================================
-- 049_scheduled_maintenance.sql — Maintenance projects with
-- item linking (with per-item completion) and knowledge linking
-- =============================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table maintenance_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'planned'
    check (status in ('planned','in_progress','completed','cancelled')),
  scheduled_for date,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_maintenance_projects_org on maintenance_projects(org_id);
create index idx_maintenance_projects_property on maintenance_projects(property_id);
create index idx_maintenance_projects_status on maintenance_projects(status, scheduled_for);

create table maintenance_project_items (
  maintenance_project_id uuid not null references maintenance_projects(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (maintenance_project_id, item_id)
);

create index idx_mpi_project on maintenance_project_items(maintenance_project_id);
create index idx_mpi_item on maintenance_project_items(item_id);

create table maintenance_project_knowledge (
  maintenance_project_id uuid not null references maintenance_projects(id) on delete cascade,
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (maintenance_project_id, knowledge_item_id)
);

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function update_maintenance_projects_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_maintenance_projects_updated_at
before update on maintenance_projects
for each row execute function update_maintenance_projects_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — maintenance_projects (mirrors knowledge_items pattern)
-- ---------------------------------------------------------------------------

alter table maintenance_projects enable row level security;

create policy maintenance_projects_select on maintenance_projects
  for select using (org_id in (select user_active_org_ids()));

create policy maintenance_projects_insert on maintenance_projects
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_projects.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy maintenance_projects_update on maintenance_projects
  for update using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_projects.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy maintenance_projects_delete on maintenance_projects
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_projects.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. RLS — maintenance_project_items
-- ---------------------------------------------------------------------------

alter table maintenance_project_items enable row level security;

create policy mpi_select on maintenance_project_items
  for select using (org_id in (select user_active_org_ids()));

create policy mpi_insert on maintenance_project_items
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy mpi_update on maintenance_project_items
  for update using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy mpi_delete on maintenance_project_items
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- ---------------------------------------------------------------------------
-- 5. RLS — maintenance_project_knowledge
-- ---------------------------------------------------------------------------

alter table maintenance_project_knowledge enable row level security;

create policy mpk_select on maintenance_project_knowledge
  for select using (org_id in (select user_active_org_ids()));

create policy mpk_insert on maintenance_project_knowledge
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_knowledge.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy mpk_delete on maintenance_project_knowledge
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_knowledge.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );
