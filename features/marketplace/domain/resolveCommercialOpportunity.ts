/**
 * Marketplace Platform M1 — compose commercial truth for (opportunity, viewer).
 *
 * Given this opportunity and this viewer, what is the commercial truth?
 * Every Marketplace UI consumes this — it does not re-interpret lifecycle,
 * visibility, pricing, or bidding rules.
 */

import { resolveCommercialActions } from "./commercialActions";
import {
  deriveCommercialLifecycle,
} from "./commercialLifecycle";
import type {
  CommercialOpportunity,
  ResolveCommercialOpportunityInput,
} from "./commercialOpportunity";
import { resolveCommercialPermissions } from "./commercialPermissions";
import { resolveCommercialPricing } from "./commercialPricing";
import { resolveCommercialRelationship } from "./commercialRelationship";
import { resolveCommercialVisibility } from "./commercialVisibility";

function positive(n: number | null | undefined): number | null {
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function resolveCommercialOpportunity(
  input: ResolveCommercialOpportunityInput,
): CommercialOpportunity {
  const isLoad = input.isLoad !== false;
  const bidCount = Math.max(0, Number(input.bidCount ?? 0) || 0);
  const myBidStatus = (input.myBidStatus ?? "").trim().toLowerCase() || null;
  const myBidAmount = positive(input.myBidAmount);
  const counterAmount = positive(input.counterAmount);
  const hasAnyBid = myBidAmount != null || Boolean(myBidStatus);
  const hasPendingBid = hasAnyBid && (myBidStatus == null || myBidStatus === "pending");

  const lifecycleState = deriveCommercialLifecycle({
    indentStatus: input.indentStatus,
    bidCount,
    ownerEvaluating: input.ownerEvaluating,
    hasTrip: input.hasTrip,
    postIsActive: input.postIsActive,
  });

  const visibility = resolveCommercialVisibility({
    lifecycleState,
    viewerOrgId: input.viewerOrgId,
    ownerOrgId: input.ownerOrgId,
    isLoad,
    postIsActive: input.postIsActive,
    indentStatus: input.indentStatus,
  });

  const pricing = resolveCommercialPricing({
    supplierTarget: input.supplierTarget,
    saleRateBasis: input.saleRateBasis,
    weightKg: input.weightKg,
    snapshotTargetPrice: input.snapshotTargetPrice,
    rateOffer: input.rateOffer,
    currentBestBid: input.currentBestBid,
    bidCount,
  });

  const permissions = resolveCommercialPermissions({
    lifecycleState,
    visibility,
    viewerOrgId: input.viewerOrgId,
    ownerOrgId: input.ownerOrgId,
    isLoad,
    viewerCanBidCapability: input.viewerCanBidCapability,
    hasPendingBid,
    hasAnyBid,
    isSponsored: input.isSponsored,
    hasActiveCampaign: input.hasActiveCampaign,
  });

  const relationship = resolveCommercialRelationship({
    stage: input.relationshipStage,
    orgsConnected: input.orgsConnected,
  });

  const actions = resolveCommercialActions({
    lifecycleState,
    permissions,
    hasCounterOffer: counterAmount != null && hasPendingBid,
    bidCount,
    viewerOrgId: input.viewerOrgId,
    isLoad,
  });

  return {
    lifecycleState,
    visibility,
    pricing,
    bidding: {
      canBid: permissions.canBid,
      canEditBid: permissions.canEditBid,
      hasBid: hasAnyBid,
      acceptsNewBids: permissions.acceptsNewBids,
      myBidAmount,
      myBidStatus,
      counterAmount,
    },
    campaign: {
      isSponsored: Boolean(input.isSponsored),
      campaignId: input.reachCampaignId ?? null,
      planKey: input.planKey ?? null,
    },
    relationship,
    permissions,
    actions,
  };
}
