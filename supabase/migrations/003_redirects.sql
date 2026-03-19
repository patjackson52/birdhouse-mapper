-- 003_redirects.sql — QR code redirect system
-- Allows QR codes to point to /go/:slug which redirects to a configurable destination

-- ======================
-- Redirects table
-- ======================

create table redirects (
  slug text primary key,
  destination_url text not null,
  scan_count integer not null default 0,
  created_at timestamptz default now()
);

-- ======================
-- RLS policies
-- ======================

alter table redirects enable row level security;

-- Public can look up redirects (needed for the middleware redirect)
create policy "Public can view redirects"
  on redirects for select
  to anon, authenticated
  using (true);

-- Admins can manage redirects
create policy "Admins can insert redirects"
  on redirects for insert
  to authenticated
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update redirects"
  on redirects for update
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete redirects"
  on redirects for delete
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- ======================
-- Scan count increment function
-- ======================

-- SECURITY DEFINER so anonymous/public requests can increment the counter
-- without needing UPDATE permission on the redirects table
create or replace function increment_scan_count(slug_param text)
returns void
language sql
security definer
as $$
  update redirects
  set scan_count = scan_count + 1
  where slug = slug_param;
$$;
