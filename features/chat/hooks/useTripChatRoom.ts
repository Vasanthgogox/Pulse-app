/**
 * Unified trip chat room — ensure room + live thread subscription.
 *
 * Combines `ensure_trip_chat_room` (participant fan-in) with
 * `useChatThreadRealtime` (conversation-scoped message stream).
 */
import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";

import { useChatThreadRealtime } from "./useChatThreadRealtime";
import {
  ensureTripChatRoom,
  getTripChatRoom,
  markChatConversationRead,
  refreshTripChatRoomTeam,
  sendPlatformChatMessage,
} from "../services/chatPlatform.service";
import type {
  ChatConversationRow,
  ChatPlatformMessageRow,
  SendChatMessageParams,
} from "../types/chatPlatform.types";

export function useTripChatRoom(tripId: string | null, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!tripId;
  const qc = useQueryClient();

  const roomQuery = useQuery({
    queryKey: queryKeys.chatPlatform.tripRoom(tripId ?? "_"),
    queryFn: async () => {
      const existing = await getTripChatRoom(tripId!);
      if (existing) return existing;
      return ensureTripChatRoom(tripId!);
    },
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const conversationId = roomQuery.data?.id ?? null;
  const threadQuery = useChatThreadRealtime(enabled ? conversationId : null);

  const openRoom = useMutation({
    mutationFn: () => ensureTripChatRoom(tripId!),
    onSuccess: (room) => {
      qc.setQueryData(queryKeys.chatPlatform.tripRoom(tripId!), room);
    },
  });

  const syncTeamMutation = useMutation({
    mutationFn: () => refreshTripChatRoomTeam(tripId!),
    onSuccess: (room) => {
      qc.setQueryData(queryKeys.chatPlatform.tripRoom(tripId!), room);
    },
  });

  const syncTeam = useCallback(() => {
    if (!tripId || syncTeamMutation.isPending) return;
    void syncTeamMutation.mutateAsync();
  }, [tripId, syncTeamMutation]);

  // Mark read when the room is open and messages are loaded.
  useEffect(() => {
    if (!conversationId || !threadQuery.data?.length) return;
    void markChatConversationRead(conversationId);
  }, [conversationId, threadQuery.data?.length]);

  const sendMessage = async (
    params: Omit<SendChatMessageParams, "conversationId">,
  ) => {
    if (!conversationId) throw new Error("Trip chat room not ready");
    return sendPlatformChatMessage({ ...params, conversationId });
  };

  return {
    room: roomQuery.data as ChatConversationRow | undefined,
    messages: (threadQuery.data ?? []) as ChatPlatformMessageRow[],
    isLoading: roomQuery.isLoading || threadQuery.isLoading,
    isError: roomQuery.isError || threadQuery.isError,
    error: roomQuery.error ?? threadQuery.error,
    refetch: () => {
      void roomQuery.refetch();
      void threadQuery.refetch();
    },
    openRoom,
    syncTeam,
    isSyncingTeam: syncTeamMutation.isPending,
    sendMessage,
    conversationId,
  };
}
