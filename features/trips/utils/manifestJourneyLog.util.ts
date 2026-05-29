import { formatTime } from "@/lib/format";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { TripRow } from "@/features/trips/services/trips.service";

export type ManifestJourneyStepKey =
  | "assigned"
  | "driver_accepted"
  | "pickup"
  | "in_transit"
  | "delivered";

export type ManifestJourneyLogEntry = {
  stepKey: ManifestJourneyStepKey;
  status: string;
  location: string;
  /** GPS coordinates line shown under {@link location} when set. */
  locationCoords?: string | null;
  time: string;
  details: string;
  atIso: string | null;
};

export type ManifestSimLogEntry = {
  status: string;
  timestamp: string;
  lat: number | null;
  lng: number | null;
  userName: string;
};

export type ManifestLocationPing = {
  recorded_at: string;
  latitude: number;
  longitude: number;
  locationName?: string | null;
};

const MANIFEST_LAST_INDEX = 4;

function formatCoordinateLabel(lat: number, lng: number): string {
  const latHem = lat >= 0 ? "N" : "S";
  const lngHem = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}°${latHem}, ${Math.abs(lng).toFixed(5)}°${lngHem}`;
}

function simEntryKey(entry: ManifestSimLogEntry): string {
  return `${entry.status}|${entry.timestamp}`;
}

function pickLatestSim(
  simLogs: ManifestSimLogEntry[],
  statuses: string[],
): ManifestSimLogEntry | null {
  const matches = simLogs.filter((e) => statuses.includes(e.status));
  return matches.length > 0 ? matches[matches.length - 1]! : null;
}

function locationFromSim(
  sim: ManifestSimLogEntry | null,
  simLocationByKey: Record<string, string>,
): string | null {
  if (!sim) return null;
  const labeled = simLocationByKey[simEntryKey(sim)]?.trim();
  if (labeled) return labeled;
  if (sim.lat != null && sim.lng != null) {
    return formatCoordinateLabel(sim.lat, sim.lng);
  }
  return null;
}

function isNearIso(
  recordedAt: string | null | undefined,
  eventIso: string | null,
  maxWindowMs: number,
): boolean {
  if (!recordedAt || !eventIso) return false;
  const a = new Date(recordedAt).getTime();
  const b = new Date(eventIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= maxWindowMs;
}

function pickPingAt(
  pings: ManifestLocationPing[],
  nearIso: string | null,
  maxWindowMs = 2 * 60 * 60 * 1000,
): ManifestLocationPing | null {
  if (!nearIso || pings.length === 0) return null;
  const target = new Date(nearIso).getTime();
  if (!Number.isFinite(target)) return null;

  let best: ManifestLocationPing | null = null;
  let bestDelta = Infinity;
  for (const ping of pings) {
    const t = new Date(ping.recorded_at).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = ping;
    }
  }
  if (!best || bestDelta > maxWindowMs) return null;
  return best;
}

/** Prefer first driver GPS ping at/after acceptance; else nearest ping to that moment. */
function pickPingForDriverAcceptance(
  pings: ManifestLocationPing[],
  acceptedAtIso: string | null,
): ManifestLocationPing | null {
  if (!acceptedAtIso || pings.length === 0) return null;
  const target = new Date(acceptedAtIso).getTime();
  if (!Number.isFinite(target)) return null;

  const sorted = [...pings].sort(
    (a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const afterAccept = sorted.find((p) => {
    const t = new Date(p.recorded_at).getTime();
    return t >= target && t - target <= 2 * 60 * 60 * 1000;
  });
  if (afterAccept) return afterAccept;

  return pickPingAt(pings, acceptedAtIso, 30 * 60 * 1000);
}

function locationFromPing(
  pings: ManifestLocationPing[],
  nearIso: string | null,
  maxWindowMs = 2 * 60 * 60 * 1000,
): string | null {
  const best = pickPingAt(pings, nearIso, maxWindowMs);
  if (!best) return null;
  const named = (best.locationName ?? "").trim();
  if (named) return named;
  return formatCoordinateLabel(best.latitude, best.longitude);
}

function looksLikeCoordinateLabel(label: string): boolean {
  return /°\s*[NSEW]/i.test(label);
}

function formatDriverAcceptanceLocation(input: {
  ping: ManifestLocationPing | null;
  sim: ManifestSimLogEntry | null;
  simLocationByKey: Record<string, string>;
  geocodeLabel?: string | null;
  fallback: string;
}): { location: string; locationCoords: string | null; details: string } {
  let placeName: string | null = null;
  let coords: string | null = null;

  if (input.ping) {
    placeName = (input.ping.locationName ?? "").trim() || null;
    coords = formatCoordinateLabel(input.ping.latitude, input.ping.longitude);
  }

  if (input.sim) {
    const simLabel = locationFromSim(input.sim, input.simLocationByKey);
    if (simLabel) {
      if (looksLikeCoordinateLabel(simLabel)) {
        coords = coords ?? simLabel;
      } else if (!placeName) {
        placeName = simLabel;
      }
    }
    if (input.sim.lat != null && input.sim.lng != null) {
      coords = formatCoordinateLabel(input.sim.lat, input.sim.lng);
    }
  }

  if (!placeName && input.geocodeLabel?.trim()) {
    const geo = input.geocodeLabel.trim();
    if (looksLikeCoordinateLabel(geo)) {
      coords = coords ?? geo;
    } else {
      placeName = geo;
    }
  }

  if (!placeName && !coords) {
    return {
      location: input.fallback,
      locationCoords: null,
      details: "Waiting for driver GPS at acceptance.",
    };
  }

  const location = placeName
    ? `Current location · ${placeName}`
    : "Current location";

  const details = placeName
    ? coords
      ? `Driver accepted from ${placeName} (${coords}).`
      : `Driver accepted near ${placeName}.`
    : coords
      ? `Driver accepted at GPS ${coords}.`
      : "Driver confirmed acceptance on device.";

  return {
    location,
    locationCoords: coords,
    details,
  };
}

function resolveStepLocation(
  candidates: Array<string | null | undefined>,
  fallback: string,
): string {
  for (const c of candidates) {
    const t = (c ?? "").trim();
    if (t) return t;
  }
  return fallback;
}

/** Last fully completed manifest step (0–4). Matches driver control / Manifest Pulse. */
export function getManifestCurrentStepIndex(
  trip: Pick<TripRow, "status" | "completed_at" | "started_at">,
): number {
  const s = String(trip.status ?? "").toLowerCase();
  if (
    ["completed", "delivered", "done", "at_drop"].includes(s) ||
    !!trip.completed_at
  ) {
    return MANIFEST_LAST_INDEX;
  }
  if (s === "in_transit") return 3;
  if (["in_progress", "picked_up", "pickup"].includes(s)) return 2;
  if (s === "assigned") return 1;
  if (s === "pending_acceptance" || s === "draft") return 0;
  return 0;
}

/** Completed + current manifest steps only (no future stages). */
export function getVisibleManifestJourneyLogs(
  logs: ManifestJourneyLogEntry[],
  currentStepIndex: number,
): ManifestJourneyLogEntry[] {
  if (logs.length === 0) return [];
  const end = Math.min(
    Math.max(0, currentStepIndex) + 1,
    logs.length,
  );
  return logs.slice(0, end);
}

export function buildManifestJourneyLogs(input: {
  trip: TripRow;
  assignmentAuditRows: TripAssignmentAuditRow[];
  driverLocationAddress?: string | null;
  driverLocation?: {
    latitude: number;
    longitude: number;
    recorded_at?: string | null;
  } | null;
  locationPings?: ManifestLocationPing[];
  simLogs?: ManifestSimLogEntry[];
  simLocationByKey?: Record<string, string>;
  locationLoadingLabel?: string;
}): ManifestJourneyLogEntry[] {
  const tr = input.trip;
  const simLogs = input.simLogs ?? [];
  const simLocationByKey = input.simLocationByKey ?? {};
  const pings = input.locationPings ?? [];
  const loadingLabel = input.locationLoadingLabel ?? "Resolving driver location…";
  const audits = input.assignmentAuditRows;
  const statusLc = (tr.status ?? "").toLowerCase();

  const assignedAtIso: string | null = (() => {
    if (audits.length > 0) {
      const sorted = [...audits].sort(
        (a, b) =>
          new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
      );
      const did = tr.driver_id;
      if (did) {
        const forCurrentDriver = [...sorted]
          .reverse()
          .find((r) => r.driver_id_new === did);
        if (forCurrentDriver?.changed_at) return forCurrentDriver.changed_at;
      }
      return sorted[0]?.changed_at ?? null;
    }
    if (tr.driver_id) return tr.updated_at ?? tr.created_at ?? null;
    return null;
  })();

  const driverAcceptedAtIso: string | null = (() => {
    if (statusLc === "pending_acceptance" || statusLc === "draft") return null;
    if (
      tr.status_updated_role === "driver" ||
      Number(tr.status_revision ?? 0) > 0
    ) {
      return tr.updated_at ?? tr.started_at ?? assignedAtIso ?? null;
    }
    if (
      [
        "assigned",
        "in_progress",
        "picked_up",
        "pickup",
        "in_transit",
        "at_drop",
        "completed",
        "delivered",
        "done",
      ].includes(statusLc)
    ) {
      return tr.updated_at ?? assignedAtIso ?? tr.created_at ?? null;
    }
    return null;
  })();

  const latestDriverLabel =
    input.driverLocationAddress?.trim() ||
    (input.driverLocation
      ? locationFromPing(
          [
            {
              recorded_at:
                input.driverLocation.recorded_at ?? new Date().toISOString(),
              latitude: input.driverLocation.latitude,
              longitude: input.driverLocation.longitude,
              locationName: null,
            },
          ],
          input.driverLocation.recorded_at ?? null,
          24 * 60 * 60 * 1000,
        )
      : null);

  const acceptPing = pickPingForDriverAcceptance(pings, driverAcceptedAtIso);
  const acceptGeocodeLabel =
    input.driverLocation &&
    isNearIso(
      input.driverLocation.recorded_at,
      driverAcceptedAtIso,
      30 * 60 * 1000,
    )
      ? input.driverLocationAddress?.trim() || null
      : null;

  const assignedSim = pickLatestSim(simLogs, ["pending_acceptance", "assigned"]);
  const pickupSim = pickLatestSim(simLogs, ["in_progress", "picked_up", "pickup"]);
  const transitSim = pickLatestSim(simLogs, ["in_transit"]);
  const deliveredSim = pickLatestSim(simLogs, [
    "at_drop",
    "completed",
    "delivered",
    "done",
  ]);

  const steps: ManifestJourneyLogEntry[] = [
    {
      stepKey: "assigned",
      status: "Assigned",
      atIso: assignedAtIso,
      time: assignedAtIso ? formatTime(assignedAtIso) : "—",
      location: resolveStepLocation(
        [
          locationFromSim(assignedSim, simLocationByKey),
          locationFromPing(pings, assignedAtIso),
          tr.pickup_area,
        ],
        "Origin hub",
      ),
      details: "Trip assigned and prepared for dispatch.",
    },
    (() => {
      const pending =
        statusLc === "pending_acceptance" || statusLc === "draft";
      const acceptLoc = pending
        ? {
            location:
              statusLc === "pending_acceptance"
                ? "Awaiting driver on device"
                : "Assignment is still being prepared",
            locationCoords: null as string | null,
            details:
              statusLc === "pending_acceptance"
                ? "Driver has been invited; acceptance pending on device."
                : "Assignment is still being prepared.",
          }
        : formatDriverAcceptanceLocation({
            ping: acceptPing,
            sim: assignedSim,
            simLocationByKey,
            geocodeLabel: acceptGeocodeLabel ?? latestDriverLabel,
            fallback: "Driver location pending",
          });
      return {
        stepKey: "driver_accepted" as const,
        status: "Driver Accepted",
        atIso: driverAcceptedAtIso,
        time: driverAcceptedAtIso ? formatTime(driverAcceptedAtIso) : "—",
        location: acceptLoc.location,
        locationCoords: acceptLoc.locationCoords,
        details: acceptLoc.details,
      };
    })(),
    {
      stepKey: "pickup",
      status: "Pickup",
      atIso: tr.started_at ?? pickupSim?.timestamp ?? null,
      time: tr.started_at
        ? formatTime(tr.started_at)
        : pickupSim?.timestamp
          ? formatTime(pickupSim.timestamp)
          : "—",
      location: resolveStepLocation(
        [
          locationFromSim(pickupSim, simLocationByKey),
          locationFromPing(pings, tr.started_at ?? pickupSim?.timestamp ?? null),
          latestDriverLabel,
          tr.pickup_area,
        ],
        "Pickup point",
      ),
      details: "Pickup verification completed and movement initiated.",
    },
    {
      stepKey: "in_transit",
      status: "In-Transit",
      atIso:
        transitSim?.timestamp ??
        input.driverLocation?.recorded_at ??
        tr.started_at ??
        tr.updated_at ??
        null,
      time: (() => {
        const iso =
          transitSim?.timestamp ??
          input.driverLocation?.recorded_at ??
          tr.started_at;
        return iso ? formatTime(iso) : "—";
      })(),
      location: resolveStepLocation(
        [
          locationFromSim(transitSim, simLocationByKey),
          locationFromPing(
            pings,
            transitSim?.timestamp ??
              input.driverLocation?.recorded_at ??
              tr.started_at ??
              null,
          ),
          latestDriverLabel,
          input.driverLocation && !input.driverLocationAddress?.trim()
            ? loadingLabel
            : null,
        ],
        "Route in progress",
      ),
      details: latestDriverLabel
        ? `Last known position: ${latestDriverLabel}.`
        : pings.length > 0
          ? `${pings.length} GPS ping${pings.length === 1 ? "" : "s"} on this trip.`
          : "Vehicle moving towards destination.",
    },
    {
      stepKey: "delivered",
      status: "Delivered",
      atIso: tr.completed_at ?? deliveredSim?.timestamp ?? null,
      time: tr.completed_at
        ? formatTime(tr.completed_at)
        : deliveredSim?.timestamp
          ? formatTime(deliveredSim.timestamp)
          : "—",
      location: resolveStepLocation(
        [
          locationFromSim(deliveredSim, simLocationByKey),
          locationFromPing(
            pings,
            tr.completed_at ?? deliveredSim?.timestamp ?? null,
          ),
          tr.drop_location,
        ],
        "Destination",
      ),
      details: "Delivery completed and settlement flow closed.",
    },
  ];

  return steps;
}

export function manifestStepIndexForLog(
  stepKey: ManifestJourneyStepKey,
): number {
  const map: Record<ManifestJourneyStepKey, number> = {
    assigned: 0,
    driver_accepted: 1,
    pickup: 2,
    in_transit: 3,
    delivered: 4,
  };
  return map[stepKey];
}

export function manifestSimLogsForStepIndex(
  stepIndex: number,
  simLogs: ManifestSimLogEntry[],
): ManifestSimLogEntry[] {
  const stepStatusMap: Record<number, string[]> = {
    0: ["pending_acceptance", "assigned"],
    1: ["assigned"],
    2: ["in_progress", "picked_up", "pickup"],
    3: ["in_transit"],
    4: ["at_drop", "completed", "delivered", "done"],
  };
  const statuses = stepStatusMap[stepIndex] ?? [];
  return simLogs.filter((e) => statuses.includes(e.status));
}
