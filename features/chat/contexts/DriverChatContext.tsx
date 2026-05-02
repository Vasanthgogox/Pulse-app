import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { uniqueRealtimeChannelTopic } from "@/lib/realtimeTopic";
import { supabase } from "@/lib/supabase";
import { notifyTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { getLinkedDriversForCurrentUser } from "@/features/drivers/services/drivers.service";
import * as tripsService from "@/services/tripsService";
import * as chatService from "../services/chat.service";
import type { TripConversation, TripMessageRow } from "../types/chat.types";

interface DriverChatContextType {
  conversations: TripConversation[];
  driverIds: string[];
  isLoading: boolean;
  sendMessage: (conversationId: string, organizationId: string, content: string) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
  getTotalUnreadCount: () => number;
  refreshConversations: () => Promise<TripConversation[]>;
  /** Ensures the driver's 1:1 trip thread exists and reloads conversations; returns conversation id or null. */
  ensureDriverTripConversation: (tripId: string) => Promise<string | null>;
}

const DriverChatContext = createContext<DriverChatContextType | undefined>(undefined);

export function useDriverChat() {
  const ctx = useContext(DriverChatContext);
  if (!ctx) throw new Error("useDriverChat must be used within a DriverChatProvider");
  return ctx;
}

export function DriverChatProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const uid = (profile as any)?.uid ?? null;

  const [driverIds, setDriverIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<TripConversation[]>([]);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const [isLoading, setIsLoading] = useState(false);

  // Resolve driver record IDs from current user
  useEffect(() => {
    if (!uid) { setDriverIds([]); return; }
    getLinkedDriversForCurrentUser(uid)
      .then(({ drivers }) => setDriverIds(drivers.map((d) => d.id)))
      .catch(() => setDriverIds([]));
  }, [uid]);

  const loadConversations = useCallback(async (): Promise<TripConversation[]> => {
    if (!driverIds.length) {
      setConversations([]);
      setIsLoading(false);
      return [];
    }
    setIsLoading(true);
    try {
      const data = await chatService.getConversationsByDriverIds(driverIds);
      setConversations(data);
      return data;
    } catch {
      setConversations([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [driverIds]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const ensureDriverTripConversation = useCallback(
    async (tripId: string): Promise<string | null> => {
      const id = String(tripId ?? "").trim();
      if (!id || !uid) return null;
      let resolvedDriverIds = driverIds;
      if (!resolvedDriverIds.length) {
        const { drivers } = await getLinkedDriversForCurrentUser(uid);
        resolvedDriverIds = drivers.map((d) => d.id);
        if (resolvedDriverIds.length) {
          setDriverIds(resolvedDriverIds);
        }
      }
      if (!resolvedDriverIds.length) return null;
      const { error, trip } = await tripsService.getTripById(id);
      if (error || !trip?.driver_id || !trip.organization_id) return null;
      if (!resolvedDriverIds.includes(trip.driver_id)) return null;
      const partyName =
        (profile as { full_name?: string; displayName?: string })?.full_name ||
        (profile as { displayName?: string })?.displayName ||
        "Driver";
      try {
        await chatService.getOrCreateConversation({
          tripId: trip.id,
          partyType: "driver",
          partyName,
          organizationId: trip.organization_id,
          partyId: trip.driver_id,
        });
      } catch {
        return null;
      }
      const list = await loadConversations();
      const conv = list.find((c) => String(c.trip_id) === String(trip.id));
      return conv?.id ?? null;
    },
    [driverIds, profile, loadConversations, uid],
  );

  // Realtime: merge inserts for known threads; refetch if conversation not loaded yet
  useEffect(() => {
    if (!driverIds.length || !uid) return;

    const channel = supabase()
      .channel(uniqueRealtimeChannelTopic(`driver_trip_messages:${uid}`))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trip_messages",
        },
        (payload) => {
          const newMsg = payload.new as TripMessageRow;
          const known = conversationsRef.current.some((c) => c.id === newMsg.conversation_id);
          if (!known) {
            void loadConversations();
            return;
          }
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== newMsg.conversation_id) return conv;
              const alreadyExists = conv.messages.some((m) => m.id === newMsg.id);
              if (alreadyExists) return conv;
              const nextMessages = [...conv.messages, newMsg].sort(
                (a, b) =>
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              );
              return {
                ...conv,
                messages: nextMessages,
                last_message_at: newMsg.created_at,
                last_message_preview: newMsg.content.slice(0, 120),
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase().removeChannel(channel);
    };
  }, [driverIds, uid, loadConversations]);

  const sendMessage = useCallback(
    async (conversationId: string, organizationId: string, content: string) => {
      if (!uid) return;
      const senderName =
        (profile as any)?.full_name ||
        (profile as any)?.displayName ||
        "Driver";

      const optimisticMsg: TripMessageRow = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        organization_id: organizationId,
        sender_user_id: uid,
        sender_role: "driver",
        sender_name: senderName,
        content,
        message_type: "text",
        is_read: true,
        read_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? {
                ...conv,
                messages: [...conv.messages, optimisticMsg],
                last_message_at: optimisticMsg.created_at,
                last_message_preview: content.slice(0, 120),
              }
            : conv
        )
      );

      try {
        const persisted = await chatService.sendDriverChatMessage({
          conversationId,
          organizationId,
          content,
          senderName,
          senderUserId: uid,
        });
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  messages: conv.messages.map((m) =>
                    m.id === optimisticMsg.id ? persisted : m
                  ),
                }
              : conv
          )
        );
        notifyTripChatMessagesChanged();
      } catch {
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId
              ? { ...conv, messages: conv.messages.filter((m) => m.id !== optimisticMsg.id) }
              : conv
          )
        );
      }
    },
    [uid, profile]
  );

  const markAsRead = useCallback(async (conversationId: string) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId ? { ...conv, unread_dispatcher_count: 0 } : conv
      )
    );
    try {
      await chatService.markConversationRead(conversationId);
    } catch {
      // non-critical
    }
  }, []);

  const getTotalUnreadCount = useCallback(
    () => conversations.reduce((sum, c) => sum + (c.unread_dispatcher_count ?? 0), 0),
    [conversations]
  );

  return (
    <DriverChatContext.Provider
      value={{
        conversations,
        driverIds,
        isLoading,
        sendMessage,
        markAsRead,
        getTotalUnreadCount,
        refreshConversations: loadConversations,
        ensureDriverTripConversation,
      }}
    >
      {children}
    </DriverChatContext.Provider>
  );
}
