/**
 * Marketplace Platform M1 — composed commercial domain object.
 * Immutable view returned by resolveCommercialOpportunity().
 */

import type { CommercialActions } from "./commercialActions";
import type { CommercialLifecycleState } from "./commercialLifecycle";
import type { CommercialPermissions } from "./commercialPermissions";
import type { CommercialPricing } from "./commercialPricing";
import type { CommercialRelationship } from "./commercialRelationship";
import type { CommercialVisibility } from "./commercialVisibility";

export type CommercialCampaignContext = {
  isSponsored: boolean;
  campaignId: string | null;
  planKey: string | null;
};

export type CommercialOpportunity = {
  lifecycleState: CommercialLifecycleState;
  visibility: CommercialVisibility;
  pricing: CommercialPricing;
  bidding: {
    canBid: boolean;
    canEditBid: boolean;
    hasBid: boolean;
    acceptsNewBids: boolean;
    myBidAmount: number | null;
    myBidStatus: string | null;
    counterAmount: number | null;
  };
  campaign: CommercialCampaignContext;
  relationship: CommercialRelationship;
  permissions: CommercialPermissions;
  actions: CommercialActions;
};

export type ResolveCommercialOpportunityInput = {
  viewerOrgId: string | null;
  ownerOrgId: string;
  isLoad?: boolean;

  indentStatus?: string | null;
  postIsActive?: boolean | null;
  hasTrip?: boolean;
  ownerEvaluating?: boolean;

  bidCount?: number;
  supplierTarget?: number | null;
  snapshotTargetPrice?: number | null;
  rateOffer?: number | null;
  currentBestBid?: number | null;

  myBidAmount?: number | null;
  myBidStatus?: string | null;
  counterAmount?: number | null;

  isSponsored?: boolean | null;
  reachCampaignId?: string | null;
  hasActiveCampaign?: boolean;
  planKey?: string | null;

  viewerCanBidCapability?: boolean;
  relationshipStage?: CommercialRelationship["stage"] | null;
  orgsConnected?: boolean;
};
