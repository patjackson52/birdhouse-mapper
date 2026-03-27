# Playwright E2E Testing + Agentic CI Design

**Date:** 2026-03-26
**Status:** Draft

## Context

FieldMapper has CI (lint, type-check, build) and Vercel preview deploys per branch, but no E2E tests, no test step in CI, and no Playwright. Unit tests exist (Vitest + @testing-library/react, 18 files, 179 tests) but don't cover real user flows.

This design adds Playwright-based E2E testing that runs against Vercel preview URLs, with visual regression, automated PR reporting, and local smoke tests via Claude Code hooks. The goal is agentic dev workflows that verify changes, prevent regressions, and report results on PRs.

## Requirements

1. **Playwright E2E tests** covering auth, map/items CRUD, admin panel, and onboarding
2. **CI integration** running E2E tests against Vercel preview URLs after deploy
3. **Visual regression** with screenshot baselines committed to the repo
4. **PR reporting** with test summaries, failure screenshots, and visual diff results posted as PR comments
5. **Local smoke tests** via Claude Code pre-push hook for fast feedback
6. **Dedicated test Supabase project** for isolated, deterministic test data
7. **Regression prevention** for critical user flows

## Architecture

### Pipeline Flow

```
Push to branch
  → ci.yml: Lint + unit tests + type-check + build  (existing, add test step)
  → deploy.yml: Build + deploy to Vercel preview     (existing, unchanged)
  → e2e.yml: Wait for deploy → Playwright against preview URL → Post PR comment  (NEW)
```

All three workflows run in parallel on push. The E2E workflow waits for the Vercel deployment to complete via the `deployment_status` event before running tests.

### Components

1. **`e2e/playwright.config.ts`** targeting Chromium + Firefox + Mobile Safari
2. **Test Supabase project** (`birdhouse-mapper-test`) with stable seed data
3. **`e2e.yml`** GH Actions workflow triggered by `deployment_status`
4. **Claude Code pre-push hook** running `@smoke`-tagged tests locally
5. **PR reporter** script posting formatted results via `gh pr comment`

## Test Supabase Project

A separate Supabase project provides isolated, deterministic data for E2E tests.

### Seed Data

Seeded once during project setup (not per test run):

- **1 org:** "Test Org" (slug: `test-org`, setup_complete: true)
- **1 property:** "Test Property" (slug: `default`, with map center + about content)
- **4 system roles:** Admin, Staff, Contributor, Viewer
- **2 users:**
  - Admin: `admin@test.fieldmapper.org` / known password, org_admin role
  - Editor: `editor@test.fieldmapper.org` / known password, contributor role
- **2 item types:** "Bird Box" + "Trail Marker"
- **1 entity type:** "Species" with fields: Scientific Name (text), Conservation Status (dropdown)
- **3 entities:** Black-capped Chickadee, Violet-green Swallow, Tree Swallow
- **5 items:** with varying statuses, entity associations, custom field values
- **3 item updates:** with photos and entity associations

### Credentials

Stored as GH Actions secrets:
- `TEST_SUPABASE_URL`
- `TEST_SUPABASE_ANON_KEY`
- `TEST_SUPABASE_SERVICE_ROLE_KEY`
- `TEST_USER_ADMIN_EMAIL`
- `TEST_USER_ADMIN_PASSWORD`
- `TEST_USER_EDITOR_EMAIL`
- `TEST_USER_EDITOR_PASSWORD`

### Vercel Preview Environment

Vercel dashboard configured with **Preview**-environment-only env vars pointing to the test Supabase project:
- `NEXT_PUBLIC_SUPABASE_URL` → test project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → test project anon key
- `SUPABASE_SERVICE_ROLE_KEY` → test project service key

Production environment keeps the real Supabase project. Preview deploys automatically use the test database.

### Test Data Cleanup

Tests that create data (e.g., onboarding wizard creates a new org) use unique timestamped names and clean up via the service role key in `afterEach` / `afterAll` hooks. The base seed data is never modified by tests — only additive data is created and removed.

## Directory Layout

