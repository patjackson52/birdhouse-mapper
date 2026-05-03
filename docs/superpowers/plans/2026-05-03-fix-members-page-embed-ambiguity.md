# Fix Members Page — PostgREST Embed Ambiguity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `/admin/members` HTTP 300 error caused by ambiguous PostgREST embed of `users` on `org_memberships`, and add static + integration guards to prevent recurrence.

**Architecture:** Add explicit FK hint (`users!user_id`) to all three affected `.select()` embeds. Lock the pattern in with a TS-AST static guard that auto-derives multi-FK pairs from migrations, plus a Playwright smoke covering the org-level admin members route. Document the rule in an ADR.

**Tech Stack:** Next.js 14 server actions, Supabase JS client (PostgREST embeds), Vitest + TypeScript compiler API for static guard, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-05-03-fix-members-page-embed-ambiguity-design.md`
**Issue:** [#305](https://github.com/patjackson52/birdhouse-mapper/issues/305)

---

## File Structure

**Modified (3):**
- `src/app/admin/members/actions.ts` — disambiguate two `.select()` embeds
- `src/app/admin/properties/[slug]/members/actions.ts` — disambiguate one `.select()` embed
- `e2e/tests/admin/members.spec.ts` — extend with org-level `/admin/members` smoke

**New (3):**
- `src/__tests__/postgrest-embed-disambiguation.test.ts` — static guard (Vitest + TS AST)
- `docs/adr/0008-membership-data-relationships.md` — ADR (created via `scripts/new-adr.sh`)

**Possibly modified:**
- `e2e/fixtures/seed.ts` or `e2e/fixtures/global-setup.ts` — only if admin user lacks active `org_memberships` row in seed

Each file owns one concern: query disambiguation in actions, regression guard in tests, decision record in ADR.

---

## Task 1: Reproduce bug at E2E layer (red)

**Files:**
- Modify: `e2e/tests/admin/members.spec.ts`

The existing file covers `/p/[slug]/admin/members` (property-scoped). Add a second test that hits the org-level `/admin/members` route — the one in issue #305 screenshot. With current code, the page renders the "Could not embed because more than one relationship was found" error.

- [ ] **Step 1: Read the existing file**

Run: `cat e2e/tests/admin/members.spec.ts`

Note the existing structure: imports `TEST_DATA`, uses `ADMIN_AUTH` storage state, single test for property-scoped page.

- [ ] **Step 2: Replace file contents to add org-level smoke and tag both as `@smoke`**

Path: `e2e/tests/admin/members.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';
import { TEST_DATA } from '../../fixtures/test-data';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');

test.describe('Admin Members @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('property-scoped members page loads', async ({ page }) => {
    await page.goto(`/p/${TEST_DATA.property.slug}/admin/members`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Members').first()).toBeVisible({ timeout: 10000 });
  });

  test('org-level /admin/members renders without PostgREST embed error', async ({ page }) => {
    await page.goto('/admin/members');
    await page.waitForLoadState('networkidle');

    // Heading present
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible({ timeout: 10000 });

    // No PostgREST ambiguity error visible anywhere on the page
    await expect(
      page.locator('text=/Could not embed|more than one relationship was found/i'),
    ).toHaveCount(0);

    // At least one member row rendered (the seeded admin user is itself a member)
    await expect(page.locator('table tbody tr')).not.toHaveCount(0);
  });
});
```

- [ ] **Step 3: Run E2E locally to confirm the new test fails (red)**

Requires `supabase start` + `npm run dev` running, or running in CI. Locally:

```bash
npm run test:e2e -- --grep "org-level /admin/members"
```

Expected: FAIL — page either shows the embed error string or table tbody has 0 rows because the query returned an error.

If unable to run E2E locally (no local Supabase), note this in the commit message and rely on CI to demonstrate red.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/admin/members.spec.ts
git commit -m "test(e2e): add org-level /admin/members smoke (issue #305)

Reproduces the PostgREST embed-ambiguity error on the org-level admin
Members page. Currently fails (red) until the disambiguation fix
lands. Tagged @smoke so it runs in test:e2e:smoke."
```

---

## Task 2: Fix `getOrgMembers` query

**Files:**
- Modify: `src/app/admin/members/actions.ts:11-22`

This is the query that causes the visible error in issue #305. Disambiguate the `users` embed using the column-name FK hint syntax (`users!user_id`).

- [ ] **Step 1: Apply the edit**

In `src/app/admin/members/actions.ts`, find:

