/**
 * Pulse Credit referrals — record who referred an org; credit settlement
 * happens automatically when the referred org is verified or rejected
 * (see platform_approve_verification / platform_reject_verification in
 * 20261224030000_reach_growth_loop.sql + 20261231000000_growth_activation_referral_code.sql).
 */
import { supabase } from '@/lib/supabase';

export type ReferralStatus = 'pending' | 'milestone_met' | 'credited' | 'rejected';

export interface ReferralRow {
  id: string;
  referrer_org_id: string;
  referred_org_id: string;
  status: ReferralStatus;
  credited_at: string | null;
  created_at: string;
  referrer_org_name: string | null;
  referred_org_name: string | null;
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

/** Records a referral by human-readable code instead of a raw org id — the
 * code is resolved server-side, `record_referral` itself is unchanged. */
export async function recordReferralByCode(
  code: string,
  referredOrgId: string,
): Promise<{ error: Error | null; referralId: string | null }> {
  const { data, error } = await supabase().rpc('record_referral_by_code', {
    p_code: code,
    p_referred_org_id: referredOrgId,
  });

  if (error) return { error: new Error(error.message), referralId: null };
  return { error: null, referralId: (data as string) ?? null };
}

/** Lazily generates (once) and returns the calling org's own referral code. */
export async function getMyReferralCode(
  orgId: string,
): Promise<{ error: Error | null; code: string | null }> {
  const { data, error } = await supabase().rpc('generate_referral_code', {
    p_org_id: orgId,
  });

  if (error) return { error: new Error(error.message), code: null };
  return { error: null, code: (data as string) ?? null };
}

/** Public, pre-auth lookup — resolves a code to its owning org's display
 * name for the /r/:code landing page. Returns null (not an error) if the
 * code doesn't resolve, since "unknown code" is an expected outcome there. */
export async function getReferrerNameByCode(
  code: string,
): Promise<{ error: Error | null; name: string | null }> {
  const { data, error } = await supabase().rpc('get_referrer_name_by_code', {
    p_code: code,
  });

  if (error) return { error: new Error(error.message), name: null };
  return { error: null, name: (data as string) ?? null };
}

export async function getReferralsForOrg(
  orgId: string,
): Promise<{ error: Error | null; referrals: ReferralRow[] }> {
  const { data, error } = await supabase()
    .from('pulse_credit_referrals')
    .select(
      'id, referrer_org_id, referred_org_id, status, credited_at, created_at, ' +
        'referrer:organizations!referrer_org_id(name), referred:organizations!referred_org_id(name)',
    )
    .or(`referrer_org_id.eq.${orgId},referred_org_id.eq.${orgId}`)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), referrals: [] };
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    referrer_org_id: string;
    referred_org_id: string;
    status: ReferralStatus;
    credited_at: string | null;
    created_at: string;
    referrer: { name: string } | null;
    referred: { name: string } | null;
  }>;
  return {
    error: null,
    referrals: rows.map((r) => ({
      id: r.id,
      referrer_org_id: r.referrer_org_id,
      referred_org_id: r.referred_org_id,
      status: r.status,
      credited_at: r.credited_at,
      created_at: r.created_at,
      referrer_org_name: r.referrer?.name ?? null,
      referred_org_name: r.referred?.name ?? null,
    })),
  };
}
