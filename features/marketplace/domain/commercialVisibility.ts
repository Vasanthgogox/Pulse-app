/**
 * Marketplace Platform M1 — open-market visibility for a viewer.
 * Pure. Indent/commercial state owns lifetime — not an independent story clock.
 */

import {
  type CommercialLifecycleState,
  lifecycleAcceptsNewBids,
} from "./commercialLifecycle";

export type CommercialVisibilityReason =
  | "open_market"
  | "owner"
  | "not_load"
  | "draft"
  | "awarded"
  | "executing"
  | "completed"
  | "withdrawn"
  | "inactive_post"
  | "no_viewer";

export type CommercialVisibility = {
  /** Viewer may see this as an open-market opportunity (bid-able listing). */
  isOpenMarketVisible: boolean;
  reason: CommercialVisibilityReason;
};

export type CommercialVisibilityInput = {
  lifecycleState: CommercialLifecycleState;
  viewerOrgId: string | null;
  ownerOrgId: string;
  isLoad: boolean;
  postIsActive?: boolean | null;
  indentStatus?: string | null;
};

/**
 * Is this opportunity visible to this viewer as open market — and why?
 * Owners always "see" their own listing (reason: owner) even when market is closed.
 */
export function resolveCommercialVisibility(
  input: CommercialVisibilityInput,
): CommercialVisibility {
  const isOwner =
    Boolean(input.viewerOrgId) && input.viewerOrgId === input.ownerOrgId;

  if (!input.isLoad) {
    return { isOpenMarketVisible: false, reason: "not_load" };
  }

  if (input.lifecycleState === "draft") {
    return {
      isOpenMarketVisible: false,
      reason: isOwner ? "owner" : "draft",
    };
  }

  const indentStatus = (input.indentStatus ?? "").trim().toLowerCase();
  if (indentStatus === "cancelled") {
    return {
      isOpenMarketVisible: false,
      reason: isOwner ? "owner" : "withdrawn",
    };
  }

  if (input.lifecycleState === "awarded") {
    return {
      isOpenMarketVisible: false,
      reason: isOwner ? "owner" : "awarded",
    };
  }
  if (input.lifecycleState === "executing") {
    return {
      isOpenMarketVisible: false,
      reason: isOwner ? "owner" : "executing",
    };
  }
  if (input.lifecycleState === "completed") {
    return {
      isOpenMarketVisible: false,
      reason: isOwner ? "owner" : "completed",
    };
  }

  // Backend-owned: inactive post while still in an open-ish lifecycle → closed.
  if (input.postIsActive === false) {
    return {
      isOpenMarketVisible: false,
      reason: isOwner ? "owner" : "inactive_post",
    };
  }

  if (!lifecycleAcceptsNewBids(input.lifecycleState)) {
    return {
      isOpenMarketVisible: false,
      reason: isOwner ? "owner" : "completed",
    };
  }

  if (isOwner) {
    return { isOpenMarketVisible: true, reason: "owner" };
  }

  if (!input.viewerOrgId) {
    // Anonymous preview: listing is still "open market" if active.
    return { isOpenMarketVisible: true, reason: "no_viewer" };
  }

  return { isOpenMarketVisible: true, reason: "open_market" };
}
