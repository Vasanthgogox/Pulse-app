import {
  offlinePartyRolePresentation,
  shouldUseOfflinePartyRoleAvatar,
} from "@/lib/partyOfflineRoleAvatar";

describe("shouldUseOfflinePartyRoleAvatar", () => {
  it("returns true for offline client and supplier only", () => {
    expect(shouldUseOfflinePartyRoleAvatar(false, "client")).toBe(true);
    expect(shouldUseOfflinePartyRoleAvatar(false, "supplier")).toBe(true);
  });

  it("returns false for drivers and integrated parties", () => {
    expect(shouldUseOfflinePartyRoleAvatar(false, "driver")).toBe(false);
    expect(shouldUseOfflinePartyRoleAvatar(true, "client")).toBe(false);
    expect(shouldUseOfflinePartyRoleAvatar(undefined, "client")).toBe(false);
  });
});

describe("offlinePartyRolePresentation", () => {
  it("uses golden fill with ink icon on offline tiles", () => {
    const client = offlinePartyRolePresentation("client");
    const supplier = offlinePartyRolePresentation("supplier");
    expect(client.accessibilityLabel).toBe("Client");
    expect(supplier.accessibilityLabel).toBe("Supplier");
    expect(client.accent.tint).toBe(supplier.accent.tint);
    expect(client.iconColor).toBe(supplier.iconColor);
  });
});
