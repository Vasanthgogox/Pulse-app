/**
 * Mobile-style chat in a Metronic flex card (Network hub detail pane).
 * Scoped to integrated partners — partner picker, correct bubble alignment.
 */
import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { CHAT_MOBILE } from "@/features/chat/chatMobileLayout";
import { ChatPartyAvatar } from "@/features/chat/components/ChatPartyAvatar";
import {
  IntegratedChatProvider,
  useIntegratedChat,
  type IntegratedChat,
} from "@/features/chat/contexts/IntegratedChatContext";
import type { NetworkPartner } from "@/features/chat/types/chat.types";
import { networkDesktopChatStyles as styles } from "@/features/network/components/desktop/networkDesktopChat.styles";
import {
  mergeNetworkChatPartners,
  sortNetworkChatPartnerRecommendations,
  type NetworkChatPartnerRecommendation,
} from "@/features/network/utils/networkChatPartnerSort.util";
import {
  CheckCheck,
  ChevronLeft,
  MoreVertical,
  Search,
  Upload,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItem,
  type ViewStyle,
} from "react-native";

const CHAT_INBOX_SPLIT_MIN = 680;

export type NetworkChatPartner = {
  orgId: string;
  name: string;
  logoUrl?: string | null;
  avatarSeed?: string | null;
  role?: string;
};

export type NetworkChatJoinRequest = {
  id: string;
  name: string;
  meta: string;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  onAccept: () => void;
  onDecline: () => void;
};

type Props = {
  orgId: string;
  orgName: string;
  onClose: () => void;
  joinRequest?: NetworkChatJoinRequest | null;
  integratedPartners?: NetworkChatPartner[];
  initialPartnerOrgId?: string | null;
  /** Hide partner list when opened from a single party profile hub. */
  singlePartnerMode?: boolean;
  /** Inside floating drawer — no split-pane chrome. */
  embedded?: boolean;
};

