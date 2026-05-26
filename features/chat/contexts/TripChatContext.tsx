import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import { setTripUnreadCount } from "@/lib/chatUnreadSignal";
import { supabase } from "@/lib/supabase";
import { getActiveTripMessageConversationId } from "../realtime/activeTripMessageScope";
import * as chatService from "../services/chat.service";
import { useConversations, useTotalUnreadCount } from "../store/chatStore";
import {
  clearReadReceiptDebouncerForConversation,
  pruneModuleLevelDedupeState,
  registerMarkMessagesSeenRpc,
  useChatStore,
} from "../store/useChatStore";
import { tripHasPendingOrgFeedback } from "../utils/tripFeedbackPending.util";
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
  /** Marks every party-lane thread for this trip read (DB + store). */
  markTripThreadsRead: (tripId: string) => Promise<void>;
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
  /**
   * Read-only: whether the current org still owes an in-chat debrief for this trip
   * (`PartyConv.feedbackStatus` from bootstrap / Realtime — no RPC).
   */
  tripHasPendingFeedback: (tripId: string) => boolean;
}

const TripChatContext = createContext<TripChatContextType | undefined>(undefined);

export function useOptionalTripChat() {
  return useContext(TripChatContext);
}

export function useTripChat() {
  const ctx = useOptionalTripChat();
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

  // Collect host-org IDs where the viewer is a linked supplier/client.
  // These are orgs whose conversations appear in the store but belong to a
  // different org than the viewer's own org (e.g. Deepak's org for nihas).
  const linkedOrgIdsStr = useChatStore(s => {
    if (!organizationId) return '';
    const ids = new Set<string>();
    for (const entry of Object.values(s.trips)) {
      for (const party of Object.values(entry.parties)) {
        const orgId = party?.organizationId;
        if (orgId && orgId !== organizationId) ids.add(orgId);
      }
    }
    return [...ids].sort().join(',');
  });
  const linkedOrgIds = useMemo(
    () => (linkedOrgIdsStr ? linkedOrgIdsStr.split(',').filter(Boolean) : []),
    [linkedOrgIdsStr],
  );

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
              const hubListOnly =
                getActiveTripMessageConversationId() !== qRow.conversation_id;
              useChatStore.getState().processIncomingEvent(qRow, mode, { hubListOnly });
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

          const activeCid = getActiveTripMessageConversationId();
          const hubListOnly = activeCid !== row.conversation_id;

          // onRealtimeInsert handles status_change / tracking state sync internally.
          s.processIncomingEvent(row, mode, { hubListOnly });
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

  // ── Realtime: trip_conversations (DB denormalized unread + last preview) ─────
  useEffect(() => {
    if (!organizationId || !selfUid) return;
    const unsub = subscribeSharedPostgresChanges(
      `trip_conversations:org:${organizationId}`,
      [
        {
          event: "INSERT",
          schema: "public",
          table: "trip_conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        {
          event: "UPDATE",
          schema: "public",
          table: "trip_conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
      ],
      (payload) => {
        const row = payload.new as Record<string, unknown> | null;
        if (!row?.id || !row.trip_id) return;
        const tripId = String(row.trip_id);
        const convId = String(row.id);

        if (payload.eventType === "INSERT") {
          const trips = useChatStore.getState().trips;
          if (!trips[tripId]) {
            void chatService.getTripConversationById(convId).then((conv) => {
              if (conv) useChatStore.getState().upsertConversation(conv);
            });
            return;
          }
        }

        useChatStore.getState().patchTripConversationFromRealtime(row);
      },
    );
    return () => {
      unsub();
    };
  }, [organizationId, selfUid]);

  // ── Realtime: linked-org trip_messages (viewer is linked supplier/client) ────
  // When the viewer belongs to a supplier org (e.g. nihas / aiman logs) and views
  // a host-org trip (e.g. Deepak's TRP011), the host's messages land with
  // organization_id = host_org. The viewer's own subscription above only watches
  // their own org — so host-org messages never fire for the viewer unless we add a
  // second subscription per linked host org.
  useEffect(() => {
    if (!organizationId || !selfUid || linkedOrgIds.length === 0) return;
    const unsubs = linkedOrgIds.map(hostOrgId =>
      subscribeSharedPostgresChanges(
        `trip_messages:linked:${hostOrgId}:for:${organizationId}`,
        [
          {
            event:  "INSERT",
            schema: "public",
            table:  "trip_messages",
            filter: `organization_id=eq.${hostOrgId}`,
          },
          {
            event:  "UPDATE",
            schema: "public",
            table:  "trip_messages",
            filter: `organization_id=eq.${hostOrgId}`,
          },
        ],
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Partial<TripMessageRow> | null;
            if (!row?.conversation_id) return;
            // Skip echo from own sends.
            if (row.sender_user_id && row.sender_user_id === selfUid) return;
            const s = useChatStore.getState();
            // Only process if we have this conversation in the store.
            if (!s.convToTrip[row.conversation_id]) {
              _enqueueUnknownConv(row.conversation_id, row, isActiveRef.current ? 'active' : 'background');
              return;
            }
            const hubListOnly = getActiveTripMessageConversationId() !== row.conversation_id;
            s.processIncomingEvent(row, isActiveRef.current ? 'active' : 'background', { hubListOnly });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as TripMessageRow | null;
            if (!row?.id || !row.conversation_id) return;
            const patch: Partial<TripMessageRow> = {
              is_delivered: row.is_delivered,
              delivered_at: row.delivered_at,
              is_read:      row.is_read,
              read_at:      row.read_at,
            };
            if (row.metadata != null) patch.metadata = row.metadata;
            ackBatchRef.current.push({ convId: row.conversation_id, msgId: row.id, patch });
            if (ackRafRef.current == null) {
              ackRafRef.current = requestAnimationFrame(() => { flushAckBatch(); });
            }
          }
        },
      )
    );
    return () => { unsubs.forEach(u => u()); };
  }, [organizationId, selfUid, linkedOrgIds, _enqueueUnknownConv, flushAckBatch]);

  // ── Prune module-level dedupe Maps (prevent unbounded growth in long sessions) ─
  useEffect(() => {
    const id = setInterval(pruneModuleLevelDedupeState, 30_000);
    return () => clearInterval(id);
  }, []);

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

  // ── markAsRead / markTripThreadsRead ───────────────────────────────────────
  const markAsRead = useCallback(async (conversationId: string) => {
    clearReadReceiptDebouncerForConversation(conversationId);
    useChatStore.getState().markRead(conversationId);
    try {
      await chatService.markConversationRead(conversationId);
    } catch (e) {
      if (__DEV__) console.warn("[TripChat] markConversationRead failed", conversationId, e);
    }
  }, []);

  const markTripThreadsRead = useCallback(async (tripId: string) => {
    const tid = (tripId ?? "").trim();
    if (!tid) return;
    const { convToTrip } = useChatStore.getState();
    const convIds = Object.keys(convToTrip).filter((cid) => convToTrip[cid] === tid);
    if (convIds.length === 0) {
      if (__DEV__) console.warn("[TripChat] markTripThreadsRead: no conv ids for trip", tid);
      return;
    }
    for (const cid of convIds) {
      clearReadReceiptDebouncerForConversation(cid);
      useChatStore.getState().markRead(cid);
    }
    const settled = await Promise.allSettled(
      convIds.map((cid) => chatService.markConversationRead(cid)),
    );
    if (__DEV__) {
      settled.forEach((r, i) => {
        if (r.status === "rejected") {
          console.warn("[TripChat] markConversationRead failed", convIds[i], r.reason);
        }
      });
    }
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

  // Publish to the lightweight external signal so consumers like DemoTabBar
  // can subscribe without statically importing this context (keeps the chat
  // graph out of the startup chunk).
  useEffect(() => {
    setTripUnreadCount(totalUnreadCount);
  }, [totalUnreadCount]);

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

  const tripHasPendingFeedback = useCallback(
    (tripId: string) => {
      if (!organizationId) return false;
      return tripHasPendingOrgFeedback(useChatStore.getState().trips, tripId, organizationId);
    },
    [organizationId],
  );

  return (
    <TripChatContext.Provider
      value={{
        organizationId,
        conversations,
        isLoading,
        sendMessage,
        markAsRead,
        markTripThreadsRead,
        totalUnreadCount,
        getTotalUnreadCount,
        refreshConversations: loadConversations,
        hydrateConversationById,
        changeTripStatus,
        initiateConversation,
        initiateDriverConversationForTrip,
        switchParty,
        tripHasPendingFeedback,
      }}
    >
      {children}
    </TripChatContext.Provider>
  );
}
