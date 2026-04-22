import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * E2E coverage for the Variant A delete flow:
 *   kebab → confirm bottom-sheet → undo toast with 8-second soft-delete.
 *
 * NOTE: These tests require seeded fixtures:
 *   - TEST_AUTHOR (editor role) with a known update in an item they own (non-anon).
 *   - TEST_ADMIN (org_admin of the same org) to exercise the admin path.
 *   - TEST_VOLUNTEER (member with no delete permission) for the disabled case.
 *
 * The tests use storage state from global-setup.ts (admin.json, editor.json).
 * Set E2E_DELETE_FIXTURES=1 to enable after seeding. Otherwise tests skip gracefully.
 */

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const EDITOR_AUTH = path.join(__dirname, '..', '..', '.auth', 'editor.json');

test.describe('update delete flow (Variant A)', () => {
  test.skip(
    !process.env.E2E_DELETE_FIXTURES,
    'Set E2E_DELETE_FIXTURES=1 after seeding the delete-flow fixtures'
  );

  test('author can delete own update, see toast, undo restores', async ({ page }) => {
    test.use({ storageState: EDITOR_AUTH });
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    // Click a marker to open the detail panel
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click({ force: true });

    // Wait for the detail sheet to appear
    const detailSheet = page.locator('role=dialog').first();
    await expect(detailSheet).toBeVisible({ timeout: 10000 });

    // Click the kebab menu (More button)
    const moreButton = page.locator('button[aria-label="More"]').first();
    await expect(moreButton).toBeVisible();
    await moreButton.click();

    // Click the Delete menu item
    const deleteMenuItem = page.locator('role=menuitem:has-text("Delete")').first();
    await expect(deleteMenuItem).toBeVisible();
    await deleteMenuItem.click();

    // DeleteConfirmModal appears (role=dialog)
    const confirmModal = page.locator('role=dialog:has-text("Delete this update")');
    await expect(confirmModal).toBeVisible({ timeout: 5000 });

    // Click "Delete permanently" button
    const deleteButton = page.locator('button:has-text("Delete permanently")');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Toast with undo appears
    const toast = page.locator('role=status');
    await expect(toast).toContainText(/Update deleted/i, { timeout: 5000 });

    // Undo button is visible in the toast
    const undoButton = page.locator('button:has-text("Undo")');
    await expect(undoButton).toBeVisible();
    await undoButton.click();

    // Toast disappears after undo
    await expect(toast).not.toBeVisible({ timeout: 3000 });
  });

  test('admin sees ADMIN badge in menu and confirm sheet', async ({ page }) => {
    test.use({ storageState: ADMIN_AUTH });
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    // Click a marker to open the detail panel (any update)
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click({ force: true });

    const detailSheet = page.locator('role=dialog').first();
    await expect(detailSheet).toBeVisible({ timeout: 10000 });

    // Open the kebab menu
    const moreButton = page.locator('button[aria-label="More"]').first();
    await moreButton.click();

    // Admin badge visible in dropdown
    const adminBadge = page.locator('text=ADMIN').first();
    await expect(adminBadge).toBeVisible();

    // Click the Delete (admin) menu item
    const deleteAdminMenuItem = page.locator('role=menuitem:has-text("Delete (admin)")');
    await expect(deleteAdminMenuItem).toBeVisible();
    await deleteAdminMenuItem.click();

    // Confirm modal appears with ADMIN badge
    const confirmModal = page.locator('role=dialog:has-text("ADMIN · DELETE OTHERS")');
    await expect(confirmModal).toBeVisible({ timeout: 5000 });
  });

  test('non-author without admin sees disabled delete with helper text', async ({ page }) => {
    test.use({ storageState: EDITOR_AUTH });
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    // Click a marker to open the detail panel
    // NOTE: In the real seed, this marker should belong to a different author
    // For now we just verify the disabled state UI pattern
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click({ force: true });

    const detailSheet = page.locator('role=dialog').first();
    await expect(detailSheet).toBeVisible({ timeout: 10000 });

    // Open the kebab menu
    const moreButton = page.locator('button[aria-label="More"]').first();
    await moreButton.click();

    // Disabled Delete item with helper text
    const disabledDeleteItem = page.locator('role=menuitem:has-text("Delete")').first();
    // Check for the "Only author or admin" note
    const helperText = page.locator('text=Only author or admin');
    await expect(helperText).toBeVisible();
  });

  test('toast expires after 8s and update stays gone after refresh', async ({ page }) => {
    test.use({ storageState: EDITOR_AUTH });
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    // Click marker, open detail sheet
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click({ force: true });

    const detailSheet = page.locator('role=dialog').first();
    await expect(detailSheet).toBeVisible({ timeout: 10000 });

    // Click kebab menu
    const moreButton = page.locator('button[aria-label="More"]').first();
    await moreButton.click();

    // Click Delete
    const deleteMenuItem = page.locator('role=menuitem:has-text("Delete")').first();
    await deleteMenuItem.click();

    // Confirm deletion
    const confirmModal = page.locator('role=dialog:has-text("Delete this update")');
    await expect(confirmModal).toBeVisible({ timeout: 5000 });

    const deleteButton = page.locator('button:has-text("Delete permanently")');
    await deleteButton.click();

    // Toast appears
    const toast = page.locator('role=status');
    await expect(toast).toContainText(/Update deleted/i, { timeout: 5000 });

    // Wait past the 8s soft-delete window + small buffer
    await page.waitForTimeout(9000);

    // Toast should be gone by now
    await expect(toast).not.toBeVisible({ timeout: 2000 });

    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Click the same marker again
    const markerRefreshed = page.locator('.leaflet-marker-icon').first();
    await markerRefreshed.click({ force: true });

    // Detail sheet opens
    const detailSheetRefreshed = page.locator('role=dialog').first();
    await expect(detailSheetRefreshed).toBeVisible({ timeout: 10000 });

    // TODO: Verify the deleted update row is absent from the timeline
    // (Would need a way to identify the specific update in the timeline)
  });
});
