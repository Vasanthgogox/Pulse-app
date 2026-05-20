import type { TripMessageRow } from "../types/chat.types";
import { LONG_HAUL_STANDARD_PINGS } from "@/features/driver/utils/long_haul_heartbeat.util";

type StreamRow = TripMessageRow & { partyType?: string };

/**
 * Count completed long-haul checkpoints from merged stream (location_log + heartbeat system_log).
 * Capped at {@link LONG_HAUL_STANDARD_PINGS} (12).
 */
export function countLongHaulPingsFromStream(eventStream: ReadonlyArray<StreamRow>): number {
  let n = 0;
  for (const e of eventStream) {
    const mt = String(e.message_type ?? "");
    if (mt === "location_log") {
      n++;
    } else if (mt === "system_log") {
      const meta = e.metadata as Record<string, unknown> | null | undefined;
      const ep =
        meta?.event_payload && typeof meta.event_payload === "object" && !Array.isArray(meta.event_payload)
          ? (meta.event_payload as Record<string, unknown>)
          : null;
      if (ep?.location_data && typeof ep.location_data === "object") n++;
    }
    if (n >= LONG_HAUL_STANDARD_PINGS) return LONG_HAUL_STANDARD_PINGS;
  }
  return n;
}
