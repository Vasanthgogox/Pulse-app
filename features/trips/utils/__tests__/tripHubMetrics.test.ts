import {
  TRIP_METRIC_ORDER,
  classifyTripMetric,
  countTripsByMetric,
} from "@/features/trips/utils/tripHubMetrics";
import type { TripRow } from "@/features/trips/services/trips.service";

function trip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1",
    driver_id: null,
    status: "assigned",
    ...overrides,
  } as TripRow;
}

const NO_DOCS = new Set<string>();

/**
 * Trips → INDENT stage correction: `indent` is a new rail entry populated
 * entirely from the indents list by the caller (TripsScreen), never by
 * classifying an actual trip. These tests pin that `classifyTripMetric`
 * itself is completely unchanged — it must never return "indent" for a
 * real trip, and existing trip classification must be untouched.
 */
describe("TRIP_METRIC_ORDER — INDENT stage addition", () => {
  it("puts indent first, immediately before unassigned", () => {
    expect(TRIP_METRIC_ORDER[0]).toBe("indent");
    expect(TRIP_METRIC_ORDER[1]).toBe("unassigned");
  });

  it("preserves the existing trip stage order after indent", () => {
    expect(TRIP_METRIC_ORDER).toEqual([
      "indent",
      "unassigned",
      "assigned",
      "loading",
      "in_transit",
      "unloading",
      "delivered_docs_pending",
    ]);
  });
});

describe("classifyTripMetric — unchanged for actual trips", () => {
  it("never classifies a real trip as indent", () => {
    // Sweep every status classifyTripMetric recognizes plus a bogus one —
    // none of them may resolve to "indent".
    const statuses = [
      "draft",
      "assigned",
      "in_progress",
      "picked_up",
      "in_transit",
      "dispatched",
      "at_drop",
      "unloading",
      "arrived",
      "cancelled",
      "something_unrecognized",
    ];
    for (const status of statuses) {
      for (const driver_id of [null, "driver-1"]) {
        expect(classifyTripMetric(trip({ status, driver_id }), NO_DOCS)).not.toBe(
          "indent",
        );
      }
    }
  });

  it("a trip with no driver is UNASSIGNED, not INDENT — existing semantics untouched", () => {
    expect(classifyTripMetric(trip({ driver_id: null, status: "assigned" }), NO_DOCS)).toBe(
      "unassigned",
    );
  });

  it("a trip with a driver and status=assigned is ASSIGNED", () => {
    expect(
      classifyTripMetric(trip({ driver_id: "driver-1", status: "assigned" }), NO_DOCS),
    ).toBe("assigned");
  });
});

describe("countTripsByMetric — indent bucket exists and starts at zero", () => {
  it("initializes indent to 0 — only the caller (TripsScreen) populates it from indents", () => {
    const counts = countTripsByMetric(
      [trip({ id: "t1", driver_id: null }), trip({ id: "t2", driver_id: "d1" })],
      NO_DOCS,
    );
    expect(counts.indent).toBe(0);
    expect(counts.unassigned).toBe(1);
    expect(counts.assigned).toBe(1);
  });
});
