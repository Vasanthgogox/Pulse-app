import {
  filterTripsByPodRequired,
  invoiceBuildBlockedReason,
  invoiceIssuePendingPodReason,
  invoiceIssueRequirePod,
  invoicePodRequiredStorageKey,
  issuedInvoicesForPodToggle,
  isVisibleOnInvoiceList,
  parseInvoicePodRequiredStored,
  isTripSelectableWhenPodRequired,
  restoreInvoiceDraftTripIds,
  selectedTripsBlockIssueWhenPodRequired,
} from "../invoicePodRequired.util";

const received = {
  id: "T-RECV",
  internal_id: "uuid-recv",
  physicalPodReceived: true,
};
const notReceived = {
  id: "T-OPEN",
  internal_id: "uuid-open",
  physicalPodReceived: false,
};

describe("invoice POD Required filter", () => {
  it("ON + physical POD received → visible", () => {
    expect(filterTripsByPodRequired([received], true)).toEqual([received]);
    expect(
      isVisibleOnInvoiceList({
        tripId: received.internal_id,
        invoicedTripIds: new Set(),
        physicalPodReceived: true,
        podRequired: true,
      }),
    ).toBe(true);
  });

  it("ON + physical POD not received → still visible in Pending Billing", () => {
    expect(filterTripsByPodRequired([notReceived], true)).toEqual([notReceived]);
    expect(
      isVisibleOnInvoiceList({
        tripId: notReceived.internal_id,
        invoicedTripIds: new Set(),
        physicalPodReceived: false,
        podRequired: true,
      }),
    ).toBe(true);
  });

  it("OFF + physical POD received → visible", () => {
    expect(filterTripsByPodRequired([received], false)).toEqual([received]);
  });

  it("OFF + physical POD not received → visible if otherwise eligible", () => {
    expect(filterTripsByPodRequired([notReceived], false)).toEqual([
      notReceived,
    ]);
  });

  it("already invoiced trip leaves pending billing even when POD Required is OFF", () => {
    expect(
      isVisibleOnInvoiceList({
        tripId: "uuid-invoiced",
        invoicedTripIds: new Set(["uuid-invoiced"]),
        physicalPodReceived: true,
        podRequired: false,
      }),
    ).toBe(false);
  });

  it("digital POD upload is not physical receipt; trip still lists on ON", () => {
    const digitalOnly = {
      id: "T-DOC",
      physicalPodReceived: false,
      status: "pending",
    };
    expect(filterTripsByPodRequired([digitalOnly], true)).toEqual([digitalOnly]);
    expect(filterTripsByPodRequired([digitalOnly], false)).toEqual([digitalOnly]);
    expect(selectedTripsBlockIssueWhenPodRequired(true, [digitalOnly])).toBe(true);
  });

  it("workspace storage keys are isolated", () => {
    expect(invoicePodRequiredStorageKey("org-a")).not.toEqual(
      invoicePodRequiredStorageKey("org-b"),
    );
  });

  it("stored values parse without leaking across workspaces", () => {
    expect(parseInvoicePodRequiredStored("0")).toBe(false);
    expect(parseInvoicePodRequiredStored("1")).toBe(true);
    expect(parseInvoicePodRequiredStored(null)).toBe(true);
  });

  it("ON lists the same pending trips as OFF; Issue is blocked for Pending", () => {
    const listedOn = filterTripsByPodRequired([notReceived], true);
    const listedOff = filterTripsByPodRequired([notReceived], false);
    expect(listedOn).toHaveLength(1);
    expect(listedOff).toHaveLength(1);
    expect(selectedTripsBlockIssueWhenPodRequired(true, [{ status: "pending" }])).toBe(
      true,
    );
    expect(selectedTripsBlockIssueWhenPodRequired(false, [{ status: "pending" }])).toBe(
      false,
    );
    expect(invoiceIssuePendingPodReason(true, [{ status: "pending" }])).toMatch(
      /Pending/,
    );
    expect(isTripSelectableWhenPodRequired(true, { status: "pending" })).toBe(
      false,
    );
    expect(isTripSelectableWhenPodRequired(true, { status: "approved" })).toBe(
      true,
    );
    expect(
      isTripSelectableWhenPodRequired(true, {
        status: "approved",
        physicalPodReceived: false,
      }),
    ).toBe(false);
    expect(
      isTripSelectableWhenPodRequired(true, {
        status: "pending",
        physicalPodReceived: true,
      }),
    ).toBe(true);
    expect(isTripSelectableWhenPodRequired(false, { status: "pending" })).toBe(
      true,
    );
  });

  it("OFF does not disable Preview / Configure / Build", () => {
    expect(invoiceBuildBlockedReason(false)).toBeNull();
    expect(invoiceBuildBlockedReason(true)).toBeNull();
  });

  it("issued invoices stay visible regardless of POD Required", () => {
    const issued = [{ id: "INV/2026-27/00001" }];
    expect(issuedInvoicesForPodToggle(issued, true)).toEqual(issued);
    expect(issuedInvoicesForPodToggle(issued, false)).toEqual(issued);
  });

  it("Issue persist flag is true only when POD Required is ON", () => {
    expect(invoiceIssueRequirePod(true)).toBe(true);
    expect(invoiceIssueRequirePod(false)).toBe(false);
  });

  it("J: OFF + selected trip without soft POD is retained", () => {
    const pendingNoSoft = {
      id: "T-OPEN",
      physicalPodReceived: false,
      status: "pending",
    };
    const eligible = filterTripsByPodRequired([pendingNoSoft], false);
    expect(
      restoreInvoiceDraftTripIds(["T-OPEN"], eligible),
    ).toEqual(["T-OPEN"]);
  });

  it("K: ON + pending trip stays listed but is not restored into the draft", () => {
    const pendingNoHard = {
      id: "T-OPEN",
      physicalPodReceived: false,
      status: "pending",
    };
    const eligible = filterTripsByPodRequired([pendingNoHard], true);
    expect(restoreInvoiceDraftTripIds(["T-OPEN"], eligible, true)).toEqual([]);
    expect(isTripSelectableWhenPodRequired(true, pendingNoHard)).toBe(false);
    expect(selectedTripsBlockIssueWhenPodRequired(true, [pendingNoHard])).toBe(true);
  });

  it("filter is synchronous (no per-trip network)", () => {
    const n = 500;
    const trips = Array.from({ length: n }, (_, i) => ({
      id: `T${i}`,
      physicalPodReceived: i % 2 === 0,
    }));
    const t0 = Date.now();
    const on = filterTripsByPodRequired(trips, true);
    const off = filterTripsByPodRequired(trips, false);
    expect(Date.now() - t0).toBeLessThan(50);
    expect(on).toHaveLength(n);
    expect(off).toHaveLength(n);
  });
});
