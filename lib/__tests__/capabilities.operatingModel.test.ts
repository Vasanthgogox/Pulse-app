import {
  canAccessFinanceSubTab,
  canAccessSuppliers,
  canAccessVehicles,
  canUseAggregateSupply,
  canUseAssetSupply,
  getCapabilitiesFromProfile,
} from "@/lib/capabilities";

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
  });

  it("NON_ASSET hides garage and keeps suppliers", () => {
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
  });
});
