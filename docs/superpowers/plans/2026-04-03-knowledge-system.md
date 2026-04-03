# Knowledge System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a knowledge/howto system where orgs can create rich text articles with embedded images, attach vault files, link to items/updates/entities, embed in Puck pages, and auto-include in AI context.

**Architecture:** A new `knowledge_items` table (separate from vault) stores authored articles with TipTap JSON + pre-rendered HTML. A standalone TipTap editor in `src/lib/editor/` is decoupled from Puck. Junction tables link knowledge to items, updates, and entities. Two Puck components (KnowledgeEmbed, KnowledgeList) render knowledge on public pages. AI context integration includes knowledge body text directly (no Claude analysis needed).

**Tech Stack:** Next.js 14, Supabase (PostgreSQL + RLS + Storage), TipTap (`@tiptap/react` + extensions), Tailwind CSS, Vitest

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/029_knowledge_system.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- =============================================================
-- 029_knowledge_system.sql — Knowledge items, attachments, linking
-- =============================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table knowledge_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  title text not null,
  slug text not null,
  body jsonb,
  body_html text,
  excerpt text,
  cover_image_url text,
  tags text[] not null default '{}',
  visibility text not null default 'org' check (visibility in ('org', 'public')),
  is_ai_context boolean not null default true,
  ai_priority integer,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index idx_knowledge_items_org on knowledge_items(org_id);
create index idx_knowledge_items_tags on knowledge_items using gin (tags);
create index idx_knowledge_items_ai on knowledge_items(org_id, is_ai_context) where is_ai_context = true;

-- Attachments (vault file references)
create table knowledge_attachments (
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  vault_item_id uuid not null references vault_items(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (knowledge_item_id, vault_item_id)
);

-- Junction tables for linking
create table knowledge_item_items (
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (knowledge_item_id, item_id)
);

create table knowledge_item_updates (
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  update_id uuid not null references item_updates(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (knowledge_item_id, update_id)
);

create table knowledge_item_entities (
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (knowledge_item_id, entity_id)
);

-- ---------------------------------------------------------------------------
-- 2. Auto-update updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function update_knowledge_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_knowledge_items_updated_at
before update on knowledge_items
for each row execute function update_knowledge_items_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS Policies — knowledge_items
-- ---------------------------------------------------------------------------

alter table knowledge_items enable row level security;

-- All org members can read
create policy knowledge_items_select on knowledge_items
  for select using (org_id in (select user_active_org_ids()));

-- Public visibility items readable by anyone (for Puck pages)
create policy knowledge_items_select_public on knowledge_items
  for select using (visibility = 'public');

-- Staff+ can create (org_admin or org_staff)
create policy knowledge_items_insert on knowledge_items
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- Staff+ can update
create policy knowledge_items_update on knowledge_items
  for update using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- Admins only can delete
create policy knowledge_items_delete on knowledge_items
  for delete using (org_id in (select user_org_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- 4. RLS Policies — knowledge_attachments
-- ---------------------------------------------------------------------------

alter table knowledge_attachments enable row level security;

create policy knowledge_attach_select on knowledge_attachments
  for select using (
    knowledge_item_id in (select id from knowledge_items where org_id in (select user_active_org_ids()))
  );

create policy knowledge_attach_insert on knowledge_attachments
  for insert with check (
    knowledge_item_id in (
      select ki.id from knowledge_items ki
      where exists (
        select 1 from org_memberships om
        join roles rl on rl.id = om.role_id
        where om.org_id = ki.org_id
          and om.user_id = auth.uid()
          and om.status = 'active'
          and rl.base_role in ('org_admin', 'org_staff')
      )
    )
  );

create policy knowledge_attach_delete on knowledge_attachments
  for delete using (
    knowledge_item_id in (
      select ki.id from knowledge_items ki
      where exists (
        select 1 from org_memberships om
        join roles rl on rl.id = om.role_id
        where om.org_id = ki.org_id
          and om.user_id = auth.uid()
          and om.status = 'active'
          and rl.base_role in ('org_admin', 'org_staff')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. RLS Policies — junction tables (all three follow same pattern)
-- ---------------------------------------------------------------------------

alter table knowledge_item_items enable row level security;

create policy ki_items_select on knowledge_item_items
  for select using (org_id in (select user_active_org_ids()));

create policy ki_items_insert on knowledge_item_items
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy ki_items_delete on knowledge_item_items
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

alter table knowledge_item_updates enable row level security;

create policy ki_updates_select on knowledge_item_updates
  for select using (org_id in (select user_active_org_ids()));

create policy ki_updates_insert on knowledge_item_updates
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_updates.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy ki_updates_delete on knowledge_item_updates
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_updates.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

alter table knowledge_item_entities enable row level security;

create policy ki_entities_select on knowledge_item_entities
  for select using (org_id in (select user_active_org_ids()));

create policy ki_entities_insert on knowledge_item_entities
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_entities.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy ki_entities_delete on knowledge_item_entities
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = knowledge_item_entities.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );
```

- [ ] **Step 2: Verify migration syntax**

Run: `cat supabase/migrations/029_knowledge_system.sql | head -5`
Expected: Shows the migration header comment.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/029_knowledge_system.sql
git commit -m "feat(knowledge): add database migration for knowledge system"
```

---

### Task 2: Types and Helpers

**Files:**
- Create: `src/lib/knowledge/types.ts`
- Create: `src/lib/knowledge/helpers.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/lib/knowledge/types.ts

import type { JSONContent } from '@tiptap/core';

export type KnowledgeVisibility = 'org' | 'public';

export interface KnowledgeItem {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  body: JSONContent | null;
  body_html: string | null;
  excerpt: string | null;
  cover_image_url: string | null;
  tags: string[];
  visibility: KnowledgeVisibility;
  is_ai_context: boolean;
  ai_priority: number | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateKnowledgeInput {
  orgId: string;
  title: string;
  body?: JSONContent;
  bodyHtml?: string;
  excerpt?: string;
  coverImageUrl?: string;
  tags?: string[];
  visibility?: KnowledgeVisibility;
  isAiContext?: boolean;
  aiPriority?: number;
}

export interface UpdateKnowledgeInput {
  title?: string;
  body?: JSONContent;
  bodyHtml?: string;
  excerpt?: string;
  coverImageUrl?: string;
  tags?: string[];
  visibility?: KnowledgeVisibility;
  isAiContext?: boolean;
  aiPriority?: number;
}

export interface KnowledgeFilters {
  search?: string;
  tags?: string[];
  visibility?: KnowledgeVisibility;
  isAiContext?: boolean;
}
```

Note: `JSONContent` comes from `@tiptap/core` which will be installed in Task 4. Until then, the import won't resolve — that's fine, it will resolve after the npm install step.

- [ ] **Step 2: Write the helpers file**

```typescript
// src/lib/knowledge/helpers.ts

/**
 * Generate a URL-friendly slug from a title.
 * Appends a short random suffix to avoid collisions.
 */
export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/**
 * Strip HTML tags and extract plain text excerpt.
 */
export function generateExcerpt(html: string, maxLength = 200): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s\S*$/, '') + '…';
}

/**
 * Strip HTML to plain text for AI context inclusion.
 */
export function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 3: Write tests for helpers**

Create file `src/lib/knowledge/__tests__/helpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateSlug, generateExcerpt, htmlToPlainText } from '../helpers';

describe('generateSlug', () => {
  it('converts title to lowercase slug with suffix', () => {
    const slug = generateSlug('How to Clean Birdhouses');
    expect(slug).toMatch(/^how-to-clean-birdhouses-[a-z0-9]{4}$/);
  });

  it('strips special characters', () => {
    const slug = generateSlug('BirdBox Plans & Specs!');
    expect(slug).toMatch(/^birdbox-plans-specs-[a-z0-9]{4}$/);
  });

  it('truncates long titles to 60 chars before suffix', () => {
    const longTitle = 'A'.repeat(100);
    const slug = generateSlug(longTitle);
    // 60 chars of a's + dash + 4 char suffix = 65
    expect(slug.length).toBeLessThanOrEqual(65);
  });
});

describe('generateExcerpt', () => {
  it('strips HTML and truncates', () => {
    const html = '<p>This is a <strong>test</strong> paragraph.</p>';
    expect(generateExcerpt(html, 20)).toBe('This is a test…');
  });

  it('returns full text if under maxLength', () => {
    const html = '<p>Short text.</p>';
    expect(generateExcerpt(html)).toBe('Short text.');
  });
});

describe('htmlToPlainText', () => {
  it('strips all HTML tags', () => {
    const html = '<h2>Title</h2><p>Body with <a href="#">link</a></p>';
    expect(htmlToPlainText(html)).toBe('Title Body with link');
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/knowledge/__tests__/helpers.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/types.ts src/lib/knowledge/helpers.ts src/lib/knowledge/__tests__/helpers.test.ts
git commit -m "feat(knowledge): add types and helper utilities"
```

---

### Task 3: Server Actions — CRUD

**Files:**
- Create: `src/lib/knowledge/actions.ts`
- Create: `src/lib/knowledge/__tests__/actions.test.ts`

- [ ] **Step 1: Write the test file for CRUD actions**

Create file `src/lib/knowledge/__tests__/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Control auth user
let authUser: { id: string } | null = { id: 'user-123' };

// Track DB operations
let insertedRows: { table: string; payload: Record<string, unknown> }[] = [];
let updatedRows: { table: string; updates: Record<string, unknown> }[] = [];
let deletedRows: { table: string }[] = [];
let insertError: Error | null = null;
let updateError: Error | null = null;
let deleteError: Error | null = null;

// Fake items for select queries
let fakeSelectData: Record<string, unknown>[] | null = null;
let fakeSingleData: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: authUser },
          error: authUser ? null : new Error('Not authenticated'),
        })
      ),
    },
    from: (table: string) => {
      const chainable = {
        select: vi.fn(() => chainable),
        insert: vi.fn((payload: any) => {
          if (insertError) {
            return { select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: insertError })) })) };
          }
          insertedRows.push({ table, payload });
          return {
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: { id: 'new-id', ...payload }, error: null })),
            })),
          };
        }),
        update: vi.fn((updates: any) => {
          if (updateError) {
            return { eq: vi.fn(() => Promise.resolve({ error: updateError })) };
          }
          updatedRows.push({ table, updates });
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        }),
        delete: vi.fn(() => {
          if (deleteError) {
            return { eq: vi.fn(() => Promise.resolve({ error: deleteError })) };
          }
          deletedRows.push({ table });
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        }),
        eq: vi.fn(() => chainable),
        ilike: vi.fn(() => chainable),
        overlaps: vi.fn(() => chainable),
        order: vi.fn(() => chainable),
        single: vi.fn(() => Promise.resolve({ data: fakeSingleData, error: fakeSingleData ? null : new Error('Not found') })),
      };
      // For select chains that return arrays
      chainable.select = vi.fn(() => ({
        ...chainable,
        eq: vi.fn(() => ({
          ...chainable,
          single: vi.fn(() => Promise.resolve({ data: fakeSingleData, error: fakeSingleData ? null : new Error('Not found') })),
        })),
        then: vi.fn((cb: any) => cb({ data: fakeSelectData ?? [], error: null })),
      }));
      return chainable;
    },
  }),
}));

beforeEach(() => {
  authUser = { id: 'user-123' };
  insertedRows = [];
  updatedRows = [];
  deletedRows = [];
  insertError = null;
  updateError = null;
  deleteError = null;
  fakeSelectData = null;
  fakeSingleData = null;
});

describe('createKnowledgeItem', () => {
  it('returns error when not authenticated', async () => {
    authUser = null;
    const { createKnowledgeItem } = await import('../actions');
    const result = await createKnowledgeItem({ orgId: 'org-1', title: 'Test' });
    expect(result).toHaveProperty('error', 'Not authenticated.');
  });

  it('inserts a knowledge item with generated slug', async () => {
    const { createKnowledgeItem } = await import('../actions');
    const result = await createKnowledgeItem({
      orgId: 'org-1',
      title: 'How to Clean Birdhouses',
      tags: ['maintenance'],
    });
    expect(result).toHaveProperty('success', true);
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0].table).toBe('knowledge_items');
    expect(insertedRows[0].payload).toMatchObject({
      org_id: 'org-1',
      title: 'How to Clean Birdhouses',
      tags: ['maintenance'],
      created_by: 'user-123',
      updated_by: 'user-123',
    });
  });

  it('returns error when insert fails', async () => {
    insertError = new Error('Duplicate slug');
    const { createKnowledgeItem } = await import('../actions');
    const result = await createKnowledgeItem({ orgId: 'org-1', title: 'Test' });
    expect(result).toHaveProperty('error');
  });
});

describe('deleteKnowledgeItem', () => {
  it('returns error when not authenticated', async () => {
    authUser = null;
    const { deleteKnowledgeItem } = await import('../actions');
    const result = await deleteKnowledgeItem('item-1');
    expect(result).toHaveProperty('error', 'Not authenticated.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/knowledge/__tests__/actions.test.ts`
Expected: FAIL — `../actions` module not found.

- [ ] **Step 3: Write the CRUD server actions**

Create file `src/lib/knowledge/actions.ts`:

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import type { KnowledgeItem, CreateKnowledgeInput, UpdateKnowledgeInput, KnowledgeFilters } from './types';
import { generateSlug } from './helpers';

export async function createKnowledgeItem(
  input: CreateKnowledgeInput
): Promise<{ success: true; item: KnowledgeItem } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const slug = generateSlug(input.title);

  const { data: item, error: insertError } = await supabase
    .from('knowledge_items')
    .insert({
      org_id: input.orgId,
      title: input.title,
      slug,
      body: input.body ?? null,
      body_html: input.bodyHtml ?? null,
      excerpt: input.excerpt ?? null,
      cover_image_url: input.coverImageUrl ?? null,
      tags: input.tags ?? [],
      visibility: input.visibility ?? 'org',
      is_ai_context: input.isAiContext ?? true,
      ai_priority: input.aiPriority ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('*')
    .single();

  if (insertError || !item) {
    return { error: `Failed to create knowledge item: ${insertError?.message ?? 'unknown'}` };
  }

  return { success: true, item: item as KnowledgeItem };
}

export async function updateKnowledgeItem(
  id: string,
  updates: UpdateKnowledgeInput
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const dbUpdates: Record<string, unknown> = { updated_by: user.id };
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.body !== undefined) dbUpdates.body = updates.body;
  if (updates.bodyHtml !== undefined) dbUpdates.body_html = updates.bodyHtml;
  if (updates.excerpt !== undefined) dbUpdates.excerpt = updates.excerpt;
  if (updates.coverImageUrl !== undefined) dbUpdates.cover_image_url = updates.coverImageUrl;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.visibility !== undefined) dbUpdates.visibility = updates.visibility;
  if (updates.isAiContext !== undefined) dbUpdates.is_ai_context = updates.isAiContext;
  if (updates.aiPriority !== undefined) dbUpdates.ai_priority = updates.aiPriority;

  const { error } = await supabase
    .from('knowledge_items')
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function deleteKnowledgeItem(
  id: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'Not authenticated.' };
  }

  const { error } = await supabase
    .from('knowledge_items')
    .delete()
    .eq('id', id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function getKnowledgeItem(
  idOrSlug: string,
  orgId?: string
): Promise<{ item: KnowledgeItem | null; error: string | null }> {
  const supabase = createClient();

  // Try by ID first (UUID format), then by slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  let query = supabase.from('knowledge_items').select('*');

  if (isUuid) {
    query = query.eq('id', idOrSlug);
  } else {
    query = query.eq('slug', idOrSlug);
    if (orgId) query = query.eq('org_id', orgId);
  }

  const { data, error } = await query.single();

  if (error) {
    return { item: null, error: error.message };
  }

  return { item: data as KnowledgeItem, error: null };
}

export async function getKnowledgeItems(
  orgId: string,
  filters?: KnowledgeFilters
): Promise<{ items: KnowledgeItem[]; error: string | null }> {
  const supabase = createClient();

  let query = supabase
    .from('knowledge_items')
    .select('*')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (filters?.search) {
    query = query.ilike('title', `%${filters.search}%`);
  }
  if (filters?.tags && filters.tags.length > 0) {
    query = query.overlaps('tags', filters.tags);
  }
  if (filters?.visibility) {
    query = query.eq('visibility', filters.visibility);
  }
  if (filters?.isAiContext !== undefined) {
    query = query.eq('is_ai_context', filters.isAiContext);
  }

  const { data, error } = await query;

  if (error) {
    return { items: [], error: error.message };
  }

  return { items: (data ?? []) as KnowledgeItem[], error: null };
}

// ---------------------------------------------------------------------------
// Linking actions
// ---------------------------------------------------------------------------

export async function linkKnowledgeToItem(
  knowledgeItemId: string,
  itemId: string,
  orgId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_items')
    .insert({ knowledge_item_id: knowledgeItemId, item_id: itemId, org_id: orgId });
  if (error) return { error: error.message };
  return { success: true };
}

export async function unlinkKnowledgeFromItem(
  knowledgeItemId: string,
  itemId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_items')
    .delete()
    .eq('knowledge_item_id', knowledgeItemId)
    .eq('item_id', itemId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function linkKnowledgeToUpdate(
  knowledgeItemId: string,
  updateId: string,
  orgId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_updates')
    .insert({ knowledge_item_id: knowledgeItemId, update_id: updateId, org_id: orgId });
  if (error) return { error: error.message };
  return { success: true };
}

export async function unlinkKnowledgeFromUpdate(
  knowledgeItemId: string,
  updateId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_updates')
    .delete()
    .eq('knowledge_item_id', knowledgeItemId)
    .eq('update_id', updateId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function linkKnowledgeToEntity(
  knowledgeItemId: string,
  entityId: string,
  orgId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_entities')
    .insert({ knowledge_item_id: knowledgeItemId, entity_id: entityId, org_id: orgId });
  if (error) return { error: error.message };
  return { success: true };
}

export async function unlinkKnowledgeFromEntity(
  knowledgeItemId: string,
  entityId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_item_entities')
    .delete()
    .eq('knowledge_item_id', knowledgeItemId)
    .eq('entity_id', entityId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function getLinkedKnowledge(
  targetType: 'item' | 'update' | 'entity',
  targetId: string
): Promise<{ items: KnowledgeItem[]; error: string | null }> {
  const supabase = createClient();

  const tableMap = {
    item: { table: 'knowledge_item_items', fk: 'item_id' },
    update: { table: 'knowledge_item_updates', fk: 'update_id' },
    entity: { table: 'knowledge_item_entities', fk: 'entity_id' },
  };

  const { table, fk } = tableMap[targetType];

  const { data: links, error: linkError } = await supabase
    .from(table)
    .select('knowledge_item_id')
    .eq(fk, targetId);

  if (linkError) {
    return { items: [], error: linkError.message };
  }

  if (!links || links.length === 0) {
    return { items: [], error: null };
  }

  const ids = links.map((l: any) => l.knowledge_item_id);
  const { data, error } = await supabase
    .from('knowledge_items')
    .select('*')
    .in('id', ids)
    .order('updated_at', { ascending: false });

  if (error) {
    return { items: [], error: error.message };
  }

  return { items: (data ?? []) as KnowledgeItem[], error: null };
}

// ---------------------------------------------------------------------------
// Attachment actions
// ---------------------------------------------------------------------------

export async function addAttachment(
  knowledgeItemId: string,
  vaultItemId: string,
  sortOrder = 0
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_attachments')
    .insert({ knowledge_item_id: knowledgeItemId, vault_item_id: vaultItemId, sort_order: sortOrder });
  if (error) return { error: error.message };
  return { success: true };
}

export async function removeAttachment(
  knowledgeItemId: string,
  vaultItemId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('knowledge_attachments')
    .delete()
    .eq('knowledge_item_id', knowledgeItemId)
    .eq('vault_item_id', vaultItemId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function reorderAttachments(
  knowledgeItemId: string,
  orderedVaultItemIds: string[]
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();

  for (let i = 0; i < orderedVaultItemIds.length; i++) {
    const { error } = await supabase
      .from('knowledge_attachments')
      .update({ sort_order: i })
      .eq('knowledge_item_id', knowledgeItemId)
      .eq('vault_item_id', orderedVaultItemIds[i]);

    if (error) {
      return { error: error.message };
    }
  }

  return { success: true };
}

export async function getAttachments(
  knowledgeItemId: string
): Promise<{ attachments: Array<{ vault_item_id: string; sort_order: number; file_name: string; mime_type: string | null; file_size: number }>; error: string | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('knowledge_attachments')
    .select('vault_item_id, sort_order, vault_items(file_name, mime_type, file_size)')
    .eq('knowledge_item_id', knowledgeItemId)
    .order('sort_order', { ascending: true });

  if (error) {
    return { attachments: [], error: error.message };
  }

  const attachments = (data ?? []).map((row: any) => ({
    vault_item_id: row.vault_item_id,
    sort_order: row.sort_order,
    file_name: row.vault_items?.file_name ?? '',
    mime_type: row.vault_items?.mime_type ?? null,
    file_size: row.vault_items?.file_size ?? 0,
  }));

  return { attachments, error: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/knowledge/__tests__/actions.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/actions.ts src/lib/knowledge/__tests__/actions.test.ts
git commit -m "feat(knowledge): add server actions for CRUD, linking, and attachments"
```

---

### Task 4: Install TipTap Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install TipTap packages**

Run:
```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-text-align @tiptap/extension-link @tiptap/extension-image @tiptap/extension-placeholder @tiptap/pm @tiptap/html
```

Note: `@tiptap/pm` provides ProseMirror peer deps. `@tiptap/html` provides `generateHTML()` for server-side HTML generation.

- [ ] **Step 2: Verify installation**

Run: `npm ls @tiptap/react`
Expected: Shows `@tiptap/react` in the dependency tree.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(knowledge): add TipTap editor dependencies"
```

---

### Task 5: Rich Text Editor — VaultImage Extension

**Files:**
- Create: `src/lib/editor/types.ts`
- Create: `src/lib/editor/VaultImageExtension.ts`

- [ ] **Step 1: Create editor types**

```typescript
// src/lib/editor/types.ts

import type { JSONContent } from '@tiptap/core';

export type { JSONContent } from '@tiptap/core';

export interface RichTextEditorProps {
  content: JSONContent | null;
  onChange: (json: JSONContent) => void;
  orgId: string;
  editable?: boolean;
}
```

- [ ] **Step 2: Create the VaultImage TipTap extension**

```typescript
// src/lib/editor/VaultImageExtension.ts

import Image from '@tiptap/extension-image';

/**
 * Custom TipTap Image extension that stores a vault item ID
 * alongside the standard src/alt attributes.
 */
export const VaultImage = Image.extend({
  name: 'vaultImage',

  addAttributes() {
    return {
      ...this.parent?.(),
      vaultItemId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-vault-item-id'),
        renderHTML: (attributes) => {
          if (!attributes.vaultItemId) return {};
          return { 'data-vault-item-id': attributes.vaultItemId };
        },
      },
    };
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/editor/types.ts src/lib/editor/VaultImageExtension.ts
git commit -m "feat(editor): add types and VaultImage TipTap extension"
```

---

### Task 6: Rich Text Editor — Extensions Config

**Files:**
- Create: `src/lib/editor/extensions.ts`

- [ ] **Step 1: Create the extensions configuration**

```typescript
// src/lib/editor/extensions.ts

import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { VaultImage } from './VaultImageExtension';

export function getEditorExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    VaultImage,
    Placeholder.configure({
      placeholder: placeholder ?? 'Start writing…',
    }),
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/editor/extensions.ts
git commit -m "feat(editor): add TipTap extensions configuration"
```

---

### Task 7: Rich Text Editor — RichTextEditor Component

**Files:**
- Create: `src/lib/editor/RichTextEditor.tsx`

- [ ] **Step 1: Create the editor component**

```tsx
// src/lib/editor/RichTextEditor.tsx

'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import { useCallback, useState } from 'react';
import { getEditorExtensions } from './extensions';
import { uploadToVault } from '@/lib/vault/actions';
import VaultPicker from '@/components/vault/VaultPicker';
import type { VaultItem } from '@/lib/vault/types';
import type { RichTextEditorProps } from './types';

export default function RichTextEditor({ content, onChange, orgId, editable = true }: RichTextEditorProps) {
  const [showVaultPicker, setShowVaultPicker] = useState(false);

  const editor = useEditor({
    extensions: getEditorExtensions(),
    content: content ?? undefined,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-base max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) handleImageUpload(file);
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!editor) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await uploadToVault({
          orgId,
          file: { name: file.name, type: file.type, size: file.size, base64 },
          category: 'photo',
          visibility: 'public',
        });

        if ('success' in result) {
          const url = result.item.storage_bucket === 'vault-public'
            ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vault-public/${result.item.storage_path}`
            : result.item.storage_path;

          editor
            .chain()
            .focus()
            .setImage({ src: url, alt: file.name })
            .run();

          // Update the vaultItemId attribute
          const { state } = editor;
          const { doc } = state;
          doc.descendants((node, pos) => {
            if (node.type.name === 'vaultImage' && node.attrs.src === url && !node.attrs.vaultItemId) {
              editor.view.dispatch(
                state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  vaultItemId: result.item.id,
                })
              );
            }
          });
        }
      };
      reader.readAsDataURL(file);
    },
    [editor, orgId]
  );

  function handleVaultSelect(items: VaultItem[]) {
    if (!editor || items.length === 0) return;
    const item = items[0];

    const url = item.storage_bucket === 'vault-public'
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vault-public/${item.storage_path}`
      : item.storage_path;

    editor
      .chain()
      .focus()
      .setImage({ src: url, alt: item.file_name })
      .run();

    setShowVaultPicker(false);
  }

  if (!editor) return null;

  return (
    <div className="border border-sage-light rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      {editable && (
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-sage-light bg-parchment/50">
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <span className="underline">U</span>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <span className="line-through">S</span>
          </ToolbarButton>

          <div className="w-px bg-sage-light mx-1" />

          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 4 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            title="Heading 4"
          >
            H4
          </ToolbarButton>

          <div className="w-px bg-sage-light mx-1" />

          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            •
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered List"
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            &ldquo;
          </ToolbarButton>

          <div className="w-px bg-sage-light mx-1" />

          <ToolbarButton
            active={false}
            onClick={() => {
              const url = window.prompt('Enter URL:');
              if (url) editor.chain().focus().setLink({ href: url }).run();
            }}
            title="Add Link"
          >
            🔗
          </ToolbarButton>
          <ToolbarButton
            active={false}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal Rule"
          >
            —
          </ToolbarButton>
          <ToolbarButton
            active={false}
            onClick={() => setShowVaultPicker(true)}
            title="Insert Image"
          >
            🖼
          </ToolbarButton>
        </div>
      )}

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Vault picker for images */}
      {showVaultPicker && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['photo']}
          onSelect={handleVaultSelect}
          onClose={() => setShowVaultPicker(false)}
          defaultUploadCategory="photo"
          defaultUploadVisibility="public"
        />
      )}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-sm transition-colors ${
        active
          ? 'bg-sage text-white'
          : 'text-forest-dark/70 hover:bg-sage-light hover:text-forest-dark'
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Verify the editor builds**

Run: `npm run type-check`
Expected: No type errors in editor files.

- [ ] **Step 3: Commit**

```bash
git add src/lib/editor/RichTextEditor.tsx
git commit -m "feat(editor): add RichTextEditor component with toolbar and vault image integration"
```

---

### Task 8: Knowledge Editor Component

**Files:**
- Create: `src/components/knowledge/KnowledgeEditor.tsx`

- [ ] **Step 1: Create the knowledge editor component**

```tsx
// src/components/knowledge/KnowledgeEditor.tsx

'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { generateHTML } from '@tiptap/html';
import { getEditorExtensions } from '@/lib/editor/extensions';
import { createKnowledgeItem, updateKnowledgeItem, addAttachment, removeAttachment, getAttachments } from '@/lib/knowledge/actions';
import { generateExcerpt } from '@/lib/knowledge/helpers';
import VaultPicker from '@/components/vault/VaultPicker';
import type { KnowledgeItem } from '@/lib/knowledge/types';
import type { VaultItem } from '@/lib/vault/types';
import type { JSONContent } from '@tiptap/core';

const RichTextEditor = dynamic(() => import('@/lib/editor/RichTextEditor'), { ssr: false });

interface KnowledgeEditorProps {
  orgId: string;
  item?: KnowledgeItem;
  onSaved?: (item: KnowledgeItem) => void;
}

interface AttachmentRow {
  vault_item_id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  sort_order: number;
}

export default function KnowledgeEditor({ orgId, item, onSaved }: KnowledgeEditorProps) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState<JSONContent | null>(item?.body ?? null);
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState(item?.cover_image_url ?? '');
  const [visibility, setVisibility] = useState<'org' | 'public'>(item?.visibility ?? 'org');
  const [isAiContext, setIsAiContext] = useState(item?.is_ai_context ?? true);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAttachments, setLoadedAttachments] = useState(false);

  // Load existing attachments on first render for edit mode
  if (item && !loadedAttachments) {
    setLoadedAttachments(true);
    getAttachments(item.id).then(({ attachments: data }) => {
      setAttachments(data);
    });
  }

  const handleBodyChange = useCallback((json: JSONContent) => {
    setBody(json);
  }, []);

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleCoverSelect(items: VaultItem[]) {
    if (items.length > 0) {
      const selected = items[0];
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vault-public/${selected.storage_path}`;
      setCoverImageUrl(url);
    }
    setShowCoverPicker(false);
  }

  async function handleAttachSelect(items: VaultItem[]) {
    if (item && items.length > 0) {
      for (const vi of items) {
        const result = await addAttachment(item.id, vi.id, attachments.length);
        if ('success' in result) {
          setAttachments((prev) => [
            ...prev,
            { vault_item_id: vi.id, file_name: vi.file_name, mime_type: vi.mime_type, file_size: vi.file_size, sort_order: prev.length },
          ]);
        }
      }
    }
    setShowAttachPicker(false);
  }

  async function handleRemoveAttachment(vaultItemId: string) {
    if (!item) return;
    const result = await removeAttachment(item.id, vaultItemId);
    if ('success' in result) {
      setAttachments((prev) => prev.filter((a) => a.vault_item_id !== vaultItemId));
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const bodyHtml = body ? generateHTML(body, getEditorExtensions()) : '';
    const excerpt = bodyHtml ? generateExcerpt(bodyHtml) : '';

    if (item) {
      // Update existing
      const result = await updateKnowledgeItem(item.id, {
        title: title.trim(),
        body,
        bodyHtml,
        excerpt,
        coverImageUrl: coverImageUrl || undefined,
        tags,
        visibility,
        isAiContext,
      });

      if ('error' in result) {
        setError(result.error);
      } else if (onSaved) {
        onSaved({ ...item, title: title.trim(), body, body_html: bodyHtml, excerpt, cover_image_url: coverImageUrl, tags, visibility, is_ai_context: isAiContext });
      }
    } else {
      // Create new
      const result = await createKnowledgeItem({
        orgId,
        title: title.trim(),
        body: body ?? undefined,
        bodyHtml,
        excerpt,
        coverImageUrl: coverImageUrl || undefined,
        tags,
        visibility,
        isAiContext,
      });

      if ('error' in result) {
        setError(result.error);
      } else if (onSaved) {
        onSaved(result.item);
      }
    }

    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <label className="label">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Article title…"
          className="input-field text-lg font-semibold"
        />
      </div>

      {/* Cover image */}
      <div>
        <label className="label">Cover Image</label>
        <div className="flex items-center gap-3">
          {coverImageUrl && (
            <img src={coverImageUrl} alt="Cover" className="w-24 h-16 object-cover rounded" />
          )}
          <button type="button" onClick={() => setShowCoverPicker(true)} className="btn-secondary text-sm">
            {coverImageUrl ? 'Change' : 'Add Cover Image'}
          </button>
          {coverImageUrl && (
            <button type="button" onClick={() => setCoverImageUrl('')} className="text-sm text-red-500 hover:text-red-700">
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="label">Tags</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            placeholder="Add a tag…"
            className="input-field text-sm flex-1"
          />
          <button type="button" onClick={addTag} className="btn-secondary text-sm">Add</button>
        </div>
      </div>

      {/* Visibility & AI Context */}
      <div className="flex gap-6">
        <div>
          <label className="label">Visibility</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'org' | 'public')} className="input-field text-sm">
            <option value="org">Organization only</option>
            <option value="public">Public</option>
          </select>
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            id="ai-context"
            checked={isAiContext}
            onChange={(e) => setIsAiContext(e.target.checked)}
            className="rounded border-sage-light"
          />
          <label htmlFor="ai-context" className="text-sm text-forest-dark">Include in AI context</label>
        </div>
      </div>

      {/* Rich text body */}
      <div>
        <label className="label">Content</label>
        <RichTextEditor
          content={body}
          onChange={handleBodyChange}
          orgId={orgId}
        />
      </div>

      {/* Attachments (only shown in edit mode when item exists) */}
      {item && (
        <div>
          <label className="label">Attachments</label>
          {attachments.length > 0 && (
            <div className="space-y-2 mb-3">
              {attachments.map((a) => (
                <div key={a.vault_item_id} className="flex items-center justify-between bg-parchment/50 rounded-lg px-3 py-2">
                  <span className="text-sm text-forest-dark">{a.file_name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(a.vault_item_id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setShowAttachPicker(true)} className="btn-secondary text-sm">
            Attach File from Vault
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? 'Saving…' : item ? 'Save Changes' : 'Create Article'}
        </button>
      </div>

      {/* Cover image picker */}
      {showCoverPicker && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['photo']}
          onSelect={handleCoverSelect}
          onClose={() => setShowCoverPicker(false)}
          defaultUploadCategory="photo"
          defaultUploadVisibility="public"
        />
      )}

      {/* Attachment picker */}
      {showAttachPicker && (
        <VaultPicker
          orgId={orgId}
          categoryFilter={['document']}
          multiple
          onSelect={handleAttachSelect}
          onClose={() => setShowAttachPicker(false)}
          defaultUploadCategory="document"
          defaultUploadVisibility="private"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/knowledge/KnowledgeEditor.tsx
git commit -m "feat(knowledge): add KnowledgeEditor component with rich text, tags, attachments"
```

---

### Task 9: Knowledge Renderer Component

**Files:**
- Create: `src/components/knowledge/KnowledgeRenderer.tsx`

- [ ] **Step 1: Create the renderer component**

```tsx
// src/components/knowledge/KnowledgeRenderer.tsx

import type { KnowledgeItem } from '@/lib/knowledge/types';

interface KnowledgeRendererProps {
  item: KnowledgeItem;
  showTitle?: boolean;
  showTags?: boolean;
  showAttachments?: boolean;
  textSize?: 'small' | 'medium' | 'large';
  attachments?: Array<{ vault_item_id: string; file_name: string; mime_type: string | null; file_size: number }>;
}

export default function KnowledgeRenderer({
  item,
  showTitle = true,
  showTags = true,
  showAttachments = true,
  textSize = 'medium',
  attachments = [],
}: KnowledgeRendererProps) {
  const proseSizeClass = textSize === 'small' ? 'prose-sm' : textSize === 'large' ? 'prose-lg' : 'prose-base';

  return (
    <article className="space-y-4">
      {showTitle && (
        <h2 className="text-2xl font-heading font-semibold text-forest-dark">{item.title}</h2>
      )}

      {showTags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span key={tag} className="bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {item.cover_image_url && (
        <img
          src={item.cover_image_url}
          alt={item.title}
          className="w-full max-h-64 object-cover rounded-lg"
        />
      )}

      {item.body_html && (
        <div
          className={`prose ${proseSizeClass} max-w-none prose-headings:text-[var(--color-primary-dark)] prose-a:text-[var(--color-primary)]`}
          dangerouslySetInnerHTML={{ __html: item.body_html }}
        />
      )}

      {showAttachments && attachments.length > 0 && (
        <div className="border-t border-sage-light pt-4">
          <h3 className="text-sm font-medium text-forest-dark mb-2">Attachments</h3>
          <div className="space-y-2">
            {attachments.map((a) => (
              <div key={a.vault_item_id} className="flex items-center gap-2 text-sm">
                <span className="text-sage">📎</span>
                <span className="text-forest-dark">{a.file_name}</span>
                <span className="text-sage text-xs">
                  ({(a.file_size / 1024).toFixed(0)} KB)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/knowledge/KnowledgeRenderer.tsx
git commit -m "feat(knowledge): add KnowledgeRenderer for displaying articles"
```

---

### Task 10: Knowledge Picker (Modal)

**Files:**
- Create: `src/components/knowledge/KnowledgePicker.tsx`

- [ ] **Step 1: Create the modal picker component**

```tsx
// src/components/knowledge/KnowledgePicker.tsx

'use client';

import { useState, useEffect } from 'react';
import { getKnowledgeItems } from '@/lib/knowledge/actions';
import type { KnowledgeItem } from '@/lib/knowledge/types';

interface KnowledgePickerProps {
  orgId: string;
  onSelect: (items: KnowledgeItem[]) => void;
  onClose: () => void;
  multiple?: boolean;
  tagFilter?: string[];
}

export default function KnowledgePicker({ orgId, onSelect, onClose, multiple = false, tagFilter }: KnowledgePickerProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Collect all unique tags from items
  const allTags = [...new Set(items.flatMap((i) => i.tags))].sort();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const filters: { search?: string; tags?: string[] } = {};
      if (search.trim()) filters.search = search.trim();
      const tagsToFilter = activeTags.length > 0 ? activeTags : tagFilter;
      if (tagsToFilter && tagsToFilter.length > 0) filters.tags = tagsToFilter;

      const { items: data } = await getKnowledgeItems(orgId, filters);
      setItems(data);
      setLoading(false);
    }
    load();
  }, [orgId, search, activeTags, tagFilter]);

  function toggleItem(id: string) {
    if (multiple) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set([id]));
    }
  }

  function handleSelect() {
    const selected = items.filter((i) => selectedIds.has(i.id));
    onSelect(selected);
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleBackdropClick}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md sm:max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-forest-dark">Select Knowledge Article</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search and filters */}
        <div className="px-6 pt-4 space-y-3">
          <input
            type="search"
            placeholder="Search articles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field text-sm w-full"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setActiveTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    activeTags.includes(tag)
                      ? 'bg-sage text-white'
                      : 'bg-sage-light text-forest-dark hover:bg-sage/20'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Items list */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse h-16 bg-sage-light rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-sage text-center py-8">No articles found.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedIds.has(item.id)
                      ? 'border-sage bg-sage/5'
                      : 'border-gray-100 hover:border-sage-light'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {item.cover_image_url && (
                      <img src={item.cover_image_url} alt="" className="w-12 h-12 object-cover rounded" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-forest-dark truncate">{item.title}</p>
                      {item.excerpt && (
                        <p className="text-xs text-sage mt-1 line-clamp-2">{item.excerpt}</p>
                      )}
                      {item.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {item.tags.map((tag) => (
                            <span key={tag} className="text-[10px] bg-forest/10 text-forest-dark px-1.5 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedIds.has(item.id) && (
                      <span className="text-sage text-lg">✓</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSelect}
            disabled={selectedIds.size === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Select{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/knowledge/KnowledgePicker.tsx
git commit -m "feat(knowledge): add KnowledgePicker modal component"
```

---

### Task 11: Knowledge Select (Inline Dropdown)

**Files:**
- Create: `src/components/knowledge/KnowledgeSelect.tsx`

- [ ] **Step 1: Create the inline select component**

This follows the same pattern as `src/components/manage/EntitySelect.tsx`.

```tsx
// src/components/knowledge/KnowledgeSelect.tsx

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getKnowledgeItems } from '@/lib/knowledge/actions';
import type { KnowledgeItem } from '@/lib/knowledge/types';

interface KnowledgeSelectProps {
  orgId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
}

export default function KnowledgeSelect({ orgId, selectedIds, onChange, multiple = true }: KnowledgeSelectProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: ['knowledge-items', orgId],
    queryFn: async () => {
      const { items } = await getKnowledgeItems(orgId);
      return items;
    },
  });

  function toggleItem(id: string) {
    if (multiple) {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((sid) => sid !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    } else {
      onChange([id]);
      setShowDropdown(false);
    }
  }

  function removeItem(id: string) {
    onChange(selectedIds.filter((sid) => sid !== id));
  }

  if (loading) return <p className="text-xs text-sage">Loading knowledge articles…</p>;
  if (items.length === 0) return null;

  const selectedItems = items.filter((i) => selectedIds.includes(i.id));
  const unselectedItems = items.filter((i) => !selectedIds.includes(i.id));

  return (
    <div>
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedItems.map((i) => (
            <span key={i.id} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
              {i.title}
              <button type="button" onClick={() => removeItem(i.id)} className="hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="input-field text-sm text-left w-full"
        >
          {selectedItems.length === 0 ? 'Link knowledge article…' : 'Add another…'}
        </button>

        {showDropdown && unselectedItems.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-sage-light rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {unselectedItems.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => toggleItem(i.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-sage-light/50 transition-colors"
              >
                <span className="text-forest-dark">{i.title}</span>
                {i.tags.length > 0 && (
                  <span className="text-sage text-xs ml-2">
                    {i.tags.join(', ')}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/knowledge/KnowledgeSelect.tsx
git commit -m "feat(knowledge): add KnowledgeSelect inline dropdown component"
```

---

### Task 12: Admin Pages — List, Create, Edit

**Files:**
- Create: `src/app/admin/knowledge/page.tsx`
- Create: `src/app/admin/knowledge/new/page.tsx`
- Create: `src/app/admin/knowledge/[slug]/page.tsx`

- [ ] **Step 1: Create the list page**

```tsx
// src/app/admin/knowledge/page.tsx

'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getKnowledgeItems, deleteKnowledgeItem } from '@/lib/knowledge/actions';
import type { KnowledgeItem } from '@/lib/knowledge/types';
import Link from 'next/link';

export default function KnowledgeListPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'' | 'org' | 'public'>('');
  const [activeTag, setActiveTag] = useState<string>('');

  const allTags = [...new Set(items.flatMap((i) => i.tags))].sort();

  const loadData = useCallback(
    async (currentOrgId: string) => {
      const filters: { search?: string; tags?: string[]; visibility?: 'org' | 'public' } = {};
      if (search.trim()) filters.search = search.trim();
      if (activeTag) filters.tags = [activeTag];
      if (visibilityFilter) filters.visibility = visibilityFilter;

      const { items: data } = await getKnowledgeItems(currentOrgId, filters);
      setItems(data);
    },
    [search, activeTag, visibilityFilter]
  );

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }

      const id = membership.org_id as string;
      setOrgId(id);
      await loadData(id);
      setLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (orgId) loadData(orgId);
  }, [orgId, loadData]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this article? This cannot be undone.')) return;
    await deleteKnowledgeItem(id);
    if (orgId) loadData(orgId);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-48 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">Knowledge</h1>
          <p className="text-sm text-sage mt-1">Manage how-to guides, reference articles, and documentation.</p>
        </div>
        <Link href="/admin/knowledge/new" className="btn-primary text-sm">
          + New Article
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search articles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field text-sm w-52"
        />
        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value as '' | 'org' | 'public')}
          className="input-field text-sm"
        >
          <option value="">All visibility</option>
          <option value="org">Org only</option>
          <option value="public">Public</option>
        </select>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setActiveTag('')}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${!activeTag ? 'bg-sage text-white' : 'bg-sage-light text-forest-dark'}`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${activeTag === tag ? 'bg-sage text-white' : 'bg-sage-light text-forest-dark'}`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sage">No knowledge articles yet.</p>
          <Link href="/admin/knowledge/new" className="text-sm text-sage hover:text-forest-dark mt-2 inline-block">
            Create your first article →
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sage-light bg-parchment/50">
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">Title</th>
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">Tags</th>
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">Visibility</th>
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">AI</th>
                <th className="text-left px-4 py-3 font-medium text-sage text-xs uppercase">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-sage-light/50 hover:bg-parchment/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/knowledge/${item.slug}`} className="font-medium text-forest-dark hover:text-sage transition-colors">
                      {item.title}
                    </Link>
                    {item.excerpt && (
                      <p className="text-xs text-sage mt-0.5 line-clamp-1">{item.excerpt}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map((tag) => (
                        <span key={tag} className="text-[10px] bg-forest/10 text-forest-dark px-1.5 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.visibility === 'public' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {item.visibility}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.is_ai_context && <span title="Included in AI context">⭐</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-sage">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the new article page**

```tsx
// src/app/admin/knowledge/new/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import KnowledgeEditor from '@/components/knowledge/KnowledgeEditor';
import type { KnowledgeItem } from '@/lib/knowledge/types';

export default function NewKnowledgePage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (membership) setOrgId(membership.org_id as string);
    }
    init();
  }, []);

  function handleSaved(item: KnowledgeItem) {
    router.push(`/admin/knowledge/${item.slug}`);
  }

  if (!orgId) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse h-8 bg-sage-light rounded w-48" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">New Article</h1>
      <KnowledgeEditor orgId={orgId} onSaved={handleSaved} />
    </div>
  );
}
```

- [ ] **Step 3: Create the edit page**

```tsx
// src/app/admin/knowledge/[slug]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getKnowledgeItem } from '@/lib/knowledge/actions';
import KnowledgeEditor from '@/components/knowledge/KnowledgeEditor';
import type { KnowledgeItem } from '@/lib/knowledge/types';

export default function EditKnowledgePage() {
  const params = useParams();
  const slug = params.slug as string;
  const [orgId, setOrgId] = useState<string | null>(null);
  const [item, setItem] = useState<KnowledgeItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: membership } = await supabase
        .from('org_memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }

      const id = membership.org_id as string;
      setOrgId(id);

      const { item: knowledgeItem } = await getKnowledgeItem(slug, id);
      setItem(knowledgeItem);
      setLoading(false);
    }
    init();
  }, [slug]);

  function handleSaved(updated: KnowledgeItem) {
    setItem(updated);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-sage-light rounded w-48" />
          <div className="h-64 bg-sage-light rounded" />
        </div>
      </div>
    );
  }

  if (!item || !orgId) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <p className="text-sage">Article not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">Edit Article</h1>
      <KnowledgeEditor orgId={orgId} item={item} onSaved={handleSaved} />
    </div>
  );
}
```

- [ ] **Step 4: Verify type-check**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/knowledge/page.tsx src/app/admin/knowledge/new/page.tsx src/app/admin/knowledge/\[slug\]/page.tsx
git commit -m "feat(knowledge): add admin pages for list, create, and edit"
```

---

### Task 13: Add Knowledge to Admin Sidebar

**Files:**
- Modify: `src/app/admin/properties/[slug]/layout.tsx:34-49`

- [ ] **Step 1: Add Knowledge to the sidebar items array**

In `src/app/admin/properties/[slug]/layout.tsx`, find the `items` array (line 34) and add a Knowledge entry after the entity types and before Data Vault:

```typescript
  const items = [
    { label: 'Data', href: `${base}/data` },
    { label: 'Settings', href: `${base}/settings` },
    { label: 'Landing Page', href: `${base}/landing` },
    { label: 'Site Builder', href: `${base}/site-builder/templates` },
    { label: 'QR Codes', href: `${base}/qr-codes` },
    { label: 'Types', href: `${base}/types` },
    { label: 'Entity Types', href: `${base}/entity-types` },
    ...entityTypes.map((et) => ({
      label: `${et.icon} ${et.name}`,
      href: `${base}/entities/${et.id}`,
    })),
    { label: 'Knowledge', href: '/admin/knowledge' },
    { label: 'Data Vault', href: `${base}/vault` },
    { label: 'Members', href: `${base}/members` },
    { label: 'Invites', href: `${base}/invites` },
  ];
```

The change is adding the line `{ label: 'Knowledge', href: '/admin/knowledge' },` before Data Vault. Note: Knowledge is org-wide (not property-scoped), so the href does not use the `${base}` prefix.

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/properties/\[slug\]/layout.tsx
git commit -m "feat(knowledge): add Knowledge link to admin sidebar"
```

---

### Task 14: Puck KnowledgeEmbed Component

**Files:**
- Create: `src/lib/puck/components/page/KnowledgeEmbed.tsx`
- Create: `src/lib/puck/fields/KnowledgePickerField.tsx`
- Modify: `src/lib/puck/fields/index.tsx`
- Modify: `src/lib/puck/types.ts`
- Modify: `src/lib/puck/config.ts`

- [ ] **Step 1: Create the KnowledgePickerField Puck custom field**

```tsx
// src/lib/puck/fields/KnowledgePickerField.tsx

'use client';

import { useState } from 'react';
import KnowledgePicker from '@/components/knowledge/KnowledgePicker';
import { getKnowledgeItem } from '@/lib/knowledge/actions';
import { useEffect } from 'react';

interface KnowledgePickerFieldProps {
  value: string;
  onChange: (val: string) => void;
  orgId: string;
}

export function KnowledgePickerField({ value, onChange, orgId }: KnowledgePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [title, setTitle] = useState<string>('');

  useEffect(() => {
    if (value) {
      getKnowledgeItem(value).then(({ item }) => {
        if (item) setTitle(item.title);
      });
    }
  }, [value]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="input-field text-sm text-left w-full"
      >
        {title || value || 'Select knowledge article…'}
      </button>

      {showPicker && (
        <KnowledgePicker
          orgId={orgId}
          onSelect={(items) => {
            if (items.length > 0) {
              onChange(items[0].id);
              setTitle(items[0].title);
            }
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add knowledgePickerField factory to index.tsx**

Add to `src/lib/puck/fields/index.tsx`:

```typescript
import { KnowledgePickerField } from './KnowledgePickerField';

// ... (existing exports) ...

export { KnowledgePickerField } from './KnowledgePickerField';

/**
 * Creates a Puck custom field config for a knowledge article picker.
 */
export function knowledgePickerField(label: string, orgId: string) {
  return {
    type: 'custom' as const,
    label,
    render: ({ value, onChange }: { value: any; onChange: (val: any) => void }) => (
      <KnowledgePickerField value={value || ''} onChange={onChange} orgId={orgId} />
    ),
  };
}
```

- [ ] **Step 3: Add prop types to types.ts**

Add to `src/lib/puck/types.ts`:

```typescript
export interface KnowledgeEmbedProps {
  knowledgeItemId: string;
  showTitle: boolean;
  showAttachments: boolean;
  textSize?: TextSize;
}

export interface KnowledgeListProps {
  tagFilter: string[];
  maxItems: number;
  layout: 'grid' | 'list';
  columns: 2 | 3 | 4;
  textSize?: TextSize;
}
```

- [ ] **Step 4: Create the KnowledgeEmbed render component**

```tsx
// src/lib/puck/components/page/KnowledgeEmbed.tsx

'use client';

import { useEffect, useState } from 'react';
import { getKnowledgeItem, getAttachments } from '@/lib/knowledge/actions';
import KnowledgeRenderer from '@/components/knowledge/KnowledgeRenderer';
import type { KnowledgeItem } from '@/lib/knowledge/types';
import type { KnowledgeEmbedProps } from '../../types';

export function KnowledgeEmbed({ knowledgeItemId, showTitle = true, showAttachments = true, textSize = 'medium' }: KnowledgeEmbedProps) {
  const [item, setItem] = useState<KnowledgeItem | null>(null);
  const [attachments, setAttachments] = useState<Array<{ vault_item_id: string; file_name: string; mime_type: string | null; file_size: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!knowledgeItemId) {
      setLoading(false);
      return;
    }

    async function load() {
      const { item: data } = await getKnowledgeItem(knowledgeItemId);
      setItem(data);

      if (data && showAttachments) {
        const { attachments: attachData } = await getAttachments(knowledgeItemId);
        setAttachments(attachData);
      }

      setLoading(false);
    }
    load();
  }, [knowledgeItemId, showAttachments]);

  if (loading) {
    return <div className="animate-pulse h-32 bg-sage-light rounded-lg mx-auto max-w-4xl" />;
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 text-center">
        <p className="text-sage text-sm">
          {knowledgeItemId ? 'Knowledge article not found.' : 'Select a knowledge article.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <KnowledgeRenderer
        item={item}
        showTitle={showTitle}
        showAttachments={showAttachments}
        textSize={textSize}
        attachments={attachments}
      />
    </div>
  );
}
```

- [ ] **Step 5: Register in pageConfig**

In `src/lib/puck/config.ts`, add imports and the component definition. Add to the imports section at the top:

```typescript
import { KnowledgeEmbed } from './components/page/KnowledgeEmbed';
```

Add to the `PageComponents` type:

```typescript
KnowledgeEmbed: KnowledgeEmbedProps;
```

Add the component config inside `components: { ... }`:

```typescript
    KnowledgeEmbed: {
      label: 'Knowledge Embed',
      defaultProps: {
        knowledgeItemId: '',
        showTitle: true,
        showAttachments: true,
        textSize: 'medium',
      },
      fields: {
        knowledgeItemId: {
          type: 'text',
          label: 'Knowledge Item ID (paste from admin)',
        },
        showTitle: { type: 'radio', label: 'Show Title', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
        showAttachments: { type: 'radio', label: 'Show Attachments', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] },
        textSize: textSizeField(),
      },
      render: KnowledgeEmbed,
    },
```

Note: The `knowledgeItemId` field uses a plain text field for now. When the orgId is available in the Puck editor context, this can be upgraded to use `knowledgePickerField()`. This keeps the initial implementation simple while still functional.

- [ ] **Step 6: Commit**

```bash
git add src/lib/puck/components/page/KnowledgeEmbed.tsx src/lib/puck/fields/KnowledgePickerField.tsx src/lib/puck/fields/index.tsx src/lib/puck/types.ts src/lib/puck/config.ts
git commit -m "feat(knowledge): add KnowledgeEmbed Puck component and picker field"
```

---

### Task 15: Puck KnowledgeList Component

**Files:**
- Create: `src/lib/puck/components/page/KnowledgeList.tsx`
- Modify: `src/lib/puck/config.ts`

- [ ] **Step 1: Create the KnowledgeList render component**

```tsx
// src/lib/puck/components/page/KnowledgeList.tsx

'use client';

import { useEffect, useState } from 'react';
import { getKnowledgeItems } from '@/lib/knowledge/actions';
import type { KnowledgeItem } from '@/lib/knowledge/types';
import type { KnowledgeListProps } from '../../types';
import { proseSizeClasses } from '../../text-styles';

export function KnowledgeList({ tagFilter = [], maxItems = 6, layout = 'grid', columns = 3, textSize = 'medium' }: KnowledgeListProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // For public Puck pages, we need to fetch public knowledge items
      // This relies on the RLS policy allowing public visibility reads
      const { items: data } = await getKnowledgeItems('', {
        tags: tagFilter.length > 0 ? tagFilter : undefined,
        visibility: 'public',
      });
      setItems(data.slice(0, maxItems));
      setLoading(false);
    }
    load();
  }, [tagFilter, maxItems]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className={`grid gap-6 ${columns === 2 ? 'grid-cols-1 md:grid-cols-2' : columns === 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
          {Array.from({ length: maxItems }).map((_, i) => (
            <div key={i} className="animate-pulse h-48 bg-sage-light rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 text-center">
        <p className="text-sage text-sm">No knowledge articles available.</p>
      </div>
    );
  }

  const proseSize = proseSizeClasses[textSize];

  if (layout === 'list') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
        {items.map((item) => (
          <a key={item.id} href={`/knowledge/${item.slug}`} className="block card p-4 hover:shadow-md transition-shadow">
            <div className="flex gap-4">
              {item.cover_image_url && (
                <img src={item.cover_image_url} alt="" className="w-20 h-20 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-semibold text-forest-dark">{item.title}</h3>
                {item.excerpt && <p className={`text-sage mt-1 ${proseSize} line-clamp-2`}>{item.excerpt}</p>}
                {item.tags.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {item.tags.map((tag) => (
                      <span key={tag} className="text-[10px] bg-forest/10 text-forest-dark px-1.5 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    );
  }

  // Grid layout
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className={`grid gap-6 ${columns === 2 ? 'grid-cols-1 md:grid-cols-2' : columns === 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
        {items.map((item) => (
          <a key={item.id} href={`/knowledge/${item.slug}`} className="card overflow-hidden hover:shadow-md transition-shadow">
            {item.cover_image_url && (
              <img src={item.cover_image_url} alt="" className="w-full h-40 object-cover" />
            )}
            <div className="p-4">
              <h3 className="font-heading font-semibold text-forest-dark">{item.title}</h3>
              {item.excerpt && <p className={`text-sage mt-1 text-sm line-clamp-3`}>{item.excerpt}</p>}
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.tags.map((tag) => (
                    <span key={tag} className="text-[10px] bg-forest/10 text-forest-dark px-1.5 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register in pageConfig**

In `src/lib/puck/config.ts`, add the import:

```typescript
import { KnowledgeList } from './components/page/KnowledgeList';
```

Add to the `PageComponents` type:

```typescript
KnowledgeList: KnowledgeListProps;
```

Add the component config inside `components: { ... }`:

```typescript
    KnowledgeList: {
      label: 'Knowledge List',
      defaultProps: {
        tagFilter: [],
        maxItems: 6,
        layout: 'grid',
        columns: 3,
        textSize: 'medium',
      },
      fields: {
        tagFilter: { type: 'text', label: 'Tag Filter (comma-separated)' },
        maxItems: { type: 'number', label: 'Max Items' },
        layout: { type: 'radio', label: 'Layout', options: [{ label: 'Grid', value: 'grid' }, { label: 'List', value: 'list' }] },
        columns: { type: 'select', label: 'Columns', options: [{ label: '2', value: 2 }, { label: '3', value: 3 }, { label: '4', value: 4 }] },
        textSize: textSizeField(),
      },
      render: KnowledgeList,
    },
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/puck/components/page/KnowledgeList.tsx src/lib/puck/config.ts
git commit -m "feat(knowledge): add KnowledgeList Puck component"
```

---

### Task 16: Public Knowledge Article Route

**Files:**
- Create: `src/app/knowledge/[slug]/page.tsx`

- [ ] **Step 1: Create the public knowledge article page**

```tsx
// src/app/knowledge/[slug]/page.tsx

import { getKnowledgeItem, getAttachments } from '@/lib/knowledge/actions';
import KnowledgeRenderer from '@/components/knowledge/KnowledgeRenderer';
import { notFound } from 'next/navigation';

interface Props {
  params: { slug: string };
}

export default async function PublicKnowledgePage({ params }: Props) {
  const { item } = await getKnowledgeItem(params.slug);

  if (!item || item.visibility !== 'public') {
    notFound();
  }

  const { attachments } = await getAttachments(item.id);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <KnowledgeRenderer
        item={item}
        showTitle
        showTags
        showAttachments
        textSize="large"
        attachments={attachments}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/knowledge/\[slug\]/page.tsx
git commit -m "feat(knowledge): add public knowledge article route"
```

---

### Task 17: AI Context Integration

**Files:**
- Modify: `src/lib/ai-context/context-provider.ts`
- Create: `src/lib/ai-context/__tests__/context-provider.test.ts`

- [ ] **Step 1: Write a failing test for knowledge context inclusion**

Create file `src/lib/ai-context/__tests__/context-provider.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildOrgContextBlock } from '../context-provider';
import type { AiContextSummary } from '../types';

describe('buildOrgContextBlock', () => {
  it('returns empty string for null summary', () => {
    expect(buildOrgContextBlock(null)).toBe('');
  });

  it('includes org profile and content map', () => {
    const summary: AiContextSummary = {
      id: '1',
      org_id: 'org-1',
      org_profile: 'A bird conservation org.',
      content_map: [
        { item_id: '1', filename: 'guide.pdf', summary: 'Field guide' },
      ],
      last_rebuilt_at: '2026-01-01',
      version: 1,
    };
    const result = buildOrgContextBlock(summary);
    expect(result).toContain('A bird conservation org.');
    expect(result).toContain('guide.pdf');
  });

  it('includes knowledge section when items are provided', () => {
    const summary: AiContextSummary = {
      id: '1',
      org_id: 'org-1',
      org_profile: 'A bird conservation org.',
      content_map: [],
      last_rebuilt_at: '2026-01-01',
      version: 1,
    };
    const knowledgeItems = [
      { title: 'How to Clean Birdhouses', tags: ['maintenance'], bodyText: 'Step 1: Remove old nesting material.' },
      { title: 'BirdBox Plans', tags: ['plans'], bodyText: 'Standard box dimensions: 5x5x10 inches.' },
    ];
    const result = buildOrgContextBlock(summary, knowledgeItems);
    expect(result).toContain('Knowledge Base');
    expect(result).toContain('How to Clean Birdhouses');
    expect(result).toContain('Step 1: Remove old nesting material.');
    expect(result).toContain('BirdBox Plans');
  });

  it('excludes knowledge section when no items are provided', () => {
    const summary: AiContextSummary = {
      id: '1',
      org_id: 'org-1',
      org_profile: 'Test org.',
      content_map: [],
      last_rebuilt_at: '2026-01-01',
      version: 1,
    };
    const result = buildOrgContextBlock(summary);
    expect(result).not.toContain('Knowledge Base');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/ai-context/__tests__/context-provider.test.ts`
Expected: FAIL — the knowledge tests fail because `buildOrgContextBlock` doesn't accept or handle knowledge items yet.

- [ ] **Step 3: Update buildOrgContextBlock to include knowledge**

Replace the contents of `src/lib/ai-context/context-provider.ts`:

```typescript
import type { AiContextSummary } from './types';

export interface KnowledgeContextItem {
  title: string;
  tags: string[];
  bodyText: string;
}

export function buildOrgContextBlock(
  summary: AiContextSummary | null,
  knowledgeItems?: KnowledgeContextItem[]
): string {
  if (!summary) return '';

  const fileEntries = summary.content_map
    .map(entry => `  - ${entry.filename}: ${entry.summary}`)
    .join('\n');

  let knowledgeSection = '';
  if (knowledgeItems && knowledgeItems.length > 0) {
    const knowledgeEntries = knowledgeItems
      .map(item => {
        const tagsStr = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : '';
        return `  **${item.title}**${tagsStr}\n  ${item.bodyText}`;
      })
      .join('\n\n');
    knowledgeSection = `\n\n<knowledge-base>\n${knowledgeEntries}\n</knowledge-base>`;
  }

  return `<org-context>\n${summary.org_profile}\n\n<available-context-files>\n${fileEntries}\n</available-context-files>${knowledgeSection}\n</org-context>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/ai-context/__tests__/context-provider.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-context/context-provider.ts src/lib/ai-context/__tests__/context-provider.test.ts
git commit -m "feat(knowledge): integrate knowledge items into AI context block"
```

---

### Task 18: Full Build Verification

- [ ] **Step 1: Run the type checker**

Run: `npm run type-check`
Expected: No type errors.

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass, including the new knowledge and AI context tests.

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: Production build succeeds with no errors.

- [ ] **Step 4: Fix any issues found in steps 1-3**

If there are type errors, test failures, or build errors, fix them before proceeding.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(knowledge): resolve build issues"
```

(Skip this step if no fixes were needed.)
