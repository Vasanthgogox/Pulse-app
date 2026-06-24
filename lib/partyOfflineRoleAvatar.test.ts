import {
  offlinePartyRolePresentation,
  shouldUseOfflinePartyRoleAvatar,
} from "@/lib/partyOfflineRoleAvatar";

describe("shouldUseOfflinePartyRoleAvatar", () => {
  it("returns true for offline client, supplier, driver, and vehicle", () => {
    expect(shouldUseOfflinePartyRoleAvatar(false, "client")).toBe(true);
    expect(shouldUseOfflinePartyRoleAvatar(false, "supplier")).toBe(true);
    expect(shouldUseOfflinePartyRoleAvatar(false, "driver")).toBe(true);
    expect(shouldUseOfflinePartyRoleAvatar(false, "vehicle")).toBe(true);
  });

  it("returns false for integrated and unknown integration state", () => {
    expect(shouldUseOfflinePartyRoleAvatar(true, "client")).toBe(false);
    expect(shouldUseOfflinePartyRoleAvatar(undefined, "client")).toBe(false);
  });
});

describe("offlinePartyRolePresentation", () => {
  it("returns role-specific offline accent colors", () => {
    const client = offlinePartyRolePresentation("client");
    const supplier = offlinePartyRolePresentation("supplier");
    const driver = offlinePartyRolePresentation("driver");
    const vehicle = offlinePartyRolePresentation("vehicle");

    expect(client.accessibilityLabel).toBe("Client");
    expect(supplier.accessibilityLabel).toBe("Supplier");
    expect(driver.accessibilityLabel).toBe("Driver");
    expect(vehicle.accessibilityLabel).toBe("Vehicle");
    expect(client.accent.tint).not.toBe(supplier.accent.tint);
    expect(driver.accent.tint).not.toBe(supplier.accent.tint);
    expect(vehicle.iconColor).toBe("#ffffff");
  });
});
