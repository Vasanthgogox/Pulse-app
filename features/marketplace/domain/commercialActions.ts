/**
 * Marketplace Platform M1 — primary / secondary CTAs for the current viewer.
 * Pure. Screens render these; they do not invent Bid / Award / Boost labels.
 */

import type { CommercialLifecycleState } from "./commercialLifecycle";
import type { CommercialPermissions } from "./commercialPermissions";

export type CommercialActionKind =
  | "bid"
  | "edit_bid"
  | "respond_counter"
  | "award"
  | "view_bids"
  | "deploy"
  | "boost"
  | "open_story"
  | "open_load_center"
  | "sign_in";

export type CommercialAction = {
  kind: CommercialActionKind;
  label: string;
};

export type CommercialActions = {
  primary: CommercialAction | null;
  secondary: CommercialAction | null;
};

export type CommercialActionsInput = {
  lifecycleState: CommercialLifecycleState;
  permissions: CommercialPermissions;
  /** Pending counter from shipper on viewer's bid */
  hasCounterOffer?: boolean;
  bidCount: number;
  viewerOrgId: string | null;
  isLoad: boolean;
};

export function resolveCommercialActions(
  input: CommercialActionsInput,
): CommercialActions {
  const { permissions: p } = input;

  if (!input.isLoad) {
    return { primary: null, secondary: null };
  }

  // Anonymous preview
  if (!input.viewerOrgId) {
    if (p.acceptsNewBids) {
      return {
        primary: { kind: "sign_in", label: "Sign in to bid" },
        secondary: null,
      };
    }
    return { primary: null, secondary: null };
  }

  if (p.isOwner) {
    if (input.lifecycleState === "executing") {
      return {
        primary: { kind: "deploy", label: "Open trip" },
        secondary: { kind: "open_load_center", label: "Load center" },
      };
    }
    if (p.canAward) {
      return {
        primary: { kind: "award", label: "Review bids" },
        secondary: p.canBoost
          ? { kind: "boost", label: "Boost" }
          : input.bidCount > 0
            ? { kind: "view_bids", label: `${input.bidCount} bid${input.bidCount === 1 ? "" : "s"}` }
            : null,
      };
    }
    if (p.canBoost) {
      return {
        primary: { kind: "boost", label: "Boost" },
        secondary: { kind: "open_load_center", label: "Load center" },
      };
    }
    if (input.bidCount > 0) {
      return {
        primary: {
          kind: "view_bids",
          label: `${input.bidCount} bid${input.bidCount === 1 ? "" : "s"}`,
        },
        secondary: { kind: "open_load_center", label: "Load center" },
      };
    }
    return {
      primary: { kind: "open_load_center", label: "Load center" },
      secondary: null,
    };
  }

  // Supplier / viewer
  if (p.canEditBid) {
    return {
      primary: {
        kind: input.hasCounterOffer ? "respond_counter" : "edit_bid",
        label: input.hasCounterOffer ? "Respond to counter" : "Edit bid",
      },
      secondary: { kind: "open_story", label: "View story" },
    };
  }

  if (p.canBid) {
    return {
      primary: { kind: "bid", label: "Bid now" },
      secondary: { kind: "open_story", label: "View story" },
    };
  }

  // Has a non-pending bid (accepted/rejected) or market closed
  if (input.lifecycleState === "awarded" || input.lifecycleState === "executing") {
    return {
      primary: { kind: "open_story", label: "View story" },
      secondary: null,
    };
  }

  return { primary: null, secondary: null };
}
