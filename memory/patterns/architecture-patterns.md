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
