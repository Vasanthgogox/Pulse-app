import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  FlatList,
  Modal,
  Platform,
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
  Bell,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Hash,
  MapPin,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Send,
  Smile,
  Star,
  FileType,
  Truck,
  User,
  Users,
  X,
} from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CHAT_ACCENT, CHAT_ACCENT_BORDER, CHAT_ACCENT_SOFT, CHAT_ICON_MUTED } from "@/features/chat/chatTheme";
import { formatChatPartyName } from "@/features/chat/utils/partyDisplay";
import Theme from "@/constants/Theme";
import { isAggregateTrip } from "@/lib/driverUtils";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import {
  QUICK_MESSAGES,
  TripConversation,
  useTripChat,
} from "@/features/chat/contexts/TripChatContext";
import { chatStore, useConversation, useConversationsByTrip, useTripMeta } from "@/features/chat/store/chatStore";
import {
  resolveOutgoingDeliveryStatus,
  useChatStore,
} from "@/features/chat/store/useChatStore";
import { MessageTick } from "@/features/chat/components/MessageTick";
import { useMarkSeen } from "@/features/chat/hooks/useMarkSeen";
import { SystemEventCard } from "@/features/chat/components/SystemEventCard";
import {
  INTEGRATED_QUICK_MESSAGES,
  IntegratedChat,
  useIntegratedChat,
  type NetworkPartner,
} from "@/features/chat/contexts/IntegratedChatContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  getMessagesByConversation,
  getTripsForCompose,
  sendDocumentShareMessage,
  TRIP_CHAT_HISTORY_PAGE,
  type TripForCompose,
} from "@/features/chat/services/chat.service";
import { getRatingsForTrip } from "@/features/ratings/services/ratings.service";
import type { RatingRow } from "@/features/ratings/types";
import {
  dedupeFeedbackRequestMessages,
  mergeTripChatMessagesWithFeedbackRatings,
} from "@/features/chat/utils/mergeTripFeedbackMessages.util";
import { dedupeTripStatusBroadcastsForLane } from "@/features/chat/utils/dedupeTripStatusBroadcastForLane.util";
import {
  acknowledgeLedgerEventMessage,
  disputeLedgerEventMessage,
  mirrorLedgerEntryFromChat,
} from "@/features/chat/services/chatLedgerBridge.service";
import { ChatSystemEventCard, ChatLedgerEventCard } from "./ChatEventCard";
import { DynamicTripIsland } from "./DynamicTripIsland";
import { LateAlertCard, isLongHaulLateChatMessage } from "./LateAlertCard";
import { LocationEventCard } from "./LocationEventCard";
import { parseSystemLogLocationData } from "../utils/locationLogPayload.util";
import { ChatFeedbackCard } from "./ChatFeedbackCard";
import { DocumentShareCard } from "./DocumentShareCard";
import { DocumentShareSheet } from "./DocumentShareSheet";
import { isMessageVisibleInTab } from "../types/chat.types";
import type {
  ConversationPartyType,
  LedgerEventMetadata,
  MessageDeliveryStatus,
  TripMessageRow,
} from "../types/chat.types";
import { tripFeedbackRequestMatchesConversation } from "../utils/feedbackRequestMeta";
import { ledgerEventInvolvesOrg } from "../utils/ledgerVisibility.util";
import { useAuth } from "@/contexts/AuthContext";
import { PartyAvatar } from "@/components/PartyAvatar";
import {
  isTerminalTripStatus,
  isTripFeedbackEligibleStatus,
  parseTripIdSortKey,
} from "@/features/chat/utils/tripConversationSort";
import { buildTripMessageListLayoutMeta } from "@/features/chat/utils/chatMessageListLayout";

type TabId = "trips" | "network";

const QUICK_EMOJIS = ["👍", "🤝", "🚛", "📍", "✅", "📦", "⚠️", "🕒", "😊", "🙌", "📞", "💯"];
const TRIP_PARTY_FILTERS: ConversationPartyType[] = ["client", "driver", "supplier"];

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
    backgroundColor: CHAT_ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  text: { fontSize: 10, fontWeight: "800", color: "#fff" },
});

function PartyIcon({
  partyType,
  active,
  size = 16,
  tone = "list",
  inactiveOnDarkCard,
}: {
  partyType: ConversationPartyType;
  active?: boolean;
  size?: number;
  /** `hub`: selected party = dark icon on light chip. `list`: selected = white on dark list row. */
  tone?: "list" | "hub";
  /** Hub row selected (dark card) but this party tab not selected — icon on slate chip. */
  inactiveOnDarkCard?: boolean;
}) {
  const color = active
    ? tone === "hub"
      ? "#0b1220"
      : "#fff"
    : inactiveOnDarkCard
      ? "rgba(248,250,252,0.88)"
      : CHAT_ICON_MUTED;
  if (partyType === "client") return <Briefcase size={size} color={color} />;
  if (partyType === "supplier") return <Truck size={size} color={color} />;
  return <User size={size} color={color} />;
}

function partyLabel(type: ConversationPartyType) {
  return type === "client" ? "CLIENT" : type === "supplier" ? "SUPPLIER" : "DRIVER";
}

function partyFilterSheetLabel(type: ConversationPartyType): string {
  return type === "client" ? "Client" : type === "supplier" ? "Supplier" : "Driver";
}

function getConversationTripLabel(conversation: Pick<TripConversation, "trip_number" | "display_trip_id">): string {
  return getTripDisplayNumber({
    trip_number: conversation.trip_number,
    display_trip_id: conversation.display_trip_id ?? null,
  } as TripRow);
}

function formatTripStatusLabel(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "ACTIVE";
  return raw.replace(/_/g, " ").toUpperCase();
}

/** Trip `created_at` for hub + detail chrome (e.g. `3 May 2026`). */
function formatTripRouteDate(iso: string | null | undefined): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Hub badge: UNASSIGNED only for aggregate (integrated) trips with no driver; else status label. */
function formatTripHubStatusLabel(
  tripStatus: string | null | undefined,
  tripDriverId: string | null | undefined,
  tripSupplierId: string | null | undefined,
): string {
  const integrated = isAggregateTrip({ supplier_id: tripSupplierId ?? null });
  if (integrated && !String(tripDriverId ?? "").trim()) return "UNASSIGNED";
  return formatTripStatusLabel(tripStatus);
}

type ComposePartyRow =
  | {
      kind: "selectable";
      partyType: ConversationPartyType;
      name: string;
      id: string;
    }
  /** Asset / own fleet: show driver slot dulled until assigned. */
  | { kind: "unassigned_driver" };

/** Compose list rows: supplier only for aggregate (integrated) trips; driver shows Not assigned when empty. */
function isPartyLinkedForTripChat(
  trip: TripForCompose,
  partyType: ConversationPartyType,
): boolean {
  if (partyType === "client")
    return Boolean(trip.client_id && trip.client_linked_organization_id);
  if (partyType === "supplier")
    return Boolean(trip.supplier_id && trip.supplier_linked_organization_id);
  return Boolean(trip.driver_id);
}

function getComposePartyRows(trip: TripForCompose): ComposePartyRow[] {
  const rows: ComposePartyRow[] = [];
  const aggregate = isAggregateTrip(trip);

  if (isPartyLinkedForTripChat(trip, "client"))
    rows.push({
      kind: "selectable",
      partyType: "client",
      name: trip.client_name?.trim() || "Client",
      id: trip.client_id!,
    });

  if (aggregate && isPartyLinkedForTripChat(trip, "supplier"))
    rows.push({
      kind: "selectable",
      partyType: "supplier",
      name: trip.supplier_name?.trim() || "Supplier",
      id: trip.supplier_id!,
    });

  const hasSelectableOther = rows.some((r) => r.kind === "selectable");
  if (trip.driver_id) {
    rows.push({
      kind: "selectable",
      partyType: "driver",
      name: trip.driver_display_name?.trim() || "Driver",
      id: trip.driver_id,
    });
  } else if (hasSelectableOther) rows.push({ kind: "unassigned_driver" });

  return rows;
}

