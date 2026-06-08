import React from "react";
import type { TripMessageRow } from "../types/chat.types";
import type { SystemLogLocationData } from "../utils/locationLogPayload.util";
import {
  buildLocationPingTitle,
  isSimulatedLocationPing,
  resolveLocationCityLabel,
  type LocationPingTripHint,
} from "../utils/locationPingChatDisplay.util";
import { formatTripEventSheetDate, TripProgressEventCard } from "./ChatEventCard";

const LOCATION_PILL_COLOR = "#047857";

export interface ChatLocationSystemCardProps {
  message: TripMessageRow;
  location: SystemLogLocationData | null;
  isMobile?: boolean;
  consolidatedCount?: number;
  tripHint?: LocationPingTripHint;
}

/**
 * System-update style card for driver location pings — city label only, no map tiles.
 */
export function ChatLocationSystemCard({
  message,
  location,
  isMobile = false,
  consolidatedCount,
  tripHint,
}: ChatLocationSystemCardProps) {
  const simulated = isSimulatedLocationPing(message);
  const cityLabel = resolveLocationCityLabel(
    location,
    message.content,
    tripHint,
  );
  const title = buildLocationPingTitle(cityLabel, simulated, consolidatedCount);

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const dateUpper = formatTripEventSheetDate(message.created_at);
  const metaLine = `System update · ${dateUpper} · ${simulated ? "Simulated location" : "Driver location"}`;

  return (
    <TripProgressEventCard
      avatarSeed="Trip Update"
      avatarDotColor={LOCATION_PILL_COLOR}
      title={title}
      metaLine={metaLine}
      subLine={null}
      rightPrimary="LOCATION"
      rightPrimaryColor={LOCATION_PILL_COLOR}
      time={displayTime}
      isMobile={isMobile}
    />
  );
}
