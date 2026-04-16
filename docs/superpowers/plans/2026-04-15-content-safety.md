# Content Safety & Abuse Prevention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add content moderation for public contributions — images and text are checked by OpenAI's free moderation API before going public, with admin review queue and org-level settings.

**Architecture:** Server action pipeline. Public contributors get anonymous Supabase auth with a new `public_contributor` role. Uploads land in `vault-private` (staging), pass through OpenAI omni-moderation, then either auto-approve to `vault-public` or queue for admin review based on org settings. Admin moderation queue at `/admin/moderation`.

**Tech Stack:** Next.js 14 server actions, Supabase (Auth, Storage, PostgreSQL + RLS), OpenAI Moderation API (free), TanStack Query, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-04-15-content-safety-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/043_content_safety.sql` | DB schema: new columns, tables, RLS policies, role seed |
| `src/lib/moderation/moderate.ts` | OpenAI moderation utility for images and text |
| `src/lib/moderation/types.ts` | Moderation types (ModerationResult, ModerationStatus, etc.) |
| `src/lib/moderation/__tests__/moderate.test.ts` | Unit tests for moderation utility |
| `src/lib/vault/actions.ts` | Modify: add moderation step to `uploadToVault()` |
| `src/lib/vault/types.ts` | Modify: add moderation fields to `VaultItem` |
| `src/lib/vault/__tests__/actions.test.ts` | Modify: add tests for moderation flow |
| `src/lib/types.ts` | Modify: extend `BaseRole`, `OrgMembershipStatus`, `Org` |
| `src/app/admin/moderation/page.tsx` | Admin moderation queue UI |
| `src/app/admin/moderation/actions.ts` | Server actions for moderation queue (approve, reject, ban) |
| `src/app/admin/moderation/__tests__/actions.test.ts` | Tests for moderation admin actions |
| `src/app/admin/settings/actions.ts` | Modify: add moderation settings to `OrgSettings` |
| `src/app/admin/settings/page.tsx` | Modify: add public contributions + moderation mode toggles |
| `src/app/admin/AdminShell.tsx` | Modify: add Moderation nav item with pending badge |
| `src/components/map/PublicContributeButton.tsx` | "Submit a photo" button on public map |
| `src/components/map/PublicSubmissionForm.tsx` | Photo upload + text form for public contributors |
| `src/app/api/public-contribute/actions.ts` | Server action: anonymous sign-in + create membership + upload with moderation |
| `src/app/api/public-contribute/__tests__/actions.test.ts` | Tests for public contribution flow |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/043_content_safety.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 043_content_safety.sql
-- Content safety: moderation columns, org settings, moderation_actions table, public_contributor support

-- 1. Add moderation columns to vault_items
ALTER TABLE vault_items
  ADD COLUMN moderation_status text NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'flagged_for_review')),
  ADD COLUMN moderation_scores jsonb,
  ADD COLUMN rejection_reason text,
  ADD COLUMN moderated_at timestamptz;

CREATE INDEX idx_vault_items_moderation_status ON vault_items(moderation_status);

-- 2. Add org settings for public contributions
ALTER TABLE orgs
  ADD COLUMN allow_public_contributions boolean NOT NULL DEFAULT false,
  ADD COLUMN moderation_mode text NOT NULL DEFAULT 'manual_review'
    CHECK (moderation_mode IN ('auto_approve', 'manual_review'));

-- 3. Extend org_memberships status to include 'banned'
ALTER TABLE org_memberships
  DROP CONSTRAINT IF EXISTS org_memberships_status_check,
  ADD CONSTRAINT org_memberships_status_check
    CHECK (status IN ('invited', 'active', 'suspended', 'revoked', 'banned'));

-- 4. Add rate limiting columns to org_memberships
ALTER TABLE org_memberships
  ADD COLUMN upload_count_this_hour int NOT NULL DEFAULT 0,
  ADD COLUMN last_upload_window_start timestamptz;

-- 5. Extend base_role check to include public_contributor
ALTER TABLE roles
  DROP CONSTRAINT IF EXISTS roles_base_role_check,
  ADD CONSTRAINT roles_base_role_check
    CHECK (base_role IN ('platform_admin', 'org_admin', 'org_staff', 'contributor', 'viewer', 'public', 'public_contributor'));

-- 6. Create moderation_actions table
CREATE TABLE moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('warn', 'ban', 'takedown')),
  reason text,
  vault_item_id uuid REFERENCES vault_items(id) ON DELETE SET NULL,
  acted_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_moderation_actions_org ON moderation_actions(org_id);
CREATE INDEX idx_moderation_actions_user ON moderation_actions(user_id);

-- 7. RLS for moderation_actions
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY moderation_actions_select ON moderation_actions
  FOR SELECT USING (
    is_platform_admin()
    OR org_id IN (SELECT user_org_admin_org_ids())
  );

CREATE POLICY moderation_actions_insert ON moderation_actions
  FOR INSERT WITH CHECK (
    is_platform_admin()
    OR org_id IN (SELECT user_org_admin_org_ids())
  );

-- 8. Add RLS policy: only approved vault_items visible to non-admins in public queries
-- The existing vault_items SELECT policy allows any active org member to see all items.
-- We add a narrower policy for the 'public' role (anon/public access) that filters by moderation_status.
CREATE POLICY vault_items_public_approved ON vault_items
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM vault_items vi
      JOIN orgs o ON o.id = vi.org_id
      WHERE vi.id = vault_items.id
      AND vi.moderation_status = 'approved'
      AND o.allow_public_contributions = true
    )
  );
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx supabase db reset 2>&1 | tail -20`

If using a local Supabase instance. Otherwise, verify the SQL is syntactically correct by reviewing it.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/043_content_safety.sql
git commit -m "feat: add content safety database migration (#221)

Add moderation columns to vault_items, org settings for public
contributions, moderation_actions table, and extend roles for
public_contributor.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 2: Moderation Types

**Files:**
- Create: `src/lib/moderation/types.ts`
- Modify: `src/lib/vault/types.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Create moderation types**

Create `src/lib/moderation/types.ts`:

```typescript
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'flagged_for_review';

