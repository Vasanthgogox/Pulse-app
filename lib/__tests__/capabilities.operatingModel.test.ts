import {
  allowedConnectionRoles,
  canAccessFinanceSubTab,
  financeKanbanColumnsForSupplyFilter,
  canAccessSuppliers,
  canAccessVehicles,
  canUseAggregateSupply,
  canUseAssetSupply,
  getCapabilitiesFromProfile,
  getEffectivePermissions,
  operatingModelTransition,
} from "@/lib/capabilities";

const capsFor = (model: string) =>
  getCapabilitiesFromProfile({ role: "user" }, model);

describe("getCapabilitiesFromProfile + operatingModel", () => {
  it("ASSET_BASED hides suppliers and keeps own-fleet trips", () => {
    const caps = getCapabilitiesFromProfile(
      { role: "user", aggregated: true, asset: true }, // stale both flags
      "ASSET_BASED",
    );
    expect(canUseAssetSupply(caps)).toBe(true);
    expect(canUseAggregateSupply(caps)).toBe(false);
    expect(canAccessSuppliers(caps)).toBe(false);
    expect(canAccessVehicles(caps)).toBe(true);
    expect(canAccessFinanceSubTab(caps, "suppliers")).toBe(false);
    expect(canAccessFinanceSubTab(caps, "garage")).toBe(true);
    expect(caps.includes("dispatch_for_own_fleet")).toBe(true);
    expect(caps.includes("dispatch")).toBe(false);
  });

  it("ASSET_BASED cannot create give-load indents", () => {
    const caps = getCapabilitiesFromProfile(
      { role: "user", aggregated: false, asset: true },
      "ASSET_BASED",
    );
    const p = getEffectivePermissions(caps);
    expect(p.indents.create).toBe(false);
    expect(p.trips.create).toBe(true);
  });

  it("NON_ASSET hides garage and keeps suppliers + give-load", () => {
    const caps = getCapabilitiesFromProfile(
      { role: "user", aggregated: true, asset: true },
      "NON_ASSET",
    );
    expect(canUseAssetSupply(caps)).toBe(false);
    expect(canUseAggregateSupply(caps)).toBe(true);
    expect(canAccessSuppliers(caps)).toBe(true);
    expect(canAccessVehicles(caps)).toBe(false);
    expect(canAccessFinanceSubTab(caps, "suppliers")).toBe(true);
    expect(canAccessFinanceSubTab(caps, "garage")).toBe(false);
    expect(getEffectivePermissions(caps).indents.create).toBe(true);
  });

  it("HYBRID keeps both", () => {
    const caps = getCapabilitiesFromProfile(
      { role: "user", aggregated: false, asset: false },
      "HYBRID",
    );
    expect(canUseAssetSupply(caps)).toBe(true);
    expect(canUseAggregateSupply(caps)).toBe(true);
    expect(canAccessSuppliers(caps)).toBe(true);
    expect(canAccessVehicles(caps)).toBe(true);
    expect(getEffectivePermissions(caps).indents.create).toBe(true);
  });
});

describe("allowedConnectionRoles (counterparty-aware)", () => {
  it("asset → aggregate counterparty: client only (they give load, I carry)", () => {
    expect(allowedConnectionRoles(capsFor("ASSET_BASED"), "NON_ASSET")).toEqual([
      "client",
    ]);
  });

  it("asset → asset counterparty: no valid role (neither gives load)", () => {
    // Two pure carriers have no client/supplier relationship. Callers must
    // handle the empty case (hide/disable Connect) rather than show 0 options.
    expect(
      allowedConnectionRoles(capsFor("ASSET_BASED"), "ASSET_BASED"),
    ).toEqual([]);
  });

  it("aggregate → asset counterparty: supplier only (they carry my loads)", () => {
    expect(allowedConnectionRoles(capsFor("NON_ASSET"), "ASSET_BASED")).toEqual([
      "supplier",
    ]);
  });

  it("hybrid → hybrid counterparty: both roles", () => {
    expect(allowedConnectionRoles(capsFor("HYBRID"), "HYBRID")).toEqual([
      "client",
      "supplier",
    ]);
  });

  it("unknown counterparty model → gate by my model only (asset: client)", () => {
    expect(allowedConnectionRoles(capsFor("ASSET_BASED"), null)).toEqual([
      "client",
    ]);
  });
});

