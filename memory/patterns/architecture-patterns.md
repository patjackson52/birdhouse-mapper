# Architecture Patterns

High-level architecture patterns used in the system.

## Multi-Tenancy

- Tenant resolution happens in Next.js middleware via subdomain or header.
- Every database query is scoped to the current tenant.
- Tenant ID is stored in Supabase JWT claims and enforced by RLS.

## Auth

- Supabase Auth handles sign-up, sign-in, and session management.
- Auth state is accessed via `createServerClient` in server components and actions.
- Protected routes are enforced in middleware before rendering.

## Database

- Supabase Postgres with Row-Level Security (RLS) on all tenant-scoped tables.
- Migrations managed via `supabase/migrations/`.
- Database types are generated from the schema and kept in sync.
- Use Supabase client libraries, not raw SQL, in application code.

## Offline Sync Scoping

**Rule:** When adding a table to the inbound sync loop (`syncPropertyData` in `src/lib/offline/sync-engine.ts`), classify it as either `propertyScoped` or `orgScoped` based on which FK column the table actually has — not by analogy to similar tables.

**Why:** PR #321 fixed a silent bug where `geo_layers` was placed in `propertyScoped` with filter `.eq('property_id', propertyId)`. The `geo_layers` table has no `property_id` column; PostgREST returned `column geo_layers.property_id does not exist` (error 42703) on every sync cycle, meaning the local `geo_layers` IDB table was never populated via the sync engine. The correct scope is `orgScoped` (`.eq('org_id', orgId)`), matching the schema.

**How to apply when adding a new offline-cached table:**

1. Check the migration: does the table have `property_id` or only `org_id`?
   - `property_id` present → `propertyScoped` list.
   - `org_id` only → `orgScoped` list.
   - Neither (e.g. lookup/reference table) → handle explicitly (like `properties` or `orgs`), or omit from sync.
2. Add the table name to the correct array in `syncPropertyData`; never guess by analogy.
3. The Dexie schema index in `src/lib/offline/db.ts` must include the scoping column so the deletion-reconciliation pass (`.where(scopeColumn).equals(scopeValue)`) can use an indexed query.

**Note on `geo_layer_cache`:** This is a separate IDB table used for the SWR GeoJSON cache (see ADR-0009). It is **not** in `SYNC_TABLES` and is not subject to the inbound sync loop — it has its own revalidation path via `getGeoLayerPublicIfNewer`.
