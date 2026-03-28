import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { cleanupTestOrgs } from '../../fixtures/seed';

const ORG_PREFIX = 'E2E Onboard';
const ONBOARD_AUTH = path.join(__dirname, '..', '..', '.auth', 'onboard-user.json');
const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'screenshots', 'onboarding');


function screenshotPath(name: string) {
  return path.join(SCREENSHOT_DIR, `${name}.png`);
}

// Helper: navigate to a specific wizard step by clicking through from welcome
async function navigateToStep(page: import('@playwright/test').Page, targetStep: number) {
  await page.goto('/onboard');
  await page.waitForSelector('text=set up your organization', { timeout: 20000 });

  if (targetStep === 0) return; // welcome step

  // Click "Get Started" to go to step 1 (name)
  await page.locator('button:has-text("Get Started")').click();
  await expect(page.locator('text=Name & Location')).toBeVisible();

  if (targetStep === 1) return;

  // Fill required fields on name step
  await page.locator('#onboard-name').fill('Temp Org');
  await page.locator('button:has-text("Next")').click();

  for (let i = 2; i < targetStep; i++) {
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);
  }
}

test.describe('Onboarding Wizard', () => {
  // onboard-user.json is created by global-setup using the seeded onboard test user.
  // We just ensure the screenshot directory exists here.
  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    await cleanupTestOrgs(ORG_PREFIX);
  });

  test.use({ storageState: ONBOARD_AUTH });

  // ─── Step Walkthrough with Screenshots ──────────────────────────────

  test('walks through all 8 steps capturing screenshots', async ({ page }) => {
    await page.goto('/onboard');
    await page.waitForSelector('text=set up your organization', { timeout: 20000 });

    // Step 1: Welcome
    await expect(page.locator('button:has-text("Get Started")')).toBeVisible();
    await page.screenshot({ path: screenshotPath('step-1-welcome'), fullPage: true });

    // Click Get Started → Step 2: Name & Location
    await page.locator('button:has-text("Get Started")').click();
    await expect(page.locator('text=Name & Location')).toBeVisible();
    await expect(page.locator('text=Step 1 of 7')).toBeVisible();

    await page.locator('#onboard-name').fill(`${ORG_PREFIX} Screenshot`);
    // Verify auto-slug generation
    const slugValue = await page.locator('#onboard-slug').inputValue();
    expect(slugValue).toBe('e2e-onboard-screenshot');

    await page.locator('#onboard-tagline').fill('E2E test tagline');
    await page.locator('#onboard-location').fill('Test Location, AK');
    await page.screenshot({ path: screenshotPath('step-2-name-location'), fullPage: true });

    // Click Next → Step 3: Theme
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('text=Choose a Theme')).toBeVisible();
    await expect(page.locator('text=Step 2 of 7')).toBeVisible();

    // Select "Ocean" theme (click the button containing "Ocean" text)
    const oceanButton = page.locator('button:has-text("Ocean")');
    if (await oceanButton.isVisible()) {
      await oceanButton.click();
    }
    await page.screenshot({ path: screenshotPath('step-3-theme'), fullPage: true });

    // Click Next → Step 4: Custom Map Overlay
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('text=Custom Map Overlay')).toBeVisible();
    await expect(page.locator('text=coming soon')).toBeVisible();
    await page.screenshot({ path: screenshotPath('step-4-custom-map'), fullPage: true });

    // Click Next → Step 5: Item Types
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('text=Item Types')).toBeVisible();
    // Verify default Bird Box entry exists
    const itemNameInput = page.locator('input[placeholder="Type name (e.g., Bird Box)"]');
    await expect(itemNameInput).toHaveValue('Bird Box');
    await page.screenshot({ path: screenshotPath('step-5-item-types'), fullPage: true });

    // Click Next → Step 6: Entity Types
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('text=Entity Types')).toBeVisible();
    await expect(page.locator('#entity-prompt')).toBeVisible();
    await expect(page.locator('button:has-text("Skip")')).toBeVisible();
    await page.screenshot({ path: screenshotPath('step-6-entity-types'), fullPage: true });

    // Click Skip → Step 7: About Page
    await page.locator('button:has-text("Skip")').click();
    await expect(page.locator('text=About Page')).toBeVisible();
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    // Edit the about content
    await textarea.clear();
    await textarea.fill('# Test About\n\nThis is an E2E test organization.');
    await page.screenshot({ path: screenshotPath('step-7-about'), fullPage: true });

    // Click Next → Step 8: Review & Launch
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('text=Review & Launch')).toBeVisible();

    // Verify summary shows our entered data
    await expect(page.locator(`text=${ORG_PREFIX} Screenshot`)).toBeVisible();
    await expect(page.locator('text=e2e-onboard-screenshot.fieldmapper.org')).toBeVisible();
    await expect(page.locator('text=E2E test tagline')).toBeVisible();
    await expect(page.locator('text=Test Location, AK')).toBeVisible();
    await expect(page.locator('button:has-text("Launch")')).toBeVisible();
    await page.screenshot({ path: screenshotPath('step-8-review'), fullPage: true });
  });

  // ─── Back Navigation ────────────────────────────────────────────────

  test('back button preserves form data', async ({ page }) => {
    await page.goto('/onboard');
    await page.waitForSelector('text=set up your organization', { timeout: 20000 });

    // Go to name step
    await page.locator('button:has-text("Get Started")').click();
    await expect(page.locator('text=Name & Location')).toBeVisible();

    // Fill in data
    await page.locator('#onboard-name').fill('Back Test Org');
    await page.locator('#onboard-tagline').fill('Testing back navigation');

    // Go forward to theme
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('text=Choose a Theme')).toBeVisible();

    // Go back to name
    await page.locator('button:has-text("Back")').click();
    await expect(page.locator('text=Name & Location')).toBeVisible();

    // Verify data is preserved
    await expect(page.locator('#onboard-name')).toHaveValue('Back Test Org');
    await expect(page.locator('#onboard-tagline')).toHaveValue('Testing back navigation');
  });

  // ─── Form Validation ───────────────────────────────────────────────

  test('blocks Next when org name is empty', async ({ page }) => {
    await page.goto('/onboard');
    await page.waitForSelector('text=set up your organization', { timeout: 20000 });
    await page.locator('button:has-text("Get Started")').click();
    await expect(page.locator('text=Name & Location')).toBeVisible();

    // Leave name empty, click Next
    await page.locator('button:has-text("Next")').click();

    // Should show error
    await expect(page.locator('text=Organization name is required.')).toBeVisible();
  });

  test('blocks Next when slug is empty', async ({ page }) => {
    await page.goto('/onboard');
    await page.waitForSelector('text=set up your organization', { timeout: 20000 });
    await page.locator('button:has-text("Get Started")').click();

    // Fill name (auto-generates slug)
    await page.locator('#onboard-name').fill('Test Org');

    // Clear slug manually
    await page.locator('#onboard-slug').clear();

    // Click Next
    await page.locator('button:has-text("Next")').click();

    // Should show error
    await expect(page.locator('text=URL slug is required.')).toBeVisible();
  });

  test('blocks Next when item type name is empty', async ({ page }) => {
    // Navigate to item types step (step 5)
    await navigateToStep(page, 4);
    await expect(page.locator('text=Item Types')).toBeVisible();

    // Clear the default item type name
    const itemNameInput = page.locator('input[placeholder="Type name (e.g., Bird Box)"]');
    await itemNameInput.clear();

    // Click Next
    await page.locator('button:has-text("Next")').click();

    // Should show error
    await expect(page.locator('text=At least one item type is required.')).toBeVisible();
  });

  // ─── Happy Path: Full Wizard Completion ─────────────────────────────

  test('completes full wizard and creates org', async ({ page }) => {
    const orgName = `${ORG_PREFIX} ${Date.now()}`;
    const expectedSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    await page.goto('/onboard');
    await page.waitForSelector('text=set up your organization', { timeout: 20000 });

    // Step 1: Welcome
    await page.locator('button:has-text("Get Started")').click();

    // Step 2: Name & Location
    await page.locator('#onboard-name').fill(orgName);
    await page.locator('#onboard-tagline').fill('Full wizard E2E test');
    await page.locator('#onboard-location').fill('Fairbanks, AK');
    await page.locator('button:has-text("Next")').click();

    // Step 3: Theme — keep default (forest)
    await expect(page.locator('text=Choose a Theme')).toBeVisible();
    await page.locator('button:has-text("Next")').click();

    // Step 4: Custom Map — skip
    await expect(page.locator('text=Custom Map Overlay')).toBeVisible();
    await page.locator('button:has-text("Next")').click();

    // Step 5: Item Types — keep default Bird Box
    await expect(page.locator('text=Item Types')).toBeVisible();
    await page.locator('button:has-text("Next")').click();

    // Step 6: Entity Types — skip
    await expect(page.locator('text=Entity Types')).toBeVisible();
    await page.locator('button:has-text("Skip")').click();

    // Step 7: About — keep default
    await expect(page.locator('text=About Page')).toBeVisible();
    await page.locator('button:has-text("Next")').click();

    // Step 8: Review — verify and launch
    await expect(page.locator('text=Review & Launch')).toBeVisible();
    await expect(page.locator(`text=${orgName}`)).toBeVisible();

    // Click Launch and wait for the saving state
    await page.locator('button:has-text("Launch")').click();
    await expect(page.locator('button:has-text("Setting up...")')).toBeVisible({ timeout: 5000 });

    // Wait for the server action to complete (button will either stay disabled
    // or the page will navigate — give it time)
    await page.waitForTimeout(5000);

    // Verify org was created in the database
    const client = createTestClient();
    const { data: org } = await client
      .from('orgs')
      .select('id, name, slug')
      .eq('slug', expectedSlug)
      .maybeSingle();

    expect(org).not.toBeNull();
    expect(org!.name).toBe(orgName);
    expect(org!.slug).toBe(expectedSlug);

    // Verify item types were created
    const { data: itemTypes } = await client
      .from('item_types')
      .select('name')
      .eq('org_id', org!.id);

    expect(itemTypes).not.toBeNull();
    expect(itemTypes!.length).toBeGreaterThanOrEqual(1);
    expect(itemTypes!.some(t => t.name === 'Bird Box')).toBe(true);
  });
});
