import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Mobile Views', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.describe('Auth - Login', () => {
    test('login page loads with form visible', async ({ page }) => {
      await page.goto('/login');
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('login page has no horizontal overflow', async ({ page }) => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow).toBe(false);
    });
  });

  test.describe('Auth - Signup', () => {
    test('signup page loads with form visible', async ({ page }) => {
      await page.goto('/signup');
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('signup page has no horizontal overflow', async ({ page }) => {
      await page.goto('/signup');
      await page.waitForLoadState('networkidle');
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow).toBe(false);
    });
  });

  test.describe('Map', () => {
    test.use({ storageState: ADMIN_AUTH });

    test('map page loads leaflet container', async ({ page }) => {
      await page.goto('/map');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15000 });
    });

    test('map page has no horizontal overflow', async ({ page }) => {
      await page.goto('/map');
      await page.locator('.leaflet-container').waitFor({ timeout: 15000 });
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow).toBe(false);
    });
  });

  test.describe('Admin Org', () => {
    test.use({ storageState: ADMIN_AUTH });

    test('admin page loads', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main, [role="main"], body')).toBeVisible();
    });

    test('admin page has no horizontal overflow', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow).toBe(false);
    });
  });

  test.describe('Property Admin', () => {
    test.use({ storageState: ADMIN_AUTH });

    test('property settings page loads with hamburger button visible', async ({ page }) => {
      await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
      await page.waitForLoadState('networkidle');
      const hamburger = page.getByRole('button', { name: 'Open menu' });
      await expect(hamburger).toBeVisible({ timeout: 10000 });
    });

    test('property settings page has no horizontal overflow', async ({ page }) => {
      await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
      await page.waitForLoadState('networkidle');
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow).toBe(false);
    });
  });

  test.describe('Onboarding', () => {
    test.use({ storageState: ADMIN_AUTH });

    test('onboard page loads with form visible', async ({ page }) => {
      await page.goto('/onboard');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('form, input, button[type="submit"], button:has-text("Get Started")').first()).toBeVisible({ timeout: 10000 });
    });

    test('onboard page has no horizontal overflow', async ({ page }) => {
      await page.goto('/onboard');
      await page.waitForLoadState('networkidle');
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasOverflow).toBe(false);
    });
  });
});
