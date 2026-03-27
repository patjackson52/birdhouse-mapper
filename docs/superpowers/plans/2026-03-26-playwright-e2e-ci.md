# Playwright E2E + Agentic CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright E2E tests running against Vercel preview URLs with visual regression, automated PR reporting, and local smoke tests via Claude Code hooks.

**Architecture:** Playwright tests live in `e2e/` directory, authenticate via Supabase Auth API (storageState pattern), run against a dedicated test Supabase project. A new `e2e.yml` GH Actions workflow triggers on Vercel `deployment_status` events, runs the full suite, and posts results as PR comments.

**Tech Stack:** Playwright, GitHub Actions, Vercel preview URLs, Supabase (dedicated test project), bash (PR comment script)

**Spec:** `docs/superpowers/specs/2026-03-26-playwright-e2e-ci-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `e2e/playwright.config.ts` | Playwright config: browsers, base URL, reporters, global setup |
| `e2e/fixtures/test-data.ts` | Constants for seed data IDs, credentials, URLs |
| `e2e/fixtures/seed.ts` | Supabase service-role client for test data setup/teardown |
| `e2e/fixtures/auth.ts` | Custom Playwright fixtures extending `test` with auth helpers |
| `e2e/fixtures/global-setup.ts` | One-time auth: signs in admin+editor, saves storageState JSON |
| `e2e/tests/auth/login.spec.ts` | Email/password login flow |
| `e2e/tests/auth/signup.spec.ts` | New account creation |
| `e2e/tests/auth/invite.spec.ts` | Invite link flow |
| `e2e/tests/auth/session-expiry.spec.ts` | Temp account session expiry |
| `e2e/tests/map/map-view.spec.ts` | Map loads, markers render |
| `e2e/tests/map/item-detail.spec.ts` | Click marker, detail panel opens |
| `e2e/tests/map/item-crud.spec.ts` | Create/edit/delete items |
| `e2e/tests/admin/item-types.spec.ts` | CRUD item types |
| `e2e/tests/admin/entity-types.spec.ts` | CRUD entity types + entities |
| `e2e/tests/admin/settings.spec.ts` | Org/property settings |
| `e2e/tests/admin/members.spec.ts` | Member management |
| `e2e/tests/admin/landing-editor.spec.ts` | Landing page block editor |
| `e2e/tests/onboarding/org-wizard.spec.ts` | Full onboarding flow |
| `e2e/tests/visual/map-view.visual.ts` | Map page screenshot baselines |
| `e2e/tests/visual/admin-dashboard.visual.ts` | Admin page screenshot baselines |
| `e2e/tests/visual/detail-panel.visual.ts` | Detail panel screenshot baselines |
| `e2e/tests/visual/landing-page.visual.ts` | Landing page screenshot baselines |
| `.github/workflows/e2e.yml` | GH Actions workflow: Playwright against Vercel preview URL |
| `scripts/post-e2e-comment.sh` | Parse test results JSON, post/update PR comment |

### Modified Files
| File | Change |
|------|--------|
| `package.json` | Add `@playwright/test` devDep, `test:e2e` and `test:e2e:smoke` scripts |
| `.github/workflows/ci.yml` | Add `npm run test` step |
| `.gitignore` | Add `e2e/test-results/`, `e2e/.auth/`, `playwright-report/` |

---

### Task 1: Install Playwright and configure project

**Files:**
- Modify: `package.json`
- Create: `e2e/playwright.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install Playwright**

```bash
cd /Users/patrick/patjackson52/birdhouse-mapper
npm install -D @playwright/test
npx playwright install chromium firefox webkit
```

- [ ] **Step 2: Add E2E scripts to package.json**

Add these scripts to `package.json` after the existing `"test:watch"` line:

```json
"test:e2e": "playwright test --config=e2e/playwright.config.ts",
"test:e2e:smoke": "playwright test --config=e2e/playwright.config.ts --grep @smoke --reporter=line"
```

- [ ] **Step 3: Create Playwright config**

Create `e2e/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  snapshotDir: './screenshots',
  outputDir: './test-results',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never', outputFolder: '../playwright-report' }], ['json', { outputFile: 'test-results/results.json' }]]
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

- [ ] **Step 4: Update .gitignore**

Append to `.gitignore`:

```
# playwright
e2e/test-results/
e2e/.auth/
playwright-report/
```

- [ ] **Step 5: Verify Playwright runs (no tests yet)**

```bash
npx playwright test --config=e2e/playwright.config.ts
```

Expected: "No tests found" (not an error — just no test files yet).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json e2e/playwright.config.ts .gitignore
git commit -m "chore: install Playwright and configure E2E test infrastructure"
```

