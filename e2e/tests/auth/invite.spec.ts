import { test, expect } from '@playwright/test';

test.describe('Invite Flow', () => {
  test('invalid invite token shows error', async ({ page }) => {
    await page.goto('/invite/invalid-token-12345');
    await page.waitForLoadState('networkidle');
    const hasError = await page.locator('text=/invalid|expired|not found/i').isVisible().catch(() => false);
    const redirected = page.url().includes('/login') || page.url().includes('/signin');
    expect(hasError || redirected).toBeTruthy();
  });
});
