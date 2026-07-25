/**
 * Pulse Reach — boost flow. A campaign always wraps an existing post
 * (public.posts) — see 20261224040000_reach_campaigns_core.sql for why there
 * is no separate story/media table for v1.
 */
import { supabase } from '@/lib/supabase';

export type ReachPlanCode = 'basic' | 'boost' | 'max';
/** draft: not yet published. active: running, real expires_at. completed:
 * expires_at passed (auto, hourly cron) or target lifecycle ended. cancelled:
 * stopped early. No separate 'expired' — same time-based trigger as
 * 'completed', collapsed to one terminal state. */
export type ReachCampaignStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type ReachPaymentMethod = 'credits' | 'money';

export interface ReachPlanRow {
  id: string;
  code: ReachPlanCode;
  name: string;
  price_inr: number;
  credit_price: number;
  estimated_reach_min: number;
  estimated_reach_max: number;
  audience_scope: string;
  sort_order: number;
  duration_hours: number;
}

export interface ReachCampaignRow {
  id: string;
  org_id: string;
  post_id: string;
  plan_id: string;
  status: ReachCampaignStatus;
  published_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface PublishReachCampaignResult {
  ok: boolean;
  campaign_id: string;
  purchase_id: string;
  purchase_status: 'pending' | 'paid';
  /** 'draft' for a pending cash payment (no gateway exists — doesn't go live
   * until confirmed), 'active' for credits (fully real, immediate). */
  campaign_status: ReachCampaignStatus;
  plan_code: ReachPlanCode;
  expires_at: string | null;
}

export interface UpgradeReachCampaignResult {
  ok: boolean;
  campaign_id: string;
  purchase_id: string;
  purchase_status: 'pending' | 'paid';
  new_plan_code: ReachPlanCode;
  expires_at: string;
}

export async function getReachPlans(): Promise<{ error: Error | null; plans: ReachPlanRow[] }> {
  const { data, error } = await supabase()
    .from('reach_plans')
    .select('id, code, name, price_inr, credit_price, estimated_reach_min, estimated_reach_max, audience_scope, sort_order, duration_hours')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) return { error: new Error(error.message), plans: [] };
  return { error: null, plans: (data ?? []) as ReachPlanRow[] };
}

export async function publishReachCampaign(
  orgId: string,
  postId: string,
  planId: string,
  paymentMethod: ReachPaymentMethod,
): Promise<{ error: Error | null; result: PublishReachCampaignResult | null }> {
  const { data, error } = await supabase().rpc('publish_reach_campaign', {
    p_org_id: orgId,
    p_post_id: postId,
    p_plan_id: planId,
    p_payment_method: paymentMethod,
  });

  if (error) return { error: new Error(error.message), result: null };
  return { error: null, result: data as PublishReachCampaignResult };
}

export async function getReachCampaignsForOrg(
  orgId: string,
): Promise<{ error: Error | null; campaigns: ReachCampaignRow[] }> {
  const { data, error } = await supabase()
    .from('reach_campaigns')
    .select('id, org_id, post_id, plan_id, status, published_at, expires_at, completed_at, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), campaigns: [] };
  return { error: null, campaigns: (data ?? []) as ReachCampaignRow[] };
}

export async function upgradeReachCampaign(
  campaignId: string,
  newPlanId: string,
  paymentMethod: ReachPaymentMethod,
): Promise<{ error: Error | null; result: UpgradeReachCampaignResult | null }> {
  const { data, error } = await supabase().rpc('upgrade_reach_campaign', {
    p_campaign_id: campaignId,
    p_new_plan_id: newPlanId,
    p_payment_method: paymentMethod,
  });

  if (error) return { error: new Error(error.message), result: null };
  return { error: null, result: data as UpgradeReachCampaignResult };
}