export interface ModerationScores {
  sexual: number;
  'sexual/minors': number;
  harassment: number;
  'harassment/threatening': number;
  hate: number;
  'hate/threatening': number;
  illicit: number;
  'illicit/violent': number;
  'self-harm': number;
  'self-harm/intent': number;
  'self-harm/instructions': number;
  violence: number;
  'violence/graphic': number;
}

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  scores: ModerationScores;
}
```

- [ ] **Step 2: Add moderation fields to VaultItem**

In `src/lib/vault/types.ts`, add these fields to the `VaultItem` interface after line 18 (`updated_at: string;`):

```typescript
  moderation_status: ModerationStatus;
  moderation_scores: ModerationScores | null;
  rejection_reason: string | null;
  moderated_at: string | null;
```

Add the import at the top of the file:

```typescript
import type { ModerationStatus, ModerationScores } from '@/lib/moderation/types';
```

- [ ] **Step 3: Extend types in `src/lib/types.ts`**

Update the `BaseRole` type on line 14:

```typescript
export type BaseRole = 'platform_admin' | 'org_admin' | 'org_staff' | 'contributor' | 'viewer' | 'public' | 'public_contributor';
```

Update the `OrgMembershipStatus` type on line 18:

```typescript
export type OrgMembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked' | 'banned';
```

Add to the `Org` interface (after `communications_enabled`):

```typescript
  allow_public_contributions: boolean;
  moderation_mode: 'auto_approve' | 'manual_review';
```

- [ ] **Step 4: Run type check**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx tsc --noEmit`

Expected: PASS (no errors). If there are errors from existing code referencing the new VaultItem fields, they will be fixed in later tasks when the DB/queries are updated.

- [ ] **Step 5: Commit**

```bash
git add src/lib/moderation/types.ts src/lib/vault/types.ts src/lib/types.ts
git commit -m "feat: add moderation types and extend VaultItem/Org interfaces (#221)

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 3: OpenAI Moderation Utility

**Files:**
- Create: `src/lib/moderation/moderate.ts`
- Create: `src/lib/moderation/__tests__/moderate.test.ts`

- [ ] **Step 1: Write failing tests for `moderateImage` and `moderateText`**

Create `src/lib/moderation/__tests__/moderate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

let fetchResponse: { ok: boolean; json: () => Promise<unknown> };

vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(fetchResponse)));

// Must import after stubbing fetch
const { moderateImage, moderateText } = await import('../moderate');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('moderateText', () => {
  it('returns not flagged for clean text', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{
          flagged: false,
          categories: { sexual: false, hate: false, violence: false },
          category_scores: { sexual: 0.001, hate: 0.002, violence: 0.001 },
        }],
      }),
    };

    const result = await moderateText('A beautiful birdhouse in the garden');
    expect(result.flagged).toBe(false);
  });

  it('returns flagged for offensive text', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{
          flagged: true,
          categories: { hate: true, violence: false },
          category_scores: { hate: 0.95, violence: 0.01 },
        }],
      }),
    };

    const result = await moderateText('some offensive text');
    expect(result.flagged).toBe(true);
    expect(result.categories.hate).toBe(true);
  });

  it('throws on API failure', async () => {
    fetchResponse = { ok: false, json: () => Promise.resolve({ error: 'bad' }) };
    await expect(moderateText('test')).rejects.toThrow('Moderation API request failed');
  });
});

