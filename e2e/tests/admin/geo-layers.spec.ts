import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Geo Layers', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('geo layers page loads with import button', async ({ page }) => {
    await page.goto(`/admin/geo-layers`);
    await page.waitForLoadState('networkidle');

    // Should show the page title
    await expect(page.getByText('Geo Layers')).toBeVisible({ timeout: 10000 });

    // Should show the import button
    await expect(page.getByText('+ Import Layer')).toBeVisible();
  });

  test('shows empty state when no layers exist', async ({ page }) => {
    await page.goto(`/admin/geo-layers`);
    await page.waitForLoadState('networkidle');

    // Should show empty state message
    await expect(page.getByText('No geo layers yet')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Import a GeoJSON/)).toBeVisible();
  });

  test('clicking import shows the import flow', async ({ page }) => {
    await page.goto(`/admin/geo-layers`);
    await page.waitForLoadState('networkidle');

    await page.getByText('+ Import Layer').click();

    // Should show the import flow with dropzone
    await expect(page.getByText('Import Geo Layer')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Drop a file here/)).toBeVisible();
  });

  test('import flow shows file format hints', async ({ page }) => {
    await page.goto(`/admin/geo-layers`);
    await page.waitForLoadState('networkidle');

    await page.getByText('+ Import Layer').click();

    // Should show supported formats
    await expect(page.getByText(/\.geojson/)).toBeVisible({ timeout: 5000 });
  });

  test('import flow has cancel button that returns to list', async ({ page }) => {
    await page.goto(`/admin/geo-layers`);
    await page.waitForLoadState('networkidle');

    await page.getByText('+ Import Layer').click();
    await expect(page.getByText('Import Geo Layer')).toBeVisible({ timeout: 5000 });

    await page.getByText('Cancel').click();

    // Should be back on the list view
    await expect(page.getByText('+ Import Layer')).toBeVisible({ timeout: 5000 });
  });
});
