import { test, expect } from '@playwright/test';

test.describe('Session Expiry', () => {
  test('session-expired page loads', async ({ page }) => {
    await page.goto('/session-expired');
    await expect(page.locator('text=/session|expired/i').first()).toBeVisible({ timeout: 10000 });
  });
});