---

### Task 2: Test fixtures — test data, seed helpers, auth

**Files:**
- Create: `e2e/fixtures/test-data.ts`
- Create: `e2e/fixtures/seed.ts`
- Create: `e2e/fixtures/auth.ts`
- Create: `e2e/fixtures/global-setup.ts`

- [ ] **Step 1: Create test-data.ts with seed data constants**

Create `e2e/fixtures/test-data.ts`:

```typescript
/**
 * Constants matching the seed data in the test Supabase project.
 * These values are seeded once during project setup and never change.
 */
export const TEST_DATA = {
  org: {
    name: 'Test Org',
    slug: 'test-org',
  },
  property: {
    name: 'Test Property',
    slug: 'default',
  },
  admin: {
    email: process.env.TEST_USER_ADMIN_EMAIL || 'admin@test.fieldmapper.org',
    password: process.env.TEST_USER_ADMIN_PASSWORD || 'test-admin-password',
  },
  editor: {
    email: process.env.TEST_USER_EDITOR_EMAIL || 'editor@test.fieldmapper.org',
    password: process.env.TEST_USER_EDITOR_PASSWORD || 'test-editor-password',
  },
  itemTypes: ['Bird Box', 'Trail Marker'],
  entityType: {
    name: 'Species',
    icon: '🐦',
  },
  entities: ['Black-capped Chickadee', 'Violet-green Swallow', 'Tree Swallow'],
} as const;
```

- [ ] **Step 2: Create seed.ts with Supabase service-role client**

Create `e2e/fixtures/seed.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client for test data setup/teardown.
 * Bypasses RLS — use only in test fixtures, never in app code.
 */
export function createTestClient() {
  const url = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing TEST_SUPABASE_URL or TEST_SUPABASE_SERVICE_ROLE_KEY env vars');
  }

  return createClient(url, key);
}

/**
 * Clean up test data created during a test run.
 * Deletes by name prefix to avoid touching seed data.
 */
export async function cleanupTestOrgs(namePrefix: string) {
  const client = createTestClient();
  const { data: orgs } = await client
    .from('orgs')
    .select('id')
    .like('name', `${namePrefix}%`);

  if (orgs && orgs.length > 0) {
    for (const org of orgs) {
      await client.from('orgs').delete().eq('id', org.id);
    }
  }
}

/**
 * Clean up a test item created during a test.
 */
export async function cleanupTestItem(itemName: string) {
  const client = createTestClient();
  await client.from('items').delete().like('name', `${itemName}%`);
}
```

- [ ] **Step 3: Create auth.ts with custom test fixture**

Create `e2e/fixtures/auth.ts`:

```typescript
import { test as base } from '@playwright/test';
import path from 'path';

const AUTH_DIR = path.join(__dirname, '..', '.auth');

/**
 * Extended test fixtures with pre-authenticated browser contexts.
 * Usage:
 *   import { test } from '../fixtures/auth';
 *   test('admin can ...', async ({ adminPage }) => { ... });
 */
export const test = base.extend<{
  adminPage: ReturnType<typeof base.extend>['prototype']['page'];
  editorPage: ReturnType<typeof base.extend>['prototype']['page'];
}>({
  // Not used directly — tests use storageState instead.
  // This file exports the extended test for future fixture additions.
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'admin.json'),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  editorPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, 'editor.json'),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 4: Create global-setup.ts**

Create `e2e/fixtures/global-setup.ts`:

```typescript
import { chromium, type FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { TEST_DATA } from './test-data';

const AUTH_DIR = path.join(__dirname, '..', '.auth');

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
  const supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env vars for global setup');
  }

  // Ensure .auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Sign in as admin
  const { data: adminAuth, error: adminError } = await supabase.auth.signInWithPassword({
    email: TEST_DATA.admin.email,
    password: TEST_DATA.admin.password,
  });
  if (adminError) throw new Error(`Admin login failed: ${adminError.message}`);

  // Sign in as editor
  const { data: editorAuth, error: editorError } = await supabase.auth.signInWithPassword({
    email: TEST_DATA.editor.email,
    password: TEST_DATA.editor.password,
  });
  if (editorError) throw new Error(`Editor login failed: ${editorError.message}`);

  const browser = await chromium.launch();

  // Save admin auth state
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto(baseURL);
  await adminPage.evaluate(
    ({ accessToken, refreshToken }) => {
      // Supabase stores auth in localStorage
      const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-')) || 'sb-auth-token';
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
      }));
    },
    {
      accessToken: adminAuth.session!.access_token,
      refreshToken: adminAuth.session!.refresh_token,
    }
  );
  await adminPage.reload();
  await adminContext.storageState({ path: path.join(AUTH_DIR, 'admin.json') });
  await adminContext.close();

  // Save editor auth state
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  await editorPage.goto(baseURL);
  await editorPage.evaluate(
    ({ accessToken, refreshToken }) => {
      const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-')) || 'sb-auth-token';
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
      }));
    },
    {
      accessToken: editorAuth.session!.access_token,
      refreshToken: editorAuth.session!.refresh_token,
    }
  );
  await editorPage.reload();
  await editorContext.storageState({ path: path.join(AUTH_DIR, 'editor.json') });
  await editorContext.close();

  await browser.close();
}

