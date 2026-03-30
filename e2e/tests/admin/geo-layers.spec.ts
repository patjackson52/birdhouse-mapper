import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Geo Layers', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('sidebar shows Geo Layers under Data section', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Section header exists
    const sidebar = page.locator('nav');
    await expect(sidebar.getByText('Data')).toBeVisible({ timeout: 10000 });

    // Geo Layers link exists and navigates
    const geoLink = sidebar.getByText('Geo Layers');
    await expect(geoLink).toBeVisible();
    await geoLink.click();
    await expect(page).toHaveURL(/\/admin\/geo-layers/);
  });

  test('geo layers page loads with import buttons', async ({ page }) => {
    await page.goto('/admin/geo-layers');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Geo Layers')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Quick Import' })).toBeVisible();
    await expect(page.getByRole('button', { name: /AI-Assisted Import/ })).toBeVisible();
  });

  test('AI-assisted import shows placeholder', async ({ page }) => {
    await page.goto('/admin/geo-layers');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /AI-Assisted Import/ }).click();
    await expect(page.getByText('Coming soon')).toBeVisible();
  });
});
