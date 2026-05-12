import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ChevronRight, MapPin, Radio, Reply, Star } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import { useChatStore, type TripEntry } from "@/features/chat/store/useChatStore";
import {
  isTerminalTripStatus,
  isTripFeedbackEligibleStatus,
} from "@/features/chat/utils/tripConversationSort";
import { isLedgerLikeMessageType } from "@/features/chat/utils/messagePartyVisibility";
import { computeLaneLedgerBalance } from "@/features/chat/utils/ledgerVisibility.util";
import { tripHasPendingOrgFeedback } from "@/features/chat/utils/tripFeedbackPending.util";
import { PRIORITY_WEIGHT_LONG_HAUL_LATE } from "@/lib/globalSync/priorityEngine.util";
import { useGlobalSyncStore } from "@/lib/globalSync/useGlobalSyncStore";
import {
  activeTripIslandSignalTs,
  rankActiveTripsForIsland,
} from "@/lib/globalSync/activeTripIslandRanking.util";
import type { ActiveTripRecentEvent, ActiveTripSummary } from "@/lib/globalSync/types";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PREVIEW_TYPES = new Set([
  "system_log",
  "location_log",
  "ledger_event",
  "ledger",
  "payment",
  "ledger_update",
  "assignment_update",
  "document_upload",
  "system",
  "update",
]);

type IslandMode = "live_ops" | "commercial";