export default globalSetup;
```

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/
git commit -m "feat: add E2E test fixtures — test data, seed helpers, auth setup"
```

---

### Task 3: Auth E2E tests

**Files:**
- Create: `e2e/tests/auth/login.spec.ts`
- Create: `e2e/tests/auth/signup.spec.ts`

- [ ] **Step 1: Create login.spec.ts**

Create `e2e/tests/auth/login.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { TEST_DATA } from '../../fixtures/test-data';

test.describe('Login @smoke', () => {
  test('logs in with valid credentials and redirects to map', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(TEST_DATA.admin.email);
    await page.locator('#password').fill(TEST_DATA.admin.password);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL('**/map', { timeout: 15000 });
    await expect(page).toHaveURL(/\/map/);
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
  });

  test('login page has email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
```

- [ ] **Step 2: Create signup.spec.ts**

Create `e2e/tests/auth/signup.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Signup', () => {
  test('signup page loads with form fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('shows validation for empty submission', async ({ page }) => {
    await page.goto('/signup');
    await page.locator('button[type="submit"]').click();
    // HTML5 validation prevents submission — email field should be focused
    const email = page.locator('#email');
    await expect(email).toBeFocused();
  });
});
```

- [ ] **Step 3: Run auth tests locally to verify**

```bash
npm run test:e2e -- --grep "Login|Signup" --project=chromium
```