describe("operatingModelTransition", () => {
  it("HYBRID → ASSET_BASED is a downgrade hiding suppliers/indents/posts", () => {
    const t = operatingModelTransition("HYBRID", "ASSET_BASED");
    expect(t.direction).toBe("downgrade");
    expect(t.capsGained).toEqual([]);
    expect(t.hiddenSurfaces).toEqual(
      expect.arrayContaining(["suppliers", "indents", "posts"]),
    );
    expect(t.hiddenSurfaces).not.toContain("vehicles");
    expect(t.hiddenSurfaces).not.toContain("drivers");
  });

  it("HYBRID → NON_ASSET is a downgrade hiding vehicles/drivers/bids", () => {
    const t = operatingModelTransition("HYBRID", "NON_ASSET");
    expect(t.direction).toBe("downgrade");
    expect(t.hiddenSurfaces).toEqual(
      expect.arrayContaining(["vehicles", "drivers", "bids"]),
    );
    expect(t.hiddenSurfaces).not.toContain("suppliers");
  });

  it("ASSET_BASED → HYBRID is an upgrade with no hidden surfaces", () => {
    const t = operatingModelTransition("ASSET_BASED", "HYBRID");
    expect(t.direction).toBe("upgrade");
    expect(t.capsLost).toEqual([]);
    expect(t.hiddenSurfaces).toEqual([]);
  });

  it("NON_ASSET → HYBRID is an upgrade with no hidden surfaces", () => {
    const t = operatingModelTransition("NON_ASSET", "HYBRID");
    expect(t.direction).toBe("upgrade");
    expect(t.capsLost).toEqual([]);
    expect(t.hiddenSurfaces).toEqual([]);
  });

  it("ASSET_BASED → NON_ASSET is lateral (loses fleet, gains give-load)", () => {
    const t = operatingModelTransition("ASSET_BASED", "NON_ASSET");
    expect(t.direction).toBe("lateral");
    expect(t.capsLost.length).toBeGreaterThan(0);
    expect(t.capsGained.length).toBeGreaterThan(0);
    expect(t.hiddenSurfaces).toEqual(
      expect.arrayContaining(["vehicles", "drivers", "bids"]),
    );
  });

  it("NON_ASSET → ASSET_BASED is lateral (loses give-load, gains fleet)", () => {
    const t = operatingModelTransition("NON_ASSET", "ASSET_BASED");
    expect(t.direction).toBe("lateral");
    expect(t.hiddenSurfaces).toEqual(
      expect.arrayContaining(["suppliers", "indents", "posts"]),
    );
  });

  it("same model is a no-op with no caps lost/gained", () => {
    const t = operatingModelTransition("HYBRID", "HYBRID");
    expect(t.capsLost).toEqual([]);
    expect(t.capsGained).toEqual([]);
    expect(t.hiddenSurfaces).toEqual([]);
  });
});

describe("financeKanbanColumnsForSupplyFilter", () => {
  it("HYBRID ALL shows all four columns", () => {
    const caps = capsFor("HYBRID");
    expect(financeKanbanColumnsForSupplyFilter(caps, "all")).toEqual([
      "customers",
      "suppliers",
      "garage",
      "drivers",
    ]);
  });

  it("HYBRID ASSET shows customers, garage, drivers", () => {
    const caps = capsFor("HYBRID");
    expect(financeKanbanColumnsForSupplyFilter(caps, "asset")).toEqual([
      "customers",
      "garage",
      "drivers",
    ]);
  });

  it("HYBRID AGGREGATE shows customers and suppliers", () => {
    const caps = capsFor("HYBRID");
    expect(financeKanbanColumnsForSupplyFilter(caps, "aggregate")).toEqual([
      "customers",
      "suppliers",
    ]);
  });

  it("ASSET_BASED never includes suppliers even on ALL", () => {
    const caps = capsFor("ASSET_BASED");
    expect(financeKanbanColumnsForSupplyFilter(caps, "all")).toEqual([
      "customers",
      "garage",
      "drivers",
    ]);
  });

  it("NON_ASSET never includes garage or drivers even on ALL", () => {
    const caps = capsFor("NON_ASSET");
    expect(financeKanbanColumnsForSupplyFilter(caps, "all")).toEqual([
      "customers",
      "suppliers",
    ]);
  });
});
