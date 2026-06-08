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
