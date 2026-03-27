import { test, expect } from '@playwright/test';
import { TEST_DATA } from '../../fixtures/test-data';

test.describe('Login @smoke', () => {
  test('logs in with valid credentials and redirects to map', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(TEST_DATA.admin.email);
    await page.locator('#password').fill(TEST_DATA.admin.password);
    await page.locator('button[type="submit"]').click();

    // App may redirect to /map or /manage depending on config
    await page.waitForURL(/\/(map|manage)/, { timeout: 15000 });
    await expect(page).toHaveURL(/\/(map|manage)/);
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
  });

  test('login page has email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
