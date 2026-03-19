# Type & Species Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin CRUD pages for managing item types (with custom fields and update types) and species, plus integrate species selection into item/update forms and detail views.

**Architecture:** New Supabase migration for species tables. Two new admin pages (`/admin/types`, `/admin/species`) following existing admin dashboard patterns. Shared `SpeciesSelect` component used in ItemForm and UpdateForm. Species data integrated into `ItemWithDetails` queries and DetailPanel display.

**Tech Stack:** Next.js 14, TypeScript, Supabase (PostgreSQL + Storage), Tailwind CSS, Vitest

---

## Chunk 1: Database & Types Foundation

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/003_species_and_types.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 003_species_and_types.sql — Add species tables and join tables

-- ======================
-- Species table
-- ======================
create table species (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  scientific_name text,
  description text,
  photo_path text,
  conservation_status text,
  category text,
  external_link text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint on scientific_name when non-null
create unique index species_scientific_name_unique
  on species (scientific_name)
  where scientific_name is not null;

-- Updated_at trigger (reuses existing function from 001)
create trigger species_updated_at
  before update on species
  for each row execute function update_updated_at();

-- ======================
-- Join tables
-- ======================

create table item_species (
  item_id uuid not null references items(id) on delete cascade,
  species_id uuid not null references species(id) on delete restrict,
  primary key (item_id, species_id)
);

create table update_species (
  update_id uuid not null references item_updates(id) on delete cascade,
  species_id uuid not null references species(id) on delete restrict,
  primary key (update_id, species_id)
);

-- Indexes for FK lookups
create index idx_item_species_species on item_species(species_id);
create index idx_update_species_species on update_species(species_id);
create index idx_update_species_update on update_species(update_id);

-- ======================
-- RLS
-- ======================

alter table species enable row level security;
alter table item_species enable row level security;
alter table update_species enable row level security;

-- species: public read, authenticated write
create policy "Public can view species"
  on species for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert species"
  on species for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update species"
  on species for update
  to authenticated
  using (true);

create policy "Authenticated users can delete species"
  on species for delete
  to authenticated
  using (true);

-- item_species: public read, authenticated write
create policy "Public can view item species"
  on item_species for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert item species"
  on item_species for insert
  to authenticated
  with check (true);

create policy "Authenticated users can delete item species"
  on item_species for delete
  to authenticated
  using (true);

-- update_species: public read, authenticated write
create policy "Public can view update species"
  on update_species for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert update species"
  on update_species for insert
  to authenticated
  with check (true);

create policy "Authenticated users can delete update species"
  on update_species for delete
  to authenticated
  using (true);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/003_species_and_types.sql
git commit -m "feat: add species tables and join tables migration"
```

### Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/__tests__/types.test.ts`

- [ ] **Step 1: Write tests for new types**

Add to `src/lib/__tests__/types.test.ts`:

```typescript
// Add Species import to the top import statement
import type {
  Item, ItemType, CustomField, UpdateType, ItemUpdate,
  ItemWithDetails, Photo, ItemStatus, FieldType,
  Species, ItemSpecies, UpdateSpecies,
} from '../types';

// Add new describe blocks at the end of the file:

describe('Species structure', () => {
  it('accepts a valid Species object', () => {
    const species: Species = {
      id: 'sp-1',
      name: 'Black-capped Chickadee',
      scientific_name: 'Poecile atricapillus',
      description: 'Small songbird',
      photo_path: 'species/sp-1/1710720000000.jpg',
      conservation_status: 'Least Concern',
      category: 'Songbirds',
      external_link: 'https://example.com/chickadee',
      sort_order: 0,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    expect(species.name).toBe('Black-capped Chickadee');
    expect(species.scientific_name).toBe('Poecile atricapillus');
  });

  it('accepts nullable fields as null', () => {
    const species: Species = {
      id: 'sp-2',
      name: 'Unknown Bird',
      scientific_name: null,
      description: null,
      photo_path: null,
      conservation_status: null,
      category: null,
      external_link: null,
      sort_order: 0,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    expect(species.scientific_name).toBeNull();
  });
});

describe('Join table structures', () => {
  it('accepts ItemSpecies', () => {
    const is: ItemSpecies = { item_id: 'item-1', species_id: 'sp-1' };
    expect(is.item_id).toBe('item-1');
  });

  it('accepts UpdateSpecies', () => {
    const us: UpdateSpecies = { update_id: 'upd-1', species_id: 'sp-1' };
    expect(us.update_id).toBe('upd-1');
  });
});

describe('ItemWithDetails with species', () => {
  it('includes species on item and on updates', () => {
    const species: Species = {
      id: 'sp-1', name: 'Chickadee', scientific_name: null,
      description: null, photo_path: null, conservation_status: null,
      category: null, external_link: null, sort_order: 0,
      created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
    };

    const itemType: ItemType = {
      id: 'type-1', name: 'Bird Box', icon: '🏠', color: '#5D7F3A',
      sort_order: 0, created_at: '2025-01-01T00:00:00Z',
    };

    const updateType: UpdateType = {
      id: 'ut-1', name: 'Observation', icon: '👀',
      is_global: true, item_type_id: null, sort_order: 0,
    };

    const detailed: ItemWithDetails = {
      id: '123', name: 'Meadow Box', description: null,
      latitude: 47.6, longitude: -122.5, item_type_id: 'type-1',
      custom_field_values: {}, status: 'active',
      created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
      created_by: null,
      item_type: itemType,
      updates: [{
        id: 'upd-1', item_id: '123', update_type_id: 'ut-1',
        content: 'Saw a bird', update_date: '2025-04-01',
        created_at: '2025-04-01T00:00:00Z', created_by: null,
        update_type: updateType, photos: [], species: [species],
      }],
      photos: [],
      custom_fields: [],
      species: [species],
    };

    expect(detailed.species).toHaveLength(1);
    expect(detailed.species[0].name).toBe('Chickadee');
    expect(detailed.updates[0].species).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/types.test.ts`
Expected: FAIL — `Species`, `ItemSpecies`, `UpdateSpecies` not exported from types.ts, and `ItemWithDetails` doesn't have `species` field.

- [ ] **Step 3: Add types to types.ts**

Add these interfaces before the `Database` interface in `src/lib/types.ts`:

```typescript
export interface Species {
  id: string;
  name: string;
  scientific_name: string | null;
  description: string | null;
  photo_path: string | null;
  conservation_status: string | null;
  category: string | null;
  external_link: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ItemSpecies {
  item_id: string;
  species_id: string;
}

export interface UpdateSpecies {
  update_id: string;
  species_id: string;
}
```

Update `ItemWithDetails`:

```typescript
export interface ItemWithDetails extends Item {
  item_type: ItemType;
  updates: (ItemUpdate & { update_type: UpdateType; photos: Photo[]; species: Species[] })[];
  photos: Photo[];
  custom_fields: CustomField[];
  species: Species[];
}
```

Add to `Database` interface, inside `Tables`:

```typescript
species: {
  Row: Species;
  Insert: Omit<Species, 'id' | 'created_at' | 'updated_at'>;
  Update: Partial<Omit<Species, 'id' | 'created_at'>>;
  Relationships: [];
};
item_species: {
  Row: ItemSpecies;
  Insert: ItemSpecies;
  Update: never;
  Relationships: [];
};
update_species: {
  Row: UpdateSpecies;
  Insert: UpdateSpecies;
  Update: never;
  Relationships: [];
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/types.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Fix existing test for ItemWithDetails**

The existing `ItemWithDetails` test (around line 119) needs the new `species` field. Make two changes:

1. In the `updates` array entry, add `species: []` after `photos: []`:
```typescript
          photos: [],
          species: [],
```

2. At the end of the `detailed` object, add `species: []` after `custom_fields`:
```typescript
      custom_fields: [
        {
          id: 'f1', item_type_id: 'type-1', name: 'Target Species',
          field_type: 'dropdown', options: ['Chickadee'], required: false, sort_order: 0,
        },
      ],
      species: [],
```

- [ ] **Step 6: Run all tests to verify nothing is broken**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/__tests__/types.test.ts
git commit -m "feat: add Species, ItemSpecies, UpdateSpecies types and extend ItemWithDetails"
```

---

## Chunk 2: Admin Navigation & Item Type Management Page

### Task 3: Admin Navigation Update

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Add Types and Species links to admin nav bar**

In `src/app/admin/layout.tsx`, add two new `<Link>` elements after the "Settings" link (before the "Back" link). Follow the same pattern as existing links with `pathname.startsWith()` for active state:

```typescript
<Link
  href="/admin/types"
  className={`text-sm transition-colors ${
    pathname.startsWith('/admin/types')
      ? 'text-white font-medium'
      : 'text-white/60 hover:text-white'
  }`}
>
  Types
</Link>
<Link
  href="/admin/species"
  className={`text-sm transition-colors ${
    pathname.startsWith('/admin/species')
      ? 'text-white font-medium'
      : 'text-white/60 hover:text-white'
  }`}
>
  Species
</Link>
```

- [ ] **Step 2: Verify the app builds**

Run: `npx next build`
Expected: Build succeeds (the linked pages don't exist yet but Next.js won't fail on that).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat: add Types and Species links to admin navigation"
```

### Task 4: Item Type Management Page — List & Create

**Files:**
- Create: `src/app/admin/types/page.tsx`
- Create: `src/components/admin/ItemTypeEditor.tsx`

- [ ] **Step 1: Create the ItemTypeEditor component**

Create `src/components/admin/ItemTypeEditor.tsx`. This is an expandable card for a single item type. It shows collapsed view (icon, name, color swatch, item count, edit/delete buttons) and expanded view (editable fields for name, icon, color, sort_order).

```typescript
'use client';

import { useState } from 'react';
import type { ItemType } from '@/lib/types';

interface ItemTypeEditorProps {
  itemType: ItemType;
  itemCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSave: (updates: { name: string; icon: string; color: string; sort_order: number }) => Promise<void>;
  onDelete: () => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export default function ItemTypeEditor({
  itemType, itemCount, isExpanded, onToggleExpand,
  onSave, onDelete, onMoveUp, onMoveDown, isFirst, isLast,
}: ItemTypeEditorProps) {
  const [name, setName] = useState(itemType.name);
  const [icon, setIcon] = useState(itemType.icon);
  const [color, setColor] = useState(itemType.color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await onSave({ name, icon, color, sort_order: itemType.sort_order });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (itemCount > 0) {
      setError(`Cannot delete: ${itemCount} item${itemCount === 1 ? '' : 's'} use this type.`);
      return;
    }
    if (!confirm(`Delete "${itemType.name}" and all its custom fields and update types?`)) return;
    setError('');
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    }
  }

  return (
    <div className="card">
      {/* Collapsed header */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={onToggleExpand}>
        <span className="text-xl">{itemType.icon}</span>
        <span className="font-medium text-forest-dark flex-1">{itemType.name}</span>
        <div className="w-5 h-5 rounded-full border border-sage-light" style={{ backgroundColor: itemType.color }} />
        <span className="text-xs text-sage bg-sage-light px-2 py-0.5 rounded-full">
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={isFirst}
            className="text-sage hover:text-forest-dark disabled:opacity-30 text-sm px-1"
            title="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={isLast}
            className="text-sage hover:text-forest-dark disabled:opacity-30 text-sm px-1"
            title="Move down"
          >
            ▼
          </button>
        </div>
        <svg
          className={`w-4 h-4 text-sage transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-sage-light space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Icon (emoji)</label>
              <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Color</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="input-field h-10" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save Type'}
            </button>
            <button onClick={handleDelete} className="text-sm text-red-600 hover:text-red-800 px-3 py-2">
              Delete Type
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the types admin page**

Create `src/app/admin/types/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ItemType } from '@/lib/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ItemTypeEditor from '@/components/admin/ItemTypeEditor';

export default function TypesPage() {
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📍');
  const [newColor, setNewColor] = useState('#5D7F3A');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const supabase = createClient();

    const [typeRes, itemRes] = await Promise.all([
      supabase.from('item_types').select('*').order('sort_order', { ascending: true }),
      supabase.from('items').select('id, item_type_id'),
    ]);

    if (typeRes.data) setItemTypes(typeRes.data);

    // Count items per type
    const counts: Record<string, number> = {};
    if (itemRes.data) {
      for (const item of itemRes.data) {
        counts[item.item_type_id] = (counts[item.item_type_id] || 0) + 1;
      }
    }
    setItemCounts(counts);
    setLoading(false);
  }

  async function handleAddType(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    setAdding(true);
    setAddError('');

    try {
      const supabase = createClient();
      const maxSortOrder = itemTypes.length > 0 ? Math.max(...itemTypes.map((t) => t.sort_order)) : -1;

      const { data, error } = await supabase
        .from('item_types')
        .insert({ name: newName.trim(), icon: newIcon, color: newColor, sort_order: maxSortOrder + 1 })
        .select()
        .single();

      if (error) throw error;

      setItemTypes((prev) => [...prev, data]);
      setItemCounts((prev) => ({ ...prev, [data.id]: 0 }));
      setNewName('');
      setNewIcon('📍');
      setNewColor('#5D7F3A');
      setShowAddForm(false);
      setExpandedId(data.id);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add type.');
    }
    setAdding(false);
  }

  async function handleSaveType(id: string, updates: { name: string; icon: string; color: string; sort_order: number }) {
    const supabase = createClient();
    const { error } = await supabase.from('item_types').update(updates).eq('id', id);
    if (error) throw error;
    setItemTypes((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }

  async function handleDeleteType(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('item_types').delete().eq('id', id);
    if (error) throw error;
    setItemTypes((prev) => prev.filter((t) => t.id !== id));
    setItemCounts((prev) => { const c = { ...prev }; delete c[id]; return c; });
    if (expandedId === id) setExpandedId(null);
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    const index = itemTypes.findIndex((t) => t.id === id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= itemTypes.length) return;

    const supabase = createClient();
    const current = itemTypes[index];
    const swap = itemTypes[swapIndex];

    await Promise.all([
      supabase.from('item_types').update({ sort_order: swap.sort_order }).eq('id', current.id),
      supabase.from('item_types').update({ sort_order: current.sort_order }).eq('id', swap.id),
    ]);

    const updated = [...itemTypes];
    updated[index] = { ...current, sort_order: swap.sort_order };
    updated[swapIndex] = { ...swap, sort_order: current.sort_order };
    updated.sort((a, b) => a.sort_order - b.sort_order);
    setItemTypes(updated);
  }

  if (loading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">Item Types</h1>
        <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary text-sm">
          + Add Type
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAddType} className="card mb-6 space-y-4">
          <h2 className="font-heading text-lg font-semibold text-forest-dark">New Item Type</h2>
          {addError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{addError}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Name *</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="label">Icon (emoji)</label>
              <input type="text" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="label">Color</label>
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="input-field h-10" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={adding} className="btn-primary text-sm">
              {adding ? 'Adding...' : 'Add Type'}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {itemTypes.length === 0 && !showAddForm && (
        <div className="card text-center py-12">
          <p className="text-sage mb-4">No item types configured yet. Add your first item type to get started.</p>
          <button onClick={() => setShowAddForm(true)} className="btn-primary">
            + Add Your First Type
          </button>
        </div>
      )}

      {/* Item type list */}
      <div className="space-y-3">
        {itemTypes.map((type, index) => (
          <ItemTypeEditor
            key={type.id}
            itemType={type}
            itemCount={itemCounts[type.id] || 0}
            isExpanded={expandedId === type.id}
            onToggleExpand={() => setExpandedId(expandedId === type.id ? null : type.id)}
            onSave={(updates) => handleSaveType(type.id, updates)}
            onDelete={() => handleDeleteType(type.id)}
            onMoveUp={() => handleReorder(type.id, 'up')}
            onMoveDown={() => handleReorder(type.id, 'down')}
            isFirst={index === 0}
            isLast={index === itemTypes.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the app builds**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/types/page.tsx src/components/admin/ItemTypeEditor.tsx
git commit -m "feat: add item type management page with list, create, edit, delete, reorder"
```

### Task 5: Custom Field Editor (within Item Type)

**Files:**
- Create: `src/components/admin/CustomFieldEditor.tsx`
- Modify: `src/components/admin/ItemTypeEditor.tsx`

- [ ] **Step 1: Create CustomFieldEditor component**

Create `src/components/admin/CustomFieldEditor.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CustomField, FieldType } from '@/lib/types';

interface CustomFieldEditorProps {
  itemTypeId: string;
}

export default function CustomFieldEditor({ itemTypeId }: CustomFieldEditorProps) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Form state for add/edit
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<FieldType>('text');
  const [formRequired, setFormRequired] = useState(false);
  const [formOptions, setFormOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFields();
  }, [itemTypeId]);

  async function fetchFields() {
    const supabase = createClient();
    const { data } = await supabase
      .from('custom_fields')
      .select('*')
      .eq('item_type_id', itemTypeId)
      .order('sort_order', { ascending: true });
    if (data) setFields(data);
    setLoading(false);
  }

  function resetForm() {
    setFormName('');
    setFormType('text');
    setFormRequired(false);
    setFormOptions([]);
    setEditingId(null);
    setShowAdd(false);
    setError('');
  }

  function startEdit(field: CustomField) {
    setFormName(field.name);
    setFormType(field.field_type);
    setFormRequired(field.required);
    setFormOptions(field.options || []);
    setEditingId(field.id);
    setShowAdd(false);
  }

  function startAdd() {
    resetForm();
    setShowAdd(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      const payload = {
        name: formName.trim(),
        field_type: formType,
        required: formRequired,
        options: formType === 'dropdown' ? formOptions.filter((o) => o.trim()) : null,
        item_type_id: itemTypeId,
      };

      if (editingId) {
        const { error: err } = await supabase.from('custom_fields').update(payload).eq('id', editingId);
        if (err) throw err;
        setFields((prev) => prev.map((f) => (f.id === editingId ? { ...f, ...payload } : f)));
      } else {
        const maxSort = fields.length > 0 ? Math.max(...fields.map((f) => f.sort_order)) : -1;
        const { data, error: err } = await supabase
          .from('custom_fields')
          .insert({ ...payload, sort_order: maxSort + 1 })
          .select()
          .single();
        if (err) throw err;
        setFields((prev) => [...prev, data]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save field.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this custom field? Existing item data for this field will be orphaned.')) return;
    const supabase = createClient();
    const { error: err } = await supabase.from('custom_fields').delete().eq('id', id);
    if (!err) {
      setFields((prev) => prev.filter((f) => f.id !== id));
      if (editingId === id) resetForm();
    }
  }

  function addOption() {
    setFormOptions([...formOptions, '']);
  }

  function removeOption(index: number) {
    setFormOptions(formOptions.filter((_, i) => i !== index));
  }

  function updateOption(index: number, value: string) {
    setFormOptions(formOptions.map((o, i) => (i === index ? value : o)));
  }

  if (loading) return <p className="text-sm text-sage">Loading fields...</p>;

  const isEditing = editingId !== null || showAdd;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-forest-dark">Custom Fields</h4>
        {!isEditing && (
          <button onClick={startAdd} className="text-xs text-forest hover:text-forest-dark">
            + Add Field
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-2">{error}</div>
      )}

      {/* Existing fields list */}
      {fields.length > 0 && (
        <div className="space-y-1 mb-3">
          {fields.map((field) => (
            <div key={field.id} className="flex items-center gap-2 text-sm py-1">
              <span className="text-forest-dark flex-1">{field.name}</span>
              <span className="text-xs text-sage bg-sage-light px-2 py-0.5 rounded">{field.field_type}</span>
              {field.required && <span className="text-xs text-amber-600">required</span>}
              <button onClick={() => startEdit(field)} className="text-xs text-forest hover:text-forest-dark">
                Edit
              </button>
              <button onClick={() => handleDelete(field.id)} className="text-xs text-red-600 hover:text-red-800">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {fields.length === 0 && !isEditing && (
        <p className="text-xs text-sage italic mb-2">No custom fields yet.</p>
      )}

      {/* Add/Edit form */}
      {isEditing && (
        <div className="bg-sage-light rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Field Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="label text-xs">Type</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value as FieldType)} className="input-field text-sm">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="dropdown">Dropdown</option>
                <option value="date">Date</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-forest-dark">
            <input type="checkbox" checked={formRequired} onChange={(e) => setFormRequired(e.target.checked)} />
            Required
          </label>

          {formType === 'dropdown' && (
            <div>
              <label className="label text-xs">Options</label>
              {formOptions.map((opt, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <input
                    type="text" value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    className="input-field text-sm flex-1" placeholder={`Option ${i + 1}`}
                  />
                  <button type="button" onClick={() => removeOption(i)} className="text-xs text-red-600 px-2">Remove</button>
                </div>
              ))}
              <button type="button" onClick={addOption} className="text-xs text-forest hover:text-forest-dark">
                + Add Option
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
              {saving ? 'Saving...' : editingId ? 'Update Field' : 'Add Field'}
            </button>
            <button onClick={resetForm} className="btn-secondary text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create UpdateTypeEditor component**

Create `src/components/admin/UpdateTypeEditor.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UpdateType } from '@/lib/types';

interface UpdateTypeEditorProps {
  itemTypeId: string;
}

export default function UpdateTypeEditor({ itemTypeId }: UpdateTypeEditorProps) {
  const [typeSpecific, setTypeSpecific] = useState<UpdateType[]>([]);
  const [globalTypes, setGlobalTypes] = useState<UpdateType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('📝');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTypes();
  }, [itemTypeId]);

  async function fetchTypes() {
    const supabase = createClient();
    const { data } = await supabase
      .from('update_types')
      .select('*')
      .order('sort_order', { ascending: true });

    if (data) {
      setGlobalTypes(data.filter((t) => t.is_global));
      setTypeSpecific(data.filter((t) => !t.is_global && t.item_type_id === itemTypeId));
    }
    setLoading(false);
  }

  function resetForm() {
    setFormName('');
    setFormIcon('📝');
    setEditingId(null);
    setShowAdd(false);
    setError('');
  }

  function startEdit(ut: UpdateType) {
    setFormName(ut.name);
    setFormIcon(ut.icon);
    setEditingId(ut.id);
    setShowAdd(false);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    setError('');

    try {
      const supabase = createClient();

      if (editingId) {
        const { error: err } = await supabase
          .from('update_types')
          .update({ name: formName.trim(), icon: formIcon })
          .eq('id', editingId);
        if (err) throw err;
        setTypeSpecific((prev) => prev.map((t) => (t.id === editingId ? { ...t, name: formName.trim(), icon: formIcon } : t)));
      } else {
        const maxSort = typeSpecific.length > 0 ? Math.max(...typeSpecific.map((t) => t.sort_order)) : (globalTypes.length > 0 ? Math.max(...globalTypes.map((t) => t.sort_order)) : -1);
        const { data, error: err } = await supabase
          .from('update_types')
          .insert({
            name: formName.trim(),
            icon: formIcon,
            is_global: false,
            item_type_id: itemTypeId,
            sort_order: maxSort + 1,
          })
          .select()
          .single();
        if (err) throw err;
        setTypeSpecific((prev) => [...prev, data]);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();

    // Pre-check: count observations using this update type
    const { count } = await supabase
      .from('item_updates')
      .select('*', { count: 'exact', head: true })
      .eq('update_type_id', id);

    if (count && count > 0) {
      setError(`Cannot delete: ${count} observation${count === 1 ? '' : 's'} use this update type.`);
      return;
    }

    if (!confirm('Delete this update type?')) return;
    const { error: err } = await supabase.from('update_types').delete().eq('id', id);
    if (!err) {
      setTypeSpecific((prev) => prev.filter((t) => t.id !== id));
      if (editingId === id) resetForm();
    }
  }

  if (loading) return <p className="text-sm text-sage">Loading update types...</p>;

  const isEditing = editingId !== null || showAdd;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-forest-dark">Update Types</h4>
        {!isEditing && (
          <button onClick={() => { resetForm(); setShowAdd(true); }} className="text-xs text-forest hover:text-forest-dark">
            + Add Update Type
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-2">{error}</div>
      )}

      {/* Global types (read-only) */}
      {globalTypes.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-sage mb-1">Global (all types):</p>
          <div className="flex flex-wrap gap-2">
            {globalTypes.map((t) => (
              <span key={t.id} className="text-xs bg-sage-light text-sage px-2 py-1 rounded">
                {t.icon} {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Type-specific update types */}
      {typeSpecific.length > 0 && (
        <div className="space-y-1 mb-3">
          <p className="text-xs text-sage mb-1">Type-specific:</p>
          {typeSpecific.map((ut) => (
            <div key={ut.id} className="flex items-center gap-2 text-sm py-1">
              <span>{ut.icon}</span>
              <span className="text-forest-dark flex-1">{ut.name}</span>
              <button onClick={() => startEdit(ut)} className="text-xs text-forest hover:text-forest-dark">Edit</button>
              <button onClick={() => handleDelete(ut.id)} className="text-xs text-red-600 hover:text-red-800">Delete</button>
            </div>
          ))}
        </div>
      )}

      {typeSpecific.length === 0 && !isEditing && (
        <p className="text-xs text-sage italic mb-2">No type-specific update types.</p>
      )}

      {/* Add/Edit form */}
      {isEditing && (
        <div className="bg-sage-light rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Name *</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="label text-xs">Icon (emoji)</label>
              <input type="text" value={formIcon} onChange={(e) => setFormIcon(e.target.value)} className="input-field text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
            </button>
            <button onClick={resetForm} className="btn-secondary text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Integrate CustomFieldEditor and UpdateTypeEditor into ItemTypeEditor**

In `src/components/admin/ItemTypeEditor.tsx`, add imports at the top:

```typescript
import CustomFieldEditor from './CustomFieldEditor';
import UpdateTypeEditor from './UpdateTypeEditor';
```

Inside the expanded content section, after the save/delete buttons `<div>`, add:

```typescript
<div className="space-y-6 pt-4 border-t border-sage-light">
  <CustomFieldEditor itemTypeId={itemType.id} />
  <UpdateTypeEditor itemTypeId={itemType.id} />
</div>
```

- [ ] **Step 4: Verify the app builds**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/CustomFieldEditor.tsx src/components/admin/UpdateTypeEditor.tsx src/components/admin/ItemTypeEditor.tsx
git commit -m "feat: add custom field and update type editors within item type cards"
```

---

## Chunk 3: Species Management Page

### Task 6: Species Form Component

**Files:**
- Create: `src/components/admin/SpeciesForm.tsx`

- [ ] **Step 1: Create SpeciesForm component**

Create `src/components/admin/SpeciesForm.tsx`. This handles add and edit modes with single-photo upload. In edit mode, shows existing photo with replace option.

```typescript
'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Species } from '@/lib/types';
import { resizeImage } from '@/lib/utils';

interface SpeciesFormProps {
  species?: Species;  // undefined = add mode, defined = edit mode
  onSaved: (species: Species) => void;
  onCancel: () => void;
}

export default function SpeciesForm({ species, onSaved, onCancel }: SpeciesFormProps) {
  const [name, setName] = useState(species?.name || '');
  const [scientificName, setScientificName] = useState(species?.scientific_name || '');
  const [description, setDescription] = useState(species?.description || '');
  const [conservationStatus, setConservationStatus] = useState(species?.conservation_status || '');
  const [category, setCategory] = useState(species?.category || '');
  const [externalLink, setExternalLink] = useState(species?.external_link || '');
  const [sortOrder, setSortOrder] = useState(species?.sort_order ?? 0);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(() => {
    if (!species?.photo_path) return null;
    const supabase = createClient();
    const { data } = supabase.storage.from('item-photos').getPublicUrl(species.photo_path);
    return data.publicUrl;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const blob = await resizeImage(file, 800);
      const resized = new File([blob], file.name, { type: 'image/jpeg' });
      setPhotoFile(resized);
      setPhotoPreview(URL.createObjectURL(resized));
      setExistingPhotoUrl(null);
    } catch {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      setExistingPhotoUrl(null);
    }
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setExistingPhotoUrl(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError('');

    try {
      const supabase = createClient();
      let photoPath = species?.photo_path || null;

      // If photo was removed (no new file, no existing URL, but had a path)
      if (!photoFile && !existingPhotoUrl && species?.photo_path) {
        photoPath = null;
      }

      const payload = {
        name: name.trim(),
        scientific_name: scientificName.trim() || null,
        description: description.trim() || null,
        conservation_status: conservationStatus.trim() || null,
        category: category.trim() || null,
        external_link: externalLink.trim() || null,
        sort_order: sortOrder,
        photo_path: photoPath,
      };

      if (species) {
        // Update — upload photo to the correct path directly
        if (photoFile) {
          const path = `species/${species.id}/${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage.from('item-photos').upload(path, photoFile);
          if (uploadErr) throw uploadErr;
          payload.photo_path = path;
        }

        const { data, error: err } = await supabase
          .from('species')
          .update(payload)
          .eq('id', species.id)
          .select()
          .single();
        if (err) throw err;
        onSaved(data);
      } else {
        // Insert — create the record first, then upload photo with real id
        const { data, error: err } = await supabase
          .from('species')
          .insert({ ...payload, photo_path: null })
          .select()
          .single();
        if (err) throw err;

        if (photoFile) {
          const path = `species/${data.id}/${Date.now()}.jpg`;
          const { error: uploadErr } = await supabase.storage.from('item-photos').upload(path, photoFile);
          if (uploadErr) throw uploadErr;
          await supabase.from('species').update({ photo_path: path }).eq('id', data.id);
          data.photo_path = path;
        }

        onSaved(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save species.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="font-heading text-lg font-semibold text-forest-dark">
        {species ? 'Edit Species' : 'Add Species'}
      </h2>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Common Name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" required />
        </div>
        <div>
          <label className="label">Scientific Name</label>
          <input type="text" value={scientificName} onChange={(e) => setScientificName(e.target.value)} className="input-field" placeholder="e.g., Poecile atricapillus" />
        </div>
      </div>

      <div>
        <label className="label">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input-field min-h-[80px]" placeholder="Habitat, behavior notes..." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Category</label>
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="input-field" placeholder="e.g., Songbirds" />
        </div>
        <div>
          <label className="label">Conservation Status</label>
          <input type="text" value={conservationStatus} onChange={(e) => setConservationStatus(e.target.value)} className="input-field" placeholder="e.g., Least Concern" />
        </div>
      </div>

      <div>
        <label className="label">External Link</label>
        <input type="url" value={externalLink} onChange={(e) => setExternalLink(e.target.value)} className="input-field" placeholder="https://..." />
      </div>

      <div>
        <label className="label">Sort Order</label>
        <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} className="input-field w-24" />
      </div>

      {/* Photo upload */}
      <div>
        <label className="label">Photo</label>
        {(photoPreview || existingPhotoUrl) && (
          <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-sage-light mb-2">
            <img src={photoPreview || existingPhotoUrl!} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={removePhoto}
              className="absolute top-1 right-1 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center text-sm hover:bg-black/70"
            >
              &times;
            </button>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
        {!photoPreview && !existingPhotoUrl && (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary text-sm">
            Add Photo
          </button>
        )}
        {(photoPreview || existingPhotoUrl) && (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-forest hover:text-forest-dark">
            Replace Photo
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? 'Saving...' : species ? 'Update Species' : 'Add Species'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/SpeciesForm.tsx
git commit -m "feat: add SpeciesForm component with single-photo upload"
```

### Task 7: Species Card Component

**Files:**
- Create: `src/components/admin/SpeciesCard.tsx`

- [ ] **Step 1: Create SpeciesCard component**

Create `src/components/admin/SpeciesCard.tsx`:

```typescript
'use client';

import { useMemo } from 'react';
import type { Species } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';

interface SpeciesCardProps {
  species: Species;
  onEdit: () => void;
  onDelete: () => void;
}

export default function SpeciesCard({ species, onEdit, onDelete }: SpeciesCardProps) {
  const photoUrl = useMemo(() => {
    if (!species.photo_path) return null;
    return createClient().storage.from('item-photos').getPublicUrl(species.photo_path).data.publicUrl;
  }, [species.photo_path]);

  return (
    <div className="card p-0 overflow-hidden">
      {/* Photo or placeholder */}
      <div className="h-32 bg-sage-light flex items-center justify-center">
        {photoUrl ? (
          <img src={photoUrl} alt={species.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl">🐦</span>
        )}
      </div>

      <div className="p-3">
        <h3 className="font-medium text-forest-dark text-sm">{species.name}</h3>
        {species.scientific_name && (
          <p className="text-xs text-sage italic">{species.scientific_name}</p>
        )}

        <div className="flex flex-wrap gap-1 mt-2">
          {species.category && (
            <span className="text-xs bg-sage-light text-sage px-2 py-0.5 rounded">{species.category}</span>
          )}
          {species.conservation_status && (
            <span className="text-xs bg-sage-light text-sage px-2 py-0.5 rounded">{species.conservation_status}</span>
          )}
        </div>

        <div className="flex gap-2 mt-3 pt-2 border-t border-sage-light">
          <button onClick={onEdit} className="text-xs text-forest hover:text-forest-dark">Edit</button>
          <button onClick={onDelete} className="text-xs text-red-600 hover:text-red-800">Delete</button>
          {species.external_link && (
            <a href={species.external_link} target="_blank" rel="noopener noreferrer" className="text-xs text-forest hover:text-forest-dark ml-auto">
              Link ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/SpeciesCard.tsx
git commit -m "feat: add SpeciesCard component for species grid display"
```

### Task 8: Species Admin Page

**Files:**
- Create: `src/app/admin/species/page.tsx`

- [ ] **Step 1: Create the species admin page**

Create `src/app/admin/species/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Species } from '@/lib/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SpeciesForm from '@/components/admin/SpeciesForm';
import SpeciesCard from '@/components/admin/SpeciesCard';

export default function SpeciesPage() {
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSpecies, setEditingSpecies] = useState<Species | undefined>(undefined);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSpecies();
  }, []);

  async function fetchSpecies() {
    const supabase = createClient();
    const { data } = await supabase
      .from('species')
      .select('*')
      .order('sort_order', { ascending: true });
    if (data) setSpeciesList(data);
    setLoading(false);
  }

  function handleSaved(saved: Species) {
    if (editingSpecies) {
      setSpeciesList((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    } else {
      setSpeciesList((prev) => [...prev, saved]);
    }
    setEditingSpecies(undefined);
    setShowAdd(false);
  }

  async function handleDelete(species: Species) {
    setError('');
    const supabase = createClient();

    // Pre-check associations
    const [itemRes, updateRes] = await Promise.all([
      supabase.from('item_species').select('*', { count: 'exact', head: true }).eq('species_id', species.id),
      supabase.from('update_species').select('*', { count: 'exact', head: true }).eq('species_id', species.id),
    ]);

    const itemCount = itemRes.count || 0;
    const updateCount = updateRes.count || 0;

    if (itemCount > 0 || updateCount > 0) {
      setError(`Cannot delete "${species.name}": associated with ${itemCount} item${itemCount === 1 ? '' : 's'} and ${updateCount} observation${updateCount === 1 ? '' : 's'}.`);
      return;
    }

    if (!confirm(`Delete "${species.name}"?`)) return;

    const { error: err } = await supabase.from('species').delete().eq('id', species.id);
    if (err) {
      setError(err.message);
    } else {
      setSpeciesList((prev) => prev.filter((s) => s.id !== species.id));
    }
  }

  // Derived filter values
  const categories = [...new Set(speciesList.map((s) => s.category).filter(Boolean))] as string[];
  const statuses = [...new Set(speciesList.map((s) => s.conservation_status).filter(Boolean))] as string[];

  // Filtered list
  const filtered = speciesList.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !(s.scientific_name || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    if (filterCategory && s.category !== filterCategory) return false;
    if (filterStatus && s.conservation_status !== filterStatus) return false;
    return true;
  });

  if (loading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-semibold text-forest-dark">Species</h1>
        {!showAdd && !editingSpecies && (
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
            + Add Species
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 mb-4">{error}</div>
      )}

      {/* Add/Edit form */}
      {(showAdd || editingSpecies) && (
        <div className="mb-6">
          <SpeciesForm
            species={editingSpecies}
            onSaved={handleSaved}
            onCancel={() => { setShowAdd(false); setEditingSpecies(undefined); }}
          />
        </div>
      )}

      {/* Search and filters */}
      {speciesList.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field flex-1 min-w-[200px]"
            placeholder="Search by name..."
          />
          {categories.length > 0 && (
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="input-field w-auto">
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {statuses.length > 0 && (
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-auto">
              <option value="">All Statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Empty state */}
      {speciesList.length === 0 && !showAdd && (
        <div className="card text-center py-12">
          <p className="text-sage mb-4">No species added yet. Add your first species to start tracking wildlife.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            + Add Your First Species
          </button>
        </div>
      )}

      {/* Species grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((species) => (
          <SpeciesCard
            key={species.id}
            species={species}
            onEdit={() => setEditingSpecies(species)}
            onDelete={() => handleDelete(species)}
          />
        ))}
      </div>

      {speciesList.length > 0 && filtered.length === 0 && (
        <p className="text-center text-sage py-8">No species match your search.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the app builds**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/species/page.tsx
git commit -m "feat: add species management page with CRUD, search, and filtering"
```

---

## Chunk 4: Species Integration into Existing UI

### Task 9: SpeciesSelect Component

**Files:**
- Create: `src/components/manage/SpeciesSelect.tsx`

- [ ] **Step 1: Create SpeciesSelect component**

Create `src/components/manage/SpeciesSelect.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Species } from '@/lib/types';

interface SpeciesSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function SpeciesSelect({ selectedIds, onChange }: SpeciesSelectProps) {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const { data } = await supabase
        .from('species')
        .select('*')
        .order('sort_order', { ascending: true });
      if (data) setSpecies(data);
      setLoading(false);
    }
    fetch();
  }, []);

  function toggleSpecies(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function removeSpecies(id: string) {
    onChange(selectedIds.filter((sid) => sid !== id));
  }

  if (loading) return <p className="text-xs text-sage">Loading species...</p>;
  if (species.length === 0) return null;

  const selectedSpecies = species.filter((s) => selectedIds.includes(s.id));
  const unselectedSpecies = species.filter((s) => !selectedIds.includes(s.id));

  return (
    <div>
      {/* Selected chips */}
      {selectedSpecies.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedSpecies.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
              {s.name}
              <button type="button" onClick={() => removeSpecies(s.id)} className="hover:text-red-600">&times;</button>
            </span>
          ))}
        </div>
      )}

      {/* Add button / dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="text-sm text-forest hover:text-forest-dark"
        >
          {selectedIds.length === 0 ? 'Select species...' : '+ Add more'}
        </button>

        {showDropdown && unselectedSpecies.length > 0 && (
          <div className="absolute z-10 mt-1 w-64 max-h-48 overflow-y-auto bg-white border border-sage-light rounded-lg shadow-lg">
            {unselectedSpecies.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSpecies(s.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-sage-light text-forest-dark"
              >
                {s.name}
                {s.scientific_name && <span className="text-sage italic ml-1">({s.scientific_name})</span>}
              </button>
            ))}
          </div>
        )}

        {showDropdown && unselectedSpecies.length === 0 && (
          <div className="absolute z-10 mt-1 w-64 bg-white border border-sage-light rounded-lg shadow-lg p-3 text-xs text-sage">
            All species selected.
          </div>
        )}
      </div>

      {/* Click-outside handler */}
      {showDropdown && (
        <div className="fixed inset-0 z-[5]" onClick={() => setShowDropdown(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/manage/SpeciesSelect.tsx
git commit -m "feat: add SpeciesSelect multi-select component"
```

### Task 10: Integrate SpeciesSelect into ItemForm

**Files:**
- Modify: `src/components/manage/ItemForm.tsx`

- [ ] **Step 1: Add species selection to ItemForm**

In `src/components/manage/ItemForm.tsx`:

1. Add import at top:
```typescript
import SpeciesSelect from './SpeciesSelect';
```

2. Add state variable after the `photos` state:
```typescript
const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<string[]>([]);
```

3. After the photos `<div>` section (around line 296), add:
```typescript
<div>
  <label className="label">Species</label>
  <SpeciesSelect selectedIds={selectedSpeciesIds} onChange={setSelectedSpeciesIds} />
</div>
```

4. In `handleSubmit`, after the photo upload loop and before `router.push('/manage')`, add:
```typescript
// Save species associations (batch insert)
if (selectedSpeciesIds.length > 0) {
  await supabase.from('item_species').insert(
    selectedSpeciesIds.map((speciesId) => ({ item_id: item.id, species_id: speciesId }))
  );
}
```

- [ ] **Step 2: Verify the app builds**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/manage/ItemForm.tsx
git commit -m "feat: add species multi-select to item creation form"
```

### Task 11: Integrate SpeciesSelect into UpdateForm

**Files:**
- Modify: `src/components/manage/UpdateForm.tsx`

- [ ] **Step 1: Add species selection to UpdateForm**

In `src/components/manage/UpdateForm.tsx`:

1. Add import at top:
```typescript
import SpeciesSelect from './SpeciesSelect';
```

2. Add state variable after the `photos` state:
```typescript
const [selectedSpeciesIds, setSelectedSpeciesIds] = useState<string[]>([]);
```

3. After the photos `<div>` section (around line 227), add:
```typescript
<div>
  <label className="label">Species Observed</label>
  <SpeciesSelect selectedIds={selectedSpeciesIds} onChange={setSelectedSpeciesIds} />
</div>
```

4. In `handleSubmit`, after the photo upload loop and before `router.push('/manage')`, add:
```typescript
// Save species associations (batch insert)
if (selectedSpeciesIds.length > 0) {
  await supabase.from('update_species').insert(
    selectedSpeciesIds.map((speciesId) => ({ update_id: update.id, species_id: speciesId }))
  );
}
```

- [ ] **Step 2: Verify the app builds**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/manage/UpdateForm.tsx
git commit -m "feat: add species multi-select to observation/update form"
```

### Task 12: Show Species in DetailPanel and UpdateTimeline

**Files:**
- Modify: `src/app/page.tsx` (handleMarkerClick query)
- Modify: `src/components/item/DetailPanel.tsx`
- Modify: `src/components/item/UpdateTimeline.tsx`

- [ ] **Step 1: Update handleMarkerClick in page.tsx to fetch species**

In `src/app/page.tsx`, in the `handleMarkerClick` function, add an `item_species` query to the existing `Promise.all` (around line 96). Add `Species` to the import from `@/lib/types`.

Change the existing `Promise.all` to include the species query:

```typescript
const [updateRes, photoRes, updateTypeRes, itemSpeciesRes] = await Promise.all([
  supabase
    .from("item_updates")
    .select("*")
    .eq("item_id", item.id)
    .order("update_date", { ascending: false }),
  supabase.from("photos").select("*").eq("item_id", item.id),
  supabase
    .from("update_types")
    .select("*")
    .order("sort_order", { ascending: true }),
  supabase
    .from("item_species")
    .select("species_id, species(*)")
    .eq("item_id", item.id),
]);
```

Then after the `Promise.all`, add the update-species query (needs update IDs from the first query):

```typescript
const itemSpecies: Species[] = (itemSpeciesRes.data || []).map(
  (row: { species_id: string; species: Species }) => row.species
);

// Fetch species for each update (needs updateRes.data, so must be sequential)
const updateIds = (updateRes.data || []).map((u) => u.id);
const updateSpeciesRes = updateIds.length > 0
  ? await supabase
      .from('update_species')
      .select('update_id, species_id, species(*)')
      .in('update_id', updateIds)
  : { data: [] };

const updateSpeciesMap = new Map<string, Species[]>();
for (const row of (updateSpeciesRes.data || []) as { update_id: string; species_id: string; species: Species }[]) {
  if (!updateSpeciesMap.has(row.update_id)) updateSpeciesMap.set(row.update_id, []);
  updateSpeciesMap.get(row.update_id)!.push(row.species);
}
```

Then update the `setSelectedItem` call to include species:

```typescript
setSelectedItem({
  ...item,
  item_type: itemType!,
  updates: (updateRes.data || []).map((u) => ({
    ...u,
    update_type: typeMap.get(u.update_type_id)!,
    photos: [],
    species: updateSpeciesMap.get(u.id) || [],
  })),
  photos: photoRes.data || [],
  custom_fields: fields,
  species: itemSpecies,
});
```

- [ ] **Step 2: Add species display to DetailPanel**

In `src/components/item/DetailPanel.tsx`, after the custom fields section and before the description section (around line 83), add:

```typescript
{/* Species */}
{item.species && item.species.length > 0 && (
  <div className="mb-3">
    <span className="text-xs font-medium text-sage uppercase tracking-wide">
      Species
    </span>
    <div className="flex flex-wrap gap-1 mt-1">
      {item.species.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1 bg-forest/10 text-forest-dark text-xs px-2 py-1 rounded-full">
          {s.name}
        </span>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Add species display to UpdateTimeline**

In `src/components/item/UpdateTimeline.tsx`, update the `UpdateTimelineProps` interface to include species:

```typescript
import type { ItemUpdate, UpdateType as UpdateTypeRecord, Photo, Species } from '@/lib/types';

interface UpdateTimelineProps {
  updates: (ItemUpdate & { update_type?: UpdateTypeRecord; photos?: Photo[]; species?: Species[] })[];
}
```

Then in the content section of each update (after `update.content` paragraph, around line 43), add:

```typescript
{update.species && update.species.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1">
    {update.species.map((s) => (
      <span key={s.id} className="inline-flex items-center bg-forest/10 text-forest-dark text-[10px] px-1.5 py-0.5 rounded-full">
        {s.name}
      </span>
    ))}
  </div>
)}
```

- [ ] **Step 4: Verify the app builds**

Run: `npx next build`
Expected: Build succeeds.

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/item/DetailPanel.tsx src/components/item/UpdateTimeline.tsx
git commit -m "feat: display species in item detail panel and update timeline"
```

### Task 13: Update list page species queries (if needed)

**Files:**
- Modify: `src/app/list/page.tsx` (if it uses handleMarkerClick-like pattern)

- [ ] **Step 1: Check if list page needs species integration**

Read `src/app/list/page.tsx`. If it links to the map page with `?item=id` for detail viewing, no changes needed. If it has its own detail panel, apply the same species query pattern from Task 12.

- [ ] **Step 2: Make changes if needed and commit**

```bash
git add src/app/list/page.tsx
git commit -m "feat: integrate species display into list view"
```

---

## Chunk 5: Final Verification

### Task 14: End-to-End Build Verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run the production build**

Run: `npx next build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Final commit (if any remaining changes)**

```bash
git status
# If any uncommitted changes, stage and commit them
```
