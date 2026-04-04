# FieldMapper — Claude Code Instructions

> **Read `AGENTS.md` at the start of every session.** It is the canonical operating manual — architectural invariants, coding discipline, memory policy, ADR process, and cross-agent conventions. This file contains Claude Code-specific instructions that extend it.

## Project Overview

FieldMapper is a multi-tenant field mapping platform for conservation teams. Built with Next.js 14, Supabase, Tailwind CSS, and Leaflet.

## Key Commands

- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run test` — Run tests (Vitest)
- `npm run test -- --watch` — Watch mode
- `npm run type-check` — TypeScript check (`tsc --noEmit`)
- `npm run test:e2e` — Run full Playwright E2E suite
- `npm run test:e2e:smoke` — Run smoke subset (~5 tests, <30s)
- `npx playwright test --config=e2e/playwright.config.ts --ui` — Interactive Playwright UI
- `npx playwright test --config=e2e/playwright.config.ts e2e/tests/visual/ --update-snapshots` — Regenerate visual baselines

## Architecture

- **Multi-tenant:** Tenant resolution via middleware (custom domains, platform subdomains, default org)
- **Auth:** Supabase Auth (email/password + Google OAuth)
- **Database:** Supabase PostgreSQL with RLS policies
- **Server actions:** `'use server'` files for mutations, `createClient()` from `@/lib/supabase/server` (synchronous)
- **Client queries:** `createClient()` from `@/lib/supabase/client` (synchronous)

## Conventions

- Tailwind CSS with custom classes (`.card`, `.btn-primary`, `.btn-secondary`, `.input-field`, `.label`)
- No external UI component library — all components custom-built
- Server actions return `{ success: true }` or `{ error: string }`
- Tests: Vitest + @testing-library/react, jsdom environment

## Playbooks

When completing issues that affect UI, follow the visual diff screenshot playbook:
- [Visual Diff Screenshots](docs/playbooks/visual-diff-screenshots.md) — Capture before/after screenshots and include in PR descriptions

## Memory Policy

See `AGENTS.md` for the full memory policy. Key rules for Claude Code:

### Repo files are the canonical memory layer

Claude Code has its own built-in memory (`~/.claude/projects/` with `MEMORY.md`). **Use repo files instead** for anything that should be shared across tools, developers, or sessions. Claude Code's built-in memory is fine for personal preferences and ephemeral session notes, but durable project knowledge must go into repo files so every tool and contributor can see it.

1. **Durable memory lives in repo files.** If it matters beyond this conversation, write it to a file.
2. **Always state which file was updated** when recording memory.
3. **Technical decisions** → `docs/adr/NNNN-title.md` (use `scripts/new-adr.sh`).
4. **Project/org decisions** → `memory/decisions/`.
5. **Patterns** → `memory/patterns/`.
6. **Procedures** → `memory/procedures/` or `docs/playbooks/`.
7. **Context** → `memory/context/`.
8. **Quick notes** → `memory/inbox/` (use `scripts/remember.sh`).

### When the user says "remember this"

Do **not** save to Claude Code's built-in memory. Instead, write to the appropriate repo file under `memory/` or `docs/adr/` and confirm the file path. See the Handling Memory Commands section in `AGENTS.md` for the full routing table.
