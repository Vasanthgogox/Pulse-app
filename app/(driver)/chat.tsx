/**
 * Driver chat screen — shows all trip conversations where this driver is the party.
 * Drivers can read all messages (including system events) and reply as "driver" role.
 * Ledger cards and doc-share are visible but actions are read-only (no add-to-book or share).
 */
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, MessageSquare, Send, Smile, X } from "lucide-react-native";
import { useRouter } from "expo-router";
import Theme from "@/constants/Theme";
import { useDriverChat } from "@/features/chat/contexts/DriverChatContext";
import { ChatSystemEventCard } from "@/features/chat/components/ChatEventCard";
import { DocumentShareCard } from "@/features/chat/components/DocumentShareCard";
import type { TripConversation, TripMessageRow } from "@/features/chat/types/chat.types";

const QUICK_EMOJIS = ["👍", "🚛", "📍", "✅", "📦", "⚠️", "🕒", "📞", "💯"];

const DRIVER_QUICK_MESSAGES = [
  "I have arrived at pickup.",
  "Loading in progress.",
  "Documents collected. Departing now.",
  "En route to delivery point.",
  "I have reached the destination.",
  "POD submitted. Trip complete.",
  "Need assistance — please call.",
  "Running 30 minutes behind schedule.",
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function LetterAvatar({ name, own, size = 32 }: { name: string; own?: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: own ? "#0f172a" : "#efefef",
        borderWidth: 1, borderColor: own ? "transparent" : "#e5e7eb",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      <Text style={{ fontSize: size * 0.33, fontWeight: "700", color: own ? "#fff" : "#4b5563" }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

function ChatBubble({ isOwn, content, timestamp, senderName }: {
  isOwn: boolean; content: string; timestamp: string; senderName?: string;
}) {
  let displayTime = timestamp;
  try {
    displayTime = new Date(timestamp).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { }

  return (
    <View style={[dr.bubbleWrap, isOwn ? dr.bubbleWrapOwn : dr.bubbleWrapOther]}>
      {!isOwn && <LetterAvatar name={senderName ?? "?"} size={28} />}
      <View style={{ maxWidth: "72%" }}>
        <View style={[dr.bubble, isOwn ? dr.bubbleOwn : dr.bubbleOther]}>
          <Text style={[dr.bubbleText, isOwn ? dr.bubbleTextOwn : dr.bubbleTextOther]}>{content}</Text>
        </View>
        <Text style={[dr.bubbleMeta, isOwn && { textAlign: "right" }]}>
          {displayTime}{senderName ? ` · ${senderName.toUpperCase()}` : " · YOU"}
        </Text>
      </View>
      {isOwn && <LetterAvatar name="Me" own size={28} />}
    </View>
  );
}

function ConvListItem({ conv, active, onPress }: {
  conv: TripConversation; active: boolean; onPress: () => void;
}) {
  const last = conv.messages[conv.messages.length - 1];
  const time = conv.last_message_at
    ? new Date(conv.last_message_at).toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", hour12: true,
      })
    : "";

  return (
    <TouchableOpacity
      style={[dr.convItem, active && dr.convItemActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[dr.convAvatar, active && dr.convAvatarActive]}>
        <Text style={{ fontSize: 11, fontWeight: "900", color: active ? "#fff" : "#0f172a" }}>
          {(conv.trip_number || "TR").slice(0, 3).toUpperCase()}
        </Text>
      </View>
      <View style={dr.convBody}>
        <View style={dr.convRow}>
          <Text style={[dr.convTitle, active && dr.convTitleActive]} numberOfLines={1}>
            {conv.trip_number}
          </Text>
          <Text style={[dr.convTime, active && dr.convTimeActive]}>{time}</Text>
        </View>
        <Text style={[dr.convRoute, active && dr.convRouteActive]} numberOfLines={1}>
          {conv.pickup_area} → {conv.drop_location}
        </Text>
        {last ? (
          <Text style={[dr.convPrev, active && dr.convPrevActive]} numberOfLines={1}>
            {last.content}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function MessageThread({
  conv,
  messageInput,
  setMessageInput,
  showEmoji,
  setShowEmoji,
  onSend,
  onBack,
}: {
  conv: TripConversation;
  messageInput: string;
  setMessageInput: (v: string) => void;
  showEmoji: boolean;
  setShowEmoji: (v: boolean) => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={dr.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={dr.backBtn}>
          <ArrowLeft size={18} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={dr.headerTitle} numberOfLines={1}>{conv.trip_number}</Text>
          <Text style={dr.headerSub} numberOfLines={1}>
            {conv.pickup_area} → {conv.drop_location}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {conv.messages.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No messages yet</Text>
          </View>
        )}
        {conv.messages.map((m) => {
          if (m.message_type === "system") {
            return <ChatSystemEventCard key={m.id} message={m} />;
          }
          if (m.message_type === "document_share") {
            return <DocumentShareCard key={m.id} message={m} isOwn={m.sender_role === "driver"} />;
          }
          // ledger_event: show read-only (no add-to-book for driver)
          if (m.message_type === "ledger_event") {
            return (
              <View key={m.id} style={dr.ledgerReadOnly}>
                <Text style={dr.ledgerReadOnlyText}>{m.content}</Text>
              </View>
            );
          }
          return (
            <ChatBubble
              key={m.id}
              isOwn={m.sender_role === "driver"}
              content={m.content}
              timestamp={m.created_at}
              senderName={m.sender_role !== "driver" ? m.sender_name : undefined}
            />
          );
        })}
      </ScrollView>

      {/* Input */}
      <View style={dr.inputWrap}>
        {showEmoji && (
          <View style={dr.emojiRow}>
            {QUICK_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                onPress={() => { setMessageInput(messageInput + e); setShowEmoji(false); }}
                style={dr.emojiBtn}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {/* Quick message chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={dr.chipRow}
        >
          {DRIVER_QUICK_MESSAGES.map((qm, i) => (
            <TouchableOpacity
              key={i}
              style={dr.chip}
              onPress={() => setMessageInput(qm)}
              activeOpacity={0.7}
            >
              <Text style={dr.chipText} numberOfLines={1}>{qm}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={dr.inputRow}>
          <TouchableOpacity
            style={dr.emojiToggle}
            onPress={() => setShowEmoji(!showEmoji)}
            hitSlop={6}
          >
            <Smile size={19} color={showEmoji ? Theme.primary : "#94a3b8"} />
          </TouchableOpacity>
          <TextInput
            style={dr.input}
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="Reply…"
            placeholderTextColor="#b0b8c8"
            multiline
          />
          <TouchableOpacity
            style={[dr.sendBtn, !messageInput.trim() && dr.sendBtnOff]}
            onPress={onSend}
            disabled={!messageInput.trim()}
            activeOpacity={0.85}
          >
            <Send size={15} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function DriverChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { conversations, isLoading, sendMessage, markAsRead } = useDriverChat();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;

  const handleSend = async () => {
    const text = messageInput.trim();
    if (!text || !selectedConv) return;
    setMessageInput("");
    setShowEmoji(false);
    await sendMessage(selectedConv.id, selectedConv.organization_id, text);
  };

  const openConv = (conv: TripConversation) => {
    setSelectedId(conv.id);
    markAsRead(conv.id);
    setMessageInput("");
    setShowEmoji(false);
  };

  return (
    <View style={[dr.root, { paddingTop: insets.top }]}>
      {/* List or detail */}
      {!selectedConv ? (
        <View style={{ flex: 1 }}>
          <View style={dr.listHeader}>
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace("/(driver)")}
              hitSlop={10}
              style={dr.backBtn}
            >
              <ArrowLeft size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={dr.brandTitle}>Trip Messages</Text>
          </View>

          {isLoading ? (
            <View style={{ paddingTop: 48, alignItems: "center" }}>
              <ActivityIndicator color={Theme.primary} />
            </View>
          ) : conversations.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 64, gap: 12 }}>
              <MessageSquare size={36} color="#e2e8f0" />
              <Text style={{ fontSize: 14, color: "#94a3b8" }}>No trip messages yet</Text>
              <Text style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", paddingHorizontal: 32, lineHeight: 18 }}>
                Your dispatcher will start a chat when you are assigned a trip.
              </Text>
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ padding: 12, gap: 6 }}
              renderItem={({ item }) => (
                <ConvListItem
                  conv={item}
                  active={selectedId === item.id}
                  onPress={() => openConv(item)}
                />
              )}
            />
          )}
        </View>
      ) : (
        <MessageThread
          conv={selectedConv}
          messageInput={messageInput}
          setMessageInput={setMessageInput}
          showEmoji={showEmoji}
          setShowEmoji={setShowEmoji}
          onSend={handleSend}
          onBack={() => { setSelectedId(null); setMessageInput(""); setShowEmoji(false); }}
        />
      )}
    </View>
  );
}

const dr = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },

  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: "#0f172a",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -0.4,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },

  convItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, borderRadius: 18,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#eef2f7",
  },
  convItemActive: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  convAvatar: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: "#e8eaf6",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  convAvatarActive: { backgroundColor: "rgba(255,255,255,0.14)" },
  convBody: { flex: 1, minWidth: 0 },
  convRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  convTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", flex: 1, textTransform: "uppercase", fontStyle: "italic" },
  convTitleActive: { color: "#fff" },
  convTime: { fontSize: 9, color: "#94a3b8", marginLeft: 8, flexShrink: 0, fontWeight: "700", textTransform: "uppercase" },
  convTimeActive: { color: "rgba(255,255,255,0.5)" },
  convRoute: { fontSize: 11, color: Theme.primary, fontWeight: "700", marginBottom: 2 },
  convRouteActive: { color: "rgba(255,255,255,0.7)" },
  convPrev: { fontSize: 12, color: "#94a3b8", lineHeight: 16 },
  convPrevActive: { color: "rgba(255,255,255,0.6)" },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: "#0f172a",
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
  },
  headerTitle: { fontSize: 15, fontWeight: "900", color: "#fff", textTransform: "uppercase", fontStyle: "italic" },
  headerSub: { fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: "600", marginTop: 2 },

  bubbleWrap: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  bubbleWrapOwn: { justifyContent: "flex-end" },
  bubbleWrapOther: { justifyContent: "flex-start" },
  bubble: { borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleOwn: { backgroundColor: "#5b5ef4", borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: "#fff", borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: "#f0f0f0",
    shadowColor: "#0f172a", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextOwn: { color: "#fff" },
  bubbleTextOther: { color: "#1e293b" },
  bubbleMeta: { fontSize: 9, color: "#94a3b8", marginTop: 3, letterSpacing: 0.2 },

  ledgerReadOnly: {
    alignSelf: "center",
    backgroundColor: "#f0f9ff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#bae6fd",
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: "85%",
    marginVertical: 4,
  },
  ledgerReadOnlyText: { fontSize: 12, color: "#0369a1", fontWeight: "500", textAlign: "center" },

  inputWrap: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingBottom: 8 },
  emojiRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 4,
    padding: 10, borderBottomWidth: 1, borderBottomColor: "#f1f5f9",
  },
  emojiBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  chipRow: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
    backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e8eaf6",
  },
  chipText: { fontSize: 11, color: "#475569", fontWeight: "500" },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4,
  },
  emojiToggle: { padding: 6 },
  input: {
    flex: 1, backgroundColor: "#f1f5f9", borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: "#1e293b", maxHeight: 96,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Theme.primary, alignItems: "center", justifyContent: "center",
  },
  sendBtnOff: { backgroundColor: "#e2e8f0" },
});