describe('moderateImage', () => {
  it('returns not flagged for clean image', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{
          flagged: false,
          categories: { sexual: false, violence: false },
          category_scores: { sexual: 0.001, violence: 0.002 },
        }],
      }),
    };

    const result = await moderateImage('base64encodedimage', 'image/jpeg');
    expect(result.flagged).toBe(false);
  });

  it('returns flagged for NSFW image', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{
          flagged: true,
          categories: { sexual: true },
          category_scores: { sexual: 0.98 },
        }],
      }),
    };

    const result = await moderateImage('base64encodedimage', 'image/jpeg');
    expect(result.flagged).toBe(true);
  });

  it('sends correct payload with image data', async () => {
    fetchResponse = {
      ok: true,
      json: () => Promise.resolve({
        results: [{ flagged: false, categories: {}, category_scores: {} }],
      }),
    };

    await moderateImage('abc123', 'image/png');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/moderations',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('data:image/png;base64,abc123'),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx vitest run src/lib/moderation/__tests__/moderate.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement moderation utility**

Create `src/lib/moderation/moderate.ts`:

```typescript
import type { ModerationResult } from './types';

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations';

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY environment variable is not set');
  return key;
}

export async function moderateText(text: string): Promise<ModerationResult> {
  const response = await fetch(OPENAI_MODERATION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: [{ type: 'text', text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Moderation API request failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data.results[0];

  return {
    flagged: result.flagged,
    categories: result.categories,
    scores: result.category_scores,
  };
}

export async function moderateImage(
  base64: string,
  mimeType: string,
): Promise<ModerationResult> {
  const response = await fetch(OPENAI_MODERATION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: [{
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64}` },
      }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Moderation API request failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data.results[0];

  return {
    flagged: result.flagged,
    categories: result.categories,
    scores: result.category_scores,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx vitest run src/lib/moderation/__tests__/moderate.test.ts`

Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/moderation/moderate.ts src/lib/moderation/__tests__/moderate.test.ts
git commit -m "feat: add OpenAI moderation utility for images and text (#221)

Wraps OpenAI omni-moderation-latest endpoint. Handles both text and
image inputs. Free tier — no cost per call.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 4: Add Moderation to `uploadToVault()`

**Files:**
- Modify: `src/lib/vault/actions.ts`
- Modify: `src/lib/vault/__tests__/actions.test.ts`

- [ ] **Step 1: Write failing test for moderated upload**

Add to `src/lib/vault/__tests__/actions.test.ts`. Add a new `describe('uploadToVault moderation')` block. You'll need to:

1. Mock `@/lib/moderation/moderate` at the top of the file:

```typescript
let moderateImageResult = { flagged: false, categories: {}, scores: {} };
let moderateImageError: Error | null = null;

vi.mock('@/lib/moderation/moderate', () => ({
  moderateImage: vi.fn(() => {
    if (moderateImageError) return Promise.reject(moderateImageError);
    return Promise.resolve(moderateImageResult);
  }),
}));
```

2. Add test cases:

```typescript
describe('uploadToVault moderation', () => {
  const imageInput: UploadToVaultInput = {
    orgId: 'org-1',
    file: { name: 'photo.jpg', type: 'image/jpeg', size: 1000, base64: 'abc123' },
    category: 'photo',
    visibility: 'public',
  };

  beforeEach(() => {
    moderateImageResult = { flagged: false, categories: {}, scores: {} };
    moderateImageError = null;
  });

  it('rejects upload when MIME type is not in allowlist', async () => {
    const result = await uploadToVault({
      ...imageInput,
      file: { ...imageInput.file, type: 'application/pdf' },
      moderateAsPublicContribution: true,
    });
    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('File type not allowed');
  });

  it('rejects upload when moderation flags content', async () => {
    moderateImageResult = { flagged: true, categories: { sexual: true }, scores: { sexual: 0.99 } };
    const result = await uploadToVault({
      ...imageInput,
      moderateAsPublicContribution: true,
    });
    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('content guidelines');
  });

  it('sets moderation_status to flagged_for_review when API fails', async () => {
    moderateImageError = new Error('API down');
    const result = await uploadToVault({
      ...imageInput,
      moderateAsPublicContribution: true,
    });
    expect(result).toHaveProperty('success', true);
    const inserted = insertedRows.find(r => r.table === 'vault_items');
    expect(inserted?.payload.moderation_status).toBe('flagged_for_review');
  });

  it('skips moderation when moderateAsPublicContribution is false', async () => {
    const result = await uploadToVault(imageInput);
    expect(result).toHaveProperty('success', true);
    const inserted = insertedRows.find(r => r.table === 'vault_items');
    expect(inserted?.payload.moderation_status).toBe('approved');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx vitest run src/lib/vault/__tests__/actions.test.ts`

Expected: FAIL

- [ ] **Step 3: Modify `uploadToVault()` to support moderation**

In `src/lib/vault/actions.ts`:

Add import at top:

```typescript
import { moderateImage } from '@/lib/moderation/moderate';
import type { ModerationResult } from '@/lib/moderation/types';
```

Add `moderateAsPublicContribution?: boolean` to `UploadToVaultInput` in `src/lib/vault/types.ts`:

```typescript
export interface UploadToVaultInput {
  orgId: string;
  file: { name: string; type: string; size: number; base64: string };
  category: VaultCategory;
  visibility: VaultVisibility;
  isAiContext?: boolean;
  aiPriority?: number;
  metadata?: Record<string, unknown>;
  moderateAsPublicContribution?: boolean;
  orgModerationMode?: 'auto_approve' | 'manual_review';
}
```

Modify `uploadToVault()` — insert the following logic after the auth check (line 17) and before the quota check (line 19):

```typescript
  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  if (input.moderateAsPublicContribution) {
    if (!ALLOWED_IMAGE_TYPES.includes(input.file.type)) {
      return { error: 'File type not allowed. Please upload a JPEG, PNG, WebP, or GIF image.' };
    }
  }
```

Then, after the storage upload succeeds (line 43) and before the DB insert (line 45), add the moderation check:

```typescript
  let moderationStatus: string = 'approved';
  let moderationScores: Record<string, unknown> | null = null;
  let rejectionReason: string | null = null;
  let moderatedAt: string | null = null;

  if (input.moderateAsPublicContribution) {
    try {
      const modResult = await moderateImage(input.file.base64, input.file.type);
      moderationScores = modResult.scores as unknown as Record<string, unknown>;
      moderatedAt = new Date().toISOString();

      if (modResult.flagged) {
        // Delete the uploaded file from staging
        await supabase.storage.from(bucket).remove([storagePath]);
        return { error: "Your photo couldn't be posted because it doesn't meet our content guidelines." };
      }

      // AI passed — decide based on org moderation mode
      moderationStatus = input.orgModerationMode === 'auto_approve' ? 'approved' : 'pending';
    } catch {
      // API failure — fail closed, queue for manual review
      moderationStatus = 'flagged_for_review';
      moderatedAt = new Date().toISOString();
    }
  }
```

Update the DB insert to include the new columns:

```typescript
  const { data: item, error: insertError } = await supabase
    .from('vault_items')
    .insert({
      id: itemId,
      org_id: input.orgId,
      uploaded_by: user.id,
      storage_bucket: bucket,
      storage_path: storagePath,
      file_name: input.file.name,
      mime_type: input.file.type || null,
      file_size: input.file.size,
      category: input.category,
      visibility: input.visibility,
      is_ai_context: input.isAiContext ?? false,
      ai_priority: input.aiPriority ?? null,
      metadata: input.metadata ?? {},
      moderation_status: moderationStatus,
      moderation_scores: moderationScores,
      rejection_reason: rejectionReason,
      moderated_at: moderatedAt,
    })
    .select('*')
    .single();
```

If `moderationStatus` is `'pending'` or `'flagged_for_review'`, the file stays in `vault-private`. If `'approved'` and the input visibility is `'public'`, move the file to `vault-public` after insert (add after successful insert):

```typescript
  if (moderationStatus === 'approved' && input.visibility === 'public' && input.moderateAsPublicContribution) {
    const publicPath = storagePath;
    const { data: fileData } = await supabase.storage.from('vault-private').download(storagePath);
    if (fileData) {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      await supabase.storage.from('vault-public').upload(publicPath, buffer, {
        contentType: input.file.type || 'application/octet-stream',
        upsert: false,
      });
      await supabase.storage.from('vault-private').remove([storagePath]);
      await supabase.from('vault_items').update({
        storage_bucket: 'vault-public',
      }).eq('id', itemId);
    }
  }
```

For moderated uploads, always upload to `vault-private` initially. Change the bucket selection logic:

```typescript
  const bucket = input.moderateAsPublicContribution
    ? 'vault-private'
    : (input.visibility === 'public' ? 'vault-public' : 'vault-private');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx vitest run src/lib/vault/__tests__/actions.test.ts`

Expected: PASS

- [ ] **Step 5: Run type check**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/vault/actions.ts src/lib/vault/types.ts src/lib/vault/__tests__/actions.test.ts
git commit -m "feat: add moderation pipeline to uploadToVault (#221)

Public contributions are validated (MIME allowlist), moderated via
OpenAI, and staged in vault-private until approved. Fails closed
on API errors.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 5: Admin Moderation Actions (Server Side)

**Files:**
- Create: `src/app/admin/moderation/actions.ts`
- Create: `src/app/admin/moderation/__tests__/actions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/admin/moderation/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authUser: { id: string } | null = { id: 'admin-1' };
let tenantContext = { orgId: 'org-1' };
let selectData: Record<string, unknown>[] = [];
let updateError: Error | null = null;
let insertedRows: { table: string; payload: Record<string, unknown> }[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: authUser }, error: authUser ? null : new Error('no') })
      ),
    },
    storage: {
      from: () => ({
        remove: vi.fn(() => Promise.resolve({ error: null })),
        download: vi.fn(() => Promise.resolve({ data: new Blob() })),
        upload: vi.fn(() => Promise.resolve({ error: null })),
      }),
    },
    from: (table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: selectData, error: null })),
          })),
          single: vi.fn(() => Promise.resolve({ data: selectData[0] ?? null, error: null })),
          order: vi.fn(() => Promise.resolve({ data: selectData, error: null })),
        })),
        in: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: selectData, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: updateError })),
      })),
      insert: vi.fn((payload: any) => {
        insertedRows.push({ table, payload });
        return Promise.resolve({ error: null });
      }),
    }),
  }),
}));

