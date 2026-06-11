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
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import type { TripForCompose } from "../services/chat.service";
import { resolveSystemUpdateDriverAvatar } from "../utils/chatAvatar.util";

export interface ChatLocationSystemCardProps {
  message: TripMessageRow;
  location: SystemLogLocationData | null;
  isMobile?: boolean;
  consolidatedCount?: number;
  tripHint?: LocationPingTripHint;
  composeTrip?: Pick<TripForCompose, "driver_id" | "driver_display_name"> | null;
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
  composeTrip,
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
  const statusLabel = simulated ? "SIMULATED LOCATION" : "DRIVER LOCATION";
  const metaLine = `${dateUpper} · ${statusLabel}`;
  const driverAvatar = resolveSystemUpdateDriverAvatar(message, { composeTrip });
  const avatarSeed =
    driverAvatar?.displayName?.trim() ||
    composeTrip?.driver_display_name?.trim() ||
    "Trip Update";

  return (
    <TripProgressEventCard
      avatarSeed={avatarSeed}
      avatarIdentity={driverAvatar}
      kicker="SYSTEM UPDATE"
      title={title}
      metaLine={metaLine}
      rightPrimary="NEW"
      rightPrimaryColor={CHAT_ACCENT}
      time={displayTime}
    />
  );
}
