'use server';

import { createClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant/server';
import { typeLayoutSchema } from '@/lib/layout/schemas';
import type { TypeLayout } from '@/lib/layout/types';

interface NewField {
  name: string;
  field_type: string;
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

interface SaveTypeWithLayoutInput {
  itemTypeId: string;
  layout: TypeLayout;
  newFields: NewField[];
}

export async function saveTypeWithLayout(input: SaveTypeWithLayoutInput) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const tenant = await getTenantContext();
  if (!tenant.orgId) return { error: 'No org context' };

  // Validate layout
  const parsed = typeLayoutSchema.safeParse(input.layout);
  if (!parsed.success) {
    return { error: `Invalid layout: ${parsed.error.issues[0]?.message ?? 'validation failed'}` };
  }

  // Create any new fields first
  const createdFieldIds: string[] = [];
  if (input.newFields.length > 0) {
    const { data: newFieldRows, error: fieldError } = await supabase
      .from('custom_fields')
      .insert(
        input.newFields.map((f) => ({
          item_type_id: input.itemTypeId,
          name: f.name,
          field_type: f.field_type,
          options: f.options,
          required: f.required,
          sort_order: f.sort_order,
          org_id: tenant.orgId,
        })),
      )
      .select();

    if (fieldError) return { error: `Failed to create fields: ${fieldError.message}` };
    if (newFieldRows) {
      createdFieldIds.push(...newFieldRows.map((r: { id: string }) => r.id));
    }
  }

  // Save layout on item_type
  const { error: layoutError } = await supabase
    .from('item_types')
    .update({ layout: parsed.data })
    .eq('id', input.itemTypeId);

  if (layoutError) return { error: `Failed to save layout: ${layoutError.message}` };

  return { success: true, createdFieldIds };
}

export async function deleteLayout(itemTypeId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('item_types')
    .update({ layout: null })
    .eq('id', itemTypeId);

  if (error) return { error: `Failed to delete layout: ${error.message}` };
  return { success: true };
}
