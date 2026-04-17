# AGENTS.md — Operating Manual for AI Agents

This is the canonical operating manual for all AI agents working in the FieldMapper repository. Every agent — Claude Code, OpenClaw, Copilot, Cursor, or any other — must read and follow this file.

## Mission

FieldMapper is a multi-tenant field mapping platform for conservation teams. It enables organizations to collect, visualize, and manage geospatial field data through a browser-based mapping interface. The tech stack is Next.js 14, Supabase, Tailwind CSS, and Leaflet.

## Agent Conduct

1. **Read before writing.** Understand the file, module, or system you are changing before making edits.
2. **Small, verifiable changes.** Prefer focused commits. Do not bundle unrelated changes.
3. **No speculative refactors.** Only change code that is necessary to complete the task at hand.
4. **Ask when uncertain.** If a requirement is ambiguous, ask rather than guess.
5. **Leave the repo better than you found it** — but only in ways directly related to the current task.
6. **Never commit secrets, credentials, or .env files.**

## Architectural Invariants

These are non-negotiable. Do not deviate without an ADR (see below).

| Invariant | Detail |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Row-Level Security | All tables must have RLS policies. Never bypass RLS. |
| Multi-tenancy | Tenant resolution via middleware (custom domains, platform subdomains, default org) |
| Maps | Leaflet (no Mapbox GL, no Google Maps) |
| Styling | Tailwind CSS with custom utility classes (`.card`, `.btn-primary`, `.btn-secondary`, `.input-field`, `.label`) |
| UI Components | Custom-built only. No external component libraries (no shadcn, no MUI, no Chakra). |
| Server mutations | Server actions (`'use server'`) returning `{ success: true }` or `{ error: string }` |
| Server Supabase | `createClient()` from `@/lib/supabase/server` (synchronous) |
| Client Supabase | `createClient()` from `@/lib/supabase/client` (synchronous) |
| Offline cache safety | Any SQL migration that touches a table in `SYNC_TABLES` (see `src/lib/offline/sync-engine.ts`) must follow `docs/playbooks/offline-cache-schema-changes.md`. When in doubt, `update <table> set updated_at = now();` in the same migration. |

## Coding and Change Discipline

- **TypeScript** everywhere. No `any` types without explicit justification.
- **Vitest** for unit/integration tests. `@testing-library/react` with jsdom environment.
- **Playwright** for E2E tests.
- **Tailwind CSS** — use the project's custom classes before inventing new ones.
- **Server actions pattern** — mutations go in `'use server'` files, not in API routes.
- Run `npm run type-check` before considering work done.
- Run `npm run test` to verify tests pass.
- See `CLAUDE.md` for the full list of commands and playbooks.

## Memory Policy

Durable memory lives in **repo files**, not in chat context, not in external databases, not in agent-specific config. If it matters beyond the current conversation, it must be written to the repo.

### Memory Locations

| Kind of memory | Where it goes | Format |
|---|---|---|
| **Technical decisions (ADRs)** | `docs/adr/NNNN-title.md` | ADR (see below) |
| **Project decisions** | `memory/decisions/project-decisions.md` | Table: Date, Decision, Context, Status |
| **Org decisions** | `memory/decisions/org-decisions.md` | Table: Date, Decision, Context, Status |
| **Coding patterns** | `memory/patterns/coding-patterns.md` | Categorized notes |
| **Architecture patterns** | `memory/patterns/architecture-patterns.md` | Categorized notes |
| **Procedures** | `memory/procedures/*.md` | Step-by-step guide |
| **Product context** | `memory/context/product-context.md` | Prose or structured notes |
| **Team context** | `memory/context/team-context.md` | Prose or structured notes |
| **Quick notes (unsorted)** | `memory/inbox/` | Timestamped files |
| **Playbooks** | `docs/playbooks/*.md` | Step-by-step guide |

### Handling Memory Commands

When a user says:

- **"Remember this locally"** or **"remember this for the project"** — Write to the appropriate file under `memory/`. Use `scripts/remember.sh <category> "message"` or edit the file directly. State exactly which file was updated.
- **"Record this as a decision"** — Create an ADR in `docs/adr/` using `scripts/new-adr.sh "Title"`. State the file path.
- **"Promote this to org memory"** — Add to `memory/decisions/org-decisions.md` or to `AGENTS.md` (if it is an invariant or cross-agent policy). Use `scripts/promote-memory.sh` to move inbox items. State which file was updated.
- **"Add this to the playbook"** — Write or update a file in `docs/playbooks/`. State the file path.

### Rules

1. **Always write memory to a repo file.** Never rely on conversation history alone.
2. **Always state which file was updated** when memory changes. Example: "Recorded in `docs/adr/0003-switch-to-server-actions.md`."
3. **Create directories as needed.** If `memory/context/` does not exist, create it.
4. **Keep files focused.** One topic per memory file, one decision per ADR.

## Architecture Decision Records (ADRs)

Create an ADR when:
- Choosing between two or more viable technical approaches
- Introducing a new dependency or removing an existing one
- Changing an architectural invariant listed above
- Making a decision that future agents or developers will need to understand

### ADR Format

```markdown
# NNNN — Title

## Status
Proposed | Accepted | Deprecated | Superseded by NNNN

## Context
What is the situation? What problem are we solving?

## Decision
What did we decide?

## Consequences
What are the trade-offs? What changes as a result?
```

ADRs are stored in `docs/adr/` and numbered sequentially (0001, 0002, ...).

## Reference

- `CLAUDE.md` — Claude Code-specific instructions, commands, conventions, and playbooks.
- `SOUL.md` — OpenClaw-specific behavior directives.
- `.cursor/rules/` — Cursor IDE rules (project overview, coding standards, memory policy).
- `docs/adr/` — Architectural decision records.
- `docs/playbooks/` — Step-by-step operational procedures.
- `memory/` — Durable project memory (decisions, patterns, procedures, context, inbox).
- `scripts/new-adr.sh` — Create a new ADR from template.
- `scripts/remember.sh` — Quick-add a timestamped entry to a memory file.
- `scripts/promote-memory.sh` — Promote an inbox item to a permanent memory location.
