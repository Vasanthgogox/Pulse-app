import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeSharedPostgresChanges } from "@/lib/realtimeRegistry";
import { notifyTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { getLinkedDriversForCurrentUser } from "@/features/drivers/services/drivers.service";
import * as tripsService from "@/services/tripsService";
import * as chatService from "../services/chat.service";
import type {
  TripConversation,
  TripConversationRow,
  TripMessageRow,
} from "../types/chat.types";
import type { TripRow } from "@/services/tripsService";

function buildMinimalDriverTripConversation(
  trip: TripRow,
  row: TripConversationRow,
): TripConversation {
  const perDriver = trip.driver_display_trip_id?.trim();
  return {
    ...row,
    trip_number: perDriver || trip.trip_number || "",
    pickup_area: trip.pickup_area ?? "",
    drop_location: trip.drop_location ?? "",
    messages: [],
  };
}

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

export function DriverChatProvider({
  children,
  isActive = true,
}: {
  children: ReactNode;
  isActive?: boolean;
}) {
  const { profile } = useAuth();
  const uid = (profile as any)?.uid ?? null;

  const [driverIds, setDriverIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<TripConversation[]>([]);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const loadConversationsRef = useRef<() => Promise<TripConversation[]>>(async () => []);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Resolve driver record IDs from current user
  useEffect(() => {
    if (!isActive) return;
    if (!uid) { setDriverIds([]); return; }
    getLinkedDriversForCurrentUser(uid)
      .then(({ drivers }) => setDriverIds(drivers.map((d) => d.id)))
      .catch(() => setDriverIds([]));
  }, [isActive, uid]);

  const loadConversations = useCallback(async (): Promise<TripConversation[]> => {
    if (!driverIds.length) {
      setConversations([]);
      setIsLoading(false);
      return [];
    }
    setIsLoading(true);
    try {
      const data = await chatService.getConversationsByDriverIds(driverIds);
      setConversations((prev) => {
        const byId = new Map<string, TripConversation>();
        for (const c of data) {
          byId.set(c.id, c);
        }
        for (const c of prev) {
          if (
            !byId.has(c.id) &&
            c.driver_id &&
            driverIds.includes(String(c.driver_id))
          ) {
            byId.set(c.id, c);
          }
        }
        return Array.from(byId.values()).sort((a, b) => {
          const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return tb - ta;
        });
      });
      return data;
    } catch {
      setConversations([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [driverIds]);
  loadConversationsRef.current = loadConversations;

  useEffect(() => {
    if (!isActive) return;
    void loadConversations();
  }, [isActive, loadConversations]);

  const queueRefreshConversations = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      void loadConversationsRef.current();
    }, 350);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    };
  }, []);

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
      const assignedDriverId = String(trip.driver_id);
      if (!resolvedDriverIds.some((d) => String(d) === assignedDriverId)) return null;
      const partyName =
        (profile as { full_name?: string; displayName?: string })?.full_name ||
        (profile as { displayName?: string })?.displayName ||
        "Driver";
      let created: TripConversationRow;
      try {
        created = await chatService.getOrCreateConversation({
          tripId: trip.id,
          partyType: "driver",
          partyName,
          organizationId: trip.organization_id,
          partyId: trip.driver_id,
        });
      } catch {
        return null;
      }

      // Merge immediately so the chat UI has a row even if list refetch lags or RLS differs on SELECT.
      const minimal = buildMinimalDriverTripConversation(trip, created);
      setConversations((prev) => {
        if (prev.some((c) => c.id === minimal.id)) {
          return prev.map((c) => (c.id === minimal.id ? { ...c, ...minimal } : c));
        }
        return [minimal, ...prev];
      });

      void loadConversations();
      return created.id;
    },
    [driverIds, profile, loadConversations, uid],
  );

  // Derive unique org IDs from loaded conversations so we subscribe per-org
  // instead of the entire trip_messages table (full-table WAL fanout).
  const conversationOrgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conversations) {
      if (c.organization_id) ids.add(c.organization_id);
    }
    return Array.from(ids).sort();
  }, [conversations]);
  const orgIdsKey = conversationOrgIds.join(",");

  useEffect(() => {
    if (!isActive || !uid || !orgIdsKey) return;
    const orgIds = orgIdsKey.split(",").filter(Boolean);
    const unsubs = orgIds.map((orgId) =>
      subscribeSharedPostgresChanges(
        `trip_messages:org:${orgId}`,
        [
          {
            event: "INSERT",
            schema: "public",
            table: "trip_messages",
            filter: `organization_id=eq.${orgId}`,
          },
        ],
        () => {
          queueRefreshConversations();
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [isActive, uid, orgIdsKey, queueRefreshConversations]);

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
