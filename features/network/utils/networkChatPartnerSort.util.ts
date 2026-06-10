import type { IntegratedChat } from "@/features/chat/contexts/IntegratedChatContext";
import type { NetworkPartner } from "@/features/chat/types/chat.types";
import type { NetworkChatPartner } from "@/features/network/components/desktop/NetworkDesktopChatFlexPanel";

export type NetworkChatPartnerRecommendation = NetworkChatPartner & {
  unreadCount: number;
  lastActivity: string;
  lastPreview: string;
  lastActivityTs: number;
};

export function mergeNetworkChatPartners(
  fromConnections: NetworkChatPartner[],
  fromChat: NetworkPartner[],
): NetworkChatPartner[] {
  const map = new Map<string, NetworkChatPartner>();
  for (const p of fromConnections) {
    if (p.orgId) map.set(p.orgId, p);
  }
  for (const p of fromChat) {
    if (!p.org_id || map.has(p.org_id)) continue;
    map.set(p.org_id, {
      orgId: p.org_id,
      name: p.name,
      logoUrl: p.logo_url ?? null,
      avatarSeed: p.avatar_seed ?? null,
    });
  }
  return Array.from(map.values());
}

/** WhatsApp-style: unread conversations first, then most recent activity. */
export function sortNetworkChatPartnerRecommendations(
  partners: NetworkChatPartner[],
  chats: IntegratedChat[],
): NetworkChatPartnerRecommendation[] {
  const chatByPartner = new Map(chats.map((c) => [c.partnerId, c]));

  const enriched = partners.map((partner) => {
    const chat = chatByPartner.get(partner.orgId);
    const lastMsg = chat?.messages[chat.messages.length - 1];
    const lastActivityTs = lastMsg?.timestamp
      ? new Date(lastMsg.timestamp).getTime()
      : 0;

    return {
      ...partner,
      unreadCount: chat?.unreadCount ?? 0,
      lastActivity: chat?.lastActivity ?? "",
      lastPreview: lastMsg?.content?.trim() ?? "",
      lastActivityTs: Number.isFinite(lastActivityTs) ? lastActivityTs : 0,
    };
  });

  return enriched.sort((a, b) => {
    const aUnread = a.unreadCount > 0 ? 1 : 0;
    const bUnread = b.unreadCount > 0 ? 1 : 0;
    if (bUnread !== aUnread) return bUnread - aUnread;
    if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
    if (b.lastActivityTs !== a.lastActivityTs) return b.lastActivityTs - a.lastActivityTs;
    return a.name.localeCompare(b.name);
  });
}
