/**
 * Marketplace Platform M1 — single display / target price resolution.
 * Pure. Live indent target → snapshot → broadcast/post rate_offer.
 * Never falls back to client_price (shipper's end-client sales price).
 */

export type CommercialPricing = {
  targetPrice: number | null;
  displayPrice: number | null;
  currentBestBid: number | null;
  bidCount: number;
  currency: "INR";
  /** Which source produced displayPrice */
  source: "indent_target" | "snapshot" | "broadcast" | "none";
};

export type CommercialPricingInput = {
  supplierTarget?: number | null;
  /** Reach / Branch B frozen target */
  snapshotTargetPrice?: number | null;
  /** Post rate_offer / broadcast fallback */
  rateOffer?: number | null;
  currentBestBid?: number | null;
  bidCount: number;
};

function positiveAmount(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Resolve the one commercial price every surface should show.
 */
export function resolveCommercialPricing(
  input: CommercialPricingInput,
): CommercialPricing {
  const fromIndent = positiveAmount(input.supplierTarget);
  if (fromIndent != null) {
    return {
      targetPrice: fromIndent,
      displayPrice: fromIndent,
      currentBestBid: positiveAmount(input.currentBestBid),
      bidCount: input.bidCount,
      currency: "INR",
      source: "indent_target",
    };
  }

  const fromSnapshot = positiveAmount(input.snapshotTargetPrice);
  if (fromSnapshot != null) {
    return {
      targetPrice: fromSnapshot,
      displayPrice: fromSnapshot,
      currentBestBid: positiveAmount(input.currentBestBid),
      bidCount: input.bidCount,
      currency: "INR",
      source: "snapshot",
    };
  }

  const fromBroadcast = positiveAmount(input.rateOffer);
  if (fromBroadcast != null) {
    return {
      targetPrice: fromBroadcast,
      displayPrice: fromBroadcast,
      currentBestBid: positiveAmount(input.currentBestBid),
      bidCount: input.bidCount,
      currency: "INR",
      source: "broadcast",
    };
  }

  return {
    targetPrice: null,
    displayPrice: null,
    currentBestBid: positiveAmount(input.currentBestBid),
    bidCount: input.bidCount,
    currency: "INR",
    source: "none",
  };
}