```
e2e/
├── playwright.config.ts
├── fixtures/
│   ├── auth.ts              — Login/session fixtures (storageState pattern)
│   ├── test-data.ts          — Constants: test org, user, item IDs from seed data
│   └── seed.ts               — Supabase service-role helpers for setup/teardown
├── tests/
│   ├── auth/
│   │   ├── login.spec.ts           — Email/password login
│   │   ├── signup.spec.ts          — New account creation
│   │   ├── invite.spec.ts          — Invite link flow
│   │   └── session-expiry.spec.ts  — Temp account expiry
│   ├── map/
│   │   ├── map-view.spec.ts        — Map loads, markers render
│   │   ├── item-detail.spec.ts     — Click marker → detail panel opens
│   │   └── item-crud.spec.ts       — Create/edit/delete items              @smoke
│   ├── admin/
│   │   ├── item-types.spec.ts      — CRUD item types
│   │   ├── entity-types.spec.ts    — CRUD entity types + entities
│   │   ├── settings.spec.ts        — Org/property settings
│   │   ├── members.spec.ts         — Member management
│   │   └── landing-editor.spec.ts  — Landing page block editor
│   ├── onboarding/
│   │   └── org-wizard.spec.ts      — Full onboarding flow + AI entity step
│   └── visual/
│       ├── map-view.visual.ts      — Map page screenshots
│       ├── admin-dashboard.visual.ts
│       ├── detail-panel.visual.ts
│       └── landing-page.visual.ts
├── screenshots/                    — Baseline images (committed to repo)
└── test-results/                   — Generated artifacts (gitignored)
```

## Auth Fixture Pattern

Tests need authenticated sessions. We use Playwright's `storageState` pattern to avoid logging in via the UI for every test.

### Global Setup

A `global-setup.ts` file runs once before all tests:
1. Uses Supabase Auth API (not browser) to sign in as admin and editor
2. Creates browser contexts, navigates to the app (sets cookies/localStorage)
3. Saves auth state to JSON files:
   - `.auth/admin.json` — org_admin session
   - `.auth/editor.json` — contributor session
4. These files are gitignored

### Test Usage

```typescript
// Tests that need admin auth:
test.use({ storageState: '.auth/admin.json' });

// Tests that need editor auth:
test.use({ storageState: '.auth/editor.json' });

// Tests for public/anon pages:
// No storageState — default empty context
```

## Tag System

- **`@smoke`** — Quick critical path tests (~5 tests, <30s). Run locally via Claude Code hook. Covers: login, map loads, create item, view item detail, admin page loads.
- **`@visual`** — Screenshot comparison tests. Run in CI only (viewport-sensitive). Located in `e2e/tests/visual/`.
- **No tag** — Full regression suite. Run in CI against preview URL.

## CI Workflows

### Modified: `.github/workflows/ci.yml`

Add unit test step (currently missing):

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test          # ← NEW: unit tests
      - run: npm run type-check
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
```

### New: `.github/workflows/e2e.yml`

Triggered by Vercel's `deployment_status` event:

```yaml
name: E2E Tests
on:
  deployment_status:

