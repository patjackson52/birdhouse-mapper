# Local Development Guide

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) installed
- Node.js 18+
- Docker (required by Supabase CLI)

## Quick Start

```bash
# 1. Start local Supabase (runs migrations + seed automatically)
supabase start

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev
```

The seed runs automatically on `supabase start` (first time) and `supabase db reset`.

## Test Accounts

All accounts use password: **`password123`**

| Email | Role | What they can do |
|-------|------|------------------|
| `admin@test.fieldmapper.org` | **org_admin** | Everything: settings, members, billing, roles, all content, all modules |
| `staff@test.fieldmapper.org` | **org_staff** | Create/edit all content, view reports, manage tasks. Cannot manage org settings or members |
| `contributor@test.fieldmapper.org` | **contributor** | Edit assigned items, create updates, complete assigned tasks. Cannot create items or manage settings |
| `viewer@test.fieldmapper.org` | **viewer** | Read-only: view items, updates, assigned tasks. Cannot create, edit, or manage anything |

### Test Org

- **Name:** Test Org
- **Slug:** `test-org`
- **Property:** Test Property (Fairbanks, AK — 64.8378, -147.7164)
- **Items:** 5 items (4 bird boxes + 1 trail marker)
- **Entities:** 3 species (Chickadee, Violet-green Swallow, Tree Swallow)

## Resetting the Database

```bash
# Full reset: drops all data, re-runs migrations + seed
supabase db reset
```

This recreates all test accounts and seed data from scratch. Use this when:
- You need a clean slate after manual testing
- You've applied new migrations and want to verify they work with the seed
- The database is in a broken state

## Local Services

| Service | URL | Purpose |
|---------|-----|---------|
| App | http://localhost:3000 | Next.js dev server |
| Supabase API | http://127.0.0.1:54321 | REST/Auth API |
| Supabase Studio | http://127.0.0.1:54323 | Database UI (browse tables, run SQL) |
| Inbucket | http://127.0.0.1:54324 | Email testing (catches signup/reset emails) |

## Testing Workflow

### Manual testing by role

To verify features work correctly across permission levels:

1. **Reset DB** — `supabase db reset` for a clean starting point
2. **Test as admin** — sign in as `admin@test.fieldmapper.org`, verify full access
3. **Test as staff** — sign in as `staff@test.fieldmapper.org`, verify content creation works but settings are restricted
4. **Test as contributor** — sign in as `contributor@test.fieldmapper.org`, verify edit-only access on assigned items
5. **Test as viewer** — sign in as `viewer@test.fieldmapper.org`, verify read-only behavior

To switch accounts: sign out via the UI or clear browser cookies, then sign in with a different test account.

### Automated tests

```bash
# Unit tests (fast, no DB required)
npm run test

# E2E smoke tests (~30s, requires local Supabase running)
npm run test:e2e:smoke

# Full E2E suite
npm run test:e2e
```

### Suggested dev cycle for new features

1. `supabase db reset` — start clean
2. Write your migration in `supabase/migrations/`
3. `supabase db reset` — verify migration + seed still work together
4. Implement the feature
5. Test manually across roles (at minimum: admin + one restricted role)
6. Write/run unit tests: `npm run test`
7. Run E2E smoke: `npm run test:e2e:smoke`
8. If seed data needs updating for the new feature, update `supabase/seed.sql`

### Adding seed data for new features

When your feature needs specific seed data for testing:

1. Add SQL to `supabase/seed.sql` using deterministic UUIDs (pattern: `00000000-0000-0000-0000-00000000XXXX`)
2. Run `supabase db reset` to verify the seed works
3. Document any new test accounts or data in this file

Keep the seed focused — it should create just enough data to exercise core workflows, not replicate production volumes.
