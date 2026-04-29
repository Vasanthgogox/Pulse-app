import React, { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Briefcase,
  MessageCircle,
  Route,
  Send,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  X,
} from "lucide-react-native";
import Theme from "@/constants/Theme";
import {
  INTEGRATED_QUICK_MESSAGES,
  IntegratedChat,
  useIntegratedChat,
} from "@/features/chat/contexts/IntegratedChatContext";
import {
  TRIP_QUICK_MESSAGES,
  TripChat,
  useTripChat,
} from "@/features/chat/contexts/TripChatContext";

type TabId = "trips" | "marketplace" | "network";
type TripCategory = "updates" | "questions" | "challenges";

interface MarketplaceChat {
  id: string;
  contactName: string;
  listingTitle: string;
  listingType: "vehicle" | "warehouse" | "job";
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isOnline: boolean;
  messages: { id: string; sender: "me" | "them"; content: string; timestamp: string }[];
}

const MOCK_MARKETPLACE: MarketplaceChat[] = [
  {
    id: "mkt-1",
    contactName: "Raj Transport",
    listingTitle: "Tata 407 - 2019 Model",
    listingType: "vehicle",
    lastMessage: "Yes, it's available. When can you come?",
    lastMessageTime: "2 min ago",
    unreadCount: 2,
    isOnline: true,
    messages: [
      { id: "m1", sender: "me", content: "Is this still available?", timestamp: "10:30 AM" },
      { id: "m2", sender: "them", content: "Yes, it's available", timestamp: "10:32 AM" },
      { id: "m3", sender: "them", content: "Yes, it's available. When can you come for inspection?", timestamp: "10:42 AM" },
    ],
  },
  {
    id: "mkt-2",
    contactName: "Kumar Logistics",
    listingTitle: "20000 sqft Warehouse - Nashik",
    listingType: "warehouse",
    lastMessage: "All documents are complete.",
    lastMessageTime: "1 hour ago",
    unreadCount: 0,
    isOnline: false,
    messages: [
      { id: "m1", sender: "me", content: "Are all documents complete?", timestamp: "9:00 AM" },
      { id: "m2", sender: "them", content: "All documents are complete.", timestamp: "9:15 AM" },
    ],
  },
  {
    id: "mkt-3",
    contactName: "Singh Fleet",
    listingTitle: "Experienced Trailer Driver Needed",
    listingType: "job",
    lastMessage: "We offer ₹35,000 per month with benefits.",
    lastMessageTime: "Yesterday",
    unreadCount: 1,
    isOnline: true,
    messages: [
      { id: "m1", sender: "me", content: "What is the salary range?", timestamp: "Yesterday" },
      { id: "m2", sender: "them", content: "We offer ₹35,000 per month with benefits.", timestamp: "Yesterday" },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function ListingIcon({ type }: { type: string }) {
  const c = "#64748b";
  if (type === "vehicle") return <Truck size={12} color={c} />;
  if (type === "warehouse") return <Warehouse size={12} color={c} />;
  return <Briefcase size={12} color={c} />;
}

function AvatarBubble({ name, online, size = 44 }: { name: string; online?: boolean; size?: number }) {
  const initials = getInitials(name);
  return (
    <View style={{ position: "relative" }}>
      <View style={[av.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[av.text, { fontSize: size * 0.29 }]}>{initials}</Text>
      </View>
      {online && <View style={av.dot} />}
    </View>
  );
}

const av = StyleSheet.create({
  circle: {
    backgroundColor: "#e8eaf6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c5cae9",
  },
  text: { fontWeight: "700", color: Theme.primary, letterSpacing: -0.3 },
  dot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22c55e",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
});

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={bst.wrap}>
      <Text style={bst.text}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}

const bst = StyleSheet.create({
  wrap: { backgroundColor: Theme.primary, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  text: { color: "#fff", fontSize: 10, fontWeight: "800" },
});

// ── Main component ────────────────────────────────────────────────────────────

export function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [activeTab, setActiveTab] = useState<TabId>("trips");
  const [isMobileDetail, setIsMobileDetail] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [tripCategory, setTripCategory] = useState<TripCategory>("updates");
  const messagesEnd = useRef<ScrollView>(null);

  const { chats: tripChats, sendMessage: sendTrip, markAsRead: markTripRead, getTotalUnreadCount: tripTotal } = useTripChat();
  const { chats: netChats, sendMessage: sendNet, markAsRead: markNetRead, getTotalUnreadCount: netTotal } = useIntegratedChat();
  const [marketChats, setMarketChats] = useState<MarketplaceChat[]>(MOCK_MARKETPLACE);

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedNetId, setSelectedNetId] = useState<string | null>(null);
  const [selectedMktId, setSelectedMktId] = useState<string | null>(null);

  const selectedTrip = tripChats.find((c) => c.tripId === selectedTripId) ?? null;
  const selectedNet = netChats.find((c) => c.id === selectedNetId) ?? null;
  const selectedMkt = marketChats.find((c) => c.id === selectedMktId) ?? null;

  const tripUnread = tripTotal("dispatcher");
  const netUnread = netTotal();
  const mktUnread = marketChats.reduce((s, c) => s + c.unreadCount, 0);

  const openDetail = () => { if (!isDesktop) setIsMobileDetail(true); };
  const closeDetail = () => {
    setIsMobileDetail(false);
    setSelectedTripId(null);
    setSelectedNetId(null);
    setSelectedMktId(null);
    setMessageInput("");
  };

  const scrollToBottom = () => setTimeout(() => messagesEnd.current?.scrollToEnd({ animated: true }), 80);

  const handleSend = () => {
    const text = messageInput.trim();
    if (!text) return;
    if (activeTab === "trips" && selectedTripId) sendTrip(selectedTripId, text, "dispatcher");
    else if (activeTab === "network" && selectedNetId) sendNet(selectedNetId, text, "dispatcher");
    else if (activeTab === "marketplace" && selectedMktId) {
      const ts = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      setMarketChats((prev) =>
        prev.map((c) =>
          c.id === selectedMktId
            ? { ...c, messages: [...c.messages, { id: `m-${Date.now()}`, sender: "me" as const, content: text, timestamp: ts }], lastMessage: text, lastMessageTime: "Just now" }
            : c
        )
      );
    }
    setMessageInput("");
    scrollToBottom();
  };

  // ── List items ──────────────────────────────────────────────────────────────

  const renderTripItem = ({ item }: { item: TripChat }) => {
    const last = item.messages[item.messages.length - 1];
    const unread = item.messages.filter((m) => !m.isRead && m.senderRole !== "dispatcher").length;
    const active = selectedTripId === item.tripId;
    return (
      <TouchableOpacity
        style={[s.listItem, active && s.listItemActive]}
        onPress={() => { setSelectedTripId(item.tripId); markTripRead(item.tripId, "dispatcher"); openDetail(); }}
        activeOpacity={0.7}
      >
        <View style={s.routeIcon}>
          <Route size={17} color={active ? "#fff" : Theme.primary} />
        </View>
        <View style={s.listBody}>
          <View style={s.listRow}>
            <Text style={[s.listTitle, active && s.listTitleActive]} numberOfLines={1}>{item.tripNumber}</Text>
            <Text style={[s.listTime, active && s.listTimeActive]}>{item.lastActivity}</Text>
          </View>
          <Text style={[s.listRoute, active && s.listRouteActive]} numberOfLines={1}>{item.pickupArea} → {item.dropLocation}</Text>
          <Text style={[s.listMsg, active && s.listMsgActive]} numberOfLines={1}>{last?.content ?? "No messages yet"}</Text>
        </View>
        {unread > 0 && !active && <Badge count={unread} />}
      </TouchableOpacity>
    );
  };

  const renderNetItem = ({ item }: { item: IntegratedChat }) => {
    const last = item.messages[item.messages.length - 1];
    const active = selectedNetId === item.id;
    return (
      <TouchableOpacity
        style={[s.listItem, active && s.listItemActive]}
        onPress={() => { setSelectedNetId(item.id); markNetRead(item.id); openDetail(); }}
        activeOpacity={0.7}
      >
        <AvatarBubble name={item.partnerName} online={item.isOnline} />
        <View style={s.listBody}>
          <View style={s.listRow}>
            <Text style={[s.listTitle, active && s.listTitleActive]} numberOfLines={1}>{item.partnerName}</Text>
            <Text style={[s.listTime, active && s.listTimeActive]}>{item.lastActivity}</Text>
          </View>
          <Text style={[s.listRoute, active && s.listRouteActive]} numberOfLines={1}>{item.organization}</Text>
          <Text style={[s.listMsg, active && s.listMsgActive]} numberOfLines={1}>{last?.content ?? ""}</Text>
        </View>
        {item.unreadCount > 0 && !active && <Badge count={item.unreadCount} />}
      </TouchableOpacity>
    );
  };

  const renderMktItem = ({ item }: { item: MarketplaceChat }) => {
    const active = selectedMktId === item.id;
    return (
      <TouchableOpacity
        style={[s.listItem, active && s.listItemActive]}
        onPress={() => { setSelectedMktId(item.id); setMarketChats((prev) => prev.map((c) => (c.id === item.id ? { ...c, unreadCount: 0 } : c))); openDetail(); }}
        activeOpacity={0.7}
      >
        <AvatarBubble name={item.contactName} online={item.isOnline} />
        <View style={s.listBody}>
          <View style={s.listRow}>
            <Text style={[s.listTitle, active && s.listTitleActive]} numberOfLines={1}>{item.contactName}</Text>
            <Text style={[s.listTime, active && s.listTimeActive]}>{item.lastMessageTime}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
            <ListingIcon type={item.listingType} />
            <Text style={[s.listRoute, active && s.listRouteActive]} numberOfLines={1}>{item.listingTitle}</Text>
          </View>
          <Text style={[s.listMsg, active && s.listMsgActive]} numberOfLines={1}>{item.lastMessage}</Text>
        </View>
        {item.unreadCount > 0 && !active && <Badge count={item.unreadCount} />}
      </TouchableOpacity>
    );
  };

  // ── Panels ──────────────────────────────────────────────────────────────────

  function ChatList() {
    const TABS: { id: TabId; label: string; unread: number; Icon: React.ComponentType<{ size: number; color: string }> }[] = [
      { id: "trips", label: "Trips", unread: tripUnread, Icon: Route },
      { id: "marketplace", label: "Market", unread: mktUnread, Icon: ShoppingCart },
      { id: "network", label: "Network", unread: netUnread, Icon: Users },
    ];
    return (
      <View style={s.listPanel}>
        <View style={s.listHeader}>
          <Text style={s.listHeaderTitle}>Messages</Text>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <X size={18} color={Theme.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={s.tabBar}>
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <TouchableOpacity key={t.id} style={[s.tabItem, active && s.tabItemActive]} onPress={() => setActiveTab(t.id)} activeOpacity={0.7}>
                <t.Icon size={13} color={active ? Theme.primary : Theme.textSecondary} />
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>{t.label}</Text>
                {t.unread > 0 && <Badge count={t.unread} />}
              </TouchableOpacity>
            );
          })}
        </View>
        {activeTab === "trips" && <FlatList data={tripChats} keyExtractor={(i) => i.tripId} renderItem={renderTripItem} ListEmptyComponent={<EmptyList label="No trip chats" />} contentContainerStyle={{ paddingBottom: 20 }} />}
        {activeTab === "marketplace" && <FlatList data={marketChats} keyExtractor={(i) => i.id} renderItem={renderMktItem} ListEmptyComponent={<EmptyList label="No marketplace chats" />} contentContainerStyle={{ paddingBottom: 20 }} />}
        {activeTab === "network" && <FlatList data={netChats} keyExtractor={(i) => i.id} renderItem={renderNetItem} ListEmptyComponent={<EmptyList label="No network chats" />} contentContainerStyle={{ paddingBottom: 20 }} />}
      </View>
    );
  }

  function DetailHeader({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
      <View style={s.detailHeader}>
        {!isDesktop && (
          <TouchableOpacity onPress={closeDetail} hitSlop={10} style={{ marginRight: 4 }}>
            <ArrowLeft size={20} color={Theme.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={s.detailHeaderInner}>
          <Text style={s.detailTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.detailSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={s.onlineDot} />
      </View>
    );
  }

  function Bubble({ isOwn, content, timestamp }: { isOwn: boolean; content: string; timestamp: string }) {
    return (
      <View style={[s.bubbleRow, isOwn ? s.bubbleRowOwn : s.bubbleRowOther]}>
        <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
          <Text style={[s.bubbleText, isOwn ? s.bubbleTextOwn : s.bubbleTextOther]}>{content}</Text>
        </View>
        <Text style={[s.bubbleTime, isOwn && { textAlign: "right" }]}>{timestamp}</Text>
      </View>
    );
  }

  function QuickBar({ msgs }: { msgs: string[] }) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }} contentContainerStyle={s.quickContent}>
        {msgs.map((m, i) => (
          <TouchableOpacity key={i} style={s.quickChip} onPress={() => setMessageInput(m)} activeOpacity={0.7}>
            <Text style={s.quickChipText} numberOfLines={1}>{m}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  function InputBar({ quickMsgs }: { quickMsgs?: string[] }) {
    return (
      <View style={s.inputWrap}>
        {quickMsgs && <QuickBar msgs={quickMsgs} />}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Type a message…"
            placeholderTextColor={Theme.textMuted}
            multiline
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity style={[s.sendBtn, !messageInput.trim() && s.sendBtnDisabled]} onPress={handleSend} disabled={!messageInput.trim()} activeOpacity={0.8}>
            <Send size={15} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function TripDetail() {
    if (!selectedTrip) return <EmptyDetail />;
    return (
      <View style={s.detailPanel}>
        <DetailHeader title={selectedTrip.tripNumber} subtitle={`${selectedTrip.pickupArea} → ${selectedTrip.dropLocation}`} />
        <View style={s.categoryBar}>
          {(["updates", "questions", "challenges"] as TripCategory[]).map((c) => (
            <TouchableOpacity key={c} style={[s.catChip, tripCategory === c && s.catChipActive]} onPress={() => setTripCategory(c)} activeOpacity={0.7}>
              <Text style={[s.catText, tripCategory === c && s.catTextActive]}>{c.charAt(0).toUpperCase() + c.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView ref={messagesEnd} style={s.messages} contentContainerStyle={s.messagesContent} onContentSizeChange={() => messagesEnd.current?.scrollToEnd({ animated: false })}>
          {selectedTrip.messages.length === 0 && <View style={s.emptyMsg}><Text style={s.emptyMsgText}>No messages yet. Start the conversation!</Text></View>}
          {selectedTrip.messages.map((m) => <Bubble key={m.id} isOwn={m.senderRole === "dispatcher"} content={m.content} timestamp={m.timestamp} />)}
        </ScrollView>
        <InputBar quickMsgs={TRIP_QUICK_MESSAGES[tripCategory]} />
      </View>
    );
  }

  function NetworkDetail() {
    if (!selectedNet) return <EmptyDetail />;
    return (
      <View style={s.detailPanel}>
        <DetailHeader title={selectedNet.partnerName} subtitle={selectedNet.organization} />
        <ScrollView ref={messagesEnd} style={s.messages} contentContainerStyle={s.messagesContent} onContentSizeChange={() => messagesEnd.current?.scrollToEnd({ animated: false })}>
          {selectedNet.messages.map((m) => <Bubble key={m.id} isOwn={m.senderId === "dispatcher-1"} content={m.content} timestamp={m.timestamp} />)}
        </ScrollView>
        <InputBar quickMsgs={INTEGRATED_QUICK_MESSAGES} />
      </View>
    );
  }

  function MarketDetail() {
    if (!selectedMkt) return <EmptyDetail />;
    return (
      <View style={s.detailPanel}>
        <DetailHeader title={selectedMkt.contactName} subtitle={selectedMkt.listingTitle} />
        <ScrollView ref={messagesEnd} style={s.messages} contentContainerStyle={s.messagesContent} onContentSizeChange={() => messagesEnd.current?.scrollToEnd({ animated: false })}>
          {selectedMkt.messages.map((m) => <Bubble key={m.id} isOwn={m.sender === "me"} content={m.content} timestamp={m.timestamp} />)}
        </ScrollView>
        <InputBar quickMsgs={["Is this still available?", "What is the best price?", "Can I schedule a visit?", "Please share more details"]} />
      </View>
    );
  }

  function CurrentDetail() {
    if (activeTab === "trips") return <TripDetail />;
    if (activeTab === "network") return <NetworkDetail />;
    return <MarketDetail />;
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  if (isDesktop) {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={s.desktopWrap}>
          <View style={s.desktopList}><ChatList /></View>
          <View style={s.desktopDetail}><CurrentDetail /></View>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {!isMobileDetail ? <ChatList /> : <CurrentDetail />}
    </View>
  );
}

function EmptyList({ label }: { label: string }) {
  return (
    <View style={{ alignItems: "center", paddingTop: 48, gap: 8 }}>
      <MessageCircle size={32} color={Theme.textSection} />
      <Text style={{ fontSize: 13, color: Theme.textSecondary }}>{label}</Text>
    </View>
  );
}

function EmptyDetail() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#f8fafc" }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#e8eaf6", alignItems: "center", justifyContent: "center" }}>
        <MessageCircle size={36} color={Theme.primary} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "700", color: Theme.textPrimary }}>Select a conversation</Text>
      <Text style={{ fontSize: 13, color: Theme.textSecondary, textAlign: "center", paddingHorizontal: 40, lineHeight: 20 }}>
        Pick a trip, marketplace enquiry or network chat to start messaging.
      </Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },

  // Desktop
  desktopWrap: { flex: 1, flexDirection: "row" },
  desktopList: { width: 320, borderRightWidth: 1, borderRightColor: "#f1f5f9" },
  desktopDetail: { flex: 1, backgroundColor: "#f8fafc" },

  // List panel
  listPanel: { flex: 1, backgroundColor: "#fff" },
  listHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  listHeaderTitle: { fontSize: 20, fontWeight: "800", color: Theme.textPrimary, letterSpacing: -0.5 },

  // Tab bar
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  tabItem: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 11,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: Theme.primary },
  tabLabel: { fontSize: 11, fontWeight: "700", color: Theme.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  tabLabelActive: { color: Theme.primary },

  // List items
  listItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: "#f8fafc",
    backgroundColor: "#fff",
  },
  listItemActive: { backgroundColor: "#e8eaf6" },
  routeIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#e8eaf6", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#c5cae9",
  },
  listBody: { flex: 1, minWidth: 0 },
  listRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  listTitle: { fontSize: 13, fontWeight: "700", color: Theme.textPrimary, flex: 1 },
  listTitleActive: { color: Theme.primary },
  listTime: { fontSize: 10, color: Theme.textSecondary, marginLeft: 8, flexShrink: 0 },
  listTimeActive: { color: Theme.primary },
  listRoute: { fontSize: 11, fontWeight: "600", color: Theme.primary, marginBottom: 2 },
  listRouteActive: { color: Theme.primary },
  listMsg: { fontSize: 12, color: Theme.textSecondary, lineHeight: 16 },
  listMsgActive: { color: "#3949ab" },

  // Detail panel
  detailPanel: { flex: 1, backgroundColor: "#fff" },
  detailHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
    backgroundColor: "#fff",
    gap: 10,
  },
  detailHeaderInner: { flex: 1, minWidth: 0 },
  detailTitle: { fontSize: 15, fontWeight: "800", color: Theme.textPrimary, letterSpacing: -0.3 },
  detailSubtitle: { fontSize: 11, fontWeight: "600", color: Theme.primary, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e", flexShrink: 0 },

  // Category bar
  categoryBar: {
    flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
    backgroundColor: "#fff",
  },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0",
  },
  catChipActive: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  catText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  catTextActive: { color: "#fff" },

  // Messages
  messages: { flex: 1, backgroundColor: "#f8fafc" },
  messagesContent: { padding: 16, paddingBottom: 24, gap: 6 },
  bubbleRow: { maxWidth: "78%", marginBottom: 2 },
  bubbleRowOwn: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleRowOther: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn: { backgroundColor: Theme.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#e2e8f0", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextOwn: { color: "#fff" },
  bubbleTextOther: { color: "#1e293b" },
  bubbleTime: { fontSize: 10, color: "#94a3b8", marginTop: 3 },

  emptyMsg: { alignItems: "center", paddingVertical: 32 },
  emptyMsgText: { fontSize: 13, color: "#94a3b8", fontStyle: "italic" },

  // Input
  inputWrap: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  quickContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  quickChip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0",
    maxWidth: 220,
  },
  quickChipText: { fontSize: 12, color: "#334155", fontWeight: "500" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  input: {
    flex: 1, backgroundColor: "#f8fafc", borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: Theme.textPrimary,
    borderWidth: 1, borderColor: "#e2e8f0",
    maxHeight: 96,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.primary,
    alignItems: "center", justifyContent: "center",
    shadowColor: Theme.primary, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  sendBtnDisabled: { backgroundColor: "#c5cae9", shadowOpacity: 0 },
});
