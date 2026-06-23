/**
 * Full-screen trip history detail (stack route).
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverTheme, useDriverThemeColors } from "@/contexts/DriverThemeContext";
import { getLatestAssignmentAuditByTripIds } from "@/features/trips/services/trip-assignment-audit.service";
import {
  buildAssignerDisplayForTrip,
} from "@/features/trips/utils/driverAssignerDisplay.util";
import {
  buildDriverTripNumberMap,
  getDriverTripDisplayNumber,
} from "@/features/driver/utils/driverTripSequence.util";
import { formatLedgerDateTime } from "@/lib/format";
import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";
import { getOptimalRoute } from "@/lib/routingService";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import * as driversService from "@/features/drivers/services/drivers.service";
import * as salaryRequestsService from "@/features/drivers/services/salaryRequests.service";
import * as tripsService from "@/features/trips/services/trips.service";
import { tripEarningsForDriver } from "@/features/drivers/utils/driverUtils.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useRouter } from "expo-router";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileImage,
  MessageSquare,
  Navigation,
  Route,
  Share2,
  ShieldCheck,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildMissionLog,
  formatDistance,
  formatDurationForTrip,
  getTripProgressTitle,
  isCompleted,
  isInTransitStatus,
  parseTripCoordinate,
  splitLocationPrimarySecondary,
  toEtaInterval,
} from "@/features/driver/tripHistory/tripHistoryDetail.util";
import { tripHistoryDetailStyles as styles } from "@/features/driver/tripHistory/tripHistoryDetail.styles";
import { TripDetailSettlementPanel } from "@/features/driver/components/TripDetailSettlementPanel";
import { useTripVerificationSync } from "@/features/trips/verification";
import { useTripOperationsSync } from "@/features/trips/operations";
import { DriverTripOperationsTab } from "@/features/driver/components/DriverTripOperationsTab";
import { useRegisterDriverContextTrip } from "@/contexts/DriverTripOpsContext";

function TimelinePulseIcon({
  expanded,
  children,
  style,
}: {
  expanded: boolean;
  children: ReactNode;
  style?: object;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(scale);
    if (expanded) {
      scale.value = withRepeat(
        withSequence(withTiming(1.07, { duration: 700 }), withTiming(1, { duration: 700 })),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 220 });
    }
  }, [expanded, scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
}

export type DriverTripHistoryDetailScreenProps = {
  tripId: string;
  initialTab?: "journey" | "operations" | "settlement";
  initialSelectedExpenseId?: string | null;
};

export function DriverTripHistoryDetailScreen({
  tripId,
  initialTab,
  initialSelectedExpenseId,
}: DriverTripHistoryDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const colors = useDriverThemeColors();
  const { theme } = useDriverTheme();
  const isDark = theme === "dark";
  const router = useRouter();
  useTripVerificationSync();
  const operationsSync = useTripOperationsSync();
  const [trip, setTrip] = useState<tripsService.TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [invites, setInvites] = useState<
    Awaited<ReturnType<typeof driversService.getDriverInvitesReceived>>["invites"]
  >([]);
  const [assignmentActorByTripId, setAssignmentActorByTripId] = useState<Record<string, string>>({});
  const [routeMetricsByTripId, setRouteMetricsByTripId] = useState<
    Record<string, { distance: number; estimated_duration: string }>
  >({});
  const [detailTab, setDetailTab] = useState<"journey" | "operations" | "settlement">(
    initialTab ?? "journey",
  );
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(null);
  const [detailPodDocuments, setDetailPodDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [detailPodLoading, setDetailPodLoading] = useState(false);
  const [detailPodViewUrls, setDetailPodViewUrls] = useState<Record<string, string>>({});
  const detailPodUrlRequestedRef = useRef<Set<string>>(new Set());
  const [podPreviewUrl, setPodPreviewUrl] = useState<string | null>(null);
  const [podPreviewLoading, setPodPreviewLoading] = useState(false);
  const [podPreviewError, setPodPreviewError] = useState(false);

  useRegisterDriverContextTrip(trip);

  // Fleet attribution state
  const [linkedDriversFull, setLinkedDriversFull] = useState<driversService.DriverRow[]>([]);
  const [attrSalaryRequests, setAttrSalaryRequests] = useState<salaryRequestsService.SalaryRequestRow[]>([]);
  const [attributeLoading, setAttributeLoading] = useState(false);

  const loadTrip = useCallback(async (isMounted: () => boolean) => {
    if (isMounted()) setLoading(true);
    const res = await tripsService.getDriverTripById(tripId);
    if (!isMounted()) return;
    setTrip(res.trip ? tripsService.driverRowToTripRow(res.trip) : null);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    let mounted = true;
    void loadTrip(() => mounted);
    return () => {
      mounted = false;
    };
  }, [loadTrip]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void loadTrip(() => mounted);
      return () => {
        mounted = false;
      };
    }, [loadTrip]),
  );

  useEffect(() => {
    const uid = profile?.uid;
    if (!uid) return;
    let mounted = true;
    void driversService.getLinkedDriversForCurrentUser(uid).then((res) => {
      if (!mounted) return;
      const d = res.drivers?.[0] ?? null;
      setDriver(d);
      // Keep ALL rows (including left_at) so former-employer trips classify as fleet trips.
      const allRows = res.drivers ?? [];
      setLinkedDriversFull(allRows);
      if (!d?.id) return;
      void driversService.getDriverInvitesReceived().then((inv) => {
        if (!mounted || inv.error) return;
        setInvites(inv.invites);
      });
      const activeRows = allRows.filter((r) => !r.left_at);
      if (activeRows.length > 0) {
        void salaryRequestsService.getSalaryRequestsByDriverIds(activeRows.map((r) => r.id))
          .then((sRes) => { if (mounted) setAttrSalaryRequests(sRes.requests ?? []); });
      }
    });
    return () => {
      mounted = false;
    };
  }, [profile?.uid]);

  useEffect(() => {
    if (!tripId) return;
    let mounted = true;
    void getLatestAssignmentAuditByTripIds([tripId]).then(({ byTripId }) => {
      if (!mounted) return;
      const map: Record<string, string> = {};
      byTripId.forEach((value, key) => {
        const actorId = String(value.changed_by ?? "").trim();
        if (actorId) map[key] = actorId;
      });
      setAssignmentActorByTripId(map);
    });
    return () => {
      mounted = false;
    };
  }, [tripId]);

  useEffect(() => {
    setExpandedLogIndex(null);
    setDetailTab("journey");
  }, [tripId]);

  useEffect(() => {
    if (!trip?.id) {
      setDetailPodDocuments([]);
      setDetailPodViewUrls({});
      detailPodUrlRequestedRef.current.clear();
      setPodPreviewUrl(null);
      setPodPreviewLoading(false);
      setPodPreviewError(false);
      return;
    }
    const tid = trip.id;
    detailPodUrlRequestedRef.current.clear();
    setDetailPodViewUrls({});
    setDetailPodLoading(true);
    let cancelled = false;
    tripDocumentsService.getDocumentsByTripId(tid).then(({ documents, error }) => {
      if (cancelled) return;
      setDetailPodLoading(false);
      if (!error) setDetailPodDocuments(documents.filter((d) => d.document_type === 'pod'));
      else setDetailPodDocuments([]);
    });
    return () => {
      cancelled = true;
    };
  }, [trip?.id]);

  useEffect(() => {
    detailPodDocuments.forEach((doc) => {
      if (detailPodUrlRequestedRef.current.has(doc.id)) return;
      detailPodUrlRequestedRef.current.add(doc.id);
      tripDocumentsService.getDocumentViewUrl(doc.storage_path).then((url) => {
        setDetailPodViewUrls((prev) => (prev[doc.id] ? prev : { ...prev, [doc.id]: url }));
      });
    });
  }, [detailPodDocuments]);

  useEffect(() => {
    if (!trip) return;
    const tid = String(trip.id ?? "").trim();
    const hasDistance = trip.distance != null && String(trip.distance).trim() !== "";
    const hasEta = trip.estimated_duration != null && trip.estimated_duration.trim() !== "";
    if (!tid || (hasDistance && hasEta)) return;
    const pickupLat = parseTripCoordinate(trip.pickup_lat);
    const pickupLon = parseTripCoordinate(trip.pickup_lon);
    const dropLat = parseTripCoordinate(trip.drop_lat);
    const dropLon = parseTripCoordinate(trip.drop_lon);
    if (pickupLat == null || pickupLon == null || dropLat == null || dropLon == null) return;
    let cancelled = false;
    void getOptimalRoute(
      { latitude: pickupLat, longitude: pickupLon },
      { latitude: dropLat, longitude: dropLon },
    ).then((route) => {
      if (cancelled || !route) return;
      const distanceKm = Math.max(1, Math.round(route.distance / 1000));
      const etaInterval = toEtaInterval(route.duration);
      setRouteMetricsByTripId((prev) => ({
        ...prev,
        [tid]: { distance: distanceKm, estimated_duration: etaInterval },
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [trip]);

  const driverTripNumberById = useMemo(
    () => (trip ? buildDriverTripNumberMap([trip]) : {}),
    [trip],
  );

  const assignerDisplay = useMemo(() => {
    if (!trip) return "Fleet dispatcher";
    return (
      buildAssignerDisplayForTrip(trip, invites, driver?.organization_id ?? null, {
        assignmentActorByTripId,
        assignerNamesByUserId: {},
        assignerOrgNameByUserId: {},
        assignerDisplayByTripId: {},
        assignerTripOrgNameByTripId: {},
        organizationNamesById: {},
      }).assignedByName || "Fleet dispatcher"
    );
  }, [trip, invites, driver?.organization_id, assignmentActorByTripId]);

  const archiveMissionLog = useMemo(() => (trip ? buildMissionLog(trip) : []), [trip]);
  const pickupParts = useMemo(
    () => splitLocationPrimarySecondary(trip?.pickup_area),
    [trip?.pickup_area],
  );
  const dropParts = useMemo(
    () => splitLocationPrimarySecondary(trip?.drop_location),
    [trip?.drop_location],
  );
  const routeFallback = useMemo(() => {
    if (!trip) return null;
    return routeMetricsByTripId[String(trip.id)] ?? null;
  }, [trip, routeMetricsByTripId]);
  const distanceDisplay = useMemo(() => {
    if (!trip) return "—";
    return formatDistance(trip.distance ?? routeFallback?.distance);
  }, [trip, routeFallback]);
  const durationDisplay = useMemo(() => {
    if (!trip) return "—";
    if (trip.estimated_duration?.trim()) return formatDurationForTrip(trip);
    if (routeFallback?.estimated_duration) {
      return formatEstimatedDuration(routeFallback.estimated_duration);
    }
    return formatDurationForTrip(trip);
  }, [trip, routeFallback]);

  const historyEmployerOrgIdSet = useMemo(() => {
    const set = new Set<string>();
    linkedDriversFull.forEach((d) => {
      if (
        (d.payable_amount != null && d.payable_amount > 0) ||
        (d.commission_percent != null && d.commission_percent > 0) ||
        (d.commission_per_km != null && d.commission_per_km > 0)
      ) {
        const orgId = String(d.organization_id ?? "");
        if (orgId) set.add(orgId);
      }
    });
    return set;
  }, [linkedDriversFull]);

  const historyCurrentEmployer = useMemo(() => {
    const d =
      linkedDriversFull.find((row) => !row.left_at && historyEmployerOrgIdSet.has(String(row.organization_id ?? ""))) ??
      linkedDriversFull.find((row) => historyEmployerOrgIdSet.has(String(row.organization_id ?? "")));
    if (!d) return null;
    const orgName =
      invites.find((i) => String(i.from_organization_id ?? "") === String(d.organization_id ?? ""))?.from_org_name?.trim() ||
      "Employer";
    return { orgId: String(d.organization_id ?? ""), driverRowId: d.id, orgName };
  }, [linkedDriversFull, historyEmployerOrgIdSet, invites]);

  const isTripHistoryFleet = useMemo(() => {
    if (!trip || !historyCurrentEmployer) return false;
    return historyEmployerOrgIdSet.has(String(trip.organization_id ?? ""));
  }, [trip, historyCurrentEmployer, historyEmployerOrgIdSet]);

  const isTripHistoryAttributed = useMemo(() => {
    if (!historyCurrentEmployer || !trip) return false;
    return attrSalaryRequests.some(
      (r) =>
        r.request_type === "trip_based" &&
        String(r.organization_id ?? "") === historyCurrentEmployer.orgId &&
        (r.trip_ids ?? []).includes(trip.id),
    );
  }, [attrSalaryRequests, historyCurrentEmployer, trip]);

  const handleHistoryAttributeTrip = useCallback(async () => {
    if (!historyCurrentEmployer || !trip) return;
    setAttributeLoading(true);
    try {
      const earnings = Math.round(tripEarningsForDriver(trip));
      if (earnings <= 0) {
        Alert.alert("No earnings", "Could not calculate trip earnings.");
        return;
      }
      const tripDate = trip.pickup_date ?? trip.started_at ?? trip.created_at ?? "";
      const tripDateStr = tripDate
        ? new Date(tripDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "";
      const tripRef = getDriverTripDisplayNumber(trip, driverTripNumberById);
      const attrNote = [`Fleet trip · ${tripRef}`, tripDateStr, `₹${earnings.toLocaleString("en-IN")}`]
        .filter(Boolean).join(" · ");
      const { error } = await salaryRequestsService.createSalaryRequest(
        historyCurrentEmployer.driverRowId,
        historyCurrentEmployer.orgId,
        "trip_based",
        earnings,
        { tripIds: [trip.id], note: attrNote, createdBy: profile?.uid ?? null },
      );
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        Alert.alert("Trip attributed", `Sent to ${historyCurrentEmployer.orgName} for review.`);
        void salaryRequestsService.getSalaryRequestsByDriverIds(linkedDriversFull.map((d) => d.id))
          .then((sRes) => setAttrSalaryRequests(sRes.requests ?? []));
      }
    } finally {
      setAttributeLoading(false);
    }
  }, [historyCurrentEmployer, trip, driverTripNumberById, linkedDriversFull, profile?.uid]);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(driver)/trip-history");
  };

  if (loading || !trip) {
    return (
      <View style={[styles.detailWrap, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <View style={styles.detailLoading}>
          <LoadingIndicator color={colors.emerald} />
          <Text style={{ color: colors.textMuted, marginTop: 12 }}>Loading trip…</Text>
        </View>
      </View>
    );
  }

  const selectedTrip = trip;
  const showHistoryAttributionBar =
    detailTab === "settlement" && !isTripHistoryFleet && !!historyCurrentEmployer;

  return (
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
                  paddingTop: 12,
                  paddingBottom: 12,
                  paddingHorizontal: Layout.screenPaddingHorizontal,
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => onBack()}
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
                  size={18}
                  color={colors.text}
                />
              </TouchableOpacity>
              <View style={styles.tdHeaderCenter}>
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
                    {getDriverTripDisplayNumber(selectedTrip, driverTripNumberById)}
                  </Text>
                  <View
                    style={[
                      styles.tdStatusDot,
                      {
                        backgroundColor: colors.emerald,
                        shadowColor: colors.emerald,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.detailHeaderActions}>
                {selectedTrip.driver_id ? (
                  <TouchableOpacity
                    style={[
                      styles.detailBack,
                      styles.detailBackStyled,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      const id = encodeURIComponent(String(selectedTrip.id));
                      router.push(`/(driver)/chat?tripId=${id}` as Href);
                    }}
                    activeOpacity={0.75}
                    accessibilityLabel="Trip chat"
                  >
                    <MessageSquare size={17} color={colors.text} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[
                    styles.detailBack,
                    styles.detailBackStyled,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => {
                    void Share.share({
                      message: `Trip ${getDriverTripDisplayNumber(selectedTrip, driverTripNumberById)}`,
                    }).catch(() => {});
                  }}
                  activeOpacity={0.75}
                  accessibilityLabel="Share trip"
                >
                  <Share2 size={17} color={colors.text} />
                </TouchableOpacity>
              </View>
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
                  paddingBottom:
                    Layout.modalBottomPadding +
                    insets.bottom +
                    Layout.tabBarDockHeight +
                    (showHistoryAttributionBar ? 88 : 0),
                  paddingTop: 16,
                },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.tdHeroOuter}>
                <LinearGradient
                  colors={["#0f172a", "#020617"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.tdHeroCard}
                >
                  <View style={styles.tdHeroGlow} pointerEvents="none" />
                  <Route
                    size={128}
                    color="rgba(255,255,255,0.08)"
                    style={styles.tdHeroWatermark}
                  />
                  <View style={styles.tdHeroInner}>
                    <Text style={styles.tdHeroKicker}>Route Logic History</Text>
                    <View style={styles.tdHeroRouteRow}>
                      <View style={styles.tdHeroRouteSide}>
                        <Text
                          style={styles.tdHeroCity}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.72}
                        >
                          {pickupParts.primary.toUpperCase()}
                        </Text>
                        <Text style={styles.tdHeroState} numberOfLines={1}>
                          {(pickupParts.secondary ?? "Origin").toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.tdHeroRouteConnector}>
                        <View style={[styles.tdHeroDot, { backgroundColor: Theme.driverEmerald }]} />
                        <View style={styles.tdHeroConnectorLine} />
                        <Text style={[styles.tdHeroToLabel, { color: Theme.driverPrimary }]}>TO</Text>
                        <View style={styles.tdHeroConnectorLine} />
                        <View style={[styles.tdHeroDot, { backgroundColor: Theme.driverPrimary }]} />
                      </View>

                      <View style={[styles.tdHeroRouteSide, styles.tdHeroRouteSideRight]}>
                        <Text
                          style={[styles.tdHeroCity, styles.tdHeroCityRight]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.72}
                        >
                          {dropParts.primary.toUpperCase()}
                        </Text>
                        <Text style={[styles.tdHeroState, styles.tdHeroStateRight]} numberOfLines={1}>
                          {(dropParts.secondary ?? "Destination").toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.tdHeroDivider} />
                    <View style={styles.tdHeroMetaRow}>
                      <View style={styles.tdHeroMetaItem}>
                        <View style={styles.tdHeroMetaIconWrap}>
                          <Navigation size={16} color={Theme.driverPrimary} />
                        </View>
                        <View>
                          <Text style={styles.tdHeroMetaKicker}>Distance</Text>
                          <Text style={styles.tdHeroMetaValue}>
                            {distanceDisplay}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.tdHeroMetaItem}>
                        <View style={styles.tdHeroMetaIconWrap}>
                          <Clock size={16} color={Theme.driverPrimary} />
                        </View>
                        <View>
                          <Text style={styles.tdHeroMetaKicker}>Duration</Text>
                          <Text style={styles.tdHeroMetaValue}>
                            {durationDisplay}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.tdHeroAssignerRow}>
                      <ShieldCheck size={14} color={Theme.driverPrimary} />
                      <Text style={styles.tdHeroAssignerLabel}>Assigned by</Text>
                      <Text style={styles.tdHeroAssignerValue} numberOfLines={1}>
                        {assignerDisplay}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.tdHeroAccentBar, { backgroundColor: colors.emerald }]} />
                </LinearGradient>
              </View>

              <View style={[styles.tdTabBar, { backgroundColor: `${colors.border}99` }]}>
                <TouchableOpacity
                  style={[
                    styles.tdTabBtn,
                    detailTab === "journey" && styles.tdTabBtnActive,
                  ]}
                  onPress={() => setDetailTab("journey")}
                  activeOpacity={0.88}
                >
                  <Text
                    style={[
                      styles.tdTabLabel,
                      {
                        color: detailTab === "journey" ? "#ffffff" : colors.textMuted,
                      },
                    ]}
                  >
                    Journey
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tdTabBtn,
                    detailTab === "operations" && styles.tdTabBtnActive,
                  ]}
                  onPress={() => setDetailTab("operations")}
                  activeOpacity={0.88}
                >
                  <Text
                    style={[
                      styles.tdTabLabel,
                      {
                        color: detailTab === "operations" ? "#ffffff" : colors.textMuted,
                      },
                    ]}
                  >
                    Operations
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tdTabBtn,
                    detailTab === "settlement" && styles.tdTabBtnActive,
                  ]}
                  onPress={() => setDetailTab("settlement")}
                  activeOpacity={0.88}
                >
                  <Text
                    style={[
                      styles.tdTabLabel,
                      {
                        color: detailTab === "settlement" ? "#ffffff" : colors.textMuted,
                      },
                    ]}
                  >
                    Settlement
                  </Text>
                </TouchableOpacity>
              </View>

              {detailTab === "journey" ? (
                <View style={{ marginBottom: 12 }}>
                  <View style={styles.tdTimelineHeader}>
                    <View style={styles.tdTimelineHeaderIcon}>
                      <Calendar size={13} color="#ffffff" />
                    </View>
                    <Text style={[styles.tdTimelineHeaderTitle, { color: colors.text }]}>
                      Trip Timeline
                    </Text>
                  </View>

                  {archiveMissionLog.length === 0 ? (
                    <View
                      style={[
                        styles.tdTimelineCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.tdEmptyTimeline, { color: colors.textMuted }]}>
                        No timeline events for this trip yet.
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.tdTimelineCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {archiveMissionLog.map((log, i) => {
                        const isLast = i === archiveMissionLog.length - 1;
                        const expanded = expandedLogIndex === i;
                        return (
                          <View key={`${log.status}-${i}`} style={styles.tdLogRowWrap}>
                            {!isLast ? (
                              <View
                                style={[styles.tdLogConnector, { backgroundColor: colors.border }]}
                              />
                            ) : null}
                            <TouchableOpacity
                              activeOpacity={0.85}
                              style={[
                                styles.tdLogTouchable,
                                expanded && {
                                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#f8fafc",
                                  borderRadius: 10,
                                },
                              ]}
                              onPress={() =>
                                setExpandedLogIndex(expanded ? null : i)
                              }
                            >
                              <View style={styles.tdLogMarkerCol}>
                                <TimelinePulseIcon expanded={expanded}>
                                  <View
                                    style={[
                                      styles.tdLogCircle,
                                      {
                                        backgroundColor: colors.emerald,
                                        borderColor: colors.surface,
                                      },
                                    ]}
                                  >
                                    <CheckCircle2 size={11} color="#ffffff" />
                                  </View>
                                </TimelinePulseIcon>
                              </View>
                              <View style={styles.tdLogBody}>
                                <View style={styles.tdLogHead}>
                                  <Text style={[styles.tdLogStatus, { color: colors.text }]}>
                                    {log.status}
                                  </Text>
                                  <View style={styles.tdLogHeadRight}>
                                    <Text style={[styles.tdLogTime, { color: colors.textMuted }]}>
                                      {log.time}
                                    </Text>
                                    {expanded ? (
                                      <ChevronUp size={14} color={colors.textMuted} />
                                    ) : (
                                      <ChevronDown size={14} color={colors.textMuted} />
                                    )}
                                  </View>
                                </View>
                                <Text
                                  style={[styles.tdLogLoc, { color: colors.textMuted }]}
                                  numberOfLines={expanded ? undefined : 2}
                                >
                                  {log.loc}
                                </Text>
                                {expanded ? (
                                  <View style={styles.tdLogExpanded}>
                                    {isInTransitStatus(log.status) ? (
                                      <View style={styles.tdLogInTransitGrid}>
                                        <View style={styles.tdLogInTransitCol}>
                                          <Text style={[styles.tdLogMetaK, { color: colors.textMuted }]}>
                                            Location
                                          </Text>
                                          <Text style={[styles.tdLogMetaV, { color: colors.text }]}>
                                            {log.loc}
                                          </Text>
                                        </View>
                                        <View style={styles.tdLogInTransitCol}>
                                          <Text style={[styles.tdLogMetaK, { color: colors.textMuted }]}>
                                            Timestamp
                                          </Text>
                                          <Text style={[styles.tdLogMetaV, { color: colors.text }]}>
                                            {formatLedgerDateTime(log.atIso)}
                                          </Text>
                                        </View>
                                      </View>
                                    ) : (
                                      <>
                                        <Text style={[styles.tdLogDetailsKicker, { color: colors.textMuted }]}>
                                          Details
                                        </Text>
                                        <View
                                          style={[
                                            styles.tdLogDetailsBox,
                                            {
                                              backgroundColor: colors.background,
                                              borderColor: colors.border,
                                            },
                                          ]}
                                        >
                                          <Text style={[styles.tdLogDetailsText, { color: colors.text }]}>
                                            {log.details}
                                          </Text>
                                        </View>
                                        <View style={styles.tdLogMetaGrid}>
                                          <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text style={[styles.tdLogMetaK, { color: colors.textMuted }]}>
                                              Timestamp
                                            </Text>
                                            <Text style={[styles.tdLogMetaV, { color: colors.textMuted }]}>
                                              {formatLedgerDateTime(log.atIso)}
                                            </Text>
                                          </View>
                                        </View>
                                      </>
                                    )}
                                  </View>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.tdTimelineHeader}>
                    <View style={styles.tdTimelineHeaderIcon}>
                      <FileImage size={13} color="#ffffff" />
                    </View>
                    <Text
                      style={[styles.tdTimelineHeaderTitle, { color: colors.text }]}
                    >
                      Proof of delivery
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tdTimelineCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {detailPodLoading ? (
                      <LoadingIndicator
                        style={{ paddingVertical: 22 }}
                        color={colors.emerald}
                      />
                    ) : detailPodDocuments.length >= 1 ? (
                      detailPodDocuments.map((doc, index) => {
                        const name =
                          doc.file_name ||
                          doc.storage_path.split("/").pop() ||
                          "POD";
                        return (
                          <View
                            key={doc.id}
                            style={[
                              styles.tdPodRow,
                              index < detailPodDocuments.length - 1
                                ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
                                : null,
                            ]}
                          >
                            <FileImage
                              size={15}
                              color={colors.emerald}
                              style={{ marginRight: 8 }}
                            />
                            <Text
                              style={[styles.tdPodFileName, { color: colors.text }]}
                              numberOfLines={1}
                            >
                              {name}
                            </Text>
                            <TouchableOpacity
                              onPress={async () => {
                                setPodPreviewError(false);
                                const cached = detailPodViewUrls[doc.id];
                                if (cached) {
                                  setPodPreviewUrl(cached);
                                  return;
                                }
                                setPodPreviewLoading(true);
                                setPodPreviewUrl(null);
                                const url =
                                  await tripDocumentsService.getDocumentViewUrl(
                                    doc.storage_path,
                                  );
                                setDetailPodViewUrls((prev) => ({
                                  ...prev,
                                  [doc.id]: url,
                                }));
                                setPodPreviewLoading(false);
                                setPodPreviewUrl(url);
                              }}
                              activeOpacity={0.85}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text
                                style={{
                                  color: colors.emerald,
                                  fontWeight: "800",
                                  fontSize: 13,
                                }}
                              >
                                View
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    ) : (
                      <Text
                        style={[
                          styles.tdEmptyTimeline,
                          { paddingVertical: 14, fontSize: 13 },
                        ]}
                      >
                        No proof of delivery uploaded for this trip.
                      </Text>
                    )}
                  </View>

                  {isCompleted(selectedTrip.status) ? (
                    <LinearGradient
                      colors={[Theme.driverEmeraldDark, Theme.driverEmerald]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.tdDeliveredBanner}
                    >
                      <View>
                        <Text style={styles.tdDeliveredKicker}>Status</Text>
                        <Text style={styles.tdDeliveredTitle}>DELIVERED SUCCESSFULLY</Text>
                      </View>
                      <View style={styles.tdDeliveredIconCircle}>
                        <CheckCircle2 size={24} color="#ffffff" />
                      </View>
                    </LinearGradient>
                  ) : (
                    <View
                      style={[
                        styles.tdProgressBanner,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View>
                        <Text style={[styles.tdProgressKicker, { color: colors.textMuted }]}>
                          Status
                        </Text>
                        <Text style={[styles.tdProgressTitle, { color: colors.text }]}>
                          {getTripProgressTitle(selectedTrip)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.tdDeliveredIconCircle,
                          { backgroundColor: `${colors.emerald}22` },
                        ]}
                      >
                        <Clock size={22} color={colors.emerald} />
                      </View>
                    </View>
                  )}
                </View>
              ) : null}

              {detailTab === "operations" && trip ? (
                <View style={{ marginBottom: 12 }}>
                  <DriverTripOperationsTab
                    trip={trip}
                    operationsSync={operationsSync}
                    initialSelectedExpenseId={initialSelectedExpenseId}
                  />
                </View>
              ) : null}

              {detailTab === "settlement" ? (
                <>
                  <TripDetailSettlementPanel trip={selectedTrip} />
                </>
              ) : null}
            </ScrollView>

            {showHistoryAttributionBar ? (
              <View
                style={[
                  histAttrStyles.stickyWrap,
                  {
                    bottom: Layout.tabBarDockHeight + 8,
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <Text style={[histAttrStyles.label, { color: colors.textMuted }]}>
                  Fleet attribution
                </Text>
                {isTripHistoryAttributed ? (
                  <View style={histAttrStyles.doneBadge}>
                    <FontAwesome name="check-circle" size={14} color="#d97706" />
                    <Text style={histAttrStyles.doneBadgeText}>
                      Sent to {historyCurrentEmployer?.orgName} for review
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={histAttrStyles.btn}
                    onPress={() => void handleHistoryAttributeTrip()}
                    disabled={attributeLoading}
                    activeOpacity={0.8}
                  >
                    <FontAwesome name="building" size={13} color="#d97706" />
                    <Text style={histAttrStyles.btnText}>
                      {attributeLoading
                        ? "Attributing…"
                        : `Attribute to ${historyCurrentEmployer?.orgName}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <Modal
              visible={!!podPreviewUrl || podPreviewLoading}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setPodPreviewUrl(null);
                setPodPreviewLoading(false);
                setPodPreviewError(false);
              }}
            >
              <Pressable
                style={[
                  styles.podPreviewBackdrop,
                  { paddingTop: insets.top, paddingBottom: insets.bottom },
                ]}
                onPress={() => {
                  setPodPreviewUrl(null);
                  setPodPreviewLoading(false);
                  setPodPreviewError(false);
                }}
              >
                <Pressable style={styles.podPreviewInner} onPress={() => {}}>
                  <TouchableOpacity
                    style={[
                      styles.podPreviewClose,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => {
                      setPodPreviewUrl(null);
                      setPodPreviewLoading(false);
                      setPodPreviewError(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <FontAwesome name="times" size={18} color={colors.text} />
                    <Text style={{ color: colors.text, fontWeight: "700", marginLeft: 8 }}>
                      Close
                    </Text>
                  </TouchableOpacity>
                  {podPreviewLoading ? (
                    <View style={styles.podPreviewImageBox}>
                      <LoadingIndicator size="large" color={colors.emerald} />
                      <Text style={{ color: colors.textMuted, marginTop: 12 }}>
                        Loading…
                      </Text>
                    </View>
                  ) : podPreviewUrl ? (
                    <>
                      <Image
                        source={{ uri: podPreviewUrl }}
                        style={styles.podPreviewImage}
                        resizeMode="contain"
                        onError={() => setPodPreviewError(true)}
                        onLoad={() => setPodPreviewError(false)}
                      />
                      {podPreviewError ? (
                        <View
                          style={[
                            styles.podPreviewFallback,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Text style={{ color: colors.textMuted, textAlign: "center" }}>
                            Preview not available. Open in browser to view.
                          </Text>
                          <TouchableOpacity
                            style={{
                              marginTop: 14,
                              backgroundColor: colors.emerald,
                              paddingVertical: 12,
                              paddingHorizontal: 20,
                              borderRadius: 12,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                            }}
                            onPress={() => void Linking.openURL(podPreviewUrl)}
                            activeOpacity={0.85}
                          >
                            <FontAwesome name="external-link" size={16} color="#fff" />
                            <Text style={{ color: "#fff", fontWeight: "700" }}>
                              Open in browser
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </Pressable>
              </Pressable>
            </Modal>
    </View>
  );
}

const histAttrStyles = StyleSheet.create({
  stickyWrap: {
    position: "absolute",
    left: Layout.screenPaddingHorizontal,
    right: Layout.screenPaddingHorizontal,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d97706",
    backgroundColor: "#fffbeb",
    alignSelf: "flex-start",
  },
  btnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#d97706",
  },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fef3c7",
    alignSelf: "flex-start",
  },
  doneBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#b45309",
  },
});

