/**
 * Driver chat screen — trip threads where this driver is the party.
 * Fleet-only system status logs (message_type system) are hidden here; they remain visible in Command Hub.
 * Ledger cards and doc-share are visible but actions are read-only (no add-to-book or share).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { ArrowLeft, MessageSquare, Send, Smile } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useDriverChat } from "@/features/chat/contexts/DriverChatContext";
import { DocumentShareCard } from "@/features/chat/components/DocumentShareCard";
import type { TripConversation, TripMessageRow } from "@/features/chat/types/chat.types";
import {
  appendDriverStatusNote,
  deriveDriverFlowStepFromTrip,
  DRIVER_PREDEFINED_STATUS_BY_STEP,
  parseDriverUpdatesFromNotes,
  type ParsedDriverStatusNote,
} from "@/lib/driverTripStatusNotes.util";
import type { TripRow } from "@/services/tripsService";
import * as tripsService from "@/services/tripsService";

const QUICK_EMOJIS = ["👍", "🚛", "📍", "✅", "📦", "⚠️", "🕒", "📞", "💯"];

/** Last chat bubble preview for list rows — fleet system broadcasts excluded. */
function lastVisibleDriverChatMessage(messages: TripMessageRow[]): TripMessageRow | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.message_type !== "system") return m;
  }
  return undefined;
}

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
        backgroundColor: own ? Theme.driverEmeraldDark : "#efefef",
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
  const last = lastVisibleDriverChatMessage(conv.messages);
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

function DriverStatusNoteCard({ u }: { u: ParsedDriverStatusNote }) {
  let displayTime = u.timestamp;
  try {
    displayTime = new Date(u.timestamp).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }
  return (
    <View style={dr.statusNoteCard}>
      <View style={dr.statusNoteDot} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={dr.statusNoteMsg}>{u.message}</Text>
        <Text style={dr.statusNoteTime}>{displayTime}</Text>
      </View>
    </View>
  );
}

function isStatusNoteRedundantWithChat(
  u: ParsedDriverStatusNote,
  messages: TripMessageRow[],
): boolean {
  const t = new Date(u.timestamp).getTime();
  return messages.some(
    (m) =>
      m.sender_role === "driver" &&
      m.message_type === "text" &&
      m.content.trim() === u.message.trim() &&
      Math.abs(new Date(m.created_at).getTime() - t) < 120_000,
  );
}

