import {
  buildMissionTripPendingChips,
  isTripSmartTagSelectable,
  ledgerTripDueWeightForContext,
  ledgerTripNoDueTagLabel,
} from "@/lib/ledgerPartySmartTagPolicy";

const fin = {
  client_receivable: 5000,
  supplier_payable: 3000,
  driver_payable: 1000,
};

const parties = {
  localClientId: "client-a",
  localSupplierId: "supplier-b",
  driverId: "driver-c",
};

describe("ledgerPartySmartTagPolicy", () => {
  it("allows only client receivable when CLIENT is locked", () => {
    expect(
      isTripSmartTagSelectable("client", "in", "CLIENT", "client-a", parties),
    ).toBe(true);
    expect(
      isTripSmartTagSelectable("supplier", "out", "CLIENT", "client-a", parties),
    ).toBe(false);
    expect(
      isTripSmartTagSelectable("client", "out", "CLIENT", "client-a", parties),
    ).toBe(false);
  });

  it("hides cross-party chips when SUPPLIER is locked", () => {
    const chips = buildMissionTripPendingChips(
      "out",
      fin,
      "market",
      (n) => `₹${n}`,
      "SUPPLIER",
      "supplier-b",
      parties,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0]?.tag).toBe("supplier");
  });

  it("allows client due when trip is in locked client scope", () => {
    expect(
      isTripSmartTagSelectable(
        "client",
        "in",
        "CLIENT",
        "client-a",
        { localClientId: null, localSupplierId: null, driverId: null },
        true,
      ),
    ).toBe(true);
    expect(
      ledgerTripDueWeightForContext(
        "in",
        fin,
        "market",
        "CLIENT",
        "client-a",
        { localClientId: null, localSupplierId: null, driverId: null },
        null,
        true,
      ),
    ).toBe(5000);
  });

  it("labels no client due for locked client cash in", () => {
    expect(ledgerTripNoDueTagLabel("in", "CLIENT")).toBe("No client due");
  });

  it("returns zero due weight for wrong flow when party is locked", () => {
    expect(
      ledgerTripDueWeightForContext(
        "out",
        fin,
        "market",
        "CLIENT",
        "client-a",
        parties,
        "client-a",
      ),
    ).toBe(0);
    expect(
      ledgerTripDueWeightForContext(
        "in",
        fin,
        "market",
        "CLIENT",
        "client-a",
        parties,
        "client-a",
      ),
    ).toBe(5000);
  });
});
