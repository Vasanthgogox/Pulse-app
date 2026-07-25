/**
 * Pulse Credit referrals — record who referred an org; credit settlement
 * happens automatically when the referred org is verified
 * (see platform_approve_verification in 20261224030000_reach_growth_loop.sql).
 */
import { supabase } from '@/lib/supabase';

export type ReferralStatus = 'pending' | 'milestone_met' | 'credited';

export interface ReferralRow {
  id: string;
  referrer_org_id: string;
  referred_org_id: string;
  status: ReferralStatus;
  credited_at: string | null;
  created_at: string;
}

export async function recordReferral(
  referrerOrgId: string,
  referredOrgId: string,
): Promise<{ error: Error | null; referralId: string | null }> {
  const { data, error } = await supabase().rpc('record_referral', {
    p_referrer_org_id: referrerOrgId,
    p_referred_org_id: referredOrgId,
  });

  if (error) return { error: new Error(error.message), referralId: null };
  return { error: null, referralId: (data as string) ?? null };
}

export async function getReferralsForOrg(
  orgId: string,
): Promise<{ error: Error | null; referrals: ReferralRow[] }> {
  const { data, error } = await supabase()
    .from('pulse_credit_referrals')
    .select('id, referrer_org_id, referred_org_id, status, credited_at, created_at')
    .or(`referrer_org_id.eq.${orgId},referred_org_id.eq.${orgId}`)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), referrals: [] };
  return { error: null, referrals: (data ?? []) as ReferralRow[] };
}
