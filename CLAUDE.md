# FieldMapper — Claude Code Instructions

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
- **Notifications:** Multi-channel (in-app, email, SMS) via `notify()` helper in `src/lib/notifications/notify.ts`. pg_cron processes task deadline reminders every 15 minutes. Provider-agnostic adapters in `src/lib/notifications/adapters.ts` (console adapters for dev, swap in real providers later). Preferences per user/org in `user_notification_preferences` table.

## Conventions

- Tailwind CSS with custom classes (`.card`, `.btn-primary`, `.btn-secondary`, `.input-field`, `.label`)
- No external UI component library — all components custom-built
- Server actions return `{ success: true }` or `{ error: string }`
- Tests: Vitest + @testing-library/react, jsdom environment

## Playbooks

When completing issues that affect UI, follow the visual diff screenshot playbook:
- [Visual Diff Screenshots](docs/playbooks/visual-diff-screenshots.md) — Capture before/after screenshots and include in PR descriptions
