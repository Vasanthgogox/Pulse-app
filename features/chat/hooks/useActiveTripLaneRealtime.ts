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

        // Skip own messages only when an optimistic entry is still in the stream
        // for this conversation — replaceOptimistic will reconcile it.
        // If no optimistic exists (RPC failed → removeMessage already ran), we must
        // process the Realtime INSERT so the persisted message reaches the UI.
        if (row.sender_user_id && row.sender_user_id === selfUid) {
          const { trips, convToTrip } = useChatStore.getState();
          const tripId = convToTrip[row.conversation_id];
          const entry = tripId ? trips[tripId] : null;
          const hasOptimistic = entry?.event_stream.some(
            (e) =>
              String(e.id).startsWith("optimistic-") &&
              e.conversation_id === row.conversation_id,
          );
          if (__DEV__) {
            console.log(
              `[CHAT:REALTIME] own INSERT conv=${row.conversation_id} id=${row.id} hasOptimistic=${hasOptimistic}`,
            );
          }
          if (hasOptimistic) return;
        }

        const mode: "active" | "background" = isActive ? "active" : "background";
        const activeCid = getActiveTripMessageConversationId();
        const hubListOnly = activeCid !== row.conversation_id;
        useChatStore.getState().processIncomingEvent(row, mode, { hubListOnly });
      },
    );
  }, [organizationId, selfUid, activeConversationId, isActive]);
}
