import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const TEST_TITLE = `E2E Maintenance ${Date.now()}`;

test.describe.serial('Scheduled Maintenance admin @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('create a project', async ({ page }) => {
    await page.goto('/admin/properties/default/maintenance');
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
    await page.goto('/admin/properties/default/maintenance');
    await page.waitForLoadState('networkidle');
    await page.getByText(TEST_TITLE).click();

    await page.getByRole('button', { name: /\+ Add items/i }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.locator('[role="dialog"] input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /^Add$/ }).click();

    await expect(page.getByText(/Linked items \(1\)/)).toBeVisible({ timeout: 10000 });
    await page.locator('[aria-label^="Mark "]').first().check();
  });

  test('project row appears on list with completion progress', async ({ page }) => {
    await page.goto('/admin/properties/default/maintenance');
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

  test('delete the project', async ({ page }) => {
    await page.goto('/admin/properties/default/maintenance');
    await page.waitForLoadState('networkidle');
    await page.getByText(TEST_TITLE).click();

    await page.getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /^Delete$/ }).last().click();

    await page.waitForURL(/\/maintenance$/);
    await expect(page.getByText(TEST_TITLE)).not.toBeVisible();
  });
});
