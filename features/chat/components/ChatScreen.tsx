import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  Briefcase,
  ChevronDown,
  ChevronRight,
  Edit3,
  Filter,
  Hash,
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
import { useLocalSearchParams, useRouter } from "expo-router";
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
import {
  INTEGRATED_QUICK_MESSAGES,
  IntegratedChat,
  useIntegratedChat,
  type NetworkPartner,
} from "@/features/chat/contexts/IntegratedChatContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  getTripsForCompose,
  sendDocumentShareMessage,
  type TripForCompose,
} from "@/features/chat/services/chat.service";
import {
  acknowledgeLedgerEventMessage,
  disputeLedgerEventMessage,
  mirrorLedgerEntryFromChat,
} from "@/features/chat/services/chatLedgerBridge.service";
import { ChatSystemEventCard, ChatLedgerEventCard } from "./ChatEventCard";
import { DocumentShareCard } from "./DocumentShareCard";
import { DocumentShareSheet } from "./DocumentShareSheet";
import type { ConversationPartyType, LedgerEventMetadata, TripMessageRow } from "../types/chat.types";
import { useAuth } from "@/contexts/AuthContext";
import {
  isTerminalTripStatus,
  parseTripIdSortKey,
} from "@/features/chat/utils/tripConversationSort";

type TabId = "trips" | "network";
type TripStatusFilter = "active" | "terminal";

const QUICK_EMOJIS = ["👍", "🤝", "🚛", "📍", "✅", "📦", "⚠️", "🕒", "😊", "🙌", "📞", "💯"];
const TRIP_PARTY_FILTERS: ConversationPartyType[] = ["client", "driver", "supplier"];
const TRIP_STATUS_FILTERS: TripStatusFilter[] = ["active", "terminal"];

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

function partyFilterSheetLabel(type: ConversationPartyType): string {
  return type === "client" ? "Client" : type === "supplier" ? "Supplier" : "Driver";
}

function statusFilterSheetLabel(type: TripStatusFilter): string {
  return type === "active" ? "Active trips" : "Closed trips";
}

