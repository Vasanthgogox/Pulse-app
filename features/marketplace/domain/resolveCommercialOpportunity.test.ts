import {
  deriveCommercialLifecycle,
  resolveCommercialOpportunity,
  resolveCommercialPricing,
} from "@/features/marketplace/domain";

describe("deriveCommercialLifecycle", () => {
  it("keeps published after first bid is absent", () => {
    expect(
      deriveCommercialLifecycle({ indentStatus: "open", bidCount: 0 }),
    ).toBe("published");
  });

  it("moves to receiving_bids on bid presence without changing shared status", () => {
    expect(
      deriveCommercialLifecycle({ indentStatus: "broadcast", bidCount: 3 }),
    ).toBe("receiving_bids");
  });

  it("maps awarded / executing / completed", () => {
    expect(
      deriveCommercialLifecycle({ indentStatus: "awarded", bidCount: 2 }),
    ).toBe("awarded");
    expect(
      deriveCommercialLifecycle({ indentStatus: "deployed", bidCount: 2 }),
    ).toBe("executing");
    expect(
      deriveCommercialLifecycle({ indentStatus: "completed", bidCount: 2 }),
    ).toBe("completed");
  });
});

describe("resolveCommercialPricing", () => {
  it("prefers indent target over broadcast rate", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 80_000,
      rateOffer: 70_000,
      bidCount: 0,
    });
    expect(p.displayPrice).toBe(80_000);
    expect(p.source).toBe("indent_target");
  });

  it("falls back to broadcast when target missing", () => {
    const p = resolveCommercialPricing({
      supplierTarget: 0,
      rateOffer: 55_000,
      bidCount: 1,
    });
    expect(p.displayPrice).toBe(55_000);
    expect(p.source).toBe("broadcast");
  });
});

describe("resolveCommercialOpportunity", () => {
  it("gives supplier Bid now when market is open", () => {
    const o = resolveCommercialOpportunity({
      viewerOrgId: "supplier",
      ownerOrgId: "shipper",
      isLoad: true,
      indentStatus: "open",
      postIsActive: true,
      bidCount: 0,
      rateOffer: 80_000,
    });
    expect(o.lifecycleState).toBe("published");
    expect(o.permissions.canBid).toBe(true);
    expect(o.actions.primary?.kind).toBe("bid");
    expect(o.pricing.displayPrice).toBe(80_000);
  });

  it("gives Edit bid when viewer already has a pending bid", () => {
    const o = resolveCommercialOpportunity({
      viewerOrgId: "supplier",
      ownerOrgId: "shipper",
      isLoad: true,
      indentStatus: "open",
      postIsActive: true,
      bidCount: 2,
      myBidAmount: 75_000,
      myBidStatus: "pending",
      rateOffer: 80_000,
    });
    expect(o.lifecycleState).toBe("receiving_bids");
    expect(o.permissions.canBid).toBe(false);
    expect(o.permissions.canEditBid).toBe(true);
    expect(o.actions.primary?.kind).toBe("edit_bid");
  });

  it("hides open-market bid CTA after award for non-owners", () => {
    const o = resolveCommercialOpportunity({
      viewerOrgId: "supplier",
      ownerOrgId: "shipper",
      isLoad: true,
      indentStatus: "awarded",
      postIsActive: false,
      bidCount: 4,
      rateOffer: 80_000,
    });
    expect(o.lifecycleState).toBe("awarded");
    expect(o.visibility.isOpenMarketVisible).toBe(false);
    expect(o.permissions.canBid).toBe(false);
  });

  it("offers Boost to owner when not yet sponsored", () => {
    const o = resolveCommercialOpportunity({
      viewerOrgId: "shipper",
      ownerOrgId: "shipper",
      isLoad: true,
      indentStatus: "open",
      postIsActive: true,
      bidCount: 0,
      rateOffer: 80_000,
    });
    expect(o.permissions.isOwner).toBe(true);
    expect(o.permissions.canBoost).toBe(true);
    expect(o.actions.primary?.kind).toBe("boost");
  });
});
