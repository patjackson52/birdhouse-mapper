-- 005_location_history.sql — Location history for audit trail

create table location_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  latitude float8 not null,
  longitude float8 not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_location_history_item on location_history(item_id);
create index idx_location_history_created on location_history(created_at desc);

-- RLS: append-only audit log (no update/delete policies)
alter table location_history enable row level security;

-- Public can view location history
create policy "Public can view location history"
  on location_history for select
  to anon, authenticated
  using (true);

-- Authenticated users can insert location history
create policy "Authenticated users can insert location history"
  on location_history for insert
  to authenticated
  with check (true);

-- Backfill: create initial location_history row for every existing item
-- Only backfill items that have a created_by value (skip any without)
insert into location_history (item_id, latitude, longitude, created_by)
select id, latitude, longitude, created_by
from items
where created_by is not null;
