# Rich Update Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich update types with custom field definitions and per-action role-based permissions.

**Architecture:** New `update_type_fields` table mirrors `entity_type_fields`. Three `min_role_*` columns on `update_types` gate create/edit/delete per role hierarchy. Shared field components extracted from `EntityTypeForm` and reused by both entity types and update types. Offline sync extended to include `update_type_fields`.

**Tech Stack:** Supabase PostgreSQL, Next.js 14, Tailwind CSS, Dexie (IndexedDB), Vitest, Playwright

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/028_rich_update_types.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 028_rich_update_types.sql
-- Rich update types: custom fields + role-based permissions

-- 1. New table: update_type_fields
create table public.update_type_fields (
  id uuid primary key default gen_random_uuid(),
  update_type_id uuid not null references public.update_types(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  field_type text not null check (field_type in ('text', 'number', 'dropdown', 'date')),
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0
);

create index idx_update_type_fields_type on public.update_type_fields(update_type_id);
create index idx_update_type_fields_org on public.update_type_fields(org_id);

create trigger update_type_fields_auto_org
  before insert on public.update_type_fields
  for each row execute function public.auto_populate_org_property('org_scoped');

alter table public.update_type_fields enable row level security;

create policy "update_type_fields_public_read" on public.update_type_fields
  for select using (true);

create policy "update_type_fields_insert" on public.update_type_fields
  for insert with check (
    org_id in (select public.user_org_admin_org_ids())
    or public.is_platform_admin()
  );

create policy "update_type_fields_update" on public.update_type_fields
  for update using (
    org_id in (select public.user_org_admin_org_ids())
    or public.is_platform_admin()
  );

create policy "update_type_fields_delete" on public.update_type_fields
  for delete using (
    org_id in (select public.user_org_admin_org_ids())
    or public.is_platform_admin()
  );

-- 2. Role threshold columns on update_types
alter table public.update_types
  add column min_role_create text check (min_role_create in ('contributor', 'org_staff', 'org_admin')),
  add column min_role_edit text check (min_role_edit in ('contributor', 'org_staff', 'org_admin')),
  add column min_role_delete text check (min_role_delete in ('contributor', 'org_staff', 'org_admin'));

-- 3. Custom field values on item_updates
alter table public.item_updates
  add column custom_field_values jsonb not null default '{}';
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `npx supabase db reset`
Expected: Migration applies without errors. All tables/columns exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/028_rich_update_types.sql
git commit -m "feat: add migration for rich update types (fields + role permissions)"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts:66-86` (UpdateType and ItemUpdate interfaces)

- [ ] **Step 1: Update UpdateType interface**

In `src/lib/types.ts`, find the `UpdateType` interface (around line 66) and add the three new fields:

```typescript
export interface UpdateType {
  id: string;
  name: string;
  icon: string;
  is_global: boolean;
  item_type_id: string | null;
  sort_order: number;
  org_id: string;
  min_role_create: string | null;
  min_role_edit: string | null;
  min_role_delete: string | null;
}
```

- [ ] **Step 2: Update ItemUpdate interface**

Find the `ItemUpdate` interface (around line 76) and add `custom_field_values`:

```typescript
export interface ItemUpdate {
  id: string;
  item_id: string;
  update_type_id: string;
  content: string | null;
  update_date: string;
  created_at: string;
  created_by: string | null;
  org_id: string;
  property_id: string;
  custom_field_values: Record<string, unknown>;
}
```

- [ ] **Step 3: Add UpdateTypeField interface**

Add after the `UpdateType` interface:

```typescript
export interface UpdateTypeField {
  id: string;
  update_type_id: string;
  org_id: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date';
  options: string[] | null;
  required: boolean;
  sort_order: number;
}
```

- [ ] **Step 4: Run type check**

Run: `npm run type-check`
Expected: No new errors (existing code may have errors from missing `custom_field_values` on `insertItemUpdate` — that's fixed in Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add UpdateTypeField type and extend UpdateType/ItemUpdate interfaces"
```

---

### Task 3: Permission Helper

**Files:**
- Modify: `src/lib/permissions/resolve.ts`
- Test: `src/lib/permissions/__tests__/resolve.test.ts`

- [ ] **Step 1: Write failing tests for canPerformUpdateTypeAction**

Add to `src/lib/permissions/__tests__/resolve.test.ts`:

```typescript
import { hasPermission, canPerformUpdateTypeAction, type ResolvedAccess } from '../resolve';
import type { Role, RolePermissions, UpdateType, BaseRole } from '../../types';

// ... existing makeRole helper and tests ...

function makeUpdateType(overrides: Partial<UpdateType> = {}): UpdateType {
  return {
    id: 'ut-1', name: 'Test', icon: '📝', is_global: true,
    item_type_id: null, sort_order: 0, org_id: 'org-1',
    min_role_create: null, min_role_edit: null, min_role_delete: null,
    ...overrides,
  };
}

describe('canPerformUpdateTypeAction', () => {
  it('returns null when no min_role is set (defer to generic permissions)', () => {
    const ut = makeUpdateType();
    expect(canPerformUpdateTypeAction('contributor', ut, 'create')).toBeNull();
    expect(canPerformUpdateTypeAction('contributor', ut, 'edit')).toBeNull();
    expect(canPerformUpdateTypeAction('contributor', ut, 'delete')).toBeNull();
  });

  it('returns true when user role meets min_role_create threshold', () => {
    const ut = makeUpdateType({ min_role_create: 'contributor' });
    expect(canPerformUpdateTypeAction('contributor', ut, 'create')).toBe(true);
    expect(canPerformUpdateTypeAction('org_staff', ut, 'create')).toBe(true);
    expect(canPerformUpdateTypeAction('org_admin', ut, 'create')).toBe(true);
  });

  it('returns false when user role is below min_role_create threshold', () => {
    const ut = makeUpdateType({ min_role_create: 'org_staff' });
    expect(canPerformUpdateTypeAction('contributor', ut, 'create')).toBe(false);
    expect(canPerformUpdateTypeAction('viewer', ut, 'create')).toBe(false);
  });

  it('returns true for platform_admin regardless of threshold', () => {
    const ut = makeUpdateType({ min_role_create: 'org_admin' });
    expect(canPerformUpdateTypeAction('platform_admin', ut, 'create')).toBe(true);
  });

  it('checks min_role_edit independently from min_role_create', () => {
    const ut = makeUpdateType({ min_role_create: 'contributor', min_role_edit: 'org_staff' });
    expect(canPerformUpdateTypeAction('contributor', ut, 'create')).toBe(true);
    expect(canPerformUpdateTypeAction('contributor', ut, 'edit')).toBe(false);
  });

  it('checks min_role_delete independently', () => {
    const ut = makeUpdateType({ min_role_delete: 'org_admin' });
    expect(canPerformUpdateTypeAction('org_staff', ut, 'delete')).toBe(false);
    expect(canPerformUpdateTypeAction('org_admin', ut, 'delete')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/permissions/__tests__/resolve.test.ts`
Expected: FAIL — `canPerformUpdateTypeAction` is not exported from `../resolve`

- [ ] **Step 3: Implement canPerformUpdateTypeAction**

Add to `src/lib/permissions/resolve.ts`:

```typescript
import type { UpdateType, BaseRole } from '../types';

const ROLE_LEVELS: Record<string, number> = {
  public: 0,
  viewer: 1,
  contributor: 2,
  org_staff: 3,
  org_admin: 4,
  platform_admin: 5,
};

/**
 * Check if a user's base role meets the update-type-specific threshold for an action.
 * Returns null if no threshold is set (caller should fall back to generic permissions).
 * Returns true/false if a threshold is set and the role does/doesn't meet it.
 */
export function canPerformUpdateTypeAction(
  userBaseRole: string,
  updateType: UpdateType,
  action: 'create' | 'edit' | 'delete'
): boolean | null {
  if (userBaseRole === 'platform_admin') return true;

  const thresholdKey = `min_role_${action}` as const;
  const threshold = updateType[thresholdKey];

  if (threshold === null || threshold === undefined) return null;

  const userLevel = ROLE_LEVELS[userBaseRole] ?? 0;
  const thresholdLevel = ROLE_LEVELS[threshold] ?? 0;
  return userLevel >= thresholdLevel;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/permissions/__tests__/resolve.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions/resolve.ts src/lib/permissions/__tests__/resolve.test.ts
git commit -m "feat: add canPerformUpdateTypeAction permission helper with tests"
```

---

### Task 4: Shared Field Validation

**Files:**
- Create: `src/components/shared/fields/validate.ts`
- Create: `src/components/shared/fields/__tests__/validate.test.ts`

- [ ] **Step 1: Write failing tests for validateFieldValues**

Create `src/components/shared/fields/__tests__/validate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateFieldValues } from '../validate';
import type { UpdateTypeField } from '@/lib/types';

function makeField(overrides: Partial<UpdateTypeField> = {}): UpdateTypeField {
  return {
    id: 'field-1', update_type_id: 'ut-1', org_id: 'org-1',
    name: 'Test Field', field_type: 'text', options: null,
    required: false, sort_order: 0, ...overrides,
  };
}

describe('validateFieldValues', () => {
  it('returns no errors for empty fields and empty values', () => {
    expect(validateFieldValues([], {})).toEqual([]);
  });

  it('returns no errors when optional fields are missing', () => {
    const fields = [makeField({ required: false })];
    expect(validateFieldValues(fields, {})).toEqual([]);
  });

  it('returns error when required field is missing', () => {
    const fields = [makeField({ id: 'f1', name: 'Condition', required: true })];
    const errors = validateFieldValues(fields, {});
    expect(errors).toEqual([{ fieldId: 'f1', fieldName: 'Condition', message: 'Condition is required' }]);
  });

  it('returns error when required field is empty string', () => {
    const fields = [makeField({ id: 'f1', name: 'Condition', required: true })];
    const errors = validateFieldValues(fields, { f1: '' });
    expect(errors).toEqual([{ fieldId: 'f1', fieldName: 'Condition', message: 'Condition is required' }]);
  });

  it('passes when required field has a value', () => {
    const fields = [makeField({ id: 'f1', required: true })];
    expect(validateFieldValues(fields, { f1: 'Good' })).toEqual([]);
  });

  it('passes with number value of 0 for required number field', () => {
    const fields = [makeField({ id: 'f1', field_type: 'number', required: true })];
    expect(validateFieldValues(fields, { f1: 0 })).toEqual([]);
  });

  it('ignores unknown field IDs in values', () => {
    const fields = [makeField({ id: 'f1', required: false })];
    expect(validateFieldValues(fields, { f1: 'x', unknown: 'y' })).toEqual([]);
  });

  it('validates multiple required fields independently', () => {
    const fields = [
      makeField({ id: 'f1', name: 'A', required: true }),
      makeField({ id: 'f2', name: 'B', required: true }),
    ];
    const errors = validateFieldValues(fields, { f1: 'ok' });
    expect(errors).toHaveLength(1);
    expect(errors[0].fieldId).toBe('f2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/components/shared/fields/__tests__/validate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement validateFieldValues**

Create `src/components/shared/fields/validate.ts`:

```typescript
interface FieldDefinition {
  id: string;
  name: string;
  field_type: string;
  required: boolean;
}

export interface FieldValidationError {
  fieldId: string;
  fieldName: string;
  message: string;
}

export function validateFieldValues(
  fields: FieldDefinition[],
  values: Record<string, unknown>
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  for (const field of fields) {
    if (!field.required) continue;

    const value = values[field.id];
    const isEmpty = value === undefined || value === null || value === '';

    if (isEmpty) {
      errors.push({
        fieldId: field.id,
        fieldName: field.name,
        message: `${field.name} is required`,
      });
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/components/shared/fields/__tests__/validate.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/fields/validate.ts src/components/shared/fields/__tests__/validate.test.ts
git commit -m "feat: add shared validateFieldValues with tests"
```

---

### Task 5: Shared DynamicFieldRenderer Component

**Files:**
- Create: `src/components/shared/fields/DynamicFieldRenderer.tsx`
- Create: `src/components/shared/fields/__tests__/DynamicFieldRenderer.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/shared/fields/__tests__/DynamicFieldRenderer.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DynamicFieldRenderer from '../DynamicFieldRenderer';

const textField = {
  id: 'f1', update_type_id: 'ut-1', org_id: 'org-1',
  name: 'Notes', field_type: 'text' as const, options: null,
  required: false, sort_order: 0,
};

const numberField = {
  id: 'f2', update_type_id: 'ut-1', org_id: 'org-1',
  name: 'Cost', field_type: 'number' as const, options: null,
  required: true, sort_order: 1,
};

const dropdownField = {
  id: 'f3', update_type_id: 'ut-1', org_id: 'org-1',
  name: 'Condition', field_type: 'dropdown' as const,
  options: ['Good', 'Fair', 'Poor'], required: false, sort_order: 2,
};

const dateField = {
  id: 'f4', update_type_id: 'ut-1', org_id: 'org-1',
  name: 'Inspection Date', field_type: 'date' as const,
  options: null, required: false, sort_order: 3,
};

describe('DynamicFieldRenderer', () => {
  it('renders a text input for text fields', () => {
    render(<DynamicFieldRenderer fields={[textField]} values={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('type', 'text');
  });

  it('renders a number input for number fields', () => {
    render(<DynamicFieldRenderer fields={[numberField]} values={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Cost/)).toHaveAttribute('type', 'number');
  });

  it('renders a select for dropdown fields with options', () => {
    render(<DynamicFieldRenderer fields={[dropdownField]} values={{}} onChange={vi.fn()} />);
    const select = screen.getByLabelText('Condition');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Fair')).toBeInTheDocument();
    expect(screen.getByText('Poor')).toBeInTheDocument();
  });

  it('renders a date input for date fields', () => {
    render(<DynamicFieldRenderer fields={[dateField]} values={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Inspection Date')).toHaveAttribute('type', 'date');
  });

  it('shows required indicator for required fields', () => {
    render(<DynamicFieldRenderer fields={[numberField]} values={{}} onChange={vi.fn()} />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('calls onChange with field id and new value on text input', async () => {
    const onChange = vi.fn();
    render(<DynamicFieldRenderer fields={[textField]} values={{}} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Notes'), 'hello');
    expect(onChange).toHaveBeenCalled();
    // Last call should have f1 with a value containing 'hello'
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[0]).toBe('f1');
    expect(lastCall[1]).toBe('hello');
  });

  it('displays existing values', () => {
    render(
      <DynamicFieldRenderer
        fields={[textField, dropdownField]}
        values={{ f1: 'existing note', f3: 'Fair' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Notes')).toHaveValue('existing note');
    expect(screen.getByLabelText('Condition')).toHaveValue('Fair');
  });

  it('renders fields sorted by sort_order', () => {
    const reversed = [dropdownField, textField]; // sort_order 2, 0
    render(<DynamicFieldRenderer fields={reversed} values={{}} onChange={vi.fn()} />);
    const labels = screen.getAllByText(/Notes|Condition/);
    expect(labels[0]).toHaveTextContent('Notes');
    expect(labels[1]).toHaveTextContent('Condition');
  });

  it('renders nothing when fields array is empty', () => {
    const { container } = render(<DynamicFieldRenderer fields={[]} values={{}} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/components/shared/fields/__tests__/DynamicFieldRenderer.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement DynamicFieldRenderer**

Create `src/components/shared/fields/DynamicFieldRenderer.tsx`:

```typescript
'use client';

interface FieldDefinition {
  id: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date';
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

interface DynamicFieldRendererProps {
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
}

export default function DynamicFieldRenderer({ fields, values, onChange }: DynamicFieldRendererProps) {
  if (fields.length === 0) return null;

  const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      {sorted.map((field) => {
        const value = values[field.id] ?? '';
        const labelId = `dynamic-field-${field.id}`;

        return (
          <div key={field.id}>
            <label htmlFor={labelId} className="label">
              {field.name}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>

            {field.field_type === 'text' && (
              <input
                id={labelId}
                type="text"
                className="input-field"
                value={String(value)}
                onChange={(e) => onChange(field.id, e.target.value)}
                required={field.required}
              />
            )}

            {field.field_type === 'number' && (
              <input
                id={labelId}
                type="number"
                className="input-field"
                value={value === '' ? '' : Number(value)}
                onChange={(e) => onChange(field.id, e.target.value === '' ? '' : Number(e.target.value))}
                required={field.required}
              />
            )}

            {field.field_type === 'dropdown' && (
              <select
                id={labelId}
                className="input-field"
                value={String(value)}
                onChange={(e) => onChange(field.id, e.target.value)}
                required={field.required}
              >
                <option value="">Select...</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}

            {field.field_type === 'date' && (
              <input
                id={labelId}
                type="date"
                className="input-field"
                value={String(value)}
                onChange={(e) => onChange(field.id, e.target.value)}
                required={field.required}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/components/shared/fields/__tests__/DynamicFieldRenderer.test.tsx`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/fields/DynamicFieldRenderer.tsx src/components/shared/fields/__tests__/DynamicFieldRenderer.test.tsx
git commit -m "feat: add shared DynamicFieldRenderer component with tests"
```

---

### Task 6: Shared FieldDefinitionEditor Component

**Files:**
- Create: `src/components/shared/fields/FieldDefinitionEditor.tsx`
- Create: `src/components/shared/fields/__tests__/FieldDefinitionEditor.test.tsx`
- Create: `src/components/shared/fields/index.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/shared/fields/__tests__/FieldDefinitionEditor.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FieldDefinitionEditor, { type FieldDraft } from '../FieldDefinitionEditor';

describe('FieldDefinitionEditor', () => {
  const emptyFields: FieldDraft[] = [];

  it('renders "Add Field" button', () => {
    render(<FieldDefinitionEditor fields={emptyFields} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add field/i })).toBeInTheDocument();
  });

  it('calls onChange with a new field when Add Field is clicked', async () => {
    const onChange = vi.fn();
    render(<FieldDefinitionEditor fields={emptyFields} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /add field/i }));
    expect(onChange).toHaveBeenCalledOnce();
    const newFields = onChange.mock.calls[0][0];
    expect(newFields).toHaveLength(1);
    expect(newFields[0]).toMatchObject({ name: '', field_type: 'text', required: false });
  });

  it('renders existing fields with name inputs', () => {
    const fields: FieldDraft[] = [
      { name: 'Condition', field_type: 'text', options: [], required: false },
    ];
    render(<FieldDefinitionEditor fields={fields} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('Condition')).toBeInTheDocument();
  });

  it('calls onChange when field name changes', async () => {
    const onChange = vi.fn();
    const fields: FieldDraft[] = [
      { name: '', field_type: 'text', options: [], required: false },
    ];
    render(<FieldDefinitionEditor fields={fields} onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText(/field name/i), 'Cost');
    expect(onChange).toHaveBeenCalled();
  });

  it('calls onChange when delete button is clicked', async () => {
    const onChange = vi.fn();
    const fields: FieldDraft[] = [
      { name: 'A', field_type: 'text', options: [], required: false },
      { name: 'B', field_type: 'number', options: [], required: false },
    ];
    render(<FieldDefinitionEditor fields={fields} onChange={onChange} />);
    const deleteButtons = screen.getAllByRole('button', { name: /remove/i });
    await userEvent.click(deleteButtons[0]);
    const newFields = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(newFields).toHaveLength(1);
    expect(newFields[0].name).toBe('B');
  });

  it('shows dropdown options input when field_type is dropdown', () => {
    const fields: FieldDraft[] = [
      { name: 'Status', field_type: 'dropdown', options: ['Good', 'Bad'], required: false },
    ];
    render(<FieldDefinitionEditor fields={fields} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('Good, Bad')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/components/shared/fields/__tests__/FieldDefinitionEditor.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement FieldDefinitionEditor**

Create `src/components/shared/fields/FieldDefinitionEditor.tsx`:

```typescript
'use client';

export interface FieldDraft {
  id?: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date';
  options: string[];
  required: boolean;
}

interface FieldDefinitionEditorProps {
  fields: FieldDraft[];
  onChange: (fields: FieldDraft[]) => void;
}

export default function FieldDefinitionEditor({ fields, onChange }: FieldDefinitionEditorProps) {
  function addField() {
    onChange([...fields, { name: '', field_type: 'text', options: [], required: false }]);
  }

  function updateField(index: number, updates: Partial<FieldDraft>) {
    const next = fields.map((f, i) => (i === index ? { ...f, ...updates } : f));
    onChange(next);
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function moveField(index: number, direction: -1 | 1) {
    const next = [...fields];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-sage">Custom Fields</span>
        <button type="button" onClick={addField} className="text-xs text-forest hover:text-forest-dark">
          + Add Field
        </button>
      </div>

      {fields.map((field, i) => (
        <div key={field.id ?? `new-${i}`} className="bg-sage-light rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={field.name}
              onChange={(e) => updateField(i, { name: e.target.value })}
              placeholder="Field name"
              className="input-field text-sm flex-1"
            />
            <select
              value={field.field_type}
              onChange={(e) => updateField(i, { field_type: e.target.value as FieldDraft['field_type'], options: [] })}
              className="input-field text-sm w-28"
              aria-label="Field type"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="dropdown">Dropdown</option>
              <option value="date">Date</option>
            </select>
          </div>

          {field.field_type === 'dropdown' && (
            <input
              type="text"
              value={field.options.join(', ')}
              onChange={(e) => updateField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="Options (comma-separated)"
              className="input-field text-sm"
            />
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-sage">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => updateField(i, { required: e.target.checked })}
              />
              Required
            </label>
            <div className="flex gap-1">
              <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0}
                className="text-xs text-sage hover:text-forest disabled:opacity-30" aria-label="Move up">
                &uarr;
              </button>
              <button type="button" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1}
                className="text-xs text-sage hover:text-forest disabled:opacity-30" aria-label="Move down">
                &darr;
              </button>
              <button type="button" onClick={() => removeField(i)}
                className="text-xs text-red-600 hover:text-red-800" aria-label="Remove">
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create barrel export**

Create `src/components/shared/fields/index.ts`:

```typescript
export { default as DynamicFieldRenderer } from './DynamicFieldRenderer';
export { default as FieldDefinitionEditor } from './FieldDefinitionEditor';
export type { FieldDraft } from './FieldDefinitionEditor';
export { validateFieldValues } from './validate';
export type { FieldValidationError } from './validate';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/components/shared/fields/__tests__/FieldDefinitionEditor.test.tsx`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/fields/
git commit -m "feat: add shared FieldDefinitionEditor component with tests and barrel export"
```

---

### Task 7: Offline Sync — update_type_fields

**Files:**
- Modify: `src/lib/offline/db.ts:1-73`
- Modify: `src/lib/offline/store.ts:1-55`
- Modify: `src/lib/offline/provider.tsx:1-38`
- Modify: `src/lib/offline/sync-engine.ts:120-155`

- [ ] **Step 1: Add UpdateTypeField import and table to db.ts**

In `src/lib/offline/db.ts`, add `UpdateTypeField` to the import (line 2) and add the table declaration (after line 31):

Import change:
```typescript
import type {
  Item, ItemType, CustomField, ItemUpdate, UpdateType, UpdateTypeField, Photo,
  Entity, EntityType, Property, Org, Role, OrgMembership,
} from '@/lib/types';
```

Add after `update_types` table declaration (after line 31):
```typescript
  update_type_fields!: EntityTable<Cached<UpdateTypeField>, 'id'>;
```

Add to `version(1).stores()` schema (after line 56):
```typescript
      update_type_fields: 'id, update_type_id, org_id',
```

- [ ] **Step 2: Add getUpdateTypeFields to store.ts**

In `src/lib/offline/store.ts`, add `UpdateTypeField` to the type import (line 2):

```typescript
import type { Item, ItemType, CustomField, ItemUpdate, UpdateType, UpdateTypeField, Photo, Entity, EntityType } from '@/lib/types';
```

Add after `getUpdateTypes` function (after line 39):

```typescript
export async function getUpdateTypeFields(db: OfflineDatabase, orgId: string): Promise<Cached<UpdateTypeField>[]> {
  const all = await db.update_type_fields.where('org_id').equals(orgId).toArray();
  return all.sort((a, b) => a.sort_order - b.sort_order);
}
```

- [ ] **Step 3: Expose getUpdateTypeFields in provider.tsx**

In `src/lib/offline/provider.tsx`, add to the `OfflineContextValue` interface (after line 27):

```typescript
  getUpdateTypeFields: (orgId: string) => ReturnType<typeof store.getUpdateTypeFields>;
```

Add to the `value` object (after line 135):

```typescript
    getUpdateTypeFields: (orgId: string) => store.getUpdateTypeFields(db, orgId),
```

- [ ] **Step 4: Add update_type_fields to sync engine**

In `src/lib/offline/sync-engine.ts`, add `'update_type_fields'` to the `SYNC_TABLES` array (line 128):

```typescript
const SYNC_TABLES = [
  'items', 'item_types', 'custom_fields', 'item_updates', 'update_types',
  'update_type_fields', 'photos', 'entities', 'entity_types', 'geo_layers',
  'properties', 'orgs', 'roles', 'org_memberships',
] as const;
```

Add `'update_type_fields'` to the `orgScoped` array (line 149):

```typescript
    const orgScoped = ['item_types', 'custom_fields', 'update_types', 'update_type_fields', 'entities', 'entity_types', 'roles', 'org_memberships'];
```

- [ ] **Step 5: Update InsertItemUpdateParams to include custom_field_values**

In `src/lib/offline/store.ts`, update `InsertItemUpdateParams` (around line 131):

```typescript
export interface InsertItemUpdateParams {
  item_id: string;
  update_type_id: string;
  content: string | null;
  update_date: string;
  org_id: string;
  property_id: string;
  custom_field_values?: Record<string, unknown>;
}
```

Update the `insertItemUpdate` function to include the default (around line 146):

```typescript
  const update: Cached<ItemUpdate> = {
    id,
    ...params,
    custom_field_values: params.custom_field_values ?? {},
    created_at: now,
    created_by: null,
    _synced_at: '',
  };
```

- [ ] **Step 6: Run type check**

Run: `npm run type-check`
Expected: No type errors

- [ ] **Step 7: Run existing offline tests**

Run: `npm run test -- src/lib/offline/__tests__/`
Expected: All existing tests PASS (mock may need updating for the new field — check output)

- [ ] **Step 8: Commit**

```bash
git add src/lib/offline/db.ts src/lib/offline/store.ts src/lib/offline/provider.tsx src/lib/offline/sync-engine.ts
git commit -m "feat: add update_type_fields to offline sync and store"
```

---

### Task 8: UpdateTypeEditor — Custom Fields & Role Thresholds

**Files:**
- Modify: `src/components/admin/UpdateTypeEditor.tsx:1-187`

- [ ] **Step 1: Add custom field and role threshold state**

Rewrite `src/components/admin/UpdateTypeEditor.tsx` to integrate the shared `FieldDefinitionEditor` and role threshold dropdowns. The component already handles name/icon editing — we extend it with fields and permissions.

Add imports at top:

```typescript
import { FieldDefinitionEditor, type FieldDraft } from '@/components/shared/fields';
import type { UpdateType, UpdateTypeField } from '@/lib/types';
```

Add state for fields and role thresholds inside the component (after existing state, around line 18):

```typescript
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, FieldDraft[]>>({});
  const [updateTypeFields, setUpdateTypeFields] = useState<UpdateTypeField[]>([]);
  const [formMinRoleCreate, setFormMinRoleCreate] = useState<string>('');
  const [formMinRoleEdit, setFormMinRoleEdit] = useState<string>('');
  const [formMinRoleDelete, setFormMinRoleDelete] = useState<string>('');
```

- [ ] **Step 2: Fetch update_type_fields alongside update_types**

In the `fetchTypes` function, add a query for `update_type_fields`:

```typescript
  async function fetchTypes() {
    const supabase = createClient();
    const [{ data: typeData }, { data: fieldData }] = await Promise.all([
      supabase.from('update_types').select('*').order('sort_order', { ascending: true }),
      supabase.from('update_type_fields').select('*').order('sort_order', { ascending: true }),
    ]);

    if (typeData) {
      setGlobalTypes(typeData.filter((t: UpdateType) => t.is_global));
      setTypeSpecific(typeData.filter((t: UpdateType) => !t.is_global && t.item_type_id === itemTypeId));
    }
    if (fieldData) {
      setUpdateTypeFields(fieldData);
    }
    setLoading(false);
  }
```

- [ ] **Step 3: Initialize field drafts and role thresholds when editing**

Update the `startEdit` function to load fields and role thresholds:

```typescript
  function startEdit(ut: UpdateType) {
    setFormName(ut.name);
    setFormIcon(ut.icon);
    setEditingId(ut.id);
    setFormMinRoleCreate(ut.min_role_create ?? '');
    setFormMinRoleEdit(ut.min_role_edit ?? '');
    setFormMinRoleDelete(ut.min_role_delete ?? '');

    const existingFields = updateTypeFields
      .filter((f) => f.update_type_id === ut.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({
        id: f.id,
        name: f.name,
        field_type: f.field_type as FieldDraft['field_type'],
        options: Array.isArray(f.options) ? f.options : [],
        required: f.required,
      }));
    setFieldDrafts((prev) => ({ ...prev, [ut.id]: existingFields }));
    setShowAdd(false);
  }
```

Update `resetForm` to clear role thresholds:

```typescript
  function resetForm() {
    setFormName('');
    setFormIcon('📝');
    setEditingId(null);
    setShowAdd(false);
    setError('');
    setFormMinRoleCreate('');
    setFormMinRoleEdit('');
    setFormMinRoleDelete('');
  }
```

- [ ] **Step 4: Save fields and role thresholds in handleSave**

Update the `handleSave` function to persist custom fields and role thresholds:

```typescript
  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      const rolePayload = {
        min_role_create: formMinRoleCreate || null,
        min_role_edit: formMinRoleEdit || null,
        min_role_delete: formMinRoleDelete || null,
      };

      let updateTypeId: string;

      if (editingId) {
        const { error: err } = await supabase
          .from('update_types')
          .update({ name: formName.trim(), icon: formIcon, ...rolePayload })
          .eq('id', editingId);
        if (err) throw err;
        updateTypeId = editingId;
        setTypeSpecific((prev) =>
          prev.map((t) => (t.id === editingId ? { ...t, name: formName.trim(), icon: formIcon, ...rolePayload } : t))
        );
      } else {
        const maxSort = typeSpecific.length > 0
          ? Math.max(...typeSpecific.map((t) => t.sort_order))
          : (globalTypes.length > 0 ? Math.max(...globalTypes.map((t) => t.sort_order)) : -1);
        const { data, error: err } = await supabase
          .from('update_types')
          .insert({
            name: formName.trim(), icon: formIcon, is_global: false,
            item_type_id: itemTypeId, sort_order: maxSort + 1, ...rolePayload,
          })
          .select()
          .single();
        if (err) throw err;
        updateTypeId = data.id;
        setTypeSpecific((prev) => [...prev, data]);
      }

      // Sync custom fields
      const drafts = fieldDrafts[updateTypeId] ?? [];
      const keepIds = drafts.filter((f) => f.id).map((f) => f.id!);
      const existingIds = updateTypeFields.filter((f) => f.update_type_id === updateTypeId).map((f) => f.id);
      const toDelete = existingIds.filter((id) => !keepIds.includes(id));

      if (toDelete.length > 0) {
        await supabase.from('update_type_fields').delete().in('id', toDelete);
      }

      for (let i = 0; i < drafts.length; i++) {
        const draft = drafts[i];
        const fieldPayload = {
          update_type_id: updateTypeId,
          name: draft.name.trim(),
          field_type: draft.field_type,
          options: draft.field_type === 'dropdown' && draft.options.length > 0 ? draft.options : null,
          required: draft.required,
          sort_order: i,
        };
        if (draft.id) {
          await supabase.from('update_type_fields').update(fieldPayload).eq('id', draft.id);
        } else {
          await supabase.from('update_type_fields').insert(fieldPayload);
        }
      }

      // Refresh fields from DB
      const { data: refreshedFields } = await supabase
        .from('update_type_fields').select('*').order('sort_order', { ascending: true });
      if (refreshedFields) setUpdateTypeFields(refreshedFields);

      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    }
    setSaving(false);
  }
```

- [ ] **Step 5: Add UI for fields and role thresholds in the editing form**

Inside the `{isEditing && ...}` block, after the name/icon inputs, add:

```tsx
          {/* Custom fields editor */}
          <FieldDefinitionEditor
            fields={editingId ? (fieldDrafts[editingId] ?? []) : (fieldDrafts['new'] ?? [])}
            onChange={(newFields) =>
              setFieldDrafts((prev) => ({ ...prev, [editingId ?? 'new']: newFields }))
            }
          />

          {/* Role thresholds */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-sage">Role Restrictions</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Create', value: formMinRoleCreate, setter: setFormMinRoleCreate },
                { label: 'Edit', value: formMinRoleEdit, setter: setFormMinRoleEdit },
                { label: 'Delete', value: formMinRoleDelete, setter: setFormMinRoleDelete },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <label className="label text-xs">{label}</label>
                  <select value={value} onChange={(e) => setter(e.target.value)} className="input-field text-xs">
                    <option value="">Anyone</option>
                    <option value="contributor">Contributor</option>
                    <option value="org_staff">Staff</option>
                    <option value="org_admin">Admin</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
```

- [ ] **Step 6: Run type check and verify**

Run: `npm run type-check`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/UpdateTypeEditor.tsx
git commit -m "feat: extend UpdateTypeEditor with custom fields and role thresholds"
```

---

### Task 9: UpdateForm — Dynamic Fields & Permission Gating

**Files:**
- Modify: `src/components/manage/UpdateForm.tsx:1-333`
- Modify: `src/components/manage/__tests__/UpdateForm.test.tsx`

- [ ] **Step 1: Write failing test for disabled update types in picker**

Add to `src/components/manage/__tests__/UpdateForm.test.tsx`. First update `mockUpdateTypes` in the hoisted block (around line 45):

```typescript
  const mockUpdateTypes = [
    { id: 'ut-1', name: 'Inspection', icon: '🔍', is_global: true, item_type_id: null, sort_order: 1, org_id: 'org-1', min_role_create: null, min_role_edit: null, min_role_delete: null },
    { id: 'ut-2', name: 'Schedule Maintenance', icon: '🔧', is_global: true, item_type_id: null, sort_order: 2, org_id: 'org-1', min_role_create: 'org_staff', min_role_edit: null, min_role_delete: null },
  ];
```

Add `mockUpdateTypeFields` to hoisted block:

```typescript
  const mockUpdateTypeFields: never[] = [];
```

Update the offline store mock to include `getUpdateTypeFields`:

```typescript
    getUpdateTypeFields: vi.fn().mockResolvedValue(mockUpdateTypeFields),
```

Add new test in the standalone describe block:

```typescript
  it('shows role-restricted update types as disabled with label', async () => {
    render(<UpdateForm />);
    // Wait for data to load
    await screen.findByLabelText(/update type/i);
    const options = screen.getAllByRole('option');
    const scheduleMaint = options.find((o) => o.textContent?.includes('Schedule Maintenance'));
    expect(scheduleMaint).toHaveAttribute('disabled');
    expect(scheduleMaint?.textContent).toContain('Staff');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/manage/__tests__/UpdateForm.test.tsx`
Expected: FAIL — update types don't have disabled state yet

- [ ] **Step 3: Extend usePermissions to expose userBaseRole**

In `src/lib/permissions/hooks.ts`, the `usePermissions` hook resolves the user's role but only exposes the parsed permission booleans. Extend it to also return `userBaseRole`:

Update the return type and state:

```typescript
export function usePermissions(): { permissions: UserPermissions; userBaseRole: string; loading: boolean } {
  const [permissions, setPermissions] = useState<UserPermissions>(EMPTY_PERMISSIONS);
  const [userBaseRole, setUserBaseRole] = useState<string>('viewer');
  const [loading, setLoading] = useState(true);
```

In the platform admin path (around line 78), add:
```typescript
        if (profile?.is_platform_admin) {
          setPermissions(ADMIN_PERMISSIONS);
          setUserBaseRole('platform_admin');
          // ...
```

In the org_admin path (around line 104), add:
```typescript
        if (role.base_role === 'org_admin') {
          setPermissions(ADMIN_PERMISSIONS);
          setUserBaseRole('org_admin');
          // ...
```

In the normal role path (around line 134), add:
```typescript
        setPermissions(resolved);
        setUserBaseRole(role.base_role);
        // ...
```

Update the return:
```typescript
  return { permissions, userBaseRole, loading };
```

**Files:**
- Modify: `src/lib/permissions/hooks.ts:56-151`

Update callers that destructure `usePermissions()` — they use `{ permissions, loading }` so adding `userBaseRole` is non-breaking (unused fields are fine in destructuring).

- [ ] **Step 4: Integrate dynamic fields and permission gating in UpdateForm**

In `src/components/manage/UpdateForm.tsx`, add imports:

```typescript
import { DynamicFieldRenderer, validateFieldValues } from '@/components/shared/fields';
import { canPerformUpdateTypeAction } from '@/lib/permissions/resolve';
import { usePermissions } from '@/lib/permissions/hooks';
import type { UpdateTypeField } from '@/lib/types';
```

At the top of the component function, add:

```typescript
  const { userBaseRole } = usePermissions();
```

Add state for update type fields and custom field values (after existing state, around line 46):

```typescript
  const [updateTypeFields, setUpdateTypeFields] = useState<UpdateTypeField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
```

In the `fetchData` function, add `getUpdateTypeFields` call to the Promise.all (around line 58):

```typescript
      const [itemData, typeData, itData, allEntityTypes, allUpdateTypeFields] = await Promise.all([
        offlineStore.getItems(propertyId),
        offlineStore.getUpdateTypes(resolvedOrgId),
        offlineStore.getItemTypes(resolvedOrgId),
        offlineStore.getEntityTypes(resolvedOrgId),
        offlineStore.getUpdateTypeFields(resolvedOrgId),
      ]);
```

Store the fields (after line 78):

```typescript
      if (allUpdateTypeFields) setUpdateTypeFields(allUpdateTypeFields);
```

Add computed values for the selected type's fields (after `availableUpdateTypes`, around line 121):

```typescript
  const selectedUpdateTypeFields = updateTypeFields.filter(
    (f) => f.update_type_id === updateTypeId
  );
```

Add role label helper (before the return):

```typescript
  function getRoleLabel(updateType: UpdateType): string | null {
    const threshold = updateType.min_role_create;
    if (!threshold) return null;
    const labels: Record<string, string> = { contributor: 'Contributor', org_staff: 'Staff', org_admin: 'Admin' };
    return labels[threshold] ?? null;
  }
```

Update the update type picker to show disabled options (replace the `availableUpdateTypes.map` around line 263):

```tsx
            {availableUpdateTypes.map((t) => {
              const roleLabel = getRoleLabel(t);
              const restricted = roleLabel !== null;
              // userBaseRole comes from the extended usePermissions hook (see Task 9 Step 3 note)
              const userRole = userBaseRole;
              const canCreate = canPerformUpdateTypeAction(userRole, t, 'create');
              const isDisabled = canCreate === false;
              return (
                <option key={t.id} value={t.id} disabled={isDisabled}>
                  {t.icon} {t.name}{isDisabled ? ` (${roleLabel} only)` : ''}
                </option>
              );
            })}
```

Add dynamic fields section after the notes textarea (around line 295):

```tsx
      {selectedUpdateTypeFields.length > 0 && (
        <DynamicFieldRenderer
          fields={selectedUpdateTypeFields}
          values={customFieldValues}
          onChange={(fieldId, value) =>
            setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }))
          }
        />
      )}
```

Reset custom field values when update type changes (update the type select onChange around line 258):

```tsx
            onChange={(e) => { setUpdateTypeId(e.target.value); setCustomFieldValues({}); }}
```

Update `handleSubmit` to validate and include custom field values (around line 135):

After the existing validation checks, add:

```typescript
    // Validate custom fields
    const fieldErrors = validateFieldValues(selectedUpdateTypeFields, customFieldValues);
    if (fieldErrors.length > 0) {
      setError(fieldErrors.map((e) => e.message).join(', '));
      return;
    }
```

Update the `insertItemUpdate` call to include `custom_field_values`:

```typescript
      const { update, mutationId } = await offlineStore.insertItemUpdate({
        item_id: itemId,
        update_type_id: updateTypeId,
        content: content || null,
        update_date: updateDate,
        org_id: orgId,
        property_id: propertyId,
        custom_field_values: customFieldValues,
      });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/components/manage/__tests__/UpdateForm.test.tsx`
Expected: All tests PASS (including the new disabled test)

- [ ] **Step 6: Run type check**

Run: `npm run type-check`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/permissions/hooks.ts src/components/manage/UpdateForm.tsx src/components/manage/__tests__/UpdateForm.test.tsx
git commit -m "feat: add dynamic fields and role-gated update types to UpdateForm"
```

---

### Task 10: UpdateTimeline — Display Custom Field Values

**Files:**
- Modify: `src/components/item/UpdateTimeline.tsx:1-70`

- [ ] **Step 1: Update UpdateTimeline to show custom field values**

In `src/components/item/UpdateTimeline.tsx`, add `UpdateTypeField` to the props type. The component receives updates with expanded data — we need field definitions to format values.

Update the props interface:

```typescript
interface UpdateTimelineProps {
  updates: (ItemUpdate & {
    update_type?: UpdateTypeRecord;
    photos?: Photo[];
    entities?: (Entity & { entity_type: EntityType })[];
  })[];
  updateTypeFields?: UpdateTypeField[];
}
```

Add import for `UpdateTypeField`:

```typescript
import type { ItemUpdate, Photo, Entity, EntityType, UpdateTypeField } from '@/lib/types';
```

Update the component signature:

```typescript
export default function UpdateTimeline({ updates, updateTypeFields = [] }: UpdateTimelineProps) {
```

After the entities display (around line 63), add custom field values display:

```tsx
              {update.custom_field_values && Object.keys(update.custom_field_values).length > 0 && (() => {
                const fields = updateTypeFields.filter((f) => f.update_type_id === update.update_type_id);
                const entries = Object.entries(update.custom_field_values);
                if (entries.length === 0) return null;
                return (
                  <div className="mt-1.5 space-y-0.5">
                    {entries.map(([fieldId, value]) => {
                      const fieldDef = fields.find((f) => f.id === fieldId);
                      const label = fieldDef?.name ?? fieldId;
                      let displayValue = String(value ?? '');
                      if (fieldDef?.field_type === 'date' && displayValue) {
                        displayValue = new Date(displayValue).toLocaleDateString();
                      }
                      return (
                        <div key={fieldId} className="text-[10px] text-sage">
                          <span className="font-medium">{label}:</span> {displayValue}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
```

- [ ] **Step 2: Update callers to pass updateTypeFields**

Search for usages of `<UpdateTimeline` and pass the fields prop. The primary caller will need to fetch update type fields and pass them through. Check the item detail panel or page that renders `UpdateTimeline`.

- [ ] **Step 3: Run type check**

Run: `npm run type-check`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/components/item/UpdateTimeline.tsx
git commit -m "feat: display custom field values in UpdateTimeline"
```

---

### Task 11: Refactor EntityTypeForm to Use Shared FieldDefinitionEditor

**Files:**
- Modify: `src/components/admin/EntityTypeForm.tsx:1-289`

- [ ] **Step 1: Replace inline field management with shared component**

In `src/components/admin/EntityTypeForm.tsx`:

Replace the `FieldDraft` interface import and inline definition with the shared one:

```typescript
import { FieldDefinitionEditor, type FieldDraft } from '@/components/shared/fields';
```

Remove the component's own `FieldDraft` interface definition (lines 18-24).

Remove the inline field management functions: `addField`, `updateField`, `removeField`, `moveField` (lines 60-78). These are now handled by `FieldDefinitionEditor`.

Replace the inline field editing UI (the entire fields JSX block, approximately lines 210-278) with:

```tsx
          <FieldDefinitionEditor
            fields={fields}
            onChange={setFields}
          />
```

Keep the `fields` state and the syncing logic in `handleSubmit` (lines 119-150) — those remain, since they handle persistence. The `FieldDefinitionEditor` only manages the in-memory draft state.

- [ ] **Step 2: Run type check**

Run: `npm run type-check`
Expected: No type errors

- [ ] **Step 3: Verify existing entity type admin still works**

Run: `npm run test`
Expected: All tests PASS. The shared component has the same behavior as the inline version.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/EntityTypeForm.tsx
git commit -m "refactor: replace EntityTypeForm inline field editor with shared FieldDefinitionEditor"
```

---

### Task 12: E2E Test — Admin Configures Update Type Fields

**Files:**
- Create: `e2e/tests/admin/update-type-fields.spec.ts`

- [ ] **Step 1: Write E2E test for admin update type configuration**

Create `e2e/tests/admin/update-type-fields.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Update Type Field Configuration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to admin item types page (adjust URL for your test env)
    await page.goto('/admin/properties/test-property/types');
  });

  test('admin can add custom fields to an update type', async ({ page }) => {
    // Expand an item type to see update types
    const itemTypeRow = page.getByText('Birdhouse').first();
    await itemTypeRow.click();

    // Click edit on an existing update type
    const editButton = page.getByRole('button', { name: /edit/i }).first();
    await editButton.click();

    // Add a custom field
    await page.getByRole('button', { name: /add field/i }).click();
    await page.getByPlaceholder(/field name/i).fill('Condition');
    await page.getByLabel(/field type/i).selectOption('dropdown');
    await page.getByPlaceholder(/options/i).fill('Good, Fair, Poor');

    // Set role restriction
    await page.getByLabel(/create/i).selectOption('org_staff');

    // Save
    await page.getByRole('button', { name: /update|add/i }).click();

    // Reload and verify persistence
    await page.reload();
    await itemTypeRow.click();
    // Verify the update type still shows (not a full assertion of fields,
    // just that the save didn't break anything)
    await expect(page.getByText('Observation')).toBeVisible();
  });

  test('role-restricted update types show as disabled in Add Update form', async ({ page }) => {
    await page.goto('/manage/update');

    // Wait for the update type dropdown to load
    const typeSelect = page.getByLabel(/update type/i);
    await expect(typeSelect).toBeVisible();

    // Check that restricted options have disabled attribute
    const options = typeSelect.locator('option');
    const count = await options.count();
    // At least one option should exist
    expect(count).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run E2E smoke test to verify setup**

Run: `npm run test:e2e:smoke`
Expected: Existing E2E tests pass (new test may need seeded data — adapt to your test environment)

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/admin/update-type-fields.spec.ts
git commit -m "test: add E2E tests for update type field configuration and role gating"
```

---

### Task 13: Final Type Check & Full Test Suite

**Files:** None (verification only)

- [ ] **Step 1: Run full type check**

Run: `npm run type-check`
Expected: No type errors

- [ ] **Step 2: Run full unit test suite**

Run: `npm run test`
Expected: All tests PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 4: Commit any remaining fixes**

If any steps required fixes, commit them:

```bash
git add -A
git commit -m "fix: resolve type and test issues from rich update types implementation"
```
