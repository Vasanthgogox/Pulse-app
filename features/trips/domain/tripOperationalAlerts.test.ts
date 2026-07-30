import {
  evaluateOperationalAlerts,
  DEFAULT_ALERT_THRESHOLDS,
} from "@/features/trips/domain/tripOperationalAlerts";
import type { TripStageMetrics } from "@/features/trips/domain/tripStageMetrics";
import type { TripTimelineEvent } from "@/features/trips/domain/tripTimeline";
import type { DriverPresenceRow } from "@/features/tracking/services/driverPresence.service";
import type { JourneyMetrics } from "@/features/trips/domain/tripJourneyMetrics";

const NOW_ISO = "2027-02-01T12:00:00.000Z";
const NOW_MS = new Date(NOW_ISO).getTime();

function baseMetrics(overrides: Partial<TripStageMetrics> = {}): TripStageMetrics {
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

function presence(overrides: Partial<DriverPresenceRow> = {}): DriverPresenceRow {
  return {
    driver_id: "driver-1",
    trip_id: "trip-1",
    latitude: 28.6,
    longitude: 77.2,
    accuracy: 10,
    heading: 90,
    speed_kmh: 40,
    recorded_at: NOW_ISO,
    session_id: "session-1",
    ...overrides,
  };
}

function isoMinutesAgo(min: number): string {
  return new Date(NOW_MS - min * 60_000).toISOString();
}

function journeyMetrics(overrides: Partial<JourneyMetrics> = {}): JourneyMetrics {
  return {
    routeDistanceKm: 1800,
    completedDistanceKm: 700,
    remainingDistanceKm: 1100,
    expectedPaceKmPerDay: 500,
    actualPaceKmPerDay: 350,
    expectedPaceIsEstimateBased: true,
    expectedArrival: isoMinutesAgo(-60),
    predictedArrival: isoMinutesAgo(-180),
    delayMs: 120 * 60_000,
    health: "critical",
    ...overrides,
  };
}

describe("evaluateOperationalAlerts", () => {
  it("fires acceptance_delayed only once past threshold", () => {
    const under = evaluateOperationalAlerts({
      metrics: baseMetrics({
        assignedAt: isoMinutesAgo(9),
        acceptanceDuration: { ms: 9 * 60_000, isRunning: true },
      }),
      events: [],
      presence: null,
      nowMs: NOW_MS,
    });
    expect(under.find((a) => a.id === "acceptance_delayed")).toBeUndefined();

    const over = evaluateOperationalAlerts({
      metrics: baseMetrics({
        assignedAt: isoMinutesAgo(11),
        acceptanceDuration: { ms: 11 * 60_000, isRunning: true },
      }),
      events: [],
      presence: null,
      nowMs: NOW_MS,
    });
    const alert = over.find((a) => a.id === "acceptance_delayed");
    expect(alert?.severity).toBe("warning");
    expect(alert?.category).toBe("acceptance");
    expect(alert?.isActive).toBe(true);
  });

  it("does not fire acceptance_delayed once accepted (duration no longer running)", () => {
    const alerts = evaluateOperationalAlerts({
      metrics: baseMetrics({
        assignedAt: isoMinutesAgo(60),
        acceptedAt: isoMinutesAgo(45),
        acceptanceDuration: { ms: 15 * 60_000, isRunning: false },
      }),
      events: [],
      presence: null,
      nowMs: NOW_MS,
    });
    expect(alerts.find((a) => a.id === "acceptance_delayed")).toBeUndefined();
  });

  it("fires pickup_dwell_exceeded past threshold", () => {
    const alerts = evaluateOperationalAlerts({
      metrics: baseMetrics({
        pickupArrivalAt: isoMinutesAgo(35),
        pickupDwellDuration: { ms: 35 * 60_000, isRunning: true },
      }),
      events: [],
      presence: null,
      nowMs: NOW_MS,
    });
    expect(alerts.find((a) => a.id === "pickup_dwell_exceeded")?.category).toBe("pickup");
  });

  it("fires transit_unusually_long past threshold", () => {
    const alerts = evaluateOperationalAlerts({
      metrics: baseMetrics({
        pickupDepartureAt: isoMinutesAgo(9 * 60),
        transitDuration: { ms: 9 * 60 * 60_000, isRunning: true },
      }),
      events: [],
      presence: null,
      nowMs: NOW_MS,
    });
    expect(alerts.find((a) => a.id === "transit_unusually_long")?.category).toBe("transit");
  });

  it("fires drop_dwell_exceeded but suppresses pod_overdue once POD is uploaded", () => {
    const metrics = baseMetrics({
      dropArrivalAt: isoMinutesAgo(35),
      dropDwellDuration: { ms: 35 * 60_000, isRunning: true },
    });
    const withoutPod = evaluateOperationalAlerts({ metrics, events: [], presence: null, nowMs: NOW_MS });
    expect(withoutPod.find((a) => a.id === "drop_dwell_exceeded")).toBeDefined();
    expect(withoutPod.find((a) => a.id === "pod_overdue")).toBeDefined();

    const podEvent: TripTimelineEvent = {
      id: "workflow:1",
      occurredAt: isoMinutesAgo(5),
      type: "pod_uploaded",
      title: "POD uploaded",
      severity: "info",
    };
    const withPod = evaluateOperationalAlerts({
      metrics,
      events: [podEvent],
      presence: null,
      nowMs: NOW_MS,
    });
    // Drop dwell exceeded is still real (driver is still at drop a while) --
    // POD overdue specifically is resolved because the document exists now.
    expect(withPod.find((a) => a.id === "drop_dwell_exceeded")).toBeDefined();
    expect(withPod.find((a) => a.id === "pod_overdue")).toBeUndefined();
  });

  it("fires no_location_updates when presence is stale and trip is not completed", () => {
    const stale = evaluateOperationalAlerts({
      metrics: baseMetrics({ pickupDepartureAt: isoMinutesAgo(60) }),
      events: [],
      presence: presence({ recorded_at: isoMinutesAgo(20) }),
      nowMs: NOW_MS,
    });
    expect(stale.find((a) => a.id === "no_location_updates")?.severity).toBe("critical");

    const fresh = evaluateOperationalAlerts({
      metrics: baseMetrics({ pickupDepartureAt: isoMinutesAgo(60) }),
      events: [],
      presence: presence({ recorded_at: isoMinutesAgo(2) }),
      nowMs: NOW_MS,
    });
    expect(fresh.find((a) => a.id === "no_location_updates")).toBeUndefined();
  });

  it("suppresses no_location_updates once the trip is completed", () => {
    const alerts = evaluateOperationalAlerts({
      metrics: baseMetrics({ completedAt: isoMinutesAgo(5) }),
      events: [],
      presence: presence({ recorded_at: isoMinutesAgo(120) }),
      nowMs: NOW_MS,
    });
    expect(alerts.find((a) => a.id === "no_location_updates")).toBeUndefined();
  });

  it("supports custom thresholds without mutating the shared defaults", () => {
    const alerts = evaluateOperationalAlerts({
      metrics: baseMetrics({
        assignedAt: isoMinutesAgo(6),
        acceptanceDuration: { ms: 6 * 60_000, isRunning: true },
      }),
      events: [],
      presence: null,
      nowMs: NOW_MS,
      thresholds: { acceptanceDelayMs: 5 * 60_000 },
    });
    expect(alerts.find((a) => a.id === "acceptance_delayed")).toBeDefined();
    expect(DEFAULT_ALERT_THRESHOLDS.acceptanceDelayMs).toBe(10 * 60_000);
  });

  it("fires journey_behind_schedule at delayed/critical health but not healthy/watch", () => {
    const criticalMetrics = baseMetrics({ pickupDepartureAt: isoMinutesAgo(120) });
    const critical = evaluateOperationalAlerts({
      metrics: criticalMetrics,
      events: [],
      presence: null,
      journeyMetrics: journeyMetrics({ health: "critical" }),
      nowMs: NOW_MS,
    });
    const alert = critical.find((a) => a.id === "journey_behind_schedule");
    expect(alert?.severity).toBe("critical");
    expect(alert?.description).toContain("700 km");
    expect(alert?.description).toContain("1,800 km");

    const delayed = evaluateOperationalAlerts({
      metrics: criticalMetrics,
      events: [],
      presence: null,
      journeyMetrics: journeyMetrics({ health: "delayed" }),
      nowMs: NOW_MS,
    });
    expect(delayed.find((a) => a.id === "journey_behind_schedule")?.severity).toBe("warning");

    const healthy = evaluateOperationalAlerts({
      metrics: criticalMetrics,
      events: [],
      presence: null,
      journeyMetrics: journeyMetrics({ health: "healthy" }),
      nowMs: NOW_MS,
    });
    expect(healthy.find((a) => a.id === "journey_behind_schedule")).toBeUndefined();

    const watch = evaluateOperationalAlerts({
      metrics: criticalMetrics,
      events: [],
      presence: null,
      journeyMetrics: journeyMetrics({ health: "watch" }),
      nowMs: NOW_MS,
    });
    expect(watch.find((a) => a.id === "journey_behind_schedule")).toBeUndefined();
  });

  it("suppresses the flat transit_unusually_long threshold once journey metrics exist for the trip", () => {
    const metrics = baseMetrics({
      pickupDepartureAt: isoMinutesAgo(9 * 60),
      transitDuration: { ms: 9 * 60 * 60_000, isRunning: true }, // would fire the flat rule alone
    });

    const withoutJourney = evaluateOperationalAlerts({ metrics, events: [], presence: null, nowMs: NOW_MS });
    expect(withoutJourney.find((a) => a.id === "transit_unusually_long")).toBeDefined();

    const withJourney = evaluateOperationalAlerts({
      metrics,
      events: [],
      presence: null,
      journeyMetrics: journeyMetrics({ health: "healthy" }), // even when journey health itself is fine
      nowMs: NOW_MS,
    });
    expect(withJourney.find((a) => a.id === "transit_unusually_long")).toBeUndefined();
  });
});
