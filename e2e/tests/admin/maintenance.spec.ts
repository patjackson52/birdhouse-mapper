import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const TEST_TITLE = `E2E Maintenance ${Date.now()}`;

test.describe.serial('Scheduled Maintenance admin', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('navigates to /admin/maintenance from the org sidebar', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: /^Maintenance$/ }).click();
    await page.waitForURL(/\/admin\/maintenance$/);
    await expect(page.getByRole('heading', { name: /Scheduled Maintenance/i })).toBeVisible({ timeout: 10000 });
    // "In progress" appears in both the stat card and any status pill — scope to first match.
    await expect(page.getByText('In progress').first()).toBeVisible();
    await expect(page.getByText('Due in 2 weeks')).toBeVisible();
  });

  test('create a project', async ({ page }) => {
    await page.goto('/p/default/admin/maintenance');
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: /\+ New project/i }).click();
    await page.waitForURL(/\/maintenance\/new$/);

    await page.getByLabel(/^Title$/).fill(TEST_TITLE);
    await page.getByLabel(/Scheduled date/).fill('2026-05-15');
    await page.getByRole('button', { name: /Create project/i }).click();

    // Land on detail page
    await expect(page.getByRole('heading', { name: TEST_TITLE })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Linked items \(0\)/)).toBeVisible();
  });

  test('add an item and mark it complete', async ({ page }) => {
    await page.goto('/p/default/admin/maintenance');
    await page.waitForLoadState('networkidle');
    await page.getByText(TEST_TITLE).click();

    await page.getByRole('button', { name: /\+ Add items/i }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    // Click the first item row (row is the <button>, the inner checkbox is aria-hidden)
    await page.locator('[role="dialog"] li button').first().click();
    await page.getByRole('button', { name: /^Add \d+ item/ }).click();

    await expect(page.getByText(/Linked items \(1\)/)).toBeVisible({ timeout: 10000 });
    // The checkbox is controlled by server state (completed_at); React re-renders
    // it to checked only after router.refresh() lands. Wait for that flip so the
    // next test sees "1/1 done" on the list.
    const checkbox = page.locator('[aria-label^="Mark "]').first();
    await checkbox.click();
    await expect(checkbox).toBeChecked({ timeout: 10000 });
  });

  test('project row appears on list with completion progress', async ({ page }) => {
    await page.goto('/p/default/admin/maintenance');
    await page.waitForLoadState('networkidle');

    // Change status on detail to in_progress so progress bar surfaces on list
    await page.getByText(TEST_TITLE).click();
    await page.getByLabel(/^Status$/).selectOption('in_progress');
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /← Back/ }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(TEST_TITLE)).toBeVisible();
    await expect(page.getByText('1/1 done')).toBeVisible();
  });

  test('public viewer renders anonymously', async ({ browser, baseURL }) => {
    // Sign in with admin to discover the project id we created above.
    const adminContext = await browser.newContext({ storageState: ADMIN_AUTH });
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/p/default/admin/maintenance');
    await adminPage.waitForLoadState('networkidle');
    await adminPage.getByText(TEST_TITLE).click();
    await adminPage.waitForURL(/\/maintenance\/([^/]+)$/);
    const url = adminPage.url();
    const match = url.match(/\/maintenance\/([^/]+)$/);
    const projectId = match?.[1];
    await adminContext.close();

    expect(projectId).toBeTruthy();

    // Anonymous context → hit the public viewer URL.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    const response = await anonPage.goto(`/p/default/maintenance/${projectId}`);
    expect(response?.status()).toBe(200);
    await expect(anonPage.getByRole('heading', { name: TEST_TITLE })).toBeVisible({ timeout: 10000 });
    await anonContext.close();
  });

  test('delete the project', async ({ page }) => {
    await page.goto('/p/default/admin/maintenance');
    await page.waitForLoadState('networkidle');
    await page.getByText(TEST_TITLE).click();

    await page.getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /^Delete$/ }).last().click();

    await page.waitForURL(/\/maintenance$/);
    await expect(page.getByText(TEST_TITLE)).not.toBeVisible();
  });
});
