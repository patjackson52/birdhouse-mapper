import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Photo Source Picker Integration', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('PhotoUploader shows device source on item create page', async ({ page }) => {
    await page.goto(`/manage/add`);
    await page.waitForLoadState('networkidle');

    // The photo uploader should be visible with the device source (drop zone)
    // Since Google env vars aren't set, only device source should show (no tabs)
    await expect(page.getByText(/Add Photos|Drop files/)).toBeVisible({ timeout: 10000 });
  });

  test('property settings has geo layers tab', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
    await page.waitForLoadState('networkidle');

    // Should have a Geo Layers tab button (use role to avoid matching sidebar nav link)
    await expect(page.getByRole('button', { name: 'Geo Layers' })).toBeVisible({ timeout: 10000 });
  });

  test('geo layers tab shows boundary selector and empty layer list', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
    await page.waitForLoadState('networkidle');

    // Click the Geo Layers tab button
    await page.getByRole('button', { name: 'Geo Layers' }).click();

    // Should show boundary section and empty layer state
    await expect(page.getByText('Property Boundary')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/No layers assigned/)).toBeVisible();
  });
});
