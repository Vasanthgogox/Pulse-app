import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/lib/supabase";
import * as chatService from "../services/chat.service";
import type { NetworkConversation, NetworkMessageRow, NetworkPartner } from "../types/chat.types";

export type { NetworkConversation, NetworkPartner };

// ── Backward-compatible shape for ChatScreen ──────────────────────────────────

export interface DirectMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface IntegratedChat {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerRole: "dispatcher" | "owner";
  organization: string;
  isOnline: boolean;
  messages: DirectMessage[];
  lastActivity: string;
  unreadCount: number;
}

export const INTEGRATED_QUICK_MESSAGES = [
  "Do you have availability this week?",
  "What vehicles do you have free?",
  "Can we discuss rates?",
  "Please share your updated rate card.",
  "I have a new requirement.",
  "Let's schedule a call.",
];

// ── Context type ──────────────────────────────────────────────────────────────

interface IntegratedChatContextType {
  chats: IntegratedChat[];
  partners: NetworkPartner[];
  isLoading: boolean;
  sendMessage: (chatId: string, content: string, viewerRole: "dispatcher" | "owner") => void;
  markAsRead: (chatId: string) => void;
  getUnreadCount: (chatId: string) => number;
  getTotalUnreadCount: () => number;
  initiateNetworkConversation: (partner: NetworkPartner) => Promise<string | null>;
}

const IntegratedChatContext = createContext<IntegratedChatContextType | undefined>(undefined);

export function useIntegratedChat() {
  const ctx = useContext(IntegratedChatContext);
  if (!ctx) throw new Error("useIntegratedChat must be used within an IntegratedChatProvider");
  return ctx;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function toIntegratedChat(conv: NetworkConversation, currentOrgId: string): IntegratedChat {
  return {
    id: conv.id,
    partnerId: conv.partner_org_id,
    partnerName: conv.partner_name,
    partnerRole: "owner",
    organization: conv.partner_name,
    isOnline: false,
    messages: conv.messages.map((m) => ({
      id: m.id,
      senderId: m.sender_org_id === currentOrgId ? "dispatcher-1" : "partner-1",
      content: m.content,
      timestamp: m.created_at,
      isRead: m.is_read_by_other,
    })),
    lastActivity: conv.last_message_at ? formatRelativeTime(conv.last_message_at) : "No messages",
    unreadCount: conv.unread_count,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function IntegratedChatProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const orgName = currentOrganization?.name ?? "My Organization";

  const [conversations, setConversations] = useState<NetworkConversation[]>([]);
  const [partners, setPartners] = useState<NetworkPartner[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    try {
      const [convs, pts] = await Promise.all([
        chatService.getNetworkConversationsByOrg(orgId),
        chatService.getIntegratedPartners(orgId),
      ]);
      setConversations(convs);
      setPartners(pts);
    } catch {
      // Fail silently — tables may not be migrated yet
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime: new network messages
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase()
      .channel(`network_messages:org:${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "network_messages" },
        (payload) => {
          const newMsg = payload.new as NetworkMessageRow;
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.id !== newMsg.conversation_id) return conv;
              if (conv.messages.some((m) => m.id === newMsg.id)) return conv;
              return {
                ...conv,
                messages: [...conv.messages, newMsg],
                last_message_at: newMsg.created_at,
                last_message_preview: newMsg.content.slice(0, 120),
                unread_count:
                  newMsg.sender_org_id !== orgId ? conv.unread_count + 1 : conv.unread_count,
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      supabase().removeChannel(channel);
    };
  }, [orgId]);

  const chats: IntegratedChat[] = orgId
    ? conversations.map((c) => toIntegratedChat(c, orgId))
    : [];

  const sendMessage = useCallback(
    (chatId: string, content: string, _viewerRole: "dispatcher" | "owner") => {
      if (!orgId || !profile) return;

      const senderName =
        (profile as any).full_name || (profile as any).displayName || orgName;

      const optimisticMsg: NetworkMessageRow = {
        id: `optimistic-${Date.now()}`,
        conversation_id: chatId,
        sender_org_id: orgId,
        sender_user_id: (profile as any).uid ?? null,
        sender_name: senderName,
        content,
        is_read_by_other: false,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === chatId
            ? {
                ...conv,
                messages: [...conv.messages, optimisticMsg],
                last_message_at: optimisticMsg.created_at,
                last_message_preview: content.slice(0, 120),
              }
            : conv
        )
      );

      chatService
        .sendNetworkMessage({
          conversationId: chatId,
          senderOrgId: orgId,
          senderUserId: (profile as any).uid ?? null,
          senderName,
          content,
        })
        .then((persisted) => {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === chatId
                ? {
                    ...conv,
                    messages: conv.messages.map((m) =>
                      m.id === optimisticMsg.id ? persisted : m
                    ),
                  }
                : conv
            )
          );
        })
        .catch(() => {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === chatId
                ? { ...conv, messages: conv.messages.filter((m) => m.id !== optimisticMsg.id) }
                : conv
            )
          );
        });
    },
    [orgId, orgName, profile]
  );

  const markAsRead = useCallback(
    (chatId: string) => {
      if (!orgId) return;
      setConversations((prev) =>
        prev.map((conv) => (conv.id === chatId ? { ...conv, unread_count: 0 } : conv))
      );
      chatService.markNetworkConversationRead(chatId, orgId).catch(() => {});
    },
    [orgId]
  );

  const getUnreadCount = useCallback(
    (chatId: string) => conversations.find((c) => c.id === chatId)?.unread_count ?? 0,
    [conversations]
  );

  const getTotalUnreadCount = useCallback(
    () => conversations.reduce((sum, c) => sum + c.unread_count, 0),
    [conversations]
  );

  const initiateNetworkConversation = useCallback(
    async (partner: NetworkPartner): Promise<string | null> => {
      if (!orgId) return null;
      try {
        const conv = await chatService.getOrCreateNetworkConversation({
          orgId,
          orgName,
          partnerOrgId: partner.org_id,
          partnerOrgName: partner.name,
        });

        setConversations((prev) => {
          if (prev.find((c) => c.id === conv.id)) return prev;
          const newConv: NetworkConversation = {
            ...conv,
            partner_org_id: partner.org_id === conv.org_a_id ? conv.org_b_id : conv.org_a_id,
            partner_name: partner.name,
            unread_count: 0,
            messages: [],
          };
          return [newConv, ...prev];
        });

        return conv.id;
      } catch {
        return null;
      }
    },
    [orgId, orgName]
  );

  return (
    <IntegratedChatContext.Provider
      value={{
        chats,
        partners,
        isLoading,
        sendMessage,
        markAsRead,
        getUnreadCount,
        getTotalUnreadCount,
        initiateNetworkConversation,
      }}
    >
      {children}
    </IntegratedChatContext.Provider>
  );
}
