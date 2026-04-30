import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/lib/supabase";
import * as chatService from "../services/chat.service";
import type {
  ConversationPartyType,
  MessageType,
  TripConversation,
  TripMessageRow,
} from "../types/chat.types";

export type { ConversationPartyType, MessageType, TripConversation, TripMessageRow };

// ── Quick message templates by party type ────────────────────────────────────

export const QUICK_MESSAGES: Record<ConversationPartyType, string[]> = {
  client: [
    "Your trip has been confirmed. The vehicle is en route.",
    "Driver has departed for pickup.",
    "Pickup completed. Delivery is in progress.",
    "Delivery completed successfully. Please confirm receipt.",
    "Please share the consignee contact details.",
    "We need your approval to proceed.",
  ],
  supplier: [
    "Please confirm driver and vehicle assignment.",
    "Trip has been assigned — driver must report by scheduled time.",
    "Rate confirmed as discussed. Kindly acknowledge.",
    "Please ensure all documents are ready before dispatch.",
    "Driver has been dispatched. Tracking is active.",
    "Kindly update the driver's current location.",
  ],
  driver: [
    "Please confirm your current location.",
    "Proceed to the pickup point immediately.",
    "Loading is authorized. Collect all documents.",
    "Deliver to the consignee and collect POD.",
    "OTP verification required — share your code.",
    "Contact the client at the drop location for directions.",
  ],
};

// ── Context types ─────────────────────────────────────────────────────────────

export interface InitiateConversationParams {
  tripId: string;
  tripNumber: string;
  pickupArea: string;
  dropLocation: string;
  partyType: ConversationPartyType;
  partyName: string;
  partyId: string;
}

interface TripChatContextType {
  organizationId: string | null;
  conversations: TripConversation[];
  isLoading: boolean;
  sendMessage: (
    conversationId: string,
    content: string,
    messageType?: MessageType
  ) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
  getTotalUnreadCount: () => number;
  refreshConversations: () => Promise<void>;
  /** Creates (or returns existing) conversation. Returns conversation id. */
  initiateConversation: (params: InitiateConversationParams) => Promise<string | null>;
}

const TripChatContext = createContext<TripChatContextType | undefined>(undefined);

export function useTripChat() {
  const ctx = useContext(TripChatContext);
  if (!ctx) throw new Error("useTripChat must be used within a TripChatProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TripChatProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const orgCtx = useOptionalOrganization();
  const organizationId = orgCtx?.currentOrganization?.id ?? null;

  const [conversations, setConversations] = useState<TripConversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    try {
      const data = await chatService.getConversationsByOrganization(organizationId);
      setConversations(data);
    } catch {
      // Tables may not exist yet; fail silently.
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Realtime subscription — react to new messages in this org's conversations
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase()
      .channel(`trip_messages:org:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trip_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const newMsg = payload.new as TripMessageRow;
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== newMsg.conversation_id) return conv;
              const alreadyExists = conv.messages.some((m) => m.id === newMsg.id);
              if (alreadyExists) return conv;
              return {
                ...conv,
                messages: [...conv.messages, newMsg],
                last_message_at: newMsg.created_at,
                last_message_preview: newMsg.content.slice(0, 120),
                unread_dispatcher_count:
                  newMsg.sender_role !== "dispatcher"
                    ? conv.unread_dispatcher_count + 1
                    : conv.unread_dispatcher_count,
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase().removeChannel(channel);
    };
  }, [organizationId]);

  const sendMessage = useCallback(
    async (conversationId: string, content: string, messageType: MessageType = "text") => {
      if (!organizationId || !profile) return;

      const senderName =
        (profile as any).full_name ||
        (profile as any).displayName ||
        "Dispatcher";

      // Optimistic insert
      const optimisticMsg: TripMessageRow = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        organization_id: organizationId,
        sender_user_id: (profile as any).uid ?? null,
        sender_role: "dispatcher",
        sender_name: senderName,
        content,
        message_type: messageType,
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
        const persisted = await chatService.sendChatMessage({
          conversationId,
          organizationId,
          content,
          senderRole: "dispatcher",
          senderName,
          senderUserId: (profile as any).uid ?? null,
          messageType,
        });

        // Replace optimistic message with the persisted one
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
      } catch {
        // Remove optimistic message on failure
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId
              ? { ...conv, messages: conv.messages.filter((m) => m.id !== optimisticMsg.id) }
              : conv
          )
        );
      }
    },
    [organizationId, profile]
  );

  const markAsRead = useCallback(async (conversationId: string) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === conversationId
          ? { ...conv, unread_dispatcher_count: 0 }
          : conv
      )
    );
    try {
      await chatService.markConversationRead(conversationId);
    } catch {
      // Non-critical; local state already updated.
    }
  }, []);

  const getTotalUnreadCount = useCallback(
    () => conversations.reduce((sum, c) => sum + c.unread_dispatcher_count, 0),
    [conversations]
  );

  const initiateConversation = useCallback(
    async (params: InitiateConversationParams): Promise<string | null> => {
      if (!organizationId) return null;
      try {
        const conv = await chatService.getOrCreateConversation({
          tripId: params.tripId,
          partyType: params.partyType,
          partyName: params.partyName,
          organizationId,
          partyId: params.partyId,
        });

        setConversations((prev) => {
          if (prev.find((c) => c.id === conv.id)) return prev;
          const newConv: TripConversation = {
            ...conv,
            trip_number: params.tripNumber,
            pickup_area: params.pickupArea,
            drop_location: params.dropLocation,
            messages: [],
          };
          return [newConv, ...prev];
        });

        return conv.id;
      } catch {
        return null;
      }
    },
    [organizationId]
  );

  return (
    <TripChatContext.Provider
      value={{
        organizationId,
        conversations,
        isLoading,
        sendMessage,
        markAsRead,
        getTotalUnreadCount,
        refreshConversations: loadConversations,
        initiateConversation,
      }}
    >
      {children}
    </TripChatContext.Provider>
  );
}
