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
