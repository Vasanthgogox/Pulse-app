import { resolveCommercialPricing } from "@/features/marketplace/domain/commercialPricing";

/**
 * `supplier_target` is one numeric column carrying two different units: some
 * indents store a ₹/MT unit rate, others a trip total. Pricing used to return
 * it verbatim, so a per-MT row rendered its unit rate as the whole trip —
 * IND197 (Bhandara → Hosur) showed a ₹3,200 target against a real ₹1,24,256
 * trip, and the bid sheet then compared a trip-total bid to that unit rate
 * ("+₹1,24,000 vs target"). `sale_rate_basis` decides the unit; weight (KG)
 * completes the multiply.
 */
describe("resolveCommercialPricing — sale_rate_basis", () => {
  it("expands a per-MT target to the trip total (IND197 regression)", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 3200,
      saleRateBasis: "per_mt",
      weightKg: 38830,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(124_256);
    expect(p.targetPrice).toBe(124_256);
    expect(p.basis).toBe("per_mt");
    expect(p.unitRateInr).toBe(3200);
    expect(p.tonnes).toBeCloseTo(38.83);
    expect(p.source).toBe("indent_target");
  });

  it("expands the screenshot's IND195 case to ₹1,27,100", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 3100,
      saleRateBasis: "per_mt",
      weightKg: 41000,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(127_100);
  });

  it("leaves a per_trip target as the total it already is", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 89_578,
      saleRateBasis: "per_trip",
      weightKg: 30_000,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(89_578);
    expect(p.basis).toBe("per_trip");
    expect(p.unitRateInr).toBeNull();
    expect(p.tonnes).toBeNull();
  });

  it("treats a null basis as per_trip so untagged rows keep old behaviour", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 77_500,
      saleRateBasis: null,
      weightKg: 25_000,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(77_500);
    expect(p.basis).toBe("per_trip");
  });

  it("does not multiply when basis is absent entirely", () => {
    const p = resolveCommercialPricing({ supplierTarget: 3100, bidCount: 0 });
    expect(p.displayPrice).toBe(3100);
    expect(p.basis).toBe("per_trip");
  });

  describe("missing / unusable weight on a per-MT target", () => {
    // Without weight the multiply cannot complete. Surfacing the unit rate
    // unchanged is wrong-but-visible; inventing a tonnage would be wrong-and-
    // invisible. Callers detect it via basis === "per_mt" && tonnes === null.
    it.each([
      ["null weight", null],
      ["undefined weight", undefined],
      ["zero weight", 0],
      ["negative weight", -500],
      ["NaN weight", Number.NaN],
    ])("falls back to the unit rate and flags it: %s", (_label, weightKg) => {
      const p = resolveCommercialPricing({
        supplierTarget: 3200,
        saleRateBasis: "per_mt",
        weightKg: weightKg as number | null | undefined,
        bidCount: 0,
      });
      expect(p.displayPrice).toBe(3200);
      expect(p.basis).toBe("per_mt");
      expect(p.tonnes).toBeNull();
      expect(p.unitRateInr).toBe(3200);
    });
  });

  it("handles fractional tonnage", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 4400,
      saleRateBasis: "per_mt",
      weightKg: 1000,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(4400);
    expect(p.tonnes).toBe(1);
  });
});

describe("resolveCommercialPricing — source precedence is unchanged", () => {
  it("prefers the indent target over snapshot and broadcast", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 80_000,
      snapshotTargetPrice: 75_000,
      rateOffer: 70_000,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(80_000);
    expect(p.source).toBe("indent_target");
  });

  it("falls to snapshot when no indent target, with no basis attached", () => {
    const p = resolveCommercialPricing({
      supplierTarget: null,
      snapshotTargetPrice: 75_000,
      rateOffer: 70_000,
      saleRateBasis: "per_mt",
      weightKg: 40_000,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(75_000);
    expect(p.source).toBe("snapshot");
    // basis describes an indent target only — a snapshot is already a total
    // and must never be multiplied by tonnage.
    expect(p.basis).toBeNull();
    expect(p.tonnes).toBeNull();
  });

  it("falls to broadcast rate_offer without multiplying", () => {
    const p = resolveCommercialPricing({
      rateOffer: 70_000,
      saleRateBasis: "per_mt",
      weightKg: 40_000,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(70_000);
    expect(p.source).toBe("broadcast");
    expect(p.basis).toBeNull();
  });

  it("returns nulls when every source is empty", () => {
    const p = resolveCommercialPricing({ bidCount: 0 });
    expect(p.displayPrice).toBeNull();
    expect(p.targetPrice).toBeNull();
    expect(p.source).toBe("none");
    expect(p.basis).toBeNull();
  });

  it("ignores a non-positive supplier target", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 0,
      saleRateBasis: "per_mt",
      weightKg: 40_000,
      rateOffer: 70_000,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(70_000);
    expect(p.source).toBe("broadcast");
  });

  it("carries currentBestBid and bidCount through", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 3100,
      saleRateBasis: "per_mt",
      weightKg: 41_000,
      currentBestBid: 120_000,
      bidCount: 3,
    });
    expect(p.currentBestBid).toBe(120_000);
    expect(p.bidCount).toBe(3);
    expect(p.currency).toBe("INR");
  });
});

/**
 * The visible symptom in the report: a trip-total bid compared against a
 * per-MT target produced a nonsense delta. Once pricing returns a trip-level
 * target, the existing comparison is correct without touching its maths.
 */
describe("bid vs target after expansion", () => {
  it("reads a near-target bid as near-target, not ₹1.24L over", () => {
    const { displayPrice } = resolveCommercialPricing({
      supplierTarget: 3200,
      saleRateBasis: "per_mt",
      weightKg: 38830,
      bidCount: 0,
    });
    const typedBid = 127_100;
    expect(typedBid - (displayPrice ?? 0)).toBe(2844);
  });
});
