import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Property Admin Mobile', () => {
  test.use({
    storageState: ADMIN_AUTH,
    viewport: { width: 375, height: 667 },
  });

  test('hamburger button is visible at mobile width', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
    await page.waitForLoadState('networkidle');

    const hamburger = page.getByRole('button', { name: 'Open menu' });
    await expect(hamburger).toBeVisible({ timeout: 10000 });
  });

  test('clicking hamburger opens the drawer', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
    await page.waitForLoadState('networkidle');

    const hamburger = page.getByRole('button', { name: 'Open menu' });
    await expect(hamburger).toBeVisible({ timeout: 10000 });
    await hamburger.click();

    // Drawer nav should be visible — look for a nav link that's only in the drawer
    const settingsLink = page.getByRole('link', { name: 'Settings' }).first();
    await expect(settingsLink).toBeVisible({ timeout: 5000 });
  });

  test('clicking backdrop closes the drawer', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
    await page.waitForLoadState('networkidle');

    const hamburger = page.getByRole('button', { name: 'Open menu' });
    await expect(hamburger).toBeVisible({ timeout: 10000 });
    await hamburger.click();

    // Wait for drawer to open
    await expect(page.locator('.fixed.inset-0')).toBeVisible({ timeout: 5000 });

    // Click the semi-transparent backdrop (the div with aria-hidden inside the overlay)
    await page.locator('div[aria-hidden="true"]').click({ force: true });

    // Drawer should be dismissed
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 5000 });
  });
});
