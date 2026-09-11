import { overlayIssuedInvoiceOnTrip, invoiceNumbersByTripId } from "../../utils/podIssuedInvoiceOverlay.util";
import {
  computePodReconciliationSummaryFromTrips,
  tripMatchesPodTab,
} from "../podReconciliationService";

describe("POD metrics vs Pulse Invoice overlay", () => {
  it("counts issued invoices from invoices.trip_ids, not stale trips.invoice_no", () => {
    const raw = {
      id: "trip-uuid-1",
      invoice_no: null,
      invoice_status_1: "Pending",
      pod_status: "Pending",
      pod_received_at: null,
      client_price: 100000,
    };
    expect(tripMatchesPodTab(raw, "invoiced")).toBe(false);
    expect(tripMatchesPodTab(raw, "pod_pending")).toBe(true);

    const overlaid = overlayIssuedInvoiceOnTrip(
      raw,
      invoiceNumbersByTripId([
        { invoice_number: "INV/2026-27/00012", trip_ids: ["trip-uuid-1"] },
      ]),
    );
    expect(tripMatchesPodTab(overlaid, "invoiced")).toBe(true);
    expect(tripMatchesPodTab(overlaid, "pod_pending")).toBe(false);

    const summary = computePodReconciliationSummaryFromTrips([overlaid]);
    expect(summary.invoiced_count).toBe(1);
    expect(summary.invoiced_sum).toBe(100000);
    expect(summary.pod_pending_count).toBe(0);
  });
});