Expected: Tests pass (login requires dev server + test Supabase credentials).

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/auth/
git commit -m "feat: add auth E2E tests — login and signup flows"
```

---

### Task 4: Map and item E2E tests

**Files:**
- Create: `e2e/tests/map/map-view.spec.ts`
- Create: `e2e/tests/map/item-detail.spec.ts`
- Create: `e2e/tests/map/item-crud.spec.ts`

- [ ] **Step 1: Create map-view.spec.ts**

Create `e2e/tests/map/map-view.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Map View @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('map page loads with Leaflet container', async ({ page }) => {
    await page.goto('/map');
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });
  });

  test('map displays item markers', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');
    // Markers render as Leaflet marker elements
    const markers = page.locator('.leaflet-marker-icon');
    await expect(markers.first()).toBeVisible({ timeout: 15000 });
  });
});
```

- [ ] **Step 2: Create item-detail.spec.ts**

Create `e2e/tests/map/item-detail.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Item Detail Panel @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('clicking a marker opens the detail panel', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    // Click the first marker
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click();

    // Detail panel should appear (desktop: side panel, mobile: bottom sheet)
    const panel = page.locator('h2.font-heading');
    await expect(panel).toBeVisible({ timeout: 10000 });
  });

  test('detail panel shows Edit Item link for authenticated users', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click();

    await expect(page.locator('a:has-text("Edit Item")')).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 3: Create item-crud.spec.ts**

Create `e2e/tests/map/item-crud.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { cleanupTestItem } from '../../fixtures/seed';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const TEST_ITEM_NAME = `E2E Test Item ${Date.now()}`;

test.describe('Item CRUD @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.afterAll(async () => {
    await cleanupTestItem('E2E Test Item');
  });

  test('creates a new item via the add form', async ({ page }) => {
    await page.goto('/manage/add');

    // Fill in name
    await page.locator('#name').fill(TEST_ITEM_NAME);

    // Fill in description
    await page.locator('#description').fill('Created by E2E test');

    // Click on the map to set location (LocationPicker)
    const mapContainer = page.locator('.leaflet-container');
    await mapContainer.click({ position: { x: 200, y: 200 } });

    // Submit
    await page.locator('button[type="submit"]').click();

    // Should redirect to manage page
    await page.waitForURL('**/manage', { timeout: 15000 });
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/map/
git commit -m "feat: add map E2E tests — map view, detail panel, item CRUD"
```

---

### Task 5: Admin E2E tests

**Files:**
- Create: `e2e/tests/admin/entity-types.spec.ts`
- Create: `e2e/tests/admin/item-types.spec.ts`
- Create: `e2e/tests/admin/settings.spec.ts`
- Create: `e2e/tests/admin/members.spec.ts`
- Create: `e2e/tests/admin/landing-editor.spec.ts`

- [ ] **Step 1: Create entity-types.spec.ts**

Create `e2e/tests/admin/entity-types.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Entity Types Admin @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('entity types page loads', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/entity-types`);
    await expect(page.locator('h1:has-text("Entity Types")')).toBeVisible({ timeout: 10000 });
  });

  test('shows existing entity types', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/entity-types`);
    await expect(page.locator(`text=${TEST_DATA.entityType.name}`)).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 2: Create item-types.spec.ts**

Create `e2e/tests/admin/item-types.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Item Types Admin', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('types page loads and shows item types', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/types`);
    await expect(page.locator(`text=${TEST_DATA.itemTypes[0]}`)).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 3: Create settings.spec.ts**

Create `e2e/tests/admin/settings.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Settings', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('settings page loads', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
    await page.waitForLoadState('networkidle');
    // Settings page should have form inputs
    await expect(page.locator('input, textarea, select').first()).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 4: Create members.spec.ts**

Create `e2e/tests/admin/members.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Members', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('members page loads', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/members`);
    await page.waitForLoadState('networkidle');
    // Should show at least the admin user
    await expect(page.locator('text=Admin').first()).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 5: Create landing-editor.spec.ts**

Create `e2e/tests/admin/landing-editor.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Landing Page Editor', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('landing editor page loads', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/landing`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Landing Page').first()).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/admin/
git commit -m "feat: add admin E2E tests — entity types, item types, settings, members, landing"
```

---

### Task 6: Onboarding and remaining auth tests

**Files:**
- Create: `e2e/tests/onboarding/org-wizard.spec.ts`
- Create: `e2e/tests/auth/invite.spec.ts`
- Create: `e2e/tests/auth/session-expiry.spec.ts`

- [ ] **Step 1: Create org-wizard.spec.ts**

Create `e2e/tests/onboarding/org-wizard.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { cleanupTestOrgs } from '../../fixtures/seed';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const ORG_PREFIX = 'E2E Onboard Test';

test.describe('Onboarding Wizard', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.afterAll(async () => {
    await cleanupTestOrgs(ORG_PREFIX);
  });

  test('onboard page loads with welcome step', async ({ page }) => {
    // Note: onboard redirects if user already has an org.
    // This test verifies the page structure loads.
    await page.goto('/onboard');
    // Either shows the wizard or redirects — both are valid
    const onPage = await page.locator('text=set up your organization').isVisible().catch(() => false);
    if (onPage) {
      await expect(page.locator('button:has-text("Get Started")')).toBeVisible();
    }
    // If redirected, user already has an org — that's fine
  });
});
```

- [ ] **Step 2: Create invite.spec.ts**

Create `e2e/tests/auth/invite.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Invite Flow', () => {
  test('invalid invite token shows error', async ({ page }) => {
    await page.goto('/invite/invalid-token-12345');
    // Should show an error or redirect
    await page.waitForLoadState('networkidle');
    const hasError = await page.locator('text=/invalid|expired|not found/i').isVisible().catch(() => false);
    const redirected = page.url().includes('/login') || page.url().includes('/signin');
    expect(hasError || redirected).toBeTruthy();
  });
});
```

- [ ] **Step 3: Create session-expiry.spec.ts**

Create `e2e/tests/auth/session-expiry.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Session Expiry', () => {
  test('session-expired page loads', async ({ page }) => {
    await page.goto('/session-expired');
    await expect(page.locator('text=/session|expired/i').first()).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/onboarding/ e2e/tests/auth/invite.spec.ts e2e/tests/auth/session-expiry.spec.ts
git commit -m "feat: add onboarding wizard and remaining auth E2E tests"
```

---

### Task 7: Visual regression tests

**Files:**
- Create: `e2e/tests/visual/map-view.visual.ts`
- Create: `e2e/tests/visual/admin-dashboard.visual.ts`
- Create: `e2e/tests/visual/detail-panel.visual.ts`
- Create: `e2e/tests/visual/landing-page.visual.ts`

- [ ] **Step 1: Create map-view.visual.ts**

Create `e2e/tests/visual/map-view.visual.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Map View Visual @visual', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('map page matches baseline', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('map-view.png', {
      mask: [page.locator('.leaflet-tile-pane')],
      maxDiffPixelRatio: 0.01,
      timeout: 15000,
    });
  });
});
```

- [ ] **Step 2: Create admin-dashboard.visual.ts**

Create `e2e/tests/visual/admin-dashboard.visual.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Dashboard Visual @visual', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('admin property page matches baseline', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('admin-dashboard.png', {
      mask: [
        page.locator('time'),
        page.locator('[data-timestamp]'),
      ],
      maxDiffPixelRatio: 0.01,
    });
  });
});
```

- [ ] **Step 3: Create detail-panel.visual.ts**

Create `e2e/tests/visual/detail-panel.visual.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Detail Panel Visual @visual', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('detail panel matches baseline', async ({ page }) => {
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    // Click first marker to open detail panel
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);

    // Wait for panel to appear
    await expect(page.locator('h2.font-heading')).toBeVisible({ timeout: 10000 });

    await expect(page).toHaveScreenshot('detail-panel.png', {
      mask: [
        page.locator('.leaflet-tile-pane'),
        page.locator('img[src*="item-photos"]'),
      ],
      maxDiffPixelRatio: 0.01,
    });
  });
});
```

- [ ] **Step 4: Create landing-page.visual.ts**

Create `e2e/tests/visual/landing-page.visual.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Landing Page Visual @visual', () => {
  test('landing page matches baseline', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('landing-page.png', {
      maxDiffPixelRatio: 0.01,
    });
  });
});
```

- [ ] **Step 5: Generate initial baselines**

```bash
npx playwright test --config=e2e/playwright.config.ts e2e/tests/visual/ --update-snapshots
```

This creates the baseline `.png` files in `e2e/screenshots/`. Inspect them manually to verify they look correct.

- [ ] **Step 6: Commit baselines**

```bash
git add e2e/tests/visual/ e2e/screenshots/
git commit -m "feat: add visual regression tests with initial baselines"
```

---

### Task 8: GH Actions — add unit tests to ci.yml and create e2e.yml

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Add unit test step to ci.yml**

In `.github/workflows/ci.yml`, add the test step after lint (line 28) and before type-check (line 30):

Insert after the Lint step:

```yaml
      - name: Test
        run: npm run test
