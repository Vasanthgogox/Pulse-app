/**
 * Control Tower verification wrappers — thin client for the `platform_*`
 * RPCs added in 20261224030000_reach_growth_loop.sql. These sit in front of
 * the existing admin_approve_profile/admin_reject_profile pipeline
 * (unchanged) and additionally award Pulse Credits + settle referrals.
 */
import { supabase } from '@/lib/supabase';

export interface VerificationDecisionResult {
  ok: boolean;
  org_id: string;
  verification_status: 'verified' | 'rejected';
  previous_status: string;
}

export async function approveVerification(
  orgId: string,
  notes?: string,
): Promise<{ error: Error | null; result: VerificationDecisionResult | null }> {
  const { data, error } = await supabase().rpc('platform_approve_verification', {
    p_org_id: orgId,
    p_notes: notes ?? null,
  });

  if (error) return { error: new Error(error.message), result: null };
  return { error: null, result: data as VerificationDecisionResult };
}

export async function rejectVerification(
  orgId: string,
  rejectionReasons: { checklist: string[]; notes?: string },
  notes?: string,
): Promise<{ error: Error | null; result: VerificationDecisionResult | null }> {
  const { data, error } = await supabase().rpc('platform_reject_verification', {
    p_org_id: orgId,
    p_rejection_reasons: rejectionReasons,
    p_notes: notes ?? null,
  });

  if (error) return { error: new Error(error.message), result: null };
  return { error: null, result: data as VerificationDecisionResult };
}
