import { test, expect } from '@playwright/test';

test.describe('Signup', () => {
  test('signup page loads with form fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('shows validation for empty submission', async ({ page }) => {
    await page.goto('/signup');
    await page.locator('button[type="submit"]').click();
    const email = page.locator('#email');
    await expect(email).toBeFocused();
  });
});
