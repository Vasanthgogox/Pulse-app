/**
 * Marketplace Platform M1 — commercial lifecycle (canonical product states).
 * Pure. No React, no queries, no screens.
 */

export type CommercialLifecycleState =
  | "draft"
  | "published"
  | "receiving_bids"
  | "evaluating"
  | "awarded"
  | "executing"
  | "completed";

const OPEN_FOR_BIDS = new Set([
  "open",
  "pending",
  "broadcast",
  // Legacy compatibility only — no new rows after 20270128103100.
  "quoted",
]);

const AWARDED = new Set(["awarded"]);
const EXECUTING = new Set(["assigned", "deployed"]);
const COMPLETED = new Set(["completed"]);
const TERMINAL_CLOSED = new Set(["cancelled", "expired", "closed"]);

export type CommercialLifecycleInput = {
  indentStatus?: string | null;
  /** ≥1 bid/quote on the opportunity */
  bidCount: number;
  /** Owner is reviewing offers (optional UX lane; market still open by default) */
  ownerEvaluating?: boolean;
  /** Trip already exists for this indent */
  hasTrip?: boolean;
  /** Post still active when no indent status is available */
  postIsActive?: boolean | null;
};

/**
 * Derive the single commercial lifecycle state for an opportunity.
 * Bid presence never invents a shared DB status — Receiving Bids is count-based.
 */
export function deriveCommercialLifecycle(
  input: CommercialLifecycleInput,
): CommercialLifecycleState {
  const status = (input.indentStatus ?? "").trim().toLowerCase();

  if (status === "draft") return "draft";
  if (COMPLETED.has(status)) return "completed";
  if (input.hasTrip || EXECUTING.has(status)) return "executing";
  if (AWARDED.has(status)) return "awarded";
  if (TERMINAL_CLOSED.has(status)) return "completed";

  if (status && OPEN_FOR_BIDS.has(status)) {
    if (input.ownerEvaluating) return "evaluating";
    if (input.bidCount > 0) return "receiving_bids";
    return "published";
  }

  // No indent row (story-only / preview): active post → published/receiving; else completed.
  if (input.postIsActive === false) return "completed";
  if (input.ownerEvaluating) return "evaluating";
  if (input.bidCount > 0) return "receiving_bids";
  if (input.postIsActive === true || input.postIsActive == null) return "published";
  return "published";
}

/** Market still accepts competing bids for this lifecycle. */
export function lifecycleAcceptsNewBids(state: CommercialLifecycleState): boolean {
  return (
    state === "published" ||
    state === "receiving_bids" ||
    state === "evaluating"
  );
}
