import {
  invoiceNumbersByTripId,
  overlayIssuedInvoiceOnTrip,
  tripHardPodStamp,
} from "../podIssuedInvoiceOverlay.util";

describe("invoiceNumbersByTripId", () => {
  it("indexes invoice numbers by trip uuid", () => {
    const map = invoiceNumbersByTripId([
      {
        invoice_number: "INV/2026-27/00002",
        trip_ids: ["t1", "t2"],
      },
      { invoice_number: "INV/2026-27/00003", trip_ids: ["t1"] },
    ]);
    expect(map.get("t1")).toEqual(["INV/2026-27/00002", "INV/2026-27/00003"]);
    expect(map.get("t2")).toEqual(["INV/2026-27/00002"]);
  });
});

describe("overlayIssuedInvoiceOnTrip", () => {
  it("replaces stale Pending invoice_status_1 and empty invoice_no", () => {
    const next = overlayIssuedInvoiceOnTrip(
      {
        id: "t1",
        invoice_no: null,
        invoice_status_1: "Pending",
      },
      invoiceNumbersByTripId([
        { invoice_number: "INV/2026-27/00002", trip_ids: ["t1"] },
      ]),
    );
    expect(next.invoice_no).toBe("INV/2026-27/00002");
    expect(next.invoice_status_1).toBe("Raised");
  });

  it("leaves unmatched trips unchanged", () => {
    const trip = { id: "t9", invoice_no: null, invoice_status_1: "Pending" };
    expect(overlayIssuedInvoiceOnTrip(trip, new Map())).toEqual(trip);
  });
});

describe("tripHardPodStamp", () => {
  it("reads ISO stamps and ignores empty", () => {
    expect(tripHardPodStamp({ pod_received_at: "2026-09-11T06:30:00.000Z" })).toBe(
      "2026-09-11T06:30:00.000Z",
    );
    expect(tripHardPodStamp({ pod_received_at: null })).toBeNull();
    expect(tripHardPodStamp({})).toBeNull();
  });
});
