import { PartyAvatar } from "@/components/PartyAvatar";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { chatFilterChromeStyles } from "@/constants/ChatFilterChrome";
import Theme from "@/constants/Theme";
import { ROUTES } from "@/lib/routes";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { CHAT_ACCENT, CHAT_ACCENT_BORDER, CHAT_ACCENT_SOFT, CHAT_ICON_MUTED } from "@/features/chat/chatTheme";
import {
  CHAT_MOBILE,
  isChatNativeMobile,
  mobileWebComposerReservePx,
} from "@/features/chat/chatMobileLayout";
import {
  dockPaddingBottom,
  effectiveKeyboardInset,
  useKeyboardVisible,
} from "@/lib/hooks/useKeyboardVisible";
import { ChatMobileComposer } from "@/features/chat/components/ChatMobileComposer";
import { MessageTick } from "@/features/chat/components/MessageTick";
import { SystemEventCard } from "@/features/chat/components/SystemEventCard";
import {
  INTEGRATED_QUICK_MESSAGES,
  IntegratedChat,
  useIntegratedChat,
  type NetworkPartner,
} from "@/features/chat/contexts/IntegratedChatContext";
import {
  QUICK_MESSAGES,
  TripConversation,
  useTripChat,
} from "@/features/chat/contexts/TripChatContext";
import { useMarkSeen } from "@/features/chat/hooks/useMarkSeen";
import {
  getMessagesByConversation,
  getTripsForCompose,
  sendDocumentShareMessage,
  TRIP_CHAT_HISTORY_PAGE,
  type TripForCompose,
} from "@/features/chat/services/chat.service";
import {
  confirmLedgerToAccountingBooks,
  disputeLedgerEventMessage,
} from "@/features/chat/services/chatLedgerBridge.service";
import { chatStore, useConversation, useConversationsByTrip, useTripMeta } from "@/features/chat/store/chatStore";
import {
  resolveCounterpartyPartyTypeForViewer,
  resolveOutgoingDeliveryStatus,
  useChatStore,
  type TripEntry,
} from "@/features/chat/store/useChatStore";
import { setActiveTripMessageConversationId } from "@/features/chat/realtime/activeTripMessageScope";
import { useAssignmentAuditNameMaps } from "@/features/chat/hooks/useAssignmentAuditNameMaps";
import { mergeAssignmentAuditIntoTripMessages } from "@/features/chat/utils/assignmentAuditChatMessages.util";
import { buildTripMessageListLayoutMeta } from "@/features/chat/utils/chatMessageListLayout";
import { applyContractualHubPartyIsolation } from "@/features/chat/utils/contractHubPartyIsolation.util";
import { dedupeTripStatusBroadcastsForLane } from "@/features/chat/utils/dedupeTripStatusBroadcastForLane.util";
import {
  dedupeFeedbackRequestMessages,
  mergeTripChatMessagesWithFeedbackRatings,
} from "@/features/chat/utils/mergeTripFeedbackMessages.util";
import { formatChatPartyName } from "@/features/chat/utils/partyDisplay";
import {
  isTerminalTripStatus,
  isTripFeedbackEligibleStatus,
} from "@/features/chat/utils/tripConversationSort";
import { createRating, getRatingsForTrip } from "@/features/ratings/services/ratings.service";
import type { RatingRow } from "@/features/ratings/types";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { useTripAssignmentAuditHistoryQuery } from "@/lib/queries/useTripsQuery";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import type { ActiveTripSummary } from "@/lib/globalSync/types";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import {
  clearLedgerBookPending,
  markLedgerBookPending,
} from "@/lib/ledgerBookPendingStore";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Briefcase,
  ChevronDown,
  ChevronRight,
  FileType,
  Hash,
  MapPin,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Send,
  Smile,
  Star,
  Truck,
  User,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type {
  ConversationPartyType,
  LedgerEventMetadata,
  MessageDeliveryStatus,
  TripMessageRow,
} from "../types/chat.types";
import { isMessageVisibleInTab } from "../types/chat.types";
import { commandPriorityScore } from "../utils/commandPriority.util";
import { tripFeedbackRequestMatchesConversation } from "../utils/feedbackRequestMeta";
import { ledgerEventInvolvesOrg } from "../utils/ledgerVisibility.util";
import { parseMessageLocationData } from "../utils/locationLogPayload.util";
import {
  indentAllowsInChatFeedbackDebrief,
  tripMessageHistoryHasCompletedStatus,
} from "../utils/tripFeedbackVisibility.util";
import { ChatLedgerEventCard, ChatSystemEventCard } from "./ChatEventCard";
import { ChatFeedbackCard } from "./ChatFeedbackCard";
import { DocumentShareCard } from "./DocumentShareCard";
import { DocumentShareSheet } from "./DocumentShareSheet";
import { isLongHaulLateChatMessage, LateAlertCard } from "./LateAlertCard";
import { LocationEventCard } from "./LocationEventCard";
import { TripCard } from "./TripCard";

type TabId = "trips" | "indent" | "network";

/** Hub/mission-bar party tab: rowType finds the conversation row; displayType drives icon + label. */
type HubPartyTab = {
  rowType: ConversationPartyType;
  displayType: ConversationPartyType;
};

function isTripStreamTab(tab: TabId): boolean {
  return tab === "trips" || tab === "indent";
}

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
  return getTripOperationalDisplay({
    trip_number: conversation.trip_number,
    display_trip_id: conversation.display_trip_id ?? null,
  });
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

function normalizePartyLabelKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * When the viewer is the linked client on a shipper-hosted trip, the **client** lane is their own
 * thread — show "You" on the tab/header instead of repeating "DEEPAK ORG" as if it were a counterparty.
 */
function resolveViewerClientTabPrimaryName(params: {
  partyType: ConversationPartyType;
  convPartyName: string | null | undefined;
  viewerOrgId: string;
  viewerOrgName: string | null | undefined;
  tripHostOrgId: string | null | undefined;
  composeClientLinkedOrgId: string | null | undefined;
}): string | null {
  if (params.partyType !== "client") return null;
  const v = params.viewerOrgId.trim();
  const host = (params.tripHostOrgId ?? "").trim();
  if (!v || !host || v === host) return null;
  const linked = (params.composeClientLinkedOrgId ?? "").trim();
  if (linked && v === linked) return "You";
  const pn = normalizePartyLabelKey(params.convPartyName);
  const on = normalizePartyLabelKey(params.viewerOrgName);
  if (pn.length > 0 && on.length > 0 && pn === on) return "You";
  return null;
}

/** Linked org user is the trip's integrated client (shipper-hosted trip) — hide redundant "CLIENT / self" tab. */
function viewerIsLinkedTripClientViewer(params: {
  clientLanePartyName: string | null | undefined;
  viewerOrgId: string;
  viewerOrgName: string | null | undefined;
  tripHostOrgId: string | null | undefined;
  composeClientLinkedOrgId: string | null | undefined;
}): boolean {
  return (
    resolveViewerClientTabPrimaryName({
      partyType: "client",
      convPartyName: params.clientLanePartyName,
      viewerOrgId: params.viewerOrgId,
      viewerOrgName: params.viewerOrgName,
      tripHostOrgId: params.tripHostOrgId,
      composeClientLinkedOrgId: params.composeClientLinkedOrgId,
    }) === "You"
  );
}

/** Linked org user is the trip's integrated supplier — hide redundant "SUPPLIER / self" tab. */
function viewerIsLinkedTripSupplierViewer(params: {
  supplierLanePartyName: string | null | undefined;
  viewerOrgId: string;
  viewerOrgName: string | null | undefined;
  tripHostOrgId: string | null | undefined;
  composeSupplierLinkedOrgId: string | null | undefined;
}): boolean {
  const v = params.viewerOrgId.trim();
  const host = (params.tripHostOrgId ?? "").trim();
  if (!v || !host || v === host) return false;
  const linked = (params.composeSupplierLinkedOrgId ?? "").trim();
  if (linked && v === linked) return true;
  const pn = normalizePartyLabelKey(params.supplierLanePartyName);
  const on = normalizePartyLabelKey(params.viewerOrgName);
  return pn.length > 0 && on.length > 0 && pn === on;
}

/** Manual hub: trip has an assigned driver (same trip / driver lane as detail). */
function manualHubTripHasAssignedDriver(
  conv: TripConversation,
  trips: Record<string, TripEntry>,
): boolean {
  return (
    Boolean(String(conv.trip_driver_id ?? "").trim()) ||
    Boolean(String(trips[conv.trip_id]?.driverId ?? "").trim())
  );
}

const HUB_PARTY_ORDER: ConversationPartyType[] = ["client", "supplier", "driver"];

function partyConversationMapFromHubRows(
  rows: TripConversation[],
): Record<ConversationPartyType, TripConversation | null> {
  return HUB_PARTY_ORDER.reduce(
    (acc, partyType) => {
      acc[partyType] = rows.find((r) => r.party_type === partyType) ?? null;
      return acc;
    },
    {} as Record<ConversationPartyType, TripConversation | null>,
  );
}

/**
 * Trip hub card party shortcuts — contractual give/get + integrated lanes:
 * - Client org sees supplier + driver (not a redundant client icon).
 * - Supplier org sees client + driver.
 * - {@link applyContractualHubPartyIsolation} enforces lane org match; linked-org suppressions apply on top.
 * - Supplier tab only when aggregate (awarded supplier) exists; driver when assigned.
 */
function hubCardPartyTypesForTripHub(args: {
  hubTrip: TripForCompose | undefined;
  /** Loaded conversation lanes for this trip in the hub list (same `trip_id`). */
  hubRows: TripConversation[];
  tripDriverId: string | null | undefined;
  tripSupplierId: string | null | undefined;
  viewerOrgId: string;
  viewerOrgName: string | null | undefined;
  tripHostOrgId: string | null | undefined;
  tripIntegrated: boolean;
}): HubPartyTab[] {
  const {
    hubTrip,
    hubRows,
    tripDriverId,
    tripSupplierId,
    viewerOrgId,
    viewerOrgName,
    tripHostOrgId,
    tripIntegrated,
  } = args;
  if (!tripIntegrated) {
    return [{ rowType: "driver" as ConversationPartyType, displayType: "driver" as ConversationPartyType }];
  }

  const map = partyConversationMapFromHubRows(hubRows);
  const clientId = map.client?.client_id ?? hubTrip?.client_id ?? null;
  const supplierId =
    map.supplier?.supplier_id ?? hubTrip?.supplier_id ?? tripSupplierId ?? null;
  const driverId = map.driver?.driver_id ?? hubTrip?.driver_id ?? tripDriverId ?? null;
  const aggregateTrip = isAggregateTrip({ supplier_id: supplierId });

  let rawVisible = HUB_PARTY_ORDER.filter((p) => {
    if (p === "client") {
      return Boolean(String(clientId ?? "").trim()) || Boolean(map.client);
    }
    if (p === "supplier") {
      return (
        aggregateTrip &&
        (Boolean(String(supplierId ?? "").trim()) || Boolean(map.supplier))
      );
    }
    return Boolean(String(driverId ?? "").trim()) || Boolean(map.driver);
  });

  let isLinkedClient = false;
  let isLinkedSupplier = false;
  if (hubTrip && viewerOrgId.trim()) {
    isLinkedClient = viewerIsLinkedTripClientViewer({
      clientLanePartyName: map.client?.party_name ?? hubTrip.client_name,
      viewerOrgId,
      viewerOrgName,
      tripHostOrgId,
      composeClientLinkedOrgId: hubTrip.client_linked_organization_id ?? null,
    });
    isLinkedSupplier = viewerIsLinkedTripSupplierViewer({
      supplierLanePartyName: map.supplier?.party_name ?? hubTrip.supplier_name,
      viewerOrgId,
      viewerOrgName,
      tripHostOrgId,
      composeSupplierLinkedOrgId: hubTrip.supplier_linked_organization_id ?? null,
    });
  }

  // Client viewer: hide their own "client" tab (they ARE the client — no need to show self).
  if (isLinkedClient) rawVisible = rawVisible.filter((p) => p !== "client");

  const isolated = applyContractualHubPartyIsolation(rawVisible, {
    viewerOrgId,
    lanes: hubRows,
    tripIntegrated,
    viewerIsLinkedSupplier: isLinkedSupplier,
  });

  // Supplier viewer: relabel the "supplier" tab as "CLIENT" — from the carrier's perspective
  // the supplier lane is their communication channel with the indent owner (their client).
  return isolated.map((p): HubPartyTab => {
    if (p === "supplier" && isLinkedSupplier) return { rowType: "supplier", displayType: "client" };
    return { rowType: p, displayType: p };
  });
}

type TripLabelDisambiguationRow = {
  tripId: string;
  tripLabel: string;
  tripCreatedAt: string | null;
};

/**
 * Multiple trip rows can share the same `display_trip_id` / `trip_number` (data or trigger gaps).
 * Hub and list UIs key by `trip_id` but label collisions read as duplicates (e.g. two "TRP003").
 */
