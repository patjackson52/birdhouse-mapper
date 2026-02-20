-- IslandWood Birdhouse Project — Initial Schema
-- Run this migration in the Supabase SQL editor

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ======================
-- Tables
-- ======================

-- Profiles (extends Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz default now()
);

-- Birdhouses
create table birdhouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  latitude double precision not null,
  longitude double precision not null,
  species_target text,
  status text not null default 'planned' check (status in ('active', 'planned', 'damaged', 'removed')),
  installed_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

-- Birdhouse Updates
create table birdhouse_updates (
  id uuid primary key default gen_random_uuid(),
  birdhouse_id uuid references birdhouses(id) on delete cascade,
  update_type text not null check (update_type in ('installation', 'observation', 'maintenance', 'damage', 'sighting')),
  content text,
  update_date date not null default current_date,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

-- Photos
create table photos (
  id uuid primary key default gen_random_uuid(),
  birdhouse_id uuid references birdhouses(id) on delete cascade,
  update_id uuid references birdhouse_updates(id) on delete cascade,
  storage_path text not null,
  caption text,
  is_primary boolean default false,
  created_at timestamptz default now()
);

-- Bird Species
create table bird_species (
  id uuid primary key default gen_random_uuid(),
  common_name text not null,
  scientific_name text,
  description text,
  habitat text,
  likelihood text,
  image_url text
);

-- ======================
-- Indexes
-- ======================

create index idx_birdhouses_status on birdhouses(status);
create index idx_updates_birdhouse on birdhouse_updates(birdhouse_id);
create index idx_photos_birdhouse on photos(birdhouse_id);
create index idx_photos_update on photos(update_id);

-- ======================
-- Updated_at trigger
-- ======================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger birdhouses_updated_at
  before update on birdhouses
  for each row execute function update_updated_at();

-- ======================
-- Auto-create profile on signup
-- ======================

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, display_name, role)
  values (new.id, new.raw_user_meta_data->>'display_name', 'editor');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ======================
-- Row Level Security
-- ======================

alter table birdhouses enable row level security;
alter table birdhouse_updates enable row level security;
alter table photos enable row level security;
alter table bird_species enable row level security;
alter table profiles enable row level security;

-- Public read policies
create policy "Public can view birdhouses"
  on birdhouses for select
  to anon, authenticated
  using (true);

create policy "Public can view updates"
  on birdhouse_updates for select
  to anon, authenticated
  using (true);

create policy "Public can view photos"
  on photos for select
  to anon, authenticated
  using (true);

create policy "Public can view bird species"
  on bird_species for select
  to anon, authenticated
  using (true);

-- Authenticated write policies (editors and admins)
create policy "Authenticated users can insert birdhouses"
  on birdhouses for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'editor')
    )
  );

create policy "Authenticated users can update birdhouses"
  on birdhouses for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'editor')
    )
  );

create policy "Authenticated users can insert updates"
  on birdhouse_updates for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'editor')
    )
  );

create policy "Authenticated users can update updates"
  on birdhouse_updates for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'editor')
    )
  );

create policy "Authenticated users can insert photos"
  on photos for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'editor')
    )
  );

-- Admin-only delete policies
create policy "Admins can delete birdhouses"
  on birdhouses for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete updates"
  on birdhouse_updates for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete photos"
  on photos for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Bird species: admin-only write
create policy "Admins can insert bird species"
  on bird_species for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update bird species"
  on bird_species for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete bird species"
  on bird_species for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Profiles: users can read own, admins can manage all
create policy "Users can view own profile"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Admins can view all profiles"
  on profiles for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role = 'admin'
    )
  );

create policy "Admins can update profiles"
  on profiles for update
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role = 'admin'
    )
  );

-- ======================
-- Storage bucket
-- ======================

insert into storage.buckets (id, name, public)
values ('birdhouse-photos', 'birdhouse-photos', true)
on conflict (id) do nothing;

create policy "Public can view photos storage"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'birdhouse-photos');

create policy "Authenticated users can upload photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'birdhouse-photos');

create policy "Authenticated users can update own photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'birdhouse-photos');

create policy "Admins can delete photos from storage"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'birdhouse-photos');

-- ======================
-- Seed Data
-- ======================

