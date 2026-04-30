import React, { useRef, useState } from "react";
import {
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
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Briefcase,
  Filter,
  MessageSquare,
  MoreVertical,
  Plus,
  Route,
  Search,
  Send,
  ShoppingCart,
  Smile,
  FileType,
  Truck,
  Users,
  Warehouse,
  X,
  XCircle,
  Trash2,
} from "lucide-react-native";
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
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
  { id: "mkt-1", contactName: "Raj Transport", listingTitle: "Tata 407 - 2019 Model", listingType: "vehicle", lastMessage: "Yes, it's available. When can you come?", lastMessageTime: "2 min ago", unreadCount: 2, isOnline: true, messages: [{ id: "m1", sender: "me", content: "Is this still available?", timestamp: "10:30 AM" }, { id: "m2", sender: "them", content: "Yes, it's available. When can you come for inspection?", timestamp: "10:42 AM" }] },
  { id: "mkt-2", contactName: "Kumar Logistics", listingTitle: "20000 sqft Warehouse - Nashik", listingType: "warehouse", lastMessage: "All documents are complete.", lastMessageTime: "1 hour ago", unreadCount: 0, isOnline: false, messages: [{ id: "m1", sender: "me", content: "Are all documents complete?", timestamp: "9:00 AM" }, { id: "m2", sender: "them", content: "All documents are complete.", timestamp: "9:15 AM" }] },
  { id: "mkt-3", contactName: "Singh Fleet", listingTitle: "Experienced Trailer Driver Needed", listingType: "job", lastMessage: "We offer ₹35,000 per month with benefits.", lastMessageTime: "Yesterday", unreadCount: 1, isOnline: true, messages: [{ id: "m1", sender: "me", content: "What is the salary range?", timestamp: "Yesterday" }, { id: "m2", sender: "them", content: "We offer ₹35,000 per month with benefits.", timestamp: "Yesterday" }] },
];

const QUICK_EMOJIS = ["👍", "🤝", "🚛", "📍", "🏢", "💰", "✅", "📦", "⚠️", "🕒", "😊", "🙌"];

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <View style={b.wrap}><Text style={b.text}>{count > 9 ? "9+" : String(count)}</Text></View>
  );
}
const b = StyleSheet.create({
  wrap: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Theme.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  text: { fontSize: 10, fontWeight: "800", color: "#fff" },
});

