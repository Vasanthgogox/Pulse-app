/**
 * RelationshipService v1 — Bid → Award trust guard (docs/architecture/11-relationship-guard-v1.md).
 * Thin adapter over connectionRequests.service.ts + public.organization_relations.
 * Deliberately minimal — see the doc's "explicitly not included in v1" list before extending this.
 */
import { supabase } from '@/lib/supabase';
import {
  approveConnectionRequest,
  createConnectionRequest,
  getLatestConnectionRequestStatus,
  rejectConnectionRequest,
} from './connectionRequests.service';

export type RelationshipStatus = 'none' | 'pending' | 'active' | 'suspended' | 'ended';

/** Active connection (either direction) between two orgs, or 'none' if no row exists. */
export async function getRelationshipStatus(
  orgA: string,
  orgB: string,
): Promise<{ error: Error | null; status: RelationshipStatus }> {
  if (!orgA || !orgB) return { error: null, status: 'none' };

  const { data, error } = await supabase()
    .from('organization_relations')
    .select('status')
    .or(
      `and(from_organization_id.eq.${orgA},to_organization_id.eq.${orgB}),` +
        `and(from_organization_id.eq.${orgB},to_organization_id.eq.${orgA})`,
    )
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: new Error(error.message), status: 'none' };
  if (!data) return { error: null, status: 'none' };
  return { error: null, status: (data as { status: RelationshipStatus }).status };
}

/**
 * The only genuinely new logic in v1 — everything else here delegates to existing
 * connection-request infrastructure. Awarding requires an `active` organization_relations
 * row between the two orgs, in either direction.
 */
export async function canAward(
  bidderOrgId: string,
  shipperOrgId: string,
): Promise<{ error: Error | null; allowed: boolean }> {
  if (!bidderOrgId || !shipperOrgId) return { error: null, allowed: false };
  if (bidderOrgId === shipperOrgId) return { error: null, allowed: true };

  const { error, status } = await getRelationshipStatus(bidderOrgId, shipperOrgId);
  if (error) return { error, allowed: false };
  return { error: null, allowed: status === 'active' };
}

/**
 * Discriminated result for actionable UI — the shipper never hits a dead end.
 * `requestId` (when present) is the connection_requests row to act on (view/resend).
 */
export type AwardEligibility =
  | { allowed: true; reason: 'connected' }
  | { allowed: false; reason: 'no_relationship' }
  | { allowed: false; reason: 'invitation_pending'; requestId: string }
  | { allowed: false; reason: 'invitation_rejected'; requestId: string | null };

/**
 * Richer version of canAward() for UI surfaces that need to render an action
 * (Send Connection Request / View Invitation / Resend), not just a pass/fail.
 * `requestId` lookups use the shipper→bidder direction, matching how the shipper
 * would send the invitation in the "Accept Relationship" step of the v1 flow.
 */
export async function getAwardEligibility(
  bidderOrgId: string,
  shipperOrgId: string,
): Promise<{ error: Error | null; eligibility: AwardEligibility }> {
  if (!bidderOrgId || !shipperOrgId) {
    return { error: null, eligibility: { allowed: false, reason: 'no_relationship' } };
  }
  if (bidderOrgId === shipperOrgId) {
    return { error: null, eligibility: { allowed: true, reason: 'connected' } };
  }

  const { error: relError, status } = await getRelationshipStatus(bidderOrgId, shipperOrgId);
  if (relError) return { error: relError, eligibility: { allowed: false, reason: 'no_relationship' } };
  if (status === 'active') return { error: null, eligibility: { allowed: true, reason: 'connected' } };

  const { error: reqError, status: requestStatus, requestId } = await getLatestConnectionRequestStatus(
    shipperOrgId,
    bidderOrgId,
  );
  if (reqError) return { error: reqError, eligibility: { allowed: false, reason: 'no_relationship' } };

  if (requestStatus === 'pending' && requestId) {
    return { error: null, eligibility: { allowed: false, reason: 'invitation_pending', requestId } };
  }
  if (requestStatus === 'rejected') {
    return { error: null, eligibility: { allowed: false, reason: 'invitation_rejected', requestId } };
  }
  return { error: null, eligibility: { allowed: false, reason: 'no_relationship' } };
}

export const RelationshipService = {
  requestConnection: createConnectionRequest,
  acceptConnection: approveConnectionRequest,
  rejectConnection: rejectConnectionRequest,
  getRelationshipStatus,
  canAward,
  getAwardEligibility,
};
