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
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import { subscribeTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
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

export interface InitiateDriverConversationParams {
  tripId: string;
  /** Fleet org that owns the trip (`trips.organization_id`) — required for supplier views too */
  fleetOrganizationId: string;
  driverId: string;
  driverDisplayName: string;
  tripNumber: string;
  pickupArea: string;
  dropLocation: string;
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
  /** Loads one thread by id and merges into state (deep links when list omits it). */
  hydrateConversationById: (conversationId: string) => Promise<TripConversation | null>;
  /** Creates (or returns existing) conversation. Returns conversation id. */
  initiateConversation: (params: InitiateConversationParams) => Promise<string | null>;
  /**
   * Opens the driver ↔ fleet thread for a trip using the trip's owning org id.
   * Use from Trip Details so suppliers and fleet see the same conversation as Command Hub.
   */
  initiateDriverConversationForTrip: (
    params: InitiateDriverConversationParams
  ) => Promise<string | null>;
}

const TripChatContext = createContext<TripChatContextType | undefined>(undefined);

export function useTripChat() {
  const ctx = useContext(TripChatContext);
  if (!ctx) throw new Error("useTripChat must be used within a TripChatProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TripChatProvider({
  children,
  isActive = true,
}: {
  children: ReactNode;
  isActive?: boolean;
}) {
  const { profile } = useAuth();
  const orgCtx = useOptionalOrganization();
  const organizationId = orgCtx?.currentOrganization?.id ?? null;

  const [conversations, setConversations] = useState<TripConversation[]>([]);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const loadConversationsRef = useRef<() => Promise<void>>(async () => {});
  const hydrateConversationByIdRef = useRef<(conversationId: string) => Promise<TripConversation | null>>(
    async () => null
  );
  const missingConvHydrateAtRef = useRef<Record<string, number>>({});
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
  loadConversationsRef.current = loadConversations;

  // Initial load
  useEffect(() => {
    if (!isActive) return;
    loadConversations();
  }, [isActive, loadConversations]);

  // Refetch when ledger (or anything) signals new trip chat rows — survives missing realtime publication
  useEffect(() => {
    if (!isActive) return;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const unsub = subscribeTripChatMessagesChanged(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void loadConversations();
      }, 200);
    });
    return () => {
      unsub();
      clearTimeout(debounceTimer);
    };
  }, [isActive, loadConversations]);

  // Lightweight always-on realtime: keep unread badges/live indicators fresh even when chat screen is hidden.
  useEffect(() => {
    if (!organizationId) return;
    return subscribeSharedPostgresChanges(
      `trip_messages:org:${organizationId}`,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "trip_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        if (isActive) return; // focused screen uses the heavy sync effect below
        const row = payload.new as Partial<TripMessageRow> | null;
        const conversationId = row?.conversation_id;
        if (!conversationId) return;

        const selfUid = (profile as { uid?: string } | null)?.uid ?? null;
        if (selfUid && row?.sender_user_id && row.sender_user_id === selfUid) return;

        let found = false;
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== conversationId) return conv;
            found = true;
            return {
              ...conv,
              unread_dispatcher_count: (conv.unread_dispatcher_count ?? 0) + 1,
              last_message_at: row?.created_at ?? conv.last_message_at,
              last_message_preview:
                typeof row?.content === "string" && row.content.trim().length > 0
                  ? row.content.slice(0, 120)
                  : conv.last_message_preview,
            };
          })
        );

        if (!found) {
          const now = Date.now();
          const last = missingConvHydrateAtRef.current[conversationId] ?? 0;
          if (now - last > 10_000) {
            missingConvHydrateAtRef.current[conversationId] = now;
            void hydrateConversationByIdRef.current(conversationId);
          }
        }
      }
    );
  }, [organizationId, isActive, profile]);

  // Focused-screen realtime sync: full refresh while user is actively in chat.
  useEffect(() => {
    if (!isActive || !organizationId) return;
    return subscribeSharedPostgresChanges(
      `trip_messages:org:${organizationId}`,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "trip_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      () => {
        void loadConversationsRef.current();
      }
    );
  }, [isActive, organizationId]);

  const sendMessage = useCallback(
    async (conversationId: string, content: string, messageType: MessageType = "text") => {
      if (!organizationId || !profile) return;

      const conv = conversationsRef.current.find((c) => c.id === conversationId);
      const messageOrgId = conv?.organization_id ?? organizationId;
      const senderRole: TripMessageRow["sender_role"] =
        conv && conv.organization_id !== organizationId ? "supplier" : "dispatcher";

      const senderName =
        (profile as any).full_name ||
        (profile as any).displayName ||
        (senderRole === "supplier" ? "Supplier" : "Dispatcher");

      // Optimistic insert
      const optimisticMsg: TripMessageRow = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        organization_id: messageOrgId,
        sender_user_id: (profile as any).uid ?? null,
        sender_role: senderRole,
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
          senderRole,
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

  const initiateDriverConversationForTrip = useCallback(
    async (params: InitiateDriverConversationParams): Promise<string | null> => {
      const fleetOrg = params.fleetOrganizationId?.trim();
      const driverId = params.driverId?.trim();
      if (!fleetOrg || !driverId) return null;
      try {
        const conv = await chatService.getOrCreateConversation({
          tripId: params.tripId,
          partyType: "driver",
          partyName: params.driverDisplayName.trim() || "Driver",
          organizationId: fleetOrg,
          partyId: driverId,
        });
        await loadConversations();
        return conv.id;
      } catch {
        return null;
      }
    },
    [loadConversations]
  );

  const hydrateConversationById = useCallback(
    async (conversationId: string): Promise<TripConversation | null> => {
      try {
        const conv = await chatService.getTripConversationById(conversationId);
        if (!conv) return null;
        setConversations((prev) => {
          if (prev.some((c) => c.id === conv.id)) {
            return prev.map((c) =>
              c.id === conv.id ? { ...c, ...conv, messages: conv.messages } : c
            );
          }
          return [conv, ...prev];
        });
        return conv;
      } catch {
        return null;
      }
    },
    []
  );
  hydrateConversationByIdRef.current = hydrateConversationById;

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
        hydrateConversationById,
        initiateConversation,
        initiateDriverConversationForTrip,
      }}
    >
      {children}
    </TripChatContext.Provider>
  );
}