function tripHasSelectableComposeParty(trip: TripForCompose): boolean {
  return getComposePartyRows(trip).some((r) => r.kind === "selectable");
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tab?: string | string[];
    conversationId?: string | string[];
    openDetail?: string | string[];
    ts?: string | string[];
  }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  /** Trip hub cards (alerts + party row): desktop always; all web viewports so mobile browser matches. */
  const useGroupedTripHub = isDesktop || Platform.OS === "web";
  /** Narrow conversation chrome: stack trip selector + scroll party tabs. */
  const compactConversationToolbar = width < 560;
  const allowNewTripConversation = false;
  /** Web: anchored compose/search UX from tablet width up (avoids sheet on iPad / large phones in browser). */
  const isWebAnchoredPanels = Platform.OS === "web" && (isDesktop || width >= 900);
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const currentOrgId = currentOrganization?.id ?? "";

  const [activeTab, setActiveTab] = useState<TabId>("trips");
  const [isMobileDetail, setIsMobileDetail] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const messagesRef = useRef<FlatList>(null);

  const [showEmoji, setShowEmoji] = useState(false);
  const [showScripts, setShowScripts] = useState(false);

  // Document share sheet
  const [showDocShare, setShowDocShare] = useState(false);
  const [addingToBook, setAddingToBook] = useState<string | null>(null);
  /** Sync guard: React state can lag one frame — blocks double-tap duplicate mirrors. */
  const addToBookInFlightRef = useRef(new Set<string>());

  // Compose modal state
  const [showCompose, setShowCompose] = useState(false);
  const [composeSearch, setComposeSearch] = useState("");
  const [composeTrips, setComposeTrips] = useState<TripForCompose[]>([]);
  const [composeLoading, setComposeLoading] = useState(false);
  /** Why the trip list might be empty (avoid "No trips" when org missing or fetch failed). */
  const [composeTripListIssue, setComposeTripListIssue] = useState<"no_org" | "fetch_failed" | null>(
    null
  );
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  /** Trips from fleet (incl. no driver) to merge into hub cards that have no conversation row yet. */
  const [hubComposeTrips, setHubComposeTrips] = useState<TripForCompose[]>([]);
  const hubComposeTripsLoadedAtRef = useRef<number>(0);
  const [initiating, setInitiating] = useState(false);
  const [showNetCompose, setShowNetCompose] = useState(false);
  const [netComposeSearch, setNetComposeSearch] = useState("");
  const [tripChatScope, setTripChatScope] = useState<"active" | "history">("active");
  const [visibleTripCount, setVisibleTripCount] = useState(20);
  const [tripSidebarSearch, setTripSidebarSearch] = useState("");
  const [showTripFilterModal, setShowTripFilterModal] = useState(false);
  const detailEnterProgress = useRef(new Animated.Value(1)).current;
  const [tripPartyFilters, setTripPartyFilters] = useState<ConversationPartyType[]>([
    ...TRIP_PARTY_FILTERS,
  ]);
  const deepLinkAppliedRef = useRef<string | null>(null);
  /** Avoid repeating hydrate when RLS returns null for the same URL. */
  const deeplinkHydrateFailedForKeyRef = useRef<string | null>(null);

  const {
    organizationId,
    conversations,
    isLoading,
    sendMessage,
    markTripThreadsRead,
    getTotalUnreadCount,
    initiateConversation,
  } = useTripChat();
  // True once bootstrap has completed at least once for this org.
  // Used to distinguish "first load" (show full-area spinner) from
  // "background refresh" (keep list visible, skip spinner).
  const bootstrapDone = useChatStore(s => s.bootstrappedOrg !== null);
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

  // useConversation subscribes directly to this one conversation in the singleton
  // store — re-renders only when THIS conversation changes (not the full list).
  const selectedConv = useConversation(selectedConvId);
  const selectedNet = netChats.find((c) => c.id === selectedNetId) ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!organizationId) {
      setHubComposeTrips([]);
      hubComposeTripsLoadedAtRef.current = 0;
      return;
    }
    (async () => {
      try {
        const trips = await getTripsForCompose(organizationId);
        if (!cancelled) {
          setHubComposeTrips(trips);
          hubComposeTripsLoadedAtRef.current = Date.now();
        }
      } catch {
        if (!cancelled) setHubComposeTrips([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // conversations.length removed: trips do not change when messages arrive.
    // Re-fetch only when the organisation switches.
  }, [organizationId]);

  const tripUnread = getTotalUnreadCount();
  const netUnread = netTotal();
  const filteredAndSortedConversations = useMemo(() => {
    const trimmedSearch = tripSidebarSearch.trim().toLowerCase();
    const hasSearch = trimmedSearch.length > 0;
    const normalizedFilters = tripPartyFilters.length
      ? tripPartyFilters
      : TRIP_PARTY_FILTERS;
    const filterSet = new Set<ConversationPartyType>(normalizedFilters);

    return conversations
      .filter((conv) => filterSet.has(conv.party_type))
      .filter((conv) => {
        if (!hasSearch) return true;
        const displayId = getConversationTripLabel(conv);
        const haystack = `${displayId} ${conv.trip_number}`.toLowerCase();
        return haystack.includes(trimmedSearch);
      })
      .sort((a, b) => {
        const aActive = isTerminalTripStatus(a.trip_status) ? 0 : 1;
        const bActive = isTerminalTripStatus(b.trip_status) ? 0 : 1;
        if (bActive !== aActive) return bActive - aActive;

        const aDisplayId = getConversationTripLabel(a);
        const bDisplayId = getConversationTripLabel(b);
        const aTripKey = parseTripIdSortKey(aDisplayId);
        const bTripKey = parseTripIdSortKey(bDisplayId);
        if (bTripKey !== aTripKey) return bTripKey - aTripKey;

        return (
          new Date(b.last_message_at ?? 0).getTime() -
          new Date(a.last_message_at ?? 0).getTime()
        );
      });
  }, [conversations, tripPartyFilters, tripSidebarSearch]);
  const sortedNetChats = useMemo(() => {
    return [...netChats].sort((a, b) => {
      const unreadDiff = (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      if (unreadDiff !== 0) return unreadDiff;
      const aLast = a.messages[a.messages.length - 1]?.timestamp ?? "";
      const bLast = b.messages[b.messages.length - 1]?.timestamp ?? "";
      return new Date(bLast || 0).getTime() - new Date(aLast || 0).getTime();
    });
  }, [netChats]);
  const groupedTripRows = useMemo(() => {
    const q = tripSidebarSearch.trim().toLowerCase();
    const byTrip = new Map<
      string,
      {
        tripId: string;
        tripLabel: string;
        pickup: string;
        drop: string;
        tripCreatedAt: string | null;
        rows: TripConversation[];
        totalUnread: number;
        lastAt: number;
        tripDriverId: string | null;
        tripSupplierId: string | null;
        tripStatus: string | null;
        lastActivityConv: TripConversation | null;
      }
    >();
    for (const conv of filteredAndSortedConversations) {
      const tripKey = conv.trip_id;
      const tripLabel = getConversationTripLabel(conv);
      if (!byTrip.has(tripKey)) {
        byTrip.set(tripKey, {
          tripId: tripKey,
          tripLabel,
          pickup: conv.pickup_area,
          drop: conv.drop_location,
          tripCreatedAt: conv.trip_created_at ?? null,
          rows: [],
          totalUnread: 0,
          lastAt: 0,
          tripDriverId: conv.trip_driver_id ?? null,
          tripSupplierId: conv.trip_supplier_id ?? null,
          tripStatus: conv.trip_status ?? null,
          lastActivityConv: null,
        });
      }
      const row = byTrip.get(tripKey)!;
      row.rows.push(conv);
      row.totalUnread += conv.unread_dispatcher_count ?? 0;
      const convLastAt = new Date(conv.last_message_at ?? 0).getTime();
      if (convLastAt > row.lastAt) {
        row.lastAt = convLastAt;
        row.lastActivityConv = conv;
      }
      row.tripDriverId = conv.trip_driver_id ?? row.tripDriverId ?? null;
      row.tripSupplierId = conv.trip_supplier_id ?? row.tripSupplierId ?? null;
      row.tripStatus = conv.trip_status ?? row.tripStatus ?? null;
      row.tripCreatedAt = row.tripCreatedAt ?? conv.trip_created_at ?? null;
    }

    for (const t of hubComposeTrips) {
      if (!isAggregateTrip(t)) continue;
      if (String(t.driver_id ?? "").trim()) continue;
      if (isTerminalTripStatus(t.status)) continue;
      if (byTrip.has(t.id)) continue;
      const tripLabel = getTripDisplayNumber({
        trip_number: t.trip_number,
        display_trip_id: t.display_trip_id ?? null,
      } as TripRow);
      const createdMs = t.created_at ? new Date(t.created_at).getTime() : 0;
      byTrip.set(t.id, {
        tripId: t.id,
        tripLabel,
        pickup: t.pickup_area,
        drop: t.drop_location,
        tripCreatedAt: t.created_at ?? null,
        rows: [],
        totalUnread: 0,
        lastAt: createdMs,
        tripDriverId: null,
        tripSupplierId: t.supplier_id ?? null,
        tripStatus: t.status ?? null,
        lastActivityConv: null,
      });
    }

    let list = [...byTrip.values()];
    if (q) {
      list = list.filter((trip) => {
        const hay = `${trip.tripLabel} ${trip.pickup} ${trip.drop} ${formatTripRouteDate(trip.tripCreatedAt)} ${trip.rows
          .map((r) => `${r.party_name} ${r.party_type}`)
          .join(" ")}`.toLowerCase();
        return hay.includes(q);
      });
    }

    list = list.filter((trip) => {
      const st = trip.rows[0]?.trip_status;
      const terminal = isTerminalTripStatus(st);
      return tripChatScope === "history" ? terminal : !terminal;
    });

    // WhatsApp-style: unread trips surface before read ones, then most-recent first.
    return list.sort((a, b) => {
      const au = a.totalUnread > 0 ? 0 : 1;
      const bu = b.totalUnread > 0 ? 0 : 1;
      if (au !== bu) return au - bu;
      return b.lastAt - a.lastAt;
    });
  }, [filteredAndSortedConversations, tripSidebarSearch, tripChatScope, hubComposeTrips]);

  const tripChatFilteredConversations = useMemo(() => {
    return filteredAndSortedConversations.filter((conv) => {
      const terminal = isTerminalTripStatus(conv.trip_status);
      return tripChatScope === "history" ? terminal : !terminal;
    });
  }, [filteredAndSortedConversations, tripChatScope]);

  useEffect(() => {
    setVisibleTripCount(20);
  }, [tripChatScope]);

  useEffect(() => {
    const tabParamRaw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const convIdParam = Array.isArray(params.conversationId)
      ? params.conversationId[0]
      : params.conversationId;
    const openDetailParam = Array.isArray(params.openDetail)
      ? params.openDetail[0]
      : params.openDetail;
    const tsParam = Array.isArray(params.ts) ? params.ts[0] : params.ts;

    if (!convIdParam) return;

    const tabParam = tabParamRaw === "network" ? "network" : "trips";
    const deepLinkKey = `${tabParam}:${convIdParam}:${tsParam ?? "no-ts"}`;
    if (deepLinkAppliedRef.current === deepLinkKey) return;

    const shouldOpenDetail = openDetailParam === "1";
    const hydrateAttemptKey = `${convIdParam}:${tsParam ?? ""}`;

    if (tabParam === "trips") {
      const hit = conversations.find((c) => c.id === convIdParam);
      if (hit) {
        setActiveTab("trips");
        setSelectedConvId(convIdParam);
        setSelectedNetId(null);
        void markTripThreadsRead(hit.trip_id);
        if (shouldOpenDetail && !isDesktop) setIsMobileDetail(true);
        deepLinkAppliedRef.current = deepLinkKey;
        return;
      }
      // Wait for bootstrap; once conversations update this effect re-runs.
      if (isLoading) return;
      deeplinkHydrateFailedForKeyRef.current = hydrateAttemptKey;
      return;
    }

    const netHit = netChats.find((c) => c.id === convIdParam);
    if (!netHit) return;
    setActiveTab("network");
    setSelectedNetId(convIdParam);
    setSelectedConvId(null);
    markNetRead(convIdParam);
    if (shouldOpenDetail && !isDesktop) setIsMobileDetail(true);
    deepLinkAppliedRef.current = deepLinkKey;
  }, [
    conversations,
    isDesktop,
    isLoading,
    markTripThreadsRead,
    markNetRead,
    netChats,
    params.conversationId,
    params.openDetail,
    params.ts,
    params.tab,
  ]);

  useEffect(() => {
    if (isDesktop) setIsMobileDetail(false);
  }, [isDesktop]);

  const inputOverlayMaxWidth = Math.max(220, Math.min(320, width - 24));

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

  const openConversation = useCallback(
    (conv: TripConversation) => {
      chatStore.switchParty(conv.trip_id, conv.party_type);
      setSelectedConvId(conv.id);
      void markTripThreadsRead(conv.trip_id);
      openDetail();
    },
    [markTripThreadsRead],
  );

  useEffect(() => {
    const activeDetailId = activeTab === "trips" ? selectedConvId : selectedNetId;
    const detailVisible = isDesktop || isMobileDetail;
    if (!detailVisible || !activeDetailId) return;

    detailEnterProgress.setValue(0);
    Animated.timing(detailEnterProgress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [
    activeTab,
    detailEnterProgress,
    isDesktop,
    isMobileDetail,
    selectedConvId,
    selectedNetId,
  ]);

  const isSendingRef = useRef(false);
  const handleSend = async () => {
    if (isSendingRef.current) return;
    const text = messageInput.trim();
    if (!text) return;
    isSendingRef.current = true;
    setMessageInput("");
    setShowEmoji(false);
    setShowScripts(false);
    try {
      if (activeTab === "trips" && selectedConvId) {
        await sendMessage(selectedConvId, text);
        setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 80);
      } else if (activeTab === "network" && selectedNetId) {
        sendNet(selectedNetId, text, "dispatcher");
        setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 80);
      }
    } finally {
      isSendingRef.current = false;
    }
  };

  const handleDocShare = async (doc: {
    key: string;
    label: string;
    storage_path: string;
    entity_type: "vehicle" | "driver";
    entity_id: string;
  }) => {
    if (!selectedConv || !organizationId) return;
    setShowDocShare(false);
    const senderProfile = profile as {
      full_name?: string | null;
      displayName?: string | null;
      uid?: string | null;
    } | null;
    const senderRole =
      selectedConv.organization_id &&
      selectedConv.organization_id !== organizationId
        ? "supplier"
        : "dispatcher";
    const senderName =
      senderProfile?.full_name ||
      senderProfile?.displayName ||
      (senderRole === "supplier" ? "Supplier" : "Dispatcher");
    const docMessageOrgId = selectedConv.organization_id ?? organizationId;
    try {
      await sendDocumentShareMessage({
        conversationId: selectedConv.id,
        organizationId: docMessageOrgId,
        senderRole,
        senderName,
        senderUserId: senderProfile?.uid ?? null,
        metadata: {
          document_type: doc.label,
          storage_path: doc.storage_path,
          document_name: doc.label,
          entity_type: doc.entity_type,
          entity_id: doc.entity_id,
        },
      });
      setTimeout(() => messagesRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      // fail silently
    }
  };

  const handleAddToBook = async (message: TripMessageRow) => {
    const meta = message.metadata as LedgerEventMetadata | null;
    if (!meta || !currentOrgId || !selectedConv) return;
    if (meta.acknowledged_at) return;
    if (addToBookInFlightRef.current.has(message.id)) return;
    addToBookInFlightRef.current.add(message.id);
    setAddingToBook(message.id);
    try {
      const { error } = await mirrorLedgerEntryFromChat(meta, currentOrgId, selectedConv.trip_id);
      if (error) {
        Alert.alert("Error", error.message);
        return;
      }
      await acknowledgeLedgerEventMessage(message.id, selectedConv.id);
      const ackAt = new Date().toISOString();
      const txId = meta.transaction_id;
      const convId = selectedConv.id;
      const tripKey = useChatStore.getState().convToTrip[convId];
      if (tripKey && txId) {
        const entry = useChatStore.getState().trips[tripKey];
        const stream = entry?.event_stream;
        if (stream?.length) {
          for (const e of stream) {
            if (e.conversation_id !== convId) continue;
            if (
              e.message_type !== "ledger_event" &&
              e.message_type !== "ledger" &&
              e.message_type !== "payment"
            ) {
              continue;
            }
            const m = e.metadata as LedgerEventMetadata | undefined;
            if (m?.transaction_id !== txId) continue;
            chatStore.patchMessage(convId, e.id, {
              metadata: { ...m, acknowledged_at: ackAt },
            });
          }
        }
      }
    } catch {
      Alert.alert("Error", "Could not add to book. Please try again.");
    } finally {
      addToBookInFlightRef.current.delete(message.id);
      setAddingToBook(null);
    }
  };

  const handleDispute = async (message: TripMessageRow) => {
    if (!selectedConv) return;
    await disputeLedgerEventMessage(message.id);
    // Pre-fill the reply input with a dispute notice
    const meta = message.metadata as LedgerEventMetadata | null;
    if (meta) {
      const amount = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(meta.amount);
      setMessageInput(`Raising dispute on ${amount} — ${meta.category}. `);
    }
  };

  const openCompose = async (prefillTripId?: string | null) => {
    if (!allowNewTripConversation) {
      Alert.alert(
        "New conversations disabled",
        "Only existing conversations are available right now.",
      );
      return;
    }
    setShowTripFilterModal(false);
    setShowCompose(true);
    setComposeSearch("");
    setComposeTripListIssue(null);
    setExpandedTripId(prefillTripId ?? null);
    if (!organizationId) {
      setComposeTrips([]);
      setComposeTripListIssue("no_org");
      return;
    }
    // Reuse the already-fetched trip list if it was loaded within the last 2 minutes.
    // The mount effect populates hubComposeTrips; re-fetching on every compose open
    // was generating 3 duplicate DB calls (trips + clients + suppliers) per click.
    const COMPOSE_TRIPS_STALE_MS = 2 * 60_000;
    if (
      hubComposeTrips.length > 0 &&
      Date.now() - hubComposeTripsLoadedAtRef.current < COMPOSE_TRIPS_STALE_MS
    ) {
      setComposeTrips(hubComposeTrips);
      return;
    }
    setComposeLoading(true);
    try {
      const trips = await getTripsForCompose(organizationId);
      setComposeTrips(trips);
      setHubComposeTrips(trips);
      hubComposeTripsLoadedAtRef.current = Date.now();
    } catch {
      setComposeTrips(hubComposeTrips.length > 0 ? hubComposeTrips : []);
      if (hubComposeTrips.length === 0) setComposeTripListIssue("fetch_failed");
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
    if (!isPartyLinkedForTripChat(trip, partyType)) {
      Alert.alert(
        "Chat unavailable",
        "This party is not linked to an app organization yet. Link both sides first, then start chat.",
      );
      return;
    }
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
          (t.supplier_name ?? "").toLowerCase().includes(composeSearch.toLowerCase()) ||
          (t.pickup_area ?? "").toLowerCase().includes(composeSearch.toLowerCase()) ||
          (t.drop_location ?? "").toLowerCase().includes(composeSearch.toLowerCase())
      )
    : composeTrips;

  const composeTripsWithChatParties = filteredComposeTrips.filter((t) =>
    tripHasSelectableComposeParty(t)
  );

  const filteredNetPartners = netComposeSearch.trim()
    ? netPartners.filter((p) =>
        p.name.toLowerCase().includes(netComposeSearch.toLowerCase())
      )
    : netPartners;

  const toggleTripPartyFilter = (partyType: ConversationPartyType) => {
    setTripPartyFilters((prev) =>
      prev.includes(partyType)
        ? prev.filter((type) => type !== partyType)
        : [...prev, partyType],
    );
  };

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

  const renderConvItem = useCallback(({ item }: { item: TripConversation }) => {
    const active = selectedConvId === item.id;
    const displayTripId = getConversationTripLabel(item);
    const partyLine = formatChatPartyName(item.party_name);
    const isActiveTrip = !isTerminalTripStatus(item.trip_status);
    const showPendingFeedbackIcon =
      Platform.OS === "web" &&
      isDesktop &&
      item.trip_feedback_status === "pending" &&
      item.organization_id === currentOrgId;
    const time = item.last_message_at
      ? new Date(item.last_message_at).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "";

    const avatarName = partyLine || partyLabel(item.party_type);
    const lastMsgSeed = item.messages.length > 0
      ? (item.messages[item.messages.length - 1] as TripMessageRow).sender_avatar_seed ?? null
      : null;
    return (
      <TouchableOpacity
        style={[s.chatItem, active && s.chatItemActive]}
        onPress={() => openConversation(item)}
        activeOpacity={0.8}
      >
        <View style={s.chatAvatarWrap}>
          <PartyAvatar
            name={avatarName}
            entityType={item.party_type}
            size={38}
            avatarSeed={lastMsgSeed}
          />
          {item.unread_dispatcher_count > 0 && !active && (
            <View style={s.chatAvatarUnreadDot} />
          )}
        </View>
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <View style={s.chatTitleRow}>
              <Text style={[s.chatTitle, active && s.chatTitleActive]} numberOfLines={1}>
                {displayTripId}
              </Text>
              {showPendingFeedbackIcon ? (
                <Star
                  size={14}
                  color={CHAT_ACCENT}
                  fill="rgba(26,35,126,0.12)"
                  style={s.chatPendingFeedbackStar}
                  accessibilityLabel="Pending trip feedback"
                />
              ) : null}
              {isActiveTrip ? <View style={[s.activeTripDot, active && s.activeTripDotActive]} /> : null}
            </View>
            <Text style={[s.chatTime, active && s.chatTimeActive]}>{time}</Text>
          </View>
          <Text style={[s.chatPartyLabel, active && s.chatPartyLabelActive]}>
            {partyLine ? `${partyLabel(item.party_type)} · ${partyLine}` : partyLabel(item.party_type)}
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
  }, [selectedConvId, openConversation, isDesktop, currentOrgId]);

  const renderNetItem = useCallback(({ item }: { item: IntegratedChat }) => {
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
        <PartyAvatar name={item.partnerName} entityType="client" size={38} />
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
  }, [selectedNetId, markNetRead, openDetail]);

  // ── Panels ───────────────────────────────────────────────────────────────────

  function ChatList() {
    const TABS: {
      id: TabId;
      label: string;
      unread: number;
      Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    }[] = [
      { id: "trips", label: "TRIPS CHAT", unread: tripUnread, Icon: Hash },
      { id: "network", label: "NETWORK DM", unread: netUnread, Icon: Users },
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
              <ArrowLeft size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={s.brandTitle}>
              pulse chat
              <Text style={s.brandDot}>.</Text>
            </Text>
          </View>
          <View />
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
                <t.Icon size={12} color={active ? "#ffffff" : CHAT_ICON_MUTED} strokeWidth={active ? 2.25 : 2} />
                <View style={s.tabPillLabelWrap}>
                  <Text
                    style={[s.tabPillLabel, active && s.tabPillLabelActive]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {t.label}
                  </Text>
                </View>
                {t.unread > 0 && (
                  <View style={[s.tabUnreadBadge, active && s.tabUnreadBadgeActive]}>
                    <Text style={[s.tabUnreadText, active && s.tabUnreadTextActive]}>
                      {t.unread > 9 ? "9+" : String(t.unread)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === "trips" && (
          <View style={s.tripSearchScopeStrip}>
            <View style={s.tripSearchScopeSearchWrap}>
              <Search size={12} color="#94a3b8" style={{ marginRight: 5 }} />
              <TextInput
                style={s.sidebarSearchInput}
                value={tripSidebarSearch}
                onChangeText={setTripSidebarSearch}
                placeholder="Search trip, route…"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
              {tripSidebarSearch.length > 0 && (
                <TouchableOpacity onPress={() => setTripSidebarSearch("")} hitSlop={8}>
                  <X size={12} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
            <View style={s.tripSearchScopeSegment}>
              <TouchableOpacity
                style={[
                  s.tripChatScopePillStrip,
                  tripChatScope === "active" && s.tripChatScopePillOn,
                ]}
                onPress={() => setTripChatScope("active")}
                activeOpacity={0.82}
              >
                <Text
                  style={[
                    s.tripChatScopePillTextStrip,
                    tripChatScope === "active" && s.tripChatScopePillTextOn,
                  ]}
                  numberOfLines={1}
                >
                  Active
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.tripChatScopePillStrip,
                  tripChatScope === "history" && s.tripChatScopePillOn,
                ]}
                onPress={() => setTripChatScope("history")}
                activeOpacity={0.82}
              >
                <Text
                  style={[
                    s.tripChatScopePillTextStrip,
                    tripChatScope === "history" && s.tripChatScopePillTextOn,
                  ]}
                  numberOfLines={1}
                >
                  History
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === "trips" && isWebAnchoredPanels && showCompose && (
          <View style={s.composePopoverLayer} pointerEvents="box-none">
            <TouchableOpacity
              style={s.tripFilterPopoverBackdrop}
              onPress={() => setShowCompose(false)}
              activeOpacity={1}
            />
            <View style={s.composePopoverCard}>
              <ComposePanelBody tripListScrollStyle={{ maxHeight: 520 }} />
            </View>
          </View>
        )}

        {activeTab === "trips" && isDesktop && showTripFilterModal && (
          <View style={s.tripFilterPopoverLayer} pointerEvents="box-none">
            <TouchableOpacity
              style={s.tripFilterPopoverBackdrop}
              onPress={() => setShowTripFilterModal(false)}
              activeOpacity={1}
            />
            <View style={s.tripFilterPopoverCard}>
              <View style={s.tripFilterPopoverHeader}>
                <Text style={s.tripFilterPopoverTitle}>Trip Filters</Text>
                <TouchableOpacity onPress={() => setShowTripFilterModal(false)} hitSlop={8}>
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>
              <Text style={s.tripFilterPopoverSub}>Filter by conversation party</Text>
              <View style={s.filterChipWrap}>
                {TRIP_PARTY_FILTERS.map((partyType, index) => {
                  const selected = tripPartyFilters.includes(partyType);
                  const isLast = index === TRIP_PARTY_FILTERS.length - 1;
                  return (
                    <TouchableOpacity
                      key={partyType}
                      style={[s.filterChip, isLast && s.filterChipLast, selected && s.filterChipActive]}
                      onPress={() => toggleTripPartyFilter(partyType)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.filterChipText, selected && s.filterChipTextActive]}>
                        {partyFilterSheetLabel(partyType)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={s.filterResetBtn}
                onPress={() => setTripPartyFilters([...TRIP_PARTY_FILTERS])}
                activeOpacity={0.8}
              >
                <Text style={s.filterResetText}>Reset to all parties</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === "trips" &&
          (isLoading && !bootstrapDone ? (
            // First-ever bootstrap in progress: full-area spinner.
            // After bootstrap has run once, the list is always rendered from
            // in-memory Zustand state — no spinner on subsequent refreshes.
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <ActivityIndicator color={CHAT_ACCENT} />
            </View>
          ) : useGroupedTripHub ? (
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={s.tripHubScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {groupedTripRows.length === 0 ? (
                <EmptyList
                  label={
                    tripChatScope === "history"
                      ? "No trips in history"
                      : "No active trip conversations"
                  }
                  actionLabel={tripChatScope === "active" ? "Start a conversation" : undefined}
                  onAction={tripChatScope === "active" ? openCompose : undefined}
                />
              ) : (
                (() => {
                  const visibleRows = groupedTripRows.slice(0, visibleTripCount);
                  let shownUnreadHeader = false;
                  let shownReadHeader = false;
                  const items: React.ReactNode[] = [];
                  visibleRows.forEach((trip) => {
                  const isUnreadTrip = trip.totalUnread > 0;
                  if (isUnreadTrip && !shownUnreadHeader) {
                    shownUnreadHeader = true;
                    items.push(
                      <View key="__unread_header__" style={s.sectionHeaderRow}>
                        <View style={s.sectionHeaderDot} />
                        <Text style={s.sectionHeaderText}>UNREAD</Text>
                      </View>
                    );
                  }
                  if (!isUnreadTrip && !shownReadHeader) {
                    shownReadHeader = true;
                    items.push(
                      <View key="__read_header__" style={s.sectionHeaderRow}>
                        <Text style={[s.sectionHeaderText, s.sectionHeaderTextMuted]}>ALL TRIPS</Text>
                      </View>
                    );
                  }
                  const hubDateLabel = formatTripRouteDate(trip.tripCreatedAt);
                  const tripActive = selectedConv?.trip_id === trip.tripId;
                  const statusLabel = formatTripHubStatusLabel(
                    trip.tripStatus,
                    trip.tripDriverId,
                    trip.tripSupplierId,
                  );
                  const isUnassignedBadge = statusLabel === "UNASSIGNED";
                  const openFallback = () => {
                    if (trip.rows.length === 0) {
                      void openCompose(trip.tripId);
                      return;
                    }
                    const storedParty = chatStore.getActivePartyType(trip.tripId);
                    const preferred = storedParty
                      ? (trip.rows.find((r) => r.party_type === storedParty) ?? trip.rows[0])
                      : trip.rows[0];
                    openConversation(preferred);
                  };
                  const card = (
                    <View key={trip.tripId} style={[s.tripHubCard, tripActive && s.tripHubCardOn]}>
                      {trip.totalUnread > 0 ? (
                        <View style={[s.tripHubAlertBar, tripActive && s.tripHubAlertBarOn]}>
                          <Bell size={13} color={tripActive ? "#fecdd3" : "#e11d48"} />
                          <Text style={[s.tripHubAlertBarText, tripActive && s.tripHubAlertBarTextOn]}>
                            Trip alerts · {trip.totalUnread > 99 ? "99+" : trip.totalUnread}
                          </Text>
                        </View>
                      ) : null}
                      <TouchableOpacity
                        onPress={openFallback}
                        activeOpacity={0.88}
                        style={s.tripHubHeroTouchable}
                      >
                        <View style={s.tripHubHeroRow}>
                          <View style={s.tripHubHeroMain}>
                            <View style={[s.tripHubTruckPill, tripActive && s.tripHubTruckPillOn]}>
                              <Truck size={14} color="#ffffff" />
                            </View>
                            <View style={s.tripHubHeroTextCol}>
                              <Text
                                style={[
                                  s.tripHubTripTitle,
                                  tripActive && s.tripHubTripTitleOn,
                                ]}
                                numberOfLines={1}
                              >
                                {trip.tripLabel}
                              </Text>
                              <View style={s.tripHubRouteRow}>
                                <View style={s.tripHubRouteTextWrap}>
                                  <Text
                                    style={[s.tripHubRouteLarge, tripActive && s.tripHubRouteLargeOn]}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                  >
                                    {trip.pickup} {"→"} {trip.drop}
                                  </Text>
                                </View>
                                {hubDateLabel ? (
                                  <Text
                                    style={[s.tripHubRouteDate, tripActive && s.tripHubRouteDateOn]}
                                    numberOfLines={1}
                                  >
                                    {hubDateLabel}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          </View>
                          <View style={s.tripHubHeroTrail}>
                            <Text
                              style={[
                                s.tripHubStatusPill,
                                isUnassignedBadge
                                  ? tripActive
                                    ? s.tripHubStatusPillUnassignedOn
                                    : s.tripHubStatusPillUnassigned
                                  : tripActive
                                    ? s.tripHubStatusPillAssignedOn
                                    : s.tripHubStatusPillAssigned,
                              ]}
                              numberOfLines={1}
                            >
                              {statusLabel}
                            </Text>
                            {trip.totalUnread > 0 ? (
                              <View style={s.tripHubTotalUnread}>
                                <Text style={s.tripHubTotalUnreadText}>
                                  {trip.totalUnread > 9 ? "9+" : String(trip.totalUnread)}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </TouchableOpacity>
                      <View style={s.tripHubPartyIconRow}>
                        {(["client", "supplier", "driver"] as ConversationPartyType[]).map((partyType) => {
                          const row = trip.rows.find((r) => r.party_type === partyType);
                          const on = Boolean(row && selectedConvId === row.id);
                          // Determine if the underlying entity exists so we can offer create-on-demand
                          const hubTrip = hubComposeTrips.find((t) => t.id === trip.tripId);
                          const entityExists = hubTrip ? isPartyLinkedForTripChat(hubTrip, partyType) : Boolean(row);
                          const isMissing = !row && !entityExists;
                          return (
                            <TouchableOpacity
                              key={`${trip.tripId}-${partyType}`}
                              style={[
                                s.tripHubPartyIconBtn,
                                tripActive && !on && s.tripHubPartyIconBtnOnDarkCard,
                                on && s.tripHubPartyIconBtnOn,
                                isMissing && s.tripHubPartyIconBtnOff,
                              ]}
                              disabled={isMissing}
                              onPress={async () => {
                                if (row) {
                                  openConversation(row);
                                  return;
                                }
                                if (!hubTrip || !entityExists) return;
                                const pr = getComposePartyRows(hubTrip).find(
                                  (r) => r.kind === "selectable" && r.partyType === partyType,
                                );
                                if (!pr || pr.kind !== "selectable") return;
                                setInitiating(true);
                                const convId = await initiateConversation({
                                  tripId: hubTrip.id,
                                  tripNumber: hubTrip.display_trip_id ?? hubTrip.trip_number,
                                  pickupArea: hubTrip.pickup_area,
                                  dropLocation: hubTrip.drop_location,
                                  partyType,
                                  partyName: pr.name,
                                  partyId: pr.id,
                                });
                                setInitiating(false);
                                if (convId) {
                                  const created = chatStore.getConversation(convId);
                                  if (created) openConversation(created);
                                }
                              }}
                              activeOpacity={0.82}
                            >
                              <PartyIcon
                                partyType={partyType}
                                active={on}
                                tone="hub"
                                size={14}
                                inactiveOnDarkCard={tripActive && !on}
                              />
                              {(row?.unread_dispatcher_count ?? 0) > 0 ? (
                                <View style={s.tripHubPartyUnreadDot} />
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {trip.lastActivityConv?.last_message_preview ? (
                        <Text
                          style={[s.tripHubLastMsg, tripActive && s.tripHubLastMsgOn]}
                          numberOfLines={1}
                        >
                          <Text style={[s.tripHubLastMsgParty, tripActive && s.tripHubLastMsgOn]}>
                            {partyLabel(trip.lastActivityConv.party_type)}:{" "}
                          </Text>
                          {trip.lastActivityConv.last_message_preview}
                        </Text>
                      ) : null}
                    </View>
                  );
                  items.push(card);
                  });
                  if (visibleTripCount < groupedTripRows.length) {
                    items.push(
                      <TouchableOpacity
                        key="__load_more__"
                        style={s.loadMoreBtn}
                        onPress={() => setVisibleTripCount(c => c + 20)}
                        activeOpacity={0.75}
                      >
                        <Text style={s.loadMoreText}>
                          Load {Math.min(20, groupedTripRows.length - visibleTripCount)} more
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                  return items;
                })()
              )}
            </ScrollView>
          ) : (
            <FlatList
              data={tripChatFilteredConversations}
              keyExtractor={(i) => i.id}
              renderItem={renderConvItem}
              ListEmptyComponent={
                <EmptyList
                  label={
                    tripChatScope === "history"
                      ? "No trips in history"
                      : "No active trip conversations"
                  }
                  actionLabel={tripChatScope === "active" ? "Start a conversation" : undefined}
                  onAction={tripChatScope === "active" ? openCompose : undefined}
                />
              }
              contentContainerStyle={{ padding: 10, paddingBottom: 24, gap: 4 }}
            />
          ))}

        {activeTab === "network" &&
          (netLoading && netChats.length === 0 ? (
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <ActivityIndicator color={CHAT_ACCENT} />
            </View>
          ) : (
            <FlatList
              data={sortedNetChats}
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
                        <Users size={14} color={CHAT_ACCENT} />
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
                            <Users size={14} color={CHAT_ACCENT} />
                          </View>
                          <Text style={cm.tripNumber}>{p.name}</Text>
                        </View>
                        {initiating ? (
                          <ActivityIndicator size="small" color={CHAT_ACCENT} />
                        ) : (
                          <Plus size={14} color={CHAT_ACCENT} />
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

  function TripFilterModal() {
    if (isDesktop) return null;
    return (
      <Modal
        visible={showTripFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTripFilterModal(false)}
      >
        <View style={cm.backdrop}>
          <View style={cm.sheet}>
            <View style={cm.header}>
              <View>
                <Text style={cm.title}>Trip Filters</Text>
                <Text style={cm.subtitle}>Filter trip chats by conversation party.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTripFilterModal(false)} hitSlop={8} style={cm.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={s.filterChipWrap}>
              {TRIP_PARTY_FILTERS.map((partyType, index) => {
                const selected = tripPartyFilters.includes(partyType);
                const isLast = index === TRIP_PARTY_FILTERS.length - 1;
                return (
                  <TouchableOpacity
                    key={partyType}
                    style={[s.filterChip, isLast && s.filterChipLast, selected && s.filterChipActive]}
                    onPress={() => toggleTripPartyFilter(partyType)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.filterChipText, selected && s.filterChipTextActive]}>
                      {partyFilterSheetLabel(partyType)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={s.filterResetBtn}
              onPress={() => setTripPartyFilters([...TRIP_PARTY_FILTERS])}
              activeOpacity={0.8}
            >
              <Text style={s.filterResetText}>Reset to all parties</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // ── New conversation (compose) ───────────────────────────────────────────────

  function ComposePanelBody({
    tripListScrollStyle,
  }: {
    tripListScrollStyle?: { maxHeight?: number; flex?: number };
  }) {
    const scrollStyle = tripListScrollStyle ?? { flex: 1 };
    return (
      <>
        <View style={cm.header}>
          <View>
            <Text style={cm.title}>New Conversation</Text>
            <Text style={cm.subtitle}>Select a trip and a party to chat with.</Text>
          </View>
          <TouchableOpacity onPress={() => setShowCompose(false)} hitSlop={8} style={cm.closeBtn}>
            <X size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        <View style={cm.searchRow}>
          <Search size={15} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            style={cm.searchInput}
            value={composeSearch}
            onChangeText={setComposeSearch}
            placeholder="Search trips, clients, routes…"
            placeholderTextColor="#94a3b8"
            autoFocus={!isWebAnchoredPanels}
          />
          {composeSearch.length > 0 && (
            <TouchableOpacity onPress={() => setComposeSearch("")} hitSlop={8}>
              <X size={14} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {composeLoading ? (
          <View style={{ paddingTop: 48, alignItems: "center" }}>
            <ActivityIndicator color={CHAT_ACCENT} />
          </View>
        ) : composeTripListIssue === "no_org" ? (
          <View style={{ paddingTop: 48, alignItems: "center", gap: 8, paddingHorizontal: 24 }}>
            <MessageSquare size={28} color="#e2e8f0" />
            <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
              No organization selected. Open the workspace switcher and pick your company, then try again.
            </Text>
          </View>
        ) : composeTripListIssue === "fetch_failed" ? (
          <View style={{ paddingTop: 48, alignItems: "center", gap: 8, paddingHorizontal: 24 }}>
            <MessageSquare size={28} color="#e2e8f0" />
            <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
              Could not load trips. Check your connection and open this screen again.
            </Text>
          </View>
        ) : filteredComposeTrips.length === 0 ? (
          <View style={{ paddingTop: 48, alignItems: "center", gap: 8 }}>
            <MessageSquare size={28} color="#e2e8f0" />
            <Text style={{ fontSize: 13, color: "#94a3b8" }}>
              {composeSearch.trim() ? "No matching trips" : "No active trips found"}
            </Text>
          </View>
        ) : composeTripsWithChatParties.length === 0 ? (
          <View style={{ paddingTop: 48, alignItems: "center", gap: 8, paddingHorizontal: 24 }}>
            <MessageSquare size={28} color="#e2e8f0" />
            <Text style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 20 }}>
              Trips matched your filters, but none have a chat-ready linked party. Clients/suppliers
              must be connected to an app organization, and drivers must be assigned on the trip.
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={scrollStyle}>
            {composeTripsWithChatParties.map((trip) => {
              const isExpanded = expandedTripId === trip.id;
              const tripLabel = trip.display_trip_id ?? trip.trip_number;

              const partyRows = getComposePartyRows(trip);
              const selectablePartyCount = partyRows.filter((row) => row.kind === "selectable").length;

              return (
                <View key={trip.id} style={cm.tripCard}>
                  <TouchableOpacity
                    style={cm.tripRow}
                    onPress={() => setExpandedTripId(isExpanded ? null : trip.id)}
                    activeOpacity={0.7}
                  >
                    <View style={cm.tripInfo}>
                      <View style={cm.tripMetaRow}>
                        <Text style={cm.tripNumber}>{tripLabel}</Text>
                        <View style={cm.tripMetaPill}>
                          <Text style={cm.tripMetaPillText}>
                            {selectablePartyCount} party{selectablePartyCount > 1 ? "s" : ""}
                          </Text>
                        </View>
                      </View>
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
                      {partyRows.map((row) => {
                        if (row.kind === "unassigned_driver") {
                          return (
                            <View
                              key="driver-unassigned"
                              style={[cm.partyRow, cm.partyRowDisabled]}
                            >
                              <View
                                style={cm.partyRowDisabledOverlay}
                                pointerEvents="none"
                              />
                              <View style={[cm.partyIconWrap, cm.partyIconWrapMuted]}>
                                <PartyIcon partyType="driver" size={14} />
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[cm.partyType, cm.partyTypeMuted]}>DRIVER</Text>
                              </View>
                              <Text style={cm.partyDisabledHint}>—</Text>
                            </View>
                          );
                        }
                        const composePartyLine = formatChatPartyName(row.name);
                        return (
                          <TouchableOpacity
                            key={`${row.partyType}-${row.id}`}
                            style={cm.partyRow}
                            onPress={() =>
                              handleInitiate(trip, row.partyType, row.name, row.id)
                            }
                            disabled={initiating}
                            activeOpacity={0.7}
                          >
                            <View style={cm.partyIconWrap}>
                              <PartyIcon partyType={row.partyType} size={14} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={cm.partyType}>{partyLabel(row.partyType)}</Text>
                              {composePartyLine ? (
                                <Text style={cm.partyName} numberOfLines={1}>
                                  {composePartyLine}
                                </Text>
                              ) : null}
                            </View>
                            {initiating ? (
                              <ActivityIndicator size="small" color={CHAT_ACCENT} />
                            ) : (
                              <Plus size={14} color={CHAT_ACCENT} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </>
    );
  }

  function ComposeModal() {
    if (isWebAnchoredPanels) return null;
    return (
      <Modal
        visible={showCompose}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompose(false)}
      >
        <View style={cm.backdrop}>
          <View style={cm.sheet}>
            <ComposePanelBody />
          </View>
        </View>
      </Modal>
    );
  }

  const detailPanel =
    activeTab === "trips" ? (
      <TripConversationDetailPanel
        selectedConv={selectedConv}
        conversations={conversations}
        composeTrips={hubComposeTrips}
        messagesRef={messagesRef}
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        showScripts={showScripts}
        setShowScripts={setShowScripts}
        onSend={handleSend}
        onOpenDocShare={() => setShowDocShare(true)}
        isDesktop={isDesktop}
        compactConversationToolbar={compactConversationToolbar}
        inputOverlayMaxWidth={inputOverlayMaxWidth}
        onCloseDetail={closeDetail}
        currentOrgId={currentOrgId}
        onAddToBook={handleAddToBook}
        onDispute={handleDispute}
        addingToBookId={addingToBook}
        onSelectConversation={setSelectedConvId}
        onOpenCompose={openCompose}
        onFeedbackSubmitted={() => {
          // Store is already patched optimistically in ChatFeedbackCard.
          // No DB refresh needed — Realtime delivers the metadata UPDATE.
        }}
      />
    ) : (
      <NetworkDetailPanel
        selectedNet={selectedNet}
        messagesRef={messagesRef}
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        showScripts={showScripts}
        setShowScripts={setShowScripts}
        onSend={handleSend}
        isDesktop={isDesktop}
        inputOverlayMaxWidth={inputOverlayMaxWidth}
        onCloseDetail={closeDetail}
      />
    );

  const detailEnterStyle = {
    opacity: detailEnterProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.42, 1],
    }),
    transform: [
      {
        translateX: detailEnterProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
      {
        scale: detailEnterProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1],
        }),
      },
    ],
  } as const;

  // ── Layout ────────────────────────────────────────────────────────────────────

  if (isDesktop) {
    return (
      <LinearGradient
        colors={["#edfafa", "#ffffff", CHAT_ACCENT_SOFT]}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.root, { paddingTop: insets.top }]}
      >
        <View style={s.desktop}>
          <View style={s.desktopList}>
            {ChatList()}
          </View>
          <Animated.View style={[s.desktopDetail, s.detailTransitionShell, detailEnterStyle]}>
            {detailPanel}
          </Animated.View>
        </View>
        <ComposeModal />
        <NetworkComposeModal />
        <TripFilterModal />
        <DocumentShareSheet
          visible={showDocShare}
          vehicleId={selectedConv?.trip_id ? null : null}
          driverId={null}
          onClose={() => setShowDocShare(false)}
          onShare={handleDocShare}
        />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={["#edfafa", "#ffffff", CHAT_ACCENT_SOFT]}
      locations={[0, 0.45, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={s.mobileRootFill}>
        {!isMobileDetail ? (
          ChatList()
        ) : (
          <Animated.View style={[s.detailTransitionShell, detailEnterStyle]}>
            {detailPanel}
          </Animated.View>
        )}
      </View>
      <ComposeModal />
      <NetworkComposeModal />
      <TripFilterModal />
      <DocumentShareSheet
        visible={showDocShare}
        vehicleId={null}
        driverId={null}
        onClose={() => setShowDocShare(false)}
        onShare={handleDocShare}
      />
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
            backgroundColor: CHAT_ACCENT,
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
        <MessageSquare size={34} color={CHAT_ACCENT} />
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
  /** Web flex + RN web: keep list/detail from growing past viewport. */
  mobileRootFill: { flex: 1, minHeight: 0, width: "100%" },
  desktop: { flex: 1, flexDirection: "row" },
  desktopList: {
    width: 420,
    borderRightWidth: 1,
    borderRightColor: CHAT_ACCENT_BORDER,
    backgroundColor: "rgba(255,255,255,0.82)",
  },
  desktopDetail: { flex: 1, backgroundColor: "transparent" },

  listPanel: { flex: 1, backgroundColor: "transparent" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#0f172a",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -0.4,
    fontStyle: "italic",
  },
  brandDot: {
    color: CHAT_ACCENT,
    fontWeight: "900",
  },
  filterBtn: { position: "relative" },
  filterActiveDot: {
    position: "absolute",
    top: -1,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CHAT_ACCENT,
    borderWidth: 1,
    borderColor: "#0f172a",
  },

  tabRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e8ecf1",
  },
  tripHubScrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 22,
    gap: 8,
  },
  tripHubCard: {
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#f1f5f9",
    padding: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  tripHubCardOn: {
    backgroundColor: "#020617",
    borderColor: "#020617",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  tripHubAlertBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    borderLeftWidth: 3,
    borderLeftColor: "#f43f5e",
  },
  tripHubAlertBarOn: {
    backgroundColor: "rgba(244,63,94,0.12)",
    borderColor: "rgba(244,63,94,0.35)",
    borderLeftColor: "#fb7185",
  },
  tripHubAlertBarText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "900",
    color: "#be123c",
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  tripHubAlertBarTextOn: {
    color: "#fecdd3",
  },
  tripHubHeroTouchable: {
    marginBottom: 10,
  },
  tripHubHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripHubHeroMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripHubHeroTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  tripHubHeroTrail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  tripHubTruckPill: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tripHubTruckPillOn: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tripHubStatusPill: {
    flexShrink: 0,
    maxWidth: 108,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 7,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    overflow: "hidden",
  },
  tripHubStatusPillAssigned: {
    backgroundColor: "#059669",
    color: "#ffffff",
  },
  tripHubStatusPillAssignedOn: {
    backgroundColor: "#059669",
    color: "#ffffff",
  },
  tripHubStatusPillUnassigned: {
    backgroundColor: "#64748b",
    color: "#ffffff",
  },
  tripHubStatusPillUnassignedOn: {
    backgroundColor: "#64748b",
    color: "#ffffff",
  },
  tripHubTripTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.35,
    lineHeight: 16,
  },
  tripHubTripTitleOn: {
    color: "#ffffff",
  },
  tripHubRouteLarge: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    lineHeight: 11,
  },
  tripHubRouteLargeOn: {
    color: "rgba(248,250,252,0.52)",
  },
  tripHubRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    width: "100%",
  },
  tripHubRouteTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  tripHubRouteDate: {
    fontSize: 8,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.25,
    flexShrink: 0,
  },
  tripHubRouteDateOn: {
    color: "rgba(248,250,252,0.45)",
  },
  tripHubTotalUnread: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: CHAT_ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tripHubTotalUnreadText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 9,
  },
  tripHubPartyIconRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    marginTop: 2,
  },
  tripHubPartyIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#0f172a",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  tripHubPartyIconBtnOnDarkCard: {
    backgroundColor: "#0f172a",
    borderColor: "rgba(255,255,255,0.2)",
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  tripHubPartyIconBtnOn: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tripHubPartyIconBtnOff: {
    opacity: 0.34,
  },
  tripHubPartyUnreadDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#f43f5e",
    borderWidth: 1.5,
    borderColor: "#fff",
    shadowColor: "#f43f5e",
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  tripHubLastMsg: {
    marginTop: 6,
    fontSize: 9,
    fontWeight: "400",
    color: "#64748b",
    lineHeight: 12,
    letterSpacing: 0.1,
  },
  tripHubLastMsgOn: {
    color: "rgba(248,250,252,0.55)",
  },
  tripHubLastMsgParty: {
    fontWeight: "400",
    color: "#94a3b8",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 4,
  },
  sectionHeaderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CHAT_ACCENT,
  },
  sectionHeaderText: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  sectionHeaderTextMuted: {
    color: "#94a3b8",
  },
  loadMoreBtn: {
    marginTop: 8,
    marginHorizontal: 4,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  commandMetricCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
  },
  commandMetricCardPrimary: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  commandMetricLabel: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  commandMetricValue: {
    marginTop: 5,
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.4,
    fontStyle: "italic",
  },
  /** Single row: search (flex) + Active / History — inset matches tabRow padding so edges line up. */
  tripSearchScopeStrip: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 6,
    marginHorizontal: 18,
    marginBottom: 12,
  },
  tripSearchScopeSearchWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sidebarSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    color: "#334155",
    fontWeight: "500",
    paddingVertical: 0,
  },
  tripSearchScopeSegment: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 5,
    flexShrink: 0,
  },
  tripChatScopePillStrip: {
    minWidth: 58,
    maxWidth: 84,
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  tripChatScopePillOn: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  tripChatScopePillTextStrip: {
    fontSize: 8,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tripChatScopePillTextOn: {
    color: "#ffffff",
  },
  tabPill: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    backgroundColor: "#ffffff",
    minHeight: 34,
  },
  tabPillLabelWrap: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tabPillActive: {
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tabPillLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: "#64748b",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    textAlign: "center",
  },
  tabPillLabelActive: { color: "#ffffff" },
  tabUnreadBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_ACCENT,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  tabUnreadBadgeActive: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(255,255,255,0.5)",
  },
  tabUnreadText: { fontSize: 8, fontWeight: "700", color: "#fff" },
  tabUnreadTextActive: { color: "#0f172a" },

  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 11,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e9edf5",
    shadowColor: "#0f172a",
    shadowOpacity: 0.045,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  registryWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
  },
  registryHeadBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
  },
  registryTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    fontStyle: "italic",
    letterSpacing: -0.2,
  },
  registrySub: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    lineHeight: 14,
  },
  registrySwitchRow: {
    flexDirection: "row",
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    padding: 4,
    gap: 4,
    backgroundColor: "#f8fafc",
  },
  registrySwitchBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  registrySwitchBtnOn: {
    backgroundColor: "#0f172a",
  },
  registrySwitchBtnOff: {
    opacity: 0.6,
  },
  registrySwitchText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  registrySwitchTextOn: {
    color: "#fff",
  },
  registrySwitchTextOff: {
    color: "#94a3b8",
  },
  registryList: {
    flex: 1,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
    backgroundColor: "#ffffff",
    padding: 10,
  },
  registryListTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  registryTripBlock: {
    marginBottom: 8,
  },
  registryTripBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  registryTripBtnOn: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  registryTripId: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0f172a",
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  registryTripIdOn: {
    color: "#fff",
  },
  registryTripRoute: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },
  registryTripRouteOn: {
    color: "rgba(255,255,255,0.68)",
  },
  registryPartyList: {
    marginTop: 6,
    paddingLeft: 8,
    gap: 6,
  },
  registryPartyRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  registryPartyRowOn: {
    borderColor: CHAT_ACCENT,
    backgroundColor: "#eef2ff",
  },
  registryPartyType: {
    fontSize: 8,
    fontWeight: "900",
    color: CHAT_ACCENT,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  registryPartyTypeOn: {
    color: CHAT_ACCENT,
  },
  registryPartyName: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "#0f172a",
  },
  registryPartyNameOn: {
    color: "#1e293b",
  },
  registryUnreadPill: {
    marginTop: 4,
    alignSelf: "flex-start",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_ACCENT,
  },
  registryUnreadPillText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#fff",
  },
  registryPartyActiveDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#22c55e",
  },
  chatItemActive: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  chatIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  chatIconActive: { backgroundColor: "rgba(255,255,255,0.14)" },
  chatAvatarWrap: {
    position: "relative",
    flexShrink: 0,
  },
  chatAvatarUnreadDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: CHAT_ACCENT,
    borderWidth: 2,
    borderColor: "#fff",
  },
  chatBody: { flex: 1, minWidth: 0 },
  chatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  chatTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  chatPendingFeedbackStar: { marginLeft: 2 },
  chatTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", flex: 1, textTransform: "uppercase", fontStyle: "italic" },
  chatTitleActive: { color: "#fff" },
  activeTripDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CHAT_ACCENT,
    flexShrink: 0,
  },
  activeTripDotActive: { backgroundColor: "#fff" },
  chatTime: { fontSize: 9, color: "#94a3b8", marginLeft: 8, flexShrink: 0, textTransform: "uppercase", fontWeight: "700" },
  chatTimeActive: { color: "rgba(255,255,255,0.55)" },
  chatPartyLabel: {
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.15,
    marginBottom: 2,
  },
  chatPartyLabelActive: { color: "rgba(255,255,255,0.88)" },
  chatSub: { fontSize: 12, color: "#94a3b8", lineHeight: 16 },
  chatSubActive: { color: "rgba(255,255,255,0.65)" },

  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
    backgroundColor: "#ffffff",
  },
  detailIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: { fontSize: 15, fontWeight: "900", color: "#0f172a", letterSpacing: -0.2, fontStyle: "italic" },
  /** Party / org subtitle under trip title — matches ledger `tableCellParty` (light italic, not bold). */
  detailPartySubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textRouteCard,
    letterSpacing: 0.15,
  },
  detailMissionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fdfefe",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  detailMissionRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    paddingRight: 6,
  },
  detailMissionRouteTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  detailMissionRouteLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  detailMissionRouteTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  detailMissionRouteText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailMissionDate: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  detailMissionTabsScroller: {
    flexShrink: 0,
    flexGrow: 0,
    maxWidth: "58%",
    minHeight: 44,
  },
  detailMissionUnread: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
  },
  detailMissionUnreadText: {
    fontSize: 9,
    fontWeight: "900",
    color: CHAT_ACCENT,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailSwitchBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  detailSwitchBarCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  detailTripSelectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  detailTripSelectorText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1e293b",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailPartyTabs: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexGrow: 1,
    gap: 6,
    paddingLeft: 8,
    paddingRight: 0,
    minHeight: 44,
  },
  detailPartyTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e8ecf1",
    backgroundColor: "#ffffff",
    maxWidth: 200,
    minHeight: 44,
  },
  detailPartyTabOn: {
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
  },
  detailPartyTabOff: {
    borderStyle: "dashed",
    opacity: 0.92,
  },
  detailPartyTabTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: "center",
  },
  detailPartyTabName: {
    fontSize: 10,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.12,
    textTransform: "uppercase",
  },
  detailPartyTabNameOn: {
    color: "rgba(255,255,255,0.92)",
  },
  detailPartyTabText: {
    fontSize: 8,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.65,
  },
  detailPartyTabTextOn: {
    color: "rgba(248,250,252,0.82)",
  },
  detailPartyTabTextOff: {
    color: "#94a3b8",
  },
  /** Mission bar party chips: role glyph (briefcase / truck / user), not initials. */
  detailPartyTabIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  detailPartyTabIconWrapOn: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.22)",
  },

  detailPanel: { flex: 1, minHeight: 0, backgroundColor: "transparent" },
  detailTransitionShell: { flex: 1, minHeight: 0 },
  msgs: { flex: 1, backgroundColor: "transparent" },
  msgsContent: { padding: 18, gap: 14, paddingBottom: 24 },

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
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn: {
    backgroundColor: CHAT_ACCENT,
    borderBottomRightRadius: 6,
    shadowColor: CHAT_ACCENT,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  bubbleOther: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: "#e9edf5",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextOwn: { color: "#fff" },
  bubbleTextOther: { color: "#1e293b" },
  bubbleMeta: { fontSize: 10, color: "#94a3b8", letterSpacing: 0.2 },
  bubbleMetaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  bubbleMetaRowOwn: { justifyContent: "flex-end" },

  inputWrap: {
    position: "relative",
    backgroundColor: "#fff",
    borderTopWidth: 0,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
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
    backgroundColor: "#f8fafc",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#eef2f7",
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1e293b",
    maxHeight: 96,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e9edf5",
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  /** Idle (no text): purple accent; with text `sendBtn` overrides to black. */
  sendBtnOff: {
    backgroundColor: CHAT_ACCENT,
    shadowColor: CHAT_ACCENT,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

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
    maxWidth: "100%",
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
    maxWidth: "100%",
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
    backgroundColor: CHAT_ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  /** Trip filter sheet (used inside `cm.sheet`; styles live on `s` with list chrome). */
  filterChipWrap: {
    width: "100%",
    flexDirection: "column",
    marginBottom: 16,
  },
  filterChip: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipLast: { marginBottom: 0 },
  filterChipActive: { borderColor: CHAT_ACCENT, backgroundColor: CHAT_ACCENT },
  filterChipText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  filterChipTextActive: { color: "#fff" },
  filterResetBtn: {
    width: "100%",
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  filterResetText: { color: "#334155", fontSize: 14, fontWeight: "700" },
  tripFilterPopoverLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    zIndex: 80,
  },
  tripFilterPopoverBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  tripFilterPopoverCard: {
    position: "absolute",
    top: 96,
    left: 10,
    right: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tripFilterPopoverHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  tripFilterPopoverTitle: { fontSize: 14, color: "#0f172a", fontWeight: "800" },
  tripFilterPopoverSub: { fontSize: 11, color: "#94a3b8", marginBottom: 12 },

  composePopoverLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    zIndex: 90,
  },
  composePopoverCard: {
    position: "absolute",
    top: 88,
    left: 10,
    right: 10,
    maxHeight: "78%",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  tripInfo: { flex: 1, minWidth: 0 },
  tripMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tripNumber: { fontSize: 13, fontWeight: "800", color: "#0f172a" },
  tripMetaPill: {
    backgroundColor: "#eef2ff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: CHAT_ACCENT_BORDER,
  },
  tripMetaPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: CHAT_ACCENT,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  tripRoute: { fontSize: 11, color: "#94a3b8", marginTop: 3, lineHeight: 15 },

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
    color: CHAT_ACCENT,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  partyName: {
    fontSize: 11,
    fontWeight: "300",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    marginTop: 1,
  },

  partyRowDisabled: {
    position: "relative",
    overflow: "hidden",
    opacity: 0.72,
    shadowColor: "#64748b",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  partyRowDisabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(248, 250, 252, 0.82)",
  },
  partyIconWrapMuted: { opacity: 0.55 },
  partyTypeMuted: { color: "#94a3b8" },
  partyDisabledHint: { fontSize: 14, color: "#cbd5e1", fontWeight: "600", paddingHorizontal: 4 },
});

// ── Conversation detail (module scope: stable component identity so TextInput keeps focus) ─

function ChatDetailHeader({
  title,
  subtitle,
  partyType,
  isDesktop,
  onCloseDetail,
}: {
  title: string;
  subtitle?: string;
  partyType?: ConversationPartyType;
  isDesktop: boolean;
  onCloseDetail: () => void;
}) {
  return (
    <View style={s.detailHeader}>
      {!isDesktop && (
        <TouchableOpacity onPress={onCloseDetail} hitSlop={10} style={{ marginRight: 8 }}>
          <ArrowLeft size={20} color="#0f172a" />
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
          <Text style={s.detailPartySubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity hitSlop={10}>
        <Search size={17} color="#64748b" />
      </TouchableOpacity>
      <TouchableOpacity hitSlop={10} style={{ marginLeft: 8 }}>
        <MoreVertical size={17} color="#64748b" />
      </TouchableOpacity>
    </View>
  );
}

function ChatSystemMsg({ label }: { label: string }) {
  return (
    <View style={s.sysMsg}>
      <Text style={s.sysMsgText}>{label}</Text>
    </View>
  );
}

function ChatBubble({
  isOwn,
  content,
  timestamp,
  senderName,
  avatarSeed,
  deliveryStatus,
  isNew,
}: {
  isOwn: boolean;
  content: string;
  timestamp: string;
  senderName?: string;
  avatarSeed?: string | null;
  /** WhatsApp-style ticks for outgoing rows (from `resolveOutgoingDeliveryStatus`). */
  deliveryStatus?: MessageDeliveryStatus;
  /** True only for messages that arrived via Realtime after this screen mounted.
   *  Bootstrap messages start fully visible to avoid the "flash of invisible" blink. */
  isNew?: boolean;
}) {
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  let displayTime = timestamp;
  try {
    displayTime = new Date(timestamp).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  // Capture isNew at first mount only — never re-animate on re-renders.
  const wasNewRef = useRef(isNew === true);
  const wasNew    = wasNewRef.current;

  // Bootstrap messages start at opacity=1 / translateY=0 / scale=1 (no animation).
  // Only brand-new Realtime messages slide in from below.
  const enterOpacity = useRef(new Animated.Value(wasNew ? 0 : 1)).current;
  const enterY       = useRef(new Animated.Value(wasNew ? 8 : 0)).current;
  const enterScale   = useRef(new Animated.Value(wasNew ? 0.97 : 1)).current;

  useEffect(() => {
    if (!wasNew) return;
    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(enterY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.spring(enterScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 3,
      }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs once on mount

  return (
    <Animated.View
      style={[
        s.bubbleWrap,
        isOwn ? s.bubbleWrapOwn : s.bubbleWrapOther,
        {
          opacity: enterOpacity,
          transform: [{ translateY: enterY }, { scale: enterScale }],
        },
      ]}
    >
      {!isOwn && (
        <PartyAvatar
          name={senderName ?? "?"}
          entityType="client"
          size={32}
          avatarSeed={avatarSeed ?? null}
        />
      )}
      <View style={{ maxWidth: "72%" }}>
        <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
          <Text style={[s.bubbleText, isOwn ? s.bubbleTextOwn : s.bubbleTextOther]}>{content}</Text>
        </View>
        <View style={[s.bubbleMetaRow, isOwn && s.bubbleMetaRowOwn]}>
          <Text style={s.bubbleMeta}>
            {displayTime}
            {senderName ? ` · ${senderName.toUpperCase()}` : " · YOU"}
          </Text>
          {isOwn && <MessageTick status={deliveryStatus} />}
        </View>
      </View>
      {isOwn && (
        <PartyAvatar
          name={profile?.full_name || profile?.displayName || "You"}
          entityType="client"
          size={32}
          organizationImageUrl={currentOrganization?.logo_url ?? null}
          avatarUrl={profile?.avatar_url ?? null}
        />
      )}
    </Animated.View>
  );
}

function ChatInputBar({
  quickMsgs,
  messageInput,
  onChangeMessage,
  showEmoji,
  setShowEmoji,
  showScripts,
  setShowScripts,
  onSend,
  onOpenDocShare,
  inputOverlayMaxWidth,
}: {
  quickMsgs: string[];
  messageInput: string;
  onChangeMessage: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: () => void;
  onOpenDocShare?: () => void;
  /** Caps emoji / quick-message popovers on narrow viewports (mobile web). */
  inputOverlayMaxWidth?: number;
}) {
  const overlayW = inputOverlayMaxWidth ?? 300;
  const canSend = messageInput.trim().length > 0;
  const sendScale = useRef(new Animated.Value(canSend ? 1 : 0.92)).current;

  useEffect(() => {
    Animated.spring(sendScale, {
      toValue: canSend ? 1 : 0.92,
      useNativeDriver: true,
      speed: 16,
      bounciness: 6,
    }).start();
  }, [canSend, sendScale]);

  return (
    <View style={s.inputWrap}>
      {showEmoji ? (
        <View style={[s.emojiPopup, { width: Math.min(240, overlayW) }]}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
            {QUICK_EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                style={s.emojiBtn}
                onPress={() => {
                  onChangeMessage((p) => p + e);
                  setShowEmoji(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 22 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      {showScripts ? (
        <View style={[s.scriptPopup, { width: Math.min(300, overlayW) }]}>
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
                  onChangeMessage(m);
                  setShowScripts(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={s.scriptItemText}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <View style={s.inputRow}>
        <TouchableOpacity
          style={s.plusBtn}
          hitSlop={6}
          onPress={onOpenDocShare}
          activeOpacity={0.75}
        >
          <Plus size={16} color={onOpenDocShare ? CHAT_ACCENT : "#94a3b8"} />
        </TouchableOpacity>
        <TextInput
          style={s.input}
          value={messageInput}
          onChangeText={onChangeMessage}
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
          <Smile size={19} color={showEmoji ? CHAT_ACCENT : "#94a3b8"} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={() => {
            setShowScripts((v) => !v);
            setShowEmoji(false);
          }}
          hitSlop={6}
        >
          <FileType size={19} color={showScripts ? CHAT_ACCENT : "#94a3b8"} />
        </TouchableOpacity>
        <Animated.View style={{ transform: [{ scale: sendScale }] }}>
          <TouchableOpacity
            style={[s.sendBtn, !canSend && s.sendBtnOff]}
            onPress={onSend}
            disabled={!canSend}
            activeOpacity={0.85}
            onPressIn={() => {
              if (!canSend) return;
              Animated.spring(sendScale, {
                toValue: 0.93,
                useNativeDriver: true,
                speed: 24,
                bounciness: 0,
              }).start();
            }}
            onPressOut={() => {
              if (!canSend) return;
              Animated.spring(sendScale, {
                toValue: 1,
                useNativeDriver: true,
                speed: 24,
                bounciness: 5,
              }).start();
            }}
          >
            <Send size={15} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
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
            onPress={() => onChangeMessage(m)}
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

function TripConversationDetailPanel({
  selectedConv,
  conversations,
  composeTrips,
  messagesRef,
  messageInput,
  setMessageInput,
  showEmoji,
  setShowEmoji,
  showScripts,
  setShowScripts,
  onSend,
  onOpenDocShare,
  isDesktop,
  compactConversationToolbar,
  inputOverlayMaxWidth,
  onCloseDetail,
  currentOrgId,
  onAddToBook,
  onDispute,
  addingToBookId,
  onSelectConversation,
  onOpenCompose,
  onFeedbackSubmitted,
}: {
  selectedConv: TripConversation | null;
  conversations: TripConversation[];
  composeTrips: TripForCompose[];
  messagesRef: React.RefObject<FlatList | null>;
  messageInput: string;
  setMessageInput: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: () => void;
  onOpenDocShare: () => void;
  isDesktop: boolean;
  compactConversationToolbar: boolean;
  inputOverlayMaxWidth: number;
  onCloseDetail: () => void;
  currentOrgId: string;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  addingToBookId: string | null;
  onSelectConversation: (id: string) => void;
  onOpenCompose: () => void | Promise<void>;
  onFeedbackSubmitted: () => void;
}) {
  if (!selectedConv) return <EmptyDetail />;
  return (
    <TripConversationDetailLoaded
      selectedConv={selectedConv}
      conversations={conversations}
      composeTrips={composeTrips}
      messagesRef={messagesRef}
      messageInput={messageInput}
      setMessageInput={setMessageInput}
      showEmoji={showEmoji}
      setShowEmoji={setShowEmoji}
      showScripts={showScripts}
      setShowScripts={setShowScripts}
      onSend={onSend}
      onOpenDocShare={onOpenDocShare}
      isDesktop={isDesktop}
      inputOverlayMaxWidth={inputOverlayMaxWidth}
      onCloseDetail={onCloseDetail}
      currentOrgId={currentOrgId}
      onAddToBook={onAddToBook}
      onDispute={onDispute}
      addingToBookId={addingToBookId}
      onSelectConversation={onSelectConversation}
      onOpenCompose={onOpenCompose}
      onFeedbackSubmitted={onFeedbackSubmitted}
    />
  );
}

function TripConversationDetailLoaded({
  selectedConv,
  conversations,
  composeTrips,
  messagesRef,
  messageInput,
  setMessageInput,
  showEmoji,
  setShowEmoji,
  showScripts,
  setShowScripts,
  onSend,
  onOpenDocShare,
  isDesktop,
  inputOverlayMaxWidth,
  onCloseDetail,
  currentOrgId,
  onAddToBook,
  onDispute,
  addingToBookId,
  onSelectConversation,
  onOpenCompose,
  onFeedbackSubmitted,
}: {
  selectedConv: TripConversation;
  conversations: TripConversation[];
  composeTrips: TripForCompose[];
  messagesRef: React.RefObject<FlatList | null>;
  messageInput: string;
  setMessageInput: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: () => void;
  onOpenDocShare: () => void;
  isDesktop: boolean;
  inputOverlayMaxWidth: number;
  onCloseDetail: () => void;
  currentOrgId: string;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  addingToBookId: string | null;
  onSelectConversation: (id: string) => void;
  onOpenCompose: () => void | Promise<void>;
  onFeedbackSubmitted: () => void;
}) {
  const { profile } = useAuth();
  const selfUid = (profile as any)?.uid ?? null;
  const { markTripThreadsRead, initiateConversation } = useTripChat();

  // Subscribe directly to this conversation for live message updates.
  // Re-renders only when THIS conversation changes, not the full list.
  const liveConv = useConversation(selectedConv.id) ?? selectedConv;
  const liveConvRef = useRef(liveConv);
  liveConvRef.current = liveConv;

  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const olderInFlightRef = useRef(false);
  const autoBackfillAttemptedRef = useRef<string | null>(null);
  const olderStartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mergeHistoryPage = useCallback((rows: TripMessageRow[]) => {
    const id = liveConvRef.current.id;
    chatStore.mergeConversationHistory(id, rows);
    setHasMoreOlder(rows.length === TRIP_CHAT_HISTORY_PAGE);
  }, []);

  /** Newest page (empty thread backfill or manual retry). */
  const loadLatestHistoryPage = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await getMessagesByConversation(liveConv.id, {
        limit: TRIP_CHAT_HISTORY_PAGE,
      });
      mergeHistoryPage(rows);
    } catch {
      // silent — user can retry
    } finally {
      setHistoryLoading(false);
    }
  }, [liveConv.id, mergeHistoryPage]);

  /** Older messages than the current oldest row in this lane. */
  const loadOlderHistoryPage = useCallback(async () => {
    if (!hasMoreOlder || olderInFlightRef.current) return;
    const msgs = liveConvRef.current.messages;
    if (msgs.length === 0) return;
    olderInFlightRef.current = true;
    setLoadingOlder(true);
    try {
      const oldest = msgs[0].created_at;
      const rows = await getMessagesByConversation(liveConvRef.current.id, {
        before: oldest,
        limit: TRIP_CHAT_HISTORY_PAGE,
      });
      if (rows.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      mergeHistoryPage(rows);
    } catch {
      // non-critical
    } finally {
      olderInFlightRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMoreOlder, mergeHistoryPage]);

  const onStartReachedLoadOlder = useCallback(() => {
    if (olderStartDebounceRef.current) return;
    const convIdWhenScheduled = liveConvRef.current.id;
    olderStartDebounceRef.current = setTimeout(() => {
      olderStartDebounceRef.current = null;
      if (liveConvRef.current.id !== convIdWhenScheduled) return;
      void loadOlderHistoryPage();
    }, 400);
  }, [loadOlderHistoryPage]);

  useEffect(
    () => () => {
      if (olderStartDebounceRef.current) {
        clearTimeout(olderStartDebounceRef.current);
        olderStartDebounceRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    setHasMoreOlder((liveConv.messages?.length ?? 0) >= TRIP_CHAT_HISTORY_PAGE);
    autoBackfillAttemptedRef.current = null;
    olderInFlightRef.current = false;
    if (olderStartDebounceRef.current) {
      clearTimeout(olderStartDebounceRef.current);
      olderStartDebounceRef.current = null;
    }
  }, [liveConv.id]);

  // One automatic backfill when the lane shows a preview but no rows (e.g. visibility
  // filter vs bootstrap) — single flight per conversation; uses same paged query as manual load.
  useEffect(() => {
    if (liveConv.messages.length > 0) return;
    const preview = (liveConv.last_message_preview ?? "").trim();
    if (!preview) return;
    if (autoBackfillAttemptedRef.current === liveConv.id) return;
    autoBackfillAttemptedRef.current = liveConv.id;

    let cancelled = false;
    setHistoryLoading(true);
    void getMessagesByConversation(liveConv.id, { limit: TRIP_CHAT_HISTORY_PAGE })
      .then((rows) => {
        if (cancelled) return;
        mergeHistoryPage(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    liveConv.id,
    liveConv.messages.length,
    liveConv.last_message_preview,
    mergeHistoryPage,
  ]);

  const [tripRatings, setTripRatings] = useState<RatingRow[]>([]);

  // Feedback submitted: store was already patched optimistically in
  // ChatFeedbackCard — no DB refresh needed here.
  const ratingsLoadedForKeyRef = useRef<string | null>(null);
  const handleFeedbackSubmitted = useCallback(() => {
    onFeedbackSubmitted();
  }, [onFeedbackSubmitted]);

  // ── useMarkSeen: viewport-based per-message seen tracking ─────────────────
  const { onViewableItemsChanged, viewabilityConfig } = useMarkSeen({
    conversationId: liveConv.id,
    selfUid,
  });

  const effectiveTripStatus = useMemo(() => {
    const direct = liveConv.trip_status;
    if (direct != null && String(direct).trim() !== "") return direct;
    return composeTrips.find((t) => t.id === liveConv.trip_id)?.status ?? null;
  }, [composeTrips, liveConv.trip_id, liveConv.trip_status]);

  const tripEligibleForFeedback = isTripFeedbackEligibleStatus(effectiveTripStatus);

  // Snapshot messages in a ref — avoids adding to ratings effect deps.
  const liveMessagesRef = useRef(liveConv.messages);
  liveMessagesRef.current = liveConv.messages;

  useEffect(() => {
    if (!tripEligibleForFeedback) {
      setTripRatings([]);
      ratingsLoadedForKeyRef.current = null;
      return;
    }
    const key = liveConv.trip_id;
    if (ratingsLoadedForKeyRef.current === key) return;
    ratingsLoadedForKeyRef.current = key;

    let cancelled = false;
    void (async () => {
      const { ratings, error } = await getRatingsForTrip(key);
      if (cancelled) return;
      if (error && __DEV__) console.warn("[getRatingsForTrip]", error.message);
      const rows = ratings ?? [];
      setTripRatings(rows);
      // Read-only merge: `mergeTripChatMessagesWithFeedbackRatings` shows trip-page ratings in-stream.
      // Do not write metadata on open (avoids write-on-read / pool pressure); DB trigger + submit RPC own stamps.
    })();
    return () => { cancelled = true; };
  }, [tripEligibleForFeedback, liveConv.trip_id, liveConv.id]);

  const displayMessages = useMemo(
    () =>
      dedupeFeedbackRequestMessages(
        dedupeTripStatusBroadcastsForLane(
          mergeTripChatMessagesWithFeedbackRatings(
            liveConv.trip_id,
            liveConv.messages,
            tripRatings,
          ),
          liveConv.id,
        ),
      ),
    [liveConv.trip_id, liveConv.id, liveConv.messages, tripRatings],
  );

  const handleIslandNavigateTrip = useCallback(
    (tripId: string) => {
      const lanes = conversations.filter((c) => c.trip_id === tripId);
      const pick =
        lanes.find((c) => c.party_type === liveConv.party_type) ?? lanes[0];
      if (pick) onSelectConversation(pick.id);
    },
    [conversations, liveConv.party_type, onSelectConversation],
  );

  const messageListLayout = useMemo(
    () => buildTripMessageListLayoutMeta(displayMessages, liveConv.party_type),
    [displayMessages, liveConv.party_type],
  );

  const getMessageItemLayout = useCallback(
    (_data: ArrayLike<TripMessageRow> | null | undefined, index: number) =>
      messageListLayout.getItemLayout(index),
    [messageListLayout],
  );

  const quickMsgs = QUICK_MESSAGES[liveConv.party_type];
  const PARTY_ORDER: ConversationPartyType[] = ["client", "supplier", "driver"];
  // useConversationsByTrip returns all lanes for this trip from the singleton store.
  const sameTripConversations = useConversationsByTrip(liveConv.trip_id);
  const partyConversationMap = PARTY_ORDER.reduce((acc, partyType) => {
    acc[partyType] = sameTripConversations.find((conv) => conv.party_type === partyType) ?? null;
    return acc;
  }, {} as Record<ConversationPartyType, TripConversation | null>);

  const tripCompose = useMemo(
    () => composeTrips.find((t) => t.id === liveConv.trip_id) ?? null,
    [composeTrips, liveConv.trip_id],
  );

  const clientId =
    partyConversationMap.client?.client_id ?? tripCompose?.client_id ?? null;
  const supplierId =
    partyConversationMap.supplier?.supplier_id ??
    tripCompose?.supplier_id ??
    liveConv.trip_supplier_id ??
    null;
  const driverId =
    partyConversationMap.driver?.driver_id ??
    liveConv.trip_driver_id ??
    tripCompose?.driver_id ??
    null;

  const aggregateTrip = isAggregateTrip({ supplier_id: supplierId });

  const detailVisiblePartyTypes = useMemo(
    () =>
      PARTY_ORDER.filter((p) => {
        if (p === "client") {
          return Boolean(String(clientId ?? "").trim()) || Boolean(partyConversationMap.client);
        }
        if (p === "supplier") {
          return (
            aggregateTrip &&
            (Boolean(String(supplierId ?? "").trim()) ||
              Boolean(partyConversationMap.supplier))
          );
        }
        return Boolean(String(driverId ?? "").trim()) || Boolean(partyConversationMap.driver);
      }),
    [
      aggregateTrip,
      clientId,
      supplierId,
      driverId,
      partyConversationMap.client,
      partyConversationMap.supplier,
      partyConversationMap.driver,
    ],
  );

  const displayPartyName = useCallback(
    (partyType: ConversationPartyType): string => {
      const conv = partyConversationMap[partyType];
      const fromConv = (conv?.party_name ?? "").trim();
      if (fromConv) return fromConv;
      if (partyType === "client") {
        return (tripCompose?.client_name ?? "").trim();
      }
      if (partyType === "supplier") {
        return (tripCompose?.supplier_name ?? "").trim();
      }
      return (tripCompose?.driver_display_name ?? "").trim();
    },
    [partyConversationMap, tripCompose],
  );

  const switchConversation = async (partyType: ConversationPartyType) => {
    // Always persist the active party selection immediately.
    chatStore.switchParty(liveConv.trip_id, partyType);

    const target = partyConversationMap[partyType];
    if (target) {
      onSelectConversation(target.id);
      void markTripThreadsRead(liveConv.trip_id);
      return;
    }

    // Create-on-demand: party entity known but conversation not yet started.
    const partyRow = getComposePartyRows(
      tripCompose ?? {
        id: liveConv.trip_id,
        trip_number: liveConv.trip_number,
        display_trip_id: liveConv.display_trip_id ?? null,
        pickup_area: liveConv.pickup_area,
        drop_location: liveConv.drop_location,
        status: liveConv.trip_status ?? "active",
        client_id: clientId ?? null,
        client_name: null,
        client_linked_organization_id: null,
        supplier_id: supplierId ?? null,
        supplier_name: null,
        supplier_linked_organization_id: null,
        driver_id: driverId ?? null,
        driver_display_name: null,
        created_at: liveConv.trip_created_at ?? null,
      } as TripForCompose,
    ).find((r) => r.kind === "selectable" && r.partyType === partyType);

    if (!partyRow || partyRow.kind !== "selectable") return;

    const convId = await initiateConversation({
      tripId: liveConv.trip_id,
      tripNumber: liveConv.trip_number,
      pickupArea: liveConv.pickup_area,
      dropLocation: liveConv.drop_location,
      partyType,
      partyName: partyRow.name,
      partyId: partyRow.id,
    });
    if (convId) {
      onSelectConversation(convId);
      void markTripThreadsRead(liveConv.trip_id);
    }
  };

  const missionDateLabel = formatTripRouteDate(liveConv.trip_created_at);

  const tripMeta = useTripMeta(liveConv.trip_id, currentOrgId, {
    partyType:        liveConv.party_type,
    conversationId: liveConv.id,
  });
  const paymentBalance = tripMeta?.payment_balance ?? null;

  // Timestamp captured once at mount. Messages created after this instant
  // arrived via Realtime and get the slide-in animation; bootstrap messages do not.
  const mountedAtMs = useRef(Date.now()).current;

  // FlatList requires onViewableItemsChanged to be stable after mount.
  // This ref-backed wrapper lets us always call the latest version without
  // triggering the "changing onViewableItemsChanged after mount" warning.
  const _viewableRef = useRef(onViewableItemsChanged);
  _viewableRef.current = onViewableItemsChanged;
  const stableOnViewableItemsChanged = useRef(
    (info: Parameters<typeof onViewableItemsChanged>[0]) => _viewableRef.current(info)
  ).current;

  const renderMessage = useCallback(({ item: m }: { item: TripMessageRow }) => {
    // Tab visibility filter — zero DB calls; pure memory filter on party_type.
    // Ledger events only appear in Client/Supplier tabs; tracking in Driver tab.
    if (!isMessageVisibleInTab(m.message_type, liveConv.party_type)) return null;

    if (
      m.message_type === "status_change" ||
      m.message_type === "image" ||
      m.message_type === "tracking"
    ) {
      return (
        <SystemEventCard
          message={m}
          isOwn={m.sender_role === "dispatcher"}
          currentOrgId={currentOrgId}
          conversationPartyName={liveConv.party_name}
          onAddToBook={onAddToBook}
          onDispute={onDispute}
          addingToBook={addingToBookId === m.id}
        />
      );
    }
    if (
      m.message_type === "system" ||
      m.message_type === "update" ||
      m.message_type === "system_log"
    ) {
      if (isLongHaulLateChatMessage(m)) {
        return <LateAlertCard message={m} />;
      }
      const locData = parseSystemLogLocationData(m);
      if (locData) {
        return <LocationEventCard message={m} location={locData} />;
      }
      return <ChatSystemEventCard message={m} />;
    }
    if (
      m.message_type === "ledger_event" ||
      m.message_type === "ledger" ||
      m.message_type === "payment" ||
      m.message_type === "ledger_update"
    ) {
      if (!ledgerEventInvolvesOrg(m, currentOrgId)) return null;
      return (
        <ChatLedgerEventCard
          message={m}
          currentOrgId={currentOrgId}
          conversationPartyName={liveConv.party_name}
          onAddToBook={onAddToBook}
          onDispute={onDispute}
          addingToBook={addingToBookId === m.id}
        />
      );
    }
    if (m.message_type === "document_share") {
      return <DocumentShareCard message={m} isOwn={m.sender_role === "dispatcher"} />;
    }
    if (m.message_type === "feedback_request" || m.message_type === "feedback") {
      if (!tripFeedbackRequestMatchesConversation(m, liveConv)) return null;
      return (
        <ChatFeedbackCard
          message={m}
          tripId={liveConv.trip_id}
          ratingOrganizationId={
            liveConv.trip_organization_id ?? liveConv.organization_id
          }
          currentOrgId={currentOrgId}
          onSubmitted={handleFeedbackSubmitted}
        />
      );
    }
    return (
      <ChatBubble
        isOwn={m.sender_role === "dispatcher"}
        content={m.content}
        timestamp={m.created_at}
        senderName={m.sender_role !== "dispatcher" ? m.sender_name : undefined}
        avatarSeed={m.sender_role !== "dispatcher" ? m.sender_avatar_seed : undefined}
        deliveryStatus={
          m.sender_role === "dispatcher"
            ? resolveOutgoingDeliveryStatus(m)
            : undefined
        }
        isNew={Date.parse(m.created_at) > mountedAtMs}
      />
    );
  }, [currentOrgId, liveConv, onAddToBook, onDispute, addingToBookId, handleFeedbackSubmitted, mountedAtMs]);

  const partyTabIcon = (partyType: ConversationPartyType, selected: boolean) => (
    <View
      style={[s.detailPartyTabIconWrap, selected && s.detailPartyTabIconWrapOn]}
    >
      <PartyIcon
        partyType={partyType}
        active={selected}
        size={18}
        tone={selected ? "list" : "hub"}
      />
    </View>
  );

  return (
    <View style={s.detailPanel}>
      <ChatDetailHeader
        title={`${liveConv.trip_number} · ${partyLabel(liveConv.party_type)}`}
        subtitle={formatChatPartyName(liveConv.party_name) ?? undefined}
        partyType={liveConv.party_type}
        isDesktop={isDesktop}
        onCloseDetail={onCloseDetail}
      />
      <DynamicTripIsland
        currentTripId={liveConv.trip_id}
        onNavigateTrip={handleIslandNavigateTrip}
        onReplyShortcut={() => {
          messagesRef.current?.scrollToEnd({ animated: true });
        }}
      />
      <View style={s.detailMissionBar}>
        <View style={s.detailMissionRoute}>
          <MapPin size={13} color={CHAT_ACCENT} />
          <View style={s.detailMissionRouteTextBlock}>
            <View style={s.detailMissionRouteLine}>
              <View style={s.detailMissionRouteTextWrap}>
                <Text style={s.detailMissionRouteText} numberOfLines={1} ellipsizeMode="tail">
                  {liveConv.pickup_area} {"→"} {liveConv.drop_location}
                </Text>
              </View>
              {missionDateLabel ? (
                <Text style={s.detailMissionDate} numberOfLines={1}>
                  {missionDateLabel}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        {paymentBalance != null &&
          (liveConv.party_type === 'client' || liveConv.party_type === 'supplier') ? (
          <View style={s.detailMissionUnread}>
            <Text style={s.detailMissionUnreadText}>
              {paymentBalance >= 0 ? '+' : '−'}₹{Math.abs(paymentBalance).toLocaleString('en-IN')}
            </Text>
          </View>
        ) : null}
        {detailVisiblePartyTypes.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.detailMissionTabsScroller}
            contentContainerStyle={s.detailPartyTabs}
          >
            {detailVisiblePartyTypes.map((partyType) => {
              const on = liveConv.party_type === partyType;
              const hasConversation = Boolean(partyConversationMap[partyType]);
              const partyLine = formatChatPartyName(displayPartyName(partyType));
              return (
                <TouchableOpacity
                  key={partyType}
                  style={[
                    s.detailPartyTab,
                    on && s.detailPartyTabOn,
                    !hasConversation && s.detailPartyTabOff,
                  ]}
                  onPress={() => { void switchConversation(partyType); }}
                  activeOpacity={0.82}
                >
                  {partyTabIcon(partyType, on)}
                  <View style={s.detailPartyTabTextCol}>
                    {partyLine ? (
                      <Text
                        style={[s.detailPartyTabName, on && s.detailPartyTabNameOn]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {partyLine}
                      </Text>
                    ) : null}
                    <Text
                      style={[
                        s.detailPartyTabText,
                        on && s.detailPartyTabTextOn,
                        !hasConversation && s.detailPartyTabTextOff,
                      ]}
                      numberOfLines={1}
                    >
                      {partyLabel(partyType)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
      <FlatList
        ref={messagesRef}
        style={s.msgs}
        contentContainerStyle={s.msgsContent}
        data={displayMessages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        extraData={liveConv}
        getItemLayout={getMessageItemLayout}
        removeClippedSubviews={Platform.OS === "android"}
        windowSize={9}
        maxToRenderPerBatch={12}
        onViewableItemsChanged={stableOnViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}
        onStartReached={onStartReachedLoadOlder}
        onStartReachedThreshold={0.12}
        ListHeaderComponent={
          <>
            <ChatSystemMsg
              label={`${liveConv.pickup_area.toUpperCase()} → ${liveConv.drop_location.toUpperCase()} · TODAY`}
            />
            {loadingOlder ? (
              <View style={{ paddingVertical: 10, alignItems: "center" }}>
                <ActivityIndicator size="small" color={CHAT_ACCENT} />
                <Text style={{ marginTop: 6, fontSize: 11, color: "#94a3b8" }}>Loading earlier messages…</Text>
              </View>
            ) : hasMoreOlder && displayMessages.length > 0 ? (
              <View style={{ paddingVertical: 8, alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => { void loadOlderHistoryPage(); }}
                  hitSlop={{ top: 8, bottom: 8 }}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 12, color: CHAT_ACCENT, fontWeight: "600" }}>
                    Load earlier messages
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {displayMessages.length === 0 && (
              liveConv.last_message_preview ? (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
                  <Text style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                    {historyLoading ? "Loading messages…" : "Messages not loaded"}
                  </Text>
                  {!historyLoading ? (
                    <TouchableOpacity
                      style={{ backgroundColor: CHAT_ACCENT, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 }}
                      onPress={() => { void loadLatestHistoryPage(); }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Load history</Text>
                    </TouchableOpacity>
                  ) : (
                    <ActivityIndicator size="small" color={CHAT_ACCENT} />
                  )}
                </View>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 32 }}>
                  <Text style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                    No messages yet
                  </Text>
                </View>
              )
            )}
          </>
        }
      />
      <ChatInputBar
        quickMsgs={quickMsgs}
        messageInput={messageInput}
        onChangeMessage={setMessageInput}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        showScripts={showScripts}
        setShowScripts={setShowScripts}
        onSend={onSend}
        onOpenDocShare={onOpenDocShare}
        inputOverlayMaxWidth={inputOverlayMaxWidth}
      />
    </View>
  );
}

function NetworkDetailPanel({
  selectedNet,
  messagesRef,
  messageInput,
  setMessageInput,
  showEmoji,
  setShowEmoji,
  showScripts,
  setShowScripts,
  onSend,
  isDesktop,
  inputOverlayMaxWidth,
  onCloseDetail,
}: {
  selectedNet: IntegratedChat | null;
  messagesRef: React.RefObject<FlatList | null>;
  messageInput: string;
  setMessageInput: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: () => void;
  isDesktop: boolean;
  inputOverlayMaxWidth: number;
  onCloseDetail: () => void;
}) {
  if (!selectedNet) return <EmptyDetail />;
  return (
    <View style={s.detailPanel}>
      <ChatDetailHeader
        title={selectedNet.partnerName}
        subtitle={formatChatPartyName(selectedNet.organization) ?? undefined}
        isDesktop={isDesktop}
        onCloseDetail={onCloseDetail}
      />
      <FlatList
        ref={messagesRef}
        style={s.msgs}
        contentContainerStyle={s.msgsContent}
        data={selectedNet.messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item: m }) => (
          <ChatBubble
            isOwn={m.senderId === "dispatcher-1"}
            content={m.content}
            timestamp={m.timestamp}
            senderName={m.senderId !== "dispatcher-1" ? selectedNet.partnerName : undefined}
          />
        )}
        ListHeaderComponent={<ChatSystemMsg label="SECURE CHANNEL · TODAY" />}
        onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}
      />
      <ChatInputBar
        quickMsgs={INTEGRATED_QUICK_MESSAGES}
        messageInput={messageInput}
        onChangeMessage={setMessageInput}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        showScripts={showScripts}
        setShowScripts={setShowScripts}
        onSend={onSend}
        inputOverlayMaxWidth={inputOverlayMaxWidth}
      />
    </View>
  );
}
