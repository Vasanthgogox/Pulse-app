import { resolveLiveTrackingEta } from "@/features/trips/utils/liveTrackingEta.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripStageMetrics } from "@/features/trips/domain/tripStageMetrics";
import type { JourneyMetrics } from "@/features/trips/domain/tripJourneyMetrics";

function trip(overrides: Partial<TripRow> = {}): TripRow {
  return { id: "trip-1", organization_id: "org-1", ...overrides } as TripRow;
}

function metrics(overrides: Partial<TripStageMetrics> = {}): TripStageMetrics {
  return {
    assignedAt: null,
    acceptedAt: null,
    pickupArrivalAt: null,
    pickupDepartureAt: null,
    dropArrivalAt: null,
    completedAt: null,
    acceptanceDuration: null,
    pickupTravelDuration: null,
    pickupDwellDuration: null,
    transitDuration: null,
    dropDwellDuration: null,
    totalDuration: null,
    ...overrides,
  };
}

function journeyMetrics(overrides: Partial<JourneyMetrics> = {}): JourneyMetrics {
  return {
    routeDistanceKm: 1000,
    completedDistanceKm: 500,
    remainingDistanceKm: 500,
    expectedPaceKmPerDay: 350,
    actualPaceKmPerDay: 350,
    expectedPaceIsEstimateBased: false,
    expectedArrival: new Date().toISOString(),
    predictedArrival: null,
    delayMs: null,
    health: "healthy",
    ...overrides,
  };
}

const NOW = new Date("2027-03-05T10:00:00.000Z").getTime();

describe("resolveLiveTrackingEta", () => {
  it("tier 1: uses computeJourneyMetrics().predictedArrival when it's in the future", () => {
    const future = new Date(NOW + 6 * 60 * 60_000).toISOString(); // +6h
    const result = resolveLiveTrackingEta({
      trip: trip(),
      stageMetrics: metrics({ pickupDepartureAt: "2027-03-04T00:00:00.000Z" }),
      journeyMetrics: journeyMetrics({ predictedArrival: future }),
      nowMs: NOW,
    });
    expect(result.isUnavailable).toBe(false);
    expect(result.isEstimating).toBe(false);
    expect(result.label).toContain("Today");
  });

  it("never renders a past predictedArrival -- falls through instead of showing an expired date", () => {
    const past = new Date(NOW - 6 * 60 * 60_000).toISOString(); // -6h, stale
    const result = resolveLiveTrackingEta({
      trip: trip({ estimated_duration: null }),
      stageMetrics: metrics({ pickupDepartureAt: "2027-03-04T00:00:00.000Z" }),
      journeyMetrics: journeyMetrics({ predictedArrival: past }),
      nowMs: NOW,
    });
    expect(result.label).not.toMatch(/2027/);
    expect(result.isUnavailable).toBe(true);
    expect(result.label).toBe("ETA unavailable");
  });

  it("tier 2: prefers live routeEtaSeconds over the static trip estimate", () => {
    const result = resolveLiveTrackingEta({
      trip: trip({ estimated_duration: "5 days 00:00:00" }),
      stageMetrics: metrics({ pickupDepartureAt: "2027-03-04T00:00:00.000Z" }),
      journeyMetrics: null,
      routeEtaSeconds: 3600 * 3, // 3h from now
      nowMs: NOW,
    });
    expect(result.isUnavailable).toBe(false);
    expect(result.isEstimating).toBe(false);
    expect(result.label).toContain("Today");
  });

  it("tier 2: falls back to trip.estimated_duration anchored at transit start when it resolves to the future", () => {
    const result = resolveLiveTrackingEta({
      trip: trip({ estimated_duration: "2 days 00:00:00" }),
      stageMetrics: metrics({ pickupDepartureAt: "2027-03-04T00:00:00.000Z" }), // +2 days = 2027-03-06, still future
      journeyMetrics: null,
      nowMs: NOW,
    });
    expect(result.isUnavailable).toBe(false);
    expect(result.label).not.toBe("ETA unavailable");
  });

  it("tier 3: shows a plain remaining-duration (no date) when the estimate anchors to a past moment", () => {
    const result = resolveLiveTrackingEta({
      trip: trip({ estimated_duration: "1 days 00:00:00" }),
      // Departed 5 days ago with only a 1-day estimate -- anchored arrival is long past.
      stageMetrics: metrics({ pickupDepartureAt: "2027-02-28T00:00:00.000Z" }),
      journeyMetrics: null,
      nowMs: NOW,
    });
    expect(result.isUnavailable).toBe(false);
    expect(result.isEstimating).toBe(false);
    expect(result.label).toMatch(/remaining/);
    expect(result.label).not.toMatch(/-/); // never a negative duration
  });

  it("tier 4: 'Estimating arrival…' before the trip has departed pickup (transient, not an error)", () => {
    const result = resolveLiveTrackingEta({
      trip: trip({ estimated_duration: null }),
      stageMetrics: metrics({ pickupDepartureAt: null, completedAt: null }),
      journeyMetrics: null,
      nowMs: NOW,
    });
    expect(result.isEstimating).toBe(true);
    expect(result.isUnavailable).toBe(false);
    expect(result.label).toBe("Estimating arrival…");
  });

  it("tier 4: 'ETA unavailable' once departed with no usable signal at all", () => {
    const result = resolveLiveTrackingEta({
      trip: trip({ estimated_duration: null }),
      stageMetrics: metrics({ pickupDepartureAt: "2027-03-04T00:00:00.000Z" }),
      journeyMetrics: null,
      nowMs: NOW,
    });
    expect(result.isUnavailable).toBe(true);
    expect(result.label).toBe("ETA unavailable");
  });
});