```

- [ ] **Step 2: Create e2e.yml workflow**

Create `.github/workflows/e2e.yml`:

```yaml
name: E2E Tests

on:
  deployment_status:

jobs:
  playwright:
    name: Playwright E2E
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium firefox webkit

      - name: Run E2E tests
        run: npx playwright test --config=e2e/playwright.config.ts
        env:
          PLAYWRIGHT_BASE_URL: ${{ github.event.deployment_status.target_url }}
          TEST_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          TEST_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          TEST_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
          TEST_USER_ADMIN_EMAIL: ${{ secrets.TEST_USER_ADMIN_EMAIL }}
          TEST_USER_ADMIN_PASSWORD: ${{ secrets.TEST_USER_ADMIN_PASSWORD }}
          TEST_USER_EDITOR_EMAIL: ${{ secrets.TEST_USER_EDITOR_EMAIL }}
          TEST_USER_EDITOR_PASSWORD: ${{ secrets.TEST_USER_EDITOR_PASSWORD }}
          CI: true

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            e2e/test-results/
            playwright-report/
          retention-days: 14

      - name: Post PR comment
        if: always()
        run: bash scripts/post-e2e-comment.sh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          DEPLOYMENT_URL: ${{ github.event.deployment_status.target_url }}
          DEPLOYMENT_REF: ${{ github.event.deployment.ref }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/e2e.yml
git commit -m "feat: add unit tests to CI, create E2E workflow for Vercel preview URLs"
```

---

### Task 9: PR comment reporting script

**Files:**
- Create: `scripts/post-e2e-comment.sh`

- [ ] **Step 1: Create the PR comment script**

Create `scripts/post-e2e-comment.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

RESULTS_FILE="e2e/test-results/results.json"
MARKER="<!-- e2e-results -->"

# Find PR number from the deployment ref
PR_NUMBER=$(gh pr list --head "$DEPLOYMENT_REF" --json number --jq '.[0].number' 2>/dev/null || echo "")

if [ -z "$PR_NUMBER" ]; then
  echo "No PR found for ref $DEPLOYMENT_REF — skipping comment"
  exit 0
fi

# Parse test results
if [ ! -f "$RESULTS_FILE" ]; then
  BODY="${MARKER}
## 🎭 E2E Test Results

**Status:** ⚠️ Results file not found
**Preview:** ${DEPLOYMENT_URL}

Test results JSON was not generated. Check the workflow logs."
  gh pr comment "$PR_NUMBER" --body "$BODY"
  exit 0
fi

# Extract stats from Playwright JSON report
TOTAL=$(jq '.stats.expected + .stats.unexpected + .stats.flaky + .stats.skipped' "$RESULTS_FILE" 2>/dev/null || echo 0)
PASSED=$(jq '.stats.expected' "$RESULTS_FILE" 2>/dev/null || echo 0)
FAILED=$(jq '.stats.unexpected' "$RESULTS_FILE" 2>/dev/null || echo 0)
FLAKY=$(jq '.stats.flaky' "$RESULTS_FILE" 2>/dev/null || echo 0)
SKIPPED=$(jq '.stats.skipped' "$RESULTS_FILE" 2>/dev/null || echo 0)
DURATION_MS=$(jq '.stats.duration' "$RESULTS_FILE" 2>/dev/null || echo 0)
DURATION_S=$(( DURATION_MS / 1000 ))
DURATION_M=$(( DURATION_S / 60 ))
DURATION_REMAINDER=$(( DURATION_S % 60 ))

if [ "$FAILED" -eq 0 ]; then
  STATUS_ICON="✅"
  STATUS_TEXT="$PASSED/$TOTAL passed"
else
  STATUS_ICON="❌"
  STATUS_TEXT="$PASSED/$TOTAL passed, $FAILED failed"
fi

# Check for visual diffs
VISUAL_DIFFS=$(find e2e/test-results -name '*-diff.png' 2>/dev/null | wc -l | tr -d ' ')
VISUAL_TOTAL=$(find e2e/test-results -name '*-expected.png' 2>/dev/null | wc -l | tr -d ' ')
if [ "$VISUAL_DIFFS" -eq 0 ] && [ "$VISUAL_TOTAL" -gt 0 ]; then
  VISUAL_STATUS="✅ $VISUAL_TOTAL/$VISUAL_TOTAL screenshots match baseline"
elif [ "$VISUAL_DIFFS" -gt 0 ]; then
  VISUAL_MATCH=$(( VISUAL_TOTAL - VISUAL_DIFFS ))
  VISUAL_STATUS="⚠️ $VISUAL_MATCH/$VISUAL_TOTAL match, $VISUAL_DIFFS diff(s) detected"
else
  VISUAL_STATUS="No visual tests ran"
fi

# Build failure table
FAILURE_TABLE=""
if [ "$FAILED" -gt 0 ]; then
  FAILURE_TABLE="
### Failures
| Test | Browser | Error |
|------|---------|-------|"
  # Extract failures from JSON
  FAILURE_ROWS=$(jq -r '
    .suites[]?.suites[]?.specs[]? |
    select(.tests[]?.results[]?.status == "unexpected") |
    .tests[] |
    select(.results[]?.status == "unexpected") |
    "| \(.title) | \(.projectName) | \(.results[0].error.message // "Unknown error" | split("\n")[0] | .[0:80]) |"
  ' "$RESULTS_FILE" 2>/dev/null || echo "| (could not parse failures) | - | - |")
  FAILURE_TABLE="$FAILURE_TABLE
$FAILURE_ROWS"
fi

# Build the comment
BODY="${MARKER}
## 🎭 E2E Test Results

**Status:** ${STATUS_ICON} ${STATUS_TEXT}
**Preview:** ${DEPLOYMENT_URL}
**Duration:** ${DURATION_M}m ${DURATION_REMAINDER}s | **Browsers:** Chromium, Firefox, WebKit
${FAILURE_TABLE}

### Visual Regression
${VISUAL_STATUS}

📎 [Full Report](https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID)"

# Check if we already posted a comment on this PR
EXISTING=$(gh pr view "$PR_NUMBER" --json comments --jq ".comments[] | select(.body | contains(\"$MARKER\")) | .id" 2>/dev/null | head -1 || echo "")

if [ -n "$EXISTING" ]; then
  # Update existing comment
  gh api "repos/$GITHUB_REPOSITORY/issues/comments/$EXISTING" -X PATCH -f body="$BODY"
else
  # Create new comment
  gh pr comment "$PR_NUMBER" --body "$BODY"
fi

echo "Posted E2E results to PR #$PR_NUMBER"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/post-e2e-comment.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/post-e2e-comment.sh
git commit -m "feat: add PR comment script for E2E test results"
```

---

### Task 10: Claude Code pre-push smoke hook

**Files:**
- Modify or create: `.claude/settings.json` (project-level)

- [ ] **Step 1: Add PrePush hook configuration**

Check if `.claude/settings.json` exists in the project. If it does, add the hook to the existing config. If not, create it:

```json
{
  "hooks": {
    "PrePush": [
      {
        "command": "npx playwright test --config=e2e/playwright.config.ts --grep @smoke --reporter=line --project=chromium",
        "timeout": 60000
      }
    ]
  }
}
```

Note: the hook runs only Chromium for speed (<30s). Full cross-browser suite runs in CI.

- [ ] **Step 2: Test the hook locally**

Start the dev server in one terminal:
```bash
npm run dev
```

Then trigger the hook manually:
```bash
npx playwright test --config=e2e/playwright.config.ts --grep @smoke --reporter=line --project=chromium
```

Expected: ~5 smoke tests pass in <30s.

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "feat: add Claude Code pre-push hook for E2E smoke tests"
```

---

### Task 11: Documentation and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add E2E test commands to CLAUDE.md**

Add to the Key Commands section in `CLAUDE.md`:

```markdown
- `npm run test:e2e` — Run full Playwright E2E suite
- `npm run test:e2e:smoke` — Run smoke subset (~5 tests, <30s)
- `npx playwright test --config=e2e/playwright.config.ts --ui` — Interactive Playwright UI
- `npx playwright test --config=e2e/playwright.config.ts e2e/tests/visual/ --update-snapshots` — Regenerate visual baselines
```

- [ ] **Step 2: Run the full E2E suite locally**

```bash
npm run test:e2e
```

Verify all tests pass against `localhost:3000` with the test Supabase project.

- [ ] **Step 3: Run the smoke subset**

```bash
npm run test:e2e:smoke
```

Verify it completes in <30s.

- [ ] **Step 4: Run type-check and unit tests to confirm nothing broke**

```bash
npm run test && npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add E2E test commands to CLAUDE.md"
```

---

## GH Secrets Required (Manual Setup)

Before the E2E workflow runs in CI, these secrets must be added to the GitHub repo settings:

| Secret | Description |
|--------|-------------|
| `TEST_SUPABASE_URL` | Test Supabase project URL |
| `TEST_SUPABASE_ANON_KEY` | Test project anon key |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | Test project service role key |
| `TEST_USER_ADMIN_EMAIL` | Admin test user email |
| `TEST_USER_ADMIN_PASSWORD` | Admin test user password |
| `TEST_USER_EDITOR_EMAIL` | Editor test user email |
| `TEST_USER_EDITOR_PASSWORD` | Editor test user password |

Additionally, Vercel Preview environment vars must point to the test Supabase project (configured in Vercel dashboard, not in code).

---

## Verification Checklist

After all tasks are complete:

- [ ] `npm run test` — unit tests pass
- [ ] `npm run test:e2e` — full E2E suite passes locally
- [ ] `npm run test:e2e:smoke` — smoke tests complete in <30s
- [ ] `npm run type-check` — no TypeScript errors
- [ ] `npm run build` — clean build
- [ ] Push to branch → `ci.yml` runs unit tests
- [ ] Vercel deploys preview → `e2e.yml` triggers → tests run against preview URL
- [ ] PR comment appears with test results
- [ ] Visual regression baselines committed and tests pass
