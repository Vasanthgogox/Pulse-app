/**
 * Reach engagement logging — impressions/views only. "Bids" is read from the
 * existing public.bids table (see analytics.service.ts), never logged here.
 */
import { supabase } from '@/lib/supabase';

export type ReachEventType = 'impression' | 'view';

export async function recordReachEvent(
  campaignId: string,
  eventType: ReachEventType,
  actorOrgId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('record_reach_event', {
    p_campaign_id: campaignId,
    p_event_type: eventType,
    p_actor_org_id: actorOrgId,
  });

  if (error) {
    // Engagement logging is best-effort — never block the viewing experience
    // on a failed write (same posture as story-views.service.ts).
    if (__DEV__) console.warn('[reach-events] recordReachEvent skipped:', error.message);
    return { error: new Error(error.message) };
  }
  return { error: null };
}
