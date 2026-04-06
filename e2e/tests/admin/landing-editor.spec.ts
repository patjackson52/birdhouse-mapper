import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Landing Page Editor', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('landing editor redirects to pages list', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/site-builder/landing`);
    await page.waitForLoadState('networkidle');
    // Should redirect to pages list
    await expect(page).toHaveURL(/\/site-builder\/pages/);
  });
});
