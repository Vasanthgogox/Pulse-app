import type { TripMessageRow } from "../types/chat.types";
import { mergeMessageMetadataForEventPayload } from "./eventPayloadMerge.util";

/** `system_log` / `event_payload.location_data` shape (driver cycle or heartbeat). */
export interface SystemLogLocationData {
  lat: number;
  lng: number;
  address_name?: string | null;
  odometer_km?: number | null;
  recorded_at?: string | null;
}

export function parseSystemLogLocationData(row: Partial<TripMessageRow>): SystemLogLocationData | null {
  const mt = row.message_type;
  if (mt !== "system_log" && mt !== "system" && mt !== "update" && mt !== "location_log") return null;
  const m = mergeMessageMetadataForEventPayload(row);
  if (!m) return null;
  const ep = m.event_payload as Record<string, unknown> | undefined;
  const ld = ep?.location_data;
  if (!ld || typeof ld !== "object" || Array.isArray(ld)) return null;
  const lat = Number((ld as { lat?: unknown }).lat);
  const lng = Number((ld as { lng?: unknown }).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address_name =
    typeof (ld as { address_name?: unknown }).address_name === "string"
      ? String((ld as { address_name: string }).address_name).trim() || null
      : null;
  const odoRaw = (ld as { odometer_km?: unknown }).odometer_km;
  const odometer_km =
    odoRaw != null && Number.isFinite(Number(odoRaw)) ? Number(odoRaw) : null;
  const recRaw = (ld as { recorded_at?: unknown }).recorded_at;
  const recorded_at =
    typeof recRaw === "string" && recRaw.trim() ? recRaw.trim() : null;
  return { lat, lng, address_name, odometer_km, recorded_at };
}
