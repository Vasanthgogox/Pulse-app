import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverChatConversationsQuery } from '@/features/chat/hooks/useDriverChatConversationsQuery';
import { driverChatConversationsQueryKey } from '@/features/chat/hooks/useDriverChatConversationsQuery';
import { useDriverHomeDriversQuery } from '@/lib/queries/useDriverHomeDriversQuery';
import * as tripsService from '@/features/trips/services/trips.service';
import * as chatService from '@/features/chat/services/chat.service';
import type {
  TripConversation,
  TripConversationRow,
  TripMessageRow,
} from '@/features/chat/types/chat.types';
import type { TripRow } from '@/features/trips/services/trips.service';
import { notifyTripChatMessagesChanged } from '@/lib/tripChatInvalidate';
import {
  appendDriverChatMessageToCache,
  driverChatMessagesQueryKey,
  removeDriverChatMessageFromCache,
  replaceDriverChatMessageInCache,
} from '@/features/chat/utils/driverChatMessageCache.util';
import type { InfiniteData } from '@tanstack/react-query';
import type { DriverChatMessagesPage } from '@/features/chat/utils/driverChatMessageCache.util';
import { useQueryClient } from '@tanstack/react-query';

function buildMinimalDriverTripConversation(
  trip: TripRow,
  row: TripConversationRow,
): TripConversation {
  const perDriver = trip.driver_display_trip_id?.trim();
  return {
    ...row,
    trip_number: perDriver || trip.trip_number || '',
    pickup_area: trip.pickup_area ?? '',
    drop_location: trip.drop_location ?? '',
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
  ensureDriverTripConversation: (tripId: string) => Promise<string | null>;
}

const DriverChatContext = createContext<DriverChatContextType | undefined>(undefined);

export function useDriverChat() {
  const ctx = useContext(DriverChatContext);
  if (!ctx) throw new Error('useDriverChat must be used within a DriverChatProvider');
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
  const uid = (profile as { uid?: string })?.uid ?? null;
  const queryClient = useQueryClient();

  const markReadTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingMarkReadRef = useRef<Set<string>>(new Set());

  const { driverIds, driverIdsKey } = useDriverHomeDriversQuery(isActive ? uid : null);

  const {
    conversations,
    isLoading,
    refreshConversations: refetchConversations,
  } = useDriverChatConversationsQuery(isActive ? driverIds : []);

  const patchConversationListPreview = useCallback(
    (conversationId: string, preview: string, at: string) => {
      if (!driverIdsKey) return;
      queryClient.setQueryData<TripConversation[]>(
        driverChatConversationsQueryKey(driverIdsKey),
        (old) =>
          (old ?? []).map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  last_message_at: at,
                  last_message_preview: preview.slice(0, 120),
                }
              : c,
          ),
      );
    },
    [driverIdsKey, queryClient],
  );

  const ensureDriverTripConversation = useCallback(
    async (tripId: string): Promise<string | null> => {
      const id = String(tripId ?? '').trim();
      if (!id || !uid) return null;

      let resolvedDriverIds = driverIds;
      if (!resolvedDriverIds.length) {
        const { drivers } = await getLinkedDriversForCurrentUser(uid);
        resolvedDriverIds = drivers.map((d) => d.id);
        if (resolvedDriverIds.length) setDriverIds(resolvedDriverIds);
      }
      if (!resolvedDriverIds.length) return null;

      const { error, trip } = await tripsService.getTripById(id);
      if (error || !trip?.driver_id || !trip.organization_id) return null;
      const assignedDriverId = String(trip.driver_id);
      if (!resolvedDriverIds.some((d) => String(d) === assignedDriverId)) return null;

      const partyName =
        (profile as { full_name?: string; displayName?: string })?.full_name ||
        (profile as { displayName?: string })?.displayName ||
        'Driver';

      let created: TripConversationRow;
      try {
        created = await chatService.getOrCreateConversation({
          tripId: trip.id,
          partyType: 'driver',
          partyName,
          organizationId: trip.organization_id,
          partyId: trip.driver_id,
        });
      } catch {
        return null;
      }

      const minimal = buildMinimalDriverTripConversation(trip, created);
      queryClient.setQueryData<TripConversation[]>(
        driverChatConversationsQueryKey(
          [...resolvedDriverIds].sort().join(','),
        ),
        (old) => {
          const list = old ?? [];
          if (list.some((c) => c.id === minimal.id)) {
            return list.map((c) => (c.id === minimal.id ? { ...c, ...minimal } : c));
          }
          return [minimal, ...list];
        },
      );

      void refetchConversations();
      return created.id;
    },
    [driverIds, profile, uid, queryClient, refetchConversations],
  );

  const sendMessage = useCallback(
    async (conversationId: string, organizationId: string, content: string) => {
      if (!uid) return;
      const senderName =
        (profile as { full_name?: string; displayName?: string })?.full_name ||
        (profile as { displayName?: string })?.displayName ||
        'Driver';

      const optimisticMsg: TripMessageRow = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        organization_id: organizationId,
        sender_user_id: uid,
        sender_role: 'driver',
        sender_name: senderName,
        content,
        message_type: 'text',
        is_read: true,
        read_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const msgKey = driverChatMessagesQueryKey(conversationId);
      queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(msgKey, (old) =>
        appendDriverChatMessageToCache(old, optimisticMsg),
      );
      patchConversationListPreview(
        conversationId,
        content,
        optimisticMsg.created_at ?? new Date().toISOString(),
      );

      try {
        const persisted = await chatService.sendDriverChatMessage({
          conversationId,
          organizationId,
          content,
          senderName,
          senderUserId: uid,
        });
        queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(msgKey, (old) =>
          replaceDriverChatMessageInCache(old, optimisticMsg.id, persisted),
        );
        patchConversationListPreview(
          conversationId,
          content,
          persisted.created_at ?? optimisticMsg.created_at ?? new Date().toISOString(),
        );
        notifyTripChatMessagesChanged();
      } catch {
        queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(msgKey, (old) =>
          removeDriverChatMessageFromCache(old, optimisticMsg.id),
        );
      }
    },
    [uid, profile, queryClient, patchConversationListPreview],
  );

  const markAsRead = useCallback(
    async (conversationId: string) => {
      if (!driverIdsKey) return;
      queryClient.setQueryData<TripConversation[]>(
        driverChatConversationsQueryKey(driverIdsKey),
        (old) =>
          (old ?? []).map((c) =>
            c.id === conversationId ? { ...c, unread_dispatcher_count: 0 } : c,
          ),
      );
      pendingMarkReadRef.current.add(conversationId);
      const existing = markReadTimerRef.current.get(conversationId);
      if (existing) clearTimeout(existing);
      markReadTimerRef.current.set(
        conversationId,
        setTimeout(() => {
          markReadTimerRef.current.delete(conversationId);
          pendingMarkReadRef.current.delete(conversationId);
          void chatService.markConversationRead(conversationId).catch(() => {});
        }, 2000),
      );
    },
    [driverIdsKey, queryClient],
  );

  useEffect(
    () => () => {
      markReadTimerRef.current.forEach((t) => clearTimeout(t));
      markReadTimerRef.current.clear();
      const pending = Array.from(pendingMarkReadRef.current);
      pendingMarkReadRef.current.clear();
      for (const id of pending) {
        void chatService.markConversationRead(id).catch(() => {});
      }
    },
    [],
  );

  const getTotalUnreadCount = useCallback(
    () => conversations.reduce((sum, c) => sum + (c.unread_dispatcher_count ?? 0), 0),
    [conversations],
  );

  const refreshConversations = useCallback(async () => {
    const result = await refetchConversations();
    return result.data ?? [];
  }, [refetchConversations]);

  const value = useMemo(
    (): DriverChatContextType => ({
      conversations,
      driverIds,
      isLoading,
      sendMessage,
      markAsRead,
      getTotalUnreadCount,
      refreshConversations,
      ensureDriverTripConversation,
    }),
    [
      conversations,
      driverIds,
      isLoading,
      sendMessage,
      markAsRead,
      getTotalUnreadCount,
      refreshConversations,
      ensureDriverTripConversation,
    ],
  );

  return (
    <DriverChatContext.Provider value={value}>{children}</DriverChatContext.Provider>
  );
}