function MessageThread({
  conv,
  messageInput,
  setMessageInput,
  showEmoji,
  setShowEmoji,
  onSend,
  onSendTripChat,
  onBack,
}: {
  conv: TripConversation;
  messageInput: string;
  setMessageInput: (v: string) => void;
  showEmoji: boolean;
  setShowEmoji: (v: boolean) => void;
  onSend: () => void;
  /** Mirrors Quick Status into trip_messages so Command Hub receives it (notes alone do not sync). */
  onSendTripChat: (text: string) => Promise<void>;
  onBack: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [statusSending, setStatusSending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTrip(null);
    void tripsService.getTripById(conv.trip_id).then(({ trip: t }) => {
      if (!cancelled) setTrip(t);
    });
    return () => {
      cancelled = true;
    };
  }, [conv.trip_id]);

  const statusNotes = useMemo(
    () => parseDriverUpdatesFromNotes(trip?.notes ?? null),
    [trip?.notes],
  );

  const merged = useMemo(() => {
    type Row =
      | { key: string; kind: "msg"; m: TripMessageRow }
      | { key: string; kind: "status"; u: ParsedDriverStatusNote };
    const items: Row[] = [];
    for (const m of conv.messages) {
      if (m.message_type === "system") continue;
      items.push({ key: `m-${m.id}`, kind: "msg", m });
    }
    statusNotes.forEach((u, i) => {
      if (isStatusNoteRedundantWithChat(u, conv.messages)) return;
      items.push({
        key: `s-${u.timestamp}-${i}-${u.message.slice(0, 12)}`,
        kind: "status",
        u,
      });
    });
    items.sort((a, b) => {
      const ta = a.kind === "msg" ? new Date(a.m.created_at).getTime() : new Date(a.u.timestamp).getTime();
      const tb = b.kind === "msg" ? new Date(b.m.created_at).getTime() : new Date(b.u.timestamp).getTime();
      return ta - tb;
    });
    return items;
  }, [conv.messages, statusNotes]);

  const flowStep = trip ? deriveDriverFlowStepFromTrip(trip) : "completed";
  const predefinedForStep = DRIVER_PREDEFINED_STATUS_BY_STEP[flowStep] ?? [];

  const sendStatusLine = async (label: string) => {
    if (!trip || flowStep === "completed") return;
    setStatusSending(label);
    const res = await appendDriverStatusNote(trip.id, flowStep, label);
    if (!res.error) {
      const { trip: next } = await tripsService.getTripById(conv.trip_id);
      if (next) setTrip(next);
      try {
        await onSendTripChat(label);
      } catch {
        // Notes updated; chat sync failed — user can resend from text field
      }
    }
    setStatusSending(null);
  };

  const renderMessage = (m: TripMessageRow) => {
    if (m.message_type === "document_share") {
      return <DocumentShareCard message={m} isOwn={m.sender_role === "driver"} />;
    }
    if (m.message_type === "ledger_event") {
      return null;
    }
    return (
      <ChatBubble
        isOwn={m.sender_role === "driver"}
        content={m.content}
        timestamp={m.created_at}
        senderName={m.sender_role !== "driver" ? m.sender_name : undefined}
      />
    );
  };

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

      {/* Messages + trip status notes (same timeline) */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {merged.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
              No messages yet — use quick status or reply below.
            </Text>
          </View>
        ) : (
          merged.map((row) =>
            row.kind === "status" ? (
              <DriverStatusNoteCard key={row.key} u={row.u} />
            ) : (
              <View key={row.key}>{renderMessage(row.m)}</View>
            ),
          )
        )}
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
        {predefinedForStep.length > 0 ? (
          <View style={dr.quickStatusBlock}>
            <Text style={dr.quickStatusLabel}>Quick status</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={dr.quickStatusChipRow}
            >
              {predefinedForStep.map((label) => (
                <TouchableOpacity
                  key={label}
                  style={[dr.quickStatusChip, statusSending === label && dr.quickStatusChipBusy]}
                  onPress={() => void sendStatusLine(label)}
                  disabled={!!statusSending || !trip}
                  activeOpacity={0.75}
                >
                  {statusSending === label ? (
                    <ActivityIndicator size="small" color="#0f172a" />
                  ) : (
                    <Text style={dr.quickStatusChipText} numberOfLines={2}>{label}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}
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
  /** Match `app/(driver)/index.tsx` — tab bar is `position: 'absolute'`, so content must clear the glass dock. */
  const driverTabBarClearance = useMemo(() => {
    const tabBarVerticalPad = Math.max(insets.bottom / 4, 4);
    return Layout.tabBarDockHeight + tabBarVerticalPad + (tabBarVerticalPad + 6);
  }, [insets.bottom]);
  const screenPadding = useMemo(
    () => ({ paddingTop: insets.top, paddingBottom: driverTabBarClearance }),
    [insets.top, driverTabBarClearance],
  );
  const params = useLocalSearchParams<{ tripId?: string | string[] }>();
  const normalizedTripId = useMemo(() => {
    const raw = params.tripId;
    const v = typeof raw === "string" ? raw : raw?.[0];
    const t = v?.trim();
    return t ? t : null;
  }, [params.tripId]);

  const {
    conversations,
    isLoading,
    sendMessage,
    markAsRead,
    ensureDriverTripConversation,
  } = useDriverChat();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [openingTripThread, setOpeningTripThread] = useState(false);
  const [tripThreadError, setTripThreadError] = useState<string | null>(null);

  useEffect(() => {
    if (!normalizedTripId) {
      setOpeningTripThread(false);
      setTripThreadError(null);
      return;
    }
    let cancelled = false;
    setOpeningTripThread(true);
    setTripThreadError(null);
    setSelectedId(null);
    setMessageInput("");
    setShowEmoji(false);
    void ensureDriverTripConversation(normalizedTripId).then((convId) => {
      if (cancelled) return;
      setOpeningTripThread(false);
      if (convId) {
        setSelectedId(convId);
        void markAsRead(convId);
      } else {
        setTripThreadError("Could not open chat for this trip.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [normalizedTripId, ensureDriverTripConversation, markAsRead]);

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

  if (normalizedTripId) {
    if (openingTripThread) {
      return (
        <View style={[dr.root, screenPadding]}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={Theme.primary} size="large" />
          </View>
        </View>
      );
    }
    if (tripThreadError) {
      return (
        <View style={[dr.root, screenPadding, { paddingHorizontal: 24 }]}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
            <MessageSquare size={40} color="#e2e8f0" />
            <Text style={{ fontSize: 15, color: "#475569", textAlign: "center" }}>{tripThreadError}</Text>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                marginTop: 4,
                backgroundColor: "#0f172a",
                paddingHorizontal: 22,
                paddingVertical: 12,
                borderRadius: 12,
              }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    if (selectedId && !selectedConv) {
      return (
        <View style={[dr.root, screenPadding]}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color={Theme.primary} size="large" />
          </View>
        </View>
      );
    }
    if (selectedConv) {
      return (
        <View style={[dr.root, screenPadding]}>
          <MessageThread
            conv={selectedConv}
            messageInput={messageInput}
            setMessageInput={setMessageInput}
            showEmoji={showEmoji}
            setShowEmoji={setShowEmoji}
            onSend={handleSend}
            onSendTripChat={(text) =>
              sendMessage(selectedConv.id, selectedConv.organization_id, text)
            }
            onBack={() => {
              setSelectedId(null);
              setMessageInput("");
              setShowEmoji(false);
              router.back();
            }}
          />
        </View>
      );
    }
    return (
      <View style={[dr.root, screenPadding]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={Theme.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={[dr.root, screenPadding]}>
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
                Open messages from Trip (active trip) or Trip history detail — chats are tied to each trip.
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
          onSendTripChat={(text) =>
            sendMessage(selectedConv.id, selectedConv.organization_id, text)
          }
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
    backgroundColor: Theme.driverEmeraldDark,
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
  convItemActive: {
    backgroundColor: Theme.driverEmeraldDark,
    borderColor: Theme.driverEmeraldDark,
  },
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
    backgroundColor: Theme.driverEmeraldDark,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
  },
  headerTitle: { fontSize: 15, fontWeight: "900", color: "#fff", textTransform: "uppercase", fontStyle: "italic" },
  headerSub: { fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: "600", marginTop: 2 },

  bubbleWrap: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  bubbleWrapOwn: { justifyContent: "flex-end" },
  bubbleWrapOther: { justifyContent: "flex-start" },
  bubble: { borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9 },
  bubbleOwn: {
    backgroundColor: Theme.driverEmerald,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#fff", borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: "#f0f0f0",
    shadowColor: "#0f172a", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextOwn: { color: "#fff" },
  bubbleTextOther: { color: "#1e293b" },
  bubbleMeta: { fontSize: 9, color: "#94a3b8", marginTop: 3, letterSpacing: 0.2 },

  statusNoteCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f8fafc",
    maxWidth: "90%",
    alignSelf: "flex-start",
  },
  statusNoteDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10b981",
    marginTop: 5,
  },
  statusNoteMsg: { fontSize: 14, fontWeight: "600", color: "#0f172a", lineHeight: 20 },
  statusNoteTime: { fontSize: 11, color: "#94a3b8", marginTop: 3, fontWeight: "500" },

  quickStatusBlock: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  quickStatusLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  quickStatusChipRow: { gap: 8, paddingBottom: 4, alignItems: "stretch" },
  quickStatusChip: {
    maxWidth: 200,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    minHeight: 40,
    justifyContent: "center",
  },
  quickStatusChipBusy: { opacity: 0.7 },
  quickStatusChipText: { fontSize: 11, color: "#047857", fontWeight: "600" },

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
    backgroundColor: Theme.driverEmerald,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnOff: { backgroundColor: "#e2e8f0" },
});
