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

  async function loginAndSave(email: string, password: string, savePath: string) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${baseURL}/login`);
    // Wait for the login form to be fully hydrated (checkingSession=false)
    await page.locator('#email').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL(/\/(map|manage|admin)/, { timeout: 30000 });
    } catch {
      const url = page.url();
      const body = await page.locator('body').innerText().catch(() => '(could not get body)');
      const screenshot = await page.screenshot().catch(() => null);
      if (screenshot) fs.writeFileSync(path.join(AUTH_DIR, `login-fail-${email.split('@')[0]}.png`), screenshot);
      throw new Error(`Login failed for ${email}. URL: ${url}\nPage: ${body.slice(0, 500)}`);
    }
    await ctx.storageState({ path: savePath });
    await ctx.close();
  }

  await loginAndSave(TEST_DATA.admin.email, TEST_DATA.admin.password, path.join(AUTH_DIR, 'admin.json'));
  await loginAndSave(TEST_DATA.editor.email, TEST_DATA.editor.password, path.join(AUTH_DIR, 'editor.json'));

  const supabaseAdmin = createTestClient();

  // Fetch all auth users once — reused for both the admin membership upsert and
  // the onboard-user clean-up below.
  const { data: allAuthUsers } = await supabaseAdmin.auth.admin.listUsers();

  // Ensure admin has active org_membership in the test org so /admin/members
  // has rows to render. Idempotent — no-op if the row already exists.
  {
    const { data: org } = await supabaseAdmin
      .from('orgs')
      .select('id')
      .eq('slug', TEST_DATA.org.slug)
      .single();

    const adminAuthUser = allAuthUsers?.users?.find((u: any) => u.email === TEST_DATA.admin.email);

    if (!org || !adminAuthUser) {
      throw new Error(
        `global-setup: cannot upsert admin org_membership — org=${!!org} adminAuthUser=${!!adminAuthUser}`,
      );
    }

    const { data: adminRole } = await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('org_id', org.id)
      .eq('base_role', 'org_admin')
      .single();

    if (!adminRole) {
      throw new Error(`global-setup: no org_admin role found for org ${org.id}`);
    }

    await supabaseAdmin
      .from('org_memberships')
      .upsert(
        {
          org_id: org.id,
          user_id: adminAuthUser.id,
          role_id: adminRole.id,
          status: 'active',
          joined_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,user_id' },
      );
  }

  // Onboard user: ensure clean state by removing any org memberships from prior runs.
  // We do NOT delete/recreate the user — the CI workflow pre-creates them via psql
  // and the handle_new_user trigger ensures they exist in public.users.
  const existingOnboard = allAuthUsers?.users?.find((u: any) => u.email === TEST_DATA.onboard.email);

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
