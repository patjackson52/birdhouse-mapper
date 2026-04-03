-- =============================================================
-- 029_knowledge_system.sql — Knowledge items, attachments, linking
-- =============================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table knowledge_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  title text not null,
  slug text not null,
  body jsonb,
  body_html text,
  excerpt text,
  cover_image_url text,
  tags text[] not null default '{}',
  visibility text not null default 'org' check (visibility in ('org', 'public')),
  is_ai_context boolean not null default true,
  ai_priority integer,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index idx_knowledge_items_org on knowledge_items(org_id);
create index idx_knowledge_items_tags on knowledge_items using gin (tags);
create index idx_knowledge_items_ai on knowledge_items(org_id, is_ai_context) where is_ai_context = true;

-- Attachments (vault file references)
create table knowledge_attachments (
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  vault_item_id uuid not null references vault_items(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (knowledge_item_id, vault_item_id)
);

-- Junction tables for linking
create table knowledge_item_items (
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (knowledge_item_id, item_id)
);

create table knowledge_item_updates (
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  update_id uuid not null references item_updates(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (knowledge_item_id, update_id)
);

create table knowledge_item_entities (
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (knowledge_item_id, entity_id)
);

-- ---------------------------------------------------------------------------
-- 2. Auto-update updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function update_knowledge_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_knowledge_items_updated_at
before update on knowledge_items
for each row execute function update_knowledge_items_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS Policies — knowledge_items
-- ---------------------------------------------------------------------------

alter table knowledge_items enable row level security;

-- All org members can read
create policy knowledge_items_select on knowledge_items
  for select using (org_id in (select user_active_org_ids()));

-- Public visibility items readable by anyone (for Puck pages)
create policy knowledge_items_select_public on knowledge_items
  for select using (visibility = 'public');

-- Staff+ can create (org_admin or org_staff)
create policy knowledge_items_insert on knowledge_items
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- Staff+ can update
create policy knowledge_items_update on knowledge_items
  for update using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- Admins only can delete
create policy knowledge_items_delete on knowledge_items
  for delete using (org_id in (select user_org_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- 4. RLS Policies — knowledge_attachments
-- ---------------------------------------------------------------------------

alter table knowledge_attachments enable row level security;

create policy knowledge_attach_select on knowledge_attachments
  for select using (
    knowledge_item_id in (select id from knowledge_items where org_id in (select user_active_org_ids()))
  );

create policy knowledge_attach_insert on knowledge_attachments
  for insert with check (
    knowledge_item_id in (
      select ki.id from knowledge_items ki
      where exists (
        select 1 from org_memberships om
        join roles rl on rl.id = om.role_id
        where om.org_id = ki.org_id
          and om.user_id = auth.uid()
          and om.status = 'active'
          and rl.base_role in ('org_admin', 'org_staff')
      )
    )
  );

create policy knowledge_attach_delete on knowledge_attachments
  for delete using (
    knowledge_item_id in (
      select ki.id from knowledge_items ki
      where exists (
        select 1 from org_memberships om
        join roles rl on rl.id = om.role_id
        where om.org_id = ki.org_id
          and om.user_id = auth.uid()
          and om.status = 'active'
          and rl.base_role in ('org_admin', 'org_staff')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. RLS Policies — junction tables (all three follow same pattern)
-- ---------------------------------------------------------------------------

alter table knowledge_item_items enable row level security;

create policy ki_items_select on knowledge_item_items
  for select using (org_id in (select user_active_org_ids()));

create policy ki_items_insert on knowledge_item_items
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy ki_items_delete on knowledge_item_items
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

alter table knowledge_item_updates enable row level security;

create policy ki_updates_select on knowledge_item_updates
  for select using (org_id in (select user_active_org_ids()));

create policy ki_updates_insert on knowledge_item_updates
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_updates.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy ki_updates_delete on knowledge_item_updates
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_updates.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

alter table knowledge_item_entities enable row level security;

create policy ki_entities_select on knowledge_item_entities
  for select using (org_id in (select user_active_org_ids()));

create policy ki_entities_insert on knowledge_item_entities
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_entities.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy ki_entities_delete on knowledge_item_entities
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_entities.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );
