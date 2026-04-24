# Scheduled Maintenance (PR 1 — Admin CRUD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the admin CRUD surface for scheduled maintenance projects scoped to one property — list, create, edit, delete, and per-item completion tracking — behind RLS that matches the `knowledge_items` pattern.

**Architecture:** One new migration (`049_scheduled_maintenance.sql`) with three tables (`maintenance_projects`, `maintenance_project_items`, `maintenance_project_knowledge`), server actions in `src/lib/maintenance/actions.ts` (returning `{ success } | { error }`), three new routes under `/admin/properties/[slug]/maintenance`, and shared components under `src/components/maintenance/`. No pickers (interim checkbox lists), no public viewer, no item-page card — those ship in PR 2 and PR 3.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Auth + RLS), TypeScript, Tailwind CSS, Vitest + @testing-library/react, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-04-23-scheduled-maintenance-design.md`

---

## File structure

**Create:**

```
supabase/migrations/049_scheduled_maintenance.sql

src/lib/maintenance/
  types.ts
  schemas.ts
  logic.ts
  actions.ts

src/components/maintenance/
  MaintenanceStatusPill.tsx
  MaintenanceStatCard.tsx
  MaintenanceProjectRow.tsx
  MaintenanceItemPickerInterim.tsx
  MaintenanceKnowledgePickerInterim.tsx
  MaintenanceEmpty.tsx
  MaintenanceLoading.tsx
  MaintenanceError.tsx

src/app/admin/properties/[slug]/maintenance/
  page.tsx
  loading.tsx
  error.tsx
  MaintenanceListClient.tsx
  new/page.tsx
  new/MaintenanceCreateForm.tsx
  [id]/page.tsx
  [id]/MaintenanceDetailForm.tsx

src/__tests__/maintenance/
  logic.test.ts
  MaintenanceProjectRow.test.tsx
  MaintenanceListClient.test.tsx
  MaintenanceDetailForm.test.tsx

e2e/tests/admin/maintenance.spec.ts
```

**Modify:**

```
src/app/admin/properties/[slug]/layout.tsx  # add "Maintenance" sidebar entry
```

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/049_scheduled_maintenance.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/049_scheduled_maintenance.sql`:

```sql
-- =============================================================
-- 049_scheduled_maintenance.sql — Maintenance projects with
-- item linking (with per-item completion) and knowledge linking
-- =============================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table maintenance_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'planned'
    check (status in ('planned','in_progress','completed','cancelled')),
  scheduled_for date,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_maintenance_projects_org on maintenance_projects(org_id);
create index idx_maintenance_projects_property on maintenance_projects(property_id);
create index idx_maintenance_projects_status on maintenance_projects(status, scheduled_for);

create table maintenance_project_items (
  maintenance_project_id uuid not null references maintenance_projects(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (maintenance_project_id, item_id)
);

create index idx_mpi_project on maintenance_project_items(maintenance_project_id);
create index idx_mpi_item on maintenance_project_items(item_id);

create table maintenance_project_knowledge (
  maintenance_project_id uuid not null references maintenance_projects(id) on delete cascade,
  knowledge_item_id uuid not null references knowledge_items(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  primary key (maintenance_project_id, knowledge_item_id)
);

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function update_maintenance_projects_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_maintenance_projects_updated_at
before update on maintenance_projects
for each row execute function update_maintenance_projects_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS — maintenance_projects (mirrors knowledge_items pattern)
-- ---------------------------------------------------------------------------

alter table maintenance_projects enable row level security;

-- Members of the org can read
create policy maintenance_projects_select on maintenance_projects
  for select using (org_id in (select user_active_org_ids()));

-- Staff+ can insert
create policy maintenance_projects_insert on maintenance_projects
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_projects.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- Staff+ can update
create policy maintenance_projects_update on maintenance_projects
  for update using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_projects.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- Staff+ can delete (spec-approved; differs from knowledge_items which is admin-only)
create policy maintenance_projects_delete on maintenance_projects
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_projects.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. RLS — maintenance_project_items
-- ---------------------------------------------------------------------------

alter table maintenance_project_items enable row level security;

create policy mpi_select on maintenance_project_items
  for select using (org_id in (select user_active_org_ids()));

create policy mpi_insert on maintenance_project_items
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy mpi_update on maintenance_project_items
  for update using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy mpi_delete on maintenance_project_items
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_items.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

-- ---------------------------------------------------------------------------
-- 5. RLS — maintenance_project_knowledge
-- ---------------------------------------------------------------------------

alter table maintenance_project_knowledge enable row level security;

create policy mpk_select on maintenance_project_knowledge
  for select using (org_id in (select user_active_org_ids()));

create policy mpk_insert on maintenance_project_knowledge
  for insert with check (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_knowledge.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );

create policy mpk_delete on maintenance_project_knowledge
  for delete using (
    exists (
      select 1 from org_memberships om
      join roles rl on rl.id = om.role_id
      where om.org_id = maintenance_project_knowledge.org_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and rl.base_role in ('org_admin', 'org_staff')
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `npm run supabase:reset`

Expected: local Supabase restarts, all migrations through 049 apply cleanly. If it errors, read the error, fix the SQL, retry.

- [ ] **Step 3: Verify tables exist**

Run:
```bash
psql postgres://postgres:postgres@127.0.0.1:54322/postgres \
  -c "\dt maintenance_project*"
```

Expected output: three rows showing `maintenance_projects`, `maintenance_project_items`, `maintenance_project_knowledge`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/049_scheduled_maintenance.sql
git commit -m "feat(maintenance): add maintenance_projects schema with per-item completion"
```

---

## Task 2: Types

**Files:**
- Create: `src/lib/maintenance/types.ts`

- [ ] **Step 1: Write types**

Create `src/lib/maintenance/types.ts`:

```ts
export type MaintenanceStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export interface MaintenanceProject {
  id: string;
  org_id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  scheduled_for: string | null; // ISO date string, e.g. "2026-05-15"
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceProjectRowData extends MaintenanceProject {
  items_completed: number;
  items_total: number;
  knowledge_count: number;
  creator_name: string | null;
}

export interface MaintenanceProjectItem {
  maintenance_project_id: string;
  item_id: string;
  org_id: string;
  completed_at: string | null;
  completed_by: string | null;
  added_at: string;
}

export interface LinkedItem {
  item_id: string;
  name: string;
  type_name: string | null;
  icon: string | null;
  last_maintained_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
}

export interface LinkedKnowledge {
  knowledge_item_id: string;
  title: string;
  slug: string;
  visibility: 'org' | 'public';
}

export interface CreateMaintenanceProjectInput {
  orgId: string;
  propertyId: string;
  title: string;
  description?: string;
  scheduledFor?: string | null; // ISO date or null
}

export interface UpdateMaintenanceProjectInput {
  title?: string;
  description?: string | null;
  scheduledFor?: string | null;
  status?: MaintenanceStatus;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run type-check`

Expected: PASS (no errors in `src/lib/maintenance/types.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/maintenance/types.ts
git commit -m "feat(maintenance): add maintenance feature types"
```

---

## Task 3: Zod schemas

**Files:**
- Create: `src/lib/maintenance/schemas.ts`

- [ ] **Step 1: Write schemas**

Create `src/lib/maintenance/schemas.ts`:

```ts
import { z } from 'zod';

const statusSchema = z.enum(['planned', 'in_progress', 'completed', 'cancelled']);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be an ISO date (YYYY-MM-DD)');

export const createMaintenanceProjectSchema = z.object({
  orgId: z.string().uuid(),
  propertyId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000).optional(),
  scheduledFor: isoDateSchema.nullable().optional(),
});

export const updateMaintenanceProjectSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  scheduledFor: isoDateSchema.nullable().optional(),
  status: statusSchema.optional(),
});

export const linkItemsSchema = z.object({
  projectId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).min(1, 'At least one item required'),
});

export const linkKnowledgeSchema = z.object({
  projectId: z.string().uuid(),
  knowledgeIds: z.array(z.string().uuid()).min(1, 'At least one article required'),
});

export const setItemCompletionSchema = z.object({
  projectId: z.string().uuid(),
  itemId: z.string().uuid(),
  completed: z.boolean(),
});
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/maintenance/schemas.ts
git commit -m "feat(maintenance): add Zod schemas for action inputs"
```

---

## Task 4: Pure logic helpers (TDD)

**Files:**
- Create: `src/lib/maintenance/logic.ts`
- Test: `src/__tests__/maintenance/logic.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/maintenance/logic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeProgress, classifyScheduled } from '@/lib/maintenance/logic';

describe('computeProgress', () => {
  it('returns 0% when nothing is complete', () => {
    expect(computeProgress(0, 10)).toEqual({ completed: 0, total: 10, percent: 0 });
  });
  it('returns correct percentage', () => {
    expect(computeProgress(3, 10)).toEqual({ completed: 3, total: 10, percent: 30 });
  });
  it('returns 100% when fully complete', () => {
    expect(computeProgress(12, 12)).toEqual({ completed: 12, total: 12, percent: 100 });
  });
  it('returns zero-total result when total is 0', () => {
    expect(computeProgress(0, 0)).toEqual({ completed: 0, total: 0, percent: 0 });
  });
  it('rounds percent down', () => {
    expect(computeProgress(1, 3).percent).toBe(33);
  });
});

describe('classifyScheduled', () => {
  const today = '2026-04-23';

  it('returns "none" when no date', () => {
    expect(classifyScheduled(null, 'planned', today)).toEqual({ tone: 'none' });
  });
  it('returns "overdue" when planned and past', () => {
    expect(classifyScheduled('2026-04-20', 'planned', today)).toEqual({
      tone: 'overdue',
      daysAgo: 3,
    });
  });
  it('returns "soon" when planned and within 14 days', () => {
    expect(classifyScheduled('2026-05-01', 'planned', today)).toEqual({
      tone: 'soon',
      daysUntil: 8,
    });
  });
  it('returns "normal" when planned and more than 14 days out', () => {
    expect(classifyScheduled('2026-06-01', 'planned', today)).toEqual({ tone: 'normal' });
  });
  it('returns "normal" for non-planned statuses even if past', () => {
    expect(classifyScheduled('2026-04-20', 'in_progress', today)).toEqual({ tone: 'normal' });
    expect(classifyScheduled('2026-04-20', 'completed', today)).toEqual({ tone: 'normal' });
    expect(classifyScheduled('2026-04-20', 'cancelled', today)).toEqual({ tone: 'normal' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/maintenance/logic.test.ts`

Expected: FAIL with module-not-found for `@/lib/maintenance/logic`.

- [ ] **Step 3: Implement logic**

Create `src/lib/maintenance/logic.ts`:

```ts
import type { MaintenanceStatus } from './types';

export interface Progress {
  completed: number;
  total: number;
  percent: number;
}

export function computeProgress(completed: number, total: number): Progress {
  if (total === 0) return { completed: 0, total: 0, percent: 0 };
  return {
    completed,
    total,
    percent: Math.floor((completed / total) * 100),
  };
}

export type ScheduledClassification =
  | { tone: 'none' }
  | { tone: 'normal' }
  | { tone: 'overdue'; daysAgo: number }
  | { tone: 'soon'; daysUntil: number };

function diffDays(a: string, b: string): number {
  const aMs = Date.parse(a + 'T00:00:00Z');
  const bMs = Date.parse(b + 'T00:00:00Z');
  return Math.round((aMs - bMs) / 86400000);
}

export function classifyScheduled(
  scheduledFor: string | null,
  status: MaintenanceStatus,
  today: string,
): ScheduledClassification {
  if (!scheduledFor) return { tone: 'none' };
  if (status !== 'planned') return { tone: 'normal' };
  const delta = diffDays(scheduledFor, today); // positive = future
  if (delta < 0) return { tone: 'overdue', daysAgo: -delta };
  if (delta <= 14) return { tone: 'soon', daysUntil: delta };
  return { tone: 'normal' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/maintenance/logic.test.ts`

Expected: PASS (all 9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/maintenance/logic.ts src/__tests__/maintenance/logic.test.ts
git commit -m "feat(maintenance): add progress + scheduled classification helpers"
```

---

## Task 5: Server actions — project CRUD

**Files:**
- Create: `src/lib/maintenance/actions.ts`

Actions match the codebase's existing `src/lib/knowledge/actions.ts` shape: `'use server'`, `createClient()` from `@/lib/supabase/server`, `supabase.auth.getUser()` auth check up front, return `{ success } | { error }`.

- [ ] **Step 1: Write actions.ts (project CRUD only; linking actions added in Task 6)**

Create `src/lib/maintenance/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  createMaintenanceProjectSchema,
  updateMaintenanceProjectSchema,
} from './schemas';

type Ok<T extends object> = { success: true } & T;
type Err = { error: string };

export async function createMaintenanceProject(
  input: unknown,
): Promise<Ok<{ id: string; propertySlug: string }> | Err> {
  const parsed = createMaintenanceProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  // Need the property slug to revalidate the list route.
  const { data: prop, error: propErr } = await supabase
    .from('properties')
    .select('slug')
    .eq('id', parsed.data.propertyId)
    .single();
  if (propErr || !prop) return { error: 'Property not found.' };

  const { data, error } = await supabase
    .from('maintenance_projects')
    .insert({
      org_id: parsed.data.orgId,
      property_id: parsed.data.propertyId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      scheduled_for: parsed.data.scheduledFor ?? null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single();
  if (error || !data) return { error: `Create failed: ${error?.message ?? 'unknown'}` };

  revalidatePath(`/admin/properties/${prop.slug}/maintenance`);
  return { success: true, id: data.id as string, propertySlug: prop.slug as string };
}

export async function updateMaintenanceProject(
  id: string,
  input: unknown,
): Promise<Ok<{}> | Err> {
  const parsed = updateMaintenanceProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const updates: Record<string, unknown> = { updated_by: user.id };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.scheduledFor !== undefined) updates.scheduled_for = parsed.data.scheduledFor;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const { data: project, error } = await supabase
    .from('maintenance_projects')
    .update(updates)
    .eq('id', id)
    .select('property_id')
    .single();
  if (error || !project) return { error: `Update failed: ${error?.message ?? 'unknown'}` };

  const { data: prop } = await supabase
    .from('properties')
    .select('slug')
    .eq('id', project.property_id)
    .single();
  if (prop?.slug) {
    revalidatePath(`/admin/properties/${prop.slug}/maintenance`);
    revalidatePath(`/admin/properties/${prop.slug}/maintenance/${id}`);
  }
  return { success: true };
}

export async function deleteMaintenanceProject(id: string): Promise<Ok<{}> | Err> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('property_id')
    .eq('id', id)
    .single();

  const { error } = await supabase.from('maintenance_projects').delete().eq('id', id);
  if (error) return { error: `Delete failed: ${error.message}` };

  if (project?.property_id) {
    const { data: prop } = await supabase
      .from('properties')
      .select('slug')
      .eq('id', project.property_id)
      .single();
    if (prop?.slug) revalidatePath(`/admin/properties/${prop.slug}/maintenance`);
  }
  return { success: true };
}
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/maintenance/actions.ts
git commit -m "feat(maintenance): add project CRUD server actions"
```

---

## Task 6: Server actions — item and knowledge linking

**Files:**
- Modify: `src/lib/maintenance/actions.ts`

- [ ] **Step 1: Append linking actions**

Add to the end of `src/lib/maintenance/actions.ts`:

Add these new schema imports alongside the existing `import { createMaintenanceProjectSchema, updateMaintenanceProjectSchema } from './schemas';` line — merge into one import statement rather than adding a second import from the same file:

```ts
import {
  createMaintenanceProjectSchema,
  updateMaintenanceProjectSchema,
  linkItemsSchema,
  linkKnowledgeSchema,
  setItemCompletionSchema,
} from './schemas';
```

Then append these functions to the bottom of the file:

```ts
async function revalidateForProject(supabase: ReturnType<typeof createClient>, projectId: string) {
  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('property_id')
    .eq('id', projectId)
    .single();
  if (!project?.property_id) return;
  const { data: prop } = await supabase
    .from('properties')
    .select('slug')
    .eq('id', project.property_id)
    .single();
  if (prop?.slug) revalidatePath(`/admin/properties/${prop.slug}/maintenance/${projectId}`);
}

export async function addItemsToProject(input: unknown): Promise<Ok<{}> | Err> {
  const parsed = linkItemsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('org_id')
    .eq('id', parsed.data.projectId)
    .single();
  if (!project) return { error: 'Project not found.' };

  const rows = parsed.data.itemIds.map((item_id) => ({
    maintenance_project_id: parsed.data.projectId,
    item_id,
    org_id: project.org_id,
  }));

  const { error } = await supabase
    .from('maintenance_project_items')
    .upsert(rows, { onConflict: 'maintenance_project_id,item_id', ignoreDuplicates: true });
  if (error) return { error: `Add items failed: ${error.message}` };

  await revalidateForProject(supabase, parsed.data.projectId);
  return { success: true };
}

export async function removeItemFromProject(
  projectId: string,
  itemId: string,
): Promise<Ok<{}> | Err> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('maintenance_project_items')
    .delete()
    .eq('maintenance_project_id', projectId)
    .eq('item_id', itemId);
  if (error) return { error: `Remove failed: ${error.message}` };

  await revalidateForProject(supabase, projectId);
  return { success: true };
}

export async function setItemCompletion(input: unknown): Promise<Ok<{}> | Err> {
  const parsed = setItemCompletionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('maintenance_project_items')
    .update({
      completed_at: parsed.data.completed ? new Date().toISOString() : null,
      completed_by: parsed.data.completed ? user.id : null,
    })
    .eq('maintenance_project_id', parsed.data.projectId)
    .eq('item_id', parsed.data.itemId);
  if (error) return { error: `Update failed: ${error.message}` };

  await revalidateForProject(supabase, parsed.data.projectId);
  return { success: true };
}

export async function addKnowledgeToProject(input: unknown): Promise<Ok<{}> | Err> {
  const parsed = linkKnowledgeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('org_id')
    .eq('id', parsed.data.projectId)
    .single();
  if (!project) return { error: 'Project not found.' };

  const rows = parsed.data.knowledgeIds.map((knowledge_item_id) => ({
    maintenance_project_id: parsed.data.projectId,
    knowledge_item_id,
    org_id: project.org_id,
  }));

  const { error } = await supabase
    .from('maintenance_project_knowledge')
    .upsert(rows, { onConflict: 'maintenance_project_id,knowledge_item_id', ignoreDuplicates: true });
  if (error) return { error: `Add knowledge failed: ${error.message}` };

  await revalidateForProject(supabase, parsed.data.projectId);
  return { success: true };
}

export async function removeKnowledgeFromProject(
  projectId: string,
  knowledgeId: string,
): Promise<Ok<{}> | Err> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('maintenance_project_knowledge')
    .delete()
    .eq('maintenance_project_id', projectId)
    .eq('knowledge_item_id', knowledgeId);
  if (error) return { error: `Remove failed: ${error.message}` };

  await revalidateForProject(supabase, projectId);
  return { success: true };
}
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/maintenance/actions.ts
git commit -m "feat(maintenance): add item + knowledge linking actions"
```

---

## Task 7: MaintenanceStatusPill component

**Files:**
- Create: `src/components/maintenance/MaintenanceStatusPill.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/maintenance/MaintenanceStatusPill.tsx`:

```tsx
import type { MaintenanceStatus } from '@/lib/maintenance/types';

const STYLE: Record<MaintenanceStatus, { label: string; bg: string; fg: string }> = {
  planned:     { label: 'Planned',     bg: 'bg-amber-100',  fg: 'text-amber-800' },
  in_progress: { label: 'In progress', bg: 'bg-blue-100',   fg: 'text-blue-800'  },
  completed:   { label: 'Completed',   bg: 'bg-green-100',  fg: 'text-green-800' },
  cancelled:   { label: 'Cancelled',   bg: 'bg-gray-100',   fg: 'text-gray-700'  },
};

interface Props {
  status: MaintenanceStatus;
  size?: 'sm' | 'md';
}

export function MaintenanceStatusPill({ status, size = 'md' }: Props) {
  const style = STYLE[status];
  const sizeClasses = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span
      aria-label={`Status: ${style.label}`}
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses} ${style.bg} ${style.fg}`}
    >
      {style.label}
    </span>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/maintenance/MaintenanceStatusPill.tsx
git commit -m "feat(maintenance): add MaintenanceStatusPill component"
```

---

## Task 8: MaintenanceStatCard component

**Files:**
- Create: `src/components/maintenance/MaintenanceStatCard.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/maintenance/MaintenanceStatCard.tsx`:

```tsx
interface Props {
  label: string;
  value: number;
  tint: 'blue' | 'amber' | 'red' | 'green';
}

const TINT: Record<Props['tint'], { bg: string; fg: string }> = {
  blue:  { bg: 'bg-blue-100',  fg: 'text-blue-800'  },
  amber: { bg: 'bg-amber-100', fg: 'text-amber-800' },
  red:   { bg: 'bg-red-100',   fg: 'text-red-800'   },
  green: { bg: 'bg-green-100', fg: 'text-green-800' },
};

export function MaintenanceStatCard({ label, value, tint }: Props) {
  const t = TINT[tint];
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.bg} ${t.fg} text-lg font-semibold`}>
        {value}
      </div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/maintenance/MaintenanceStatCard.tsx
git commit -m "feat(maintenance): add MaintenanceStatCard component"
```

---

## Task 9: MaintenanceProjectRow component (TDD)

**Files:**
- Create: `src/components/maintenance/MaintenanceProjectRow.tsx`
- Test: `src/__tests__/maintenance/MaintenanceProjectRow.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/maintenance/MaintenanceProjectRow.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaintenanceProjectRow } from '@/components/maintenance/MaintenanceProjectRow';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

const today = '2026-04-23';

function makeRow(overrides: Partial<MaintenanceProjectRowData> = {}): MaintenanceProjectRowData {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    org_id: 'o1',
    property_id: 'p1',
    title: 'Spring cleanout',
    description: null,
    status: 'planned',
    scheduled_for: '2026-05-15',
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
    items_completed: 0,
    items_total: 12,
    knowledge_count: 0,
    creator_name: 'Sarah K.',
    ...overrides,
  };
}

describe('MaintenanceProjectRow', () => {
  it('renders the title and status pill', () => {
    render(<MaintenanceProjectRow row={makeRow()} today={today} propertySlug="park" />);
    expect(screen.getByText('Spring cleanout')).toBeInTheDocument();
    expect(screen.getByLabelText(/Status: Planned/)).toBeInTheDocument();
  });

  it('shows Overdue badge for planned rows in the past', () => {
    const row = makeRow({ scheduled_for: '2026-04-20' });
    render(<MaintenanceProjectRow row={row} today={today} propertySlug="park" />);
    expect(screen.getByText(/Overdue/)).toBeInTheDocument();
  });

  it('does not show Overdue badge for completed rows', () => {
    const row = makeRow({ status: 'completed', scheduled_for: '2026-04-20' });
    render(<MaintenanceProjectRow row={row} today={today} propertySlug="park" />);
    expect(screen.queryByText(/Overdue/)).toBeNull();
  });

  it('shows a progress bar only when in progress', () => {
    const inProgress = makeRow({ status: 'in_progress', items_completed: 4, items_total: 12 });
    const { rerender, container } = render(
      <MaintenanceProjectRow row={inProgress} today={today} propertySlug="park" />,
    );
    expect(container.querySelector('[data-testid="progress-bar"]')).not.toBeNull();

    rerender(<MaintenanceProjectRow row={makeRow()} today={today} propertySlug="park" />);
    expect(container.querySelector('[data-testid="progress-bar"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceProjectRow.test.tsx`

Expected: FAIL with module-not-found for `@/components/maintenance/MaintenanceProjectRow`.

- [ ] **Step 3: Write the component**

Create `src/components/maintenance/MaintenanceProjectRow.tsx`:

```tsx
import Link from 'next/link';
import { MaintenanceStatusPill } from './MaintenanceStatusPill';
import { classifyScheduled, computeProgress } from '@/lib/maintenance/logic';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

interface Props {
  row: MaintenanceProjectRowData;
  today: string;
  propertySlug: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : '')).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MaintenanceProjectRow({ row, today, propertySlug }: Props) {
  const schedule = classifyScheduled(row.scheduled_for, row.status, today);
  const progress = computeProgress(row.items_completed, row.items_total);
  const href = `/admin/properties/${propertySlug}/maintenance/${row.id}`;

  return (
    <Link
      href={href}
      className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-5 px-5 py-4 border-b border-sage-light hover:bg-sage-light/20 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="font-heading text-forest-dark text-[15px] font-semibold truncate">
            {row.title}
          </span>
          <MaintenanceStatusPill status={row.status} size="sm" />
          {schedule.tone === 'overdue' && (
            <span className="inline-flex items-center rounded-full bg-red-100 text-red-800 text-[11px] px-2 py-0.5 font-medium">
              Overdue
            </span>
          )}
          {schedule.tone === 'soon' && (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 font-medium">
              in {schedule.daysUntil}d
            </span>
          )}
        </div>
        <div className="text-[12px] text-gray-600 flex flex-wrap gap-3">
          <span>{formatDate(row.scheduled_for)}</span>
          <span>{row.items_total} items</span>
          {row.knowledge_count > 0 && (
            <span>{row.knowledge_count} article{row.knowledge_count > 1 ? 's' : ''}</span>
          )}
          {row.creator_name && <span className="opacity-70">by {row.creator_name}</span>}
        </div>
      </div>

      {row.status === 'in_progress' ? (
        <div className="w-[140px]">
          <div className="text-[11px] text-right text-gray-600 mb-1">
            {progress.completed}/{progress.total} done
          </div>
          <div className="h-1.5 rounded-full bg-sage-light overflow-hidden" data-testid="progress-bar">
            <div className="h-full bg-forest" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      ) : (
        <div className="w-[140px]" />
      )}

      <div className="text-[11px] text-right w-[90px] text-gray-600">
        {row.status === 'completed' ? 'Completed' : 'Updated'}
        <br />
        <span className="text-forest-dark font-medium">{formatDate(row.updated_at.slice(0, 10))}</span>
      </div>

      <span aria-hidden className="text-sage">→</span>
    </Link>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceProjectRow.test.tsx`

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/maintenance/MaintenanceProjectRow.tsx src/__tests__/maintenance/MaintenanceProjectRow.test.tsx
git commit -m "feat(maintenance): add MaintenanceProjectRow component"
```

---

## Task 10: State screens (Empty, Loading, Error)

**Files:**
- Create: `src/components/maintenance/MaintenanceEmpty.tsx`
- Create: `src/components/maintenance/MaintenanceLoading.tsx`
- Create: `src/components/maintenance/MaintenanceError.tsx`

- [ ] **Step 1: Write MaintenanceEmpty**

Create `src/components/maintenance/MaintenanceEmpty.tsx`:

```tsx
import Link from 'next/link';

interface Props {
  newProjectHref: string;
}

export function MaintenanceEmpty({ newProjectHref }: Props) {
  return (
    <div className="text-center py-12 px-5 text-gray-600">
      <div className="w-14 h-14 rounded-2xl bg-sage-light mx-auto mb-3 flex items-center justify-center text-forest text-2xl" aria-hidden>
        📋
      </div>
      <div className="text-forest-dark font-semibold text-[15px] mb-1">
        No maintenance projects yet
      </div>
      <div className="text-[13px] mb-4 max-w-sm mx-auto">
        Plan seasonal work, repairs, and group efforts across your map items.
      </div>
      <Link href={newProjectHref} className="btn-primary inline-flex">
        + New project
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Write MaintenanceLoading**

Create `src/components/maintenance/MaintenanceLoading.tsx`:

```tsx
export function MaintenanceLoading() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Loading">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-16" />
        ))}
      </div>
      <div className="card p-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[72px] border-b border-sage-light/50 last:border-b-0 px-5 py-4">
            <div className="h-4 bg-sage-light rounded w-1/3 mb-2" />
            <div className="h-3 bg-sage-light/60 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write MaintenanceError**

Create `src/components/maintenance/MaintenanceError.tsx`:

```tsx
'use client';

interface Props {
  message?: string;
  onRetry: () => void;
}

export function MaintenanceError({ message, onRetry }: Props) {
  return (
    <div className="card p-6 text-center">
      <div className="text-red-800 font-semibold text-[15px] mb-2">Something went wrong</div>
      {message && <div className="text-[13px] text-gray-600 mb-4">{message}</div>}
      <button onClick={onRetry} className="btn-secondary">Retry</button>
    </div>
  );
}
```

- [ ] **Step 4: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/maintenance/MaintenanceEmpty.tsx src/components/maintenance/MaintenanceLoading.tsx src/components/maintenance/MaintenanceError.tsx
git commit -m "feat(maintenance): add empty, loading, and error state screens"
```

---

## Task 11: Interim pickers

**Files:**
- Create: `src/components/maintenance/MaintenanceItemPickerInterim.tsx`
- Create: `src/components/maintenance/MaintenanceKnowledgePickerInterim.tsx`

- [ ] **Step 1: Write MaintenanceItemPickerInterim**

Create `src/components/maintenance/MaintenanceItemPickerInterim.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addItemsToProject } from '@/lib/maintenance/actions';
import { useRouter } from 'next/navigation';

interface ItemOption {
  id: string;
  name: string;
}

interface Props {
  projectId: string;
  propertyId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}

export function MaintenanceItemPickerInterim({
  projectId,
  propertyId,
  alreadyLinkedIds,
  onClose,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ItemOption[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('items')
      .select('id, name')
      .eq('property_id', propertyId)
      .order('name')
      .then(({ data }) => {
        setItems(
          (data ?? [])
            .filter((i) => !alreadyLinkedIds.includes(i.id as string))
            .map((i) => ({ id: i.id as string, name: (i.name as string) ?? 'Unnamed' })),
        );
      });
  }, [propertyId, alreadyLinkedIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    const result = await addItemsToProject({
      projectId,
      itemIds: Array.from(selected),
    });
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="card max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-sage-light flex items-center justify-between">
          <h2 className="font-heading text-forest-dark text-lg">Add items</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">✕</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          {items === null ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-600">All items are already linked.</div>
          ) : (
            <ul className="space-y-1">
              {items.map((it) => (
                <li key={it.id}>
                  <label className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-sage-light/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(it.id)}
                      onChange={() => toggle(it.id)}
                    />
                    <span className="text-sm">{it.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <div className="px-4 py-2 text-[13px] text-red-700 bg-red-50">{error}</div>}
        <div className="p-4 border-t border-sage-light flex items-center justify-between gap-3">
          <span className="text-xs text-gray-600">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
            <button onClick={handleAdd} className="btn-primary" disabled={saving || selected.size === 0}>
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write MaintenanceKnowledgePickerInterim**

Create `src/components/maintenance/MaintenanceKnowledgePickerInterim.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addKnowledgeToProject } from '@/lib/maintenance/actions';
import { useRouter } from 'next/navigation';

interface KnowledgeOption {
  id: string;
  title: string;
  visibility: 'org' | 'public';
}

interface Props {
  projectId: string;
  orgId: string;
  alreadyLinkedIds: string[];
  onClose: () => void;
}

export function MaintenanceKnowledgePickerInterim({
  projectId,
  orgId,
  alreadyLinkedIds,
  onClose,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeOption[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('knowledge_items')
      .select('id, title, visibility')
      .eq('org_id', orgId)
      .order('title')
      .then(({ data }) => {
        setItems(
          (data ?? [])
            .filter((k) => !alreadyLinkedIds.includes(k.id as string))
            .map((k) => ({
              id: k.id as string,
              title: k.title as string,
              visibility: k.visibility as 'org' | 'public',
            })),
        );
      });
  }, [orgId, alreadyLinkedIds]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    const result = await addKnowledgeToProject({
      projectId,
      knowledgeIds: Array.from(selected),
    });
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="card max-w-lg w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-sage-light flex items-center justify-between">
          <h2 className="font-heading text-forest-dark text-lg">Add articles</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">✕</button>
        </div>
        <div className="overflow-auto flex-1 p-4">
          {items === null ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-600">No articles to link.</div>
          ) : (
            <ul className="space-y-1">
              {items.map((k) => (
                <li key={k.id}>
                  <label className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-sage-light/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(k.id)}
                      onChange={() => toggle(k.id)}
                    />
                    <span className="text-sm flex-1">{k.title}</span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">{k.visibility}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error && <div className="px-4 py-2 text-[13px] text-red-700 bg-red-50">{error}</div>}
        <div className="p-4 border-t border-sage-light flex items-center justify-between gap-3">
          <span className="text-xs text-gray-600">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
            <button onClick={handleAdd} className="btn-primary" disabled={saving || selected.size === 0}>
              {saving ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/maintenance/MaintenanceItemPickerInterim.tsx src/components/maintenance/MaintenanceKnowledgePickerInterim.tsx
git commit -m "feat(maintenance): add interim item and knowledge pickers"
```

---

## Task 12: List page and client

**Files:**
- Create: `src/app/admin/properties/[slug]/maintenance/page.tsx`
- Create: `src/app/admin/properties/[slug]/maintenance/MaintenanceListClient.tsx`
- Create: `src/app/admin/properties/[slug]/maintenance/loading.tsx`
- Create: `src/app/admin/properties/[slug]/maintenance/error.tsx`
- Test: `src/__tests__/maintenance/MaintenanceListClient.test.tsx`

- [ ] **Step 1: Write failing test for MaintenanceListClient**

Create `src/__tests__/maintenance/MaintenanceListClient.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaintenanceListClient } from '@/app/admin/properties/[slug]/maintenance/MaintenanceListClient';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

const today = '2026-04-23';

function makeRow(
  id: string,
  overrides: Partial<MaintenanceProjectRowData> = {},
): MaintenanceProjectRowData {
  return {
    id,
    org_id: 'o1',
    property_id: 'p1',
    title: `Project ${id}`,
    description: null,
    status: 'planned',
    scheduled_for: '2026-06-01',
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    items_completed: 0,
    items_total: 1,
    knowledge_count: 0,
    creator_name: 'Sarah',
    ...overrides,
  };
}

describe('MaintenanceListClient', () => {
  const rows: MaintenanceProjectRowData[] = [
    makeRow('a1', { status: 'planned', title: 'Alpha' }),
    makeRow('a2', { status: 'in_progress', title: 'Beta' }),
    makeRow('a3', { status: 'completed', title: 'Gamma' }),
    makeRow('a4', { status: 'cancelled', title: 'Delta' }),
  ];

  it('defaults to Active tab, showing planned + in_progress', () => {
    render(<MaintenanceListClient rows={rows} today={today} propertySlug="park" />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Gamma')).toBeNull();
    expect(screen.queryByText('Delta')).toBeNull();
  });

  it('switches to Completed tab', () => {
    render(<MaintenanceListClient rows={rows} today={today} propertySlug="park" />);
    fireEvent.click(screen.getByRole('button', { name: /Completed/ }));
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('search narrows to matching titles within the current tab', () => {
    render(<MaintenanceListClient rows={rows} today={today} propertySlug="park" />);
    fireEvent.change(screen.getByPlaceholderText(/Search projects/), { target: { value: 'Alp' } });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).toBeNull();
  });

  it('shows "No matches" when filter yields nothing', () => {
    render(<MaintenanceListClient rows={rows} today={today} propertySlug="park" />);
    fireEvent.change(screen.getByPlaceholderText(/Search projects/), { target: { value: 'zzz' } });
    expect(screen.getByText(/No matches/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceListClient.test.tsx`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write MaintenanceListClient**

Create `src/app/admin/properties/[slug]/maintenance/MaintenanceListClient.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MaintenanceProjectRow } from '@/components/maintenance/MaintenanceProjectRow';
import { MaintenanceStatCard } from '@/components/maintenance/MaintenanceStatCard';
import { classifyScheduled } from '@/lib/maintenance/logic';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

type Tab = 'active' | 'completed' | 'cancelled' | 'all';

interface Props {
  rows: MaintenanceProjectRowData[];
  today: string;
  propertySlug: string;
}

export function MaintenanceListClient({ rows, today, propertySlug }: Props) {
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const active = rows.filter((r) => r.status === 'planned' || r.status === 'in_progress').length;
    const completed = rows.filter((r) => r.status === 'completed').length;
    const cancelled = rows.filter((r) => r.status === 'cancelled').length;
    return { active, completed, cancelled, all: rows.length };
  }, [rows]);

  const stats = useMemo(() => {
    const inProgress = rows.filter((r) => r.status === 'in_progress').length;
    let overdue = 0;
    let dueSoon = 0;
    for (const r of rows) {
      const c = classifyScheduled(r.scheduled_for, r.status, today);
      if (c.tone === 'overdue') overdue++;
      else if (c.tone === 'soon') dueSoon++;
    }
    const year = today.slice(0, 4);
    const completedThisYear = rows.filter(
      (r) => r.status === 'completed' && r.updated_at.slice(0, 4) === year,
    ).length;
    return { inProgress, overdue, dueSoon, completedThisYear };
  }, [rows, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === 'active' && !(r.status === 'planned' || r.status === 'in_progress')) return false;
      if (tab === 'completed' && r.status !== 'completed') return false;
      if (tab === 'cancelled' && r.status !== 'cancelled') return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, search]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Admin · Data</div>
          <h1 className="font-heading text-2xl font-semibold text-forest-dark">Scheduled Maintenance</h1>
        </div>
        <Link href={`/admin/properties/${propertySlug}/maintenance/new`} className="btn-primary">
          + New project
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MaintenanceStatCard label="In progress" value={stats.inProgress} tint="blue" />
        <MaintenanceStatCard label="Due in 2 weeks" value={stats.dueSoon} tint="amber" />
        <MaintenanceStatCard label="Overdue" value={stats.overdue} tint="red" />
        <MaintenanceStatCard label="Completed this year" value={stats.completedThisYear} tint="green" />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-sage-light gap-3">
          <div className="flex gap-1.5">
            {(
              [
                ['active', 'Active', counts.active],
                ['completed', 'Completed', counts.completed],
                ['cancelled', 'Cancelled', counts.cancelled],
                ['all', 'All', counts.all],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                  tab === id
                    ? 'bg-sage-light/70 text-forest-dark font-semibold'
                    : 'text-gray-600 hover:bg-sage-light/30 font-medium'
                }`}
              >
                {label}
                <span className="text-[11px] text-gray-500">{count}</span>
              </button>
            ))}
          </div>
          <input
            className="input-field w-64"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-600">No matches.</div>
          ) : (
            filtered.map((r) => (
              <MaintenanceProjectRow key={r.id} row={r} today={today} propertySlug={propertySlug} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceListClient.test.tsx`

Expected: PASS (all 4 tests).

- [ ] **Step 5: Write the server page**

Create `src/app/admin/properties/[slug]/maintenance/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MaintenanceListClient } from './MaintenanceListClient';
import { MaintenanceEmpty } from '@/components/maintenance/MaintenanceEmpty';
import type { MaintenanceProjectRowData } from '@/lib/maintenance/types';

interface PageProps {
  params: { slug: string };
}

export default async function MaintenanceListPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: property } = await supabase
    .from('properties')
    .select('id, org_id')
    .eq('slug', params.slug)
    .single();
  if (!property) notFound();

  const { data: projects } = await supabase
    .from('maintenance_projects')
    .select('*')
    .eq('property_id', property.id)
    .order('updated_at', { ascending: false });

  const projectIds = (projects ?? []).map((p) => p.id as string);

  // Rollup: items_completed, items_total, knowledge_count
  const [{ data: itemCounts }, { data: knowledgeCounts }] = await Promise.all([
    supabase
      .from('maintenance_project_items')
      .select('maintenance_project_id, completed_at')
      .in('maintenance_project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('maintenance_project_knowledge')
      .select('maintenance_project_id')
      .in('maintenance_project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000']),
  ]);

  const byProject = new Map<string, { completed: number; total: number; knowledge: number }>();
  for (const id of projectIds) byProject.set(id, { completed: 0, total: 0, knowledge: 0 });
  for (const row of itemCounts ?? []) {
    const bucket = byProject.get(row.maintenance_project_id as string);
    if (!bucket) continue;
    bucket.total++;
    if (row.completed_at) bucket.completed++;
  }
  for (const row of knowledgeCounts ?? []) {
    const bucket = byProject.get(row.maintenance_project_id as string);
    if (bucket) bucket.knowledge++;
  }

  const rows: MaintenanceProjectRowData[] = (projects ?? []).map((p) => {
    const agg = byProject.get(p.id as string) ?? { completed: 0, total: 0, knowledge: 0 };
    return {
      ...(p as unknown as MaintenanceProjectRowData),
      items_completed: agg.completed,
      items_total: agg.total,
      knowledge_count: agg.knowledge,
      creator_name: null,
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const newHref = `/admin/properties/${params.slug}/maintenance/new`;

  if (rows.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <MaintenanceEmpty newProjectHref={newHref} />
      </div>
    );
  }

  return <MaintenanceListClient rows={rows} today={today} propertySlug={params.slug} />;
}
```

- [ ] **Step 6: Write loading.tsx and error.tsx**

Create `src/app/admin/properties/[slug]/maintenance/loading.tsx`:

```tsx
import { MaintenanceLoading } from '@/components/maintenance/MaintenanceLoading';

export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <MaintenanceLoading />
    </div>
  );
}
```

Create `src/app/admin/properties/[slug]/maintenance/error.tsx`:

```tsx
'use client';

import { MaintenanceError } from '@/components/maintenance/MaintenanceError';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <MaintenanceError message={error.message} onRetry={reset} />
    </div>
  );
}
```

- [ ] **Step 7: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/properties/\[slug\]/maintenance/ src/__tests__/maintenance/MaintenanceListClient.test.tsx
git commit -m "feat(maintenance): add list page with tabs, search, and state screens"
```

---

## Task 13: Create page

**Files:**
- Create: `src/app/admin/properties/[slug]/maintenance/new/page.tsx`
- Create: `src/app/admin/properties/[slug]/maintenance/new/MaintenanceCreateForm.tsx`

- [ ] **Step 1: Write the server page**

Create `src/app/admin/properties/[slug]/maintenance/new/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MaintenanceCreateForm } from './MaintenanceCreateForm';

interface PageProps {
  params: { slug: string };
}

export default async function NewMaintenanceProjectPage({ params }: PageProps) {
  const supabase = createClient();
  const { data: property } = await supabase
    .from('properties')
    .select('id, org_id, name')
    .eq('slug', params.slug)
    .single();
  if (!property) notFound();

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="text-[11px] uppercase tracking-wider text-gray-500">Admin · Data · Maintenance</div>
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-6">New maintenance project</h1>
      <MaintenanceCreateForm
        orgId={property.org_id as string}
        propertyId={property.id as string}
        propertySlug={params.slug}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write the client form**

Create `src/app/admin/properties/[slug]/maintenance/new/MaintenanceCreateForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createMaintenanceProject } from '@/lib/maintenance/actions';

interface Props {
  orgId: string;
  propertyId: string;
  propertySlug: string;
}

export function MaintenanceCreateForm({ orgId, propertyId, propertySlug }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createMaintenanceProject({
      orgId,
      propertyId,
      title,
      description: description || undefined,
      scheduledFor: scheduledFor || null,
    });
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    router.push(`/admin/properties/${propertySlug}/maintenance/${result.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input
          id="title"
          className="input-field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          autoFocus
        />
      </div>

      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea
          id="description"
          className="input-field min-h-[96px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
        />
      </div>

      <div>
        <label className="label" htmlFor="scheduled_for">Scheduled date</label>
        <input
          id="scheduled_for"
          type="date"
          className="input-field"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
        />
      </div>

      {error && <div className="text-[13px] text-red-700 bg-red-50 px-3 py-2 rounded">{error}</div>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/admin/properties/${propertySlug}/maintenance`)}
          className="btn-secondary"
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving || !title.trim()}>
          {saving ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/properties/\[slug\]/maintenance/new/
git commit -m "feat(maintenance): add create-project page and form"
```

---

## Task 14: Detail page (server) and form (client) with tests

**Files:**
- Create: `src/app/admin/properties/[slug]/maintenance/[id]/page.tsx`
- Create: `src/app/admin/properties/[slug]/maintenance/[id]/MaintenanceDetailForm.tsx`
- Test: `src/__tests__/maintenance/MaintenanceDetailForm.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/maintenance/MaintenanceDetailForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MaintenanceDetailForm } from '@/app/admin/properties/[slug]/maintenance/[id]/MaintenanceDetailForm';
import type { MaintenanceProject } from '@/lib/maintenance/types';

const updateSpy = vi.fn(async () => ({ success: true as const }));
vi.mock('@/lib/maintenance/actions', () => ({
  updateMaintenanceProject: (...args: unknown[]) => updateSpy(...args),
  deleteMaintenanceProject: vi.fn(),
}));

function makeProject(overrides: Partial<MaintenanceProject> = {}): MaintenanceProject {
  return {
    id: 'p-1',
    org_id: 'o1',
    property_id: 'prop1',
    title: 'Spring cleanout',
    description: null,
    status: 'planned',
    scheduled_for: '2026-05-15',
    created_by: 'u1',
    updated_by: 'u1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
    ...overrides,
  };
}

describe('MaintenanceDetailForm', () => {
  beforeEach(() => updateSpy.mockClear());

  it('Save button is disabled when form is unchanged', () => {
    render(<MaintenanceDetailForm project={makeProject()} propertySlug="park" />);
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  it('Save button enables when a field changes', () => {
    render(<MaintenanceDetailForm project={makeProject()} propertySlug="park" />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'New title' } });
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeEnabled();
  });

  it('rejects empty title', async () => {
    render(<MaintenanceDetailForm project={makeProject()} propertySlug="park" />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: '' } });
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
  });

  it('calls updateMaintenanceProject on save', async () => {
    render(<MaintenanceDetailForm project={makeProject()} propertySlug="park" />);
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy.mock.calls[0][1]).toMatchObject({ title: 'Updated' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceDetailForm.test.tsx`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Write MaintenanceDetailForm**

Create `src/app/admin/properties/[slug]/maintenance/[id]/MaintenanceDetailForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteMaintenanceProject,
  updateMaintenanceProject,
  removeItemFromProject,
  setItemCompletion,
  removeKnowledgeFromProject,
} from '@/lib/maintenance/actions';
import { MaintenanceStatusPill } from '@/components/maintenance/MaintenanceStatusPill';
import { MaintenanceItemPickerInterim } from '@/components/maintenance/MaintenanceItemPickerInterim';
import { MaintenanceKnowledgePickerInterim } from '@/components/maintenance/MaintenanceKnowledgePickerInterim';
import type {
  MaintenanceProject,
  MaintenanceStatus,
  LinkedItem,
  LinkedKnowledge,
} from '@/lib/maintenance/types';

interface Props {
  project: MaintenanceProject;
  propertySlug: string;
  linkedItems?: LinkedItem[];
  linkedKnowledge?: LinkedKnowledge[];
}

export function MaintenanceDetailForm({
  project,
  propertySlug,
  linkedItems = [],
  linkedKnowledge = [],
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? '');
  const [scheduledFor, setScheduledFor] = useState(project.scheduled_for ?? '');
  const [status, setStatus] = useState<MaintenanceStatus>(project.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<null | 'items' | 'knowledge'>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty =
    title !== project.title ||
    description !== (project.description ?? '') ||
    scheduledFor !== (project.scheduled_for ?? '') ||
    status !== project.status;
  const canSave = dirty && title.trim().length > 0;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateMaintenanceProject(project.id, {
      title,
      description: description || null,
      scheduledFor: scheduledFor || null,
      status,
    });
    setSaving(false);
    if ('error' in result) setError(result.error);
    else router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteMaintenanceProject(project.id);
    if ('error' in result) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    router.push(`/admin/properties/${propertySlug}/maintenance`);
  }

  async function toggleItem(itemId: string, completed: boolean) {
    await setItemCompletion({ projectId: project.id, itemId, completed });
    router.refresh();
  }

  async function removeItem(itemId: string) {
    await removeItemFromProject(project.id, itemId);
    router.refresh();
  }

  async function removeKnowledge(knowledgeId: string) {
    await removeKnowledgeFromProject(project.id, knowledgeId);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push(`/admin/properties/${propertySlug}/maintenance`)}
            className="text-sm text-golden hover:opacity-80"
          >
            ← Back
          </button>
          <MaintenanceStatusPill status={status} />
        </div>
        <button
          onClick={() => setConfirmingDelete(true)}
          className="btn-secondary text-red-700"
          disabled={deleting}
        >
          Delete
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input
            id="title"
            className="input-field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea
            id="description"
            className="input-field min-h-[96px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="scheduled_for">Scheduled date</label>
            <input
              id="scheduled_for"
              type="date"
              className="input-field"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select
              id="status"
              className="input-field"
              value={status}
              onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {error && <div className="text-[13px] text-red-700 bg-red-50 px-3 py-2 rounded">{error}</div>}

        <div className="flex justify-end">
          <button onClick={handleSave} className="btn-primary" disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-forest-dark text-lg">Linked items ({linkedItems.length})</h2>
          <button onClick={() => setOpenPicker('items')} className="btn-secondary text-sm">
            + Add items
          </button>
        </div>
        {linkedItems.length === 0 ? (
          <div className="text-sm text-gray-600">No items linked yet.</div>
        ) : (
          <ul className="divide-y divide-sage-light">
            {linkedItems.map((it) => (
              <li key={it.item_id} className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  checked={!!it.completed_at}
                  onChange={(e) => toggleItem(it.item_id, e.target.checked)}
                  aria-label={`Mark ${it.name} complete`}
                />
                <span className="flex-1 text-sm">
                  {it.name}
                  {it.type_name && <span className="text-gray-500"> · {it.type_name}</span>}
                </span>
                <button
                  onClick={() => removeItem(it.item_id)}
                  className="text-xs text-gray-500 hover:text-red-700"
                  aria-label={`Remove ${it.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-forest-dark text-lg">Linked articles ({linkedKnowledge.length})</h2>
          <button onClick={() => setOpenPicker('knowledge')} className="btn-secondary text-sm">
            + Add articles
          </button>
        </div>
        {linkedKnowledge.length === 0 ? (
          <div className="text-sm text-gray-600">No articles linked yet.</div>
        ) : (
          <ul className="divide-y divide-sage-light">
            {linkedKnowledge.map((k) => (
              <li key={k.knowledge_item_id} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-sm">
                  {k.title}
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 ml-2">{k.visibility}</span>
                </span>
                <button
                  onClick={() => removeKnowledge(k.knowledge_item_id)}
                  className="text-xs text-gray-500 hover:text-red-700"
                  aria-label={`Remove ${k.title}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openPicker === 'items' && project.property_id && (
        <MaintenanceItemPickerInterim
          projectId={project.id}
          propertyId={project.property_id}
          alreadyLinkedIds={linkedItems.map((i) => i.item_id)}
          onClose={() => setOpenPicker(null)}
        />
      )}
      {openPicker === 'knowledge' && (
        <MaintenanceKnowledgePickerInterim
          projectId={project.id}
          orgId={project.org_id}
          alreadyLinkedIds={linkedKnowledge.map((k) => k.knowledge_item_id)}
          onClose={() => setOpenPicker(null)}
        />
      )}

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="card max-w-sm w-full p-5">
            <h3 className="font-heading text-forest-dark text-lg mb-2">Delete project?</h3>
            <p className="text-sm text-gray-600 mb-4">This cannot be undone. Linked items and knowledge will be unlinked.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="btn-secondary"
                disabled={deleting}
                autoFocus
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="btn-primary"
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/__tests__/maintenance/MaintenanceDetailForm.test.tsx`

Expected: PASS (all 4 tests).

- [ ] **Step 5: Write the server detail page**

Create `src/app/admin/properties/[slug]/maintenance/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { MaintenanceDetailForm } from './MaintenanceDetailForm';
import type { LinkedItem, LinkedKnowledge, MaintenanceProject } from '@/lib/maintenance/types';

interface PageProps {
  params: { slug: string; id: string };
}

export default async function MaintenanceDetailPage({ params }: PageProps) {
  const supabase = createClient();

  const { data: project } = await supabase
    .from('maintenance_projects')
    .select('*')
    .eq('id', params.id)
    .single();
  if (!project) notFound();

  const { data: linkedItemsRaw } = await supabase
    .from('maintenance_project_items')
    .select('item_id, completed_at, completed_by, items(name, type_id, item_types(name, icon))')
    .eq('maintenance_project_id', params.id);

  const linkedItems: LinkedItem[] = (linkedItemsRaw ?? []).map((row) => {
    const item = (row.items ?? {}) as { name?: string; item_types?: { name?: string; icon?: string } };
    return {
      item_id: row.item_id as string,
      name: item.name ?? 'Unknown item',
      type_name: item.item_types?.name ?? null,
      icon: item.item_types?.icon ?? null,
      last_maintained_at: null, // not surfaced in PR 1
      completed_at: (row.completed_at as string | null) ?? null,
      completed_by: (row.completed_by as string | null) ?? null,
    };
  });

  const { data: linkedKnowledgeRaw } = await supabase
    .from('maintenance_project_knowledge')
    .select('knowledge_item_id, knowledge_items(title, slug, visibility)')
    .eq('maintenance_project_id', params.id);

  const linkedKnowledge: LinkedKnowledge[] = (linkedKnowledgeRaw ?? []).map((row) => {
    const k = (row.knowledge_items ?? {}) as { title?: string; slug?: string; visibility?: 'org' | 'public' };
    return {
      knowledge_item_id: row.knowledge_item_id as string,
      title: k.title ?? 'Untitled',
      slug: k.slug ?? '',
      visibility: k.visibility ?? 'org',
    };
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1">Admin · Data · Maintenance</div>
      <h1 className="font-heading text-2xl font-semibold text-forest-dark mb-5">{project.title}</h1>
      <MaintenanceDetailForm
        project={project as unknown as MaintenanceProject}
        propertySlug={params.slug}
        linkedItems={linkedItems}
        linkedKnowledge={linkedKnowledge}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/properties/\[slug\]/maintenance/\[id\]/ src/__tests__/maintenance/MaintenanceDetailForm.test.tsx
git commit -m "feat(maintenance): add detail page with editable fields, links, and delete"
```

---

## Task 15: Sidebar nav update

**Files:**
- Modify: `src/app/admin/properties/[slug]/layout.tsx`

- [ ] **Step 1: Add the Maintenance entry**

Open `src/app/admin/properties/[slug]/layout.tsx`. Find the `items` array. Insert the new entry after the entity-type spread (the `...entityTypes.map(...)` call) and before the `Knowledge` entry:

```ts
    ...entityTypes.map((et) => ({
      label: `${iconDisplayName(et.icon)} ${et.name}`,
      href: `${base}/entities/${et.id}`,
    })),
    { label: 'Maintenance', href: `${base}/maintenance` },
    { label: 'Knowledge', href: '/admin/knowledge' },
    { label: 'Data Vault', href: `${base}/vault` },
```

- [ ] **Step 2: Verify type-check**

Run: `npm run type-check`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/properties/\[slug\]/layout.tsx
git commit -m "feat(maintenance): add Maintenance entry to property admin sidebar"
```

---

## Task 16: Playwright E2E smoke test

**Files:**
- Create: `e2e/tests/admin/maintenance.spec.ts`

The codebase convention (see `e2e/tests/admin/knowledge.spec.ts`): tests live under `e2e/tests/admin/`, use `test.use({ storageState: ADMIN_AUTH })` with pre-baked auth from `.auth/admin.json`, and tag smoke-eligible tests with `@smoke` in the describe name. The seed test property slug is `default`.

- [ ] **Step 1: Write the smoke spec**

Create `e2e/tests/admin/maintenance.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH = path.join(__dirname, '..', '..', '.auth', 'admin.json');
const TEST_TITLE = `E2E Maintenance ${Date.now()}`;

test.describe.serial('Scheduled Maintenance admin @smoke', () => {
  test.use({ storageState: ADMIN_AUTH });

  test('create a project', async ({ page }) => {
    await page.goto('/admin/properties/default/maintenance');
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: /\+ New project/i }).click();
    await page.waitForURL(/\/maintenance\/new$/);

    await page.getByLabel(/^Title$/).fill(TEST_TITLE);
    await page.getByLabel(/Scheduled date/).fill('2026-05-15');
    await page.getByRole('button', { name: /Create project/i }).click();

    // Land on detail page
    await expect(page.getByRole('heading', { name: TEST_TITLE })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Linked items \(0\)/)).toBeVisible();
  });

  test('add an item and mark it complete', async ({ page }) => {
    await page.goto('/admin/properties/default/maintenance');
    await page.waitForLoadState('networkidle');
    await page.getByText(TEST_TITLE).click();

    await page.getByRole('button', { name: /\+ Add items/i }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.locator('[role="dialog"] input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: /^Add$/ }).click();

    await expect(page.getByText(/Linked items \(1\)/)).toBeVisible({ timeout: 10000 });
    await page.locator('[aria-label^="Mark "]').first().check();
  });

  test('project row appears on list with completion progress', async ({ page }) => {
    await page.goto('/admin/properties/default/maintenance');
    await page.waitForLoadState('networkidle');

    // Change status on detail to in_progress so progress bar surfaces on list
    await page.getByText(TEST_TITLE).click();
    await page.getByLabel(/^Status$/).selectOption('in_progress');
    await page.getByRole('button', { name: /^Save$/ }).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /← Back/ }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(TEST_TITLE)).toBeVisible();
    await expect(page.getByText('1/1 done')).toBeVisible();
  });

  test('delete the project', async ({ page }) => {
    await page.goto('/admin/properties/default/maintenance');
    await page.waitForLoadState('networkidle');
    await page.getByText(TEST_TITLE).click();

    await page.getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /^Delete$/ }).last().click();

    await page.waitForURL(/\/maintenance$/);
    await expect(page.getByText(TEST_TITLE)).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Verify the smoke config picks up the new file**

Run: `grep -R "@smoke" e2e/playwright.config.ts` and confirm the smoke selector is `@smoke`. If the smoke config filters by file pattern instead, adjust the location accordingly (the existing smoke selector pattern in `knowledge.spec.ts` is a `@smoke` tag, so the new spec should be included automatically).

- [ ] **Step 3: Start local Supabase (if not already running) and run the smoke test**

Run:
```bash
npm run supabase:setup   # no-op if already running
npm run test:e2e:smoke -- e2e/tests/admin/maintenance.spec.ts
```

Expected: all four tests PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/admin/maintenance.spec.ts
git commit -m "test(maintenance): add E2E smoke for create, link, complete, delete"
```

---

## Task 17: Final verification pass

- [ ] **Step 1: Run full type-check**

Run: `npm run type-check`

Expected: PASS. If it fails, fix the errors before proceeding.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`

Expected: PASS. All maintenance tests plus the rest of the project test suite.

- [ ] **Step 3: Run smoke E2E**

Run: `npm run test:e2e:smoke`

Expected: PASS.

- [ ] **Step 4: Manual UI pass**

Run: `npm run dev`

Walk through in a browser as a staff user:
- Navigate to `/admin/properties/<slug>/maintenance` → empty state visible with CTA.
- Click **New project** → fill form → create → redirects to detail.
- On detail: add items via picker → mark one complete → remove another.
- Change status to `in_progress`, save → go back to list → row shows progress bar with 1/N.
- Delete the project via the header button (confirm dialog) → returns to list → empty state again.

Capture before/after screenshots per `docs/playbooks/visual-diff-screenshots.md` for the PR description.

- [ ] **Step 5: Final commit (if any polish changes came up in Step 4)**

```bash
git status
# If there are changes, commit them with a focused message.
```

---

## Self-review summary

- **Spec coverage:** All PR 1 scope items in `docs/superpowers/specs/2026-04-23-scheduled-maintenance-design.md` are covered — migration (Task 1), types + schemas (Tasks 2–3), helpers with TDD (Task 4), server actions (Tasks 5–6), shared components (Tasks 7–11), routes (Tasks 12–14), sidebar nav (Task 15), E2E smoke (Task 16), verification (Task 17). Out-of-scope items (pickers modal, public viewer, item-page card, offline sync, org-level UI) intentionally excluded.
- **Placeholders:** None. Task 16 uses the seed property slug `default` and the `ADMIN_AUTH` storage state pattern copied from `e2e/tests/admin/knowledge.spec.ts`.
- **Type consistency:** Names flow through consistently — `MaintenanceProject`, `MaintenanceProjectRowData`, `LinkedItem`, `LinkedKnowledge`, `MaintenanceStatus`, `computeProgress`, `classifyScheduled`. Action signatures match their Zod schemas.
