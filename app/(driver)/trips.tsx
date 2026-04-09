import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverAvatar } from "@/contexts/DriverAvatarContext";
import {
    useDriverTheme,
    useDriverThemeColors,
} from "@/contexts/DriverThemeContext";
import { useDriverAvatarUri } from "@/lib/avatarUpload";
import { isAggregateTrip, tripEarningsForDriver } from "@/lib/driverUtils";
import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";
import { formatTime } from "@/lib/format";
import * as driversService from "@/services/driversService";
import * as tripsService from "@/services/tripsService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AppState,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Wallet-style hero text (match wallet.tsx creditsSection)
const EMERALD_500 = "#10b981";
const GRAY_700 = "#374151";

// Reference layout: Royal Emerald trip card (app/driver/referenced TripHistoryView)
const TRIP_CARD_REF = {
  listBg: "rgba(250,250,250,0.4)",
  cardBg: "#ffffff",
  border: "#f4f4f5",
  divider: "#fafafa",
  label: "#a1a1aa",
  title: "#18181b",
  body: "#27272a",
  emerald: "#10B981",
  emeraldYield: "#059669",
  muted: "#a1a1aa",
  badgeCompletedBg: "#18181b",
  accentBar: "#10B981",
};

// Reference: trip detail / archive view (app/driver/referenced selectedHistoryItem)
const DETAIL_REF = {
  pageBg: "#ffffff",
  headerBorder: "#f4f4f5",
  headerTitle: "#18181b",
  routeCardBg: "#18181b",
  routeCardBorder: "#10B981",
  routeCardLabel: "#71717a",
  routeCardBorderTop: "rgba(255,255,255,0.05)",
  yieldSectionLabel: "#a1a1aa",
  yieldCardBg: "#fafafa",
  yieldCardBorder: "#f4f4f5",
  yieldRowBorder: "rgba(0,0,0,0.06)",
  yieldRowLabel: "#71717a",
  yieldNetLabel: "#18181b",
  emerald: "#10B981",
};

function isCompleted(status: string) {
  const s = (status || "").toLowerCase();
  return s === "completed" || s === "delivered" || s === "done";
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d
    .toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    .toUpperCase();
}

function formatDistance(distance: string | number | null | undefined): string {
  if (distance == null || distance === "") return "—";
  const n =
    typeof distance === "string"
      ? parseFloat(distance.replace(/[^0-9.]/g, ""))
      : Number(distance);
  if (Number.isNaN(n) || n < 0) return "—";
  const formatted = Math.round(n).toLocaleString("en-IN");
  return `${formatted} KM`;
}

function splitLocationPrimarySecondary(location: string | null | undefined): {
  primary: string;
  secondary: string | null;
} {
  const raw = (location ?? "").trim();
  if (!raw) return { primary: "—", secondary: null };
  const commaIndex = raw.indexOf(",");
  if (commaIndex === -1) return { primary: raw, secondary: null };
  const primary = raw.slice(0, commaIndex).trim() || raw;
  const secondary = raw.slice(commaIndex + 1).trim() || null;
  return { primary, secondary };
}

/** Duration from started_at→completed_at, or estimated_duration, or "—". Never returns "0 H". */
function formatDurationForTrip(trip: tripsService.TripRow): string {
  if (trip.started_at && trip.completed_at) {
    const start = new Date(trip.started_at).getTime();
    const end = new Date(trip.completed_at).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    if (hours < 0) return "—";
    if (hours < 0.05) return "—"; // avoid showing "0 H"
    if (hours >= 24) {
      const d = Math.floor(hours / 24);
      const h = Math.round(hours % 24);
      return h > 0 ? `${d}D ${h}H` : `${d}D`;
    }
    const hRounded = Math.round(hours * 10) / 10;
    return hRounded > 0 ? `${hRounded}H` : "—";
  }
  const estimated = trip.estimated_duration?.trim();
  if (estimated) {
    const asNum = parseFloat(estimated.replace(/[^0-9.]/g, ""));
    if (Number.isNaN(asNum) || asNum <= 0) return "—";
    return formatEstimatedDuration(estimated);
  }
  return "—";
}

interface MissionLogEntry {
  time: string;
  status: string;
  loc: string;
}

