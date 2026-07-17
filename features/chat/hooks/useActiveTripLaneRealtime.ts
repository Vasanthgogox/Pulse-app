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
import {
  isTripLocalSendHealSuppressed,
  useChatStore,
} from "../store/useChatStore";
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
        if (!row?.conversation_id || !row.id) return;

        // Own send: replaceOptimistic owns reconciliation while local-send suppress
        // is active and an optimistic (or already-persisted) row is present. Skip the
        // duplicate INSERT to avoid a second stream write → FlatList flicker.
        // If replaceOptimistic failed (no optimistic / no persisted id), fall through.
        if (
          selfUid &&
          row.sender_user_id === selfUid &&
          isTripLocalSendHealSuppressed(row.conversation_id)
        ) {
          const state = useChatStore.getState();
          const tripId = state.convToTrip[row.conversation_id];
          const stream = tripId ? state.trips[tripId]?.event_stream : undefined;
          if (stream?.some((e) => e.id === row.id)) return;
          const content = String(row.content ?? "");
          if (
            stream?.some(
              (e) =>
                String(e.id).startsWith("optimistic-") &&
                e.conversation_id === row.conversation_id &&
                String(e.content ?? "") === content,
            )
          ) {
            return;
          }
        }

        const mode: "active" | "background" = isActive ? "active" : "background";
        const activeCid = getActiveTripMessageConversationId();
        const hubListOnly = activeCid !== row.conversation_id;
        useChatStore.getState().processIncomingEvent(row, mode, { hubListOnly });
      },
    );
  }, [organizationId, selfUid, activeConversationId, isActive]);
}
