-- 045_species_picker.sql — Add API-source metadata for species-style entity types
-- Spec: docs/superpowers/specs/2026-04-17-species-picker-inaturalist-integration-design.md
--
-- Adds:
--   * entity_types.api_source — opt-in flag that swaps EntitySelect for SpeciesPicker
--   * entities.external_id     — iNaturalist taxon ID (or similar) for dedup
--   * Partial unique index on (entity_type_id, external_id) to prevent race duplicates

alter table entity_types
  add column api_source text
  check (api_source in ('inaturalist'))
  default null;

alter table entities
  add column external_id text default null;

create index idx_entities_external_id on entities(external_id);

create unique index idx_entities_unique_external
  on entities(entity_type_id, external_id)
  where external_id is not null;
