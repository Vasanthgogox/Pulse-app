import { extractCityFromLocationLabel } from "@/features/trips/utils/driverLastPingDisplay.util";
import type { TripMessageRow } from "../types/chat.types";
import { mergeMessageMetadataForEventPayload } from "./eventPayloadMerge.util";
import {
  parseMessageLocationData,
  parseSystemLogLocationData,
  type SystemLogLocationData,
} from "./locationLogPayload.util";

export type LocationPingTripHint = {
  pickupArea?: string | null;
  dropLocation?: string | null;
  status?: string | null;
};

function eventPayload(row: Partial<TripMessageRow>): Record<string, unknown> | null {
  const m = mergeMessageMetadataForEventPayload(row);
  const ep = m?.event_payload;
  if (!ep || typeof ep !== "object" || Array.isArray(ep)) return null;
  return ep as Record<string, unknown>;
}

/** True when the row is a driver location ping (not a trip status broadcast). */
export function isLocationPingMessage(row: Partial<TripMessageRow>): boolean {
  const mt = row.message_type;
  if (mt === "tracking") return parseMessageLocationData(row) !== null;

  if (
    mt === "system_log" ||
    mt === "system" ||
    mt === "update" ||
    mt === "location_log"
  ) {
    const ep = eventPayload(row);
    if (ep?.location_ping === true) return true;
    if (ep?.new_status != null && String(ep.new_status).trim() !== "") return false;
    if ((row.metadata as { trip_status_broadcast?: string } | null)?.trip_status_broadcast === "1") {
      return false;
    }
    return parseSystemLogLocationData(row) !== null;
  }
  return false;
}

export function isSimulatedLocationPing(row: Partial<TripMessageRow>): boolean {
  const ep = eventPayload(row);
  if (ep?.simulated === true) return true;
  const body = (row.content ?? "").toLowerCase();
  return body.includes("simulated");
}

export function isSimulatedSystemMessage(row: Partial<TripMessageRow>): boolean {
  const ep = eventPayload(row);
  if (ep?.simulated === true) return true;
  const body = (row.content ?? "").toLowerCase();
  return body.includes("simulated");
}

function tripHintCity(hint?: LocationPingTripHint): string | null {
  if (!hint) return null;
  const status = (hint.status ?? "").trim().toLowerCase();
  const drop = (hint.dropLocation ?? "").trim();
  const pickup = (hint.pickupArea ?? "").trim();
  if (status === "at_drop" || status === "completed" || status === "delivered") {
    return drop || pickup || null;
  }
  if (
    status === "picked_up" ||
    status === "in_transit" ||
    status === "in_progress"
  ) {
    return pickup || drop || null;
  }
  return pickup || drop || null;
}

/** Resolve a human city/area label — never lat/long. */
export function resolveLocationCityLabel(
  location: SystemLogLocationData | null,
  messageContent?: string | null,
  tripHint?: LocationPingTripHint,
): string {
  const addr = (location?.address_name ?? "").trim();
  if (addr) {
    const city = extractCityFromLocationLabel(addr);
    if (city) return city;
    if (addr.includes(",")) return addr;
    return addr;
  }

  const content = (messageContent ?? "").trim();
  const emDash = content.match(/[—–]\s*(.+?)\.?\s*$/);
  if (emDash?.[1]) return emDash[1].trim();
  const hyphen = content.match(/-\s*(.+?)\.?\s*$/);
  if (hyphen?.[1] && !hyphen[1].includes("UTC")) return hyphen[1].trim();

  const fromTrip = tripHintCity(tripHint);
  if (fromTrip) return fromTrip;

  return "En route";
}

export function buildLocationPingTitle(
  cityLabel: string,
  simulated: boolean,
  consolidatedCount?: number,
): string {
  if (typeof consolidatedCount === "number" && consolidatedCount > 1) {
    const base = `${consolidatedCount} driver location updates — last near ${cityLabel}`;
    return simulated ? `${base} (simulated)` : base;
  }
  const base = `Driver location update — ${cityLabel}`;
  return simulated ? `${base} (simulated)` : `${base}.`;
}

/** Split reverse-geocode label into area/road vs city/state for card sub-lines. */
export function resolveLocationPlaceAndCity(
  location: SystemLogLocationData | null,
  messageContent?: string | null,
  tripHint?: LocationPingTripHint,
): { place: string | null; city: string } {
  const city = resolveLocationCityLabel(location, messageContent, tripHint);
  const addr = (location?.address_name ?? "").trim();
  if (!addr) return { place: null, city };

  const parts = addr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const cityFromAddr = extractCityFromLocationLabel(addr);

  if (parts.length >= 3) {
    const stateOrCity = cityFromAddr || city;
    const stateIdx = parts.findIndex(
      (p) => p.toLowerCase() === stateOrCity.toLowerCase(),
    );
    if (stateIdx > 0) {
      return {
        place: parts.slice(0, stateIdx).join(", "),
        city: parts[stateIdx] || city,
      };
    }
    const placeParts = parts.slice(0, -2);
    return {
      place: placeParts.length > 0 ? placeParts.join(", ") : parts[0],
      city: cityFromAddr || city,
    };
  }

  if (parts.length === 2) {
    return { place: parts[0], city: parts[1] || city };
  }

  if (addr.toLowerCase() !== city.toLowerCase()) {
    return { place: addr, city };
  }

  return { place: null, city };
}

/** Short clock label for location ping cards (IST). */
export function formatLocationCaptureClock(
  recordedAt: string | null | undefined,
  messageCreatedAt: string,
): string {
  const raw = (recordedAt ?? "").trim() || messageCreatedAt;
  try {
    return new Date(raw).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return raw.slice(11, 16) || raw.slice(0, 5);
  }
}

export function buildLocationPingCardCopy(params: {
  location: SystemLogLocationData | null;
  message: Pick<TripMessageRow, "content" | "created_at">;
  simulated?: boolean;
  consolidatedCount?: number;
  tripHint?: LocationPingTripHint;
}): {
  title: string;
  subLine: string;
  captureClock: string;
} {
  const { place, city } = resolveLocationPlaceAndCity(
    params.location,
    params.message.content,
    params.tripHint,
  );
  const captureClock = formatLocationCaptureClock(
    params.location?.recorded_at,
    params.message.created_at,
  );
  const simulated = params.simulated === true;
  const consolidatedCount = params.consolidatedCount;

  let title = "Driver location update";
  if (typeof consolidatedCount === "number" && consolidatedCount > 1) {
    title = `${consolidatedCount} driver location updates`;
  } else if (simulated) {
    title = "Driver location update (simulated)";
  }

  let subLine = city;
  if (place && place.toLowerCase() !== city.toLowerCase()) {
    subLine = `${place} · ${city}`;
  } else if (
    typeof consolidatedCount === "number" &&
    consolidatedCount > 1
  ) {
    subLine = `Last near ${city}`;
  }

  return { title, subLine, captureClock };
}

export function buildLocationPingPreviewText(
  cityLabel: string,
  simulated: boolean,
  consolidatedCount?: number,
): string {
  if (typeof consolidatedCount === "number" && consolidatedCount > 1) {
    const base = `📍 ${consolidatedCount} location updates near ${cityLabel}`;
    return simulated ? `${base} (simulated)` : base;
  }
  const base = `📍 Driver near ${cityLabel}`;
  return simulated ? `${base} (simulated)` : base;
}
