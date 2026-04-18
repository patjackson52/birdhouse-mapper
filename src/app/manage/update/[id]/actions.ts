'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function deleteUpdate(updateId: string): Promise<{ success: true } | { error: string }> {
  if (!updateId) return { error: 'updateId is required' };

  const supabase = createClient();

  // RLS will enforce permission; we just call delete.
  const { error } = await supabase.from('item_updates').delete().eq('id', updateId);

  if (error) return { error: error.message };

  revalidatePath('/');
  return { success: true };
}
