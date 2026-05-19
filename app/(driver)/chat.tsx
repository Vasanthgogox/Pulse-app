/**
 * Driver chat screen — trip threads where this driver is the party.
 * Fleet-only system status logs (message_type system) are hidden here; they remain visible in Command Hub.
 * Ledger cards and doc-share are visible but actions are read-only (no add-to-book or share).
 */
import { AppLoadingSplash } from "@/components/AppLoadingSplash";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, MessageSquare } from "lucide-react-native";
import { CHAT_MOBILE } from "@/features/chat/chatMobileLayout";
import { dockPaddingBottom, useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { ChatMobileComposer } from "@/features/chat/components/ChatMobileComposer";
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

  const avatarSize = CHAT_MOBILE.avatarSize;

  return (
    <View style={[dr.bubbleWrap, isOwn ? dr.bubbleWrapOwn : dr.bubbleWrapOther]}>
      {!isOwn && <LetterAvatar name={senderName ?? "?"} size={avatarSize} />}
      <View style={{ maxWidth: CHAT_MOBILE.bubbleMaxWidthPct }}>
        <View style={[dr.bubble, isOwn ? dr.bubbleOwn : dr.bubbleOther]}>
          <Text style={[dr.bubbleText, isOwn ? dr.bubbleTextOwn : dr.bubbleTextOther]}>{content}</Text>
        </View>
        <Text style={[dr.bubbleMeta, isOwn && dr.bubbleMetaOwn]}>
          {displayTime}{senderName ? ` · ${senderName.toUpperCase()}` : " · YOU"}
        </Text>
      </View>
      {isOwn && <LetterAvatar name="Me" own size={avatarSize} />}
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
      activeOpacity={0.75}
    >
      <View style={[dr.convAvatar, active && dr.convAvatarActive]}>
        <Text style={[dr.convAvatarText, active && dr.convAvatarTextActive]}>
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
  onSend,
  onSendTripChat,
  onBack,
}: {
  conv: TripConversation;
  messageInput: string;
  setMessageInput: (v: string) => void;
  onSend: () => void;
  /** Mirrors Quick Status into trip_messages so Command Hub receives it (notes alone do not sync). */
  onSendTripChat: (text: string) => Promise<void>;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const { keyboardVisible: keyboardOpen } = useKeyboardVisible();
  const [trip, setTrip] = useState<TripRow | null>(null);

  // Scroll to bottom when keyboard opens so composer stays visible
  useEffect(() => {
    if (Platform.OS === "web") return;
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(showEvt, () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), Platform.OS === "ios" ? 80 : 120);
    });
    return () => sub.remove();
  }, []);
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

  const handleComposerSend = useCallback(() => {
    void onSend();
  }, [onSend]);

  return (
    <KeyboardAvoidingView
      style={dr.threadRoot}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
      enabled={Platform.OS === "ios"}
    >
      <View style={dr.threadHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={dr.threadBackBtn}>
          <ArrowLeft size={22} color="#111B21" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={dr.threadHeaderTitle} numberOfLines={1}>{conv.trip_number}</Text>
          <Text style={dr.threadHeaderSub} numberOfLines={1}>
            {conv.pickup_area} → {conv.drop_location}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={dr.threadScroll}
        contentContainerStyle={dr.threadScrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
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

      <View
        style={[
          dr.composerDock,
          { paddingBottom: dockPaddingBottom(insets.bottom, keyboardOpen) },
        ]}
      >
        {predefinedForStep.length > 0 ? (
          <View style={dr.quickStatusBlock}>
            <Text style={dr.quickStatusLabel}>Quick status</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={dr.quickStatusChipRow}
              keyboardShouldPersistTaps="handled"
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
        <ChatMobileComposer
          value={messageInput}
          onChangeText={setMessageInput}
          onSend={handleComposerSend}
          quickMessages={DRIVER_QUICK_MESSAGES}
          hideQuickChips={keyboardOpen}
          placeholder="Message"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

export default function DriverChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  /** Match `app/(driver)/index.tsx` — tab bar is `position: 'absolute'`, so content must clear the glass dock. */
  const driverTabBarClearance = useMemo(() => {
    const footerPadTop = 4;
    const footerPadBottom = Math.max(Math.round(insets.bottom * 0.35), 10);
    return Layout.tabBarDockHeight + footerPadTop + footerPadBottom;
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
    await sendMessage(selectedConv.id, selectedConv.organization_id, text);
  };

  const openConv = (conv: TripConversation) => {
    setSelectedId(conv.id);
    markAsRead(conv.id);
    setMessageInput("");
  };

  if (normalizedTripId) {
    if (openingTripThread) {
      return (
        <View style={[dr.root, screenPadding]}>
          <AppLoadingSplash variant="preparing" style={{ flex: 1 }} />
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
          <AppLoadingSplash variant="preparing" style={{ flex: 1 }} />
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
            onSend={handleSend}
            onSendTripChat={(text) =>
              sendMessage(selectedConv.id, selectedConv.organization_id, text)
            }
            onBack={() => {
              setSelectedId(null);
              setMessageInput("");
              router.back();
            }}
          />
        </View>
      );
    }
    return (
      <View style={[dr.root, screenPadding]}>
        <AppLoadingSplash variant="preparing" style={{ flex: 1 }} />
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
            <AppLoadingSplash variant="preparing" style={{ flex: 1 }} />
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
              contentContainerStyle={dr.convListContent}
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
          onSend={handleSend}
          onSendTripChat={(text) =>
            sendMessage(selectedConv.id, selectedConv.organization_id, text)
          }
          onBack={() => { setSelectedId(null); setMessageInput(""); }}
        />
      )}
    </View>
  );
}

const dr = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },

  convListContent: { paddingBottom: 8 },

  threadRoot: { flex: 1, backgroundColor: CHAT_MOBILE.wallpaper },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: CHAT_MOBILE.headerBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CHAT_MOBILE.headerBorder,
  },
  threadBackBtn: { padding: 4 },
  threadHeaderTitle: {
    fontSize: CHAT_MOBILE.headerTitleSize,
    fontWeight: "700",
    color: "#111B21",
    letterSpacing: -0.15,
  },
  threadHeaderSub: {
    fontSize: CHAT_MOBILE.headerSubtitleSize,
    color: "#667781",
    marginTop: 1,
  },
  threadScroll: { flex: 1 },
  threadScrollContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 6,
    paddingBottom: 12,
  },
  composerDock: {
    backgroundColor: "transparent",
    flexShrink: 0,
  },

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
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: CHAT_MOBILE.listRowPad,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E9EDEF",
  },
  convItemActive: {
    backgroundColor: "#F0F2F5",
  },
  convAvatar: {
    width: CHAT_MOBILE.listAvatar,
    height: CHAT_MOBILE.listAvatar,
    borderRadius: CHAT_MOBILE.listAvatar / 2,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  convAvatarActive: { backgroundColor: Theme.driverEmerald },
  convAvatarText: { fontSize: 11, fontWeight: "800", color: Theme.driverEmeraldDark },
  convAvatarTextActive: { color: "#fff" },
  convBody: { flex: 1, minWidth: 0 },
  convRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  convTitle: {
    fontSize: CHAT_MOBILE.listTitleSize,
    fontWeight: "600",
    color: "#111B21",
    flex: 1,
  },
  convTitleActive: { color: "#111B21" },
  convTime: {
    fontSize: CHAT_MOBILE.listTimeSize,
    color: "#667781",
    marginLeft: 8,
    flexShrink: 0,
  },
  convTimeActive: { color: "#667781" },
  convRoute: { fontSize: 11, color: Theme.driverEmeraldDark, fontWeight: "600", marginBottom: 2 },
  convRouteActive: { color: Theme.driverEmeraldDark },
  convPrev: { fontSize: CHAT_MOBILE.listPreviewSize, color: "#667781", lineHeight: 17 },
  convPrevActive: { color: "#667781" },

  bubbleWrap: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  bubbleWrapOwn: { justifyContent: "flex-end" },
  bubbleWrapOther: { justifyContent: "flex-start" },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: CHAT_MOBILE.bubblePadH,
    paddingVertical: CHAT_MOBILE.bubblePadV,
  },
  bubbleOwn: {
    backgroundColor: Theme.driverEmerald,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 0,
  },
  bubbleText: {
    fontSize: CHAT_MOBILE.bubbleFontSize,
    lineHeight: CHAT_MOBILE.bubbleLineHeight,
  },
  bubbleTextOwn: { color: "#fff" },
  bubbleTextOther: { color: "#111B21" },
  bubbleMeta: {
    fontSize: CHAT_MOBILE.metaFontSize,
    color: "#8696A0",
    marginTop: 2,
  },
  bubbleMetaOwn: { textAlign: "right" },

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
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: CHAT_MOBILE.composerBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_MOBILE.headerBorder,
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

});