const METRONIC_MUTED = "#A1A5B7";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function ChatBubbleRow({
  isOwn,
  content,
  timestamp,
  senderName,
  partnerAvatarUrl,
  partnerAvatarSeed,
  partnerName,
  profile,
  orgLogoUrl,
}: {
  isOwn: boolean;
  content: string;
  timestamp: string;
  senderName?: string;
  partnerAvatarUrl?: string | null;
  partnerAvatarSeed?: string | null;
  partnerName: string;
  profile: ReturnType<typeof useAuth>["profile"];
  orgLogoUrl?: string | null;
}) {
  const avatarSize = CHAT_MOBILE.avatarSize;

  return (
    <View style={[styles.bubbleRow, isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
      {!isOwn ? (
        <PartyAvatar
          name={senderName ?? partnerName}
          avatarUrl={partnerAvatarUrl}
          avatarSeed={partnerAvatarSeed}
          entityType="client"
          size={avatarSize}
        />
      ) : null}
      <View style={styles.bubbleCol}>
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
            {content}
          </Text>
        </View>
        <View style={[styles.bubbleMetaRow, isOwn && styles.bubbleMetaOwn]}>
          <Text style={styles.bubbleMeta}>
            {formatTime(timestamp)}
            {!isOwn && senderName ? ` · ${senderName}` : ""}
          </Text>
          {isOwn ? <CheckCheck size={10} color={METRONIC_MUTED} /> : null}
        </View>
      </View>
      {isOwn ? (
        <ChatPartyAvatar
          identity={{
            displayName: profile?.full_name ?? profile?.displayName ?? "You",
            entityType: "client",
          }}
          isOwnUser
          userName={profile?.full_name ?? profile?.displayName ?? "You"}
          userAvatarUrl={profile?.avatar_url ?? null}
          userAvatarSeed={profile?.avatar_seed ?? null}
          userOrgLogoUrl={orgLogoUrl ?? null}
          userOrgOwnerAvatarSeed={profile?.avatar_seed ?? null}
          size={avatarSize}
        />
      ) : null}
    </View>
  );
}

function NetworkDesktopChatFlexPanelBody({
  orgId,
  orgName,
  onClose,
  joinRequest,
  integratedPartners = [],
  initialPartnerOrgId,
  singlePartnerMode = false,
  embedded = false,
}: Props) {
  const { profile } = useAuth();
  const { currentOrganization } = useOptionalOrganization() ?? {};
  const {
    chats,
    partners,
    isLoading,
    sendMessage,
    markAsRead,
    initiateNetworkConversation,
  } = useIntegratedChat();
  const listRef = useRef<FlatList<IntegratedChat["messages"][number]>>(null);
  const [messageInput, setMessageInput] = useState("");
  const [selectedPartnerOrgId, setSelectedPartnerOrgId] = useState<string | null>(
    initialPartnerOrgId ?? null,
  );
  const attemptedPartnerRef = useRef(new Set<string>());
  const [conversationInitFailed, setConversationInitFailed] = useState(false);
  const [conversationInitBusy, setConversationInitBusy] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [inboxMobilePane, setInboxMobilePane] = useState<"list" | "thread">(
    initialPartnerOrgId ? "thread" : "list",
  );
  const { width: windowWidth } = useWindowDimensions();
  const useInboxSplit = !singlePartnerMode && windowWidth >= CHAT_INBOX_SPLIT_MIN;
  const useInboxMobileNav = !singlePartnerMode && !useInboxSplit;

  const integratedList = useMemo(
    () =>
      sortNetworkChatPartnerRecommendations(
        mergeNetworkChatPartners(integratedPartners, partners),
        chats,
      ),
    [chats, integratedPartners, partners],
  );

  useEffect(() => {
    if (initialPartnerOrgId) {
      setSelectedPartnerOrgId(initialPartnerOrgId);
      if (!singlePartnerMode) {
        setInboxMobilePane("thread");
      }
    }
  }, [initialPartnerOrgId, singlePartnerMode]);

  const filteredPartners = useMemo(() => {
    const q = partnerSearch.trim().toLowerCase();
    if (!q) return integratedList;
    return integratedList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.role?.toLowerCase().includes(q) ?? false),
    );
  }, [integratedList, partnerSearch]);

  const selectPartner = useCallback(
    (orgId: string) => {
      setSelectedPartnerOrgId(orgId);
      if (useInboxMobileNav) {
        setInboxMobilePane("thread");
      }
    },
    [useInboxMobileNav],
  );

  useEffect(() => {
    if (selectedPartnerOrgId) return;
    if (singlePartnerMode && integratedList[0]?.orgId) {
      setSelectedPartnerOrgId(integratedList[0].orgId);
      return;
    }
    if (useInboxSplit && integratedList[0]?.orgId) {
      setSelectedPartnerOrgId(integratedList[0].orgId);
    }
  }, [integratedList, selectedPartnerOrgId, singlePartnerMode, useInboxSplit]);

  const selectedPartner = useMemo(
    () => integratedList.find((p) => p.orgId === selectedPartnerOrgId) ?? null,
    [integratedList, selectedPartnerOrgId],
  );

  const activeChat = useMemo(() => {
    if (!selectedPartnerOrgId) return null;
    return chats.find((c) => c.partnerId === selectedPartnerOrgId) ?? null;
  }, [chats, selectedPartnerOrgId]);

  useEffect(() => {
    if (!selectedPartnerOrgId || activeChat) {
      setConversationInitFailed(false);
      setConversationInitBusy(false);
      return;
    }
    if (attemptedPartnerRef.current.has(selectedPartnerOrgId)) return;
    const partner = integratedList.find((p) => p.orgId === selectedPartnerOrgId);
    if (!partner) return;
    attemptedPartnerRef.current.add(selectedPartnerOrgId);
    setConversationInitBusy(true);
    setConversationInitFailed(false);
    void initiateNetworkConversation({
      org_id: partner.orgId,
      name: partner.name,
      logo_url: partner.logoUrl ?? null,
      avatar_seed: partner.avatarSeed ?? null,
    }).then((convId) => {
      setConversationInitBusy(false);
      if (!convId) {
        attemptedPartnerRef.current.delete(selectedPartnerOrgId);
        setConversationInitFailed(true);
      }
    });
  }, [activeChat, initiateNetworkConversation, integratedList, selectedPartnerOrgId]);

  useEffect(() => {
    if (activeChat?.id) {
      markAsRead(activeChat.id);
    }
  }, [activeChat?.id, markAsRead]);

  const threadTitle = selectedPartner?.name ?? activeChat?.partnerName ?? "Select partner";
  const threadSubtitle = activeChat
    ? `${activeChat.lastActivity} · Secure channel`
    : selectedPartner
      ? "Integrated on Pulse · Secure channel"
      : "Choose an integrated partner to message";

  const handleSend = useCallback(() => {
    const text = messageInput.trim();
    if (!text || !activeChat) return;
    const role =
      profile?.aggregated || profile?.asset ? ("owner" as const) : ("dispatcher" as const);
    sendMessage(activeChat.id, text, role);
    setMessageInput("");
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [activeChat, messageInput, profile?.aggregated, profile?.asset, sendMessage]);

  const renderMessage: ListRenderItem<IntegratedChat["messages"][number]> = useCallback(
    ({ item }) => {
      const isOwn = item.senderId === "dispatcher-1";
      return (
        <ChatBubbleRow
          isOwn={isOwn}
          content={item.content}
          timestamp={item.timestamp}
          senderName={isOwn ? undefined : activeChat?.partnerName}
          partnerAvatarUrl={activeChat?.partnerLogoUrl}
          partnerAvatarSeed={activeChat?.partnerAvatarSeed}
          partnerName={activeChat?.partnerName ?? threadTitle}
          profile={profile}
          orgLogoUrl={currentOrganization?.logo_url ?? null}
        />
      );
    },
    [
      activeChat?.partnerAvatarSeed,
      activeChat?.partnerLogoUrl,
      activeChat?.partnerName,
      currentOrganization?.logo_url,
      profile,
      threadTitle,
    ],
  );

  const messages = activeChat?.messages ?? [];
  const orgLogoUrl = currentOrganization?.logo_url ?? null;
  const showInboxList =
    !singlePartnerMode &&
    integratedList.length > 0 &&
    (useInboxSplit || (useInboxMobileNav && inboxMobilePane === "list"));
  const showThreadPane =
    singlePartnerMode ||
    useInboxSplit ||
    (useInboxMobileNav && inboxMobilePane === "thread");

  const renderPartnerRow = (partner: NetworkChatPartnerRecommendation) => {
    const active = partner.orgId === selectedPartnerOrgId;
    const hasUnread = partner.unreadCount > 0 && !active;
    return (
      <Pressable
        key={partner.orgId}
        onPress={() => selectPartner(partner.orgId)}
        style={({ pressed }) => [
          styles.partnerRecRow,
          active && styles.partnerRecRowActive,
          pressed && !active && styles.partnerRecRowPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${partner.name}${
          hasUnread ? `, ${partner.unreadCount} unread` : ""
        }`}
      >
        <PartyAvatar
          name={partner.name}
          avatarUrl={partner.logoUrl}
          avatarSeed={partner.avatarSeed}
          entityType="client"
          size={40}
        />
        <View style={styles.partnerRecBody}>
          <View style={styles.partnerRecTop}>
            <Text
              style={[
                styles.partnerRecName,
                active && styles.partnerRecNameActive,
                hasUnread && styles.partnerRecNameUnread,
              ]}
              numberOfLines={1}
            >
              {partner.name}
            </Text>
            {partner.lastActivity ? (
              <Text
                style={[
                  styles.partnerRecTime,
                  hasUnread && styles.partnerRecTimeUnread,
                ]}
                numberOfLines={1}
              >
                {partner.lastActivity}
              </Text>
            ) : null}
          </View>
          <Text
            style={[
              styles.partnerRecPreview,
              hasUnread && styles.partnerRecPreviewUnread,
            ]}
            numberOfLines={1}
          >
            {partner.lastPreview || "Say hello on Pulse"}
          </Text>
        </View>
        {hasUnread ? (
          <View style={styles.partnerRecBadge}>
            <Text style={styles.partnerRecBadgeText}>
              {partner.unreadCount > 9 ? "9+" : String(partner.unreadCount)}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  const renderSearchBar = () => (
    <View style={styles.inboxSearchWrap}>
      <Search size={15} color={METRONIC_MUTED} strokeWidth={2.2} />
      <TextInput
        style={styles.inboxSearchInput}
        value={partnerSearch}
        onChangeText={setPartnerSearch}
        placeholder="Search integrated partners"
        placeholderTextColor={Theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );

  const renderPartnerInbox = () => (
    <View
      style={[
        styles.inboxSidebar,
        useInboxMobileNav && styles.inboxSidebarMobile,
      ]}
    >
      {renderSearchBar()}
      <FlatList
        style={styles.inboxList}
        contentContainerStyle={styles.inboxListContent}
        data={filteredPartners}
        keyExtractor={(p) => p.orgId}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => renderPartnerRow(item)}
        ListEmptyComponent={
          <Text style={styles.inboxEmptySearch}>
            {partnerSearch.trim()
              ? "No partners match your search"
              : "No integrated partners yet"}
          </Text>
        }
      />
    </View>
  );

  const renderThreadHeader = (showBack: boolean) => (
    <View style={styles.threadHeader}>
      {showBack ? (
        <Pressable
          onPress={() => setInboxMobilePane("list")}
          style={styles.threadBackBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to chats"
        >
          <ChevronLeft size={18} color={Theme.textPrimaryDark} strokeWidth={2.2} />
        </Pressable>
      ) : null}
      <PartyAvatar
        name={threadTitle}
        avatarUrl={selectedPartner?.logoUrl ?? activeChat?.partnerLogoUrl}
        avatarSeed={selectedPartner?.avatarSeed ?? activeChat?.partnerAvatarSeed}
        entityType="client"
        size={36}
      />
      <View style={styles.threadHeaderText}>
        <View style={styles.threadTitleRow}>
          <Text style={styles.threadTitle} numberOfLines={1}>
            {threadTitle}
          </Text>
          {selectedPartner || activeChat ? (
            <View style={styles.integratedTag}>
              <Text style={styles.integratedTagText}>INTEGRATED</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.threadSubtitle} numberOfLines={1}>
          {threadSubtitle}
        </Text>
      </View>
      <Pressable hitSlop={8}>
        <MoreVertical size={16} color={METRONIC_MUTED} />
      </Pressable>
    </View>
  );

  const renderMessagesBody = () => {
    if (isLoading) {
      return (
        <View style={styles.messagesArea}>
          <ActivityIndicator color={Theme.primary} />
        </View>
      );
    }
    if (!singlePartnerMode && integratedList.length === 0) {
      return (
        <View style={styles.messagesArea}>
          <Text style={styles.emptyTitle}>No integrated partners yet</Text>
          <Text style={styles.emptySub}>
            Connect with organisations on Pulse from Your connections or Grow your
            network. Only integrated parties can use workspace chat.
          </Text>
        </View>
      );
    }
    if (!selectedPartnerOrgId) {
      return (
        <View style={styles.messagesArea}>
          <Text style={styles.emptySub}>
            Select an integrated partner from the list to start chatting.
          </Text>
        </View>
      );
    }
    if (conversationInitBusy && !activeChat) {
      return (
        <View style={styles.messagesArea}>
          <ActivityIndicator color={Theme.primary} />
          <Text style={styles.emptySub}>Opening secure channel…</Text>
        </View>
      );
    }
    if (conversationInitFailed && !activeChat) {
      return (
        <View style={styles.messagesArea}>
          <Text style={styles.emptyTitle}>Could not open chat</Text>
          <Text style={styles.emptySub}>Check your connection and try again.</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              if (!selectedPartnerOrgId) return;
              const partner = integratedList.find((p) => p.orgId === selectedPartnerOrgId);
              if (!partner) return;
              attemptedPartnerRef.current.delete(selectedPartnerOrgId);
              setConversationInitFailed(false);
              setConversationInitBusy(true);
              void initiateNetworkConversation({
                org_id: partner.orgId,
                name: partner.name,
                logo_url: partner.logoUrl ?? null,
                avatar_seed: partner.avatarSeed ?? null,
              }).then((convId) => {
                setConversationInitBusy(false);
                if (!convId) {
                  attemptedPartnerRef.current.delete(selectedPartnerOrgId);
                  setConversationInitFailed(true);
                }
              });
            }}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <FlatList
        ref={listRef}
        style={styles.messages}
        contentContainerStyle={[
          styles.messagesContent,
          messages.length === 0 && styles.messagesContentEmpty,
        ]}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          messages.length > 0 ? (
            <Text style={styles.channelHint}>Secure channel · {orgName}</Text>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.emptySub}>
            Say hello to {selectedPartner?.name ?? "your partner"}
          </Text>
        }
      />
    );
  };

  const renderJoinBar = () =>
    joinRequest ? (
      <View style={styles.joinBar}>
        <PartyAvatar
          name={joinRequest.name}
          avatarUrl={joinRequest.avatarUrl}
          avatarSeed={joinRequest.avatarSeed}
          entityType="client"
          size={36}
        />
        <View style={styles.joinTextCol}>
          <Text style={styles.joinTitle} numberOfLines={1}>
            {joinRequest.name} wants to join chat
          </Text>
          <Text style={styles.joinMeta} numberOfLines={1}>
            {joinRequest.meta}
          </Text>
        </View>
        <View style={styles.joinActions}>
          <Pressable style={styles.declineBtn} onPress={joinRequest.onDecline}>
            <Text style={styles.declineText}>Decline</Text>
          </Pressable>
          <Pressable style={styles.acceptBtn} onPress={joinRequest.onAccept}>
            <Text style={styles.acceptText}>Accept</Text>
          </Pressable>
        </View>
      </View>
    ) : null;

  const renderComposer = () => (
    <View style={styles.composer}>
      <View style={styles.composerInputWrap}>
        <ChatPartyAvatar
          identity={{
            displayName: profile?.full_name ?? profile?.displayName ?? "You",
            entityType: "client",
          }}
          isOwnUser
          userName={profile?.full_name ?? profile?.displayName ?? "You"}
          userAvatarUrl={profile?.avatar_url ?? null}
          userAvatarSeed={profile?.avatar_seed ?? null}
          userOrgLogoUrl={orgLogoUrl}
          userOrgOwnerAvatarSeed={profile?.avatar_seed ?? null}
          size={28}
        />
        <TextInput
          style={styles.composerInput}
          value={messageInput}
          onChangeText={setMessageInput}
          placeholder="Write a message..."
          placeholderTextColor={Theme.textMuted}
          multiline
          editable={Boolean(activeChat && selectedPartnerOrgId)}
          onSubmitEditing={handleSend}
        />
        <Pressable hitSlop={8} disabled={!activeChat}>
          <Upload size={16} color={METRONIC_MUTED} />
        </Pressable>
      </View>
      <Pressable
        style={[
          styles.sendBtn,
          (!messageInput.trim() || !activeChat) && styles.sendBtnDisabled,
          Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null,
        ]}
        onPress={handleSend}
        disabled={!messageInput.trim() || !activeChat}
      >
        <Text style={styles.sendText}>Send</Text>
      </Pressable>
    </View>
  );

  const renderThreadPane = () => (
    <View style={styles.inboxThreadColumn}>
      {renderThreadHeader(useInboxMobileNav)}
      {renderMessagesBody()}
      {renderJoinBar()}
      {renderComposer()}
    </View>
  );

  const topBarTitle = singlePartnerMode ? threadTitle : "Chats";

  return (
    <View style={[styles.mobileCard, embedded && styles.mobileCardEmbedded]}>
      <View style={styles.topBar}>
        <Text style={[styles.topBarTitle, { flex: 1 }]} numberOfLines={1}>
          {topBarTitle}
        </Text>
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close chat"
        >
          <X size={16} color={Theme.textPrimaryDark} />
        </Pressable>
      </View>

      {useInboxSplit ? (
        <View style={styles.splitRoot}>
          {showInboxList ? renderPartnerInbox() : null}
          {showThreadPane ? renderThreadPane() : null}
        </View>
      ) : showInboxList ? (
        renderPartnerInbox()
      ) : showThreadPane ? (
        renderThreadPane()
      ) : null}
    </View>
  );
}

export function NetworkDesktopChatFlexPanel({ embedded = false, ...props }: Props) {
  const body = (
    <IntegratedChatProvider isActive>
      <NetworkDesktopChatFlexPanelBody {...props} embedded={embedded} />
    </IntegratedChatProvider>
  );
  if (embedded) return body;
  return <View style={styles.flexPane}>{body}</View>;
}
