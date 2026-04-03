# Rich Update Types: Custom Fields & Role-Based Permissions

**Issue:** #179
**Date:** 2026-04-03
**Status:** Draft

## Summary

Enrich update types with custom field definitions and per-action role thresholds. Today, update types are just a name + icon label. After this work, each update type can define form fields (text, number, dropdown, date) and restrict create/edit/delete actions by minimum role.

## Goals

- Admins can define custom fields per update type (e.g., "Maintenance" gets a "Condition" dropdown and "Cost" number field)
- Each update type can set minimum role thresholds for create, edit, and delete independently
- The Add Update form dynamically renders fields based on the selected update type
- Shared field components across item types, entity types, and update types
- No breaking changes to existing data or workflows

## Non-Goals

- Approval workflows for updates
- Conditional fields (field visibility depending on other field values)
- New field types beyond the existing set (text, number, dropdown, date)
- Changes to entity types
- Visibility restrictions on update types (all types visible to all roles)

## Schema Changes

### New table: `update_type_fields`

Mirrors `entity_type_fields`. Defines the custom fields available for a given update type.

```sql
create table update_type_fields (
  id uuid primary key default gen_random_uuid(),
  update_type_id uuid not null references update_types(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  field_type text not null check (field_type in ('text','number','dropdown','date')),
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0
);

create index idx_update_type_fields_type on update_type_fields(update_type_id);
create index idx_update_type_fields_org on update_type_fields(org_id);

-- Auto-populate org_id trigger (same as entity_type_fields)
create trigger update_type_fields_auto_org
  before insert on update_type_fields
  for each row execute function auto_populate_org_property('org_scoped');

-- RLS policies (matching entity_type_fields pattern)
alter table update_type_fields enable row level security;

create policy "update_type_fields_public_read" on update_type_fields
  for select using (true);

create policy "update_type_fields_insert" on update_type_fields
  for insert with check (
    org_id in (select user_org_admin_org_ids())
    or is_platform_admin()
  );

create policy "update_type_fields_update" on update_type_fields
  for update using (
    org_id in (select user_org_admin_org_ids())
    or is_platform_admin()
  );

create policy "update_type_fields_delete" on update_type_fields
  for delete using (
    org_id in (select user_org_admin_org_ids())
    or is_platform_admin()
  );
```

### Altered table: `update_types`

Three new nullable columns for role thresholds:

```sql
alter table update_types
  add column min_role_create text check (min_role_create in ('contributor','org_staff','org_admin')),
  add column min_role_edit   text check (min_role_edit   in ('contributor','org_staff','org_admin')),
  add column min_role_delete text check (min_role_delete in ('contributor','org_staff','org_admin'));
```

When null, the existing generic `updates` category permissions apply (no behavior change for existing update types). When set, the user's resolved base_role must meet or exceed the threshold.

### Altered table: `item_updates`

```sql
alter table item_updates
  add column custom_field_values jsonb not null default '{}';
```

Same pattern as `items.custom_field_values`. Stores the values for the update type's custom fields keyed by field ID.

### TypeScript type changes

```typescript
// update_types additions
interface UpdateType {
  // ...existing fields
  min_role_create: string | null;
  min_role_edit: string | null;
  min_role_delete: string | null;
}

// new interface
interface UpdateTypeField {
  id: string;
  update_type_id: string;
  org_id: string;
  name: string;
  field_type: 'text' | 'number' | 'dropdown' | 'date';
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

// item_updates addition
interface ItemUpdate {
  // ...existing fields
  custom_field_values: Record<string, unknown>;
}
```

## Permission Resolution

Role hierarchy (lowest to highest): `public < viewer < contributor < org_staff < org_admin < platform_admin`

New pure function `canPerformUpdateTypeAction(userBaseRole, updateType, action)`:

1. Read `updateType.min_role_{action}` for the requested action
2. If null — return null (caller must still check generic `updates` permissions separately)
3. If set — return `roleLevel(userBaseRole) >= roleLevel(threshold)`
4. Platform admins always return true

This function is used in two places:
- **Client-side:** UpdateForm picker disables options where create threshold isn't met
- **Server-side:** RLS policy or `check_permission` function validates on insert/update/delete

## UI Changes

### Update Type Admin (UpdateTypeEditor)

Expanded inline form when editing an update type:

1. **Name + Icon** — unchanged
2. **Custom fields editor** — shared `FieldDefinitionEditor` component. Add/remove/reorder fields, pick field type, configure options for dropdowns, toggle required.
3. **Role thresholds** — three dropdowns:
   - "Min role to create" — Anyone / Contributor / Staff / Admin
   - "Min role to edit" — Anyone / Contributor / Staff / Admin
   - "Min role to delete" — Anyone / Contributor / Staff / Admin

### Update Form (user-facing, `/manage/update`)

1. **Update type picker** — shows all types. Types where the user doesn't meet `min_role_create` are rendered as disabled `<option>` elements with a suffix like "(Staff only)".
2. **Dynamic fields** — when a type with custom fields is selected, the shared `DynamicFieldRenderer` renders the fields below the existing notes section. Required fields are enforced on submit.
3. **Submit** — custom field values are included in the `insertItemUpdate` payload as `custom_field_values` jsonb.

### Update Timeline (display)

Custom field values are displayed on the update card alongside existing content/photos/entities as a simple key-value list (field name: value). Uses field definitions to format values appropriately (e.g., dates formatted, dropdown values shown as labels).

## Shared Field Components

Extracted from existing `EntityTypeForm` inline implementation:

| Component | Purpose | Used by |
|-----------|---------|---------|
| `FieldDefinitionEditor` | Admin: define fields on a type (add/remove/reorder/configure) | EntityTypeForm, UpdateTypeEditor |
| `DynamicFieldRenderer` | User-facing: render fields from definitions + values, call onChange | UpdateForm, (future: ItemForm) |
| `validateFieldValues` | Pure function: validate values against field definitions | UpdateForm submit, (future: ItemForm) |

Location: `src/components/shared/fields/`

These replace the inline field management in `EntityTypeForm` and are reused by the update type system.

## Offline Sync

1. **`update_type_fields`** — added to offline sync tables, fetched by org_id alongside update types
2. **`item_updates.custom_field_values`** — no new sync logic needed; the existing mutation queue handles the new column in the payload
3. **`update_types` new columns** — come along for free with existing `getUpdateTypes` fetch

## Testing

### Unit Tests (Vitest)

- **`canPerformUpdateTypeAction`** — exhaustive role/threshold combinations, null fallback, platform admin bypass
- **`validateFieldValues`** — required field enforcement, type validation, unknown fields ignored
- **`DynamicFieldRenderer`** — renders correct input types, handles onChange, shows required indicators
- **`FieldDefinitionEditor`** — add/remove/reorder fields, type picker
- **Update type picker** — all types rendered, restricted types disabled with role label

### E2E Tests (Playwright)

- **Admin configures update type** — add custom fields and role thresholds to an update type, verify persistence on reload
- **User creates update with custom fields** — select configured type, fill custom fields, submit, verify in timeline
- **Role restriction** — as contributor, verify staff-restricted type appears disabled in picker and can't be submitted
