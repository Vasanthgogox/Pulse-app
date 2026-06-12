/**
 * Phase 3: conversation-scoped legacy `trip_messages` INSERT stream.
 *
 * Replaces org-wide INSERT fan-out for the one open trip lane thread.
 * Read-receipt UPDATEs stay on the org-wide ack channel in TripChatProvider.
 */
import { useEffect } from "react";

import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";

import {
  getActiveTripMessageConversationId,
  useActiveTripMessageConversationId,
} from "../realtime/activeTripMessageScope";
import { useChatStore } from "../store/useChatStore";
import type { TripMessageRow } from "../types/chat.types";

export function useActiveTripLaneRealtime(
  organizationId: string | null,
  selfUid: string | null,
  isActive: boolean,
) {
  const activeConversationId = useActiveTripMessageConversationId();

  useEffect(() => {
    if (!organizationId || !selfUid || !activeConversationId) return;

    return subscribeSharedPostgresChanges(
      `trip_messages:conv:${activeConversationId}`,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "trip_messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
      ],
      (payload) => {
        if (payload.eventType !== "INSERT") return;
        const row = payload.new as Partial<TripMessageRow> | null;
        if (!row?.conversation_id) return;
        if (row.sender_user_id && row.sender_user_id === selfUid) return;

        const mode: "active" | "background" = isActive ? "active" : "background";
        const activeCid = getActiveTripMessageConversationId();
        const hubListOnly = activeCid !== row.conversation_id;
        useChatStore.getState().processIncomingEvent(row, mode, { hubListOnly });
      },
    );
  }, [organizationId, selfUid, activeConversationId, isActive]);
}
