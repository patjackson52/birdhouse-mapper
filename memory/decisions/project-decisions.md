# Project-Level Technical Decisions

Tracks technical decisions specific to this project. For organization-wide decisions, see `org-decisions.md`.

| Date | Decision | Context | Status |
|------|----------|---------|--------|
| 2024-11-15 | Next.js 14 App Router + Supabase | Needed full-stack framework with auth, DB, and edge support. Next.js 14 gives us RSC and server actions; Supabase provides auth, Postgres, and RLS out of the box. | Accepted |
| 2026-05-03 | Standalone landing/About-style routes deprecated; Puck site-editor is the single editable surface | PR #306 removed legacy landing-page code (closes #299). Same direction applies to About page (#319 still open). | Accepted |
| 2026-05-03 | PWA icon variants use white background; per-org theme color stays a wish | Fixes Android maskable halo (#314 / PR #317). Spec: docs/superpowers/specs/2026-05-03-pwa-logo-artifacts-design.md. Per-org icon background tracked separately in #315. | Accepted |