jobs:
  playwright:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium firefox webkit

      - name: Run E2E tests
        run: npx playwright test
        env:
          PLAYWRIGHT_BASE_URL: ${{ github.event.deployment_status.target_url }}
          TEST_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          TEST_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
          TEST_USER_ADMIN_EMAIL: ${{ secrets.TEST_USER_ADMIN_EMAIL }}
          TEST_USER_ADMIN_PASSWORD: ${{ secrets.TEST_USER_ADMIN_PASSWORD }}
          TEST_USER_EDITOR_EMAIL: ${{ secrets.TEST_USER_EDITOR_EMAIL }}
          TEST_USER_EDITOR_PASSWORD: ${{ secrets.TEST_USER_EDITOR_PASSWORD }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            e2e/test-results/
            playwright-report/

      - name: Post PR comment
        if: always()
        run: bash scripts/post-e2e-comment.sh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          DEPLOYMENT_URL: ${{ github.event.deployment_status.target_url }}
          DEPLOYMENT_REF: ${{ github.event.deployment.ref }}
```

### Deployment Status Event

Vercel sends `deployment_status` events to GitHub when a deploy completes. The event payload includes:
- `deployment_status.state` — `success`, `failure`, or `error`
- `deployment_status.target_url` — the preview URL (e.g., `https://birdhouse-mapper-abc123.vercel.app`)
- `deployment.ref` — the branch/commit ref

The workflow filters on `state == 'success'` to only run tests after successful deploys.

**Prerequisite:** Vercel's GitHub integration must be installed on the repo for `deployment_status` events to fire. This is already the case — the existing `deploy.yml` workflow uses `VERCEL_TOKEN` and Vercel is linked to the repo.

## PR Comment Format

```markdown
## 🎭 E2E Test Results

**Status:** ✅ 24/24 passed
**Preview:** https://birdhouse-mapper-abc123.vercel.app
**Duration:** 2m 34s | **Browsers:** Chromium, Firefox, WebKit

### Visual Regression
✅ 8/8 screenshots match baseline

📎 [Full Report](link-to-artifacts)
```

On failure:

```markdown
## 🎭 E2E Test Results

**Status:** ❌ 22/24 passed, 2 failed
**Preview:** https://birdhouse-mapper-abc123.vercel.app
**Duration:** 3m 12s | **Browsers:** Chromium, Firefox, WebKit

### Failures
| Test | Browser | Error |
|------|---------|-------|
| `auth/login.spec.ts` > `redirects after login` | Chromium | Timeout waiting for `/map` navigation |
| `map/item-crud.spec.ts` > `creates a new item` | Firefox | Element `#name` not found |

### Visual Regression
⚠️ 7/8 match, 1 diff detected

📎 [Full Report](link-to-artifacts) · [Failure Screenshots](link-to-artifacts) · [Visual Diffs](link-to-artifacts)
```

The comment is created on the first run and updated (not duplicated) on subsequent pushes to the same PR using `gh pr comment --edit-last` or by searching for an existing comment with a marker string.

### `scripts/post-e2e-comment.sh`

This script:
1. Finds the PR associated with the deployment ref using `gh pr list --head $DEPLOYMENT_REF`
2. Parses `e2e/test-results/results.json` (Playwright JSON reporter output) for pass/fail counts, failure details, and duration
3. Checks for visual regression diffs in `e2e/test-results/` (files matching `*-diff.png`)
4. Builds the markdown comment from a template
5. Searches for an existing comment with the `<!-- e2e-results -->` marker
6. Creates or updates the PR comment via `gh pr comment`

## Visual Regression

### Implementation

Uses Playwright's built-in `expect(page).toHaveScreenshot()`:

```typescript
test('map page matches baseline', async ({ page }) => {
  await page.goto('/map');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('map-view.png', {
    mask: [page.locator('.leaflet-tile-pane')],  // mask map tiles
    maxDiffPixelRatio: 0.01,
  });
});
```

### Baseline Management

- Baseline images committed to `e2e/screenshots/` — one per test per browser per viewport
- **Generating baselines:** `npx playwright test e2e/tests/visual/ --update-snapshots`
- **Updating after intentional changes:** re-run with `--update-snapshots`, commit new images
- **CI behavior:** if baselines don't exist, the test fails (never auto-accepts new baselines in CI)

### Visual Test Specs

| File | Page | Viewports | Masks |
|------|------|-----------|-------|
| `map-view.visual.ts` | `/map` with markers | Desktop (1280x720), Mobile (375x812) | Map tile layer |
| `admin-dashboard.visual.ts` | `/admin/properties/default` | Desktop | Timestamps, user-specific data |
| `detail-panel.visual.ts` | `/map` with detail panel open | Desktop, Mobile | Photos (loading timing varies), timestamps |
| `landing-page.visual.ts` | `/` (public landing) | Desktop, Mobile | None (deterministic with seed data) |

### Flakiness Mitigations

1. **Mask map tiles** — Leaflet tiles load asynchronously from external CDN; mask the tile pane, test only UI overlay
2. **`waitForLoadState('networkidle')`** — ensure all resources loaded before screenshot
3. **1% pixel tolerance** — `maxDiffPixelRatio: 0.01` absorbs minor anti-aliasing differences
4. **Locked viewports** — consistent viewport sizes in Playwright config
5. **Font loading** — `await page.waitForFunction(() => document.fonts.ready)` before visual screenshots

### Artifact Output

When a visual test fails, Playwright generates three images:
- **Expected** (baseline from repo)
- **Actual** (current screenshot)
- **Diff** (changed pixels highlighted in magenta)

All three uploaded as GH Actions artifacts and linked in the PR comment.

## Claude Code Pre-Push Hook

### Configuration

Added to project-level `.claude/settings.json`:

```json
{
  "hooks": {
    "PrePush": [
      {
        "command": "npx playwright test --grep @smoke --reporter=line",
        "timeout": 60000
      }
    ]
  }
}
```

### Behavior

- Runs ~5 `@smoke`-tagged tests against `localhost:3000`
- Developer must have `npm run dev` running
- Takes <30s for the smoke subset
- On failure: push is blocked, error output shown
- `PLAYWRIGHT_BASE_URL` defaults to `http://localhost:3000` when not set (configured in `playwright.config.ts`)

### Smoke Tests

The `@smoke` tag is applied to these critical path tests:
1. `login.spec.ts` — can log in with valid credentials
2. `map-view.spec.ts` — map loads and markers appear
3. `item-crud.spec.ts` — can create an item
4. `item-detail.spec.ts` — can open detail panel
5. `admin/entity-types.spec.ts` — admin page loads

## Playwright Configuration

All Playwright paths are relative to the `e2e/` directory.

```typescript
// e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  snapshotDir: './screenshots',
  outputDir: './test-results',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
    : [['line']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  globalSetup: './fixtures/global-setup.ts',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
});
```

Key settings:
- **`fullyParallel: true`** — tests run concurrently for speed
- **`retries: 2` in CI** — retry flaky tests before marking as failed
- **`trace: 'on-first-retry'`** — captures trace on first retry for debugging
- **`screenshot: 'only-on-failure'`** — auto-captures screenshot when a test fails
- **JSON reporter in CI** — machine-readable results for the PR comment script

## Files to Create/Modify

### New Files
- `e2e/playwright.config.ts`
- `e2e/fixtures/auth.ts`
- `e2e/fixtures/test-data.ts`
- `e2e/fixtures/seed.ts`
- `e2e/fixtures/global-setup.ts`
- `e2e/tests/auth/login.spec.ts`
- `e2e/tests/auth/signup.spec.ts`
- `e2e/tests/auth/invite.spec.ts`
- `e2e/tests/auth/session-expiry.spec.ts`
- `e2e/tests/map/map-view.spec.ts`
- `e2e/tests/map/item-detail.spec.ts`
- `e2e/tests/map/item-crud.spec.ts`
- `e2e/tests/admin/item-types.spec.ts`
- `e2e/tests/admin/entity-types.spec.ts`
- `e2e/tests/admin/settings.spec.ts`
- `e2e/tests/admin/members.spec.ts`
- `e2e/tests/admin/landing-editor.spec.ts`
- `e2e/tests/onboarding/org-wizard.spec.ts`
- `e2e/tests/visual/map-view.visual.ts`
- `e2e/tests/visual/admin-dashboard.visual.ts`
- `e2e/tests/visual/detail-panel.visual.ts`
- `e2e/tests/visual/landing-page.visual.ts`
- `.github/workflows/e2e.yml`
- `scripts/post-e2e-comment.sh` — PR comment formatting script

### Modified Files
- `package.json` — add `@playwright/test` to devDependencies, add `test:e2e` and `test:e2e:smoke` scripts
- `.github/workflows/ci.yml` — add `npm run test` step
- `.gitignore` — add `e2e/test-results/`, `e2e/.auth/`, `playwright-report/`
- `.claude/settings.json` — add PrePush hook for smoke tests

### Unchanged Files
- `.github/workflows/deploy.yml` — Vercel deploy workflow stays as-is
- `vercel.json` — no changes needed

## Verification

### Local
- `npm run test:e2e` runs full suite against localhost
- `npm run test:e2e:smoke` runs smoke subset
- `npx playwright test --ui` opens interactive test runner
- `npx playwright test e2e/tests/visual/ --update-snapshots` regenerates baselines

### CI
- Push to a branch → Vercel deploys preview → `e2e.yml` runs → PR comment posted
- Verify `deployment_status` event triggers correctly
- Verify preview URL extraction from event payload
- Verify artifact upload (report + screenshots)
- Verify PR comment creation and update-on-repush

### Regression
- Intentionally break a UI element → verify E2E catches it
- Change a CSS value → verify visual regression catches it
- Break auth flow → verify smoke test blocks local push
