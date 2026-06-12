/**
 * Trip room action_card — renders through the legacy lane UI (SystemEventCard,
 * ledger rows, location cards) while keeping platform `chat_messages` backend.
 */
import React, { useMemo } from "react";
import { useRouter } from "expo-router";

import type { TripForCompose } from "../services/chat.service";
import type { ChatPlatformMessageRow } from "../types/chatPlatform.types";
import { platformActionCardToTripMessage } from "../utils/tripRoomLegacyMessage.util";
import { parseMessageLocationData } from "../utils/locationLogPayload.util";
import { handleTripChatRoomAction } from "../utils/tripChatRoomActions.util";
import { ledgerEventInvolvesOrg } from "../utils/ledgerVisibility.util";
import {
  buildChatRouteContextLabel,
  ChatLedgerEventCard,
  ChatSystemEventCard,
} from "./ChatEventCard";
import { ChatLocationSystemCard } from "./ChatLocationSystemCard";
import { SystemEventCard } from "./SystemEventCard";
import type { SystemUpdateDriverContext } from "@/features/chat/utils/chatAvatar.util";

export interface TripChatRoomActionCardProps {
  message: ChatPlatformMessageRow;
  tripId: string;
  currentOrgId?: string | null;
  composeTrip?: TripForCompose | null;
  driverProfiles?: SystemUpdateDriverContext["driverProfiles"];
  tripHint?: {
    pickupArea?: string | null;
    dropLocation?: string | null;
    status?: string | null;
  };
  onClose?: () => void;
}

export function TripChatRoomActionCard({
  message,
  tripId,
  currentOrgId,
  composeTrip,
  driverProfiles,
  tripHint,
  onClose,
}: TripChatRoomActionCardProps) {
  const router = useRouter();

  const legacy = useMemo(
    () => platformActionCardToTripMessage(message),
    [message],
  );

  const routeContext = useMemo(
    () =>
      buildChatRouteContextLabel(
        tripHint?.pickupArea ?? composeTrip?.pickup_area ?? null,
        tripHint?.dropLocation ?? composeTrip?.drop_location ?? null,
      ),
    [tripHint, composeTrip],
  );

  const openLedger = () => {
    handleTripChatRoomAction("view_ledger", message, {
      tripId,
      router,
      onClose,
    });
  };

  const m = legacy;

  if (m.message_type === "tracking") {
    const trackLoc = parseMessageLocationData(m);
    if (trackLoc) {
      return (
        <ChatLocationSystemCard
          message={m}
          location={trackLoc}
          isMobile
          tripHint={{
            pickupArea: tripHint?.pickupArea ?? composeTrip?.pickup_area,
            dropLocation: tripHint?.dropLocation ?? composeTrip?.drop_location,
            status: tripHint?.status ?? composeTrip?.status ?? null,
          }}
          composeTrip={composeTrip}
          conversationDriverId={composeTrip?.driver_id ?? null}
        />
      );
    }
  }

  if (m.message_type === "status_change" || m.message_type === "image") {
    return (
      <SystemEventCard
        message={m}
        isMobile
        routeContext={routeContext}
        composeTrip={composeTrip}
        currentOrgId={currentOrgId ?? undefined}
      />
    );
  }

  if (m.message_type === "assignment_update") {
    return (
      <ChatSystemEventCard
        message={m}
        isMobile
        routeContext={routeContext}
        composeTrip={composeTrip}
        driverProfiles={driverProfiles}
      />
    );
  }

  if (
    m.message_type === "system" ||
    m.message_type === "update" ||
    m.message_type === "system_log" ||
    m.message_type === "location_log"
  ) {
    const locData = parseMessageLocationData(m);
    if (locData) {
      return (
        <ChatLocationSystemCard
          message={m}
          location={locData}
          isMobile
          tripHint={{
            pickupArea: tripHint?.pickupArea ?? composeTrip?.pickup_area,
            dropLocation: tripHint?.dropLocation ?? composeTrip?.drop_location,
            status: tripHint?.status ?? composeTrip?.status ?? null,
          }}
          composeTrip={composeTrip}
          conversationDriverId={composeTrip?.driver_id ?? null}
        />
      );
    }
    return (
      <SystemEventCard
        message={m}
        isMobile
        routeContext={routeContext}
        composeTrip={composeTrip}
      />
    );
  }

  if (
    m.message_type === "ledger_event" ||
    m.message_type === "ledger" ||
    m.message_type === "payment" ||
    m.message_type === "ledger_update"
  ) {
    if (!currentOrgId || !ledgerEventInvolvesOrg(m, currentOrgId)) return null;
    return (
      <ChatLedgerEventCard
        message={m}
        currentOrgId={currentOrgId}
        onAddToBook={openLedger}
        onDispute={openLedger}
        isMobile
        hideLedgerActions={false}
      />
    );
  }

  if (m.message_type === "document_share") {
    return (
      <SystemEventCard
        message={m}
        isMobile
        routeContext={routeContext}
        composeTrip={composeTrip}
      />
    );
  }

  return (
    <SystemEventCard
      message={m}
      isMobile
      routeContext={routeContext}
      composeTrip={composeTrip}
    />
  );
}
