/**
 * Marketplace Platform M1 — single display / target price resolution.
 * Pure. Live indent target → snapshot → broadcast/post rate_offer.
 * Never falls back to client_price (shipper's end-client sales price).
 */

export type SaleRateBasis = "per_mt" | "per_trip";

export type CommercialPricing = {
  /** Trip-level target. Per-MT targets are multiplied out by weight. */
  targetPrice: number | null;
  /** Trip-level price every surface shows. Same basis as a typed bid. */
  displayPrice: number | null;
  currentBestBid: number | null;
  bidCount: number;
  currency: "INR";
  /** Which source produced displayPrice */
  source: "indent_target" | "snapshot" | "broadcast" | "none";
  /**
   * How the indent target was quoted. "per_mt" means displayPrice was
   * derived as unit rate x tonnes; "per_trip" means it was already a total.
   * Null when the price did not come from an indent target.
   */
  basis: SaleRateBasis | null;
  /** Unit rate before tonnage multiply — per-MT indent targets only. */
  unitRateInr: number | null;
  /** Tonnes used for the multiply, when one happened. */
  tonnes: number | null;
};

export type CommercialPricingInput = {
  supplierTarget?: number | null;
  /**
   * Unit of `supplierTarget`. "per_mt" multiplies by tonnage to reach a trip
   * total; anything else (including null) treats it as already trip-level.
   */
  saleRateBasis?: SaleRateBasis | string | null;
  /** Indent weight in KG, as stored on indents.weight. */
  weightKg?: number | null;
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

/** indents.weight is stored in KG; pricing quotes per metric tonne. */
function tonnesFromKg(weightKg: number | null | undefined): number | null {
  return positiveAmount(weightKg) == null ? null : Number(weightKg) / 1000;
}

/**
 * Trip total for an indent target.
 *
 * `supplier_target` carries no unit of its own, so the basis decides: a
 * per-MT rate must be multiplied by tonnage before it can be compared to a
 * typed bid. Without usable weight we cannot complete that multiply, so the
 * unit rate is surfaced as-is rather than guessed at — the caller can see
 * `basis === "per_mt"` with `tonnes === null` and label it accordingly.
 */
function resolveIndentTarget(
  supplierTarget: number,
  saleRateBasis: SaleRateBasis | string | null | undefined,
  weightKg: number | null | undefined,
): { total: number; basis: SaleRateBasis; unitRateInr: number | null; tonnes: number | null } {
  if (saleRateBasis !== "per_mt") {
    return { total: supplierTarget, basis: "per_trip", unitRateInr: null, tonnes: null };
  }
  const tonnes = tonnesFromKg(weightKg);
  if (tonnes == null) {
    return { total: supplierTarget, basis: "per_mt", unitRateInr: supplierTarget, tonnes: null };
  }
  return {
    total: supplierTarget * tonnes,
    basis: "per_mt",
    unitRateInr: supplierTarget,
    tonnes,
  };
}

/**
 * Resolve the one commercial price every surface should show.
 */
export function resolveCommercialPricing(
  input: CommercialPricingInput,
): CommercialPricing {
  const fromIndent = positiveAmount(input.supplierTarget);
  if (fromIndent != null) {
    const resolved = resolveIndentTarget(
      fromIndent,
      input.saleRateBasis,
      input.weightKg,
    );
    return {
      targetPrice: resolved.total,
      displayPrice: resolved.total,
      currentBestBid: positiveAmount(input.currentBestBid),
      bidCount: input.bidCount,
      currency: "INR",
      source: "indent_target",
      basis: resolved.basis,
      unitRateInr: resolved.unitRateInr,
      tonnes: resolved.tonnes,
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
      basis: null,
      unitRateInr: null,
      tonnes: null,
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
      basis: null,
      unitRateInr: null,
      tonnes: null,
    };
  }

  return {
    targetPrice: null,
    displayPrice: null,
    currentBestBid: positiveAmount(input.currentBestBid),
    bidCount: input.bidCount,
    currency: "INR",
    source: "none",
    basis: null,
    unitRateInr: null,
    tonnes: null,
  };
}
