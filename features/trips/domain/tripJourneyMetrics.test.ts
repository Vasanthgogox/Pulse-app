import {
  computeJourneyMetrics,
  DEFAULT_EXPECTED_PACE_KM_PER_DAY,
} from "@/features/trips/domain/tripJourneyMetrics";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripStageMetrics } from "@/features/trips/domain/tripStageMetrics";

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

const DEPARTURE = "2027-03-01T00:00:00.000Z";

describe("computeJourneyMetrics", () => {
  it("returns null before the trip has departed pickup", () => {
    const result = computeJourneyMetrics(
      trip({ distance: 1000 }),
      500_000,
      metrics({ pickupDepartureAt: null }),
      Date.now(),
    );
    expect(result).toBeNull();
  });

  it("returns null when the trip has no planned route distance", () => {
    const result = computeJourneyMetrics(
      trip({ distance: null }),
      500_000,
      metrics({ pickupDepartureAt: DEPARTURE }),
      Date.now(),
    );
    expect(result).toBeNull();
  });

  it("computes completed/remaining distance from the real checkpoint sum, not a straight-line proxy", () => {
    const nowMs = new Date(DEPARTURE).getTime() + 2 * 24 * 60 * 60_000; // 2 days later
    const result = computeJourneyMetrics(
      trip({ distance: 1800 }),
      700_000, // 700km covered
      metrics({ pickupDepartureAt: DEPARTURE }),
      nowMs,
    );
    expect(result?.routeDistanceKm).toBe(1800);
    expect(result?.completedDistanceKm).toBe(700);
    expect(result?.remainingDistanceKm).toBe(1100);
    expect(result?.actualPaceKmPerDay).toBe(350); // 700km / 2 days
  });

  it("uses trip.estimated_duration when it parses (Postgres 'N days HH:MM:SS' form)", () => {
    const nowMs = new Date(DEPARTURE).getTime() + 24 * 60 * 60_000;
    const result = computeJourneyMetrics(
      trip({ distance: 1800, estimated_duration: "3 days 06:00:00" }),
      300_000,
      metrics({ pickupDepartureAt: DEPARTURE }),
      nowMs,
    );
    // 1800km / 3.25 days
    expect(result?.expectedPaceIsEstimateBased).toBe(true);
    expect(result?.expectedPaceKmPerDay).toBeCloseTo(1800 / 3.25, 1);
  });

  it("falls back to the default pace assumption when estimated_duration is missing or unparseable", () => {
    const nowMs = new Date(DEPARTURE).getTime() + 24 * 60 * 60_000;
    const missing = computeJourneyMetrics(
      trip({ distance: 1800, estimated_duration: null }),
      300_000,
      metrics({ pickupDepartureAt: DEPARTURE }),
      nowMs,
    );
    expect(missing?.expectedPaceIsEstimateBased).toBe(false);
    expect(missing?.expectedPaceKmPerDay).toBe(DEFAULT_EXPECTED_PACE_KM_PER_DAY);

    const garbage = computeJourneyMetrics(
      trip({ distance: 1800, estimated_duration: "not-a-real-interval" }),
      300_000,
      metrics({ pickupDepartureAt: DEPARTURE }),
      nowMs,
    );
    expect(garbage?.expectedPaceIsEstimateBased).toBe(false);
  });

  it("classifies health from pace variance, matching the documented tiers", () => {
    const nowMs = new Date(DEPARTURE).getTime() + 1 * 24 * 60 * 60_000;
    const at = (coveredM: number) =>
      computeJourneyMetrics(
        trip({ distance: 1000, estimated_duration: "2 days 00:00:00" }), // expected pace 500 km/day
        coveredM,
        metrics({ pickupDepartureAt: DEPARTURE }),
        nowMs,
      )!.health;

    expect(at(490_000)).toBe("healthy"); // 490 km/day, -2% variance
    expect(at(450_000)).toBe("watch"); // 450 km/day, -10% variance
    expect(at(400_000)).toBe("delayed"); // 400 km/day, -20% variance
    expect(at(300_000)).toBe("critical"); // 300 km/day, -40% variance
    expect(at(600_000)).toBe("healthy"); // ahead of schedule is never "critical"
  });

  it("returns null predictedArrival/delayMs when the vehicle hasn't moved (zero actual pace)", () => {
    const nowMs = new Date(DEPARTURE).getTime() + 24 * 60 * 60_000;
    const result = computeJourneyMetrics(
      trip({ distance: 1800 }),
      0,
      metrics({ pickupDepartureAt: DEPARTURE }),
      nowMs,
    );
    expect(result?.actualPaceKmPerDay).toBe(0);
    expect(result?.predictedArrival).toBeNull();
    expect(result?.delayMs).toBeNull();
  });
});