```typescript
  const { data, error } = await supabase
    .from('org_memberships')
    .select(`
      id,
      joined_at,
      user_id,
      users ( id, display_name, email ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('status', 'active');
```

Replace with:

```typescript
  const { data, error } = await supabase
    .from('org_memberships')
    .select(`
      id,
      joined_at,
      user_id,
      users!user_id ( id, display_name, email ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('status', 'active');
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/members/actions.ts
git commit -m "fix(members): disambiguate users embed in getOrgMembers (issue #305)

org_memberships has two FKs to users (user_id + invited_by). Bare
users(...) embed caused PostgREST to return HTTP 300 'more than one
relationship was found'. Use FK-hinted form users!user_id(...)."
```

---

## Task 3: Fix `getMemberDetail` query

**Files:**
- Modify: `src/app/admin/members/actions.ts:137-148`

Same fix, second query in the same file (member detail page).

- [ ] **Step 1: Apply the edit**

In `src/app/admin/members/actions.ts`, find:

```typescript
  const { data: membership, error: memError } = await supabase
    .from('org_memberships')
    .select(`
      id,
      status,
      joined_at,
      users ( id, display_name, email ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('user_id', userId)
    .single();
```

Replace with:

```typescript
  const { data: membership, error: memError } = await supabase
    .from('org_memberships')
    .select(`
      id,
      status,
      joined_at,
      users!user_id ( id, display_name, email ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('user_id', userId)
    .single();
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/members/actions.ts
git commit -m "fix(members): disambiguate users embed in getMemberDetail (issue #305)"
```

---

## Task 4: Fix property-scoped members query

**Files:**
- Modify: `src/app/admin/properties/[slug]/members/actions.ts:46-56`

Same shape, third occurrence — property-scoped admin members page.

- [ ] **Step 1: Apply the edit**

In `src/app/admin/properties/[slug]/members/actions.ts`, find:

```typescript
  const { data: orgMemberships, error: orgError } = await supabase
    .from('org_memberships')
    .select(`
      id,
      user_id,
      users ( id, display_name, email ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('status', 'active');
```

Replace with:

```typescript
  const { data: orgMemberships, error: orgError } = await supabase
    .from('org_memberships')
    .select(`
      id,
      user_id,
      users!user_id ( id, display_name, email ),
      roles ( id, name, base_role )
    `)
    .eq('org_id', tenant.orgId)
    .eq('status', 'active');
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Run existing Vitest suite to make sure nothing else broke**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/properties/[slug]/members/actions.ts
git commit -m "fix(members): disambiguate users embed in property-scoped members action (issue #305)"
```

---

## Task 5: Verify E2E smoke now passes (green)

**Files:**
- (none — verification only)

- [ ] **Step 1: Run smoke E2E locally if possible**

Requires `supabase start` and `npm run dev`:

```bash
npm run test:e2e:smoke -- --grep "Admin Members"
```

Expected: PASS.

- [ ] **Step 2: If local Supabase unavailable**

Skip and rely on CI to verify when the branch is pushed. Note this in the next commit message or PR description. Do **not** mark Task 5 complete until CI confirms.

---

## Task 6: Add static guard test

**Files:**
- Create: `src/__tests__/postgrest-embed-disambiguation.test.ts`

Vitest test that auto-derives multi-FK tables by parsing migrations, then walks the source AST and fails on bare `<child>(` embeds inside `.from('<multi-fk-table>').select(...)` chains.

- [ ] **Step 1: Confirm `typescript` is installed**

Run: `node -e "require('typescript'); console.log('ok')"`
Expected: prints `ok`. If it fails, run `npm install` (it's already a dep — should be present).

- [ ] **Step 2: Create the test file**

Path: `src/__tests__/postgrest-embed-disambiguation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as ts from 'typescript';

const REPO_ROOT = join(__dirname, '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

/**
 * Parse migrations to find tables that have more than one FK to the same
 * child table. PostgREST cannot resolve a bare `child(...)` embed for those
 * tables — callers must use `child!column(...)` form.
 *
 * Returns map: { '<parent_table>': Set<'<child_table>'>, ... }
 */
function deriveMultiFkTables(): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  // Track per-parent FK counts to each child: counts[parent][child] = N
  const counts = new Map<string, Map<string, number>>();

  // Find current CREATE TABLE block to attribute REFERENCES rows to the right parent
  const sqlFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of sqlFiles) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    let currentTable: string | null = null;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.replace(/--.*$/, '').trim();
      if (!line) continue;

      const createMatch = line.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/i);
      if (createMatch) {
        currentTable = createMatch[1];
        continue;
      }

      // End of CREATE TABLE
      if (currentTable && line.startsWith(')')) {
        currentTable = null;
        continue;
      }

      if (!currentTable) continue;

      // Match REFERENCES <child>(...)
      const refMatch = line.match(/REFERENCES\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/i);
      if (refMatch) {
        const child = refMatch[1];
        let perParent = counts.get(currentTable);
        if (!perParent) {
          perParent = new Map<string, number>();
          counts.set(currentTable, perParent);
        }
        perParent.set(child, (perParent.get(child) ?? 0) + 1);
      }
    }
  }

  for (const [parent, perChild] of counts) {
    for (const [child, n] of perChild) {
      if (n > 1) {
        let set = result.get(parent);
        if (!set) {
          set = new Set();
          result.set(parent, set);
        }
        set.add(child);
      }
    }
  }

  return result;
}

interface Violation {
  file: string;
  line: number;
  parent: string;
  child: string;
  snippet: string;
}

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
      out.push(...walkSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function findViolations(
  filePath: string,
  multiFk: Map<string, Set<string>>,
): Violation[] {
  const source = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const violations: Violation[] = [];

  function findFromCalls(node: ts.Node) {
    // Look for chains: <expr>.from('<table>')
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'from' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const tableName = node.arguments[0].text;
      const childSet = multiFk.get(tableName);
      if (childSet) {
        // Walk up the chain to find the .select(...) sibling call
        let current: ts.Node = node.parent;
        while (current) {
          if (
            ts.isCallExpression(current) &&
            ts.isPropertyAccessExpression(current.expression) &&
            current.expression.name.text === 'select' &&
            current.arguments.length >= 1
          ) {
            const arg = current.arguments[0];
            let selectText = '';
            if (ts.isNoSubstitutionTemplateLiteral(arg) || ts.isStringLiteral(arg)) {
              selectText = arg.text;
            } else if (ts.isTemplateExpression(arg)) {
              selectText = arg.head.text + arg.templateSpans.map((s) => s.literal.text).join('');
            }
            if (selectText) {
              for (const child of childSet) {
                // Match `<child>(` not preceded by `!<word>` (i.e. bare embed).
                const re = new RegExp(`(?<![!\\w])${child}\\s*\\(`, 'g');
                let m: RegExpExecArray | null;
                while ((m = re.exec(selectText)) !== null) {
                  const lineNum =
                    sf.getLineAndCharacterOfPosition(arg.getStart(sf)).line + 1;
                  violations.push({
                    file: relative(REPO_ROOT, filePath),
                    line: lineNum,
                    parent: tableName,
                    child,
                    snippet: selectText.slice(Math.max(0, m.index - 20), m.index + 40).trim(),
                  });
                }
              }
            }
            break;
          }
          current = current.parent;
          if (!current) break;
        }
      }
    }
    ts.forEachChild(node, findFromCalls);
  }

  findFromCalls(sf);
  return violations;
}

describe('PostgREST embed disambiguation', () => {
  it('derives at least one multi-FK pair from migrations', () => {
    const multiFk = deriveMultiFkTables();
    // org_memberships and property_memberships both have 2 FKs to users.
    expect(multiFk.get('org_memberships')?.has('users')).toBe(true);
    expect(multiFk.get('property_memberships')?.has('users')).toBe(true);
  });

  it('has no bare embeds of multi-FK children in source', () => {
    const multiFk = deriveMultiFkTables();
    const files = walkSourceFiles(SRC_DIR);
    const allViolations: Violation[] = [];
    for (const f of files) {
      allViolations.push(...findViolations(f, multiFk));
    }

    if (allViolations.length > 0) {
      const formatted = allViolations
        .map(
          (v) =>
            `  ${v.file}:${v.line} — .from('${v.parent}').select(...) embeds bare '${v.child}(...)' — use '${v.child}!<column>(...)' instead. Near: "${v.snippet}"`,
        )
        .join('\n');
      throw new Error(
        `Found ${allViolations.length} ambiguous PostgREST embed(s):\n${formatted}\n\n` +
          `See docs/adr/0008-membership-data-relationships.md.`,
      );
    }

    expect(allViolations).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the guard — should be GREEN now (Tasks 2–4 already fixed the violations)**

Run: `npm test -- postgrest-embed`
Expected: both tests pass.

- [ ] **Step 4: Sanity-check the guard catches violations**

Temporarily revert one fix to confirm the guard fails:

```bash
git stash # keep your work
git checkout HEAD~3 -- src/app/admin/members/actions.ts  # 3 commits back: before Task 2's fix
npm test -- postgrest-embed
```

Expected: test fails listing the reintroduced violations.

Restore:

```bash
git checkout HEAD -- src/app/admin/members/actions.ts
git stash pop
npm test -- postgrest-embed
```

Expected: green again.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/postgrest-embed-disambiguation.test.ts
git commit -m "test: add static guard for postgrest embed disambiguation (issue #305)

Walks src/ AST for .from('<table>').select(...) chains and fails on
bare embeds of children referenced via multiple FKs. Multi-FK pairs
auto-derived by parsing supabase/migrations/*.sql, so new schema
additions extend coverage without manual map updates."
```

---

## Task 7: Verify seed has admin org_membership

**Files:**
- Possibly modify: `e2e/fixtures/global-setup.ts` or `e2e/fixtures/seed.ts`

The org-level smoke from Task 1 asserts `tbody tr` count > 0. If the seeded admin user has no active `org_memberships` row, the table will be empty and the smoke fails for the wrong reason.

- [ ] **Step 1: Inspect current seed flow**

Run:

```bash
grep -n "org_memberships" e2e/fixtures/global-setup.ts e2e/fixtures/seed.ts supabase/seed.sql
```

Read each match. Trace whether the admin fixture user (`TEST_DATA.admin`) ends up with a row in `org_memberships` for `TEST_DATA.org` with `status='active'`.

- [ ] **Step 2: If admin already has an active org_membership in seed**

No change required. Skip to Task 8. Note in commit message that seed was already sufficient.

- [ ] **Step 3: If admin has NO active org_membership**

Add an idempotent insert at the end of `e2e/fixtures/global-setup.ts` (or the appropriate seed step) using the existing service-role client pattern. Code shape:

```typescript
// After admin user is ensured to exist, ensure they have an active org_membership
// in the test org so /admin/members has rows to render.
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const { data: org } = await supabaseAdmin
  .from('orgs')
  .select('id')
  .eq('slug', TEST_DATA.org.slug)
  .single();

const { data: adminUser } = await supabaseAdmin
  .from('users')
  .select('id')
  .eq('email', TEST_DATA.admin.email)
  .single();

const { data: adminRole } = await supabaseAdmin
  .from('roles')
  .select('id')
  .eq('org_id', org!.id)
  .eq('base_role', 'org_admin')
  .single();

await supabaseAdmin
  .from('org_memberships')
  .upsert(
    {
      org_id: org!.id,
      user_id: adminUser!.id,
      role_id: adminRole!.id,
      status: 'active',
      joined_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,user_id' },
  );
```

Adapt names (`createClient`, env vars) to match the existing file's imports.

- [ ] **Step 4: Re-run E2E smoke**

```bash
npm run test:e2e:smoke -- --grep "Admin Members"
```

Expected: PASS.

- [ ] **Step 5: Commit (only if seed was modified)**

```bash
git add e2e/fixtures/global-setup.ts
git commit -m "test(e2e): seed admin org_membership for /admin/members smoke"
```

If seed was already sufficient, no commit.

---

## Task 8: Write ADR

**Files:**
- Create: `docs/adr/0008-membership-data-relationships.md` (via `scripts/new-adr.sh`)

- [ ] **Step 1: Create the ADR file via the script**

```bash
./scripts/new-adr.sh "Membership data relationships"
```

Confirm it created `docs/adr/0008-membership-data-relationships.md` (the next number after `0007`).

- [ ] **Step 2: Open the file and replace its contents with the ADR body**

Replace the templated body with:

```markdown
# 0008 — Membership Data Relationships

**Status:** Accepted
**Date:** 2026-05-03
**Issue:** [#305](https://github.com/patjackson52/birdhouse-mapper/issues/305)
**Spec:** [docs/superpowers/specs/2026-05-03-fix-members-page-embed-ambiguity-design.md](../superpowers/specs/2026-05-03-fix-members-page-embed-ambiguity-design.md)

## Context

Two membership tables in the multi-tenant schema each declare more than one foreign key to `users`:

- `org_memberships`: `user_id` → `users(id)` (the member) and `invited_by` → `users(id)` (audit).
- `property_memberships`: `user_id` → `users(id)` (the member) and `granted_by` → `users(id)` (audit).

PostgREST cannot disambiguate `users(...)` in a `.select()` embed when more than one FK exists to the same child table; the request fails with HTTP 300 ("more than one relationship was found"). Issue #305 captured the failure on `/admin/members`.

## Decision

1. **Always FK-hint embeds on these tables.** Any PostgREST `.select()` that embeds `users` (or any future child with >1 FK) on `org_memberships` or `property_memberships` MUST use the column-name FK hint:

   ```ts
   .from('org_memberships').select(`
     id, joined_at, user_id,
     users!user_id ( id, display_name, email ),
     roles ( id, name, base_role )
   `)
   ```

2. **Static guard auto-derives the rule.** A Vitest test (`src/__tests__/postgrest-embed-disambiguation.test.ts`) parses `supabase/migrations/*.sql` to discover any table with multiple FKs to the same child, then AST-walks `src/` to fail on bare embeds. New multi-FK relationships introduced by migrations are picked up automatically — no hand-maintained map.

3. **Membership tables are the canonical user↔org/property linkage.** `invited_by` and `granted_by` are audit columns; never the primary user lookup. Embed them only with explicit hints when needed (e.g. `users!invited_by ( ... )`) and only when the audit identity is actually surfaced to the caller.

4. **The fix is RLS-policy-neutral.** Existing `users` RLS (including `user_visible_to_org_admin`) governs which rows are visible. Adding the FK hint changes which constraint PostgREST follows, not which rows the row-level security policy admits.

## Consequences

- Embeds gain a small amount of verbosity (`!user_id`) — acceptable for unambiguous, fail-fast queries.
- Schema-driven coverage means adding a new audit FK (e.g. `archived_by`) cannot silently break embeds — the guard fails until callers update.
- Existing tests for the affected actions (Vitest unit tests with mocked Supabase) cannot detect this class of bug; the static guard plus the Playwright `@smoke` test on `/admin/members` together cover both compile-time and runtime regressions.

## Alternatives considered

- **Drop `invited_by` / `granted_by`.** Rejected — audit information is required by IAM workflows.
- **Rename FK columns to make hints unnecessary.** Rejected — PostgREST disambiguation requires multiple distinct relationships to one table; renaming would not change that. Nothing about the column name alone resolves ambiguity.
- **Catch ambiguity at runtime only (E2E).** Rejected — relying on E2E for a static-detectable error is slow and forgiving. Static guard fails before code reaches CI.
```

- [ ] **Step 3: Update the ADR index if one exists**

Run: `ls docs/adr/README.md docs/adr/index.md 2>/dev/null`

If either exists, append a row pointing to `0008-membership-data-relationships.md` following the file's existing format. If neither exists, skip.

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0008-membership-data-relationships.md
git commit -m "docs(adr): 0008 membership data relationships (issue #305)

Documents FK-hint requirement for PostgREST embeds on org_memberships
and property_memberships, the auto-derived static guard, and the
RLS-policy-neutral framing of the fix."
```

---

## Task 9: Final verification

**Files:**
- (none — verification only)

- [ ] **Step 1: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 2: Full Vitest run**

Run: `npm test`
Expected: all tests pass, including the new `postgrest-embed-disambiguation`.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds, no warnings about the affected files.

- [ ] **Step 4: Smoke E2E (local if possible, else rely on CI)**

Run: `npm run test:e2e:smoke -- --grep "Admin Members"`
Expected: both Admin Members specs pass.

- [ ] **Step 5: Manual sanity check**

```bash
npm run dev
```

Log in as admin, visit `/admin/members`. Expected: list renders with all members; no error toast or banner.

Visit `/admin/members/<some-user-id>`. Expected: detail page renders.

Visit `/admin/properties/<slug>/members`. Expected: list renders.

- [ ] **Step 6: Push branch + open PR**

Branch: `fix/member-page` (already created by worktree).

```bash
git push -u origin fix/member-page
gh pr create --title "fix(members): disambiguate users embed on org_memberships (closes #305)" --body "$(cat <<'EOF'
## Summary

- Fixes `/admin/members` HTTP 300 error from ambiguous PostgREST embed (issue #305).
- Adds TS-AST static guard that auto-derives multi-FK pairs from migrations and fails on bare embeds.
- Adds Playwright `@smoke` covering the org-level members page.
- Adds ADR 0008 documenting the rule.

## Test plan

- [ ] `npm run type-check` clean
- [ ] `npm test` clean (incl. new `postgrest-embed-disambiguation`)
- [ ] `npm run build` clean
- [ ] `npm run test:e2e:smoke` clean (Admin Members specs both green)
- [ ] Manual: `/admin/members`, `/admin/members/<id>`, `/admin/properties/<slug>/members` all render

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Wait for explicit user approval before running the push/PR step — pushing is a shared-state action.
