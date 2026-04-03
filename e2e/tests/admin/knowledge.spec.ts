import { test, expect } from '@playwright/test';
import path from 'path';
import { cleanupTestKnowledge } from '../../fixtures/seed-knowledge';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const TEST_TITLE = `E2E Knowledge ${Date.now()}`;

test.describe.serial('Knowledge Admin @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test.afterAll(async () => {
    await cleanupTestKnowledge('E2E Knowledge');
  });

  test('knowledge list page loads', async ({ page }) => {
    await page.goto('/admin/knowledge');
    await page.waitForLoadState('networkidle');

    // Page header should be visible
    await expect(page.getByRole('heading', { name: 'Knowledge' })).toBeVisible({ timeout: 10000 });

    // New Article button should be visible
    await expect(page.locator('a:has-text("New Article")')).toBeVisible();
  });

  test('create new knowledge article', async ({ page }) => {
    await page.goto('/admin/knowledge/new');
    await page.waitForLoadState('networkidle');

    // Verify the editor page loads
    await expect(page.getByRole('heading', { name: 'New Article' })).toBeVisible({ timeout: 10000 });

    // Fill in the title
    const titleInput = page.locator('input[placeholder="Article title…"]');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill(TEST_TITLE);

    // Add a tag
    const tagInput = page.locator('input[placeholder="Add a tag…"]');
    await tagInput.fill('e2e-test');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Verify tag pill appears
    await expect(page.locator('text=e2e-test')).toBeVisible();

    // Set visibility to public
    await page.locator('select').first().selectOption('public');

    // The rich text editor should be visible (TipTap content area)
    await expect(page.locator('.ProseMirror, .tiptap, [contenteditable]').first()).toBeVisible({ timeout: 10000 });

    // Click Create Article
    await page.getByRole('button', { name: 'Create Article' }).click();

    // Should redirect to edit page — verify we're no longer on /new
    await page.waitForURL(/\/admin\/knowledge\/(?!new)/, { timeout: 15000 });
  });

  test('knowledge article appears in list', async ({ page }) => {
    await page.goto('/admin/knowledge');
    await page.waitForLoadState('networkidle');

    // The article we just created should appear in the list
    await expect(page.locator(`text=${TEST_TITLE}`)).toBeVisible({ timeout: 10000 });

    // Tag should be visible (appears in both filter pills and table row)
    await expect(page.locator('text=e2e-test').first()).toBeVisible();
  });

  test('edit knowledge article', async ({ page }) => {
    await page.goto('/admin/knowledge');
    await page.waitForLoadState('networkidle');

    // Click the article title to navigate to edit page
    await page.locator(`a:has-text("${TEST_TITLE}")`).click();
    await page.waitForURL(/\/admin\/knowledge\//, { timeout: 10000 });

    // Verify the edit page loads with the title populated
    await expect(page.getByRole('heading', { name: 'Edit Article' })).toBeVisible({ timeout: 10000 });
    const titleInput = page.locator('input[placeholder="Article title…"]');
    await expect(titleInput).toHaveValue(TEST_TITLE);
  });

  test('search filters knowledge articles', async ({ page }) => {
    await page.goto('/admin/knowledge');
    await page.waitForLoadState('networkidle');

    // Search for the test article
    const searchInput = page.locator('input[placeholder="Search articles…"]');
    await searchInput.fill('E2E Knowledge');

    // Wait for the list to update
    await page.waitForTimeout(500);

    // The test article should still be visible
    await expect(page.locator(`text=${TEST_TITLE}`)).toBeVisible();

    // Search for something that doesn't exist
    await searchInput.fill('xyznonexistent');
    await page.waitForTimeout(500);

    // Should show empty state
    await expect(page.locator('text=No knowledge articles')).toBeVisible({ timeout: 5000 });
  });

  test('delete knowledge article', async ({ page }) => {
    await page.goto('/admin/knowledge');
    await page.waitForLoadState('networkidle');

    // Find the delete button for our test article
    const row = page.locator(`tr:has-text("${TEST_TITLE}")`);
    await expect(row).toBeVisible({ timeout: 10000 });

    // Set up dialog handler to accept the confirmation
    page.on('dialog', (dialog) => dialog.accept());

    // Click delete
    await row.locator('button:has-text("Delete")').click();

    // Article should no longer appear
    await expect(page.locator(`text=${TEST_TITLE}`)).not.toBeVisible({ timeout: 10000 });
  });
});
