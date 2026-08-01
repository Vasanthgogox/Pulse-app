/**
 * Marketplace Platform M1 — what the viewer may do to this opportunity.
 * Pure. Consumes lifecycle + visibility; does not re-derive them.
 */

import {
  type CommercialLifecycleState,
  lifecycleAcceptsNewBids,
} from "./commercialLifecycle";
import type { CommercialVisibility } from "./commercialVisibility";

export type CommercialPermissions = {
  canBid: boolean;
  canEditBid: boolean;
  canAward: boolean;
  canWithdraw: boolean;
  canBoost: boolean;
  isOwner: boolean;
  acceptsNewBids: boolean;
};

export type CommercialPermissionsInput = {
  lifecycleState: CommercialLifecycleState;
  visibility: CommercialVisibility;
  viewerOrgId: string | null;
  ownerOrgId: string;
  isLoad: boolean;
  /** Org capability marketplace_bid (default true when unknown) */
  viewerCanBidCapability?: boolean;
  hasPendingBid?: boolean;
  hasAnyBid?: boolean;
  isSponsored?: boolean | null;
  /** Owner already has an active/draft campaign on this post */
  hasActiveCampaign?: boolean;
};

export function resolveCommercialPermissions(
  input: CommercialPermissionsInput,
): CommercialPermissions {
  const isOwner =
    Boolean(input.viewerOrgId) && input.viewerOrgId === input.ownerOrgId;
  const acceptsNewBids = lifecycleAcceptsNewBids(input.lifecycleState);
  const capability = input.viewerCanBidCapability !== false;
  const marketOpen =
    input.visibility.isOpenMarketVisible && acceptsNewBids && input.isLoad;

  const canBid =
    !isOwner &&
    Boolean(input.viewerOrgId) &&
    marketOpen &&
    capability &&
    !input.hasPendingBid &&
    !input.hasAnyBid;

  const canEditBid =
    !isOwner &&
    Boolean(input.viewerOrgId) &&
    marketOpen &&
    capability &&
    Boolean(input.hasPendingBid);

  const canAward =
    isOwner &&
    input.isLoad &&
    (input.lifecycleState === "receiving_bids" ||
      input.lifecycleState === "evaluating");

  const canWithdraw =
    isOwner &&
    input.isLoad &&
    (input.lifecycleState === "draft" ||
      input.lifecycleState === "published" ||
      input.lifecycleState === "receiving_bids" ||
      input.lifecycleState === "evaluating");

  const canBoost =
    isOwner &&
    input.isLoad &&
    acceptsNewBids &&
    !input.isSponsored &&
    !input.hasActiveCampaign;

  return {
    canBid,
    canEditBid,
    canAward,
    canWithdraw,
    canBoost,
    isOwner,
    acceptsNewBids,
  };
}