-- Bird Species
insert into bird_species (common_name, scientific_name, description, habitat, likelihood) values
(
  'Black-capped Chickadee',
  'Poecile atricapillus',
  'A small, energetic songbird with a distinctive black cap and bib, white cheeks, and gray back. Known for its cheerful "chick-a-dee-dee-dee" call. One of the most common and beloved backyard birds in the Pacific Northwest.',
  'Mixed and deciduous forests, forest edges, willow thickets, and suburban areas. Readily uses nest boxes.',
  'Very Likely'
),
(
  'Violet-green Swallow',
  'Tachycineta thalassina',
  'A graceful aerial insectivore with iridescent green upperparts and violet rump. White face patches extend above the eye, distinguishing it from the similar Tree Swallow. Often seen swooping over meadows and water.',
  'Open woodlands, forest clearings, and near water. Nests in tree cavities and readily adopts nest boxes.',
  'Likely'
),
(
  'Tree Swallow',
  'Tachycineta bicolor',
  'A sleek swallow with iridescent blue-green upperparts and clean white underparts. An agile flier that catches insects on the wing. Often perches on wires and dead branches near open fields.',
  'Open areas near water, meadows, marshes, and agricultural fields. One of the first cavity nesters to adopt nest boxes.',
  'Likely'
),
(
  'Bewick''s Wren',
  'Thryomanes bewickii',
  'A small, active wren with a long tail often held upright. Gray-brown above with a bold white eyebrow stripe. Sings a complex, varied song from exposed perches. A year-round resident of the Pacific Northwest.',
  'Brushy areas, thickets, suburban gardens, and open woodlands. Uses cavities and nest boxes in sheltered locations.',
  'Moderate'
),
(
  'Chestnut-backed Chickadee',
  'Poecile rufescens',
  'A small chickadee with a rich chestnut-brown back and flanks, black cap, and white cheeks. More closely tied to coniferous forests than its Black-capped cousin. Common in the wet forests of the Pacific Northwest.',
  'Coniferous and mixed forests, particularly in moist, coastal environments. Uses tree cavities and nest boxes.',
  'Very Likely'
);

-- Sample Birdhouses
insert into birdhouses (name, description, latitude, longitude, species_target, status, installed_date) values
(
  'Meadow View Box #1',
  'Located at the edge of the great meadow near the main trail. Mounted on a cedar post at 5 feet height, facing east for morning sun. This was the first birdhouse installed as part of the Eagle Scout project.',
  47.6235,
  -122.5185,
  'Black-capped Chickadee',
  'active',
  '2025-03-15'
),
(
  'Forest Trail Box #2',
  'Positioned along the forest trail near the outdoor classroom. Attached to a Douglas fir at 8 feet height. Designed with a 1.25-inch entrance hole for smaller cavity nesters.',
  47.6228,
  -122.5192,
  'Chestnut-backed Chickadee',
  'active',
  '2025-03-15'
),
(
  'Wetland Overlook Box #3',
  'Planned for installation near the wetland boardwalk area. Will be mounted on a post with a predator guard. Target species are swallows that feed over the wetland.',
  47.6242,
  -122.5178,
  'Violet-green Swallow',
  'planned',
  null
);

-- Sample Updates for active birdhouses
insert into birdhouse_updates (birdhouse_id, update_type, content, update_date)
select id, 'installation', 'Birdhouse installed successfully! Cedar post set in concrete, house mounted at 5ft facing east. Weather was clear and mild.', '2025-03-15'
from birdhouses where name = 'Meadow View Box #1';

insert into birdhouse_updates (birdhouse_id, update_type, content, update_date)
select id, 'observation', 'First visit from a pair of Black-capped Chickadees! They investigated the entrance hole for about 10 minutes. Very encouraging.', '2025-04-02'
from birdhouses where name = 'Meadow View Box #1';

insert into birdhouse_updates (birdhouse_id, update_type, content, update_date)
select id, 'sighting', 'Confirmed nesting! Chickadee pair actively bringing nesting material into the box. Could see moss and animal fur being carried in.', '2025-04-20'
from birdhouses where name = 'Meadow View Box #1';

insert into birdhouse_updates (birdhouse_id, update_type, content, update_date)
select id, 'installation', 'Birdhouse mounted on Douglas fir using lag bolts with spacers to protect the tree. Entrance faces southeast, away from prevailing winds.', '2025-03-15'
from birdhouses where name = 'Forest Trail Box #2';

insert into birdhouse_updates (birdhouse_id, update_type, content, update_date)
select id, 'maintenance', 'Checked mounting hardware after spring storms. All secure. Cleaned out some spider webs from the entrance.', '2025-04-10'
from birdhouses where name = 'Forest Trail Box #2';