/** Mission log from trip timestamps (Assigned → Pickup → In-transit → Delivered). */
function buildMissionLog(trip: tripsService.TripRow): MissionLogEntry[] {
  const entries: MissionLogEntry[] = [];
  if (trip.created_at) {
    entries.push({
      time: formatTime(trip.created_at),
      status: "ASSIGNED",
      loc: trip.pickup_area || "—",
    });
  }
  if (trip.started_at) {
    entries.push({
      time: formatTime(trip.started_at),
      status: "PICKUP",
      loc: trip.pickup_area || "—",
    });
    entries.push({
      time: formatTime(trip.started_at),
      status: "IN-TRANSIT",
      loc: trip.pickup_area || "—",
    });
  }
  if (trip.completed_at) {
    entries.push({
      time: formatTime(trip.completed_at),
      status: "DELIVERED",
      loc: trip.drop_location || "—",
    });
  }
  if (entries.length === 0 && trip.created_at) {
    entries.push({
      time: formatTime(trip.created_at),
      status: "ASSIGNED",
      loc: trip.pickup_area || "—",
    });
  }
  return entries;
}

function getGrossRevenue(trip: tripsService.TripRow): number | string {
  const amount = Number(trip.supplier_rate ?? trip.client_price ?? 0);
  if (amount <= 0 && isAggregateTrip(trip)) return "SALARY";
  return amount;
}