function parseTsSafe(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function commercialDeckFromTrips(
  trips: Record<string, TripEntry>,
  onlyTripId?: string | null,
): ActiveTripSummary[] {
  const entries: TripEntry[] = (() => {
    const tid = (onlyTripId ?? "").trim();
    if (tid) {
      const one = trips[tid];
      return one ? [one] : [];
    }
    return Object.values(trips);
  })();
  const rows: { sortKey: number; trip: ActiveTripSummary }[] = [];
  for (const entry of entries) {
    const ledgers = entry.event_stream.filter((e) => isLedgerLikeMessageType(String(e.message_type)));
    if (!ledgers.length) continue;
    const last = ledgers[ledgers.length - 1]!;
    const sortKey = parseTsSafe(last.created_at);
    const recent_events: ActiveTripRecentEvent[] = ledgers.slice(-3).map((e) => ({
      id: String(e.id),
      content: e.content ?? "",
      message_type: String(e.message_type),
      sender_role: e.sender_role ?? "",
      sender_name: e.sender_name ?? "",
      created_at: e.created_at,
      metadata: e.metadata,
    }));
    const lastLoc =
      entry.lastLat != null && entry.lastLng != null && entry.lastLocationAt
        ? {
            lat: entry.lastLat,
            lng: entry.lastLng,
            address_name: entry.lastLocationLabel ?? null,
            recorded_at: entry.lastLocationAt,
          }
        : null;
    rows.push({
      sortKey,
      trip: {
        trip_id: entry.tripId,
        trip_number: entry.tripNumber,
        display_trip_id: entry.displayTripId,
        status: entry.status ?? "active",
        pickup_area: entry.pickupArea,
        drop_location: entry.dropLocation,
        driver_display_name: entry.driverDisplayName,
        vehicle_display_number: entry.vehicleDisplayNumber,
        driver_id: entry.driverId,
        supplier_id: entry.supplierId,
        client_id: null,
        created_at: entry.createdAt ?? new Date().toISOString(),
        total_unread: entry.totalUnread,
        recent_events,
        last_known_location: lastLoc,
      },
    });
  }
  rows.sort((a, b) => b.sortKey - a.sortKey);
  return rows.map((r) => r.trip);
}

function islandSignalTs(trip: ActiveTripSummary, mode: IslandMode): number {
  if (mode === "commercial") {
    let max = parseTsSafe(trip.last_known_location?.recorded_at);
    for (const e of trip.recent_events ?? []) {
      const ts = parseTsSafe(e.created_at);
      if (ts > max) max = ts;
    }
    return max;
  }
  return activeTripIslandSignalTs(trip);
}

function commercialSubtitle(trip: ActiveTripSummary, laneBalanceInr: number | null): string {
  if (laneBalanceInr != null && Number.isFinite(laneBalanceInr)) {
    const sign = laneBalanceInr >= 0 ? "" : "−";
    return `This lane: ${sign}₹${Math.abs(Math.round(laneBalanceInr)).toLocaleString("en-IN")}`;
  }
  const evs = trip.recent_events ?? [];
  const ev = evs[evs.length - 1];
  if (!ev) return "Payments & ledger — open chat for detail";
  const rel = formatRelativeShort(ev.created_at);
  const c = ev.content?.trim() || ev.message_type;
  return `${c} · ${rel}`;
}

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function formatRelativeShort(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function locationSubtitle(trip: ActiveTripSummary, globalTrip: ActiveTripSummary | null | undefined): string {
  const loc = trip.last_known_location;
  const odo = globalTrip?.last_heartbeat_odometer_km;
  const odoAt = globalTrip?.last_heartbeat_recorded_at;
  const parts: string[] = [];
  if (loc) {
    const rel = formatRelativeShort(loc.recorded_at);
    const label = (loc.address_name ?? "").trim();
    parts.push(label ? `${label} · ${rel}` : `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} · ${rel}`);
  }
  if (odo != null && Number.isFinite(odo)) {
    const orel = odoAt ? formatRelativeShort(odoAt) : "";
    parts.push(
      `Odometer ${odo.toLocaleString("en-IN", { maximumFractionDigits: 0 })} km${orel ? ` · ${orel}` : ""}`,
    );
  }
  if (parts.length === 0) return "Location pending next driver ping";
  return parts.join(" · ");
}

function pickQuickEvents(events: ActiveTripRecentEvent[] | undefined): ActiveTripRecentEvent[] {
  if (!events?.length) return [];
  const hits = events.filter((e) => PREVIEW_TYPES.has(e.message_type));
  const pool = hits.length ? hits : events;
  return pool.slice(-3);
}

export interface DynamicTripIslandProps {
  /** Currently open trip — used to label context, not for data fetch. */
  currentTripId: string;
  /** Wide chat layout: island is redundant with header + mission bar — skip work and render nothing. */
  isDesktop?: boolean;
  onNavigateTrip: (tripId: string) => void;
  onReplyShortcut?: () => void;
}

/**
 * Floating “Dynamic Status” card: glass stack, Reanimated enter + location bounce,
 * swipe between trips. Toggle **Live ops** (late drivers / location) vs **Commercial**
 * (ledger / payments from chat store). Tap to expand quick previews + Reply.
 */
export function DynamicTripIsland({
  currentTripId,
  isDesktop = false,
  onNavigateTrip,
  onReplyShortcut,
}: DynamicTripIslandProps) {
  const { width: screenW } = useWindowDimensions();
  const org = useOptionalOrganization();
  const auth = useOptionalAuth();
  const orgId = org?.currentOrganization?.id ?? null;
  const isDriverUser = auth?.profile?.role === "driver";
  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);
  const clientRibbon = useGlobalSyncStore((s) => s.clientOperationsRibbon);
  const { chatTrips, pendingTripFeedback } = useChatStore(
    useShallow((s) => {
      const trips = s.trips;
      return {
        chatTrips: trips,
        pendingTripFeedback: tripHasPendingOrgFeedback(trips, currentTripId, orgId),
      };
    }),
  );
  const activeParties = useChatStore((s) => s.activeParties);
  const chatEntryForCurrent = currentTripId ? chatTrips[currentTripId] : undefined;
  const completedNeedsRate =
    Boolean(
      orgId &&
        currentTripId &&
        chatEntryForCurrent &&
        isTripFeedbackEligibleStatus(chatEntryForCurrent.status) &&
        tripHasPendingOrgFeedback(chatTrips, currentTripId, orgId),
    );

  const ranked = useMemo(() => {
    if (isDesktop) return [];
    const byId = new Map<string, ActiveTripSummary>();
    for (const t of activeTrips) {
      if (!isTerminalTripStatus(t.status)) byId.set(t.trip_id, t);
    }
    for (const t of activeTrips) {
      if (
        isTripFeedbackEligibleStatus(t.status) &&
        orgId &&
        tripHasPendingOrgFeedback(chatTrips, t.trip_id, orgId) &&
        !byId.has(t.trip_id)
      ) {
        byId.set(t.trip_id, t);
      }
    }
    const ct = (currentTripId ?? "").trim();
    if (ct && orgId && completedNeedsRate && chatEntryForCurrent && !byId.has(ct)) {
      byId.set(ct, {
        trip_id:                 chatEntryForCurrent.tripId,
        trip_number:             chatEntryForCurrent.tripNumber,
        display_trip_id:         chatEntryForCurrent.displayTripId,
        status:                  chatEntryForCurrent.status ?? "completed",
        pickup_area:             chatEntryForCurrent.pickupArea,
        drop_location:           chatEntryForCurrent.dropLocation,
        driver_display_name:     chatEntryForCurrent.driverDisplayName,
        vehicle_display_number:  chatEntryForCurrent.vehicleDisplayNumber,
        driver_id:               chatEntryForCurrent.driverId,
        supplier_id:             chatEntryForCurrent.supplierId,
        client_id:               null,
        created_at:              chatEntryForCurrent.createdAt ?? new Date().toISOString(),
        total_unread:            chatEntryForCurrent.totalUnread,
        recent_events:           [],
      });
    }
    const sorted = rankActiveTripsForIsland([...byId.values()]);
    if (!orgId) return sorted;
    // Drop terminal trips once this org has no pending debrief (rated / not applicable).
    return sorted.filter(
      (t) =>
        !isTerminalTripStatus(t.status) ||
        tripHasPendingOrgFeedback(chatTrips, t.trip_id, orgId),
    );
  }, [
    isDesktop,
    activeTrips,
    orgId,
    currentTripId,
    completedNeedsRate,
    chatEntryForCurrent,
    chatTrips,
  ]);

  /** In trip chat detail, only the open trip may appear on the island (prevents cross-trip cards). */
  const rankedScoped = useMemo(() => {
    const ct = (currentTripId ?? "").trim();
    if (!ct) return ranked;
    const sub = ranked.filter((t) => t.trip_id === ct);
    if (sub.length) return sub;
    const g = activeTrips.find((t) => t.trip_id === ct);
    if (g) return [g];
    if (!chatEntryForCurrent) return [];
    const lastLoc =
      chatEntryForCurrent.lastLat != null &&
      chatEntryForCurrent.lastLng != null &&
      chatEntryForCurrent.lastLocationAt
        ? {
            lat: chatEntryForCurrent.lastLat,
            lng: chatEntryForCurrent.lastLng,
            address_name: chatEntryForCurrent.lastLocationLabel ?? null,
            recorded_at: chatEntryForCurrent.lastLocationAt,
          }
        : null;
    const tail = chatEntryForCurrent.event_stream.slice(-6);
    const recent_events: ActiveTripRecentEvent[] = tail.map((e) => ({
      id: String(e.id),
      content: e.content ?? "",
      message_type: String(e.message_type),
      sender_role: e.sender_role ?? "",
      sender_name: e.sender_name ?? "",
      created_at: e.created_at,
      metadata: e.metadata,
    }));
    return [
      {
        trip_id: ct,
        trip_number: chatEntryForCurrent.tripNumber,
        display_trip_id: chatEntryForCurrent.displayTripId,
        status: chatEntryForCurrent.status ?? "active",
        pickup_area: chatEntryForCurrent.pickupArea,
        drop_location: chatEntryForCurrent.dropLocation,
        driver_display_name: chatEntryForCurrent.driverDisplayName,
        vehicle_display_number: chatEntryForCurrent.vehicleDisplayNumber,
        driver_id: chatEntryForCurrent.driverId,
        supplier_id: chatEntryForCurrent.supplierId,
        client_id: null,
        created_at: chatEntryForCurrent.createdAt ?? new Date().toISOString(),
        total_unread: chatEntryForCurrent.totalUnread,
        recent_events,
        last_known_location: lastLoc,
      },
    ];
  }, [ranked, currentTripId, activeTrips, chatEntryForCurrent]);

  const laneBalanceForIsland = useMemo(() => {
    if (!orgId) return null as number | null;
    const ct = (currentTripId ?? "").trim();
    if (!ct) return null;
    const st = useChatStore.getState();
    const entry = chatTrips[ct];
    if (!entry) return null;
    const party = activeParties[ct] ?? "client";
    const cid = st.getConversationId(ct, party);
    return computeLaneLedgerBalance(entry.event_stream, orgId, party, cid);
  }, [chatTrips, orgId, currentTripId, activeParties]);

  const commercialDeck = useMemo(
    () => commercialDeckFromTrips(chatTrips, currentTripId),
    [chatTrips, currentTripId],
  );
  const [islandMode, setIslandMode] = useState<IslandMode>("live_ops");
  const deck = islandMode === "live_ops" ? rankedScoped : commercialDeck;

  useEffect(() => {
    if (auth?.profile?.role === "driver") setIslandMode("live_ops");
    else if (auth?.profile?.role) setIslandMode("commercial");
  }, [auth?.profile?.role]);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const prevTopIdRef = useRef<string | null>(null);

  const topDeckId = deck[0]?.trip_id ?? null;
  useEffect(() => {
    if (topDeckId && prevTopIdRef.current !== topDeckId) {
      setSwipeOffset(0);
    }
    prevTopIdRef.current = topDeckId;
  }, [topDeckId]);

  useEffect(() => {
    setSwipeOffset(0);
    setExpanded(false);
  }, [islandMode]);

  const n = deck.length;
  const displayIndex = n > 0 ? ((swipeOffset % n) + n) % n : 0;
  const trip = deck[displayIndex];

  const globalTripPatch = useMemo(() => {
    if (!trip) return null;
    return activeTrips.find((t) => t.trip_id === trip.trip_id) ?? null;
  }, [activeTrips, trip?.trip_id]);

  const enterY = useSharedValue(-28);
  const enterOpacity = useSharedValue(0);
  const expandProgress = useSharedValue(0);
  const bounce = useSharedValue(1);
  const pulse = useSharedValue(1);

  const locBounceKey = trip
    ? `${trip.trip_id}:${trip.last_known_location?.recorded_at ?? ""}:${trip.last_known_location?.lat ?? ""}:${globalTripPatch?.last_heartbeat_odometer_km ?? ""}:${globalTripPatch?.last_heartbeat_recorded_at ?? ""}`
    : "";

  useEffect(() => {
    enterY.value = withSpring(0, { damping: 22, stiffness: 200 });
    enterOpacity.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [enterOpacity, enterY]);

  const prevLocKey = useRef<string>("");
  useEffect(() => {
    if (!locBounceKey || locBounceKey === prevLocKey.current) return;
    prevLocKey.current = locBounceKey;
    bounce.value = withSequence(
      withTiming(1.05, { duration: 140, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 14, stiffness: 220 }),
    );
  }, [bounce, locBounceKey]);

  useEffect(() => {
    cancelAnimation(pulse);
    const unread = (trip?.total_unread ?? 0) > 0;
    const ratePulse =
      Boolean(trip && trip.trip_id === currentTripId && pendingTripFeedback);
    if (!unread && !ratePulse) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [pulse, trip?.total_unread, trip?.trip_id, trip, currentTripId, pendingTripFeedback]);

  useEffect(() => {
    expandProgress.value = withSpring(expanded ? 1 : 0, { damping: 20, stiffness: 200 });
  }, [expandProgress, expanded]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ translateY: enterY.value }, { scale: bounce.value }],
  }));

  const pulseDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: interpolate(pulse.value, [1, 1.12], [0.75, 1]),
  }));

  const quickPreviewStyle = useAnimatedStyle(() => ({
    opacity: expandProgress.value,
    maxHeight: interpolate(expandProgress.value, [0, 1], [0, 160]),
    marginTop: interpolate(expandProgress.value, [0, 1], [0, 10]),
  }));

  const cycle = useCallback(
    (dir: 1 | -1) => {
      if (n <= 1) return;
      setSwipeOffset((o) => o + dir);
    },
    [n],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-18, 18])
        .onEnd((e) => {
          const x = e.translationX;
          if (x < -48) runOnJS(cycle)(1);
          else if (x > 48) runOnJS(cycle)(-1);
        }),
    [cycle],
  );

  const toggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  }, []);

  const quickEvents = useMemo(() => {
    if (islandMode === "commercial") {
      const evs = trip?.recent_events ?? [];
      return evs.length ? evs.slice(-3) : [];
    }
    return pickQuickEvents(trip?.recent_events);
  }, [islandMode, trip?.recent_events]);

  const cardW = Math.min(400, screenW - 24);

  if (islandMode === "commercial" && commercialDeck.length === 0) {
    return (
      <Animated.View
        style={[styles.wrap, { maxWidth: cardW }, cardAnimStyle]}
        pointerEvents="box-none"
      >
        <View style={styles.pressInner}>
          <LinearGradient
            colors={["rgba(254,243,199,0.95)", "rgba(253,230,138,0.85)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.glassBorder} pointerEvents="none" />
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setIslandMode("live_ops")}
              hitSlop={6}
              style={styles.modePill}
            >
              <Text style={styles.modePillText}>Live ops</Text>
            </Pressable>
            <Pressable onPress={() => setIslandMode("commercial")} hitSlop={6} style={[styles.modePill, styles.modePillOn]}>
              <Text style={[styles.modePillText, styles.modePillTextOn]}>Commercial</Text>
            </Pressable>
          </View>
          <Text style={styles.emptyCommercialText}>
            No payment or ledger activity in loaded trips yet.
          </Text>
        </View>
      </Animated.View>
    );
  }

  if (!trip || n === 0) return null;

  const unread = trip.total_unread > 0;
  const isContextTrip = trip.trip_id === currentTripId;
  const showRatePulse = isContextTrip && pendingTripFeedback;
  const signalTs = islandSignalTs(trip, islandMode);
  const longHaulLateForTrip =
    islandMode === "live_ops" &&
    Boolean(
      clientRibbon &&
        clientRibbon.trip_id === trip.trip_id &&
        clientRibbon.priority_weight >= PRIORITY_WEIGHT_LONG_HAUL_LATE - 1,
    );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.wrap, { maxWidth: cardW }, cardAnimStyle]}
        pointerEvents="box-none"
      >
        <View style={styles.pressInner}>
          <LinearGradient
            colors={
              islandMode === "commercial"
                ? ["rgba(254,243,199,0.95)", "rgba(253,230,138,0.85)"]
                : longHaulLateForTrip
                  ? ["rgba(254,226,226,0.95)", "rgba(254,202,202,0.88)"]
                  : ["rgba(255,255,255,0.88)", "rgba(241,245,249,0.78)"]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.glassBorder} pointerEvents="none" />
          <Pressable onPress={toggleExpand} style={styles.expandTap}>
          <View style={styles.rowTop}>
            <View style={styles.pulseCol}>
              <Animated.View style={[styles.pulseRing, pulseDotStyle]}>
                <Radio
                  size={14}
                  color={
                    longHaulLateForTrip
                      ? "#dc2626"
                      : islandMode === "commercial" && unread
                        ? "#b45309"
                        : unread || showRatePulse
                          ? CHAT_ACCENT
                          : Theme.textSecondary
                  }
                />
              </Animated.View>
            </View>
            <View style={styles.titleBlock}>
              <View style={styles.modeRow}>
                <Pressable
                  onPress={() => {
                    setIslandMode("live_ops");
                    setSwipeOffset(0);
                    setExpanded(false);
                  }}
                  hitSlop={6}
                  style={[styles.modePill, islandMode === "live_ops" && styles.modePillOn]}
                >
                  <Text style={[styles.modePillText, islandMode === "live_ops" && styles.modePillTextOn]}>
                    Live ops
                  </Text>
                </Pressable>
                {!isDriverUser ? (
                  <Pressable
                    onPress={() => {
                      setIslandMode("commercial");
                      setSwipeOffset(0);
                      setExpanded(false);
                    }}
                    hitSlop={6}
                    style={[styles.modePill, islandMode === "commercial" && styles.modePillOn]}
                  >
                    <Text
                      style={[styles.modePillText, islandMode === "commercial" && styles.modePillTextOn]}
                    >
                      Commercial
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {longHaulLateForTrip ? (
                <Text style={styles.latePill} numberOfLines={1}>
                  ⏳ LATE · {trip.display_trip_id?.trim() || trip.trip_number}
                </Text>
              ) : null}
              <Text style={styles.title} numberOfLines={1}>
                {trip.display_trip_id?.trim() || trip.trip_number}
                {isContextTrip ? " · this trip" : ""}
              </Text>
            </View>
            <View style={styles.swipeHint}>
              <Text style={styles.swipeHintText}>
                {n > 1 ? `${displayIndex + 1}/${n}` : " "}
              </Text>
              <ChevronRight size={16} color={Theme.textSecondary} />
            </View>
          </View>

          <View style={styles.routeRow}>
            <MapPin size={14} color={CHAT_ACCENT} style={{ marginTop: 1 }} />
            <Text style={styles.route} numberOfLines={2}>
              {trip.pickup_area} → {trip.drop_location}
            </Text>
          </View>

          <Text style={styles.locLine} numberOfLines={2}>
            {islandMode === "commercial"
              ? commercialSubtitle(trip, laneBalanceForIsland)
              : locationSubtitle(trip, globalTripPatch)}
          </Text>
          {showRatePulse ? (
            <Text style={styles.rateHint} numberOfLines={2}>
              Trip completed — rate your partner in chat.
            </Text>
          ) : null}
          {signalTs > 0 ? (
            <Text style={styles.metaMuted}>
              Signal {formatRelativeShort(new Date(signalTs).toISOString())}
            </Text>
          ) : null}
          </Pressable>

          <Animated.View style={[styles.quickBlock, quickPreviewStyle]} pointerEvents={expanded ? "auto" : "none"}>
            {quickEvents.map((ev) => (
              <View key={ev.id} style={styles.quickRow}>
                <Text style={styles.quickType}>{ev.message_type}</Text>
                <Text style={styles.quickContent} numberOfLines={1}>
                  {ev.content?.trim() || "—"}
                </Text>
                <Text style={styles.quickTime}>{formatShortTime(ev.created_at)}</Text>
              </View>
            ))}
            <Pressable
              style={[styles.replyBtn, showRatePulse && styles.rateTripBtn]}
              onPress={() => {
                onNavigateTrip(trip.trip_id);
                onReplyShortcut?.();
              }}
              hitSlop={8}
              accessibilityLabel={showRatePulse ? "Rate trip" : "Reply"}
            >
              {showRatePulse ? (
                <>
                  <Star size={16} color="#fff" fill="#fbbf24" strokeWidth={2} />
                  <Text style={styles.replyBtnText}>Rate trip</Text>
                </>
              ) : (
                <>
                  <Reply size={16} color="#fff" />
                  <Text style={styles.replyBtnText}>Reply</Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    width: "100%",
    marginTop: 4,
    marginBottom: 10,
    marginHorizontal: 12,
    zIndex: 4,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  pressInner: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  expandTap: {
    borderRadius: 12,
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.65)",
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pulseCol: { width: 28, alignItems: "center" },
  pulseRing: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(26,35,126,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: { flex: 1, minWidth: 0 },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "rgba(15,23,42,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
  },
  modePillOn: {
    backgroundColor: "rgba(26,35,126,0.12)",
    borderColor: CHAT_ACCENT,
  },
  modePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 0.2,
  },
  modePillTextOn: {
    color: CHAT_ACCENT,
  },
  emptyCommercialText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textBody,
    lineHeight: 18,
  },
  latePill: {
    fontSize: 12,
    fontWeight: "800",
    color: "#b91c1c",
    marginTop: 2,
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textPrimary,
    letterSpacing: -0.3,
  },
  swipeHint: { flexDirection: "row", alignItems: "center", gap: 2 },
  swipeHintText: { fontSize: 11, color: Theme.textSecondary, fontWeight: "700" },
  routeRow: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "flex-start" },
  route: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textBody,
    lineHeight: 18,
  },
  locLine: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textRouteCard,
    lineHeight: 17,
  },
  rateHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "800",
    color: CHAT_ACCENT,
    lineHeight: 17,
  },
  metaMuted: {
    marginTop: 4,
    fontSize: 11,
    color: Theme.textSecondary,
    fontWeight: "600",
  },
  quickBlock: {
    overflow: "hidden",
  },
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderMedium,
  },
  quickType: {
    width: 96,
    fontSize: 10,
    fontWeight: "800",
    color: CHAT_ACCENT,
    textTransform: "uppercase",
  },
  quickContent: { flex: 1, fontSize: 12, color: Theme.textPrimary, fontWeight: "600" },
  quickTime: { fontSize: 10, color: Theme.textSecondary, fontWeight: "700" },
  replyBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: CHAT_ACCENT,
    paddingVertical: 11,
    borderRadius: 14,
  },
  rateTripBtn: {
    backgroundColor: "#15803d",
  },
  replyBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
