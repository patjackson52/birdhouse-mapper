import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

// Unique note text so we can assert it appears in the detail panel after submit.
const NOTE_TEXT = `E2E smoke note ${Date.now()}`;

test.describe('Add Update Flow @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('happy path: map → marker → Add Update → picker → form → submit → detail panel', async ({ page }) => {
    // ── Step 1: Navigate to the map and wait for tiles/markers to settle ─────
    await page.goto('/map');
    await page.waitForLoadState('networkidle');

    // ── Step 2: Click a marker to open the detail panel ─────────────────────
    const marker = page.locator('.leaflet-marker-icon').first();
    await marker.click({ force: true });

    // Detail panel heading should appear
    const panelHeading = page.locator('h1.font-heading');
    await expect(panelHeading).toBeVisible({ timeout: 10000 });

    // ── Step 3: Click the "Add Update" link ─────────────────────────────────
    // ActionButtonsBlock renders either an <a> or a <Link> with this text.
    const addUpdateLink = page.locator('a:has-text("Add Update")');
    await expect(addUpdateLink).toBeVisible({ timeout: 10000 });
    await addUpdateLink.click();

    // ── Step 4: Picker page — URL should match /p/.+/update/.+ ──────────────
    // The manage/update route 308-redirects to /p/[slug]/update/[itemId], so
    // either entry path converges here.
    await page.waitForURL(/\/p\/.+\/update\/.+/, { timeout: 15000 });
    expect(page.url()).toMatch(/\/p\/.+\/update\/.+/);

    // ── Step 5: Picker shows update-type cards; click "Observation" ─────────
    // "Observation" is a global update type seeded for every item, so it always
    // appears regardless of which marker was clicked.
    const observationCard = page.locator(`a:has-text("Observation")`);
    await expect(observationCard).toBeVisible({ timeout: 10000 });
    await observationCard.click();

    // ── Step 6: Form wrapper page — URL canonicalizes to include ?item= ──────
    // The form page does router.replace to add ?item=<itemId> if missing.
    await page.waitForURL(/\/p\/.+\/update\/.+\/.+\?item=.+/, { timeout: 15000 });
    expect(page.url()).toMatch(/\/p\/.+\/update\/.+\/.+\?item=.+/);

    // ── Step 7: Fill in the notes textarea ───────────────────────────────────
    // <label for="content">Notes</label> / <textarea id="content">
    const notesTextarea = page.locator('#content');
    await expect(notesTextarea).toBeVisible({ timeout: 10000 });
    await notesTextarea.fill(NOTE_TEXT);

    // ── Step 8: Submit the form ───────────────────────────────────────────────
    const submitButton = page.locator('button[type="submit"]:has-text("Add Update")');
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // ── Step 9: Post-submit — URL matches /p/.+?item=.+ ─────────────────────
    // UpdateForm redirects to /p/${slug}?item=${preselectedItemId} on success.
    await page.waitForURL(/\/p\/.+\?item=.+/, { timeout: 20000 });
    expect(page.url()).toMatch(/\/p\/.+\?item=.+/);

    // ── Step 10: Detail panel re-opens and the new note is visible ────────────
    // The panel heading should be visible again, and our note text should appear
    // somewhere in the timeline.
    await expect(page.locator('h1.font-heading')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${NOTE_TEXT}`)).toBeVisible({ timeout: 10000 });
  });
});
