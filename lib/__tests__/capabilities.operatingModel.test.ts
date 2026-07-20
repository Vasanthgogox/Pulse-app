import {
  allowedConnectionRoles,
  canAccessFinanceSubTab,
  canAccessSuppliers,
  canAccessVehicles,
  canUseAggregateSupply,
  canUseAssetSupply,
  getCapabilitiesFromProfile,
  getEffectivePermissions,
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
