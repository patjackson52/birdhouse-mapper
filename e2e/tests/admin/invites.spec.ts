import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';
import { createTestClient } from '../../fixtures/seed';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Invites', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.afterAll(async () => {
    const client = createTestClient();
    await client
      .from('invites')
      .delete()
      .like('display_name', 'E2E Test Invite%');
  });

  test('invites page loads and shows create button', async ({ page }) => {
    await page.goto(
      `/p/${TEST_DATA.property.slug}/admin/invites`
    );

    await expect(page.locator('h1', { hasText: 'Invites' })).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.locator('button', { hasText: '+ Create Invite' })
    ).toBeVisible();
  });

  test('admin can create an invite and see QR code', async ({ page }) => {
    await page.goto(
      `/p/${TEST_DATA.property.slug}/admin/invites`
    );

    // Wait for the page to load
    await expect(
      page.locator('button', { hasText: '+ Create Invite' })
    ).toBeVisible({ timeout: 15000 });

    // Click "+ Create Invite" to open the form
    await page.locator('button', { hasText: '+ Create Invite' }).click();

    // Verify the create form is shown
    await expect(
      page.locator('h2', { hasText: 'Create New Invite' })
    ).toBeVisible();

    // Fill in the display name
    await page.locator('#invite-name').fill('E2E Test Invite');

    // Submit the form
    await page.locator('button[type="submit"]', { hasText: 'Generate Invite' }).click();

    // Should transition to the share view with QR code (no org_id error)
    await expect(
      page.locator('h2', { hasText: 'Invite Ready' })
    ).toBeVisible({ timeout: 10000 });

    // QR code SVG should be visible
    await expect(page.locator('svg').first()).toBeVisible();

    // Invite URL input should contain /invite/ path
    const urlInput = page.locator('input[readonly]');
    await expect(urlInput).toBeVisible();
    const urlValue = await urlInput.inputValue();
    expect(urlValue).toContain('/invite/');

    // No error should be displayed
    await expect(page.locator('.bg-red-50')).not.toBeVisible();
  });
});