/** Arrow with translate-x animation on press (reference: group-hover:translate-x-2) */
function AnimatedCardArrow({
  pressed,
  color,
}: {
  pressed: boolean;
  color: string;
}) {
  const translateX = useSharedValue(0);
  useEffect(() => {
    translateX.value = withTiming(pressed ? 8 : 0, { duration: 180 });
  }, [pressed]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  return (
    <Animated.View style={animatedStyle}>
      <FontAwesome name="arrow-right" size={14} color={color} />
    </Animated.View>
  );
}

/** Side green bar: opacity 0 by default, 100% on touch (reference: opacity-0 group-hover:opacity-100 transition-opacity) */
function AnimatedAccentBar({
  pressed,
  backgroundColor,
}: {
  pressed: boolean;
  backgroundColor: string;
}) {
  const opacity = useSharedValue(pressed ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(pressed ? 1 : 0, { duration: 180 });
  }, [pressed]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  return (
    <Animated.View
      style={[styles.cardRefAccent, { backgroundColor }, animatedStyle]}
      pointerEvents="none"
    />
  );
}

/** Card scale on touch (reference: active:scale-[0.98] transition-all) */
function AnimatedCardScale({
  pressed,
  children,
}: {
  pressed: boolean;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withTiming(pressed ? 0.98 : 1, { duration: 150 });
  }, [pressed]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

export default function DriverTripsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const isDark = theme === "dark";
  const router = useRouter();
  const { profile } = useAuth();
  const { avatarSeed } = useDriverAvatar();
  const { avatarUri } = useDriverAvatarUri();
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<tripsService.TripRow | null>(
    null,
  );
  const [pressedCardId, setPressedCardId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"journey" | "settlement">(
    "journey",
  );

  const fetch = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    driversService.getLinkedDriversForCurrentUser(profile.uid).then((res) => {
      const drivers = (res.drivers ?? []).filter((d) => !d.left_at);
      if (drivers.length > 0) {
        setDriver(drivers[0]);
        tripsService
          .getTripsByDriverIds(drivers.map((d) => d.id))
          .then((tRes) => {
            setTrips(tRes.trips ?? []);
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });
  }, [profile?.uid]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useFocusEffect(
    useCallback(() => {
      if (profile?.uid) fetch();
    }, [profile?.uid, fetch]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && profile?.uid) fetch();
    });
    return () => sub.remove();
  }, [profile?.uid, fetch]);

  const getEarning = (trip: tripsService.TripRow) => {
    const amount = tripEarningsForDriver(trip);
    if (amount <= 0) return isAggregateTrip(trip) ? "SALARY" : "—";
    return `₹${Math.round(amount).toLocaleString()}`;
  };

  const getEarningAmount = (trip: tripsService.TripRow) => {
    return tripEarningsForDriver(trip);
  };

  const archiveMissionLog = useMemo(
    () => (selectedTrip ? buildMissionLog(selectedTrip) : []),
    [selectedTrip],
  );
  const selectedTripPickupParts = useMemo(
    () => splitLocationPrimarySecondary(selectedTrip?.pickup_area),
    [selectedTrip?.pickup_area],
  );
  const selectedTripDropParts = useMemo(
    () => splitLocationPrimarySecondary(selectedTrip?.drop_location),
    [selectedTrip?.drop_location],
  );

  const renderItem = ({ item }: { item: tripsService.TripRow }) => {
    const completed = isCompleted(item.status);
    return (
      <TouchableOpacity
        style={[
          styles.cardRef,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        onPress={() => setSelectedTrip(item)}
        onPressIn={() => setPressedCardId(item.id)}
        onPressOut={() => setPressedCardId(null)}
        activeOpacity={1}
      >
        {/* Green accent bar: direct child of card (reference: absolute top-0 right-0 w-1.5 h-full) so it doesn't collapse */}
        <AnimatedAccentBar
          pressed={pressedCardId === item.id}
          backgroundColor={colors.emerald}
        />
        <AnimatedCardScale pressed={pressedCardId === item.id}>
          <View style={styles.cardRefTop}>
            <View style={styles.cardRefTopLeft}>
              <Text
                style={[
                  styles.cardRefId,
                  isDark
                    ? { color: colors.text, opacity: 0.85 }
                    : { color: colors.textMuted },
                ]}
              >
                {tripsService.getTripDisplayNumber(item)} •{" "}
                {formatDate(item.pickup_date ?? item.created_at)}
              </Text>
              <View style={styles.routeRowRef}>
                <Text
                  style={[styles.routeRefPickup, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.pickup_area ?? "—"}
                </Text>
                <View style={styles.routeArrowWrap}>
                  <AnimatedCardArrow
                    pressed={pressedCardId === item.id}
                    color={colors.emerald}
                  />
                </View>
                <Text
                  style={[styles.routeRefDrop, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.drop_location ?? "—"}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.badgeRef,
                completed
                  ? { backgroundColor: isDark ? colors.surface : colors.text }
                  : { backgroundColor: colors.emerald },
              ]}
            >
              <Text
                style={[styles.badgeRefText, { color: colors.textOnPrimary }]}
              >
                {completed ? "Completed" : "In Transit"}
              </Text>
            </View>
          </View>
          <View
            style={[styles.cardRefBottom, { borderTopColor: colors.border }]}
          >
            <View>
              <Text
                style={[
                  styles.manifestLabel,
                  isDark
                    ? { color: colors.text, opacity: 0.85 }
                    : { color: colors.textMuted },
                ]}
              >
                DISTANCE
              </Text>
              <Text style={[styles.manifestValue, { color: colors.text }]}>
                {formatDistance(item.distance)}
              </Text>
            </View>
            <View style={styles.yieldWrapRef}>
              <Text
                style={[
                  styles.yieldLabelRef,
                  isDark
                    ? { color: colors.text, opacity: 0.85 }
                    : { color: colors.textMuted },
                ]}
              >
                YIELD
              </Text>
              <Text
                style={[
                  styles.yieldValueRef,
                  { color: completed ? colors.emerald : colors.textMuted },
                ]}
              >
                {getEarning(item)}
              </Text>
            </View>
          </View>
        </AnimatedCardScale>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { paddingTop: insets.top, backgroundColor: colors.background },
        ]}
      >
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Loading trip history…
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Layout.driverHeaderTopOffset,
            paddingHorizontal: Layout.driverHeaderHorizontalPadding,
            paddingBottom: Layout.driverHeaderBottomPadding,
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.push("/(driver)/profile")}
            style={styles.avatarBtn}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.avatarCircle,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.emeraldMuted,
                },
              ]}
            >
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
            </View>
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.brand, { color: colors.textMuted }]}>
              Q PILOT
            </Text>
            <Text
              style={[styles.welcomeTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              Trips
            </Text>
          </View>
        </View>
      </View>
      <View
        style={[styles.creditsSection, { backgroundColor: colors.background }]}
      >
        <Text style={[styles.creditsTitle, { color: EMERALD_500 }]}>
          Trips.
        </Text>
        <Text style={[styles.creditsSubtitle, { color: GRAY_700 }]}>
          Trip history & route archive.
        </Text>
      </View>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 80 },
        ]}
        ListEmptyComponent={
          trips.length === 0 ? (
            <View style={styles.empty}>
              <FontAwesome
                name="history"
                size={40}
                color={colors.tabInactive}
              />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No trips completed yet
              </Text>
            </View>
          ) : null
        }
      />

      <Modal
        visible={!!selectedTrip}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedTrip(null)}
      >
        {selectedTrip && (
          <View
            style={[
              styles.detailWrap,
              {
                paddingTop: insets.top,
                backgroundColor: colors.background,
              },
            ]}
          >
            <View
              style={[
                styles.detailHeaderRef,
                styles.detailHeaderStyled,
                {
                  paddingTop: 10,
                  paddingBottom: 12,
                  paddingHorizontal: Layout.screenPaddingHorizontal,
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => setSelectedTrip(null)}
                style={[
                  styles.detailBack,
                  styles.detailBackStyled,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                hitSlop={{ top: 12, right: 16, bottom: 12, left: 16 }}
                activeOpacity={0.75}
                accessibilityLabel="Back"
              >
                <FontAwesome
                  name="chevron-left"
                  size={20}
                  color={colors.text}
                />
              </TouchableOpacity>
              <View style={styles.detailTitleWrap}>
                <Text
                  style={[
                    styles.detailHeaderLabelRef,
                    { color: colors.textMuted },
                  ]}
                >
                  TRIP HISTORY
                </Text>
                <View style={styles.detailHeaderIdRowRef}>
                  <Text
                    style={[styles.detailTitleRef, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {tripsService.getTripDisplayNumber(selectedTrip)}
                  </Text>
                  <View
                    style={[
                      styles.detailHeaderDotRef,
                      { backgroundColor: colors.emerald },
                    ]}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.detailBack,
                  styles.detailBackStyled,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {}}
                activeOpacity={0.75}
                accessibilityLabel="Share trip"
              >
                <FontAwesome
                  name="share-square-o"
                  size={18}
                  color={colors.text}
                />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={[
                styles.detailScrollRef,
                { backgroundColor: colors.background },
              ]}
              contentContainerStyle={[
                styles.detailContentRef,
                {
                  paddingHorizontal: Layout.screenPaddingHorizontal,
                  paddingBottom: Layout.modalBottomPadding + insets.bottom,
                },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={[
                  styles.routeCardRef,
                  { borderBottomColor: colors.emerald },
                ]}
              >
                <View style={styles.routeCardWatermark}>
                  <FontAwesome
                    name="location-arrow"
                    size={120}
                    color="rgba(255,255,255,0.06)"
                    style={styles.routeCardWatermarkIcon}
                  />
                </View>
                <Text
                  style={[
                    styles.routeCardLabelRef,
                    { color: colors.textOnPrimary, opacity: 0.65 },
                  ]}
                >
                  Route Logic History
                </Text>
                <Text
                  style={[
                    styles.routeCardOriginRef,
                    { color: colors.textOnPrimary },
                  ]}
                >
                  {selectedTripPickupParts.primary.toUpperCase()}
                </Text>
                {selectedTripPickupParts.secondary ? (
                  <Text
                    style={[
                      styles.routeCardStateRef,
                      { color: colors.textOnPrimary, opacity: 0.65 },
                    ]}
                  >
                    {selectedTripPickupParts.secondary.toUpperCase()}
                  </Text>
                ) : null}
                <Text
                  style={[styles.routeCardToRef, { color: colors.emerald }]}
                >
                  TO
                </Text>
                <Text
                  style={[
                    styles.routeCardDestRef,
                    { color: colors.textOnPrimary },
                  ]}
                >
                  {selectedTripDropParts.primary.toUpperCase()}
                </Text>
                {selectedTripDropParts.secondary ? (
                  <Text
                    style={[
                      styles.routeCardStateRef,
                      { color: colors.textOnPrimary, opacity: 0.65 },
                    ]}
                  >
                    {selectedTripDropParts.secondary.toUpperCase()}
                  </Text>
                ) : null}
                <View
                  style={[
                    styles.routeCardMetaRef,
                    { borderTopColor: colors.border },
                  ]}
                >
                  <View style={styles.routeCardMetaItemRef}>
                    <FontAwesome
                      name="compass"
                      size={14}
                      color={colors.emerald}
                    />
                    <Text
                      style={[
                        styles.routeCardMetaTextRef,
                        { color: colors.textOnPrimary },
                      ]}
                    >
                      {formatDistance(selectedTrip.distance)}
                    </Text>
                  </View>
                  <View style={styles.routeCardMetaItemRef}>
                    <FontAwesome
                      name="clock-o"
                      size={14}
                      color={colors.emerald}
                    />
                    <Text
                      style={[
                        styles.routeCardMetaTextRef,
                        { color: colors.textOnPrimary },
                      ]}
                    >
                      {formatDurationForTrip(selectedTrip)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Segmented tab: Journey Log | Settlement (match reference) */}
              <View
                style={[
                  styles.detailTabSegmentedRef,
                  { backgroundColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.detailTabSegmentedBtnRef,
                    detailTab === "journey" &&
                      styles.detailTabSegmentedBtnActiveRef,
                    detailTab === "journey" && {
                      backgroundColor: colors.surface,
                    },
                  ]}
                  onPress={() => setDetailTab("journey")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.detailTabSegmentedLabelRef,
                      {
                        color:
                          detailTab === "journey"
                            ? colors.text
                            : colors.textMuted,
                      },
                    ]}
                  >
                    Journey Log
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.detailTabSegmentedBtnRef,
                    detailTab === "settlement" &&
                      styles.detailTabSegmentedBtnActiveRef,
                    detailTab === "settlement" && {
                      backgroundColor: colors.surface,
                    },
                  ]}
                  onPress={() => setDetailTab("settlement")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.detailTabSegmentedLabelRef,
                      {
                        color:
                          detailTab === "settlement"
                            ? colors.text
                            : colors.textMuted,
                      },
                    ]}
                  >
                    Settlement
                  </Text>
                </TouchableOpacity>
              </View>

              {detailTab === "journey" && archiveMissionLog.length > 0 && (
                <>
                  <View style={styles.logSectionHeaderRef}>
                    <View
                      style={[
                        styles.logSectionIconWrap,
                        { backgroundColor: colors.whiteMuted },
                      ]}
                    >
                      <FontAwesome name="list-alt" size={14} color={colors.text} />
                    </View>
                    <Text style={[styles.logSectionTitleRef, { color: colors.text }]}>
                      Mission Log
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.logCardActivityRef,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {archiveMissionLog.map((log, i) => {
                      const completed = true;
                      const isLast = i === archiveMissionLog.length - 1;
                      return (
                        <View
                          key={i}
                          style={[
                            styles.logItemActivityRef,
                            isLast && styles.logItemActivityLastRef,
                          ]}
                        >
                          <View style={styles.logMarkerColRef}>
                            <View
                              style={[
                                styles.logCircleWrapRef,
                                completed
                                  ? { backgroundColor: colors.emerald }
                                  : { backgroundColor: colors.border },
                              ]}
                            >
                              {completed && (
                                <FontAwesome
                                  name="check"
                                  size={9}
                                  color={Theme.textOnPrimary}
                                />
                              )}
                            </View>
                            {!isLast && (
                              <View
                                style={[
                                  styles.logConnectorRef,
                                  { backgroundColor: colors.border },
                                ]}
                              />
                            )}
                          </View>
                          <View style={styles.logContentActivityRef}>
                            <View style={styles.logHeadRef}>
                              <Text
                                style={[
                                  styles.logStatusRef,
                                  {
                                    color: completed
                                      ? colors.text
                                      : colors.textMuted,
                                  },
                                ]}
                              >
                                {log.status}
                              </Text>
                              <Text
                                style={[
                                  styles.logTimeRef,
                                  { color: colors.textMuted },
                                ]}
                              >
                                {log.time}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.logLocTextRef,
                                { color: colors.text },
                              ]}
                              numberOfLines={2}
                            >
                              {log.loc}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.logBadgesGridRef}>
                    <View
                      style={[
                        styles.logBadgeCardRef,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.logBadgeIconWrapRef,
                          { backgroundColor: colors.whiteMuted },
                        ]}
                      >
                        <FontAwesome
                          name="check-circle"
                          size={11}
                          color={colors.text}
                        />
                      </View>
                      <Text style={[styles.logBadgeTitleRef, { color: colors.text }]}>
                        Proof of Delivery
                      </Text>
                      <Text
                        style={[styles.logBadgeSubtitleRef, { color: colors.textMuted }]}
                      >
                        Digital signature & Photo verified
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.logBadgeCardRef,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <View
                        style={[
                          styles.logBadgeIconWrapRef,
                          { backgroundColor: colors.whiteMuted },
                        ]}
                      >
                        <FontAwesome name="dashboard" size={11} color={colors.text} />
                      </View>
                      <Text style={[styles.logBadgeTitleRef, { color: colors.text }]}>
                        Performance
                      </Text>
                      <Text
                        style={[styles.logBadgeSubtitleRef, { color: colors.textMuted }]}
                      >
                        Maintained 94% Cruise speed
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {detailTab === "settlement" && (
                <View
                  style={[
                    styles.yieldCardSettlementRef,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.yieldRowRef,
                      styles.yieldRowBorderRef,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={styles.yieldRowTextBlockRef}>
                      <Text
                        style={[
                          styles.yieldRowLabelSettlementRef,
                          { color: colors.text },
                        ]}
                      >
                        Fare Earnings
                      </Text>
                      <Text
                        style={[
                          styles.yieldRowSubtextRef,
                          { color: colors.textMuted },
                        ]}
                      >
                        Base trip rate calculation
                      </Text>
                    </View>
                    <View style={styles.yieldRowValueBlockRef}>
                      <Text
                        style={[styles.yieldRowValueRef, { color: colors.text }]}
                      >
                        {getGrossRevenue(selectedTrip) === "SALARY" ? "SALARY" : `₹${getGrossRevenue(selectedTrip).toLocaleString()}`}
                      </Text>
                      <Text
                        style={[
                          styles.yieldRowValueMetaRef,
                          { color: colors.textMuted },
                        ]}
                      >
                        CALCULATED
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.yieldRowRef,
                      styles.yieldRowBorderRef,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={styles.yieldRowTextBlockRef}>
                      <Text
                        style={[
                          styles.yieldRowLabelSettlementRef,
                          { color: colors.text },
                        ]}
                      >
                        Partner Bonus
                      </Text>
                      <Text
                        style={[
                          styles.yieldRowSubtextRef,
                          { color: colors.textMuted },
                        ]}
                      >
                        Precision pilot multiplier
                      </Text>
                    </View>
                    <View style={styles.yieldRowValueBlockRef}>
                      <Text
                        style={[
                          styles.yieldRowValueEmeraldRef,
                          { color: colors.emerald },
                        ]}
                      >
                        {getEarning(selectedTrip) === "SALARY" ? "—" : `+ ₹${Math.round(getEarningAmount(selectedTrip)).toLocaleString()}`}
                      </Text>
                      <Text
                        style={[
                          styles.yieldRowValueMetaRef,
                          { color: colors.textMuted },
                        ]}
                      >
                        AWARDED
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.yieldRowRef,
                      styles.yieldRowBorderRef,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={styles.yieldRowTextBlockRef}>
                      <Text
                        style={[
                          styles.yieldRowLabelSettlementRef,
                          { color: colors.text },
                        ]}
                      >
                        Tax Deductions
                      </Text>
                      <Text
                        style={[
                          styles.yieldRowSubtextRef,
                          { color: colors.textMuted },
                        ]}
                      >
                        TDS and platform overhead
                      </Text>
                    </View>
                    <View style={styles.yieldRowValueBlockRef}>
                      <Text
                        style={[
                          styles.yieldRowValueDeductionRef,
                          { color: Theme.negative },
                        ]}
                      >
                        - ₹0
                      </Text>
                      <Text
                        style={[
                          styles.yieldRowValueMetaRef,
                          { color: colors.textMuted },
                        ]}
                      >
                        DEDUCTED
                      </Text>
                    </View>
                  </View>

                  <View style={styles.yieldPayoutHeroDarkRef}>
                    <Text style={styles.yieldPayoutHeroLabelDarkRef}>
                      Net payout
                    </Text>
                    <View style={styles.yieldPayoutHeroAmountRowRef}>
                      {getEarning(selectedTrip) === "SALARY" ? null : <Text style={styles.yieldPayoutHeroRupeeRef}>₹</Text>}
                      <Text style={styles.yieldPayoutHeroAmountDarkRef}>
                        {getEarning(selectedTrip) === "SALARY" ? "SALARY" : Math.round(
                          getEarningAmount(selectedTrip),
                        ).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {detailTab === "settlement" && (
                <View style={[styles.yieldMetaGridRef, { marginTop: 16 }]}>
                  <View
                    style={[
                      styles.yieldMetaCardRef,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <FontAwesome
                      name="calendar"
                      size={18}
                      color={colors.textMuted}
                      style={styles.yieldMetaIconRef}
                    />
                    <Text
                      style={[
                        styles.yieldMetaLabelRef,
                        { color: colors.textMuted },
                      ]}
                    >
                      Billing Period
                    </Text>
                    <Text
                      style={[styles.yieldMetaValueRef, { color: colors.text }]}
                    >
                      {formatDate(
                        selectedTrip.pickup_date ?? selectedTrip.created_at,
                      )}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.yieldMetaCardRef,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <FontAwesome
                      name="info-circle"
                      size={18}
                      color={colors.textMuted}
                      style={styles.yieldMetaIconRef}
                    />
                    <Text
                      style={[
                        styles.yieldMetaLabelRef,
                        { color: colors.textMuted },
                      ]}
                    >
                      Reference
                    </Text>
                    <Text
                      style={[styles.yieldMetaValueRef, { color: colors.text }]}
                    >
                      #{tripsService.getTripDisplayNumber(selectedTrip)}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.driverBackground,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Layout.driverHeaderGap,
    flex: 1,
    minWidth: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  avatarBtn: { padding: 2 },
  avatarCircle: {
    width: Layout.driverHeaderAvatarSize,
    height: Layout.driverHeaderAvatarSize,
    borderRadius: Layout.driverHeaderAvatarSize / 2,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: Layout.driverHeaderAvatarSize / 2,
  },
  brand: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 1,
  },
  welcomeTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  creditsSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  creditsTitle: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.5,
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  creditsSubtitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginTop: 8,
    textTransform: "uppercase",
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  cardRef: {
    backgroundColor: TRIP_CARD_REF.cardBg,
    borderWidth: 1,
    borderColor: TRIP_CARD_REF.border,
    borderRadius: 8,
    padding: 24,
    marginBottom: 16,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardRefAccent: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 6,
  },
  cardRefTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  cardRefTopLeft: {
    flex: 1,
    minWidth: 0,
  },
  cardRefId: {
    fontSize: 8,
    fontWeight: "900",
    color: TRIP_CARD_REF.label,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  routeRowRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  routeRefPickup: {
    fontSize: 15,
    fontWeight: "900",
    color: TRIP_CARD_REF.title,
    letterSpacing: -0.375,
    textTransform: "uppercase",
    lineHeight: 18.75,
    flexShrink: 1,
    minWidth: 0,
  },
  routeRefDrop: {
    fontSize: 15,
    fontWeight: "900",
    color: TRIP_CARD_REF.title,
    letterSpacing: -0.375,
    textTransform: "uppercase",
    lineHeight: 18.75,
    flexShrink: 1,
    minWidth: 0,
  },
  routeArrowWrap: {
    marginHorizontal: 0,
  },
  badgeRef: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    flexShrink: 0,
    marginLeft: 12,
    alignSelf: "flex-start",
  },
  badgeRefCompleted: {
    backgroundColor: TRIP_CARD_REF.badgeCompletedBg,
  },
  badgeRefTransit: {
    backgroundColor: TRIP_CARD_REF.emerald,
  },
  badgeRefText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: -0.4,
  },
  cardRefBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: TRIP_CARD_REF.divider,
  },
  manifestLabel: {
    fontSize: 7,
    fontWeight: "900",
    color: TRIP_CARD_REF.label,
    letterSpacing: 1.75,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  manifestValue: {
    fontSize: 11,
    fontWeight: "900",
    color: TRIP_CARD_REF.body,
    textTransform: "uppercase",
  },
  yieldWrapRef: { alignItems: "flex-end" },
  yieldLabelRef: {
    fontSize: 7,
    fontWeight: "900",
    color: TRIP_CARD_REF.label,
    letterSpacing: 1.75,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  yieldValueRef: {
    fontSize: 16,
    fontWeight: "900",
  },
  yieldValueCompleted: { color: TRIP_CARD_REF.emeraldYield },
  yieldValueMuted: { color: TRIP_CARD_REF.muted },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Theme.textMuted,
  },
  detailWrap: {
    flex: 1,
    backgroundColor: DETAIL_REF.pageBg,
  },
  detailHeaderRef: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    gap: 10,
  },
  detailHeaderStyled: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  detailBack: {
    minWidth: 40,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  detailBackStyled: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
  },
  detailTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
    minWidth: 0,
    marginLeft: 12,
  },
  detailHeaderLabelRef: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  detailHeaderIdRowRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailHeaderDotRef: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  detailTitleRef: {
    fontSize: 16,
    fontWeight: "800",
    color: DETAIL_REF.headerTitle,
    letterSpacing: 0.2,
  },
  detailTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailArchiveIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  detailSubtitleRef: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 1,
  },
  detailBackSpacer: {
    width: 40,
  },
  detailScrollRef: {
    flex: 1,
    backgroundColor: DETAIL_REF.pageBg,
  },
  detailContentRef: {
    paddingTop: 16,
    paddingBottom: 80,
  },
  routeCardRef: {
    padding: 32,
    borderRadius: 8,
    borderBottomWidth: 4,
    borderBottomColor: DETAIL_REF.routeCardBorder,
    backgroundColor: DETAIL_REF.routeCardBg,
    marginBottom: 40,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  routeCardWatermark: {
    position: "absolute",
    top: 24,
    right: 24,
    opacity: 0.18,
    transform: [{ rotate: "45deg" }],
  },
  routeCardWatermarkIcon: {
    textShadowColor: "rgba(255,255,255,0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  routeCardLabelRef: {
    fontSize: 9,
    fontWeight: "900",
    color: DETAIL_REF.routeCardLabel,
    letterSpacing: 4.5,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  routeCardOriginRef: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.6,
    textTransform: "uppercase",
    lineHeight: 26.4,
    marginBottom: 2,
  },
  routeCardToRef: {
    fontSize: 24,
    fontWeight: "500",
    color: DETAIL_REF.emerald,
    opacity: 0.5,
    marginVertical: 0,
    letterSpacing: -0.6,
  },
  routeCardDestRef: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -0.6,
    textTransform: "uppercase",
    lineHeight: 26.4,
    marginTop: 2,
    marginBottom: 4,
  },
  routeCardStateRef: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 4.5,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  routeCardMetaRef: {
    flexDirection: "row",
    gap: 40,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: DETAIL_REF.routeCardBorderTop,
  },
  routeCardMetaItemRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  routeCardMetaTextRef: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  detailSectionRef: {
    marginBottom: Layout.sectionSpacing,
  },
  detailSectionHeaderRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  detailSectionIconWrapRef: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  detailSectionTitleRef: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  detailTabSegmentedRef: {
    flexDirection: "row",
    padding: 6,
    borderRadius: 24,
    marginBottom: 24,
  },
  detailTabSegmentedBtnRef: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  detailTabSegmentedBtnActiveRef: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  detailTabSegmentedLabelRef: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  logCardActivityRef: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  logCardActivityLineRef: {
    position: "absolute",
    left: 12,
    top: 32,
    bottom: 32,
    width: 1,
  },
  logItemActivityRef: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 26,
  },
  logItemActivityLastRef: {
    marginBottom: 0,
  },
  logCircleWrapRef: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  logMarkerColRef: {
    width: 20,
    marginRight: 12,
    alignItems: "center",
    position: "relative",
  },
  logConnectorRef: {
    position: "absolute",
    top: 20,
    bottom: -26,
    width: 1,
    alignSelf: "center",
  },
  logContentActivityRef: {
    flex: 1,
    minWidth: 0,
  },
  logStatusChipRef: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  logStatusChipTextRef: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  logTimeMetaRef: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  logBadgesGridRef: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  logBadgeCardRef: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  logBadgeIconWrapRef: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  logBadgeTitleRef: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 2,
  },
  logBadgeSubtitleRef: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  yieldCardSettlementRef: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 2,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  yieldRowLabelSettlementRef: {
    fontSize: 17,
    fontWeight: "700",
    color: DETAIL_REF.yieldRowLabel,
  },
  yieldRowTextBlockRef: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  yieldRowSubtextRef: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
  },
  yieldRowValueBlockRef: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 94,
  },
  yieldRowValueMetaRef: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  yieldRowValueDeductionRef: {
    fontSize: 20,
    fontWeight: "800",
  },
  yieldPayoutHeroDarkRef: {
    marginTop: 24,
    marginBottom: 8,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  yieldPayoutHeroLabelDarkRef: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94a3b8",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  yieldPayoutHeroRupeeRef: {
    fontSize: 24,
    fontWeight: "600",
    color: "#34d399",
    marginRight: 4,
  },
  yieldPayoutHeroAmountDarkRef: {
    fontSize: 40,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.8,
  },
  yieldPayoutHeroBadgeDarkRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  yieldPayoutHeroDotRef: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  yieldPayoutHeroBadgeTextDarkRef: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  yieldTierBadgeRef: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  yieldTierBadgeTextRef: {
    fontSize: 8,
    fontWeight: "800",
  },
  yieldPayoutHeroRef: {
    marginTop: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#064E3B",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  yieldPayoutHeroLabelRef: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  yieldPayoutHeroAmountRowRef: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  yieldPayoutHeroAmountRef: {
    fontSize: 40,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -1,
  },
  yieldPayoutHeroBadgeRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  yieldPayoutHeroBadgeTextRef: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  yieldMetaGridRef: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  yieldMetaCardRef: {
    flex: 1,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  yieldMetaIconRef: {
    marginBottom: 12,
  },
  yieldMetaLabelRef: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  yieldMetaValueRef: {
    fontSize: 12,
    fontWeight: "800",
  },
  logSectionRef: {
    marginBottom: Layout.sectionSpacing,
  },
  logSectionHeaderRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  logSectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logSectionTitleRef: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  logCardRef: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  logItemRef: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
  },
  logItemBorderRef: {
    borderBottomWidth: 1,
  },
  logLeftRef: {
    width: 28,
    alignItems: "center",
    marginRight: 14,
  },
  logDotRef: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  logLineRef: {
    width: 2,
    height: 32,
    marginTop: 6,
  },
  logContentRef: {
    flex: 1,
    minWidth: 0,
  },
  logHeadRef: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  logStatusRef: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  logTimeRef: {
    fontSize: 12,
    fontWeight: "500",
  },
  logLocRowRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logLocIconRef: {
    marginRight: 0,
  },
  logLocTextRef: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  yieldSectionRef: {
    marginBottom: Layout.sectionSpacing,
  },
  yieldSectionHeaderRef: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  yieldSectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  yieldSectionTitleRef: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  yieldCardRef: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DETAIL_REF.yieldCardBorder,
    backgroundColor: DETAIL_REF.yieldCardBg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  yieldRowRef: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  yieldRowBorderRef: {
    borderBottomWidth: 1,
    borderBottomColor: DETAIL_REF.yieldRowBorder,
  },
  yieldRowLastRef: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginHorizontal: -4,
    marginBottom: -4,
    borderRadius: 8,
  },
  yieldRowLabelRef: {
    fontSize: 12,
    fontWeight: "600",
    color: DETAIL_REF.yieldRowLabel,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  yieldRowValueRef: {
    fontSize: 20,
    fontWeight: "800",
    color: DETAIL_REF.headerTitle,
  },
  yieldRowValueEmeraldRef: {
    fontSize: 20,
    fontWeight: "800",
    color: DETAIL_REF.emerald,
  },
  yieldRowLabelNetRef: {
    fontSize: 12,
    fontWeight: "700",
    color: DETAIL_REF.yieldNetLabel,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  yieldNetRef: {
    fontSize: 20,
    fontWeight: "800",
    color: DETAIL_REF.emerald,
  },
});