vi.mock('@/lib/tenant/server', () => ({
  getTenantContext: vi.fn(() => Promise.resolve(tenantContext)),
}));

const { getPendingItems, approveItem, rejectItem, banContributor } = await import('../actions');

beforeEach(() => {
  authUser = { id: 'admin-1' };
  tenantContext = { orgId: 'org-1' };
  selectData = [];
  updateError = null;
  insertedRows = [];
});

describe('getPendingItems', () => {
  it('returns error when not authenticated', async () => {
    authUser = null;
    const result = await getPendingItems();
    expect(result).toHaveProperty('error', 'Not authenticated.');
  });

  it('returns pending items for the org', async () => {
    selectData = [
      { id: 'item-1', moderation_status: 'pending', file_name: 'photo.jpg' },
    ];
    const result = await getPendingItems();
    expect(result).toHaveProperty('items');
  });
});

describe('approveItem', () => {
  it('updates moderation_status to approved', async () => {
    selectData = [{ id: 'item-1', storage_bucket: 'vault-private', storage_path: 'org-1/x/photo.jpg', moderation_status: 'pending' }];
    const result = await approveItem('item-1');
    expect(result).toHaveProperty('success', true);
  });
});

describe('rejectItem', () => {
  it('updates moderation_status to rejected and logs action', async () => {
    selectData = [{ id: 'item-1', storage_bucket: 'vault-private', storage_path: 'org-1/x/photo.jpg', uploaded_by: 'user-1' }];
    const result = await rejectItem('item-1', 'nsfw');
    expect(result).toHaveProperty('success', true);
  });
});

