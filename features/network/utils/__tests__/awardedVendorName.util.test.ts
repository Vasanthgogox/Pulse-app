import {
  resolveAwardedVendorName,
  resolveGiveLoadAwardedAmountInr,
  supplierNameByLinkedOrgId,
} from "@/features/network/utils/awardedVendorName.util";

describe("supplierNameByLinkedOrgId", () => {
  it("indexes suppliers by linked org and prefers name over company_name", () => {
    expect(
      supplierNameByLinkedOrgId([
        {
          linked_organization_id: "org-1",
          name: "Acme Logistics",
          company_name: "Acme Pvt Ltd",
        },
        { linked_organization_id: "org-2", company_name: "Beta Freight" },
        { linked_organization_id: "  ", name: "Skip" },
      ]),
    ).toEqual({
      "org-1": "Acme Logistics",
      "org-2": "Beta Freight",
    });
  });
});

describe("resolveAwardedVendorName", () => {
  it("uses the session name captured at award time first", () => {
    expect(
      resolveAwardedVendorName({
        assignedSupplierOrgId: "org-1",
        sessionName: "Winner Co",
        supplierNameByOrgId: { "org-1": "CRM Name" },
      }),
    ).toBe("Winner Co");
  });

  it("falls back to the CRM supplier, then the org display name", () => {
    expect(
      resolveAwardedVendorName({
        assignedSupplierOrgId: "org-1",
        supplierNameByOrgId: { "org-1": "Acme Logistics" },
      }),
    ).toBe("Acme Logistics");

    expect(
      resolveAwardedVendorName({
        assignedSupplierOrgId: "org-9",
        orgDisplayNameById: { "org-9": "Market Bidder" },
      }),
    ).toBe("Market Bidder");
  });

  it("uses the trip supplier name when the indent has no assigned org", () => {
    expect(
      resolveAwardedVendorName({
        fallbackName: "Paperkraft",
      }),
    ).toBe("Paperkraft");
  });

  it("uses the DCO driver name when there is no supplier org", () => {
    expect(
      resolveAwardedVendorName({
        fallbackName: "Phuspha",
      }),
    ).toBe("Phuspha");
  });

  it("returns null when the indent has no assigned supplier", () => {
    expect(resolveAwardedVendorName({ sessionName: "  " })).toBeNull();
  });
});

describe("resolveGiveLoadAwardedAmountInr", () => {
  it("uses the DCO market-bid amount on the trip, not the indent target", () => {
    expect(
      resolveGiveLoadAwardedAmountInr({
        supplierTarget: 39186,
        tripClientPrice: 35000,
        tripDriverCommission: 35000,
        tripSupplierRate: 0,
      }),
    ).toBe(35000);
  });

  it("prefers the assigned supplier rate over the trip client price", () => {
    expect(
      resolveGiveLoadAwardedAmountInr({
        assignedSupplierRate: 18700,
        tripClientPrice: 22000,
        supplierTarget: 18700,
      }),
    ).toBe(18700);
  });
});
