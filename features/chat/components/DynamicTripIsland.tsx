import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ChevronRight, MapPin, Radio, Reply } from "lucide-react-native";
import Theme from "@/constants/Theme";
import { CHAT_ACCENT } from "@/features/chat/chatTheme";
import { isTerminalTripStatus } from "@/features/chat/utils/tripConversationSort";
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
  "ledger_event",
  "ledger",
  "payment",
  "ledger_update",
  "assignment_update",
  "document_upload",
  "system",
  "update",
]);

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

function locationSubtitle(trip: ActiveTripSummary): string {
  const loc = trip.last_known_location;
  if (!loc) return "Location pending next driver ping";
  const rel = formatRelativeShort(loc.recorded_at);
  const label = (loc.address_name ?? "").trim();
  if (label) return `${label} · ${rel}`;
  return `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} · ${rel}`;
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
  onNavigateTrip: (tripId: string) => void;
  onReplyShortcut?: () => void;
}

/**
 * Floating “Dynamic Status” card: glass stack, Reanimated enter + location bounce,
 * swipe between ranked active trips, tap for last 3 log-style events + Reply (store-only).
 */
export function DynamicTripIsland({
  currentTripId,
  onNavigateTrip,
  onReplyShortcut,
}: DynamicTripIslandProps) {
  const { width: screenW } = useWindowDimensions();
  const activeTrips = useGlobalSyncStore((s) => s.activeTrips);

  const ranked = useMemo(
    () => rankActiveTripsForIsland(activeTrips.filter((t) => !isTerminalTripStatus(t.status))),
    [activeTrips],
  );

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const prevTopIdRef = useRef<string | null>(null);

  const topRankedId = ranked[0]?.trip_id ?? null;
  useEffect(() => {
    if (topRankedId && prevTopIdRef.current !== topRankedId) {
      setSwipeOffset(0);
    }
    prevTopIdRef.current = topRankedId;
  }, [topRankedId]);

  const n = ranked.length;
  const displayIndex = n > 0 ? ((swipeOffset % n) + n) % n : 0;
  const trip = ranked[displayIndex];

  const enterY = useSharedValue(-28);
  const enterOpacity = useSharedValue(0);
  const expandProgress = useSharedValue(0);
  const bounce = useSharedValue(1);
  const pulse = useSharedValue(1);

  const locBounceKey = trip
    ? `${trip.trip_id}:${trip.last_known_location?.recorded_at ?? ""}:${trip.last_known_location?.lat ?? ""}`
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
    if (!unread) {
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
  }, [pulse, trip?.total_unread, trip?.trip_id]);

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

  const quickEvents = useMemo(() => pickQuickEvents(trip?.recent_events), [trip?.recent_events]);

  if (!trip || n === 0) return null;

  const cardW = Math.min(400, screenW - 24);
  const unread = trip.total_unread > 0;
  const signalTs = activeTripIslandSignalTs(trip);
  const isContextTrip = trip.trip_id === currentTripId;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.wrap, { maxWidth: cardW }, cardAnimStyle]}
        pointerEvents="box-none"
      >
        <View style={styles.pressInner}>
          <LinearGradient
            colors={["rgba(255,255,255,0.88)", "rgba(241,245,249,0.78)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.glassBorder} pointerEvents="none" />
          <Pressable onPress={toggleExpand} style={styles.expandTap}>
          <View style={styles.rowTop}>
            <View style={styles.pulseCol}>
              <Animated.View style={[styles.pulseRing, pulseDotStyle]}>
                <Radio size={14} color={unread ? CHAT_ACCENT : Theme.textSecondary} />
              </Animated.View>
            </View>
            <View style={styles.titleBlock}>
              <Text style={styles.kicker}>Live ops</Text>
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
            {locationSubtitle(trip)}
          </Text>
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
              style={styles.replyBtn}
              onPress={() => {
                onNavigateTrip(trip.trip_id);
                onReplyShortcut?.();
              }}
              hitSlop={8}
            >
              <Reply size={16} color="#fff" />
              <Text style={styles.replyBtnText}>Reply</Text>
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
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textSecondary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
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
  replyBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