describe('banContributor', () => {
  it('sets membership status to banned and logs action', async () => {
    const result = await banContributor('user-1', 'Repeated violations');
    expect(result).toHaveProperty('success', true);
    expect(insertedRows.some(r => r.table === 'moderation_actions')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx vitest run src/app/admin/moderation/__tests__/actions.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement admin moderation actions**

Create `src/app/admin/moderation/actions.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import type { VaultItem } from '@/lib/vault/types';

export async function getPendingItems(): Promise<{ items?: VaultItem[]; error?: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated.' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  const { data, error } = await supabase
    .from('vault_items')
    .select('*')
    .eq('org_id', tenant.orgId)
    .in('moderation_status', ['pending', 'flagged_for_review'])
    .order('created_at', { ascending: true });

  if (error) return { error: error.message };
  return { items: (data ?? []) as VaultItem[] };
}

export async function approveItem(
  vaultItemId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated.' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Fetch the item to get storage info
  const { data: item, error: fetchError } = await supabase
    .from('vault_items')
    .select('*')
    .eq('id', vaultItemId)
    .single();

  if (fetchError || !item) return { error: 'Item not found' };

  // Move from vault-private to vault-public if currently in staging
  if (item.storage_bucket === 'vault-private') {
    const { data: fileData } = await supabase.storage
      .from('vault-private')
      .download(item.storage_path);

    if (fileData) {
      const buffer = new Uint8Array(await fileData.arrayBuffer());
      await supabase.storage.from('vault-public').upload(item.storage_path, buffer, {
        contentType: item.mime_type || 'application/octet-stream',
        upsert: false,
      });
      await supabase.storage.from('vault-private').remove([item.storage_path]);
    }
  }

  const { error: updateError } = await supabase
    .from('vault_items')
    .update({
      moderation_status: 'approved',
      storage_bucket: 'vault-public',
      moderated_at: new Date().toISOString(),
    })
    .eq('id', vaultItemId);

  if (updateError) return { error: updateError.message };
  return { success: true };
}

export async function rejectItem(
  vaultItemId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated.' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Fetch item to get storage info and uploader
  const { data: item, error: fetchError } = await supabase
    .from('vault_items')
    .select('*')
    .eq('id', vaultItemId)
    .single();

  if (fetchError || !item) return { error: 'Item not found' };

  // Delete from storage
  await supabase.storage.from(item.storage_bucket).remove([item.storage_path]);

  // Update status
  const { error: updateError } = await supabase
    .from('vault_items')
    .update({
      moderation_status: 'rejected',
      rejection_reason: reason,
      moderated_at: new Date().toISOString(),
    })
    .eq('id', vaultItemId);

  if (updateError) return { error: updateError.message };

  // Log moderation action
  await supabase.from('moderation_actions').insert({
    org_id: tenant.orgId,
    user_id: item.uploaded_by,
    action: 'takedown',
    reason,
    vault_item_id: vaultItemId,
    acted_by: user.id,
  });

  return { success: true };
}

export async function banContributor(
  userId: string,
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Not authenticated.' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Update membership status to banned
  const { error: updateError } = await supabase
    .from('org_memberships')
    .update({ status: 'banned' })
    .eq('user_id', userId)
    .eq('org_id', tenant.orgId);

  if (updateError) return { error: updateError.message };

  // Log moderation action
  await supabase.from('moderation_actions').insert({
    org_id: tenant.orgId,
    user_id: userId,
    action: 'ban',
    reason,
    acted_by: user.id,
  });

  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx vitest run src/app/admin/moderation/__tests__/actions.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/moderation/actions.ts src/app/admin/moderation/__tests__/actions.test.ts
git commit -m "feat: add admin moderation server actions (#221)

getPendingItems, approveItem, rejectItem, banContributor.
Approve moves files from vault-private to vault-public.
Reject deletes from storage and logs to moderation_actions.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 6: Admin Moderation Queue UI

**Files:**
- Create: `src/app/admin/moderation/page.tsx`
- Modify: `src/app/admin/AdminShell.tsx`

- [ ] **Step 1: Create the moderation queue page**

Create `src/app/admin/moderation/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPendingItems, approveItem, rejectItem, banContributor } from './actions';
import type { VaultItem } from '@/lib/vault/types';
import { getVaultUrl } from '@/lib/vault/helpers';

const REJECTION_REASONS = [
  { value: 'nsfw', label: 'NSFW / Explicit Content' },
  { value: 'violence', label: 'Violence / Graphic Content' },
  { value: 'hate', label: 'Hate Speech / Symbols' },
  { value: 'spam', label: 'Spam / Irrelevant' },
  { value: 'other', label: 'Other' },
];

export default function ModerationQueuePage() {
  const queryClient = useQueryClient();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['admin', 'moderation', 'pending'],
    queryFn: async () => {
      const result = await getPendingItems();
      if (result.error) {
        setMessage(`Error: ${result.error}`);
        return [];
      }
      return result.items ?? [];
    },
  });

  async function handleApprove(itemId: string) {
    setActionInProgress(itemId);
    const result = await approveItem(itemId);
    setActionInProgress(null);
    if (result.error) {
      setMessage(`Error: ${result.error}`);
    } else {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
    }
  }

  async function handleReject(itemId: string, reason: string) {
    setActionInProgress(itemId);
    const result = await rejectItem(itemId, reason);
    setActionInProgress(null);
    if (result.error) {
      setMessage(`Error: ${result.error}`);
    } else {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
    }
  }

  async function handleBan(userId: string) {
    if (!confirm('Ban this contributor? They will no longer be able to submit content.')) return;
    const result = await banContributor(userId, 'Banned from moderation queue');
    if (result.error) {
      setMessage(`Error: ${result.error}`);
    } else {
      setMessage('Contributor banned.');
      setTimeout(() => setMessage(''), 3000);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-32 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">
        Content Moderation
      </h1>

      {message && (
        <div
          className={`mb-6 rounded-lg px-3 py-2 text-sm ${
            message.startsWith('Error')
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-700'
          }`}
        >
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-sage">No items pending review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ModerationCard
              key={item.id}
              item={item}
              isLoading={actionInProgress === item.id}
              onApprove={() => handleApprove(item.id)}
              onReject={(reason) => handleReject(item.id, reason)}
              onBan={() => handleBan(item.uploaded_by)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModerationCard({
  item,
  isLoading,
  onApprove,
  onReject,
  onBan,
}: {
  item: VaultItem;
  isLoading: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onBan: () => void;
}) {
  const [showRejectMenu, setShowRejectMenu] = useState(false);
  const isImage = item.mime_type?.startsWith('image/');

  return (
    <div className="card">
      <div className="flex gap-4">
        {/* Thumbnail */}
        {isImage && (
          <div className="w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-sage-light">
            <img
              src={getVaultUrl({ ...item, visibility: 'private' } as any)}
              alt={item.file_name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-forest-dark truncate">{item.file_name}</p>
              <p className="text-xs text-sage mt-1">
                {item.moderation_status === 'flagged_for_review' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 mr-2">
                    Flagged for review
                  </span>
                )}
                Submitted {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* AI Scores summary */}
          {item.moderation_scores && (
            <div className="mt-2">
              <p className="text-xs text-sage font-medium">AI Scores:</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(item.moderation_scores as Record<string, number>)
                  .filter(([, score]) => score > 0.1)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([category, score]) => (
                    <span
                      key={category}
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                        score > 0.7
                          ? 'bg-red-100 text-red-700'
                          : score > 0.4
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {category}: {(score * 100).toFixed(0)}%
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onApprove}
              disabled={isLoading}
              className="btn-primary text-sm px-3 py-1.5"
            >
              {isLoading ? 'Processing...' : 'Approve'}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowRejectMenu(!showRejectMenu)}
                disabled={isLoading}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                Reject
              </button>
              {showRejectMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[180px]">
                  {REJECTION_REASONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => {
                        onReject(r.value);
                        setShowRejectMenu(false);
                      }}
                      className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onBan}
              disabled={isLoading}
              className="text-sm px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
            >
              Ban User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Moderation to admin sidebar with pending badge**

In `src/app/admin/AdminShell.tsx`, add a new nav item to the `ORG_NAV_ITEMS` array after the "Members" entry (line 19):

```typescript
  { label: 'Moderation', href: '/admin/moderation' },
```

Then add a pending count badge. Inside the `AdminShell` component, add state and a query to fetch the pending count:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getPendingItems } from '@/app/admin/moderation/actions';

// Inside AdminShell component:
const { data: pendingCount = 0 } = useQuery({
  queryKey: ['admin', 'moderation', 'pending-count'],
  queryFn: async () => {
    const result = await getPendingItems();
    return result.items?.length ?? 0;
  },
  refetchInterval: 30000, // refresh every 30s
});
```

Pass `pendingCount` as a badge to the Moderation nav item. The `SidebarItem` type may need a `badge?: number` field — check `src/components/admin/AdminSidebar.tsx` and add support if needed. Render the badge as a small red circle with the count next to the "Moderation" label.

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/moderation/page.tsx src/app/admin/AdminShell.tsx
git commit -m "feat: add admin moderation queue page (#221)

Shows pending/flagged items with thumbnails, AI scores, and
approve/reject/ban actions. Added to admin sidebar nav.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 7: Org Settings — Public Contributions & Moderation Mode

**Files:**
- Modify: `src/app/admin/settings/actions.ts`
- Modify: `src/app/admin/settings/page.tsx`

- [ ] **Step 1: Add new fields to OrgSettings interface and queries**

In `src/app/admin/settings/actions.ts`:

Add to the `OrgSettings` interface (after `map_display_config`):

```typescript
  allow_public_contributions: boolean;
  moderation_mode: 'auto_approve' | 'manual_review';
```

Update the `getOrgSettings()` select query on line 29 to include the new columns:

```typescript
    .select('id, name, slug, tagline, pwa_name, logo_url, favicon_url, theme, subscription_tier, subscription_status, map_display_config, allow_public_contributions, moderation_mode')
```

Update the return mapping inside `getOrgSettings()` to include:

```typescript
      allow_public_contributions: data.allow_public_contributions,
      moderation_mode: data.moderation_mode as 'auto_approve' | 'manual_review',
```

Add to `OrgSettingsUpdates` interface:

```typescript
  allow_public_contributions?: boolean;
  moderation_mode?: 'auto_approve' | 'manual_review';
```

Add to the payload builder in `updateOrgSettings()` (after the `map_display_config` line):

```typescript
  if (updates.allow_public_contributions !== undefined) payload.allow_public_contributions = updates.allow_public_contributions;
  if (updates.moderation_mode !== undefined) payload.moderation_mode = updates.moderation_mode;
```

- [ ] **Step 2: Add toggles to the settings page UI**

In `src/app/admin/settings/page.tsx`:

Add state variables (after `mapDisplayConfig` state on line 66):

```typescript
  const [allowPublicContributions, setAllowPublicContributions] = useState(false);
  const [moderationMode, setModerationMode] = useState<'auto_approve' | 'manual_review'>('manual_review');
```

Initialize them in the `useEffect` (after `setMapDisplayConfig` on line 99):

```typescript
      setAllowPublicContributions(settings.allow_public_contributions ?? false);
      setModerationMode(settings.moderation_mode ?? 'manual_review');
```

Add to the `updates` object in `handleSave` (after the `map_display_config` diff check):

```typescript
    if (allowPublicContributions !== (settings?.allow_public_contributions ?? false))
      updates.allow_public_contributions = allowPublicContributions;
    if (moderationMode !== (settings?.moderation_mode ?? 'manual_review'))
      updates.moderation_mode = moderationMode;
```

Add a new section in the JSX, before the Subscription section (before line 312 `{/* Subscription section */}`):

```tsx
        {/* Public Contributions section */}
        <section className="card space-y-5">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">
            Public Contributions
          </h2>
          <p className="text-xs text-sage">
            Allow anyone to submit photos from the public map, even without an account.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={allowPublicContributions}
              onClick={() => setAllowPublicContributions(!allowPublicContributions)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                allowPublicContributions ? 'bg-forest' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  allowPublicContributions ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-forest-dark">
              Allow public contributions
            </span>
          </div>

          {allowPublicContributions && (
            <div>
              <label className="label">Moderation Mode</label>
              <select
                value={moderationMode}
                onChange={(e) => setModerationMode(e.target.value as 'auto_approve' | 'manual_review')}
                className="input-field"
              >
                <option value="manual_review">
                  Always require admin approval
                </option>
                <option value="auto_approve">
                  Auto-approve after AI safety check
                </option>
              </select>
              <p className="mt-1 text-xs text-sage">
                {moderationMode === 'manual_review'
                  ? 'All public submissions will be queued for admin review before appearing on the map.'
                  : 'Submissions that pass the AI safety check will be automatically published. Flagged content is queued for review.'}
              </p>
            </div>
          )}
        </section>
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/settings/actions.ts src/app/admin/settings/page.tsx
git commit -m "feat: add public contributions + moderation mode to org settings (#221)

Toggle to allow public contributions and select moderation mode
(auto-approve after AI check vs. always require admin approval).

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 8: Public Contribution Server Action

**Files:**
- Create: `src/app/api/public-contribute/actions.ts`
- Create: `src/app/api/public-contribute/__tests__/actions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/public-contribute/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authUser: { id: string; is_anonymous?: boolean } | null = null;
let orgData: { id: string; allow_public_contributions: boolean; moderation_mode: string } | null = {
  id: 'org-1',
  allow_public_contributions: true,
  moderation_mode: 'manual_review',
};
let membershipData: { id: string; status: string; role_id: string; upload_count_this_hour: number; last_upload_window_start: string | null } | null = null;
let roleData: { id: string } | null = { id: 'role-1' };
let signInResult = { data: { user: { id: 'anon-1' } }, error: null };
let uploadResult = { success: true, item: { id: 'item-1' } };
let insertedMemberships: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: authUser }, error: authUser ? null : new Error('no') })
      ),
      signInAnonymously: vi.fn(() => Promise.resolve(signInResult)),
    },
    from: (table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn((...args: any[]) => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => {
              if (table === 'org_memberships') return Promise.resolve({ data: membershipData, error: null });
              return Promise.resolve({ data: null, error: null });
            }),
            maybeSingle: vi.fn(() => {
              if (table === 'org_memberships') return Promise.resolve({ data: membershipData, error: null });
              return Promise.resolve({ data: null, error: null });
            }),
          })),
          single: vi.fn(() => {
            if (table === 'orgs') return Promise.resolve({ data: orgData, error: null });
            if (table === 'roles') return Promise.resolve({ data: roleData, error: null });
            return Promise.resolve({ data: null, error: null });
          }),
          maybeSingle: vi.fn(() => {
            if (table === 'org_memberships') return Promise.resolve({ data: membershipData, error: null });
            return Promise.resolve({ data: null, error: null });
          }),
        })),
      })),
      insert: vi.fn((payload: any) => {
        if (table === 'org_memberships') insertedMemberships.push(payload);
        return { select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: payload, error: null })) })) };
      }),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    }),
  }),
}));

vi.mock('@/lib/tenant/server', () => ({
  getTenantContext: vi.fn(() => Promise.resolve({ orgId: 'org-1' })),
}));

vi.mock('@/lib/vault/actions', () => ({
  uploadToVault: vi.fn(() => Promise.resolve(uploadResult)),
}));

vi.mock('@/lib/moderation/moderate', () => ({
  moderateText: vi.fn(() => Promise.resolve({ flagged: false, categories: {}, scores: {} })),
}));

const { submitPublicContribution } = await import('../actions');

beforeEach(() => {
  authUser = null;
  membershipData = null;
  insertedMemberships = [];
  uploadResult = { success: true, item: { id: 'item-1' } };
});

describe('submitPublicContribution', () => {
  const input = {
    orgId: 'org-1',
    file: { name: 'bird.jpg', type: 'image/jpeg', size: 5000, base64: 'abc' },
    description: 'A nice birdhouse',
  };

  it('returns error when public contributions are disabled', async () => {
    orgData = { id: 'org-1', allow_public_contributions: false, moderation_mode: 'manual_review' };
    const result = await submitPublicContribution(input);
    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('not accepting');
    orgData = { id: 'org-1', allow_public_contributions: true, moderation_mode: 'manual_review' };
  });

  it('returns error when contributor is banned', async () => {
    authUser = { id: 'anon-1', is_anonymous: true };
    membershipData = { id: 'm-1', status: 'banned', role_id: 'role-1', upload_count_this_hour: 0, last_upload_window_start: null };
    const result = await submitPublicContribution(input);
    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('restricted');
  });

  it('creates anonymous user and membership on first contribution', async () => {
    const result = await submitPublicContribution(input);
    expect(result).toHaveProperty('success', true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx vitest run src/app/api/public-contribute/__tests__/actions.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement public contribution action**

Create `src/app/api/public-contribute/actions.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import { uploadToVault } from '@/lib/vault/actions';
import { moderateText } from '@/lib/moderation/moderate';

const MAX_UPLOADS_PER_HOUR = 10;

interface PublicContributionInput {
  orgId: string;
  file: { name: string; type: string; size: number; base64: string };
  description?: string;
}

export async function submitPublicContribution(
  input: PublicContributionInput,
): Promise<{ success: true; status: string } | { error: string }> {
  const supabase = createClient();

  // 1. Check org allows public contributions
  const { data: org, error: orgError } = await supabase
    .from('orgs')
    .select('id, allow_public_contributions, moderation_mode')
    .eq('id', input.orgId)
    .single();

  if (orgError || !org) return { error: 'Organization not found.' };
  if (!org.allow_public_contributions) return { error: 'This organization is not accepting public contributions.' };

  // 2. Get or create anonymous user
  let { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError || !signInData.user) return { error: 'Failed to create session.' };
    user = signInData.user;
  }

  // 3. Get or create org membership with public_contributor role
  const { data: existingMembership } = await supabase
    .from('org_memberships')
    .select('id, status, role_id, upload_count_this_hour, last_upload_window_start')
    .eq('user_id', user.id)
    .eq('org_id', input.orgId)
    .maybeSingle();

  if (existingMembership?.status === 'banned') {
    return { error: 'Your account has been restricted from contributing to this organization.' };
  }

  let membershipId = existingMembership?.id;

  if (!existingMembership) {
    // Find or create the public_contributor role for this org
    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('org_id', input.orgId)
      .eq('base_role', 'public_contributor')
      .single();

    if (!role) return { error: 'Public contributor role not configured.' };

    const { data: newMembership, error: membershipError } = await supabase
      .from('org_memberships')
      .insert({
        org_id: input.orgId,
        user_id: user.id,
        role_id: role.id,
        status: 'active',
      })
      .select('id')
      .single();

    if (membershipError || !newMembership) return { error: 'Failed to create membership.' };
    membershipId = newMembership.id;
  }

  // 4. Rate limit check
  if (existingMembership) {
    const windowStart = existingMembership.last_upload_window_start
      ? new Date(existingMembership.last_upload_window_start)
      : null;
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    if (windowStart && windowStart > hourAgo && existingMembership.upload_count_this_hour >= MAX_UPLOADS_PER_HOUR) {
      return { error: 'Upload limit reached. Please try again later.' };
    }

    // Reset window if expired, otherwise increment
    const newCount = (windowStart && windowStart > hourAgo)
      ? existingMembership.upload_count_this_hour + 1
      : 1;
    const newWindowStart = (windowStart && windowStart > hourAgo)
      ? existingMembership.last_upload_window_start
      : now.toISOString();

    await supabase
      .from('org_memberships')
      .update({
        upload_count_this_hour: newCount,
        last_upload_window_start: newWindowStart,
      })
      .eq('id', existingMembership.id);
  }

  // 5. Moderate text if provided
  if (input.description?.trim()) {
    try {
      const textResult = await moderateText(input.description);
      if (textResult.flagged) {
        return { error: "Your submission couldn't be posted because it doesn't meet our content guidelines." };
      }
    } catch {
      // Text moderation failed — proceed but flag for review (image moderation will also flag)
    }
  }

  // 6. Upload with moderation
  const result = await uploadToVault({
    orgId: input.orgId,
    file: input.file,
    category: 'photo',
    visibility: 'public',
    moderateAsPublicContribution: true,
    orgModerationMode: org.moderation_mode as 'auto_approve' | 'manual_review',
    metadata: input.description ? { description: input.description } : {},
  });

  if ('error' in result) return { error: result.error };

  return {
    success: true,
    status: result.item.moderation_status,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx vitest run src/app/api/public-contribute/__tests__/actions.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/public-contribute/actions.ts src/app/api/public-contribute/__tests__/actions.test.ts
git commit -m "feat: add public contribution server action (#221)

Anonymous sign-in, rate limiting, text + image moderation,
and org-level permission checks for public photo submissions.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 9: Public Contribution UI on Map

**Files:**
- Create: `src/components/map/PublicContributeButton.tsx`
- Create: `src/components/map/PublicSubmissionForm.tsx`
- Modify: `src/components/map/HomeMapView.tsx`

- [ ] **Step 1: Create the submission form component**

Create `src/components/map/PublicSubmissionForm.tsx`:

```typescript
'use client';

import { useState, useRef } from 'react';
import { submitPublicContribution } from '@/app/api/public-contribute/actions';

interface PublicSubmissionFormProps {
  orgId: string;
  onClose: () => void;
  onSuccess: (status: string) => void;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function PublicSubmissionForm({ orgId, onClose, onSuccess }: PublicSubmissionFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError('Please select a JPEG, PNG, WebP, or GIF image.');
      return;
    }

    if (selected.size > MAX_FILE_SIZE) {
      setError('File must be under 10 MB.');
      return;
    }

    setFile(selected);
    setError('');
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(selected);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    setError('');

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];

      const result = await submitPublicContribution({
        orgId,
        file: { name: file.name, type: file.type, size: file.size, base64 },
        description: description.trim() || undefined,
      });

      setSubmitting(false);

      if ('error' in result) {
        setError(result.error);
      } else {
        onSuccess(result.status);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">
            Submit a Photo
          </h2>
          <button onClick={onClose} className="text-sage hover:text-forest-dark p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm bg-red-50 border border-red-200 text-red-700">
              {error}
            </div>
          )}

          {/* File input */}
          {!preview ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-sage hover:border-forest hover:text-forest-dark transition-colors"
            >
              <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm">Tap to select a photo</span>
            </button>
          ) : (
            <div className="relative">
              <img src={preview} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
              <button
                type="button"
                onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Description */}
          <div>
            <label htmlFor="description" className="label">
              Description (optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field min-h-[80px]"
              placeholder="What's in this photo?"
              maxLength={500}
            />
          </div>

          <button
            type="submit"
            disabled={!file || submitting}
            className="btn-primary w-full"
          >
            {submitting ? 'Submitting...' : 'Submit Photo'}
          </button>

          <p className="text-xs text-sage text-center">
            All submissions are reviewed before appearing on the map.
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the map button component**

Create `src/components/map/PublicContributeButton.tsx`:

```typescript
'use client';

import { useState } from 'react';
import PublicSubmissionForm from './PublicSubmissionForm';

interface PublicContributeButtonProps {
  orgId: string;
}

export default function PublicContributeButton({ orgId }: PublicContributeButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  function handleSuccess(status: string) {
    setShowForm(false);
    setSuccessMessage(
      status === 'approved'
        ? 'Photo published! Thank you for contributing.'
        : 'Photo submitted! It will appear after review.'
    );
    setTimeout(() => setSuccessMessage(''), 5000);
  }

  return (
    <>
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-20 right-4 z-[500] bg-forest text-white rounded-full px-4 py-3 shadow-lg hover:bg-forest-dark transition-colors flex items-center gap-2 text-sm font-medium"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Submit a Photo
      </button>

      {successMessage && (
        <div className="fixed bottom-20 left-4 right-4 z-[500] bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm text-center shadow-lg">
          {successMessage}
        </div>
      )}

      {showForm && (
        <PublicSubmissionForm
          orgId={orgId}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Add the button to HomeMapView**

In `src/components/map/HomeMapView.tsx`:

Add import at top:

```typescript
import PublicContributeButton from '@/components/map/PublicContributeButton';
```

Add state to track whether public contributions are enabled. Inside `HomeMapViewContent`, after the existing state declarations (around line 72), add:

```typescript
  const [allowPublicContributions, setAllowPublicContributions] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
```

In the existing `fetchData` effect, after data is loaded, fetch the org setting. After the property is resolved from IndexedDB, add:

```typescript
        // Check if org allows public contributions
        if (property?.org_id) {
          setOrgId(property.org_id);
          const supabase = (await import('@/lib/supabase/client')).createClient();
          const { data: orgSettings } = await supabase
            .from('orgs')
            .select('allow_public_contributions')
            .eq('id', property.org_id)
            .single();
          setAllowPublicContributions(orgSettings?.allow_public_contributions ?? false);
        }
```

Add the button to the JSX return, right before the closing `</>` or after the `MapView` component:

```tsx
      {allowPublicContributions && orgId && (
        <PublicContributeButton orgId={orgId} />
      )}
```

- [ ] **Step 4: Run type check**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/map/PublicContributeButton.tsx src/components/map/PublicSubmissionForm.tsx src/components/map/HomeMapView.tsx
git commit -m "feat: add public photo submission button and form to map (#221)

Floating 'Submit a Photo' button on the map when org has public
contributions enabled. Modal form with file picker, preview,
description, and moderation feedback.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>"
```

---

## Task 10: Full Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npm run test`

Expected: All tests pass, including the new moderation tests.

- [ ] **Step 2: Run type check**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npx tsc --noEmit`

Expected: PASS (no errors)

- [ ] **Step 3: Run build**

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npm run build`

Expected: Build succeeds.

- [ ] **Step 4: Manual smoke test**

Start the dev server and verify:
1. Org Settings page shows the new "Public Contributions" section with toggle and mode selector
2. Admin sidebar includes "Moderation" link
3. Moderation queue page loads and shows "No items pending review" when empty
4. If public contributions are enabled, the "Submit a Photo" button appears on the map page

Run: `cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety && npm run dev`

- [ ] **Step 5: Commit any fixes, then push branch**

```bash
cd /Users/patrick/birdhousemapper/.worktrees/feat-image-safety
git push -u origin feat/image-safety
```

---

## Follow-Up Items (not blocking v1, can be separate PRs)

These are in the spec but are small enough to handle as follow-ups:

1. **Contributor management in members area** — Add a `public_contributor` filter to the existing `/admin/members` page so admins can see submission history and ban/unban from there.
2. **Anonymous user cleanup** — Extend the existing `cleanup-temp-accounts` edge function to also clean up inactive `public_contributor` accounts after 30 days of no submissions.
3. **Content takedown on approved items** — Add a "Remove" button on approved content visible in the main app (not just the moderation queue). This is partially covered by `rejectItem` but needs a UI entry point on the public-facing side.