function LetterAvatar({ name, own, size = 36 }: { name: string; own?: boolean; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: own ? "#0f172a" : "#efefef", borderWidth: 1, borderColor: own ? "transparent" : "#e5e7eb", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Text style={{ fontSize: size * 0.33, fontWeight: "700", color: own ? "#fff" : "#4b5563" }}>{getInitials(name)}</Text>
    </View>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [activeTab, setActiveTab] = useState<TabId>("trips");
  const [isMobileDetail, setIsMobileDetail] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [tripCategory, setTripCategory] = useState<TripCategory>("updates");
  const messagesRef = useRef<ScrollView>(null);

  const [showEmoji, setShowEmoji] = useState(false);
  const [showScripts, setShowScripts] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [buyerScripts, setBuyerScripts] = useState(["Is this still available?", "What is the final offer price?", "When can I come for inspection?", "Please share more photos of the engine.", "Is the RC transfer included?"]);
  const [sellerScripts, setSellerScripts] = useState(["Yes, it is available.", "The price is slightly negotiable.", "You can visit after 10:00 AM tomorrow.", "All documents are verified and clear.", "We have 3 other interested buyers."]);
  const [newScript, setNewScript] = useState("");
  const [scriptType, setScriptType] = useState<"buyer" | "seller">("buyer");

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
  const closeDetail = () => { setIsMobileDetail(false); setSelectedTripId(null); setSelectedNetId(null); setSelectedMktId(null); setMessageInput(""); };

  const leaveMessaging = () => {
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.TABS.NETWORK);
  };

  const handleSend = () => {
    const text = messageInput.trim();
    if (!text) return;
    if (activeTab === "trips" && selectedTripId) sendTrip(selectedTripId, text, "dispatcher");
    else if (activeTab === "network" && selectedNetId) sendNet(selectedNetId, text, "dispatcher");
    else if (activeTab === "marketplace" && selectedMktId) {
      const ts = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      setMarketChats((prev) => prev.map((c) => c.id === selectedMktId ? { ...c, messages: [...c.messages, { id: `m-${Date.now()}`, sender: "me" as const, content: text, timestamp: ts }], lastMessage: text, lastMessageTime: "Just now" } : c));
    }
    setMessageInput("");
    setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const addScript = () => {
    if (!newScript.trim()) return;
    if (scriptType === "buyer") setBuyerScripts((p) => [...p, newScript.trim()]);
    else setSellerScripts((p) => [...p, newScript.trim()]);
    setNewScript("");
  };

  // ── List items ──────────────────────────────────────────────────────────────

  const renderTripItem = ({ item }: { item: TripChat }) => {
    const last = item.messages[item.messages.length - 1];
    const unread = item.messages.filter((m) => !m.isRead && m.senderRole !== "dispatcher").length;
    const active = selectedTripId === item.tripId;
    return (
      <TouchableOpacity style={[s.chatItem, active && s.chatItemActive]} onPress={() => { setSelectedTripId(item.tripId); markTripRead(item.tripId, "dispatcher"); openDetail(); }} activeOpacity={0.8}>
        <View style={[s.chatIcon, active && s.chatIconActive]}>
          <Route size={16} color={active ? "#fff" : Theme.primary} />
        </View>
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <Text style={[s.chatTitle, active && s.chatTitleActive]} numberOfLines={1}>{item.tripNumber} Group</Text>
            <Text style={[s.chatTime, active && s.chatTimeActive]}>{item.lastActivity}</Text>
          </View>
          <Text style={[s.chatSub, active && s.chatSubActive]} numberOfLines={1}>{last?.content ?? "No messages yet"}</Text>
        </View>
        {unread > 0 && !active && <Badge count={unread} />}
      </TouchableOpacity>
    );
  };

  const renderNetItem = ({ item }: { item: IntegratedChat }) => {
    const last = item.messages[item.messages.length - 1];
    const active = selectedNetId === item.id;
    return (
      <TouchableOpacity style={[s.chatItem, active && s.chatItemActive]} onPress={() => { setSelectedNetId(item.id); markNetRead(item.id); openDetail(); }} activeOpacity={0.8}>
        <LetterAvatar name={item.partnerName} size={38} />
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <Text style={[s.chatTitle, active && s.chatTitleActive]} numberOfLines={1}>{item.partnerName}</Text>
            <Text style={[s.chatTime, active && s.chatTimeActive]}>{item.lastActivity}</Text>
          </View>
          <Text style={[s.chatSub, active && s.chatSubActive]} numberOfLines={1}>{last?.content ?? ""}</Text>
        </View>
        {item.unreadCount > 0 && !active && <Badge count={item.unreadCount} />}
      </TouchableOpacity>
    );
  };

  const renderMktItem = ({ item }: { item: MarketplaceChat }) => {
    const active = selectedMktId === item.id;
    return (
      <TouchableOpacity style={[s.chatItem, active && s.chatItemActive]} onPress={() => { setSelectedMktId(item.id); setMarketChats((p) => p.map((c) => c.id === item.id ? { ...c, unreadCount: 0 } : c)); openDetail(); }} activeOpacity={0.8}>
        <LetterAvatar name={item.contactName} size={38} />
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <Text style={[s.chatTitle, active && s.chatTitleActive]} numberOfLines={1}>{item.contactName}</Text>
            <Text style={[s.chatTime, active && s.chatTimeActive]}>{item.lastMessageTime}</Text>
          </View>
          <Text style={[s.chatSub, active && s.chatSubActive]} numberOfLines={1}>{item.lastMessage}</Text>
        </View>
        {item.unreadCount > 0 && !active && <Badge count={item.unreadCount} />}
      </TouchableOpacity>
    );
  };

  // ── Chat list panel ──────────────────────────────────────────────────────────

  function ChatList() {
    const TABS: { id: TabId; label: string; unread: number; Icon: React.ComponentType<{ size: number; color: string }> }[] = [
      { id: "trips", label: "TRIP", unread: tripUnread, Icon: Route },
      { id: "marketplace", label: "MARKET", unread: mktUnread, Icon: ShoppingCart },
      { id: "network", label: "NETWORK", unread: netUnread, Icon: Users },
    ];
    return (
      <View style={s.listPanel}>
        {/* Branding header */}
        <View style={s.listHeader}>
          <View style={s.listHeaderLeft}>
            <TouchableOpacity
              onPress={leaveMessaging}
              hitSlop={12}
              style={s.listBackBtn}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ArrowLeft size={22} color="#0f172a" />
            </TouchableOpacity>
            <Text style={s.brandTitle} numberOfLines={1}>
              Comms.
            </Text>
          </View>
          <TouchableOpacity hitSlop={10}><Filter size={16} color="#94a3b8" /></TouchableOpacity>
        </View>
        {/* Tabs */}
        <View style={s.tabRow}>
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <TouchableOpacity key={t.id} style={[s.tabPill, active && s.tabPillActive]} onPress={() => setActiveTab(t.id)} activeOpacity={0.75}>
                <t.Icon size={12} color={active ? "#1e293b" : "#94a3b8"} />
                <Text style={[s.tabPillLabel, active && s.tabPillLabelActive]}>{t.label}</Text>
                {t.unread > 0 && <Badge count={t.unread} />}
              </TouchableOpacity>
            );
          })}
        </View>
        {/* List */}
        {activeTab === "trips" && <FlatList data={tripChats} keyExtractor={(i) => i.tripId} renderItem={renderTripItem} ListEmptyComponent={<EmptyList label="No trip chats" />} contentContainerStyle={{ padding: 10, paddingBottom: 24, gap: 4 }} />}
        {activeTab === "marketplace" && <FlatList data={marketChats} keyExtractor={(i) => i.id} renderItem={renderMktItem} ListEmptyComponent={<EmptyList label="No marketplace chats" />} contentContainerStyle={{ padding: 10, paddingBottom: 24, gap: 4 }} />}
        {activeTab === "network" && <FlatList data={netChats} keyExtractor={(i) => i.id} renderItem={renderNetItem} ListEmptyComponent={<EmptyList label="No network chats" />} contentContainerStyle={{ padding: 10, paddingBottom: 24, gap: 4 }} />}
      </View>
    );
  }

  // ── Detail panels ────────────────────────────────────────────────────────────

  function DetailHeader({ title, subtitle, avatarLabel }: { title: string; subtitle?: string; avatarLabel?: string }) {
    return (
      <View style={s.detailHeader}>
        {!isDesktop && (
          <TouchableOpacity onPress={closeDetail} hitSlop={10} style={{ marginRight: 8 }}>
            <ArrowLeft size={20} color="#1e293b" />
          </TouchableOpacity>
        )}
        <View style={s.detailIconWrap}>
          <MessageSquare size={18} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.detailTitle} numberOfLines={1}>{title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#22c55e" }} />
            <Text style={s.detailStatus}>{subtitle ?? "PROTOCOL ACTIVE"}</Text>
          </View>
        </View>
        <TouchableOpacity hitSlop={10}><Search size={17} color="#94a3b8" /></TouchableOpacity>
        <TouchableOpacity hitSlop={10} style={{ marginLeft: 8 }}><MoreVertical size={17} color="#94a3b8" /></TouchableOpacity>
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

  function Bubble({ isOwn, content, timestamp, senderName }: { isOwn: boolean; content: string; timestamp: string; senderName?: string }) {
    return (
      <View style={[s.bubbleWrap, isOwn ? s.bubbleWrapOwn : s.bubbleWrapOther]}>
        {!isOwn && <LetterAvatar name={senderName ?? "?"} size={32} />}
        <View style={{ maxWidth: "72%" }}>
          <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
            <Text style={[s.bubbleText, isOwn ? s.bubbleTextOwn : s.bubbleTextOther]}>{content}</Text>
          </View>
          <Text style={[s.bubbleMeta, isOwn && { textAlign: "right" }]}>
            {timestamp}{senderName ? ` · ${senderName.toUpperCase()}` : " · YOU"}
          </Text>
        </View>
        {isOwn && <LetterAvatar name="You" own size={32} />}
      </View>
    );
  }

  // ── Quick scripts popup ──────────────────────────────────────────────────────

  function ScriptsPopup({ msgs, hasManage }: { msgs: string[]; hasManage?: boolean }) {
    if (!showScripts) return null;
    return (
      <View style={s.scriptPopup}>
        <View style={s.scriptPopupHeader}>
          <Text style={s.scriptPopupTitle}>QUICK SCRIPTS</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {hasManage && (
              <TouchableOpacity onPress={() => { setShowScripts(false); setShowManage(true); }}>
                <Text style={s.manageLink}>MANAGE</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowScripts(false)} hitSlop={8}>
              <X size={15} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>
        {hasManage ? (
          <ScrollView style={{ maxHeight: 220 }}>
            <Text style={s.scriptSection}>BUYER</Text>
            {buyerScripts.map((m, i) => (
              <TouchableOpacity key={i} style={s.scriptItem} onPress={() => { setMessageInput(m); setShowScripts(false); }} activeOpacity={0.7}>
                <Text style={s.scriptItemText}>{m}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[s.scriptSection, { marginTop: 8 }]}>SELLER</Text>
            {sellerScripts.map((m, i) => (
              <TouchableOpacity key={i} style={s.scriptItem} onPress={() => { setMessageInput(m); setShowScripts(false); }} activeOpacity={0.7}>
                <Text style={s.scriptItemText}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <ScrollView style={{ maxHeight: 220 }}>
            {msgs.map((m, i) => (
              <TouchableOpacity key={i} style={s.scriptItem} onPress={() => { setMessageInput(m); setShowScripts(false); }} activeOpacity={0.7}>
                <Text style={s.scriptItemText}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  // ── Emoji popup ──────────────────────────────────────────────────────────────

  function EmojiPopup() {
    if (!showEmoji) return null;
    return (
      <View style={s.emojiPopup}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
          {QUICK_EMOJIS.map((e) => (
            <TouchableOpacity key={e} style={s.emojiBtn} onPress={() => { setMessageInput((p) => p + e); setShowEmoji(false); }} activeOpacity={0.7}>
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  // ── Input bar ────────────────────────────────────────────────────────────────

  function InputBar({ quickMsgs, hasManage }: { quickMsgs: string[]; hasManage?: boolean }) {
    return (
      <View style={s.inputWrap}>
        <EmojiPopup />
        <ScriptsPopup msgs={quickMsgs} hasManage={hasManage} />
        {/* Main input row */}
        <View style={s.inputRow}>
          <TouchableOpacity style={s.plusBtn} hitSlop={6}>
            <Plus size={16} color="#94a3b8" />
          </TouchableOpacity>
          <TextInput
            style={s.input}
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Type protocol command or message…"
            placeholderTextColor="#b0b8c8"
            multiline
          />
          <TouchableOpacity style={s.iconBtn} onPress={() => { setShowEmoji(!showEmoji); setShowScripts(false); }} hitSlop={6}>
            <Smile size={19} color={showEmoji ? Theme.primary : "#94a3b8"} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => { setShowScripts(!showScripts); setShowEmoji(false); }} hitSlop={6}>
            <FileType size={19} color={showScripts ? Theme.primary : "#94a3b8"} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.sendBtn, !messageInput.trim() && s.sendBtnOff]} onPress={handleSend} disabled={!messageInput.trim()} activeOpacity={0.85}>
            <Send size={15} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* Switch template */}
        <View style={s.templateSection}>
          <Text style={s.templateLabel}>SWITCH TEMPLATE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
            {(["updates", "questions", "challenges"] as TripCategory[]).map((c) => (
              <TouchableOpacity key={c} style={[s.tplChip, tripCategory === c && s.tplChipActive]} onPress={() => setTripCategory(c)} activeOpacity={0.75}>
                <Text style={[s.tplChipText, tripCategory === c && s.tplChipTextActive]}>{c.charAt(0).toUpperCase() + c.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        {/* Script chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 0 }} contentContainerStyle={s.chipRow}>
          {quickMsgs.map((m, i) => (
            <TouchableOpacity key={i} style={s.chip} onPress={() => setMessageInput(m)} activeOpacity={0.7}>
              <Text style={s.chipText} numberOfLines={1}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Manage scripts modal ──────────────────────────────────────────────────────

  function ManageModal() {
    return (
      <Modal visible={showManage} transparent animationType="fade" onRequestClose={() => setShowManage(false)}>
        <View style={ms.backdrop}>
          <View style={ms.sheet}>
            <View style={ms.header}>
              <View>
                <Text style={ms.title}>My Scripts.</Text>
                <Text style={ms.subtitle}>Customize your quick-response templates.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowManage(false)} style={ms.closeBtn}>
                <XCircle size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            {/* Add new */}
            <View style={ms.addBox}>
              <View style={ms.typeTabs}>
                <TouchableOpacity style={[ms.typeTab, scriptType === "buyer" && ms.typeTabActive]} onPress={() => setScriptType("buyer")}><Text style={[ms.typeTabText, scriptType === "buyer" && ms.typeTabTextActive]}>Buyer</Text></TouchableOpacity>
                <TouchableOpacity style={[ms.typeTab, scriptType === "seller" && ms.typeTabActive]} onPress={() => setScriptType("seller")}><Text style={[ms.typeTabText, scriptType === "seller" && ms.typeTabTextActive]}>Seller</Text></TouchableOpacity>
              </View>
              <View style={ms.addRow}>
                <TextInput style={ms.addInput} value={newScript} onChangeText={setNewScript} placeholder="Type new template script…" placeholderTextColor="#94a3b8" />
                <TouchableOpacity style={ms.addBtn} onPress={addScript} activeOpacity={0.8}>
                  <Text style={ms.addBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Lists */}
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 16 }}>
                {/* Buyer */}
                <View style={{ flex: 1 }}>
                  <Text style={ms.sectionLabel}>BUYER SCRIPTS</Text>
                  {buyerScripts.map((s, i) => (
                    <View key={i} style={ms.scriptRow}>
                      <Text style={ms.scriptText} numberOfLines={2}>{s}</Text>
                      <TouchableOpacity onPress={() => setBuyerScripts((p) => p.filter((_, j) => j !== i))} hitSlop={6}>
                        <Trash2 size={13} color="#cbd5e1" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                {/* Seller */}
                <View style={{ flex: 1 }}>
                  <Text style={ms.sectionLabel}>SELLER SCRIPTS</Text>
                  {sellerScripts.map((s, i) => (
                    <View key={i} style={ms.scriptRow}>
                      <Text style={ms.scriptText} numberOfLines={2}>{s}</Text>
                      <TouchableOpacity onPress={() => setSellerScripts((p) => p.filter((_, j) => j !== i))} hitSlop={6}>
                        <Trash2 size={13} color="#cbd5e1" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Detail views ─────────────────────────────────────────────────────────────

  function TripDetail() {
    if (!selectedTrip) return <EmptyDetail />;
    return (
      <View style={s.detailPanel}>
        <DetailHeader title={`${selectedTrip.tripNumber} Group`} />
        <ScrollView ref={messagesRef} style={s.msgs} contentContainerStyle={s.msgsContent} onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}>
          <SystemMsg label="AUDIT CHAIN SYNC · TODAY" />
          {selectedTrip.messages.length === 0 && <View style={{ alignItems: "center", paddingVertical: 32 }}><Text style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No messages yet</Text></View>}
          {selectedTrip.messages.map((m) => (
            <Bubble key={m.id} isOwn={m.senderRole === "dispatcher"} content={m.content} timestamp={m.timestamp} senderName={m.senderRole !== "dispatcher" ? m.senderName : undefined} />
          ))}
        </ScrollView>
        <InputBar quickMsgs={TRIP_QUICK_MESSAGES[tripCategory]} />
      </View>
    );
  }

  function NetworkDetail() {
    if (!selectedNet) return <EmptyDetail />;
    return (
      <View style={s.detailPanel}>
        <DetailHeader title={selectedNet.partnerName} subtitle={selectedNet.organization.toUpperCase()} />
        <ScrollView ref={messagesRef} style={s.msgs} contentContainerStyle={s.msgsContent} onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}>
          <SystemMsg label="SECURE CHANNEL · TODAY" />
          {selectedNet.messages.map((m) => (
            <Bubble key={m.id} isOwn={m.senderId === "dispatcher-1"} content={m.content} timestamp={m.timestamp} senderName={m.senderId !== "dispatcher-1" ? selectedNet.partnerName : undefined} />
          ))}
        </ScrollView>
        <InputBar quickMsgs={INTEGRATED_QUICK_MESSAGES} hasManage />
      </View>
    );
  }

  function MarketDetail() {
    if (!selectedMkt) return <EmptyDetail />;
    return (
      <View style={s.detailPanel}>
        <DetailHeader title={selectedMkt.contactName} subtitle={selectedMkt.listingTitle.toUpperCase()} />
        <ScrollView ref={messagesRef} style={s.msgs} contentContainerStyle={s.msgsContent} onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}>
          <SystemMsg label="MARKETPLACE CHANNEL · TODAY" />
          {selectedMkt.messages.map((m) => (
            <Bubble key={m.id} isOwn={m.sender === "me"} content={m.content} timestamp={m.timestamp} senderName={m.sender !== "me" ? selectedMkt.contactName : undefined} />
          ))}
        </ScrollView>
        <InputBar quickMsgs={buyerScripts} hasManage />
      </View>
    );
  }

  function CurrentDetail() {
    if (activeTab === "trips") return <TripDetail />;
    if (activeTab === "network") return <NetworkDetail />;
    return <MarketDetail />;
  }

  // ── Layout ───────────────────────────────────────────────────────────────────

  if (isDesktop) {
    return (
      <LinearGradient colors={["#edfafa", "#ffffff", "#eff6ff"]} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.desktop}>
          <View style={s.desktopList}><ChatList /></View>
          <View style={s.desktopDetail}><CurrentDetail /></View>
        </View>
        <ManageModal />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#edfafa", "#ffffff", "#eff6ff"]} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {!isMobileDetail ? <ChatList /> : <CurrentDetail />}
      <ManageModal />
    </LinearGradient>
  );
}

function EmptyList({ label }: { label: string }) {
  return (
    <View style={{ alignItems: "center", paddingTop: 48, gap: 8 }}>
      <MessageSquare size={32} color="#e2e8f0" />
      <Text style={{ fontSize: 13, color: "#94a3b8" }}>{label}</Text>
    </View>
  );
}

function EmptyDetail() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
      <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: "#e8eaf6", alignItems: "center", justifyContent: "center" }}>
        <MessageSquare size={34} color={Theme.primary} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "800", color: "#1e293b", letterSpacing: -0.5 }}>Select a conversation</Text>
      <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", paddingHorizontal: 40, lineHeight: 20 }}>
        Pick a trip, marketplace enquiry or network chat to start messaging.
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

  // List panel
  listPanel: { flex: 1, backgroundColor: "transparent" },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
  listHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  listBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  brandTitle: { fontSize: 22, fontWeight: "900", color: "#0f172a", letterSpacing: -0.8, fontStyle: "italic", flexShrink: 1 },

  // Tabs
  tabRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  tabPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: "transparent" },
  tabPillActive: { borderColor: "#e2e8f0", backgroundColor: "#fff" },
  tabPillLabel: { fontSize: 11, fontWeight: "700", color: "#94a3b8", letterSpacing: 0.3 },
  tabPillLabelActive: { color: "#1e293b" },

  // Chat item
  chatItem: { flexDirection: "row", alignItems: "center", gap: 11, padding: 12, borderRadius: 20, backgroundColor: "transparent" },
  chatItemActive: { backgroundColor: "#0f172a" },
  chatIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f0f0f0", alignItems: "center", justifyContent: "center" },
  chatIconActive: { backgroundColor: "rgba(255,255,255,0.14)" },
  chatBody: { flex: 1, minWidth: 0 },
  chatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  chatTitle: { fontSize: 13, fontWeight: "700", color: "#1e293b", flex: 1 },
  chatTitleActive: { color: "#fff" },
  chatTime: { fontSize: 10, color: "#94a3b8", marginLeft: 8, flexShrink: 0 },
  chatTimeActive: { color: "rgba(255,255,255,0.55)" },
  chatSub: { fontSize: 12, color: "#94a3b8", lineHeight: 16 },
  chatSubActive: { color: "rgba(255,255,255,0.65)" },

  // Detail header
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", backgroundColor: "#fff" },
  detailIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  detailTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", letterSpacing: -0.3 },
  detailStatus: { fontSize: 10, fontWeight: "700", color: "#22c55e", textTransform: "uppercase", letterSpacing: 0.8 },

  // Messages
  detailPanel: { flex: 1, backgroundColor: "transparent" },
  msgs: { flex: 1, backgroundColor: "transparent" },
  msgsContent: { padding: 20, gap: 12, paddingBottom: 24 },

  sysMsg: { alignSelf: "center", backgroundColor: "#f1f5f9", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginVertical: 4 },
  sysMsgText: { fontSize: 10, fontWeight: "700", color: "#94a3b8", letterSpacing: 1.2, textTransform: "uppercase" },

  bubbleWrap: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleWrapOwn: { justifyContent: "flex-end" },
  bubbleWrapOther: { justifyContent: "flex-start" },
  bubble: { borderRadius: 18, paddingHorizontal: 15, paddingVertical: 10 },
  bubbleOwn: { backgroundColor: "#5b5ef4", borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#f0f0f0", shadowColor: "#0f172a", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextOwn: { color: "#fff" },
  bubbleTextOther: { color: "#1e293b" },
  bubbleMeta: { fontSize: 10, color: "#94a3b8", marginTop: 4, letterSpacing: 0.2 },

  // Input area
  inputWrap: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  plusBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" },
  input: { flex: 1, backgroundColor: "#f1f5f9", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: "#1e293b", maxHeight: 96 },
  iconBtn: { padding: 6 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  sendBtnOff: { backgroundColor: "#e2e8f0" },

  // Switch template
  templateSection: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  templateLabel: { fontSize: 9, fontWeight: "800", color: "#94a3b8", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 6 },
  tplChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: "#f1f5f9" },
  tplChipActive: { backgroundColor: Theme.primary },
  tplChipText: { fontSize: 12, fontWeight: "600", color: "#64748b" },
  tplChipTextActive: { color: "#fff" },

  // Script chips row
  chipRow: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4, gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e8eaf6" },
  chipText: { fontSize: 12, color: "#475569", fontWeight: "500" },

  // Emoji popup
  emojiPopup: { position: "absolute", bottom: "100%", left: 14, backgroundColor: "#fff", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#f1f5f9", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 8, width: 240, zIndex: 50 },
  emojiBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10 },

  // Scripts popup
  scriptPopup: { position: "absolute", bottom: "100%", left: 14, backgroundColor: "#fff", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#f1f5f9", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 8, width: 280, zIndex: 50 },
  scriptPopupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  scriptPopupTitle: { fontSize: 9, fontWeight: "800", color: "#94a3b8", letterSpacing: 1.4, textTransform: "uppercase" },
  manageLink: { fontSize: 10, fontWeight: "800", color: Theme.primary, letterSpacing: 0.5 },
  scriptSection: { fontSize: 9, fontWeight: "800", color: "#cbd5e1", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 4, paddingHorizontal: 4 },
  scriptItem: { paddingHorizontal: 4, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#f8fafc" },
  scriptItemText: { fontSize: 13, color: "#334155" },
});

// ── Manage modal styles ───────────────────────────────────────────────────────

const ms = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: "#fff", borderRadius: 28, padding: 28, width: "100%", maxWidth: 600, maxHeight: "85%", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 40, shadowOffset: { width: 0, height: 10 }, elevation: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  title: { fontSize: 32, fontWeight: "900", color: "#0f172a", letterSpacing: -1, fontStyle: "italic" },
  subtitle: { fontSize: 14, color: "#94a3b8", marginTop: 4 },
  closeBtn: { padding: 4 },
  addBox: { backgroundColor: "#f8fafc", borderRadius: 20, padding: 16, marginBottom: 24 },
  typeTabs: { flexDirection: "row", gap: 10, marginBottom: 12 },
  typeTab: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0" },
  typeTabActive: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  typeTabText: { fontSize: 12, fontWeight: "700", color: "#64748b" },
  typeTabTextActive: { color: "#fff" },
  addRow: { flexDirection: "row", gap: 10 },
  addInput: { flex: 1, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 13, color: "#1e293b", borderWidth: 1, borderColor: "#e2e8f0" },
  addBtn: { backgroundColor: Theme.primary, borderRadius: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  addBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  sectionLabel: { fontSize: 9, fontWeight: "800", color: "#94a3b8", letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 10 },
  scriptRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#f8fafc", borderRadius: 12, padding: 12, marginBottom: 6, gap: 8 },
  scriptText: { flex: 1, fontSize: 12, color: "#334155" },
});