function getConversationTripLabel(conversation: Pick<TripConversation, "trip_number" | "display_trip_id">): string {
  return getTripDisplayNumber({
    trip_number: conversation.trip_number,
    display_trip_id: conversation.display_trip_id ?? null,
  } as TripRow);
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
  /** Web dispatcher layout: use anchored popovers instead of mobile-style bottom sheets. */
  const isWebDesktopUI = Platform.OS === "web" && isDesktop;
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const currentOrgId = currentOrganization?.id ?? "";

  const [activeTab, setActiveTab] = useState<TabId>("trips");
  const [isMobileDetail, setIsMobileDetail] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const messagesRef = useRef<ScrollView>(null);

  const [showEmoji, setShowEmoji] = useState(false);
  const [showScripts, setShowScripts] = useState(false);

  // Document share sheet
  const [showDocShare, setShowDocShare] = useState(false);
  const [addingToBook, setAddingToBook] = useState<string | null>(null);

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
  const [initiating, setInitiating] = useState(false);
  const [showNetCompose, setShowNetCompose] = useState(false);
  const [netComposeSearch, setNetComposeSearch] = useState("");
  const [showTripSearch, setShowTripSearch] = useState(false);
  const [tripSidebarSearch, setTripSidebarSearch] = useState("");
  const [showTripFilterModal, setShowTripFilterModal] = useState(false);
  const [tripUnreadFirst, setTripUnreadFirst] = useState(true);
  const [tripPartyFilters, setTripPartyFilters] = useState<ConversationPartyType[]>([
    ...TRIP_PARTY_FILTERS,
  ]);
  const [tripStatusFilters, setTripStatusFilters] = useState<TripStatusFilter[]>([
    ...TRIP_STATUS_FILTERS,
  ]);
  const deepLinkAppliedRef = useRef<string | null>(null);
  /** Avoid repeating hydrate when RLS returns null for the same URL. */
  const deeplinkHydrateFailedForKeyRef = useRef<string | null>(null);

  const {
    organizationId,
    conversations,
    isLoading,
    sendMessage,
    markAsRead,
    getTotalUnreadCount,
    initiateConversation,
    hydrateConversationById,
  } = useTripChat();
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
  const selectedTripPartyConversations = useMemo(() => {
    if (!selectedConv) return [] as TripConversation[];
    const order: Record<ConversationPartyType, number> = {
      client: 0,
      supplier: 1,
      driver: 2,
    };
    return conversations
      .filter((c) => c.trip_id === selectedConv.trip_id)
      .sort((a, b) => {
        const partyOrderDiff = order[a.party_type] - order[b.party_type];
        if (partyOrderDiff !== 0) return partyOrderDiff;
        return a.party_name.localeCompare(b.party_name);
      });
  }, [conversations, selectedConv]);

  const tripUnread = getTotalUnreadCount();
  const netUnread = netTotal();
  const filteredAndSortedConversations = useMemo(() => {
    const trimmedSearch = tripSidebarSearch.trim().toLowerCase();
    const hasSearch = trimmedSearch.length > 0;
    const normalizedFilters = tripPartyFilters.length
      ? tripPartyFilters
      : TRIP_PARTY_FILTERS;
    const normalizedStatusFilters = tripStatusFilters.length
      ? tripStatusFilters
      : TRIP_STATUS_FILTERS;
    const filterSet = new Set<ConversationPartyType>(normalizedFilters);
    const statusFilterSet = new Set<TripStatusFilter>(normalizedStatusFilters);

    return conversations
      .filter((conv) => filterSet.has(conv.party_type))
      .filter((conv) =>
        isTerminalTripStatus(conv.trip_status)
          ? statusFilterSet.has("terminal")
          : statusFilterSet.has("active"),
      )
      .filter((conv) => {
        if (!hasSearch) return true;
        const displayId = getConversationTripLabel(conv);
        const haystack = `${displayId} ${conv.trip_number}`.toLowerCase();
        return haystack.includes(trimmedSearch);
      })
      .sort((a, b) => {
        if (tripUnreadFirst) {
          const unreadDiff = (b.unread_dispatcher_count ?? 0) - (a.unread_dispatcher_count ?? 0);
          if (unreadDiff !== 0) return unreadDiff;
        }

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
  }, [conversations, tripPartyFilters, tripSidebarSearch, tripStatusFilters, tripUnreadFirst]);
  const sortedNetChats = useMemo(() => {
    return [...netChats].sort((a, b) => {
      const unreadDiff = (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      if (unreadDiff !== 0) return unreadDiff;
      const aLast = a.messages[a.messages.length - 1]?.timestamp ?? "";
      const bLast = b.messages[b.messages.length - 1]?.timestamp ?? "";
      return new Date(bLast || 0).getTime() - new Date(aLast || 0).getTime();
    });
  }, [netChats]);

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
        markAsRead(convIdParam);
        if (shouldOpenDetail && !isDesktop) setIsMobileDetail(true);
        deepLinkAppliedRef.current = deepLinkKey;
        return;
      }
      if (isLoading) return;
      if (deeplinkHydrateFailedForKeyRef.current === hydrateAttemptKey) return;
      void hydrateConversationById(convIdParam).then((c) => {
        if (c) {
          setActiveTab("trips");
          setSelectedConvId(convIdParam);
          setSelectedNetId(null);
          markAsRead(convIdParam);
          if (shouldOpenDetail && !isDesktop) setIsMobileDetail(true);
          deepLinkAppliedRef.current = deepLinkKey;
        } else {
          deeplinkHydrateFailedForKeyRef.current = hydrateAttemptKey;
        }
      });
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
    hydrateConversationById,
    isDesktop,
    isLoading,
    markAsRead,
    markNetRead,
    netChats,
    params.conversationId,
    params.openDetail,
    params.ts,
    params.tab,
  ]);

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
    setAddingToBook(message.id);
    try {
      const { error } = await mirrorLedgerEntryFromChat(meta, currentOrgId, selectedConv.trip_id);
      if (error) { Alert.alert("Error", error.message); return; }
      await acknowledgeLedgerEventMessage(message.id, selectedConv.id);
    } catch {
      Alert.alert("Error", "Could not add to book. Please try again.");
    } finally {
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

  const openCompose = async () => {
    setShowTripFilterModal(false);
    setShowCompose(true);
    setComposeSearch("");
    setExpandedTripId(null);
    setComposeTripListIssue(null);
    setComposeTrips([]);
    if (!organizationId) {
      setComposeTripListIssue("no_org");
      return;
    }
    setComposeLoading(true);
    try {
      const trips = await getTripsForCompose(organizationId);
      setComposeTrips(trips);
    } catch {
      setComposeTrips([]);
      setComposeTripListIssue("fetch_failed");
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
  const hasTripFilter =
    tripUnreadFirst ||
    tripPartyFilters.length < TRIP_PARTY_FILTERS.length ||
    tripStatusFilters.length < TRIP_STATUS_FILTERS.length;

  const toggleTripPartyFilter = (partyType: ConversationPartyType) => {
    setTripPartyFilters((prev) =>
      prev.includes(partyType)
        ? prev.filter((type) => type !== partyType)
        : [...prev, partyType],
    );
  };

  const toggleTripStatusFilter = (status: TripStatusFilter) => {
    setTripStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((type) => type !== status) : [...prev, status],
    );
  };
  const setTripPartyHeaderTab = (tab: "all" | ConversationPartyType) => {
    if (tab === "all") {
      setTripPartyFilters([...TRIP_PARTY_FILTERS]);
      return;
    }
    setTripPartyFilters([tab]);
  };
  const tripPartyHeaderTab: "all" | ConversationPartyType =
    tripPartyFilters.length === TRIP_PARTY_FILTERS.length
      ? "all"
      : tripPartyFilters.length === 1
        ? tripPartyFilters[0]
        : "all";
  const setTripStatusHeaderTab = (tab: "all" | TripStatusFilter) => {
    if (tab === "all") {
      setTripStatusFilters([...TRIP_STATUS_FILTERS]);
      return;
    }
    setTripStatusFilters([tab]);
  };
  const tripStatusHeaderTab: "all" | TripStatusFilter =
    tripStatusFilters.length === TRIP_STATUS_FILTERS.length
      ? "all"
      : tripStatusFilters.length === 1
        ? tripStatusFilters[0]
        : "all";

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
    const displayTripId = getConversationTripLabel(item);
    const isActiveTrip = !isTerminalTripStatus(item.trip_status);
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
            <View style={s.chatTitleRow}>
              <Text style={[s.chatTitle, active && s.chatTitleActive]} numberOfLines={1}>
                {displayTripId}
              </Text>
              {isActiveTrip ? <View style={[s.activeTripDot, active && s.activeTripDotActive]} /> : null}
            </View>
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
            <Text style={s.brandTitle}>Command Hub</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {activeTab === "trips" && (
              <>
                <TouchableOpacity hitSlop={10} onPress={() => setShowTripSearch((prev) => !prev)}>
                  <Search size={16} color="rgba(255,255,255,0.72)" />
                </TouchableOpacity>
                <TouchableOpacity
                  hitSlop={10}
                  onPress={() => {
                    setShowCompose(false);
                    setShowTripFilterModal((prev) => !prev);
                  }}
                  style={s.filterBtn}
                >
                  <Filter size={16} color="rgba(255,255,255,0.72)" />
                  {hasTripFilter ? <View style={s.filterActiveDot} /> : null}
                </TouchableOpacity>
              </>
            )}
            {activeTab === "trips" && (
              <TouchableOpacity
                hitSlop={10}
                onPress={() => {
                  setShowTripFilterModal(false);
                  if (isWebDesktopUI && showCompose) {
                    setShowCompose(false);
                    return;
                  }
                  void openCompose();
                }}
                style={s.composeBtn}
              >
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
                <t.Icon size={12} color={active ? "#ffffff" : "#94a3b8"} />
                <Text style={[s.tabPillLabel, active && s.tabPillLabelActive]}>{t.label}</Text>
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

        {activeTab === "trips" && showTripSearch && (
          <View style={s.sidebarSearchRow}>
            <Search size={15} color="#94a3b8" style={{ marginRight: 8 }} />
            <TextInput
              style={s.sidebarSearchInput}
              value={tripSidebarSearch}
              onChangeText={setTripSidebarSearch}
              placeholder="Search trip id…"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
            />
            {tripSidebarSearch.length > 0 && (
              <TouchableOpacity onPress={() => setTripSidebarSearch("")} hitSlop={8}>
                <X size={14} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {activeTab === "trips" && (
          <View style={s.tripFiltersHeaderWrap}>
            <View style={s.tripPartyTabsRow}>
              <TouchableOpacity
                style={[s.tripPartyTab, tripPartyHeaderTab === "all" && s.tripPartyTabActive]}
                onPress={() => setTripPartyHeaderTab("all")}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.tripPartyTabText,
                    tripPartyHeaderTab === "all" && s.tripPartyTabTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tripPartyTab, tripPartyHeaderTab === "client" && s.tripPartyTabActive]}
                onPress={() => setTripPartyHeaderTab("client")}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.tripPartyTabText,
                    tripPartyHeaderTab === "client" && s.tripPartyTabTextActive,
                  ]}
                >
                  Client
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tripPartyTab, tripPartyHeaderTab === "supplier" && s.tripPartyTabActive]}
                onPress={() => setTripPartyHeaderTab("supplier")}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.tripPartyTabText,
                    tripPartyHeaderTab === "supplier" && s.tripPartyTabTextActive,
                  ]}
                >
                  Supplier
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tripPartyTab, tripPartyHeaderTab === "driver" && s.tripPartyTabActive]}
                onPress={() => setTripPartyHeaderTab("driver")}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.tripPartyTabText,
                    tripPartyHeaderTab === "driver" && s.tripPartyTabTextActive,
                  ]}
                >
                  Driver
                </Text>
              </TouchableOpacity>
            </View>

            <View style={s.tripStatusTabsRow}>
              <TouchableOpacity
                style={[s.tripStatusTab, tripStatusHeaderTab === "all" && s.tripStatusTabActive]}
                onPress={() => setTripStatusHeaderTab("all")}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.tripStatusTabText,
                    tripStatusHeaderTab === "all" && s.tripStatusTabTextActive,
                  ]}
                >
                  All Status
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tripStatusTab, tripStatusHeaderTab === "active" && s.tripStatusTabActive]}
                onPress={() => setTripStatusHeaderTab("active")}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.tripStatusTabText,
                    tripStatusHeaderTab === "active" && s.tripStatusTabTextActive,
                  ]}
                >
                  Active
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tripStatusTab, tripStatusHeaderTab === "terminal" && s.tripStatusTabActive]}
                onPress={() => setTripStatusHeaderTab("terminal")}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.tripStatusTabText,
                    tripStatusHeaderTab === "terminal" && s.tripStatusTabTextActive,
                  ]}
                >
                  Closed
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === "trips" && isWebDesktopUI && showCompose && (
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
                <TouchableOpacity
                  style={[s.filterChip, tripUnreadFirst && s.filterChipActive]}
                  onPress={() => setTripUnreadFirst((prev) => !prev)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.filterChipText, tripUnreadFirst && s.filterChipTextActive]}>
                    Unread first
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={s.tripFilterPopoverSub}>Filter by trip status</Text>
              <View style={s.filterChipWrap}>
                {TRIP_STATUS_FILTERS.map((status, index) => {
                  const selected = tripStatusFilters.includes(status);
                  const isLast = index === TRIP_STATUS_FILTERS.length - 1;
                  return (
                    <TouchableOpacity
                      key={status}
                      style={[s.filterChip, isLast && s.filterChipLast, selected && s.filterChipActive]}
                      onPress={() => toggleTripStatusFilter(status)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.filterChipText, selected && s.filterChipTextActive]}>
                        {statusFilterSheetLabel(status)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
                onPress={() => {
                  setTripUnreadFirst(true);
                  setTripStatusFilters([...TRIP_STATUS_FILTERS]);
                  setTripPartyFilters([...TRIP_PARTY_FILTERS]);
                }}
                activeOpacity={0.8}
              >
                <Text style={s.filterResetText}>Reset all filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === "trips" &&
          (isLoading ? (
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <ActivityIndicator color={Theme.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredAndSortedConversations}
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
                <Text style={cm.subtitle}>Filter by unread, status, and conversation party.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTripFilterModal(false)} hitSlop={8} style={cm.closeBtn}>
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={s.filterChipWrap}>
              <TouchableOpacity
                style={[s.filterChip, tripUnreadFirst && s.filterChipActive]}
                onPress={() => setTripUnreadFirst((prev) => !prev)}
                activeOpacity={0.75}
              >
                <Text style={[s.filterChipText, tripUnreadFirst && s.filterChipTextActive]}>
                  Unread first
                </Text>
              </TouchableOpacity>
            </View>

            <View style={s.filterChipWrap}>
              {TRIP_STATUS_FILTERS.map((status, index) => {
                const selected = tripStatusFilters.includes(status);
                const isLast = index === TRIP_STATUS_FILTERS.length - 1;
                return (
                  <TouchableOpacity
                    key={status}
                    style={[s.filterChip, isLast && s.filterChipLast, selected && s.filterChipActive]}
                    onPress={() => toggleTripStatusFilter(status)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.filterChipText, selected && s.filterChipTextActive]}>
                      {statusFilterSheetLabel(status)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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
              onPress={() => {
                setTripUnreadFirst(true);
                setTripStatusFilters([...TRIP_STATUS_FILTERS]);
                setTripPartyFilters([...TRIP_PARTY_FILTERS]);
              }}
              activeOpacity={0.8}
            >
              <Text style={s.filterResetText}>Reset all filters</Text>
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
            autoFocus={!isWebDesktopUI}
          />
          {composeSearch.length > 0 && (
            <TouchableOpacity onPress={() => setComposeSearch("")} hitSlop={8}>
              <X size={14} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {composeLoading ? (
          <View style={{ paddingTop: 48, alignItems: "center" }}>
            <ActivityIndicator color={Theme.primary} />
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
                      {partyRows.map((row) =>
                        row.kind === "unassigned_driver" ? (
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
                              <Text style={[cm.partyName, cm.partyNameMuted]} numberOfLines={1}>
                                Not assigned
                              </Text>
                            </View>
                            <Text style={cm.partyDisabledHint}>—</Text>
                          </View>
                        ) : (
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
                              <Text style={cm.partyName} numberOfLines={1}>
                                {row.name}
                              </Text>
                            </View>
                            {initiating ? (
                              <ActivityIndicator size="small" color={Theme.primary} />
                            ) : (
                              <Plus size={14} color={Theme.primary} />
                            )}
                          </TouchableOpacity>
                        )
                      )}
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
    if (isWebDesktopUI) return null;
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
        onCloseDetail={closeDetail}
        currentOrgId={currentOrgId}
        onAddToBook={handleAddToBook}
        onDispute={handleDispute}
        addingToBookId={addingToBook}
        tripPartyConversations={selectedTripPartyConversations}
        onSelectTripParty={(conversationId) => {
          setSelectedConvId(conversationId);
          markAsRead(conversationId);
          setMessageInput("");
          setShowEmoji(false);
          setShowScripts(false);
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
        onCloseDetail={closeDetail}
      />
    );

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
            {ChatList()}
          </View>
          <View style={s.desktopDetail}>{detailPanel}</View>
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
      colors={["#edfafa", "#ffffff", "#eff6ff"]}
      locations={[0, 0.45, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      {!isMobileDetail ? ChatList() : detailPanel}
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
  desktop: { flex: 1, flexDirection: "row", gap: 10, padding: 10 },
  desktopList: {
    width: 360,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  desktopDetail: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.88)",
  },

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
    textTransform: "uppercase",
  },
  filterBtn: { position: "relative" },
  filterActiveDot: {
    position: "absolute",
    top: -1,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Theme.primary,
    borderWidth: 1,
    borderColor: "#0f172a",
  },

  tabRow: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingBottom: 10, marginTop: 10 },
  sidebarSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sidebarSearchInput: { flex: 1, fontSize: 13, color: "#1e293b", fontWeight: "600" },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  tabPillActive: { borderColor: Theme.primary, backgroundColor: Theme.primary },
  tabPillLabel: { fontSize: 10, fontWeight: "900", color: "#64748b", letterSpacing: 0.8 },
  tabPillLabelActive: { color: "#fff" },
  tabUnreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  tabUnreadBadgeActive: {
    backgroundColor: "#fff",
  },
  tabUnreadText: { fontSize: 9, fontWeight: "900", color: "#fff" },
  tabUnreadTextActive: { color: Theme.primary },

  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
    borderRadius: 24,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
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
  chatBody: { flex: 1, minWidth: 0 },
  chatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  chatTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  chatTitle: { fontSize: 12, fontWeight: "900", color: "#0f172a", flex: 1, textTransform: "uppercase", fontStyle: "italic" },
  chatTitleActive: { color: "#fff" },
  activeTripDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.primary,
    flexShrink: 0,
  },
  activeTripDotActive: { backgroundColor: "#fff" },
  chatTime: { fontSize: 9, color: "#94a3b8", marginLeft: 8, flexShrink: 0, textTransform: "uppercase", fontWeight: "700" },
  chatTimeActive: { color: "rgba(255,255,255,0.55)" },
  chatPartyLabel: { fontSize: 9, fontWeight: "900", color: Theme.primary, letterSpacing: 0.9, marginBottom: 2 },
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
    borderBottomColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  detailIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Theme.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: { fontSize: 15, fontWeight: "900", color: "#fff", letterSpacing: -0.2, textTransform: "uppercase", fontStyle: "italic" },
  detailStatus: {
    fontSize: 10,
    fontWeight: "700",
    color: "#60a5fa",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  detailPartySwitchRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  detailPartySwitchChip: {
    minWidth: 112,
    maxWidth: 170,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "rgba(15,23,42,0.9)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  detailPartySwitchChipActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primary,
  },
  detailPartySwitchText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#93c5fd",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  detailPartySwitchTextActive: { color: "#fff" },
  detailPartySwitchSubText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
  },
  detailPartySwitchSubTextActive: { color: "#fff" },

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

  inputWrap: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e2e8f0" },
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
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
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
    backgroundColor: Theme.primary,
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
    backgroundColor: Theme.primary,
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
  filterChipActive: { borderColor: Theme.primary, backgroundColor: Theme.primary },
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
  tripFiltersHeaderWrap: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  tripPartyTabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripPartyTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    backgroundColor: "#f8fafc",
    paddingVertical: 8,
  },
  tripPartyTabActive: { borderColor: Theme.primary, backgroundColor: Theme.primary },
  tripPartyTabText: { fontSize: 11, fontWeight: "800", color: "#475569" },
  tripPartyTabTextActive: { color: "#fff" },
  tripStatusTabsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tripStatusTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    backgroundColor: "#f8fafc",
    paddingVertical: 7,
  },
  tripStatusTabActive: { borderColor: Theme.primary, backgroundColor: Theme.primary },
  tripStatusTabText: { fontSize: 10, fontWeight: "800", color: "#64748b" },
  tripStatusTabTextActive: { color: "#fff" },
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
  partyNameMuted: { color: "#94a3b8", fontStyle: "italic" },
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
          <ArrowLeft size={20} color="#fff" />
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
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#60a5fa" }} />
            <Text style={s.detailStatus}>{subtitle}</Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity hitSlop={10}>
        <Search size={17} color="rgba(255,255,255,0.72)" />
      </TouchableOpacity>
      <TouchableOpacity hitSlop={10} style={{ marginLeft: 8 }}>
        <MoreVertical size={17} color="rgba(255,255,255,0.72)" />
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
}: {
  isOwn: boolean;
  content: string;
  timestamp: string;
  senderName?: string;
}) {
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

  return (
    <View style={[s.bubbleWrap, isOwn ? s.bubbleWrapOwn : s.bubbleWrapOther]}>
      {!isOwn && <LetterAvatar name={senderName ?? "?"} size={32} />}
      <View style={{ maxWidth: "72%" }}>
        <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
          <Text style={[s.bubbleText, isOwn ? s.bubbleTextOwn : s.bubbleTextOther]}>{content}</Text>
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
}) {
  return (
    <View style={s.inputWrap}>
      {showEmoji ? (
        <View style={s.emojiPopup}>
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
          <Plus size={16} color={onOpenDocShare ? Theme.primary : "#94a3b8"} />
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
          onPress={onSend}
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
  onCloseDetail,
  currentOrgId,
  onAddToBook,
  onDispute,
  addingToBookId,
  tripPartyConversations,
  onSelectTripParty,
}: {
  selectedConv: TripConversation | null;
  messagesRef: React.RefObject<ScrollView | null>;
  messageInput: string;
  setMessageInput: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: () => void;
  onOpenDocShare: () => void;
  isDesktop: boolean;
  onCloseDetail: () => void;
  currentOrgId: string;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  addingToBookId: string | null;
  tripPartyConversations: TripConversation[];
  onSelectTripParty: (conversationId: string) => void;
}) {
  if (!selectedConv) return <EmptyDetail />;
  const quickMsgs = QUICK_MESSAGES[selectedConv.party_type];

  return (
    <View style={s.detailPanel}>
      <ChatDetailHeader
        title={`${getConversationTripLabel(selectedConv)} · ${partyLabel(selectedConv.party_type)}`}
        subtitle={selectedConv.party_name.toUpperCase()}
        partyType={selectedConv.party_type}
        isDesktop={isDesktop}
        onCloseDetail={onCloseDetail}
      />
      {tripPartyConversations.length > 1 && (
        <View style={s.detailPartySwitchRow}>
          {tripPartyConversations.map((conv) => {
            const active = conv.id === selectedConv.id;
            return (
              <TouchableOpacity
                key={conv.id}
                style={[s.detailPartySwitchChip, active && s.detailPartySwitchChipActive]}
                onPress={() => onSelectTripParty(conv.id)}
                activeOpacity={0.75}
              >
                <Text style={[s.detailPartySwitchText, active && s.detailPartySwitchTextActive]}>
                  {partyLabel(conv.party_type)}
                </Text>
                <Text
                  style={[s.detailPartySwitchSubText, active && s.detailPartySwitchSubTextActive]}
                  numberOfLines={1}
                >
                  {conv.party_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <ScrollView
        ref={messagesRef}
        style={s.msgs}
        contentContainerStyle={s.msgsContent}
        onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}
      >
        <ChatSystemMsg
          label={`${selectedConv.pickup_area.toUpperCase()} → ${selectedConv.drop_location.toUpperCase()} · TODAY`}
        />
        {selectedConv.messages.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
              No messages yet
            </Text>
          </View>
        )}
        {selectedConv.messages.map((m) => {
          if (m.message_type === "system") {
            return <ChatSystemEventCard key={m.id} message={m} />;
          }
          if (m.message_type === "ledger_event") {
            return (
              <ChatLedgerEventCard
                key={m.id}
                message={m}
                currentOrgId={currentOrgId}
                conversationPartyName={selectedConv.party_name}
                onAddToBook={onAddToBook}
                onDispute={onDispute}
                addingToBook={addingToBookId === m.id}
              />
            );
          }
          if (m.message_type === "document_share") {
            return (
              <DocumentShareCard
                key={m.id}
                message={m}
                isOwn={m.sender_role === "dispatcher"}
              />
            );
          }
          return (
            <ChatBubble
              key={m.id}
              isOwn={m.sender_role === "dispatcher"}
              content={m.content}
              timestamp={m.created_at}
              senderName={m.sender_role !== "dispatcher" ? m.sender_name : undefined}
            />
          );
        })}
      </ScrollView>
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
  onCloseDetail,
}: {
  selectedNet: IntegratedChat | null;
  messagesRef: React.RefObject<ScrollView | null>;
  messageInput: string;
  setMessageInput: React.Dispatch<React.SetStateAction<string>>;
  showEmoji: boolean;
  setShowEmoji: React.Dispatch<React.SetStateAction<boolean>>;
  showScripts: boolean;
  setShowScripts: React.Dispatch<React.SetStateAction<boolean>>;
  onSend: () => void;
  isDesktop: boolean;
  onCloseDetail: () => void;
}) {
  if (!selectedNet) return <EmptyDetail />;
  return (
    <View style={s.detailPanel}>
      <ChatDetailHeader
        title={selectedNet.partnerName}
        subtitle={selectedNet.organization.toUpperCase()}
        isDesktop={isDesktop}
        onCloseDetail={onCloseDetail}
      />
      <ScrollView
        ref={messagesRef}
        style={s.msgs}
        contentContainerStyle={s.msgsContent}
        onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}
      >
        <ChatSystemMsg label="SECURE CHANNEL · TODAY" />
        {selectedNet.messages.map((m) => (
          <ChatBubble
            key={m.id}
            isOwn={m.senderId === "dispatcher-1"}
            content={m.content}
            timestamp={m.timestamp}
            senderName={m.senderId !== "dispatcher-1" ? selectedNet.partnerName : undefined}
          />
        ))}
      </ScrollView>
      <ChatInputBar
        quickMsgs={INTEGRATED_QUICK_MESSAGES}
        messageInput={messageInput}
        onChangeMessage={setMessageInput}
        showEmoji={showEmoji}
        setShowEmoji={setShowEmoji}
        showScripts={showScripts}
        setShowScripts={setShowScripts}
        onSend={onSend}
      />
    </View>
  );
}
