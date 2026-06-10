import type { ClientFinanceProfile } from '@/features/clients/types/clientManagement.types';
import { supabase } from '@/lib/supabase';

export type UpsertClientFinanceProfileData = {
  opening_balance?: number;
  credit_limit?: number | null;
  credit_days?: number;
  billing_cycle?: string;
  invoice_frequency?: string;
  dso_target_days?: number | null;
  notes?: string | null;
};

export async function upsertClientFinanceProfile(
  orgId: string,
  clientId: string,
  payload: UpsertClientFinanceProfileData,
): Promise<{ error: Error | null; profile: ClientFinanceProfile | null }> {
  const { data, error } = await supabase()
    .from('client_finance_profiles')
    .upsert(
      {
        organization_id: orgId,
        client_id: clientId,
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,client_id' },
    )
    .select()
    .single();
  if (error) return { error: new Error(error.message), profile: null };
  return { error: null, profile: data as ClientFinanceProfile };
}