function disambiguateTripLabelsForList(rows: TripLabelDisambiguationRow[]): Map<string, string> {
  const buckets = new Map<string, TripLabelDisambiguationRow[]>();
  for (const r of rows) {
    const key = r.tripLabel.trim() || r.tripId;
    const arr = buckets.get(key) ?? [];
    arr.push(r);
    buckets.set(key, arr);
  }
  const out = new Map<string, string>();
  for (const [, group] of buckets) {
    if (group.length === 1) {
      const t = group[0];
      out.set(t.tripId, t.tripLabel.trim() || t.tripId);
      continue;
    }
    const used = new Set<string>();
    for (const t of group) {
      const base = t.tripLabel.trim() || "Trip";
      const date = formatTripRouteDate(t.tripCreatedAt);
      let label = date
        ? `${base} · ${date}`
        : `${base} · ${t.tripId.replace(/-/g, "").slice(0, 8)}`;
      if (used.has(label)) {
        label = `${base} · ${date || "—"} · ${t.tripId.replace(/-/g, "").slice(0, 8)}`;
      }
      used.add(label);
      out.set(t.tripId, label);
    }
  }
  return out;
}

type GroupedTripHubRowData = {
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
  indentId: string | null;
  lastActivityConv: TripConversation | null;
};

/** Integrated hub tab: `indent_id` set on the trip (strict; not aggregate-supplier alone). */
function tripHubHasIntegratedPartition(
  conv: Pick<TripConversation, "trip_id" | "indent_id">,
  trips: Record<string, TripEntry>,
): boolean {
  if (Boolean(String(conv.indent_id ?? "").trim())) return true;
  const e = trips[conv.trip_id];
  return Boolean(e?.indentId && String(e.indentId).trim());
}

