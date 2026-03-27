import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const MOBILE_VIEWPORT = { width: 375, height: 667 };

test.describe('Property Admin Mobile Sidebar', () => {
  test.use({ storageState: ADMIN_AUTH, viewport: MOBILE_VIEWPORT });

  test('sidebar drawer opens and closes on mobile', async ({ page }) => {
    await page.goto(`/admin/properties/${TEST_DATA.property.slug}/settings`);
    await page.waitForLoadState('networkidle');

    // Desktop sidebar is hidden at mobile viewport (hidden md:block wrapper)
    const desktopSidebar = page.locator('.hidden.md\\:block nav');
    await expect(desktopSidebar).toBeHidden();

    // Hamburger button is visible on mobile
    const hamburger = page.getByRole('button', { name: 'Open menu' });
    await expect(hamburger).toBeVisible();

    // Open the drawer
    await hamburger.click();

    // Drawer overlay is visible
    const drawer = page.locator('.fixed.inset-0');
    await expect(drawer).toBeVisible();

    // Sidebar nav is visible inside the drawer
    await expect(drawer.locator('nav')).toBeVisible();

    // Click the backdrop to dismiss
    const backdrop = drawer.locator('.bg-black\\/50');
    await backdrop.click();

    // Drawer is gone
    await expect(drawer).toBeHidden();
  });
});
