/**
 * Pulse Credits wallet — read-only client for the org's balance. All writes
 * go through increment_credit_wallet (see pulse_credits migration) via other
 * RPCs (publish_reach_campaign, platform_approve_verification, etc.) — this
 * service never mutates the wallet directly.
 */
import { supabase } from '@/lib/supabase';

export async function getWalletBalance(
  orgId: string,
): Promise<{ error: Error | null; balance: number }> {
  const { data, error } = await supabase()
    .from('pulse_credit_wallets')
    .select('balance')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) return { error: new Error(error.message), balance: 0 };
  return { error: null, balance: (data?.balance as number | undefined) ?? 0 };
}
