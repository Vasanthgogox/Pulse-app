/**
 * Loads service — Sequential ID generation for loads.
 */
import { supabase } from '@/lib/supabase';

export interface LoadRow {
  id: string;
  owner_user_id: string;
  created_by_user_id: string;
  load_number: string;
  trip_id: string | null;
  indent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLoadInput {
  owner_user_id: string;
  created_by_user_id: string;
  trip_id?: string | null;
  indent_id?: string | null;
}

/**
 * Create a new load record with sequential ID.
 */
export async function createLoad(
  data: CreateLoadInput
): Promise<{ error: Error | null; load: LoadRow | null }> {
  const { data: row, error } = await supabase()
    .from('loads')
    .insert({
      owner_user_id: data.owner_user_id,
      created_by_user_id: data.created_by_user_id,
      trip_id: data.trip_id ?? null,
      indent_id: data.indent_id ?? null,
      load_number: null, // DB trigger sets this
    })
    .select()
    .single();

  if (error) return { error: new Error(error.message), load: null };
  return { error: null, load: row as LoadRow };
}

/**
 * Fetch loads for a user.
 */
export async function getLoadsByUser(userId: string): Promise<{ error: Error | null; loads: LoadRow[] }> {
  const { data, error } = await supabase()
    .from('loads')
    .select('*')
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), loads: [] };
  return { error: null, loads: (data ?? []) as LoadRow[] };
}
