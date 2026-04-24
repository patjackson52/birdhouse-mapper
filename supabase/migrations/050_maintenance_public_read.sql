-- =============================================================
-- 050_maintenance_public_read.sql — Additive public-read RLS
-- Allows anonymous SELECT on maintenance_projects and its junctions
-- when the project's property is marked is_active = true.
-- =============================================================

-- ---------------------------------------------------------------------------
-- maintenance_projects — anonymous select when property is active
-- ---------------------------------------------------------------------------

create policy maintenance_projects_select_public on maintenance_projects
  for select using (
    property_id is not null
    and exists (
      select 1 from properties p
      where p.id = maintenance_projects.property_id
        and p.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- maintenance_project_items — anonymous select via parent project
-- ---------------------------------------------------------------------------

create policy mpi_select_public on maintenance_project_items
  for select using (
    exists (
      select 1 from maintenance_projects mp
      join properties p on p.id = mp.property_id
      where mp.id = maintenance_project_items.maintenance_project_id
        and p.is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- maintenance_project_knowledge — anonymous select via parent project
-- ---------------------------------------------------------------------------

create policy mpk_select_public on maintenance_project_knowledge
  for select using (
    exists (
      select 1 from maintenance_projects mp
      join properties p on p.id = mp.property_id
      where mp.id = maintenance_project_knowledge.maintenance_project_id
        and p.is_active = true
    )
  );