function buildGroupedTripHubRows(args: {
  sourceConversations: TripConversation[];
  hubComposeTrips: TripForCompose[];
  includeAggregateComposePlaceholders: boolean;
  tripSidebarSearch: string;
  tripChatScope: "active" | "history";
  isDesktop: boolean;
  webCommandPriorityFilter: boolean;
  activeTripsForCommandPriority: ActiveTripSummary[];
  tripTrackingByTripId: Record<string, string | null>;
}): GroupedTripHubRowData[] {
  const {
    sourceConversations,
    hubComposeTrips,
    includeAggregateComposePlaceholders,
    tripSidebarSearch,
    tripChatScope,
    isDesktop,
    webCommandPriorityFilter,
    activeTripsForCommandPriority,
  } = args;
  const tripTrackingByTripId = args.tripTrackingByTripId;
  const q = tripSidebarSearch.trim().toLowerCase();
  const byTrip = new Map<string, GroupedTripHubRowData>();
  for (const conv of sourceConversations) {
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
        indentId: conv.indent_id ?? null,
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
    row.indentId = conv.indent_id ?? row.indentId ?? null;
  }

  if (includeAggregateComposePlaceholders) {
    for (const t of hubComposeTrips) {
      if (!isAggregateTrip(t)) continue;
      // Only show placeholder for indent-backed trips (marketplace flow).
      // Manually created trips with a supplier are not integrated trips.
      if (!String(t.indent_id ?? "").trim()) continue;
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
        indentId: null,
        lastActivityConv: null,
      });
    }
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

  const labelByTripId = disambiguateTripLabelsForList(
    list.map((t) => ({
      tripId: t.tripId,
      tripLabel: t.tripLabel,
      tripCreatedAt: t.tripCreatedAt,
    })),
  );
  list = list.map((t) => ({
    ...t,
    tripLabel: labelByTripId.get(t.tripId) ?? t.tripLabel,
  }));

  return list.sort((a, b) => {
    const au = a.totalUnread > 0 ? 0 : 1;
    const bu = b.totalUnread > 0 ? 0 : 1;
    if (au !== bu) return au - bu;
    const la =
      (tripTrackingByTripId[a.tripId] ?? "") === "RUNNING_LATE" ? 0 : 1;
    const lb =
      (tripTrackingByTripId[b.tripId] ?? "") === "RUNNING_LATE" ? 0 : 1;
    if (la !== lb) return la - lb;
    if (Platform.OS === "web" && isDesktop && webCommandPriorityFilter) {
      const sa = commandPriorityScore(
        {
          tripId: a.tripId,
          totalUnread: a.totalUnread,
          tripStatus: a.tripStatus,
          indentId: a.indentId,
        },
        activeTripsForCommandPriority,
      );
      const sb = commandPriorityScore(
        {
          tripId: b.tripId,
          totalUnread: b.totalUnread,
          tripStatus: b.tripStatus,
          indentId: b.indentId,
        },
        activeTripsForCommandPriority,
      );
      if (sb !== sa) return sb - sa;
    }
    return b.lastAt - a.lastAt;
  });
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
  const isNativeMobile = isChatNativeMobile(isDesktop);
  /** Trip hub cards (alerts + party row) on every viewport — one list UX for native + web. */
  const useGroupedTripHub = true;
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
  const tripHubMobileAutoPageGateRef = useRef(false);

  const [showEmoji, setShowEmoji] = useState(false);
  const [showScripts, setShowScripts] = useState(false);

  // Document share sheet
  const [showDocShare, setShowDocShare] = useState(false);
  const [ledgerWebToast, setLedgerWebToast] = useState(false);
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
  /** Web desktop: bubble LATE_RISK / indent-linked trips in the hub list. */
  const [webCommandPriorityFilter, setWebCommandPriorityFilter] = useState(false);
  const activeTripsForCommandPriority = useGlobalSyncStore((s) => s.activeTrips);
  const [visibleTripCount, setVisibleTripCount] = useState(10);
  const [tripSidebarSearch, setTripSidebarSearch] = useState("");
  const [hubSearchOpen, setHubSearchOpen] = useState(false);
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
    initiateConversation,
  } = useTripChat();
  // True once bootstrap has completed at least once for this org.
  // Used to distinguish "first load" (show full-area spinner) from
  // "background refresh" (keep list visible, skip spinner).
  const bootstrapDone = useChatStore(s => s.bootstrappedOrg !== null);
  const chatTrips = useChatStore((s) => s.trips);
  const chatBootstrapHasMoreTrips = useChatStore((s) => s.chatBootstrapHasMoreTrips);
  const appendBootstrapTripPage = useChatStore((s) => s.appendBootstrapTripPage);
  const isAppendingBootstrap = useChatStore((s) => s.isAppendingBootstrap);
  const ensureHubHistoryBootstrap = useChatStore((s) => s.ensureHubHistoryBootstrap);

  const {
    chats: netChats,
    partners: netPartners,
    isLoading: netLoading,
    sendMessage: sendNet,
    markAsRead: markNetRead,
    getTotalUnreadCount: netTotal,
    initiateNetworkConversation,
  } = useIntegratedChat();

  const netUnread = netTotal();

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedNetId, setSelectedNetId] = useState<string | null>(null);

  // useConversation subscribes directly to this one conversation in the singleton
  // store — re-renders only when THIS conversation changes (not the full list).
  const selectedConv = useConversation(selectedConvId);
  const selectedNet = netChats.find((c) => c.id === selectedNetId) ?? null;

  useEffect(() => {
    if (!isTripStreamTab(activeTab)) {
      setActiveTripMessageConversationId(null);
      return;
    }
    if (selectedConvId) {
      setActiveTripMessageConversationId(selectedConvId);
      return () => setActiveTripMessageConversationId(null);
    }
    setActiveTripMessageConversationId(null);
  }, [activeTab, selectedConvId]);

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

  const baseFilteredSortedTripConversations = useMemo(() => {
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
        const haystack = `${displayId}`.toLowerCase();
        return haystack.includes(trimmedSearch);
      })
      .sort((a, b) => {
        // Active trips always above terminal (hard boundary, like WhatsApp pinned groups)
        const aTerminal = isTerminalTripStatus(a.trip_status) ? 1 : 0;
        const bTerminal = isTerminalTripStatus(b.trip_status) ? 1 : 0;
        if (aTerminal !== bTerminal) return aTerminal - bTerminal;

        // Within each group: unread conversations first (WhatsApp style)
        const aUnread = (a.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
        const bUnread = (b.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
        if (aUnread !== bUnread) return aUnread - bUnread;

        // Most recent activity first
        return (
          new Date(b.last_message_at ?? 0).getTime() -
          new Date(a.last_message_at ?? 0).getTime()
        );
      });
  }, [conversations, tripPartyFilters, tripSidebarSearch]);

  const tripStreamConversations = useMemo(
    () =>
      baseFilteredSortedTripConversations.filter(
        (c) =>
          !tripHubHasIntegratedPartition(c, chatTrips) &&
          manualHubTripHasAssignedDriver(c, chatTrips),
      ),
    [baseFilteredSortedTripConversations, chatTrips],
  );

  const indentStreamConversations = useMemo(
    () =>
      baseFilteredSortedTripConversations.filter((c) =>
        tripHubHasIntegratedPartition(c, chatTrips),
      ),
    [baseFilteredSortedTripConversations, chatTrips],
  );

  const tripsChatUnread = useMemo(
    () =>
      tripStreamConversations.reduce((s, c) => s + (c.unread_dispatcher_count ?? 0), 0),
    [tripStreamConversations],
  );
  const indentChatUnread = useMemo(
    () =>
      indentStreamConversations.reduce((s, c) => s + (c.unread_dispatcher_count ?? 0), 0),
    [indentStreamConversations],
  );

  const manualRunningLateActiveCount = useMemo(() => {
    const seen = new Set<string>();
    let n = 0;
    for (const c of tripStreamConversations) {
      if (isTerminalTripStatus(String(c.trip_status ?? ""))) continue;
      if (seen.has(c.trip_id)) continue;
      seen.add(c.trip_id);
      if (chatTrips[c.trip_id]?.trackingStatus === "RUNNING_LATE") n += 1;
    }
    return n;
  }, [tripStreamConversations, chatTrips]);

  const integratedRunningLateActiveCount = useMemo(() => {
    const seen = new Set<string>();
    let n = 0;
    for (const c of indentStreamConversations) {
      if (isTerminalTripStatus(String(c.trip_status ?? ""))) continue;
      if (seen.has(c.trip_id)) continue;
      seen.add(c.trip_id);
      if (chatTrips[c.trip_id]?.trackingStatus === "RUNNING_LATE") n += 1;
    }
    return n;
  }, [indentStreamConversations, chatTrips]);

  const sortedNetChats = useMemo(() => {
    return [...netChats].sort((a, b) => {
      const unreadDiff = (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      if (unreadDiff !== 0) return unreadDiff;
      const aLast = a.messages[a.messages.length - 1]?.timestamp ?? "";
      const bLast = b.messages[b.messages.length - 1]?.timestamp ?? "";
      return new Date(bLast || 0).getTime() - new Date(aLast || 0).getTime();
    });
  }, [netChats]);

  const tripHubTrackingByTripId = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const [id, e] of Object.entries(chatTrips)) {
      m[id] = e?.trackingStatus ?? null;
    }
    return m;
  }, [chatTrips]);

  const groupedManualTripHubRows = useMemo(
    () =>
      buildGroupedTripHubRows({
        sourceConversations: tripStreamConversations,
        hubComposeTrips,
        includeAggregateComposePlaceholders: false,
        tripSidebarSearch,
        tripChatScope,
        isDesktop,
        webCommandPriorityFilter,
        activeTripsForCommandPriority,
        tripTrackingByTripId: tripHubTrackingByTripId,
      }),
    [
      tripStreamConversations,
      hubComposeTrips,
      tripSidebarSearch,
      tripChatScope,
      isDesktop,
      webCommandPriorityFilter,
      activeTripsForCommandPriority,
      tripHubTrackingByTripId,
    ],
  );

  const groupedIndentTripHubRows = useMemo(
    () =>
      buildGroupedTripHubRows({
        sourceConversations: indentStreamConversations,
        hubComposeTrips,
        includeAggregateComposePlaceholders: true,
        tripSidebarSearch,
        tripChatScope,
        isDesktop,
        webCommandPriorityFilter,
        activeTripsForCommandPriority,
        tripTrackingByTripId: tripHubTrackingByTripId,
      }),
    [
      indentStreamConversations,
      hubComposeTrips,
      tripSidebarSearch,
      tripChatScope,
      isDesktop,
      webCommandPriorityFilter,
      activeTripsForCommandPriority,
      tripHubTrackingByTripId,
    ],
  );

  const groupedTripRows =
    activeTab === "indent" ? groupedIndentTripHubRows : groupedManualTripHubRows;

  const tripStreamForActiveHubTab = useMemo(
    () => (activeTab === "indent" ? indentStreamConversations : tripStreamConversations),
    [activeTab, indentStreamConversations, tripStreamConversations],
  );

  const tripChatFilteredConversations = useMemo(() => {
    return tripStreamForActiveHubTab.filter((conv) => {
      const terminal = isTerminalTripStatus(conv.trip_status);
      return tripChatScope === "history" ? terminal : !terminal;
    });
  }, [tripStreamForActiveHubTab, tripChatScope]);

  const tripListDisambiguatedLabels = useMemo(() => {
    const byTrip = new Map<string, TripLabelDisambiguationRow>();
    for (const conv of tripChatFilteredConversations) {
      if (byTrip.has(conv.trip_id)) continue;
      byTrip.set(conv.trip_id, {
        tripId: conv.trip_id,
        tripLabel: getConversationTripLabel(conv),
        tripCreatedAt: conv.trip_created_at ?? null,
      });
    }
    return disambiguateTripLabelsForList([...byTrip.values()]);
  }, [tripChatFilteredConversations]);

  const onTripStreamListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (tripChatScope !== "active") return;
      if (!organizationId) return;
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const contentH = contentSize.height;
      const viewH = layoutMeasurement.height;
      if (contentH <= viewH + 24) return;
      const scrollDepth = (contentOffset.y + viewH) / contentH;
      if (scrollDepth < 0.9) return;
      if (tripHubMobileAutoPageGateRef.current) return;

      if (useGroupedTripHub) {
        if (visibleTripCount < groupedTripRows.length) {
          tripHubMobileAutoPageGateRef.current = true;
          setVisibleTripCount((c) => c + 20);
          setTimeout(() => {
            tripHubMobileAutoPageGateRef.current = false;
          }, 450);
          return;
        }
        if (!chatBootstrapHasMoreTrips || isAppendingBootstrap) return;
        tripHubMobileAutoPageGateRef.current = true;
        void appendBootstrapTripPage(organizationId).finally(() => {
          setVisibleTripCount((c) => c + 20);
          setTimeout(() => {
            tripHubMobileAutoPageGateRef.current = false;
          }, 900);
        });
        return;
      }

      if (!chatBootstrapHasMoreTrips || isAppendingBootstrap) return;
      tripHubMobileAutoPageGateRef.current = true;
      void appendBootstrapTripPage(organizationId).finally(() => {
        setTimeout(() => {
          tripHubMobileAutoPageGateRef.current = false;
        }, 900);
      });
    },
    [
      useGroupedTripHub,
      tripChatScope,
      organizationId,
      chatBootstrapHasMoreTrips,
      isAppendingBootstrap,
      appendBootstrapTripPage,
      visibleTripCount,
      groupedTripRows.length,
    ],
  );

  useEffect(() => {
    setVisibleTripCount(10);
  }, [tripChatScope, activeTab]);

  useEffect(() => {
    if (tripSidebarSearch.trim().length > 0) setHubSearchOpen(true);
  }, [tripSidebarSearch]);

  useEffect(() => {
    if (tripChatScope !== "history" || !organizationId || !bootstrapDone) return;
    void ensureHubHistoryBootstrap(organizationId);
  }, [tripChatScope, organizationId, bootstrapDone, ensureHubHistoryBootstrap]);

  useEffect(() => {
    if (!isTripStreamTab(activeTab)) return;
    if (!selectedConvId) return;
    const stream =
      activeTab === "indent" ? indentStreamConversations : tripStreamConversations;
    if (stream.some((c) => c.id === selectedConvId)) return;
    // Hub streams exclude rows (party filters, manual vs integrated split). Selection is still valid
    // if the conversation exists in the org store — do not clear (fixes CLIENT tab snapping back to driver).
    if (conversations.some((c) => c.id === selectedConvId)) return;
    setSelectedConvId(null);
  }, [
    activeTab,
    indentStreamConversations,
    tripStreamConversations,
    conversations,
    selectedConvId,
  ]);

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

    const tabParamRawNorm = String(tabParamRaw ?? "").toLowerCase();
    if (tabParamRawNorm === "network") {
      const netHit = netChats.find((c) => c.id === convIdParam);
      if (!netHit) return;
      const deepLinkKey = `network:${convIdParam}:${tsParam ?? "no-ts"}`;
      if (deepLinkAppliedRef.current === deepLinkKey) return;
      const shouldOpenDetail = openDetailParam === "1";
      setActiveTab("network");
      setSelectedNetId(convIdParam);
      setSelectedConvId(null);
      markNetRead(convIdParam);
      if (shouldOpenDetail && !isDesktop) setIsMobileDetail(true);
      deepLinkAppliedRef.current = deepLinkKey;
      return;
    }

    const deepLinkKey = `${tabParamRawNorm || "trips"}:${convIdParam}:${tsParam ?? "no-ts"}`;
    if (deepLinkAppliedRef.current === deepLinkKey) return;

    const shouldOpenDetail = openDetailParam === "1";
    const hydrateAttemptKey = `${convIdParam}:${tsParam ?? ""}`;

    const hit = conversations.find((c) => c.id === convIdParam);
    if (hit) {
      deepLinkAppliedRef.current = deepLinkKey;
      void (async () => {
        await useChatStore.getState().hydrateTripMessagesIfNeeded(hit.trip_id, {
          conversationId: hit.id,
        });
        const tripsSnap = useChatStore.getState().trips;
        const inferred = tripHubHasIntegratedPartition(hit, tripsSnap) ? "indent" : "trips";
        const targetTab: TabId =
          tabParamRawNorm === "indent" ? "indent" : tabParamRawNorm === "trips" ? "trips" : inferred;
        const resolvedTab: TabId =
          targetTab === "trips" && inferred === "indent" ? "indent" : targetTab;
        setActiveTab(resolvedTab);
        setSelectedConvId(convIdParam);
        setSelectedNetId(null);
        void markTripThreadsRead(hit.trip_id);
        if (shouldOpenDetail && !isDesktop) setIsMobileDetail(true);
      })();
      return;
    }
    // Wait for bootstrap; once conversations update this effect re-runs.
    if (isLoading) return;
    deeplinkHydrateFailedForKeyRef.current = hydrateAttemptKey;
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
    async (conv: TripConversation) => {
      await useChatStore.getState().hydrateTripMessagesIfNeeded(conv.trip_id, {
        conversationId: conv.id,
      });
      chatStore.switchParty(conv.trip_id, conv.party_type);
      setSelectedConvId(conv.id);
      void markTripThreadsRead(conv.trip_id);
      openDetail();
    },
    [markTripThreadsRead],
  );

  useEffect(() => {
    const activeDetailId = isTripStreamTab(activeTab) ? selectedConvId : selectedNetId;
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
      if (isTripStreamTab(activeTab) && selectedConvId) {
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
    if (meta.acknowledged_at || meta.is_booked) return;
    if (addToBookInFlightRef.current.has(message.id)) return;
    const txId = String(meta.transaction_id ?? "").trim();
    if (!txId) {
      Alert.alert("Error", "This ledger entry cannot be booked.");
      return;
    }

    addToBookInFlightRef.current.add(message.id);
    markLedgerBookPending(message.id);
    chatStore.applyLedgerBookOptimistic(selectedConv.id, txId);

    try {
      const { error } = await confirmLedgerToAccountingBooks(message.id, currentOrgId);
      if (error) {
        chatStore.revertLedgerBookOptimistic(selectedConv.id, txId);
        Alert.alert("Error", error.message);
        return;
      }
      if (Platform.OS === "web" && isDesktop) {
        setLedgerWebToast(true);
        setTimeout(() => setLedgerWebToast(false), 2600);
      } else if (Platform.OS !== "web") {
        useGlobalSyncStore.getState().pulseLedgerBookSuccess();
      }
    } catch {
      chatStore.revertLedgerBookOptimistic(selectedConv.id, txId);
      Alert.alert("Error", "Could not add to book. Please try again.");
    } finally {
      addToBookInFlightRef.current.delete(message.id);
      clearLedgerBookPending(message.id);
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
      tripNumber: getTripOperationalDisplay({
        trip_operational_code: trip.trip_operational_code ?? null,
        trip_code: trip.trip_code ?? null,
        display_trip_id: trip.display_trip_id ?? null,
        trip_number: trip.trip_number ?? null,
      }),
      pickupArea: trip.pickup_area,
      dropLocation: trip.drop_location,
      partyType,
      partyName,
      partyId,
    });
    setInitiating(false);
    if (!convId) return;
    setShowCompose(false);
    setActiveTab(isAggregateTrip(trip) && Boolean(String(trip.indent_id ?? "").trim()) ? "indent" : "trips");
    setSelectedConvId(convId);
    if (!isDesktop) setIsMobileDetail(true);
  };

  const filteredComposeTrips = useMemo(() => {
    const q = composeSearch.trim().toLowerCase();
    if (!q) return composeTrips;
    return composeTrips.filter(
      (t) =>
        getTripOperationalDisplay({
          trip_operational_code: t.trip_operational_code ?? null,
          trip_code: t.trip_code ?? null,
          display_trip_id: t.display_trip_id ?? null,
          trip_number: t.trip_number ?? null,
        })
          .toLowerCase()
          .includes(q) ||
        (t.client_name ?? "").toLowerCase().includes(q) ||
        (t.supplier_name ?? "").toLowerCase().includes(q) ||
        (t.pickup_area ?? "").toLowerCase().includes(q) ||
        (t.drop_location ?? "").toLowerCase().includes(q),
    );
  }, [composeSearch, composeTrips]);

  const composeTripsWithChatParties = useMemo(() => {
    let list = filteredComposeTrips.filter((t) => tripHasSelectableComposeParty(t));
    if (activeTab === "indent") {
      list = list.filter((t) => isAggregateTrip(t) && Boolean(String(t.indent_id ?? "").trim()));
    } else if (activeTab === "trips") {
      list = list.filter((t) => !isAggregateTrip(t) || !String(t.indent_id ?? "").trim());
    }
    return list;
  }, [filteredComposeTrips, activeTab]);

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
    const displayTripId =
      tripListDisambiguatedLabels.get(item.trip_id) ?? getConversationTripLabel(item);
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
        style={[
          s.chatItem,
          isNativeMobile && s.chatItemMobile,
          active && !isNativeMobile && s.chatItemActive,
          isNativeMobile && active && s.chatItemActiveMobile,
        ]}
        onPress={() => void openConversation(item)}
        activeOpacity={0.8}
      >
        <View style={s.chatAvatarWrap}>
          <PartyAvatar
            name={avatarName}
            entityType={item.party_type}
            size={isNativeMobile ? CHAT_MOBILE.listAvatar : 56}
            avatarSeed={lastMsgSeed}
          />
          {item.unread_dispatcher_count > 0 && !active && (
            <View style={s.chatAvatarUnreadDot} />
          )}
        </View>
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <View style={s.chatTitleRow}>
              <Text
                style={[
                  s.chatTitle,
                  isNativeMobile && s.chatTitleMobile,
                  active && !isNativeMobile && s.chatTitleActive,
                  isNativeMobile && active && s.chatTitleActiveMobile,
                ]}
                numberOfLines={1}
              >
                {displayTripId}
              </Text>
              {showPendingFeedbackIcon ? (
                <Star
                  size={14}
                  color={CHAT_ACCENT}
                  fill="rgba(79,70,229,0.12)"
                  style={s.chatPendingFeedbackStar}
                  accessibilityLabel="Pending trip feedback"
                />
              ) : null}
              {isActiveTrip ? <View style={[s.activeTripDot, active && s.activeTripDotActive]} /> : null}
            </View>
            <Text
              style={[
                s.chatTime,
                isNativeMobile && s.chatTimeMobile,
                active && !isNativeMobile && s.chatTimeActive,
                isNativeMobile && active && s.chatTimeActiveMobile,
              ]}
            >
              {time}
            </Text>
          </View>
          <Text
            style={[
              s.chatPartyLabel,
              isNativeMobile && s.chatPartyLabelMobile,
              active && !isNativeMobile && s.chatPartyLabelActive,
              isNativeMobile && active && s.chatPartyActiveMobile,
            ]}
          >
            {partyLine ? `${partyLabel(item.party_type)} · ${partyLine}` : partyLabel(item.party_type)}
          </Text>
          {item.last_message_preview ? (
            <Text
              style={[
                s.chatSub,
                isNativeMobile && s.chatSubMobile,
                active && !isNativeMobile && s.chatSubActive,
                isNativeMobile && active && s.chatSubActiveMobile,
              ]}
              numberOfLines={1}
            >
              {item.last_message_preview}
            </Text>
          ) : null}
        </View>
        {item.unread_dispatcher_count > 0 && !active && (
          <Badge count={item.unread_dispatcher_count} />
        )}
      </TouchableOpacity>
    );
  }, [
    selectedConvId,
    openConversation,
    isDesktop,
    isNativeMobile,
    currentOrgId,
    tripListDisambiguatedLabels,
  ]);

  const renderNetItem = useCallback(({ item }: { item: IntegratedChat }) => {
    const last = item.messages[item.messages.length - 1];
    const active = selectedNetId === item.id;
    return (
      <TouchableOpacity
        style={[
          s.chatItem,
          isNativeMobile && s.chatItemMobile,
          active && !isNativeMobile && s.chatItemActive,
          isNativeMobile && active && s.chatItemActiveMobile,
        ]}
        onPress={() => {
          setSelectedNetId(item.id);
          markNetRead(item.id);
          openDetail();
        }}
        activeOpacity={0.8}
      >
        <PartyAvatar
          name={item.partnerName}
          entityType="client"
          size={isNativeMobile ? CHAT_MOBILE.listAvatar : 56}
        />
        <View style={s.chatBody}>
          <View style={s.chatRow}>
            <Text
              style={[
                s.chatTitle,
                isNativeMobile && s.chatTitleMobile,
                active && !isNativeMobile && s.chatTitleActive,
                isNativeMobile && active && s.chatTitleActiveMobile,
              ]}
              numberOfLines={1}
            >
              {item.partnerName}
            </Text>
            <Text
              style={[
                s.chatTime,
                isNativeMobile && s.chatTimeMobile,
                active && !isNativeMobile && s.chatTimeActive,
                isNativeMobile && active && s.chatTimeActiveMobile,
              ]}
            >
              {item.lastActivity}
            </Text>
          </View>
          <Text
            style={[
              s.chatSub,
              isNativeMobile && s.chatSubMobile,
              active && !isNativeMobile && s.chatSubActive,
              isNativeMobile && active && s.chatSubActiveMobile,
            ]}
            numberOfLines={1}
          >
            {last?.content ?? ""}
          </Text>
        </View>
        {item.unreadCount > 0 && !active && <Badge count={item.unreadCount} />}
      </TouchableOpacity>
    );
  }, [selectedNetId, markNetRead, openDetail, isNativeMobile]);

  // ── Panels ───────────────────────────────────────────────────────────────────

  function ChatList() {
    const TABS: {
      id: TabId;
      label: string;
      lateCount: number;
      unread: number;
      Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    }[] = [
      { id: "trips", label: "MANUAL", lateCount: manualRunningLateActiveCount, unread: tripsChatUnread, Icon: Hash },
      {
        id: "indent",
        label: "INTEGRATED",
        lateCount: integratedRunningLateActiveCount,
        unread: indentChatUnread,
        Icon: Briefcase,
      },
      { id: "network", label: "NETWORK DM", lateCount: 0, unread: netUnread, Icon: Users },
    ];

    return (
      <View style={[s.listPanel, isNativeMobile && s.listPanelMobile]}>
        <View style={[s.listHeader, isNativeMobile && s.listHeaderMobile]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <TouchableOpacity
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace(ROUTES.TABS.TRIPS)
              }
              hitSlop={10}
              style={s.backBtn}
            >
              <ArrowLeft size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={s.brandTitle} numberOfLines={1}>
              pulse chat
              <Text style={s.brandDot}>.</Text>
            </Text>
          </View>
          {!isDesktop && isTripStreamTab(activeTab) ? (
            <TouchableOpacity
              onPress={() => {
                if (hubSearchOpen) {
                  setHubSearchOpen(false);
                  setTripSidebarSearch("");
                } else {
                  setHubSearchOpen(true);
                }
              }}
              hitSlop={10}
              style={[
                s.headerSearchBtn,
                (hubSearchOpen || tripSidebarSearch.length > 0) && s.headerSearchBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={hubSearchOpen ? "Close search" : "Search trips"}
            >
              {hubSearchOpen ? (
                <X size={16} color="#fff" />
              ) : (
                <Search size={16} color="#94a3b8" />
              )}
            </TouchableOpacity>
          ) : (
            <View />
          )}
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
                    {t.lateCount > 0 ? `${t.label} (${t.lateCount})` : t.label}
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

        {isTripStreamTab(activeTab) &&
          (isDesktop ? (
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
                {Platform.OS === "web" ? (
                  <TouchableOpacity
                    style={[
                      s.tripChatScopePillStrip,
                      webCommandPriorityFilter && s.tripChatScopePillOn,
                      { marginLeft: 8 },
                    ]}
                    onPress={() => setWebCommandPriorityFilter((v) => !v)}
                    activeOpacity={0.82}
                  >
                    <Text
                      style={[
                        s.tripChatScopePillTextStrip,
                        webCommandPriorityFilter && s.tripChatScopePillTextOn,
                      ]}
                      numberOfLines={1}
                    >
                      Priority
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={s.tripSearchScopeBlock}>
              {hubSearchOpen ? (
                <View style={[chatFilterChromeStyles.searchWrap, s.tripSearchScopeSearchMobile]}>
                  <Search size={12} color="#94a3b8" style={{ marginRight: 5 }} />
                  <TextInput
                    style={chatFilterChromeStyles.searchInput}
                    value={tripSidebarSearch}
                    onChangeText={setTripSidebarSearch}
                    placeholder="Search trip, route…"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    autoFocus
                  />
                  {tripSidebarSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setTripSidebarSearch("")} hitSlop={8}>
                      <X size={12} color="#94a3b8" />
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
              <View style={s.tripSearchScopeStripMobile}>
                <TouchableOpacity
                  style={[
                    s.tripChatScopePillStrip,
                    s.tripChatScopePillStripMobile,
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
                    s.tripChatScopePillStripMobile,
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
          ))}

        {isTripStreamTab(activeTab) && isWebAnchoredPanels && showCompose && (
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

        {isTripStreamTab(activeTab) && isDesktop && showTripFilterModal && (
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

        {isTripStreamTab(activeTab) &&
          (isLoading && !bootstrapDone ? (
            // First-ever bootstrap in progress: full-area spinner.
            // After bootstrap has run once, the list is always rendered from
            // in-memory Zustand state — no spinner on subsequent refreshes.
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <LoadingIndicator color={CHAT_ACCENT} />
            </View>
          ) : useGroupedTripHub ? (
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={s.tripHubScrollContent}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={!isDesktop ? onTripStreamListScroll : undefined}
            >
              {groupedTripRows.length === 0 ? (
                <EmptyList
                  label={
                    tripChatScope === "history"
                      ? activeTab === "indent"
                        ? "No integrated trips in history"
                        : "No manual trips in history"
                      : activeTab === "indent"
                        ? "No active integrated trip conversations"
                        : "No active manual trip conversations"
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
                  const hubTripForIcons = hubComposeTrips.find((t) => t.id === trip.tripId);
                  const clientRowForHub = trip.rows.find((r) => r.party_type === "client");
                  const supplierRowForHub = trip.rows.find((r) => r.party_type === "supplier");
                  const hubTripForPartyFilter: TripForCompose | undefined =
                    hubTripForIcons ??
                    (clientRowForHub || supplierRowForHub
                      ? {
                          id: trip.tripId,
                          trip_number: trip.tripLabel,
                          display_trip_id: null,
                          status: trip.tripStatus,
                          created_at: trip.tripCreatedAt,
                          pickup_area: trip.pickup,
                          drop_location: trip.drop,
                          client_id: clientRowForHub?.client_id ?? null,
                          client_name: clientRowForHub?.party_name ?? null,
                          supplier_id: supplierRowForHub?.supplier_id ?? null,
                          supplier_name: supplierRowForHub?.party_name ?? null,
                          driver_id: trip.tripDriverId ?? null,
                          driver_display_name: null,
                          client_linked_organization_id: null,
                          supplier_linked_organization_id: null,
                        }
                      : undefined);
                  const tripHostOrgIdForHub =
                    trip.rows[0]?.trip_organization_id ?? trip.rows[0]?.organization_id ?? null;
                  const tripIntegratedForHub = tripHubHasIntegratedPartition(
                    { trip_id: trip.tripId, indent_id: trip.indentId },
                    chatTrips,
                  );
                  const hubPartyTypesRow = hubCardPartyTypesForTripHub({
                    hubTrip: hubTripForPartyFilter,
                    hubRows: trip.rows,
                    tripDriverId: trip.tripDriverId,
                    tripSupplierId: trip.tripSupplierId,
                    viewerOrgId: organizationId ?? "",
                    viewerOrgName: currentOrganization?.name ?? null,
                    tripHostOrgId: tripHostOrgIdForHub,
                    tripIntegrated: tripIntegratedForHub,
                  });
                  const openFallback = async () => {
                    if (trip.rows.length === 0) {
                      void openCompose(trip.tripId);
                      return;
                    }
                    const storedParty = chatStore.getActivePartyType(trip.tripId);
                    const preferred = storedParty
                      ? (trip.rows.find((r) => r.party_type === storedParty) ?? trip.rows[0])
                      : trip.rows[0];
                    await useChatStore.getState().hydrateTripMessagesIfNeeded(trip.tripId, {
                      conversationId: preferred.id,
                    });
                    await openConversation(preferred);
                  };
                  const chatEntry = chatTrips[trip.tripId];
                  const partyIconRow = (
                    <>
                      {hubPartyTypesRow.map((tab) => {
                        const row = trip.rows.find((r) => r.party_type === tab.rowType);
                        const on = Boolean(row && selectedConvId === row.id);
                        const entityExists = hubTripForIcons
                          ? isPartyLinkedForTripChat(hubTripForIcons, tab.rowType)
                          : Boolean(row);
                        const isMissing = !row && !entityExists;
                        return (
                          <TouchableOpacity
                            key={`${trip.tripId}-viewer-${tab.displayType}`}
                            style={[
                              s.tripHubPartyIconBtn,
                              tripActive && !on && s.tripHubPartyIconBtnOnDarkCard,
                              on && s.tripHubPartyIconBtnOn,
                              isMissing && s.tripHubPartyIconBtnOff,
                            ]}
                            disabled={isMissing}
                            onPress={async () => {
                              if (row) {
                                await openConversation(row);
                                return;
                              }
                              if (!hubTripForIcons || !entityExists) return;
                              const pr = getComposePartyRows(hubTripForIcons).find(
                                (r) => r.kind === "selectable" && r.partyType === tab.rowType,
                              );
                              if (!pr || pr.kind !== "selectable") return;
                              setInitiating(true);
                              const convId = await initiateConversation({
                                tripId: hubTripForIcons.id,
                                tripNumber: hubTripForIcons.display_trip_id ?? hubTripForIcons.trip_number,
                                pickupArea: hubTripForIcons.pickup_area,
                                dropLocation: hubTripForIcons.drop_location,
                                partyType: tab.rowType,
                                partyName: pr.name,
                                partyId: pr.id,
                              });
                              setInitiating(false);
                              if (convId) {
                                const created = chatStore.getConversation(convId);
                                if (created) void openConversation(created);
                              }
                            }}
                            activeOpacity={0.82}
                          >
                            <PartyIcon
                              partyType={tab.displayType}
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
                    </>
                  );
                  const card = (
                    <TripCard
                      key={trip.tripId}
                      tripActive={tripActive}
                      totalUnread={trip.totalUnread}
                      onPressHero={() => void openFallback()}
                      tripLabel={trip.tripLabel}
                      pickup={trip.pickup}
                      drop={trip.drop}
                      hubDateLabel={hubDateLabel}
                      statusLabel={statusLabel}
                      isUnassignedBadge={isUnassignedBadge}
                      chatFlow={chatEntry?.chatFlow ?? "private_trip"}
                      indentId={chatEntry?.indentId ?? null}
                      trackingStatus={chatEntry?.trackingStatus ?? null}
                      partyIconRow={partyIconRow}
                      lastActivityPartyLabel={
                        trip.lastActivityConv ? partyLabel(trip.lastActivityConv.party_type) : null
                      }
                      lastMessagePreview={trip.lastActivityConv?.last_message_preview ?? null}
                    />
                  );
                  items.push(card);
                  });
                  const showLoadMoreFooter =
                    groupedTripRows.length > 0 &&
                    (visibleTripCount < groupedTripRows.length || chatBootstrapHasMoreTrips);
                  if (showLoadMoreFooter) {
                    const sliceRemaining = Math.max(0, groupedTripRows.length - visibleTripCount);
                    const batch =
                      sliceRemaining > 0 ? Math.min(20, sliceRemaining) : 20;
                    items.push(
                      <View key="__load_more__" style={s.loadMoreLinkWrap}>
                        <TouchableOpacity
                          style={s.loadMoreLinkTouchable}
                          disabled={isAppendingBootstrap}
                          onPress={() => {
                            if (visibleTripCount < groupedTripRows.length) {
                              setVisibleTripCount((c) => c + 20);
                              return;
                            }
                            if (!organizationId) return;
                            void appendBootstrapTripPage(organizationId).then(() => {
                              setVisibleTripCount((c) => c + 20);
                            });
                          }}
                          activeOpacity={0.65}
                        >
                          <View style={s.loadMoreLinkInner}>
                            {isAppendingBootstrap ? (
                              <LoadingIndicator size="small" color="#94a3b8" />
                            ) : null}
                            <Text style={s.loadMoreLinkText}>
                              {isAppendingBootstrap
                                ? "Loading…"
                                : sliceRemaining > 0
                                  ? `Load ${batch} more`
                                  : "Load more trips"}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>,
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
                      ? activeTab === "indent"
                        ? "No integrated trips in history"
                        : "No manual trips in history"
                      : activeTab === "indent"
                        ? "No active integrated trip conversations"
                        : "No active manual trip conversations"
                  }
                  actionLabel={tripChatScope === "active" ? "Start a conversation" : undefined}
                  onAction={tripChatScope === "active" ? openCompose : undefined}
                />
              }
              contentContainerStyle={{ padding: 10, paddingBottom: 24, gap: 4 }}
              scrollEventThrottle={16}
              onScroll={onTripStreamListScroll}
            />
          ))}

        {activeTab === "network" &&
          (netLoading && netChats.length === 0 ? (
            <View style={{ paddingTop: 40, alignItems: "center" }}>
              <LoadingIndicator color={CHAT_ACCENT} />
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
                          <LoadingIndicator size="small" color={CHAT_ACCENT} />
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
            <LoadingIndicator color={CHAT_ACCENT} />
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
              const tripLabel = getTripOperationalDisplay({
                trip_operational_code: trip.trip_operational_code ?? null,
                trip_code: trip.trip_code ?? null,
                display_trip_id: trip.display_trip_id ?? null,
                trip_number: trip.trip_number ?? null,
              });

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
                              <LoadingIndicator size="small" color={CHAT_ACCENT} />
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
    isTripStreamTab(activeTab) ? (
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
        inputOverlayMaxWidth={inputOverlayMaxWidth}
        onCloseDetail={closeDetail}
        currentOrgId={currentOrgId}
        onAddToBook={handleAddToBook}
        onDispute={handleDispute}
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
        {Platform.OS === "web" && isDesktop && ledgerWebToast ? (
          <View style={s.ledgerWebToast} pointerEvents="none">
            <Text style={s.ledgerWebToastText}>Added to Ledger</Text>
          </View>
        ) : null}
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={["#edfafa", "#ffffff", CHAT_ACCENT_SOFT]}
      locations={[0, 0.45, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        s.root,
        {
          paddingTop: insets.top,
          paddingBottom: isMobileDetail ? 0 : insets.bottom,
        },
      ]}
    >
      <View style={s.mobileRootFill}>
        {!isMobileDetail ? (
          ChatList()
        ) : (
          <Animated.View
            style={[s.detailTransitionShell, detailEnterStyle]}
            collapsable={false}
          >
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
  loadMoreLinkWrap: {
    marginTop: 8,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreLinkTouchable: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  loadMoreLinkInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadMoreLinkText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#94a3b8",
    textDecorationLine: "underline",
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
  headerSearchBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerSearchBtnActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  tripSearchScopeBlock: {
    marginHorizontal: 18,
    marginBottom: 12,
    gap: 8,
  },
  tripSearchScopeSearchMobile: {
    width: "100%",
  },
  tripSearchScopeStripMobile: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  tripChatScopePillStripMobile: {
    flex: 1,
    minWidth: 0,
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
    width: 12,
    height: 12,
    borderRadius: 6,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eef2f7",
    backgroundColor: "#ffffff",
    flexShrink: 0,
  },
  listHeaderMobile: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  chatItemMobile: {
    paddingVertical: CHAT_MOBILE.listRowPad,
    paddingHorizontal: 12,
    marginHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E9EDEF",
  },
  chatItemActiveMobile: {
    backgroundColor: "#F0F2F5",
    borderBottomColor: "#E9EDEF",
  },
  listPanelMobile: {
    backgroundColor: "#FFFFFF",
  },
  chatTitleMobile: {
    fontSize: CHAT_MOBILE.listTitleSize,
    fontWeight: "600",
    fontStyle: "normal",
    letterSpacing: 0,
    textTransform: "none",
  },
  chatTitleActiveMobile: { color: "#111B21" },
  chatTimeMobile: {
    fontSize: CHAT_MOBILE.listTimeSize,
    textTransform: "none",
    fontWeight: "400",
  },
  chatTimeActiveMobile: { color: "#667781" },
  chatPartyLabelMobile: {
    fontSize: CHAT_MOBILE.listPreviewSize,
    fontStyle: "normal",
    fontWeight: "400",
    color: "#667781",
  },
  chatPartyActiveMobile: { color: "#667781" },
  chatSubMobile: {
    fontSize: CHAT_MOBILE.listPreviewSize,
    lineHeight: 17,
    color: "#667781",
  },
  chatSubActiveMobile: { color: "#667781" },
  detailHeaderMobile: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: CHAT_MOBILE.headerBg,
    borderBottomColor: CHAT_MOBILE.headerBorder,
  },
  detailBackBtn: {
    marginRight: 2,
    padding: 2,
  },
  detailIconWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 38,
    height: 38,
    paddingHorizontal: 5,
    borderRadius: 14,
    backgroundColor: "#0f172a",
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.2,
    fontStyle: "italic",
  },
  detailIconWrapMobile: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  detailTitleMobile: {
    fontSize: CHAT_MOBILE.headerTitleSize,
    fontWeight: "700",
    fontStyle: "normal",
    letterSpacing: -0.15,
  },
  detailPartySubtitleMobile: {
    fontSize: CHAT_MOBILE.headerSubtitleSize,
    marginTop: 1,
  },
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eef2f7",
    flexShrink: 0,
  },
  detailMissionBarMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: CHAT_MOBILE.headerBg,
    borderBottomColor: CHAT_MOBILE.headerBorder,
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
  detailMissionTabsScrollerMobile: {
    maxWidth: "100%",
    width: "100%",
    minHeight: 40,
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
  detailTransitionShell: { flex: 1, minHeight: 0, width: "100%" },
  conversationBody: { flex: 1, minHeight: 0 },
  chatMessagesFlex: { flex: 1, minHeight: 0 },
  chatInputDock: {
    flexShrink: 0,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  chatInputDockMobile: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
  },
  chatInputDockWebFixed: {
    position: "fixed",
    left: 0,
    right: 0,
    zIndex: 40,
    backgroundColor: CHAT_MOBILE.composerBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CHAT_MOBILE.headerBorder,
  },
  msgs: { flex: 1, backgroundColor: "transparent" },
  msgsContent: { paddingHorizontal: 14, paddingTop: 12, gap: 10, paddingBottom: 12 },
  msgsContentMobile: {
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: CHAT_MOBILE.eventCardGap,
    paddingBottom: 12,
  },

  sysMsg: {
    alignSelf: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginVertical: 4,
  },
  sysMsgMobile: {
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: CHAT_MOBILE.eventCardRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E9EDEF",
    paddingHorizontal: CHAT_MOBILE.eventCardPadH,
    paddingVertical: 10,
    marginVertical: CHAT_MOBILE.eventCardGap / 2,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sysMsgText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  sysMsgTextMobile: {
    fontSize: CHAT_MOBILE.eventMetaSize,
    fontWeight: "600",
    color: "#667781",
    letterSpacing: 0.2,
    textTransform: "none",
    lineHeight: CHAT_MOBILE.eventMetaLine,
  },

  bubbleWrap: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleWrapOwn: { justifyContent: "flex-end" },
  bubbleWrapOther: { justifyContent: "flex-start" },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMobile: {
    borderRadius: 14,
    paddingHorizontal: CHAT_MOBILE.bubblePadH,
    paddingVertical: CHAT_MOBILE.bubblePadV,
  },
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
  bubbleOwnMobile: {
    borderBottomRightRadius: 4,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  bubbleOtherMobile: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderColor: "rgba(0,0,0,0.06)",
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 0,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMobile: {
    fontSize: CHAT_MOBILE.bubbleFontSize,
    lineHeight: CHAT_MOBILE.bubbleLineHeight,
  },
  bubbleTextOwn: { color: "#fff" },
  bubbleTextOther: { color: "#1e293b" },
  bubbleMeta: { fontSize: 10, color: "#94a3b8", letterSpacing: 0.2 },
  bubbleMetaMobile: {
    fontSize: CHAT_MOBILE.metaFontSize,
    marginTop: 2,
    color: "#8696A0",
  },
  bubbleMetaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  bubbleMetaRowOwn: { justifyContent: "flex-end" },

  inputWrap: {
    position: "relative",
    backgroundColor: "#fff",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    minHeight: 48,
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
    minWidth: 0,
    backgroundColor: "#f1f5f9",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    lineHeight: 20,
    color: "#0f172a",
    maxHeight: 120,
    minHeight: 40,
  },
  inputWeb: Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {},
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

  chipRow: { paddingHorizontal: 10, paddingBottom: 8, paddingTop: 2, gap: 6 },
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
  ledgerWebToast: {
    position: "absolute",
    top: 72,
    alignSelf: "center",
    zIndex: 400,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.92)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  ledgerWebToastText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#f8fafc",
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
  searchInput: { flex: 1, fontSize: 16, color: "#1e293b" },

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

function ChatConversationLayout({
  isDesktop,
  header,
  messages,
  inputBar,
}: {
  isDesktop: boolean;
  header: React.ReactNode;
  messages: React.ReactNode;
  inputBar: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const nativeMobile = isChatNativeMobile(isDesktop);
  const mobileWeb = Platform.OS === "web" && !isDesktop;
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible();
  const dockBottomPad = isDesktop
    ? 10
    : dockPaddingBottom(insets.bottom, keyboardVisible);
  const webComposerReserve = mobileWebComposerReservePx();
  const keyboardInset = effectiveKeyboardInset(keyboardVisible, keyboardHeight);

  // Refs for direct DOM style mutation on mobile web — bypasses React re-render lag
  // so keyboard position tracks the visual viewport synchronously (frame-perfect).
  const composerWebRef = useRef<View>(null);
  const msgsWebRef = useRef<View>(null);

  useEffect(() => {
    if (!mobileWeb) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // Keyboard height = gap between layout viewport bottom and visual viewport bottom.
      const measured = Math.max(
        0,
        Math.round(window.innerHeight - vv.height - (vv.offsetTop ?? 0)),
      );
      const active = document.activeElement;
      const focusedEditable =
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      const open = measured >= 48 || focusedEditable;
      const keyboardH = effectiveKeyboardInset(open, measured);
      const safeB = keyboardH > 0 ? 4 : insets.bottom;
      // setNativeProps → direct DOM style write, zero React reconciler overhead.
      (composerWebRef.current as any)?.setNativeProps?.({
        style: { bottom: keyboardH, paddingBottom: safeB },
      });
      (msgsWebRef.current as any)?.setNativeProps?.({
        style: { paddingBottom: webComposerReserve + safeB + keyboardH },
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [mobileWeb, insets.bottom, webComposerReserve]);

  const messagesPane = (
    <>
      {header}
      <View style={s.chatMessagesFlex}>{messages}</View>
    </>
  );

  const composerDock = (
    <View
      style={[
        s.chatInputDock,
        nativeMobile && s.chatInputDockMobile,
        { paddingBottom: dockBottomPad },
        nativeMobile &&
          Platform.OS === "android" &&
          keyboardInset > 0 && { marginBottom: keyboardInset },
      ]}
    >
      {inputBar}
    </View>
  );

  const conversationBody = (
    <View
      style={[
        s.conversationBody,
        nativeMobile && { backgroundColor: CHAT_MOBILE.wallpaper },
      ]}
    >
      {messagesPane}
      {composerDock}
    </View>
  );

  if (isDesktop) {
    return (
      <View style={s.detailPanel}>
        {conversationBody}
      </View>
    );
  }

  if (mobileWeb) {
    return (
      <View style={s.detailPanel}>
        <View
          ref={msgsWebRef}
          style={[
            s.conversationBody,
            {
              flex: 1,
              minHeight: 0,
              backgroundColor: CHAT_MOBILE.wallpaper,
              // Initial padding before first visualViewport event; setNativeProps takes over.
              paddingBottom: webComposerReserve + dockBottomPad + keyboardInset,
            },
          ]}
        >
          {messagesPane}
        </View>
        <View
          ref={composerWebRef}
          style={[
            s.chatInputDockWebFixed,
            s.chatInputDock,
            nativeMobile && s.chatInputDockMobile,
            // Initial position; setNativeProps overrides each visualViewport frame.
            { bottom: keyboardInset, paddingBottom: dockBottomPad },
          ]}
        >
          {inputBar}
        </View>
      </View>
    );
  }

  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView
        style={s.detailPanel}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {conversationBody}
      </KeyboardAvoidingView>
    );
  }

  return <View style={s.detailPanel}>{conversationBody}</View>;
}

function ChatDetailHeader({
  title,
  subtitle,
  partyType,
  counterpartyType,
  isDesktop,
  onCloseDetail,
}: {
  title: string;
  subtitle?: string;
  partyType?: ConversationPartyType;
  /** Integrated B2B counterparty (client or supplier), shown beside the active lane icon. */
  counterpartyType?: "client" | "supplier" | null;
  isDesktop: boolean;
  onCloseDetail: () => void;
}) {
  const nativeMobile = isChatNativeMobile(isDesktop);
  const dualLane = Boolean(partyType && counterpartyType);
  return (
    <View
      style={[
        s.detailHeader,
        nativeMobile && s.detailHeaderMobile,
      ]}
    >
      {!isDesktop && (
        <TouchableOpacity onPress={onCloseDetail} hitSlop={10} style={s.detailBackBtn}>
          <ArrowLeft size={nativeMobile ? 22 : 20} color="#111B21" />
        </TouchableOpacity>
      )}
      <View style={[s.detailIconWrap, nativeMobile && s.detailIconWrapMobile]}>
        {partyType ? (
          <>
            <PartyIcon partyType={partyType} active size={dualLane ? 14 : nativeMobile ? 16 : 18} />
            {counterpartyType ? (
              <PartyIcon partyType={counterpartyType} active size={14} />
            ) : null}
          </>
        ) : (
          <MessageSquare size={nativeMobile ? 16 : 18} color="#fff" />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[s.detailTitle, nativeMobile && s.detailTitleMobile]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[s.detailPartySubtitle, nativeMobile && s.detailPartySubtitleMobile]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {!nativeMobile ? (
        <>
          <TouchableOpacity hitSlop={10}>
            <Search size={17} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={10} style={{ marginLeft: 8 }}>
            <MoreVertical size={17} color="#64748b" />
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

function ChatSystemMsg({ label, isMobile = false }: { label: string; isMobile?: boolean }) {
  return (
    <View style={[s.sysMsg, isMobile && s.sysMsgMobile]}>
      <Text style={[s.sysMsgText, isMobile && s.sysMsgTextMobile]} numberOfLines={3}>
        {label}
      </Text>
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
  isMobile,
  onAvatarPress,
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
  isMobile?: boolean;
  onAvatarPress?: () => void;
}) {
  const avatarSize = isMobile ? CHAT_MOBILE.avatarSize : 44;
  const bubbleMaxWidth = isMobile ? CHAT_MOBILE.bubbleMaxWidthPct : "72%";
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
        onAvatarPress ? (
          <Pressable onPress={onAvatarPress} hitSlop={6}>
            <PartyAvatar
              name={senderName ?? "?"}
              entityType="client"
              size={avatarSize}
              avatarSeed={avatarSeed ?? null}
            />
          </Pressable>
        ) : (
          <PartyAvatar
            name={senderName ?? "?"}
            entityType="client"
            size={avatarSize}
            avatarSeed={avatarSeed ?? null}
          />
        )
      )}
      <View style={{ maxWidth: bubbleMaxWidth }}>
        <View
          style={[
            s.bubble,
            isMobile && s.bubbleMobile,
            isOwn ? s.bubbleOwn : s.bubbleOther,
            isMobile && isOwn && s.bubbleOwnMobile,
            isMobile && !isOwn && s.bubbleOtherMobile,
          ]}
        >
          <Text
            style={[
              s.bubbleText,
              isMobile && s.bubbleTextMobile,
              isOwn ? s.bubbleTextOwn : s.bubbleTextOther,
            ]}
          >
            {content}
          </Text>
        </View>
        <View style={[s.bubbleMetaRow, isOwn && s.bubbleMetaRowOwn]}>
          <Text style={[s.bubbleMeta, isMobile && s.bubbleMetaMobile]}>
            {displayTime}
            {senderName ? ` · ${senderName.toUpperCase()}` : " · YOU"}
          </Text>
          {isOwn && <MessageTick status={deliveryStatus} />}
        </View>
      </View>
      {isOwn && (
        <PartyAvatar
          name={profile?.full_name || profile?.displayName || "You"}
          avatarUrl={profile?.avatar_url ?? null}
          organizationImageUrl={currentOrganization?.logo_url ?? null}
          entityType="client"
          size={avatarSize}
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
  compact,
  minimalChrome,
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
  /** Hide quick chips when the keyboard is open (mobile). */
  compact?: boolean;
  /** Mobile: hide emoji/scripts row buttons (WhatsApp-style composer). */
  minimalChrome?: boolean;
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

  const submitMessage = useCallback(() => {
    if (!messageInput.trim()) return;
    onSend();
  }, [messageInput, onSend]);

  if (minimalChrome) {
    return (
      <ChatMobileComposer
        value={messageInput}
        onChangeText={onChangeMessage}
        onSend={onSend}
        onOpenAttach={onOpenDocShare}
        quickMessages={quickMsgs}
        hideQuickChips={compact}
        placeholder="Message"
      />
    );
  }

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
          style={[s.input, s.inputWeb]}
          value={messageInput}
          onChangeText={onChangeMessage}
          placeholder="Message"
          placeholderTextColor="#94a3b8"
          multiline
          editable
          scrollEnabled
          blurOnSubmit={false}
          returnKeyType="send"
          enablesReturnKeyAutomatically
          onSubmitEditing={submitMessage}
          textAlignVertical="center"
          autoCorrect
          autoCapitalize="sentences"
        />
        {!minimalChrome ? (
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
        ) : null}
        {!minimalChrome ? (
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
        ) : null}
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
      {!compact ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
      ) : null}
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
  inputOverlayMaxWidth,
  onCloseDetail,
  currentOrgId,
  onAddToBook,
  onDispute,
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
  inputOverlayMaxWidth: number;
  onCloseDetail: () => void;
  currentOrgId: string;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
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
  onSelectConversation,
  onOpenCompose: _onOpenCompose,
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
  onSelectConversation: (id: string) => void;
  onOpenCompose: () => void | Promise<void>;
  onFeedbackSubmitted: () => void;
}) {
  const router = useRouter();
  const { profile } = useAuth();
  const selfUid = (profile as any)?.uid ?? null;
  const { currentOrganization } = useOrganization();
  /** Outgoing bubble side / "YOU" — must use auth uid, not sender_role (linked clients see dispatcher messages as incoming). */
  const isMessageFromSelf = useCallback(
    (m: TripMessageRow) =>
      Boolean(selfUid && m.sender_user_id && m.sender_user_id === selfUid),
    [selfUid],
  );
  const { markTripThreadsRead, initiateConversation } = useTripChat();

  // Subscribe directly to this conversation for live message updates.
  // Re-renders only when THIS conversation changes, not the full list.
  const liveConv = useConversation(selectedConv.id) ?? selectedConv;
  const liveTripEntry = useChatStore((s) =>
    liveConv.trip_id ? s.trips[liveConv.trip_id] ?? null : null,
  );
  const liveConvRef = useRef(liveConv);
  liveConvRef.current = liveConv;

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const olderInFlightRef = useRef(false);
  /** One newest-page fetch at a time (auto + manual share) — avoids duplicate `trip_messages` hits. */
  const latestHistoryInFlightRef = useRef(false);
  /** Increment when `liveConv.id` changes so stale fetches never merge or touch loading UI. */
  const historyFetchGenerationRef = useRef(0);
  const olderStartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mergeHistoryPage = useCallback((rows: TripMessageRow[]) => {
    const id = liveConvRef.current.id;
    const ok = chatStore.mergeConversationHistory(id, rows);
    setHasMoreOlder(rows.length === TRIP_CHAT_HISTORY_PAGE);
    return ok;
  }, []);

  /** Newest page: single-flight; shared by auto-backfill and "Load history". */
  const runLatestHistoryPage = useCallback(async () => {
    if (latestHistoryInFlightRef.current) return;
    latestHistoryInFlightRef.current = true;
    const generation = historyFetchGenerationRef.current;
    const convId = liveConvRef.current.id;
    const partyType = liveConvRef.current.party_type ?? null;
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const rows = await getMessagesByConversation(convId, {
        limit: TRIP_CHAT_HISTORY_PAGE,
        partyType,
      });
      if (generation !== historyFetchGenerationRef.current) return;

      const ok = mergeHistoryPage(rows);

      if (rows.length > 0 && !ok) {
        setHistoryError(
          "Thread is not synced in the app yet. Return to the inbox and open the trip again, or wait a moment and tap Load history once.",
        );
        return;
      }

      queueMicrotask(() => {
        if (generation !== historyFetchGenerationRef.current) return;
        const c = chatStore.getConversation(convId);
        if (rows.length > 0 && (c?.messages?.length ?? 0) === 0) {
          setHistoryError(
            "Messages were fetched but none are visible on this party tab. Try Client, Supplier, or Driver.",
          );
        }
      });
    } catch {
      if (generation === historyFetchGenerationRef.current) {
        setHistoryError("Could not load messages. Wait a moment and try once.");
      }
    } finally {
      latestHistoryInFlightRef.current = false;
      if (generation === historyFetchGenerationRef.current) {
        setHistoryLoading(false);
      }
    }
  }, [mergeHistoryPage]);

  const loadLatestHistoryPage = useCallback(() => {
    void runLatestHistoryPage();
  }, [runLatestHistoryPage]);

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
        partyType: liveConvRef.current.party_type ?? null,
      });
      if (rows.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      const ok = mergeHistoryPage(rows);
      if (!ok) setHasMoreOlder(false);
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
      historyFetchGenerationRef.current += 1;
      latestHistoryInFlightRef.current = false;
      if (olderStartDebounceRef.current) {
        clearTimeout(olderStartDebounceRef.current);
        olderStartDebounceRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    historyFetchGenerationRef.current += 1;
    latestHistoryInFlightRef.current = false;
    setHistoryLoading(false);
    setHistoryError(null);
    setHasMoreOlder((liveConv.messages?.length ?? 0) >= TRIP_CHAT_HISTORY_PAGE);
    olderInFlightRef.current = false;
    if (olderStartDebounceRef.current) {
      clearTimeout(olderStartDebounceRef.current);
      olderStartDebounceRef.current = null;
    }
  }, [liveConv.id]);

  // Single automatic newest-page fetch when the lane is still empty (same in-flight guard as manual).
  useEffect(() => {
    if (liveConv.messages.length > 0) return;
    void runLatestHistoryPage();
  }, [liveConv.id, liveConv.messages.length, runLatestHistoryPage]);

  const [tripRatings, setTripRatings] = useState<RatingRow[]>([]);

  // Footer feedback state — bootstrap smiley picker for completed integrated trips.
  const [footerFeedbackScore, setFooterFeedbackScore] = useState<number | null>(null);
  const [footerFeedbackPhase, setFooterFeedbackPhase] = useState<"pick" | "submitting" | "done">("pick");

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
    const fromCompose = composeTrips.find((t) => t.id === liveConv.trip_id)?.status ?? null;
    if (fromCompose != null && String(fromCompose).trim() !== "") return fromCompose;
    const fromStore = liveTripEntry?.status;
    if (fromStore != null && String(fromStore).trim() !== "") return fromStore;
    return null;
  }, [composeTrips, liveConv.trip_id, liveConv.trip_status, liveTripEntry?.status]);

  const tripEligibleForFeedback = isTripFeedbackEligibleStatus(effectiveTripStatus);

  const hasTripIndent =
    Boolean(String(liveConv.indent_id ?? "").trim()) ||
    Boolean(liveTripEntry?.indentId && String(liveTripEntry.indentId).trim());
  const tripIsIntegrated =
    liveTripEntry?.chatFlow === "integrated_group" ||
    liveConv.conversation_type === "integrated_group" ||
    hasTripIndent;

  const viewerIsDriver = profile?.role === "driver";
  const allowFinancialCards = !viewerIsDriver;
  const integratedIndentCommercialLane = useMemo(
    () =>
      hasTripIndent &&
      tripIsIntegrated &&
      (liveConv.party_type === "client" || liveConv.party_type === "supplier"),
    [
      hasTripIndent,
      tripIsIntegrated,
      liveConv.party_type,
      liveTripEntry?.chatFlow,
      liveConv.conversation_type,
    ],
  );
  const allowLedgerActions = allowFinancialCards && integratedIndentCommercialLane;
  const showFeedbackCardOnEligibleLane =
    liveConv.party_type === "client" || liveConv.party_type === "supplier";

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

  const tripCompose = useMemo(
    () => composeTrips.find((t) => t.id === liveConv.trip_id) ?? null,
    [composeTrips, liveConv.trip_id],
  );

  const { data: assignmentAuditRows = [] } = useTripAssignmentAuditHistoryQuery(
    liveConv.trip_id,
  );
  const assignmentAuditMaps = useAssignmentAuditNameMaps(
    liveConv.trip_organization_id ?? liveConv.organization_id ?? currentOrgId,
    assignmentAuditRows,
    {
      driver_display_name:
        tripCompose?.driver_display_name ?? liveTripEntry?.driverDisplayName ?? null,
      vehicle_display_number: liveTripEntry?.vehicleDisplayNumber ?? null,
    },
  );

  const displayMessages = useMemo(
    () => {
      const base = dedupeFeedbackRequestMessages(
        dedupeTripStatusBroadcastsForLane(
          mergeTripChatMessagesWithFeedbackRatings(
            liveConv.trip_id,
            liveConv.messages,
            tripRatings,
          ),
          liveConv.id,
        ),
      ).filter((m) => String(m.conversation_id ?? "") === liveConv.id);
      return mergeAssignmentAuditIntoTripMessages(
        base,
        assignmentAuditRows,
        liveConv.id,
        liveConv.organization_id,
        assignmentAuditMaps,
        {
          driver_display_name:
            tripCompose?.driver_display_name ?? liveTripEntry?.driverDisplayName ?? null,
          vehicle_display_number: liveTripEntry?.vehicleDisplayNumber ?? null,
        },
      );
    },
    [
      liveConv.trip_id,
      liveConv.id,
      liveConv.messages,
      liveConv.organization_id,
      tripRatings,
      assignmentAuditRows,
      assignmentAuditMaps,
      tripCompose?.driver_display_name,
      liveTripEntry?.driverDisplayName,
      liveTripEntry?.vehicleDisplayNumber,
    ],
  );

  /**
   * WhatsApp-style ping collapsing: consecutive location pings in a run are collapsed into ONE card.
   * Maps each message ID → { isLast: whether it's the last ping in a consecutive run, runCount: total in run }.
   * Non-last pings are hidden; the last one shows the consolidated count.
   */
  const locationPingRunInfo = useMemo(() => {
    const info = new Map<string, { isLast: boolean; runCount: number }>();
    const isLocationPing = (m: TripMessageRow) =>
      (m.message_type === 'system_log' || m.message_type === 'system' ||
       m.message_type === 'update' || m.message_type === 'location_log') &&
      parseMessageLocationData(m) !== null;

    let runIds: string[] = [];
    const flushRun = () => {
      if (runIds.length === 0) return;
      const count = runIds.length;
      runIds.forEach((id, idx) => info.set(id, { isLast: idx === count - 1, runCount: count }));
      runIds = [];
    };
    for (const m of displayMessages) {
      if (isLocationPing(m)) {
        runIds.push(m.id);
      } else {
        flushRun();
      }
    }
    flushRun();
    return info;
  }, [displayMessages]);

  const scrollToEndCooldownRef = useRef(0);
  const onMessagesContentSizeChange = useCallback(() => {
    if (displayMessages.length === 0) return;
    const t = Date.now();
    if (t - scrollToEndCooldownRef.current < 150) return;
    scrollToEndCooldownRef.current = t;
    messagesRef.current?.scrollToEnd({ animated: false });
  }, [displayMessages.length]);

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

  const onSubmitFooterFeedback = useCallback(async (score: number) => {
    const laneType = liveConv.party_type;
    if (laneType !== "supplier" && laneType !== "client") return;
    const laneId = laneType === "supplier" ? supplierId : clientId;
    if (!laneId || !currentOrgId || !liveConv.trip_id) return;
    setFooterFeedbackPhase("submitting");
    const { error } = await createRating(currentOrgId, {
      trip_id: liveConv.trip_id,
      rater_type: "organization",
      rater_id: currentOrgId,
      rated_type: laneType,
      rated_id: laneId,
      score,
    });
    if (!error) {
      setFooterFeedbackScore(score);
      setFooterFeedbackPhase("done");
      onFeedbackSubmitted();
    } else {
      setFooterFeedbackPhase("pick");
    }
  }, [liveConv.party_type, liveConv.trip_id, supplierId, clientId, currentOrgId, onFeedbackSubmitted]);

  const detailVisiblePartyTypes = useMemo(
    () => {
      const hasClient = Boolean(String(clientId ?? "").trim()) || Boolean(partyConversationMap.client);
      const hasSupplier =
        Boolean(String(supplierId ?? "").trim()) || Boolean(partyConversationMap.supplier);
      const hasDriver = Boolean(String(driverId ?? "").trim()) || Boolean(partyConversationMap.driver);

      if (!tripIsIntegrated) {
        return hasDriver ? (["driver"] as ConversationPartyType[]) : [];
      }

      // Integrated trips: driver + exactly 1 commercial party (max 2 tabs total).
      const isDetailLinkedSupplier =
        Boolean(partyConversationMap.supplier) &&
        viewerIsLinkedTripSupplierViewer({
          supplierLanePartyName: partyConversationMap.supplier?.party_name,
          viewerOrgId: currentOrgId,
          viewerOrgName: currentOrganization?.name ?? null,
          tripHostOrgId: liveConv.trip_organization_id ?? liveConv.organization_id,
          composeSupplierLinkedOrgId: tripCompose?.supplier_linked_organization_id ?? null,
        });
      const isDetailLinkedClient =
        Boolean(partyConversationMap.client) &&
        viewerIsLinkedTripClientViewer({
          clientLanePartyName: partyConversationMap.client?.party_name,
          viewerOrgId: currentOrgId,
          viewerOrgName: currentOrganization?.name ?? null,
          tripHostOrgId: liveConv.trip_organization_id ?? liveConv.organization_id,
          composeClientLinkedOrgId: tripCompose?.client_linked_organization_id ?? null,
        });

      // Linked supplier (external carrier) → their own lane.
      // Linked client (shipper) → supplier lane (sees carrier, not themselves).
      // Fleet owner (trip creator) → client lane (the shipper who originated the load).
      // applyContractualHubPartyIsolation strips "client" entry for client-org viewers.
      const commercial: ConversationPartyType | null = isDetailLinkedSupplier
        ? (hasSupplier ? "supplier" : null)
        : isDetailLinkedClient
          ? (hasSupplier ? "supplier" : null)
          : (hasClient ? "client" : hasSupplier ? "supplier" : null);

      const base: ConversationPartyType[] = [
        ...(commercial ? [commercial] : []),
        ...(hasDriver ? (["driver"] as ConversationPartyType[]) : []),
      ];

      return applyContractualHubPartyIsolation(base, {
        viewerOrgId: currentOrgId,
        lanes: sameTripConversations,
        tripIntegrated: tripIsIntegrated,
        viewerIsLinkedSupplier: isDetailLinkedSupplier,
      });
    },
    [
      tripIsIntegrated,
      clientId,
      supplierId,
      driverId,
      partyConversationMap.client,
      partyConversationMap.supplier,
      partyConversationMap.driver,
      currentOrgId,
      currentOrganization?.name,
      liveConv.trip_organization_id,
      liveConv.organization_id,
      tripCompose?.supplier_linked_organization_id,
      tripCompose?.client_linked_organization_id,
      sameTripConversations,
    ],
  );

  const linkedClientSuppressClientTab = useMemo(
    () =>
      Boolean(partyConversationMap.client) &&
      viewerIsLinkedTripClientViewer({
        clientLanePartyName: partyConversationMap.client?.party_name,
        viewerOrgId: currentOrgId,
        viewerOrgName: currentOrganization?.name ?? null,
        tripHostOrgId: liveConv.trip_organization_id ?? liveConv.organization_id,
        composeClientLinkedOrgId: tripCompose?.client_linked_organization_id ?? null,
      }),
    [
      partyConversationMap.client,
      currentOrgId,
      currentOrganization?.name,
      liveConv.trip_organization_id,
      liveConv.organization_id,
      tripCompose?.client_linked_organization_id,
    ],
  );

  const linkedSupplierSuppressSupplierTab = useMemo(
    () =>
      Boolean(partyConversationMap.supplier) &&
      viewerIsLinkedTripSupplierViewer({
        supplierLanePartyName: partyConversationMap.supplier?.party_name,
        viewerOrgId: currentOrgId,
        viewerOrgName: currentOrganization?.name ?? null,
        tripHostOrgId: liveConv.trip_organization_id ?? liveConv.organization_id,
        composeSupplierLinkedOrgId: tripCompose?.supplier_linked_organization_id ?? null,
      }),
    [
      partyConversationMap.supplier,
      currentOrgId,
      currentOrganization?.name,
      liveConv.trip_organization_id,
      liveConv.organization_id,
      tripCompose?.supplier_linked_organization_id,
    ],
  );

  const missionBarPartyTypes = useMemo((): HubPartyTab[] => {
    let rows = detailVisiblePartyTypes;
    // Client viewer hides their own "client" tab (they are the client — redundant self).
    if (linkedClientSuppressClientTab) rows = rows.filter((p) => p !== "client");
    // Supplier viewer: keep "supplier" tab but relabel it as "CLIENT" — from the carrier's
    // perspective this lane is communication with the indent owner (their client).
    return rows.map((p): HubPartyTab => {
      if (p === "supplier" && linkedSupplierSuppressSupplierTab) return { rowType: "supplier", displayType: "client" };
      return { rowType: p, displayType: p };
    });
  }, [
    linkedClientSuppressClientTab,
    linkedSupplierSuppressSupplierTab,
    detailVisiblePartyTypes,
  ]);

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


  useEffect(() => {
    const clientLaneInMissionBar = missionBarPartyTypes.some((t) => t.rowType === "client");
    if (
      linkedClientSuppressClientTab &&
      liveConv.party_type === "client" &&
      !clientLaneInMissionBar
    ) {
      const s = partyConversationMap.supplier;
      const d = partyConversationMap.driver;
      if (s?.id) {
        chatStore.switchParty(liveConv.trip_id, "supplier");
        onSelectConversation(s.id);
        void markTripThreadsRead(liveConv.trip_id);
      } else if (d?.id) {
        chatStore.switchParty(liveConv.trip_id, "driver");
        onSelectConversation(d.id);
        void markTripThreadsRead(liveConv.trip_id);
      }
      return;
    }
    const supplierLaneInMissionBar = missionBarPartyTypes.some((t) => t.rowType === "supplier");
    if (
      linkedSupplierSuppressSupplierTab &&
      liveConv.party_type === "supplier" &&
      !supplierLaneInMissionBar
    ) {
      const c = partyConversationMap.client;
      const d = partyConversationMap.driver;
      if (c?.id) {
        chatStore.switchParty(liveConv.trip_id, "client");
        onSelectConversation(c.id);
        void markTripThreadsRead(liveConv.trip_id);
      } else if (d?.id) {
        chatStore.switchParty(liveConv.trip_id, "driver");
        onSelectConversation(d.id);
        void markTripThreadsRead(liveConv.trip_id);
      }
    }
  }, [
    linkedClientSuppressClientTab,
    linkedSupplierSuppressSupplierTab,
    missionBarPartyTypes,
    liveConv.trip_id,
    liveConv.party_type,
    partyConversationMap.supplier?.id,
    partyConversationMap.client?.id,
    partyConversationMap.driver?.id,
    onSelectConversation,
    markTripThreadsRead,
  ]);

  const missionDateLabel = formatTripRouteDate(liveConv.trip_created_at);

  const tripMeta = useTripMeta(liveConv.trip_id, currentOrgId, {
    partyType:        liveConv.party_type,
    conversationId: liveConv.id,
  });
  const paymentBalance = tripMeta?.payment_balance ?? null;

  const longHaulLiveEta = useChatStore((s) => s.trips[liveConv.trip_id]?.longHaulRevisedEta ?? null);
  const longHaulLiveHealth = useChatStore((s) => s.trips[liveConv.trip_id]?.longHaulHealthStatus ?? null);

  const primaryLateMessageId = useMemo(() => {
    for (const row of displayMessages) {
      if (isLongHaulLateChatMessage(row)) return row.id;
    }
    return null;
  }, [displayMessages]);

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
    if (String(m.conversation_id ?? "") !== liveConv.id) return null;
    // Tab visibility filter — zero DB calls; pure memory filter on party_type.
    // Ledger events only appear in Client/Supplier tabs; tracking in Driver tab.
    if (!isMessageVisibleInTab(m.message_type, liveConv.party_type)) return null;

    if (m.message_type === "tracking") {
      const trackLoc = parseMessageLocationData(m);
      if (trackLoc) {
        return (
          <LocationEventCard message={m} location={trackLoc} isMobile={!isDesktop} />
        );
      }
    }
    if (m.message_type === "status_change" || m.message_type === "image") {
      return (
        <SystemEventCard
          message={m}
          isOwn={isMessageFromSelf(m)}
          currentOrgId={currentOrgId}
          conversationPartyName={liveConv.party_name}
          onAddToBook={onAddToBook}
          onDispute={onDispute}
          financialViewerBlocked={!allowFinancialCards}
          hideLedgerActions={!allowLedgerActions}
          isMobile={!isDesktop}
        />
      );
    }
    if (m.message_type === "assignment_update") {
      return <ChatSystemEventCard message={m} isMobile={!isDesktop} />;
    }
    if (
      m.message_type === "system" ||
      m.message_type === "update" ||
      m.message_type === "system_log" ||
      m.message_type === "location_log"
    ) {
      if (isLongHaulLateChatMessage(m)) {
        if (primaryLateMessageId != null && m.id !== primaryLateMessageId) return null;
        return (
          <LateAlertCard
            message={m}
            liveRevisedEta={longHaulLiveEta}
            liveHealthStatus={longHaulLiveHealth}
          />
        );
      }
      const locData = parseMessageLocationData(m);
      if (locData) {
        // Driver sees their own pings as system updates on the business side — hide from their view.
        if (viewerIsDriver) return null;
        // Collapse consecutive ping runs: skip non-last pings; show last with count badge.
        const pingInfo = locationPingRunInfo.get(m.id);
        if (pingInfo && !pingInfo.isLast) return null;
        return (
          <LocationEventCard
            message={m}
            location={locData}
            isMobile={!isDesktop}
            consolidatedCount={pingInfo?.runCount ?? 1}
          />
        );
      }
      return <ChatSystemEventCard message={m} isMobile={!isDesktop} />;
    }
    if (
      m.message_type === "ledger_event" ||
      m.message_type === "ledger" ||
      m.message_type === "payment" ||
      m.message_type === "ledger_update"
    ) {
      if (!allowFinancialCards) return null;
      if (!ledgerEventInvolvesOrg(m, currentOrgId)) return null;
      return (
        <ChatLedgerEventCard
          message={m}
          currentOrgId={currentOrgId}
          conversationPartyName={liveConv.party_name}
          onAddToBook={onAddToBook}
          onDispute={onDispute}
          hideLedgerActions={!allowLedgerActions}
          isMobile={!isDesktop}
        />
      );
    }
    if (m.message_type === "document_share") {
      return <DocumentShareCard message={m} isOwn={isMessageFromSelf(m)} />;
    }
    if (m.message_type === "feedback_request" || m.message_type === "feedback") {
      if (viewerIsDriver) return null;
      if (!showFeedbackCardOnEligibleLane) return null;
      if (
        !tripFeedbackRequestMatchesConversation(m, liveConv, {
          client_id: clientId,
          supplier_id: supplierId,
          driver_id: driverId,
        })
      ) {
        return null;
      }
      const completionKnownInLane =
        tripEligibleForFeedback ||
        tripMessageHistoryHasCompletedStatus(liveConv.messages) ||
        tripMessageHistoryHasCompletedStatus(displayMessages);
      if (!completionKnownInLane) return null;
      if (!indentAllowsInChatFeedbackDebrief(liveConv, tripEligibleForFeedback)) return null;
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
    const own = isMessageFromSelf(m);
    const peerLabel =
      m.sender_name?.trim() ||
      (m.sender_role === "dispatcher"
        ? "Dispatcher"
        : m.sender_role === "client"
          ? "Client"
          : m.sender_role === "supplier"
            ? "Supplier"
            : m.sender_role === "driver"
              ? "Driver"
              : "Partner");
    let onAvatarPress: (() => void) | undefined;
    if (!own) {
      if (m.sender_role === "client" && clientId) {
        onAvatarPress = () => router.push(`/public-profile/client/${clientId}`);
      } else if (m.sender_role === "supplier" && supplierId) {
        onAvatarPress = () => router.push(`/public-profile/supplier/${supplierId}`);
      } else if (m.sender_role === "driver" && driverId) {
        onAvatarPress = () => router.push(`/public-profile/driver/${driverId}`);
      }
    }
    return (
      <ChatBubble
        isOwn={own}
        content={m.content}
        timestamp={m.created_at}
        senderName={own ? undefined : peerLabel}
        avatarSeed={own ? undefined : m.sender_avatar_seed}
        deliveryStatus={own ? resolveOutgoingDeliveryStatus(m) : undefined}
        isNew={Date.parse(m.created_at) > mountedAtMs}
        isMobile={!isDesktop}
        onAvatarPress={onAvatarPress}
      />
    );
  }, [
    router,
    currentOrgId,
    liveConv,
    isDesktop,
    viewerIsDriver,
    allowFinancialCards,
    allowLedgerActions,
    showFeedbackCardOnEligibleLane,
    tripEligibleForFeedback,
    onAddToBook,
    onDispute,
    handleFeedbackSubmitted,
    mountedAtMs,
    isMessageFromSelf,
    longHaulLiveEta,
    longHaulLiveHealth,
    primaryLateMessageId,
    displayMessages,
    clientId,
    supplierId,
    driverId,
    locationPingRunInfo,
  ]);

  const indentShipperDisplayName = useMemo(() => {
    const fromConv = (liveConv.indent_creator_organization_name ?? "").trim();
    if (fromConv) return fromConv;
    return (liveTripEntry?.indentCreatorOrganizationName ?? "").trim();
  }, [
    liveConv.indent_creator_organization_name,
    liveTripEntry?.indentCreatorOrganizationName,
  ]);
  const supplierFleetOwnsTrip =
    String(currentOrgId ?? "").trim() === String(liveConv.trip_organization_id ?? "").trim();

  // When viewer is linked supplier viewing the supplier lane, that lane IS their CLIENT
  // channel (with the indent owner / shipper). Prefer bootstrap indent_creator_organization_name
  // (same trip_number peer with indent) when mirror trip omits indent_id.
  const chatDetailSubtitle =
    linkedSupplierSuppressSupplierTab && liveConv.party_type === "supplier"
      ? (formatChatPartyName(
          indentShipperDisplayName || liveConv.trip_organization_name || null,
        ) ?? undefined)
      : formatChatPartyName(liveConv.party_name) ?? undefined;

  const viewerRelativeConvPartyLabel =
    linkedSupplierSuppressSupplierTab && liveConv.party_type === "supplier"
      ? "CLIENT"
      : partyLabel(liveConv.party_type);

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

  const headerCounterparty = resolveCounterpartyPartyTypeForViewer(
    liveTripEntry,
    currentOrgId,
    liveConv.party_type,
  );

  const { keyboardVisible: keyboardOpen } = useKeyboardVisible();
  useEffect(() => {
    if (isDesktop || !keyboardOpen) return;
    const delay = Platform.OS === "ios" ? 80 : Platform.OS === "web" ? 50 : 120;
    const t = setTimeout(
      () => messagesRef.current?.scrollToEnd({ animated: true }),
      delay,
    );
    return () => clearTimeout(t);
  }, [isDesktop, keyboardOpen, messagesRef]);

  const missionBar = (
      <View style={[s.detailMissionBar, !isDesktop && s.detailMissionBarMobile]}>
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
        {allowFinancialCards &&
          paymentBalance != null &&
          (liveConv.party_type === 'client' || liveConv.party_type === 'supplier') ? (
          <View style={s.detailMissionUnread}>
            <Text style={s.detailMissionUnreadText}>
              {paymentBalance >= 0 ? '+' : '−'}₹{Math.abs(paymentBalance).toLocaleString('en-IN')}
            </Text>
          </View>
        ) : null}
        {missionBarPartyTypes.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[
              s.detailMissionTabsScroller,
              !isDesktop && s.detailMissionTabsScrollerMobile,
            ]}
            contentContainerStyle={s.detailPartyTabs}
          >
            {missionBarPartyTypes.map((tab) => {
              const on = liveConv.party_type === tab.rowType;
              const hasConversation = Boolean(partyConversationMap[tab.rowType]);
              const relabeledClientTab = tab.displayType !== tab.rowType;
              const partyLine = relabeledClientTab
                ? formatChatPartyName(
                    indentShipperDisplayName || liveConv.trip_organization_name || null,
                  )
                : tab.rowType === "client" &&
                    supplierFleetOwnsTrip &&
                    indentShipperDisplayName
                  ? formatChatPartyName(indentShipperDisplayName)
                  : formatChatPartyName(displayPartyName(tab.rowType));
              return (
                <TouchableOpacity
                  key={tab.displayType}
                  style={[
                    s.detailPartyTab,
                    on && s.detailPartyTabOn,
                    !hasConversation && s.detailPartyTabOff,
                  ]}
                  onPress={() => { void switchConversation(tab.rowType); }}
                  activeOpacity={0.82}
                >
                  {partyTabIcon(tab.displayType, on)}
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
                      {partyLabel(tab.displayType)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
  );

  return (
    <ChatConversationLayout
      isDesktop={isDesktop}
      header={
        <>
          <ChatDetailHeader
            title={`${getConversationTripLabel(liveConv)} · ${viewerRelativeConvPartyLabel}`}
            subtitle={chatDetailSubtitle}
            partyType={liveConv.party_type}
            counterpartyType={headerCounterparty}
            isDesktop={isDesktop}
            onCloseDetail={onCloseDetail}
          />
          {missionBar}
        </>
      }
      messages={
      <FlatList
        ref={messagesRef}
        style={s.msgs}
        contentContainerStyle={[s.msgsContent, !isDesktop && s.msgsContentMobile]}
        data={displayMessages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        extraData={liveConv}
        getItemLayout={isDesktop ? getMessageItemLayout : undefined}
        removeClippedSubviews={Platform.OS === "android"}
        windowSize={9}
        maxToRenderPerBatch={12}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onViewableItemsChanged={stableOnViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onContentSizeChange={onMessagesContentSizeChange}
        onStartReached={displayMessages.length > 0 ? onStartReachedLoadOlder : undefined}
        onStartReachedThreshold={0.12}
        ListHeaderComponent={
          <>
            <ChatSystemMsg
              label={`${liveConv.pickup_area} → ${liveConv.drop_location} · Today`}
              isMobile={!isDesktop}
            />
            {loadingOlder ? (
              <View style={{ paddingVertical: 10, alignItems: "center" }}>
                <LoadingIndicator size="small" color={CHAT_ACCENT} />
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
              historyLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 32 }}>
                  <LoadingIndicator size="small" color={CHAT_ACCENT} />
                </View>
              ) : (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                  <Text style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
                    No messages yet
                  </Text>
                  {historyError ? (
                    <Text style={{ fontSize: 12, color: "#b91c1c", textAlign: "center", paddingHorizontal: 20, lineHeight: 17, fontWeight: "600" }}>
                      {historyError}
                    </Text>
                  ) : null}
                </View>
              )
            )}
          </>
        }
        ListFooterComponent={(() => {
          const laneType = liveConv.party_type as "supplier" | "client" | "driver";
          const laneId = laneType === "supplier" ? supplierId : laneType === "client" ? clientId : null;
          const streamHasFeedbackCard = displayMessages.some(
            (m) => m.message_type === "feedback_request" || m.message_type === "feedback",
          );
          const showFooterFeedback =
            !streamHasFeedbackCard &&
            !viewerIsDriver &&
            tripIsIntegrated &&
            showFeedbackCardOnEligibleLane &&
            tripEligibleForFeedback &&
            Boolean(laneId) &&
            indentAllowsInChatFeedbackDebrief(liveConv, tripEligibleForFeedback);
          if (!showFooterFeedback) return null;
          const existingRating = tripRatings.find(
            (r) => r.rated_type === laneType && String(r.rated_id) === String(laneId),
          );
          const alreadyRated = Boolean(existingRating) || footerFeedbackPhase === "done";
          const partyLabel = laneType === "supplier" ? "supplier" : "client";
          const SMILEYS = [
            { emoji: "😠", score: 1 }, { emoji: "😟", score: 2 },
            { emoji: "😐", score: 3 }, { emoji: "🙂", score: 4 }, { emoji: "🤩", score: 5 },
          ];
          return (
            <View style={{ marginHorizontal: 12, marginBottom: 16, marginTop: 8, padding: 14, borderRadius: 16, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" }}>
              {alreadyRated ? (
                <View style={{ alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 22 }}>
                    {SMILEYS.find((s) => s.score === (existingRating?.score ?? footerFeedbackScore))?.emoji ?? "🙂"}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#1e293b" }}>Thanks for your feedback!</Text>
                  <Text style={{ fontSize: 11, color: "#64748b" }}>Your {partyLabel} rating has been saved.</Text>
                </View>
              ) : footerFeedbackPhase === "submitting" ? (
                <View style={{ alignItems: "center", paddingVertical: 8 }}>
                  <LoadingIndicator size="small" color={CHAT_ACCENT} />
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#1e293b", textAlign: "center" }}>
                    How was your experience with this {partyLabel}?
                  </Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
                    {SMILEYS.map(({ emoji, score }) => (
                      <TouchableOpacity
                        key={score}
                        onPress={() => { void onSubmitFooterFeedback(score); }}
                        activeOpacity={0.75}
                        style={{ alignItems: "center", padding: 6 }}
                      >
                        <Text style={{ fontSize: 26 }}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })()}
      />
      }
      inputBar={
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
          compact={keyboardOpen}
          minimalChrome={!isDesktop}
        />
      }
    />
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
  const { keyboardVisible: keyboardOpen } = useKeyboardVisible();

  if (!selectedNet) return <EmptyDetail />;
  return (
    <ChatConversationLayout
      isDesktop={isDesktop}
      header={
        <ChatDetailHeader
          title={selectedNet.partnerName}
          subtitle={formatChatPartyName(selectedNet.organization) ?? undefined}
          isDesktop={isDesktop}
          onCloseDetail={onCloseDetail}
        />
      }
      messages={
        <FlatList
          ref={messagesRef}
          style={s.msgs}
          contentContainerStyle={[s.msgsContent, !isDesktop && s.msgsContentMobile]}
          data={selectedNet.messages}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          renderItem={({ item: m }) => (
            <ChatBubble
              isOwn={m.senderId === "dispatcher-1"}
              content={m.content}
              timestamp={m.timestamp}
              senderName={m.senderId !== "dispatcher-1" ? selectedNet.partnerName : undefined}
              isMobile={!isDesktop}
            />
          )}
          ListHeaderComponent={
            <ChatSystemMsg
              label="Secure channel · Today"
              isMobile={!isDesktop}
            />
          }
          onContentSizeChange={() => messagesRef.current?.scrollToEnd({ animated: false })}
        />
      }
      inputBar={
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
          compact={keyboardOpen}
          minimalChrome={!isDesktop}
        />
      }
    />
  );
}
