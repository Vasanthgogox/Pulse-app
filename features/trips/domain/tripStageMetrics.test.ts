import { computeTripStageMetrics } from "@/features/trips/domain/tripStageMetrics";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripTimelineEvent } from "@/features/trips/domain/tripTimeline";

function trip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: "trip-1",
    organization_id: "org-1",
    ...overrides,
  } as TripRow;
}

function event(
  type: TripTimelineEvent["type"],
  occurredAt: string,
): TripTimelineEvent {
  return { id: `${type}:${occurredAt}`, occurredAt, type, title: type, severity: "info" };
}

const T0 = "2027-01-01T08:00:00.000Z"; // assigned
const T1 = "2027-01-01T08:10:00.000Z"; // accepted (+10 min)
const T2 = "2027-01-01T09:10:00.000Z"; // entered pickup (+1 hr travel)
const T3 = "2027-01-01T09:30:00.000Z"; // exited pickup (+20 min dwell)
const T4 = "2027-01-01T11:30:00.000Z"; // entered drop (+2 hr transit)
const T5 = "2027-01-01T11:45:00.000Z"; // completed (+15 min drop dwell)

describe("computeTripStageMetrics", () => {
  it("computes final, non-running durations for a fully completed trip", () => {
    const events = [
      event("assigned", T0),
      event("driver_accepted", T1),
      event("entered_pickup", T2),
      event("exited_pickup", T3),
      event("entered_drop", T4),
      event("completed", T5),
    ];
    const metrics = computeTripStageMetrics(trip(), events, new Date(T5).getTime());

    expect(metrics.acceptanceDuration).toEqual({ ms: 10 * 60_000, isRunning: false });
    expect(metrics.pickupTravelDuration).toEqual({ ms: 60 * 60_000, isRunning: false });
    expect(metrics.pickupDwellDuration).toEqual({ ms: 20 * 60_000, isRunning: false });
    expect(metrics.transitDuration).toEqual({ ms: 120 * 60_000, isRunning: false });
    expect(metrics.dropDwellDuration).toEqual({ ms: 15 * 60_000, isRunning: false });
    expect(metrics.totalDuration).toEqual({ ms: 225 * 60_000, isRunning: false });
  });

  it("reports exactly one running duration for a trip mid-transit, later ones null", () => {
    const events = [
      event("assigned", T0),
      event("driver_accepted", T1),
      event("entered_pickup", T2),
      event("exited_pickup", T3),
    ];
    // "Now" is 30 minutes into transit.
    const nowMs = new Date(T3).getTime() + 30 * 60_000;
    const metrics = computeTripStageMetrics(trip(), events, nowMs);

    expect(metrics.acceptanceDuration?.isRunning).toBe(false);
    expect(metrics.pickupTravelDuration?.isRunning).toBe(false);
    expect(metrics.pickupDwellDuration?.isRunning).toBe(false);
    expect(metrics.transitDuration).toEqual({ ms: 30 * 60_000, isRunning: true });
    expect(metrics.dropDwellDuration).toBeNull();
    expect(metrics.totalDuration?.isRunning).toBe(true);
  });

  it("does not fabricate pickupTravelDuration when driver_accepted was never recorded", () => {
    const events = [event("assigned", T0), event("entered_pickup", T2)];
    const metrics = computeTripStageMetrics(trip(), events, new Date(T2).getTime());

    expect(metrics.acceptedAt).toBeNull();
    expect(metrics.pickupTravelDuration).toBeNull();
    // assignedAt -> entered_pickup is a real gap, but not the same metric as
    // "time since acceptance" -- not backfilled.
  });

  it("falls back to trip.completed_at when no completed timeline event exists", () => {
    const events = [event("assigned", T0), event("entered_drop", T4)];
    const metrics = computeTripStageMetrics(
      trip({ completed_at: T5 }),
      events,
      new Date(T5).getTime(),
    );

    expect(metrics.completedAt).toBe(T5);
    expect(metrics.dropDwellDuration).toEqual({ ms: 15 * 60_000, isRunning: false });
  });

  it("uses the first occurrence when a geofence event repeats", () => {
    const T2b = "2027-01-01T09:20:00.000Z"; // a later, second "entered_pickup"
    const events = [
      event("assigned", T0),
      event("entered_pickup", T2),
      event("exited_pickup", T3),
      event("entered_pickup", T2b),
    ];
    const metrics = computeTripStageMetrics(trip(), events, new Date(T3).getTime());

    expect(metrics.pickupArrivalAt).toBe(T2);
  });
});
