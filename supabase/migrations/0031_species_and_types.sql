-- 003_species_and_types.sql — Add species tables and join tables

-- ======================
-- Species table
-- ======================
create table species (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  scientific_name text,
  description text,
  photo_path text,
  conservation_status text,
  category text,
  external_link text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint on scientific_name when non-null
create unique index species_scientific_name_unique
  on species (scientific_name)
  where scientific_name is not null;

-- Updated_at trigger (reuses existing function from 001)
create trigger species_updated_at
  before update on species
  for each row execute function update_updated_at();

-- ======================
-- Join tables
-- ======================

create table item_species (
  item_id uuid not null references items(id) on delete cascade,
  species_id uuid not null references species(id) on delete restrict,
  primary key (item_id, species_id)
);

create table update_species (
  update_id uuid not null references item_updates(id) on delete cascade,
  species_id uuid not null references species(id) on delete restrict,
  primary key (update_id, species_id)
);

-- Indexes for FK lookups
create index idx_item_species_species on item_species(species_id);
create index idx_update_species_species on update_species(species_id);
create index idx_update_species_update on update_species(update_id);

-- ======================
-- RLS
-- ======================

alter table species enable row level security;
alter table item_species enable row level security;
alter table update_species enable row level security;

-- species: public read, authenticated write
create policy "Public can view species"
  on species for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert species"
  on species for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update species"
  on species for update
  to authenticated
  using (true);

create policy "Authenticated users can delete species"
  on species for delete
  to authenticated
  using (true);

-- item_species: public read, authenticated write
create policy "Public can view item species"
  on item_species for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert item species"
  on item_species for insert
  to authenticated
  with check (true);

create policy "Authenticated users can delete item species"
  on item_species for delete
  to authenticated
  using (true);

-- update_species: public read, authenticated write
create policy "Public can view update species"
  on update_species for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert update species"
  on update_species for insert
  to authenticated
  with check (true);

create policy "Authenticated users can delete update species"
  on update_species for delete
  to authenticated
  using (true);
