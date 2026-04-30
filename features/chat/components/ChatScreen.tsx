import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Edit3,
  Filter,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Send,
  Smile,
  FileType,
  Truck,
  User,
  Users,
  X,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import Theme from "@/constants/Theme";
import {
  QUICK_MESSAGES,
  TripConversation,
  useTripChat,
} from "@/features/chat/contexts/TripChatContext";
import {
  INTEGRATED_QUICK_MESSAGES,
  IntegratedChat,
  useIntegratedChat,
  type NetworkPartner,
} from "@/features/chat/contexts/IntegratedChatContext";
import {
  getTripsForCompose,
  type TripForCompose,
} from "@/features/chat/services/chat.service";
import type { ConversationPartyType } from "../types/chat.types";

type TabId = "trips" | "network";

const QUICK_EMOJIS = ["👍", "🤝", "🚛", "📍", "✅", "📦", "⚠️", "🕒", "😊", "🙌", "📞", "💯"];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={b.wrap}>
      <Text style={b.text}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}
const b = StyleSheet.create({
  wrap: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  text: { fontSize: 10, fontWeight: "800", color: "#fff" },
});

function LetterAvatar({
  name,
  own,
  size = 36,
}: {
  name: string;
  own?: boolean;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: own ? "#0f172a" : "#efefef",
        borderWidth: 1,
        borderColor: own ? "transparent" : "#e5e7eb",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Text
        style={{
          fontSize: size * 0.33,
          fontWeight: "700",
          color: own ? "#fff" : "#4b5563",
        }}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

function PartyIcon({
  partyType,
  active,
  size = 16,
}: {
  partyType: ConversationPartyType;
  active?: boolean;
  size?: number;
}) {
  const color = active ? "#fff" : Theme.primary;
  if (partyType === "client") return <Briefcase size={size} color={color} />;
  if (partyType === "supplier") return <Truck size={size} color={color} />;
  return <User size={size} color={color} />;
}

function partyLabel(type: ConversationPartyType) {
  return type === "client" ? "CLIENT" : type === "supplier" ? "SUPPLIER" : "DRIVER";
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [activeTab, setActiveTab] = useState<TabId>("trips");
  const [isMobileDetail, setIsMobileDetail] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const messagesRef = useRef<ScrollView>(null);

  const [showEmoji, setShowEmoji] = useState(false);
  const [showScripts, setShowScripts] = useState(false);

  // Compose modal state
  const [showCompose, setShowCompose] = useState(false);
  const [composeSearch, setComposeSearch] = useState("");
  const [composeTrips, setComposeTrips] = useState<TripForCompose[]>([]);
  const [composeLoading, setComposeLoading] = useState(false);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [initiating, setInitiating] = useState(false);
  const [showNetCompose, setShowNetCompose] = useState(false);
  const [netComposeSearch, setNetComposeSearch] = useState("");

  const { organizationId, conversations, isLoading, sendMessage, markAsRead, getTotalUnreadCount, initiateConversation } =
    useTripChat();
  const {
    chats: netChats,
    partners: netPartners,
    isLoading: netLoading,
    sendMessage: sendNet,
    markAsRead: markNetRead,
    getTotalUnreadCount: netTotal,
    initiateNetworkConversation,
  } = useIntegratedChat();

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedNetId, setSelectedNetId] = useState<string | null>(null);

  const selectedConv = conversations.find((c) => c.id === selectedConvId) ?? null;
  const selectedNet = netChats.find((c) => c.id === selectedNetId) ?? null;

  const tripUnread = getTotalUnreadCount();
  const netUnread = netTotal();

  const openDetail = () => {
    if (!isDesktop) setIsMobileDetail(true);
  };

  const closeDetail = () => {
    setIsMobileDetail(false);
    setSelectedConvId(null);
    setSelectedNetId(null);
    setMessageInput("");
    setShowEmoji(false);
    setShowScripts(false);
  };

  const handleSend = async () => {
    const text = messageInput.trim();
    if (!text) return;
    setMessageInput("");
    setShowEmoji(false);
    setShowScripts(false);

    if (activeTab === "trips" && selectedConvId) {
      await sendMessage(selectedConvId, text);
      setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 80);
    } else if (activeTab === "network" && selectedNetId) {
      sendNet(selectedNetId, text, "dispatcher");
      setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  const openCompose = async () => {
    setShowCompose(true);
    setComposeSearch("");
    setExpandedTripId(null);
    if (!organizationId) return;
    setComposeLoading(true);
    try {
      const trips = await getTripsForCompose(organizationId);
      setComposeTrips(trips);
    } catch {
      setComposeTrips([]);
    } finally {
      setComposeLoading(false);
    }
  };

  const handleInitiate = async (
    trip: TripForCompose,
    partyType: ConversationPartyType,
    partyName: string,
    partyId: string
  ) => {
    setInitiating(true);
    const convId = await initiateConversation({
      tripId: trip.id,
      tripNumber: trip.display_trip_id ?? trip.trip_number,
      pickupArea: trip.pickup_area,
      dropLocation: trip.drop_location,
      partyType,
      partyName,
      partyId,
    });
    setInitiating(false);
    if (!convId) return;
    setShowCompose(false);
    setActiveTab("trips");
    setSelectedConvId(convId);
    if (!isDesktop) setIsMobileDetail(true);
  };

  const filteredComposeTrips = composeSearch.trim()
    ? composeTrips.filter(
        (t) =>
          (t.display_trip_id ?? t.trip_number)
            .toLowerCase()
            .includes(composeSearch.toLowerCase()) ||
          (t.client_name ?? "").toLowerCase().includes(composeSearch.toLowerCase()) ||
          (t.pickup_area ?? "").toLowerCase().includes(composeSearch.toLowerCase()) ||
          (t.drop_location ?? "").toLowerCase().includes(composeSearch.toLowerCase())
      )
    : composeTrips;

  const filteredNetPartners = netComposeSearch.trim()
    ? netPartners.filter((p) =>
        p.name.toLowerCase().includes(netComposeSearch.toLowerCase())
      )
    : netPartners;

  // Partners that don't yet have a conversation
  const existingPartnerOrgIds = new Set(netChats.map((c) => c.partnerId));
  const newPartners = filteredNetPartners.filter((p) => !existingPartnerOrgIds.has(p.org_id));

  const handleNetworkInitiate = async (partner: NetworkPartner) => {
    setInitiating(true);
    const convId = await initiateNetworkConversation(partner);
    setInitiating(false);
    if (!convId) return;
    setShowNetCompose(false);
    setActiveTab("network");
    setSelectedNetId(convId);
    if (!isDesktop) setIsMobileDetail(true);
  };

  // ── List items ───────────────────────────────────────────────────────────────

  const renderConvItem = ({ item }: { item: TripConversation }) => {
    const active = selectedConvId === item.id;
    const time = item.last_message_at
      ? new Date(item.last_message_at).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "";

    return (
      <TouchableOpacity
        style={[s.chatItem, active && s.chatItemActive]}
        onPress={() => {
          setSelectedConvId(item.id);
          markAsRead(item.id);
          openDetail();
        }}
        activeOpacity={0.8}
      >
        <View style={[s.chatIcon, active && s.chatIconActive]}>
          <PartyIcon partyType={item.party_type} active={active} size={16} />
        </View>
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <Text style={[s.chatTitle, active && s.chatTitleActive]} numberOfLines={1}>
              {item.trip_number}
            </Text>
            <Text style={[s.chatTime, active && s.chatTimeActive]}>{time}</Text>
          </View>
          <Text style={[s.chatPartyLabel, active && s.chatPartyLabelActive]}>
            {partyLabel(item.party_type)} · {item.party_name}
          </Text>
          {item.last_message_preview ? (
            <Text style={[s.chatSub, active && s.chatSubActive]} numberOfLines={1}>
              {item.last_message_preview}
            </Text>
          ) : null}
        </View>
        {item.unread_dispatcher_count > 0 && !active && (
          <Badge count={item.unread_dispatcher_count} />
        )}
      </TouchableOpacity>
    );
  };

  const renderNetItem = ({ item }: { item: IntegratedChat }) => {
    const last = item.messages[item.messages.length - 1];
    const active = selectedNetId === item.id;
    return (
      <TouchableOpacity
        style={[s.chatItem, active && s.chatItemActive]}
        onPress={() => {
          setSelectedNetId(item.id);
          markNetRead(item.id);
          openDetail();
        }}
        activeOpacity={0.8}
      >
        <LetterAvatar name={item.partnerName} size={38} />
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <Text style={[s.chatTitle, active && s.chatTitleActive]} numberOfLines={1}>
              {item.partnerName}
            </Text>
            <Text style={[s.chatTime, active && s.chatTimeActive]}>{item.lastActivity}</Text>
          </View>
          <Text style={[s.chatSub, active && s.chatSubActive]} numberOfLines={1}>
            {last?.content ?? ""}
          </Text>
        </View>
        {item.unreadCount > 0 && !active && <Badge count={item.unreadCount} />}
      </TouchableOpacity>
    );
  };

  // ── Panels ───────────────────────────────────────────────────────────────────

  function ChatList() {
    const TABS: {
      id: TabId;
      label: string;
      unread: number;
      Icon: React.ComponentType<{ size: number; color: string }>;
    }[] = [
      { id: "trips", label: "TRIPS", unread: tripUnread, Icon: MessageSquare },
      { id: "network", label: "NETWORK", unread: netUnread, Icon: Users },
    ];

    return (
      <View style={s.listPanel}>
        <View style={s.listHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}
              hitSlop={10}
              style={s.backBtn}
            >
              <ArrowLeft size={18} color="#1e293b" />
            </TouchableOpacity>
            <Text style={s.brandTitle}>Comms.</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity hitSlop={10}>
              <Filter size={16} color="#94a3b8" />
            </TouchableOpacity>
            {activeTab === "trips" && (
              <TouchableOpacity hitSlop={10} onPress={openCompose} style={s.composeBtn}>
                <Edit3 size={14} color="#fff" />
              </TouchableOpacity>
            )}
            {activeTab === "network" && netPartners.length > 0 && (
              <TouchableOpacity hitSlop={10} onPress={() => { setShowNetCompose(true); setNetComposeSearch(""); }} style={s.composeBtn}>
                <Edit3 size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={s.tabRow}>
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[s.tabPill, active && s.tabPillActive]}
                onPress={() => setActiveTab(t.id)}
                activeOpacity={0.75}
              >
                <t.Icon size={12} color={active ? "#1e293b" : "#94a3b8"} />
                <Text style={[s.tabPillLabel, active && s.tabPillLabelActive]}>{t.label}</Text>
                {t.unread > 0 && <Badge count={t.unread} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === "trips" &&
          (isLoading ? (
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <ActivityIndicator color={Theme.primary} />
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(i) => i.id}
              renderItem={renderConvItem}
              ListEmptyComponent={
                <EmptyList
                  label="No trip conversations"
                  actionLabel="Start a conversation"
                  onAction={openCompose}
                />
              }
              contentContainerStyle={{ padding: 10, paddingBottom: 24, gap: 4 }}
            />
          ))}

        {activeTab === "network" &&
          (netLoading ? (
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <ActivityIndicator color={Theme.primary} />
            </View>
          ) : (
            <FlatList
              data={netChats}
              keyExtractor={(i) => i.id}
              renderItem={renderNetItem}
              ListEmptyComponent={
                <EmptyList
                  label="No network conversations"
                  actionLabel={netPartners.length > 0 ? "Message a partner" : undefined}
                  onAction={netPartners.length > 0 ? () => setShowNetCompose(true) : undefined}
                />
              }
              contentContainerStyle={{ padding: 10, paddingBottom: 24, gap: 4 }}
            />
          ))}
      </View>
    );
  }

  function DetailHeader({
    title,
    subtitle,
    partyType,
  }: {
    title: string;
    subtitle?: string;
    partyType?: ConversationPartyType;
  }) {
    return (
      <View style={s.detailHeader}>
        {!isDesktop && (
          <TouchableOpacity onPress={closeDetail} hitSlop={10} style={{ marginRight: 8 }}>
            <ArrowLeft size={20} color="#1e293b" />
          </TouchableOpacity>
        )}
        <View style={s.detailIconWrap}>
          {partyType ? (
            <PartyIcon partyType={partyType} active size={18} />
          ) : (
            <MessageSquare size={18} color="#fff" />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.detailTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22c55e" }} />
              <Text style={s.detailStatus}>{subtitle}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity hitSlop={10}>
          <Search size={17} color="#94a3b8" />
        </TouchableOpacity>
        <TouchableOpacity hitSlop={10} style={{ marginLeft: 8 }}>
          <MoreVertical size={17} color="#94a3b8" />
        </TouchableOpacity>
      </View>
    );
  }

  function SystemMsg({ label }: { label: string }) {
    return (
      <View style={s.sysMsg}>
        <Text style={s.sysMsgText}>{label}</Text>
      </View>
    );
  }

  function Bubble({
    isOwn,
    content,
    timestamp,
    senderName,
  }: {
    isOwn: boolean;
    content: string;
    timestamp: string;
    senderName?: string;
  }) {
    const displayTime = (() => {
      try {
        return new Date(timestamp).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
      } catch {
        return timestamp;
      }
    })();

    return (
      <View style={[s.bubbleWrap, isOwn ? s.bubbleWrapOwn : s.bubbleWrapOther]}>
        {!isOwn && <LetterAvatar name={senderName ?? "?"} size={32} />}
        <View style={{ maxWidth: "72%" }}>
          <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
            <Text style={[s.bubbleText, isOwn ? s.bubbleTextOwn : s.bubbleTextOther]}>
              {content}
            </Text>
          </View>
          <Text style={[s.bubbleMeta, isOwn && { textAlign: "right" }]}>
            {displayTime}
            {senderName ? ` · ${senderName.toUpperCase()}` : " · YOU"}
          </Text>
        </View>
        {isOwn && <LetterAvatar name="You" own size={32} />}
      </View>
    );
  }

  function ScriptsPopup({ quickMsgs }: { quickMsgs: string[] }) {
    if (!showScripts) return null;
    return (
      <View style={s.scriptPopup}>
        <View style={s.scriptPopupHeader}>
          <Text style={s.scriptPopupTitle}>QUICK MESSAGES</Text>
          <TouchableOpacity onPress={() => setShowScripts(false)} hitSlop={8}>
            <X size={15} color="#94a3b8" />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 220 }}>
          {quickMsgs.map((m, i) => (
            <TouchableOpacity
              key={i}
              style={s.scriptItem}
              onPress={() => {
                setMessageInput(m);
                setShowScripts(false);
              }}
              activeOpacity={0.7}
            >
              <Text style={s.scriptItemText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  function EmojiPopup() {
    if (!showEmoji) return null;
    return (
      <View style={s.emojiPopup}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
          {QUICK_EMOJIS.map((e) => (
            <TouchableOpacity
              key={e}
              style={s.emojiBtn}
              onPress={() => {
                setMessageInput((p) => p + e);
                setShowEmoji(false);
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  function InputBar({ quickMsgs }: { quickMsgs: string[] }) {
    return (
      <View style={s.inputWrap}>
        <EmojiPopup />
        <ScriptsPopup quickMsgs={quickMsgs} />
        <View style={s.inputRow}>
          <TouchableOpacity style={s.plusBtn} hitSlop={6}>
            <Plus size={16} color="#94a3b8" />
          </TouchableOpacity>
          <TextInput
            style={s.input}
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Type a message…"
            placeholderTextColor="#b0b8c8"
            multiline
          />
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => {
              setShowEmoji((v) => !v);
              setShowScripts(false);
            }}
            hitSlop={6}
          >
            <Smile size={19} color={showEmoji ? Theme.primary : "#94a3b8"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => {
              setShowScripts((v) => !v);
              setShowEmoji(false);
            }}
            hitSlop={6}
          >
            <FileType size={19} color={showScripts ? Theme.primary : "#94a3b8"} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.sendBtn, !messageInput.trim() && s.sendBtnOff]}
            onPress={handleSend}
            disabled={!messageInput.trim()}
            activeOpacity={0.85}
          >
            <Send size={15} color="#fff" />
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexShrink: 0 }}
          contentContainerStyle={s.chipRow}
        >
          {quickMsgs.map((m, i) => (
            <TouchableOpacity
              key={i}
              style={s.chip}
              onPress={() => setMessageInput(m)}
              activeOpacity={0.7}
            >
              <Text style={s.chipText} numberOfLines={1}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Detail views ─────────────────────────────────────────────────────────────

  function TripConversationDetail() {
    if (!selectedConv) return <EmptyDetail />;
    const quickMsgs = QUICK_MESSAGES[selectedConv.party_type];

    return (
      <View style={s.detailPanel}>
        <DetailHeader
          title={`${selectedConv.trip_number} · ${partyLabel(selectedConv.party_type)}`}
          subtitle={selectedConv.party_name.toUpperCase()}
          partyType={selectedConv.party_type}
        />
        <ScrollView
          ref={messagesRef}
          style={s.msgs}
          contentContainerStyle={s.msgsContent}
          onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}
        >
          <SystemMsg
            label={`${selectedConv.pickup_area.toUpperCase()} → ${selectedConv.drop_location.toUpperCase()} · TODAY`}
          />
          {selectedConv.messages.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 32 }}>
              <Text style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                No messages yet
              </Text>
            </View>
          )}
          {selectedConv.messages.map((m) => (
            <Bubble
              key={m.id}
              isOwn={m.sender_role === "dispatcher"}
              content={m.content}
              timestamp={m.created_at}
              senderName={m.sender_role !== "dispatcher" ? m.sender_name : undefined}
            />
          ))}
        </ScrollView>
        <InputBar quickMsgs={quickMsgs} />
      </View>
    );
  }

  function NetworkDetail() {
    if (!selectedNet) return <EmptyDetail />;
    return (
      <View style={s.detailPanel}>
        <DetailHeader
          title={selectedNet.partnerName}
          subtitle={selectedNet.organization.toUpperCase()}
        />
        <ScrollView
          ref={messagesRef}
          style={s.msgs}
          contentContainerStyle={s.msgsContent}
          onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}
        >
          <SystemMsg label="SECURE CHANNEL · TODAY" />
          {selectedNet.messages.map((m) => (
            <Bubble
              key={m.id}
              isOwn={m.senderId === "dispatcher-1"}
              content={m.content}
              timestamp={m.timestamp}
              senderName={
                m.senderId !== "dispatcher-1" ? selectedNet.partnerName : undefined
              }
            />
          ))}
        </ScrollView>
        <InputBar quickMsgs={INTEGRATED_QUICK_MESSAGES} />
      </View>
    );
  }

  function CurrentDetail() {
    if (activeTab === "trips") return <TripConversationDetail />;
    return <NetworkDetail />;
  }

  // ── Network compose modal ─────────────────────────────────────────────────────

  function NetworkComposeModal() {
    return (
      <Modal
        visible={showNetCompose}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNetCompose(false)}
      >
        <View style={cm.backdrop}>
          <View style={cm.sheet}>
            <View style={cm.header}>
              <View>
                <Text style={cm.title}>Message a Partner</Text>
                <Text style={cm.subtitle}>Select a connected organization to start a conversation.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNetCompose(false)} hitSlop={8} style={cm.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={cm.searchRow}>
              <Search size={15} color="#94a3b8" style={{ marginRight: 8 }} />
              <TextInput
                style={cm.searchInput}
                value={netComposeSearch}
                onChangeText={setNetComposeSearch}
                placeholder="Search partners…"
                placeholderTextColor="#94a3b8"
                autoFocus
              />
              {netComposeSearch.length > 0 && (
                <TouchableOpacity onPress={() => setNetComposeSearch("")} hitSlop={8}>
                  <X size={14} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Existing conversations */}
              {filteredNetPartners.filter((p) => existingPartnerOrgIds.has(p.org_id)).map((p) => (
                <TouchableOpacity
                  key={p.org_id}
                  style={[cm.tripCard, { marginBottom: 8 }]}
                  onPress={() => {
                    const conv = netChats.find((c) => c.partnerId === p.org_id);
                    if (conv) {
                      setShowNetCompose(false);
                      setSelectedNetId(conv.id);
                      if (!isDesktop) setIsMobileDetail(true);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[cm.tripRow, { justifyContent: "space-between" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={cm.partyIconWrap}>
                        <Users size={14} color={Theme.primary} />
                      </View>
                      <Text style={cm.tripNumber}>{p.name}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: "#94a3b8", fontWeight: "600" }}>OPEN CHAT →</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* New partners (no conversation yet) */}
              {newPartners.length > 0 && (
                <>
                  {filteredNetPartners.filter((p) => existingPartnerOrgIds.has(p.org_id)).length > 0 && (
                    <Text style={{ fontSize: 9, fontWeight: "800", color: "#94a3b8", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8, marginTop: 4 }}>
                      NEW CONVERSATION
                    </Text>
                  )}
                  {newPartners.map((p) => (
                    <TouchableOpacity
                      key={p.org_id}
                      style={[cm.tripCard, { marginBottom: 8 }]}
                      onPress={() => handleNetworkInitiate(p)}
                      disabled={initiating}
                      activeOpacity={0.75}
                    >
                      <View style={[cm.tripRow, { justifyContent: "space-between" }]}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                          <View style={cm.partyIconWrap}>
                            <Users size={14} color={Theme.primary} />
                          </View>
                          <Text style={cm.tripNumber}>{p.name}</Text>
                        </View>
                        {initiating ? (
                          <ActivityIndicator size="small" color={Theme.primary} />
                        ) : (
                          <Plus size={14} color={Theme.primary} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {filteredNetPartners.length === 0 && (
                <View style={{ paddingTop: 32, alignItems: "center", gap: 8 }}>
                  <Users size={28} color="#e2e8f0" />
                  <Text style={{ fontSize: 13, color: "#94a3b8" }}>
                    {netComposeSearch ? "No matching partners" : "No connected partners found"}
                  </Text>
                  {!netComposeSearch && (
                    <Text style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", paddingHorizontal: 20, lineHeight: 18 }}>
                      Connect with suppliers or clients on the platform to message them here.
                    </Text>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Compose modal ─────────────────────────────────────────────────────────────

  function ComposeModal() {
    return (
      <Modal
        visible={showCompose}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompose(false)}
      >
        <View style={cm.backdrop}>
          <View style={cm.sheet}>
            {/* Header */}
            <View style={cm.header}>
              <View>
                <Text style={cm.title}>New Conversation</Text>
                <Text style={cm.subtitle}>Select a trip and a party to chat with.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCompose(false)} hitSlop={8} style={cm.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={cm.searchRow}>
              <Search size={15} color="#94a3b8" style={{ marginRight: 8 }} />
              <TextInput
                style={cm.searchInput}
                value={composeSearch}
                onChangeText={setComposeSearch}
                placeholder="Search trips, clients, routes…"
                placeholderTextColor="#94a3b8"
                autoFocus
              />
              {composeSearch.length > 0 && (
                <TouchableOpacity onPress={() => setComposeSearch("")} hitSlop={8}>
                  <X size={14} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Trip list */}
            {composeLoading ? (
              <View style={{ paddingTop: 48, alignItems: "center" }}>
                <ActivityIndicator color={Theme.primary} />
              </View>
            ) : filteredComposeTrips.length === 0 ? (
              <View style={{ paddingTop: 48, alignItems: "center", gap: 8 }}>
                <MessageSquare size={28} color="#e2e8f0" />
                <Text style={{ fontSize: 13, color: "#94a3b8" }}>
                  {composeSearch ? "No matching trips" : "No active trips found"}
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {filteredComposeTrips.map((trip) => {
                  const isExpanded = expandedTripId === trip.id;
                  const tripLabel = trip.display_trip_id ?? trip.trip_number;

                  const parties: { type: ConversationPartyType; name: string; id: string }[] = [];
                  if (trip.client_id && trip.client_name)
                    parties.push({ type: "client", name: trip.client_name, id: trip.client_id });
                  if (trip.supplier_id && trip.supplier_name)
                    parties.push({ type: "supplier", name: trip.supplier_name, id: trip.supplier_id });
                  if (trip.driver_id && trip.driver_display_name)
                    parties.push({ type: "driver", name: trip.driver_display_name, id: trip.driver_id });

                  if (parties.length === 0) return null;

                  return (
                    <View key={trip.id} style={cm.tripCard}>
                      <TouchableOpacity
                        style={cm.tripRow}
                        onPress={() => setExpandedTripId(isExpanded ? null : trip.id)}
                        activeOpacity={0.7}
                      >
                        <View style={cm.tripInfo}>
                          <Text style={cm.tripNumber}>{tripLabel}</Text>
                          <Text style={cm.tripRoute} numberOfLines={1}>
                            {trip.pickup_area} → {trip.drop_location}
                          </Text>
                        </View>
                        {isExpanded ? (
                          <ChevronDown size={16} color="#94a3b8" />
                        ) : (
                          <ChevronRight size={16} color="#94a3b8" />
                        )}
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={cm.partyList}>
                          {parties.map((p) => (
                            <TouchableOpacity
                              key={p.type}
                              style={cm.partyRow}
                              onPress={() => handleInitiate(trip, p.type, p.name, p.id)}
                              disabled={initiating}
                              activeOpacity={0.7}
                            >
                              <View style={cm.partyIconWrap}>
                                <PartyIcon partyType={p.type} size={14} />
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={cm.partyType}>{partyLabel(p.type)}</Text>
                                <Text style={cm.partyName} numberOfLines={1}>{p.name}</Text>
                              </View>
                              {initiating ? (
                                <ActivityIndicator size="small" color={Theme.primary} />
                              ) : (
                                <Plus size={14} color={Theme.primary} />
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────────

  if (isDesktop) {
    return (
      <LinearGradient
        colors={["#edfafa", "#ffffff", "#eff6ff"]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.root, { paddingTop: insets.top }]}
      >
        <View style={s.desktop}>
          <View style={s.desktopList}>
            <ChatList />
          </View>
          <View style={s.desktopDetail}>
            <CurrentDetail />
          </View>
        </View>
        <ComposeModal />
        <NetworkComposeModal />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={["#edfafa", "#ffffff", "#eff6ff"]}
      locations={[0, 0.45, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      {!isMobileDetail ? <ChatList /> : <CurrentDetail />}
      <ComposeModal />
      <NetworkComposeModal />
    </LinearGradient>
  );
}

// ── Shared empty states ───────────────────────────────────────────────────────

function EmptyList({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: "center", paddingTop: 48, gap: 12 }}>
      <MessageSquare size={32} color="#e2e8f0" />
      <Text style={{ fontSize: 13, color: "#94a3b8" }}>{label}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={{
            paddingHorizontal: 18,
            paddingVertical: 9,
            borderRadius: 20,
            backgroundColor: Theme.primary,
          }}
          activeOpacity={0.8}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyDetail() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 24,
          backgroundColor: "#e8eaf6",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MessageSquare size={34} color={Theme.primary} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "800", color: "#1e293b", letterSpacing: -0.5 }}>
        Select a conversation
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: "#94a3b8",
          textAlign: "center",
          paddingHorizontal: 40,
          lineHeight: 20,
        }}
      >
        Pick a trip conversation or network chat to start messaging.
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  desktop: { flex: 1, flexDirection: "row" },
  desktopList: { width: 300, borderRightWidth: 1, borderRightColor: "#f1f5f9" },
  desktopDetail: { flex: 1, backgroundColor: "transparent" },

  listPanel: { flex: 1, backgroundColor: "transparent" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.8,
    fontStyle: "italic",
  },

  tabRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabPillActive: { borderColor: "#e2e8f0", backgroundColor: "#fff" },
  tabPillLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.3 },
  tabPillLabelActive: { color: "#1e293b" },

  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  chatItemActive: { backgroundColor: "#0f172a" },
  chatIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  chatIconActive: { backgroundColor: "rgba(255,255,255,0.14)" },
  chatBody: { flex: 1, minWidth: 0 },
  chatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  chatTitle: { fontSize: 13, fontWeight: "700", color: "#1e293b", flex: 1 },
  chatTitleActive: { color: "#fff" },
  chatTime: { fontSize: 10, color: "#94a3b8", marginLeft: 8, flexShrink: 0 },
  chatTimeActive: { color: "rgba(255,255,255,0.55)" },
  chatPartyLabel: { fontSize: 10, fontWeight: "700", color: Theme.primary, letterSpacing: 0.4, marginBottom: 2 },
  chatPartyLabelActive: { color: "rgba(255,255,255,0.7)" },
  chatSub: { fontSize: 12, color: "#94a3b8", lineHeight: 16 },
  chatSubActive: { color: "rgba(255,255,255,0.65)" },

  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#fff",
  },
  detailIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", letterSpacing: -0.3 },
  detailStatus: {
    fontSize: 10,
    fontWeight: "700",
    color: "#22c55e",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  detailPanel: { flex: 1, backgroundColor: "transparent" },
  msgs: { flex: 1, backgroundColor: "transparent" },
  msgsContent: { padding: 20, gap: 12, paddingBottom: 24 },

  sysMsg: {
    alignSelf: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginVertical: 4,
  },
  sysMsgText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  bubbleWrap: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleWrapOwn: { justifyContent: "flex-end" },
  bubbleWrapOther: { justifyContent: "flex-start" },
  bubble: { borderRadius: 18, paddingHorizontal: 15, paddingVertical: 10 },
  bubbleOwn: { backgroundColor: "#5b5ef4", borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextOwn: { color: "#fff" },
  bubbleTextOther: { color: "#1e293b" },
  bubbleMeta: { fontSize: 10, color: "#94a3b8", marginTop: 4, letterSpacing: 0.2 },

  inputWrap: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  input: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1e293b",
    maxHeight: 96,
  },
  iconBtn: { padding: 6 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnOff: { backgroundColor: "#e2e8f0" },

  chipRow: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4, gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e8eaf6",
  },
  chipText: { fontSize: 12, color: "#475569", fontWeight: "500" },

  emojiPopup: {
    position: "absolute",
    bottom: "100%",
    left: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
    width: 240,
    zIndex: 50,
  },
  emojiBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10 },

  scriptPopup: {
    position: "absolute",
    bottom: "100%",
    left: 14,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
    width: 300,
    zIndex: 50,
  },
  scriptPopupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  scriptPopupTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  scriptItem: {
    paddingHorizontal: 4,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  scriptItemText: { fontSize: 13, color: "#334155" },

  composeBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
});

// ── Compose modal styles ──────────────────────────────────────────────────────

const cm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 28,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "82%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -10 },
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.6,
    fontStyle: "italic",
  },
  subtitle: { fontSize: 13, color: "#94a3b8", marginTop: 3 },
  closeBtn: { padding: 4 },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1e293b" },

  tripCard: {
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    marginBottom: 8,
    overflow: "hidden",
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  tripInfo: { flex: 1, minWidth: 0 },
  tripNumber: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  tripRoute: { fontSize: 12, color: "#94a3b8", marginTop: 2 },

  partyList: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  partyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#e8eaf6",
    alignItems: "center",
    justifyContent: "center",
  },
  partyType: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  partyName: { fontSize: 13, fontWeight: "600", color: "#1e293b", marginTop: 1 },
});
