// DCO (driver-cum-owner / independent owner-operator) approval-lifecycle
// data access. Runs on the signed-in admin's session (supabaseAuth): RLS on
// dco_profiles already restricts SELECT to the person themselves or holders
// of the 'dco.review' platform permission, and every RPC below is
// SECURITY DEFINER with its own can_review_dco() guard and auth.uid()
// attribution. See supabase/migrations/20270310200000_dco_schema_foundation.sql
// and 20270310210000_dco_eligibility_and_admin_rpcs.sql.
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';

export type DcoProfileStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface DcoReviewRow {
  user_id: string;
  status: DcoProfileStatus;
  requested_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
  driver_name: string | null;
  driver_phone: string | null;
}

type DbRow = {
  user_id: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
};

/**
 * Every dco_profiles row this admin session can see (self or reviewer),
 * newest request first. Profile name/phone joined separately, same
 * two-step pattern as fetchDriverKycQueue in driverKyc.ts.
 */
export async function fetchDcoProfiles(): Promise<DcoReviewRow[]> {
  const { data, error } = await supabase
    .from('dco_profiles')
    .select('user_id,status,requested_at,reviewed_at,decision_reason')
    .order('requested_at', { ascending: false });

  if (error || !data?.length) return [];
  const rows = data as DbRow[];

  const uids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,full_name,phone')
    .in('id', uids);
  const profileById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; phone: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  return rows.map((row) => {
    const profile = profileById.get(row.user_id);
    return {
      user_id: row.user_id,
      status: (['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(row.status)
        ? row.status
        : 'PENDING') as DcoProfileStatus,
      requested_at: row.requested_at,
      reviewed_at: row.reviewed_at,
      decision_reason: row.decision_reason,
      driver_name: profile?.full_name ?? null,
      driver_phone: profile?.phone ?? null,
    };
  });
}

export async function approveDco(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_approve_dco', { p_user_id: userId });
  return { error: error?.message ?? null };
}

export async function rejectDco(
  userId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_reject_dco', {
    p_user_id: userId,
    p_reason: reason,
  });
  return { error: error?.message ?? null };
}

export async function suspendDco(
  userId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_suspend_dco', {
    p_user_id: userId,
    p_reason: reason,
  });
  return { error: error?.message ?? null };
}

export async function reinstateDco(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_reinstate_dco', { p_user_id: userId });
  return { error: error?.message ?? null };
}
