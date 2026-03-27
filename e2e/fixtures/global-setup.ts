import { chromium, type FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { TEST_DATA } from './test-data';

const AUTH_DIR = path.join(__dirname, '..', '.auth');

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
  const supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env vars for global setup');
  }

  // Ensure .auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Sign in as admin
  const { data: adminAuth, error: adminError } = await supabase.auth.signInWithPassword({
    email: TEST_DATA.admin.email,
    password: TEST_DATA.admin.password,
  });
  if (adminError) throw new Error(`Admin login failed: ${adminError.message}`);

  // Sign in as editor
  const { data: editorAuth, error: editorError } = await supabase.auth.signInWithPassword({
    email: TEST_DATA.editor.email,
    password: TEST_DATA.editor.password,
  });
  if (editorError) throw new Error(`Editor login failed: ${editorError.message}`);

  const browser = await chromium.launch();

  // Save admin auth state
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto(baseURL);
  await adminPage.evaluate(
    ({ accessToken, refreshToken }) => {
      const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-')) || 'sb-auth-token';
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
      }));
    },
    {
      accessToken: adminAuth.session!.access_token,
      refreshToken: adminAuth.session!.refresh_token,
    }
  );
  await adminPage.reload();
  await adminContext.storageState({ path: path.join(AUTH_DIR, 'admin.json') });
  await adminContext.close();

  // Save editor auth state
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  await editorPage.goto(baseURL);
  await editorPage.evaluate(
    ({ accessToken, refreshToken }) => {
      const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-')) || 'sb-auth-token';
      localStorage.setItem(storageKey, JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'bearer',
      }));
    },
    {
      accessToken: editorAuth.session!.access_token,
      refreshToken: editorAuth.session!.refresh_token,
    }
  );
  await editorPage.reload();
  await editorContext.storageState({ path: path.join(AUTH_DIR, 'editor.json') });
  await editorContext.close();

  await browser.close();
}

export default globalSetup;
