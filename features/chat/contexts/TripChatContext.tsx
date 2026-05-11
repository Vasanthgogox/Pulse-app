import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import { supabase } from "@/lib/supabase";
import * as chatService from "../services/chat.service";
import { useConversations, useTotalUnreadCount } from "../store/chatStore";
import { registerMarkMessagesSeenRpc, useChatStore } from "../store/useChatStore";
import type {
  ConversationPartyType,
  MessageType,
  TripConversation,
  TripMessageRow,
  TripMeta,
} from "../types/chat.types";

export type {
  ConversationPartyType,
  MessageType,
  TripConversation,
  TripMessageRow,
  TripMeta,
};

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
  totalUnreadCount: number;
  getTotalUnreadCount: () => number;
  refreshConversations: () => Promise<void>;
  /**
   * Deep-link helper: returns the conversation from the store if present, or
   * fetches it via getTripConversationById and upserts it.
   */
  hydrateConversationById: (conversationId: string) => Promise<TripConversation | null>;
  /** Optimistically changes trip status + notifies all trip conversations via RPC. */
  changeTripStatus: (tripId: string, newStatus: string) => Promise<boolean>;
  initiateConversation: (params: InitiateConversationParams) => Promise<string | null>;
  initiateDriverConversationForTrip: (
    params: InitiateDriverConversationParams
  ) => Promise<string | null>;
  /** Persist the active party type for a trip to the store. */
  switchParty: (tripId: string, partyType: ConversationPartyType) => void;
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
  const selfUid = profile?.uid ?? null;
  const orgCtx = useOptionalOrganization();
  const organizationId = orgCtx?.currentOrganization?.id ?? null;

  // ── State from Zustand ────────────────────────────────────────────────────
  const conversations    = useConversations();
  const totalUnreadCount = useTotalUnreadCount();
  const isLoading        = useChatStore(s => s.isLoading);

  const bootstrappedOrgRef = useRef<string | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  // Queue-and-fetch: holds Realtime rows that arrived before their conversation
  // was in the store (bootstrap failure, or process_b2b_event for a new thread).
  const pendingForUnknownConv = useRef(new Map<string, Partial<TripMessageRow>[]>());

  // Batch `trip_messages` UPDATE (read/delivery ticks) into one store write per frame
  // so bursty mark_messages_seen / Realtime does not max React update depth.
  const ackBatchRef = useRef<{ convId: string; msgId: string; patch: Partial<TripMessageRow> }[]>([]);
  const ackRafRef = useRef<number | null>(null);
  const flushAckBatch = useCallback(() => {
    ackRafRef.current = null;
    const batch = ackBatchRef.current;
    ackBatchRef.current = [];
    if (batch.length === 0) return;
    useChatStore.getState().onRealtimeAckBatch(batch);
  }, []);

  // ── Bootstrap: single RPC, populates Zustand store ───────────────────────
  const loadConversations = useCallback(async () => {
    if (!organizationId || !selfUid) return;
    await useChatStore.getState().bootstrap(organizationId);
  }, [organizationId, selfUid]);

  // Clear store on logout / org switch.
  useEffect(() => {
    if (organizationId && selfUid) return;
    useChatStore.getState().clear();
    bootstrappedOrgRef.current = null;
  }, [organizationId, selfUid]);

  // Initial bootstrap: once per org.
  useEffect(() => {
    if (!organizationId || !selfUid) return;
    if (bootstrappedOrgRef.current === organizationId) return;
    bootstrappedOrgRef.current = organizationId;
    void loadConversations();
  }, [organizationId, selfUid, loadConversations]);

  // Chat bootstrap is once per org-session (`useChatStore.bootstrap` no-ops when
  // `bootstrappedOrg` matches). Updates arrive via Realtime — no periodic full
  // refetch (reduces DB load; matches WhatsApp-style cold load + patch).

  // Single mark-seen RPC path for all `useMarkSeen` instances (debounced in store).
  useEffect(() => {
    registerMarkMessagesSeenRpc((conversationId, messageIds) => {
      void supabase()
        .rpc("mark_messages_seen", {
          p_conversation_id: conversationId,
          p_message_ids: messageIds,
        })
        .then(({ error }) => {
          if (error && __DEV__) console.warn("[mark_messages_seen]", error.message);
        });
    });
    return () => registerMarkMessagesSeenRpc(null);
  }, []);

  // ── Unknown-conversation recovery ─────────────────────────────────────────
  const _enqueueUnknownConv = useCallback(
    (convId: string, row: Partial<TripMessageRow>, mode: 'active' | 'background') => {
      const queue = pendingForUnknownConv.current.get(convId) ?? [];
      queue.push(row);
      pendingForUnknownConv.current.set(convId, queue);

      if (queue.length > 1) return; // fetch already in-flight

      void chatService.getTripConversationById(convId)
        .then(conv => {
          if (conv) {
            useChatStore.getState().upsertConversation(conv);
            const queued = pendingForUnknownConv.current.get(convId) ?? [];
            pendingForUnknownConv.current.delete(convId);
            for (const qRow of queued) {
              useChatStore.getState().onRealtimeInsert(qRow, mode);
            }
          } else {
            pendingForUnknownConv.current.delete(convId);
          }
        })
        .catch(() => { pendingForUnknownConv.current.delete(convId); });
    },
    [],
  );

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId || !selfUid) return;
    const unsub = subscribeSharedPostgresChanges(
      `trip_messages:org:${organizationId}`,
      [
        {
          event:  "INSERT",
          schema: "public",
          table:  "trip_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
        {
          event:  "UPDATE",
          schema: "public",
          table:  "trip_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        // ── INSERT ──────────────────────────────────────────────────────────
        if (payload.eventType === "INSERT") {
          const row = payload.new as Partial<TripMessageRow> | null;
          if (!row?.conversation_id) return;

          // Skip echo from own sends (already optimistically inserted).
          if (row.sender_user_id && row.sender_user_id === selfUid) return;

          const mode: 'active' | 'background' = isActiveRef.current ? 'active' : 'background';
          const s = useChatStore.getState();

          if (!s.convToTrip[row.conversation_id]) {
            // Unknown conversation — fetch once and flush queued rows atomically.
            _enqueueUnknownConv(row.conversation_id, row, mode);
            return;
          }

          // onRealtimeInsert handles status_change / tracking state sync internally.
          s.onRealtimeInsert(row, mode);
        }

        // ── UPDATE (delivered / seen ticks) ─────────────────────────────────
        else if (payload.eventType === "UPDATE") {
          const row = payload.new as TripMessageRow | null;
          if (!row?.id || !row.conversation_id) return;
          const patch: Partial<TripMessageRow> = {
            is_delivered: row.is_delivered,
            delivered_at: row.delivered_at,
            is_read:      row.is_read,
            read_at:      row.read_at,
          };
          if (row.metadata != null) patch.metadata = row.metadata;
          ackBatchRef.current.push({
            convId: row.conversation_id,
            msgId:  row.id,
            patch,
          });
          if (ackRafRef.current == null) {
            ackRafRef.current = requestAnimationFrame(() => {
              flushAckBatch();
            });
          }
        }
      }
    );
    return () => {
      if (ackRafRef.current != null) {
        cancelAnimationFrame(ackRafRef.current);
        ackRafRef.current = null;
      }
      const pending = ackBatchRef.current;
      ackBatchRef.current = [];
      if (pending.length) useChatStore.getState().onRealtimeAckBatch(pending);
      unsub();
    };
  }, [organizationId, selfUid, _enqueueUnknownConv, flushAckBatch]);

  // ── sendMessage: optimistic + persist + rollback ───────────────────────────
  const sendMessage = useCallback(
    async (conversationId: string, content: string, messageType: MessageType = "text") => {
      if (!organizationId || !profile) return;

      const conv         = useChatStore.getState().getConversationByConvId(conversationId);
      const messageOrgId = conv?.organization_id ?? organizationId;
      // Always dispatch from the signed-in org user in this hub. Using `supplier` when
      // `conversation.organization_id` differed from `organizationId` made fleet messages
      // render as the counterparty (wrong bubble side).
      const senderRole: TripMessageRow["sender_role"] = "dispatcher";
      const senderName =
        (profile as any).full_name ||
        (profile as any).displayName ||
        "Dispatcher";

      const optimisticMsg: TripMessageRow = {
        id:              `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        organization_id: messageOrgId,
        sender_user_id:  (profile as any).uid ?? null,
        sender_role:     senderRole,
        sender_name:     senderName,
        content,
        message_type:    messageType,
        is_read:         false,
        read_at:         null,
        delivery_status: "sending",
        created_at:      new Date().toISOString(),
      };

      useChatStore.getState().optimisticInsert(conversationId, optimisticMsg);

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
        useChatStore.getState().replaceOptimistic(conversationId, optimisticMsg.id, persisted);
      } catch {
        useChatStore.getState().removeMessage(conversationId, optimisticMsg.id);
      }
    },
    [organizationId, profile]
  );

  // ── changeTripStatus: optimistic + atomic RPC + rollback ──────────────────
  const changeTripStatus = useCallback(
    async (tripId: string, newStatus: string): Promise<boolean> => {
      if (!organizationId || !profile) return false;

      const prevStatus = useChatStore.getState().trips[tripId]?.status ?? null;

      // Optimistic: update trip status in the store immediately.
      useChatStore.getState().applySystemUpdate(tripId, { status: newStatus });

      try {
        await chatService.changeTripStatus({
          tripId,
          organizationId,
          newStatus,
          userId:   (profile as any).uid ?? null,
          userName: (profile as any).full_name || (profile as any).displayName || "Dispatcher",
        });
        return true;
      } catch {
        // Rollback on failure.
        useChatStore.getState().applySystemUpdate(tripId, { status: prevStatus });
        return false;
      }
    },
    [organizationId, profile]
  );

  // ── markAsRead ─────────────────────────────────────────────────────────────
  const markAsRead = useCallback(async (conversationId: string) => {
    useChatStore.getState().markRead(conversationId);
  }, []);

  // ── hydrateConversationById (deep-link fallback) ───────────────────────────
  const hydrateConversationById = useCallback(
    async (conversationId: string): Promise<TripConversation | null> => {
      const existing = useChatStore.getState().getConversationByConvId(conversationId);
      if (existing) return existing;
      try {
        const conv = await chatService.getTripConversationById(conversationId);
        if (conv) {
          useChatStore.getState().upsertConversation(conv);
          return useChatStore.getState().getConversationByConvId(conversationId) ?? null;
        }
      } catch { /* silent */ }
      return null;
    },
    []
  );

  // ── Conversation management ────────────────────────────────────────────────
  const getTotalUnreadCount = useCallback(() => totalUnreadCount, [totalUnreadCount]);

  const initiateConversation = useCallback(
    async (params: InitiateConversationParams): Promise<string | null> => {
      if (!organizationId) return null;
      try {
        const conv = await chatService.getOrCreateConversation({
          tripId:         params.tripId,
          partyType:      params.partyType,
          partyName:      params.partyName,
          organizationId,
          partyId:        params.partyId,
        });
        useChatStore.getState().upsertConversation({
          ...conv,
          trip_number:   params.tripNumber,
          pickup_area:   params.pickupArea,
          drop_location: params.dropLocation,
          messages:      [],
        } as TripConversation);
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
          tripId:         params.tripId,
          partyType:      "driver",
          partyName:      params.driverDisplayName.trim() || "Driver",
          organizationId: fleetOrg,
          partyId:        driverId,
        });
        useChatStore.getState().upsertConversation({
          ...conv,
          trip_number:   params.tripNumber,
          pickup_area:   params.pickupArea,
          drop_location: params.dropLocation,
          messages:      [],
        } as TripConversation);
        return conv.id;
      } catch {
        return null;
      }
    },
    []
  );

  const switchParty = useCallback(
    (tripId: string, partyType: ConversationPartyType) => {
      useChatStore.getState().switchParty(tripId, partyType);
    },
    [],
  );

  return (
    <TripChatContext.Provider
      value={{
        organizationId,
        conversations,
        isLoading,
        sendMessage,
        markAsRead,
        totalUnreadCount,
        getTotalUnreadCount,
        refreshConversations: loadConversations,
        hydrateConversationById,
        changeTripStatus,
        initiateConversation,
        initiateDriverConversationForTrip,
        switchParty,
      }}
    >
      {children}
    </TripChatContext.Provider>
  );
}
