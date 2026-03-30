import { chromium, type FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';
// test-data loads .env.test.local on import — must be imported before seed
import { TEST_DATA } from './test-data';
import { createTestUser, deleteTestUser, createTestClient } from './seed';

const AUTH_DIR = path.join(__dirname, '..', '.auth');

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';

  // Ensure .auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();

  // Helper: log in via form and save storage state
  async function loginAndSave(email: string, password: string, storageStatePath: string): Promise<void> {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${baseURL}/login`);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL(/\/(map|manage|admin)/, { timeout: 30000 });
    } catch (err) {
      // Log current URL to help diagnose failures
      console.error(`[global-setup] Login failed for ${email}. Current URL: ${page.url()}`);
      const bodyText = await page.locator('body').innerText().catch(() => '');
      if (bodyText) console.error('[global-setup] Page body:', bodyText.slice(0, 500));
      throw err;
    }
    await ctx.storageState({ path: storageStatePath });
    await ctx.close();
  }

  // Log in as admin via the actual login form (sets cookies properly)
  await loginAndSave(TEST_DATA.admin.email, TEST_DATA.admin.password, path.join(AUTH_DIR, 'admin.json'));

  // Log in as editor via the actual login form
  await loginAndSave(TEST_DATA.editor.email, TEST_DATA.editor.password, path.join(AUTH_DIR, 'editor.json'));

  // Onboard user: ensure clean state by removing any org memberships from prior runs.
  // We do NOT delete/recreate the user — the CI workflow pre-creates them via psql
  // and the handle_new_user trigger ensures they exist in public.users.
  const supabaseAdmin = createTestClient();
  const { data: existingUserData } = await supabaseAdmin.auth.admin.listUsers();
  const existingOnboard = existingUserData?.users?.find((u: any) => u.email === TEST_DATA.onboard.email);

  if (!existingOnboard) {
    // User doesn't exist yet — create them and upsert into public.users
    const newUser = await createTestUser(TEST_DATA.onboard.email, TEST_DATA.onboard.password);
    if (newUser?.id) {
      await supabaseAdmin.from('users').upsert({
        id: newUser.id,
        email: TEST_DATA.onboard.email,
        email_verified: true,
        display_name: 'E2E Onboard User',
        full_name: 'E2E Onboard User',
        role: 'editor',
      }, { onConflict: 'id' });
    }
  } else {
    // User exists — just remove any org memberships from prior test runs
    await supabaseAdmin
      .from('org_memberships')
      .delete()
      .eq('user_id', existingOnboard.id);
  }

  const onboardContext = await browser.newContext();
  const onboardPage = await onboardContext.newPage();
  await onboardPage.goto(`${baseURL}/login`);
  await onboardPage.locator('#email').fill(TEST_DATA.onboard.email);
  await onboardPage.locator('#password').fill(TEST_DATA.onboard.password);
  await onboardPage.locator('button[type="submit"]').click();
  await onboardPage.waitForLoadState('networkidle', { timeout: 15000 });
  await onboardContext.storageState({ path: path.join(AUTH_DIR, 'onboard-user.json') });
  await onboardContext.close();

  await browser.close();
}

export default globalSetup;
