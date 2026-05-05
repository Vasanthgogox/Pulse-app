import {
    driverBodyPrimary,
    driverBodySecondary,
} from "@/constants/DriverTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useAuth } from "@/contexts/AuthContext";
import {
    useDriverTheme,
    useDriverThemeColors,
} from "@/contexts/DriverThemeContext";
import { getLatestAssignmentAuditByTripIds } from "@/features/trips/services/trip-assignment-audit.service";
import { useDriverAvatarUri } from "@/lib/avatarUpload";
import {
    buildAssignerDisplayForTrip,
    humanizeAssignerDisplayName,
    resolveAssignerUserId,
} from "@/lib/driverAssignerDisplay";
import {
  buildDriverTripNumberMap,
  getDriverTripDisplayNumber,
} from "@/lib/driverTripSequence";
import { isAggregateTrip, tripEarningsForDriver } from "@/lib/driverUtils";
import { formatLedgerDateTime, formatTime } from "@/lib/format";
import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";
import { getOptimalRoute } from "@/services/routingService";
import * as tripDocumentsService from "@/services/tripDocumentsService";
import { supabase } from "@/lib/supabase";
import * as driversService from "@/services/driversService";
import * as tripsService from "@/services/tripsService";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useRouter } from "expo-router";
import {
    ArrowDownToLine,
    Banknote,
    Calendar,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Clock,
    FileImage,
    Info,
    MapPinned,
    MessageSquare,
    Navigation,
    Route,
    Search as SearchIcon,
    Share2,
    ShieldCheck,
    Sparkles,
    Wallet,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    ActivityIndicator,
    AppState,
    FlatList,
    Image,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
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

// Reference layout: Royal Emerald trip card (app/driver/referenced TripHistoryView)
const TRIP_CARD_REF = {
  listBg: "rgba(250,250,250,0.4)",
  cardBg: "#ffffff",
  border: "#f4f4f5",
  divider: "#fafafa",
  label: "#a1a1aa",
  title: "#18181b",
  body: "#27272a",
  emerald: Theme.driverEmerald,
  emeraldYield: Theme.driverPrimary,
  muted: "#a1a1aa",
  badgeCompletedBg: "#18181b",
  accentBar: Theme.driverEmerald,
};

// Reference: trip detail / archive view (app/driver/referenced selectedHistoryItem)
const DETAIL_REF = {
  pageBg: "#ffffff",
  headerBorder: "#f4f4f5",
  headerTitle: "#18181b",
  routeCardBg: "#18181b",
  routeCardBorder: Theme.driverEmerald,
  routeCardLabel: "#71717a",
  routeCardBorderTop: "rgba(255,255,255,0.05)",
  yieldSectionLabel: "#a1a1aa",
  yieldCardBg: "#fafafa",
  yieldCardBorder: "#f4f4f5",
  yieldRowBorder: "rgba(0,0,0,0.06)",
  yieldRowLabel: "#71717a",
  yieldNetLabel: "#18181b",
  emerald: Theme.driverEmerald,
};

function isCompleted(status: string) {
  const s = (status || "").toLowerCase();
  return s === "completed" || s === "delivered" || s === "done";
}

function isAssignedNotStarted(status: string) {
  const s = (status || "").toLowerCase();
  return s === "assigned" || s === "pending" || s === "scheduled";
}

function isTransitStatus(status: string) {
  const s = (status || "").toLowerCase();
  return s === "in_transit" || s === "transit";
}

function isPickupProgressStatus(status: string) {
  const s = (status || "").toLowerCase();
  return s === "in_progress" || s === "pickup" || s === "picked_up" || s === "started";
}

function isAtDropStatus(status: string) {
  const s = (status || "").toLowerCase();
  return s === "at_drop";
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
void UUID_V4_RE;

function normalizeAssignerName(raw: unknown): string | null {
  return humanizeAssignerDisplayName(String(raw ?? ""));
}

function getTripStageBadgeLabel(trip: tripsService.TripRow): string {
  if (isCompleted(trip.status)) return "COMPLETED";
  if (isAssignedNotStarted(trip.status) && !trip.started_at) return "ASSIGNED";
  if (isAtDropStatus(trip.status)) return "AT DROP";
  if (isTransitStatus(trip.status) || (String(trip.status || "").toLowerCase() === "in_progress" && !!trip.started_at)) {
    return "IN TRANSIT";
  }
  return "PICKUP";
}

function getTripProgressTitle(trip: tripsService.TripRow): string {
  if (isCompleted(trip.status)) return "DELIVERED SUCCESSFULLY";
  if (isAssignedNotStarted(trip.status) && !trip.started_at) return "AWAITING ACCEPTANCE";
  if (isAtDropStatus(trip.status)) return "AT DROP-OFF LOCATION";
  if (isTransitStatus(trip.status) || (String(trip.status || "").toLowerCase() === "in_progress" && !!trip.started_at)) {
    return "TRIP IN PROGRESS";
  }
  if (isPickupProgressStatus(trip.status)) return "AT PICKUP STAGE";
  return "ACTIVE TRIP";
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
  const estimated = trip.estimated_duration?.trim();
  if (trip.started_at && trip.completed_at) {
    const start = new Date(trip.started_at).getTime();
    const end = new Date(trip.completed_at).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    if (hours < 0 || hours < 0.05) {
      // If lifecycle timestamps are too close/noisy, prefer DB ETA.
      if (estimated) return formatEstimatedDuration(estimated);
      return "—";
    }
    if (hours >= 24) {
      const d = Math.floor(hours / 24);
      const h = Math.round(hours % 24);
      return h > 0 ? `${d}D ${h}H` : `${d}D`;
    }
    const hRounded = Math.round(hours * 10) / 10;
    if (hRounded > 0) return `${hRounded}H`;
    if (estimated) return formatEstimatedDuration(estimated);
    return "—";
  }
  if (estimated) {
    const asNum = parseFloat(estimated.replace(/[^0-9.]/g, ""));
    if (Number.isNaN(asNum) || asNum <= 0) return "—";
    return formatEstimatedDuration(estimated);
  }
  return "—";
}

function toEtaInterval(durationSeconds: number): string {
  const totalSeconds = Math.max(0, Math.round(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function parseTripCoordinate(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface MissionLogEntry {
  time: string;
  status: string;
  loc: string;
  details: string;
  /** ISO timestamp for expanded row (full date/time display). */
  atIso: string | null;
}

function isInTransitStatus(status: string): boolean {
  return status.trim().toLowerCase() === "in transit";
}

/** Pulse the timeline node when the row is expanded (draws attention without clipping). */
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

/** Trip log from trip timestamps (Assigned → Pickup → In-transit → Delivered). */
function buildMissionLog(trip: tripsService.TripRow): MissionLogEntry[] {
  const entries: MissionLogEntry[] = [];
  if (trip.created_at) {
    entries.push({
      time: formatTime(trip.created_at),
      status: "Assigned",
      loc: trip.pickup_area || "—",
      details:
        "Trip ID assigned to pilot. Vehicle ready for pickup at the scheduled origin.",
      atIso: trip.created_at,
    });
  }
  if (trip.started_at) {
    entries.push({
      time: formatTime(trip.started_at),
      status: "Pickup",
      loc: trip.pickup_area || "—",
      details:
        "Cargo verified at origin. Load confirmed and departure logged for this trip.",
      atIso: trip.started_at,
    });
    entries.push({
      time: formatTime(trip.started_at),
      status: "In transit",
      loc: trip.pickup_area || "—",
      details:
        "Route progress updated. Movement tracked toward the destination.",
      atIso: trip.started_at,
    });
  }
  if (trip.completed_at) {
    entries.push({
      time: formatTime(trip.completed_at),
      status: "Delivered",
      loc: trip.drop_location || "—",
      details:
        "Handed over at destination. Trip marked complete and eligible for settlement.",
      atIso: trip.completed_at,
    });
  }
  if (entries.length === 0 && trip.created_at) {
    entries.push({
      time: formatTime(trip.created_at),
      status: "Assigned",
      loc: trip.pickup_area || "—",
      details:
        "Trip ID assigned to pilot. Vehicle ready for pickup at the scheduled origin.",
      atIso: trip.created_at,
    });
  }
  return entries;
}

interface TripSettlementBreakdown {
  fareEarnings: number;
  partnerBonus: number;
  taxDeductions: number;
  netPayout: number;
  isSalary: boolean;
}

function _getTripSettlementBreakdown(
  trip: tripsService.TripRow,
): TripSettlementBreakdown {
  const isSalary = isAggregateTrip(trip);
  if (isSalary) {
    return {
      fareEarnings: 0,
      partnerBonus: 0,
      taxDeductions: 0,
      netPayout: 0,
      isSalary: true,
    };
  }

  const explicitCommission = Math.max(0, Number(trip.driver_commission ?? 0));
  const fallbackBaseFromSupplier = Math.max(
    0,
    Math.round((Number(trip.supplier_rate ?? 0) || 0) * 0.1),
  );
  const fallbackBaseFromClient = Math.max(
    0,
    Math.round((Number(trip.client_price ?? 0) || 0) * 0.1),
  );
  const fallbackBase = fallbackBaseFromSupplier || fallbackBaseFromClient;
  const fareEarnings = explicitCommission > 0 ? explicitCommission : fallbackBase;
  const partnerBonus = Math.max(0, explicitCommission - fallbackBase);
  const taxDeductions = 0;
  const netPayout = Math.max(0, fareEarnings + partnerBonus - taxDeductions);

  return { fareEarnings, partnerBonus, taxDeductions, netPayout, isSalary };
}
void _getTripSettlementBreakdown;

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
      style={[styles.cardRefAccentLeft, { backgroundColor }, animatedStyle, { pointerEvents: 'none' }]}
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
  const { avatarUri } = useDriverAvatarUri();
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [invites, setInvites] = useState<
    Awaited<ReturnType<typeof driversService.getDriverInvitesReceived>>["invites"]
  >([]);
  const [trips, setTrips] = useState<tripsService.TripRow[]>([]);
  const [assignmentActorByTripId, setAssignmentActorByTripId] = useState<
    Record<string, string>
  >({});
  const [assignerNamesByUserId, setAssignerNamesByUserId] = useState<
    Record<string, string>
  >({});
  const [assignerOrgNameByUserId, setAssignerOrgNameByUserId] = useState<
    Record<string, string>
  >({});
  const [assignerDisplayByTripId, setAssignerDisplayByTripId] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const [selectedTrip, setSelectedTrip] = useState<tripsService.TripRow | null>(
    null,
  );
  const [routeMetricsByTripId, setRouteMetricsByTripId] = useState<
    Record<string, { distance: number; estimated_duration: string }>
  >({});
  const [pressedCardId, setPressedCardId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"journey" | "settlement">(
    "journey",
  );
  /** Expanded row index in trip detail timeline (modal). */
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tripView, setTripView] = useState<"active" | "history">("active");

  /** POD attachments for trip detail modal — same source as dispatcher (trip_documents + storage fallback). */
  const [detailPodDocuments, setDetailPodDocuments] = useState<
    tripDocumentsService.TripDocumentRow[]
  >([]);
  const [detailPodLoading, setDetailPodLoading] = useState(false);
  const [detailPodViewUrls, setDetailPodViewUrls] = useState<
    Record<string, string>
  >({});
  const detailPodUrlRequestedRef = useRef<Set<string>>(new Set());
  const [podPreviewUrl, setPodPreviewUrl] = useState<string | null>(null);
  const [podPreviewLoading, setPodPreviewLoading] = useState(false);
  const [podPreviewError, setPodPreviewError] = useState(false);

  useEffect(() => {
    setExpandedLogIndex(null);
    setDetailTab("journey");
  }, [selectedTrip?.id]);

  useEffect(() => {
    if (!selectedTrip?.id) {
      setDetailPodDocuments([]);
      setDetailPodViewUrls({});
      detailPodUrlRequestedRef.current.clear();
      setPodPreviewUrl(null);
      setPodPreviewLoading(false);
      setPodPreviewError(false);
      return;
    }
    const tid = selectedTrip.id;
    detailPodUrlRequestedRef.current.clear();
    setDetailPodViewUrls({});
    setDetailPodLoading(true);
    let cancelled = false;
    tripDocumentsService.getDocumentsByTripId(tid).then(({ documents, error }) => {
      if (cancelled) return;
      setDetailPodLoading(false);
      if (!error) setDetailPodDocuments(documents);
      else setDetailPodDocuments([]);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTrip?.id]);

  useEffect(() => {
    detailPodDocuments.forEach((doc) => {
      if (detailPodUrlRequestedRef.current.has(doc.id)) return;
      detailPodUrlRequestedRef.current.add(doc.id);
      tripDocumentsService.getDocumentViewUrl(doc.storage_path).then((url) => {
        setDetailPodViewUrls((prev) =>
          prev[doc.id] ? prev : { ...prev, [doc.id]: url },
        );
      });
    });
  }, [detailPodDocuments]);

  useEffect(() => {
    const trip = selectedTrip;
    if (!trip) return;

    const tripId = String(trip.id ?? "").trim();
    const hasDistance = trip.distance != null && String(trip.distance).trim() !== "";
    const hasEta =
      trip.estimated_duration != null && trip.estimated_duration.trim() !== "";
    if (!tripId || (hasDistance && hasEta)) return;

    const pickupLat = parseTripCoordinate(trip.pickup_lat);
    const pickupLon = parseTripCoordinate(trip.pickup_lon);
    const dropLat = parseTripCoordinate(trip.drop_lat);
    const dropLon = parseTripCoordinate(trip.drop_lon);
    const hasCoords =
      pickupLat != null &&
      pickupLon != null &&
      dropLat != null &&
      dropLon != null;
    if (!hasCoords) return;

    let cancelled = false;
    const hydrateRouteMetrics = async () => {
      const route = await getOptimalRoute(
        { latitude: pickupLat, longitude: pickupLon },
        { latitude: dropLat, longitude: dropLon },
      );
      if (cancelled || !route) return;

      const distanceKm = Math.max(1, Math.round(route.distance / 1000));
      const etaInterval = toEtaInterval(route.duration);

      setRouteMetricsByTripId((prev) => ({
        ...prev,
        [tripId]: { distance: distanceKm, estimated_duration: etaInterval },
      }));

      const { trip: updated } = await tripsService.updateTripRouteMetrics(tripId, {
        distance: hasDistance ? undefined : distanceKm,
        estimated_duration: hasEta ? undefined : etaInterval,
      });
      if (cancelled || !updated) return;

      setTrips((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setSelectedTrip((prev) => (prev?.id === updated.id ? updated : prev));
    };
    void hydrateRouteMetrics();
    return () => {
      cancelled = true;
    };
  }, [selectedTrip]);

  const fetch = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    driversService.getLinkedDriversForCurrentUser(profile.uid).then((res) => {
      if (res.error && __DEV__) {
        console.warn("[trip-history] getLinkedDriversForCurrentUser:", res.error.message);
      }
      const drivers = (res.drivers ?? []).filter((d) => !d.left_at);
      if (drivers.length > 0) {
        setDriver(drivers[0]);
        Promise.all([
          tripsService.getTripsByDriverIds(drivers.map((d) => d.id)),
          driversService.getDriverInvitesReceived(),
        ])
          .then(([tRes, invitesRes]) => {
            if (tRes.error && __DEV__) {
              console.warn("[trip-history] getTripsByDriverIds:", tRes.error.message);
            }
            if (invitesRes.error && __DEV__) {
              console.warn("[trip-history] getDriverInvitesReceived:", invitesRes.error.message);
            }
            setTrips(tRes.error ? [] : (tRes.trips ?? []));
            setInvites(invitesRes.error ? [] : (invitesRes.invites ?? []));
            setLoading(false);
            initialLoadDoneRef.current = true;
            isRefreshingRef.current = false;
            setRefreshing(false);
          })
          .catch((e) => {
            if (__DEV__) console.warn("[trip-history] trips/invites fetch failed:", e);
            setTrips([]);
            setInvites([]);
            setLoading(false);
            initialLoadDoneRef.current = true;
            isRefreshingRef.current = false;
            setRefreshing(false);
          });
      } else {
        setTrips([]);
        setInvites([]);
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
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

  useEffect(() => {
    let cancelled = false;
    const loadAssignmentActors = async () => {
      const tripIds = trips
        .map((trip) => String(trip.id ?? "").trim())
        .filter((id) => id.length > 0);
      if (tripIds.length === 0) {
        if (!cancelled) setAssignmentActorByTripId({});
        return;
      }
      const { byTripId } = await getLatestAssignmentAuditByTripIds(tripIds);
      if (cancelled) return;
      const next: Record<string, string> = {};
      byTripId.forEach((value, key) => {
        const actorId = String(value.changed_by ?? "").trim();
        if (actorId) next[key] = actorId;
      });
      setAssignmentActorByTripId(next);
    };
    void loadAssignmentActors();
    return () => {
      cancelled = true;
    };
  }, [trips]);

  useEffect(() => {
    let cancelled = false;
    const loadAssignerSources = async () => {
      const tripIds = trips
        .map((trip) => String(trip.id ?? "").trim())
        .filter((id) => id.length > 0);
      if (tripIds.length === 0) {
        if (!cancelled) {
          setAssignerNamesByUserId({});
          setAssignerOrgNameByUserId({});
          setAssignerDisplayByTripId({});
        }
        return;
      }

      const { data: assignerRpcRows, error: assignerRpcError } = await supabase().rpc(
        "get_trip_assigner_displays_for_driver",
        { p_trip_ids: tripIds },
      );
      if (!cancelled && !assignerRpcError && Array.isArray(assignerRpcRows)) {
        const byTrip: Record<string, string> = {};
        for (const row of assignerRpcRows as Array<{
          trip_id?: string;
          display_name?: string | null;
        }>) {
          const tid = row.trip_id != null ? String(row.trip_id) : "";
          const dn = normalizeAssignerName(row.display_name ?? "");
          if (tid && dn) byTrip[tid] = dn;
        }
        setAssignerDisplayByTripId(byTrip);
      }

      const userIds = Array.from(
        new Set(
          trips
            .map((trip) => resolveAssignerUserId(trip, assignmentActorByTripId))
            .filter((id) => id.length > 0),
        ),
      );
      if (userIds.length === 0) {
        if (!cancelled) {
          setAssignerNamesByUserId({});
          setAssignerOrgNameByUserId({});
        }
        return;
      }
      const { data, error } = await supabase()
        .from("profiles")
        .select("id, full_name, email, company_name")
        .in("id", userIds);
      if (!cancelled && !error) {
        const byId: Record<string, string> = {};
        const orgById: Record<string, string> = {};
        for (const row of
          (data ?? []) as Array<{
            id: string;
            full_name?: string | null;
            email?: string | null;
            company_name?: string | null;
          }>) {
          const fallbackEmailName =
            (row.email ?? "").trim().split("@")[0]?.trim() || "Dispatcher";
          byId[row.id] = (row.full_name ?? "").trim() || fallbackEmailName;
          const company = (row.company_name ?? "").trim();
          if (company) orgById[row.id] = company;
        }
        setAssignerNamesByUserId(byId);
        setAssignerOrgNameByUserId(orgById);
      }
    };
    void loadAssignerSources();
    return () => {
      cancelled = true;
    };
  }, [trips, assignmentActorByTripId]);

  const organizationNamesById = useMemo(() => {
    const byId: Record<string, string> = {};
    for (const inv of invites) {
      const orgId = String(inv.from_organization_id ?? "").trim();
      const orgName = String(inv.from_org_name ?? "").trim();
      if (!orgId || !orgName) continue;
      byId[orgId] = orgName;
    }
    return byId;
  }, [invites]);

  const assignerByTripId = useMemo(() => {
    const byTrip: Record<string, string> = {};
    for (const trip of trips) {
      const tid = String(trip.id ?? "").trim();
      if (!tid) continue;
      byTrip[tid] = buildAssignerDisplayForTrip(
        trip,
        invites,
        driver?.organization_id ?? null,
        {
          assignmentActorByTripId,
          assignerNamesByUserId,
          assignerOrgNameByUserId,
          assignerDisplayByTripId,
          organizationNamesById,
        },
      ).assignedByName;
    }
    return byTrip;
  }, [
    trips,
    driver?.organization_id,
    assignmentActorByTripId,
    assignerNamesByUserId,
    assignerOrgNameByUserId,
    assignerDisplayByTripId,
    invites,
    organizationNamesById,
  ]);

  const getEarning = (trip: tripsService.TripRow) => {
    const amount = tripEarningsForDriver(trip);
    if (amount <= 0) return isAggregateTrip(trip) ? "SALARY" : "—";
    return `₹${Math.round(amount).toLocaleString()}`;
  };

  const getEarningAmount = (trip: tripsService.TripRow): number =>
    tripEarningsForDriver(trip);

  const getGrossRevenue = (trip: tripsService.TripRow): "SALARY" | number => {
    if (isAggregateTrip(trip)) return "SALARY";
    return Number(trip.client_price ?? 0) || 0;
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
  const driverTripNumberById = useMemo(
    () => buildDriverTripNumberMap(trips),
    [trips],
  );
  const selectedTripAssigner = useMemo(
    () =>
      selectedTrip
        ? assignerByTripId[String(selectedTrip.id)] ?? "Fleet dispatcher"
        : "Fleet dispatcher",
    [selectedTrip, assignerByTripId],
  );
  const selectedTripRouteFallback = useMemo(() => {
    if (!selectedTrip) return null;
    return routeMetricsByTripId[String(selectedTrip.id)] ?? null;
  }, [selectedTrip, routeMetricsByTripId]);
  const selectedTripDistanceDisplay = useMemo(() => {
    if (!selectedTrip) return "—";
    return formatDistance(selectedTrip.distance ?? selectedTripRouteFallback?.distance);
  }, [selectedTrip, selectedTripRouteFallback]);
  const selectedTripDurationDisplay = useMemo(() => {
    if (!selectedTrip) return "—";
    if (selectedTrip.estimated_duration?.trim()) {
      return formatDurationForTrip(selectedTrip);
    }
    if (selectedTripRouteFallback?.estimated_duration) {
      return formatEstimatedDuration(selectedTripRouteFallback.estimated_duration);
    }
    return formatDurationForTrip(selectedTrip);
  }, [selectedTrip, selectedTripRouteFallback]);
  const filteredTrips = useMemo(() => {
    let list = [...trips];

    list = list.filter((trip) =>
      tripView === "history" ? isCompleted(trip.status) : !isCompleted(trip.status),
    );

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((trip) => {
        const ref = getDriverTripDisplayNumber(trip, driverTripNumberById).toLowerCase();
        const pickup = (trip.pickup_area ?? "").toLowerCase();
        const drop = (trip.drop_location ?? "").toLowerCase();
        const status = (trip.status ?? "").toLowerCase();
        return (
          ref.includes(q) ||
          pickup.includes(q) ||
          drop.includes(q) ||
          status.includes(q)
        );
      });
    }

    list.sort((a, b) => {
      const dateA = new Date(a.pickup_date ?? a.created_at ?? "").getTime();
      const dateB = new Date(b.pickup_date ?? b.created_at ?? "").getTime();
      const safeA = Number.isFinite(dateA) ? dateA : 0;
      const safeB = Number.isFinite(dateB) ? dateB : 0;
      return safeB - safeA;
    });

    return list;
  }, [trips, tripView, searchQuery, driverTripNumberById]);
  const historyTripsCount = useMemo(
    () => trips.filter((trip) => isCompleted(trip.status)).length,
    [trips],
  );
  const activeTripsCount = useMemo(
    () => trips.filter((trip) => !isCompleted(trip.status)).length,
    [trips],
  );
  const poolCountForTab = tripView === "history" ? historyTripsCount : activeTripsCount;

  const renderItem = ({ item }: { item: tripsService.TripRow }) => {
    const completed = isCompleted(item.status);
    const badgeLabel = getTripStageBadgeLabel(item);
    const pickupParts = splitLocationPrimarySecondary(item.pickup_area);
    const dropParts = splitLocationPrimarySecondary(item.drop_location);
    const corridorHint = [pickupParts.secondary, dropParts.secondary].filter(Boolean).join(" · ");
    const assignerDisplay =
      assignerByTripId[String(item.id)] ?? "Fleet dispatcher";
    return (
      <TouchableOpacity
        style={[
          styles.cardRef,
          {
            backgroundColor: colors.surface,
            borderColor: isDark ? colors.borderSubtle : "rgba(16, 185, 129, 0.12)",
          },
        ]}
        onPress={() => {
          setSelectedTrip(item);
          void tripsService.getTripById(item.id).then((res) => {
            if (!res.trip) return;
            setTrips((prev) =>
              prev.map((row) => (row.id === res.trip!.id ? res.trip! : row)),
            );
            setSelectedTrip((prev) =>
              prev?.id === res.trip!.id ? res.trip! : prev,
            );
          });
        }}
        onPressIn={() => setPressedCardId(item.id)}
        onPressOut={() => setPressedCardId(null)}
        activeOpacity={1}
      >
        {/* Emerald accent strip — left edge, fades in on press */}
        <AnimatedAccentBar
          pressed={pressedCardId === item.id}
          backgroundColor={colors.emerald}
        />
        <AnimatedCardScale pressed={pressedCardId === item.id}>
          <View style={styles.cardWatermark} pointerEvents="none">
            <MapPinned size={140} color={colors.emerald} strokeWidth={1.2} />
          </View>
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
                {getDriverTripDisplayNumber(item, driverTripNumberById)}{" "}
                <Text style={{ color: isDark ? colors.borderSubtle : "#e2e8f0" }}> • </Text>{" "}
                {formatDate(item.pickup_date ?? item.created_at)}
              </Text>
              <View style={styles.routeRowRef}>
                <Text
                  style={[styles.routeRefPickup, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {pickupParts.primary}
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
                  {dropParts.primary}
                </Text>
              </View>
              {corridorHint.length > 0 ? (
                <Text
                  style={[styles.routeCorridorHint, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {corridorHint}
                </Text>
              ) : null}
              <Text
                style={[styles.cardAssignedByLine, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                Assigned by {assignerDisplay}
              </Text>
            </View>
            <View
              style={[
                styles.badgeRef,
                completed
                  ? { backgroundColor: isDark ? "#0f172a" : "#0f172a" }
                  : { backgroundColor: colors.emerald },
              ]}
            >
              <Text
                style={[styles.badgeRefText, { color: colors.textOnPrimary }]}
              >
                {badgeLabel}
              </Text>
            </View>
          </View>
          <View
            style={[styles.cardRefBottom, { borderTopColor: isDark ? colors.borderSubtle : "#f8fafc" }]}
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
                Distance
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
                Yield
              </Text>
              <Text
                style={[
                  styles.yieldValueRef,
                  styles.yieldValueRefLarge,
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
        <Text style={[styles.creditsTitle, { color: Theme.driverEmeraldDark }]}>
          TRIPS.
        </Text>
        <Text style={[styles.creditsSubtitle, { color: colors.textMuted }]}>
          Trip history & route archive
        </Text>
      </View>
      <View
        style={[
          styles.toolbarWrap,
          { backgroundColor: colors.background },
        ]}
      >
        <View style={styles.toolbarTopRow}>
          <View
            style={[
              styles.searchWrap,
              {
                backgroundColor: colors.surface,
                borderColor: isDark ? colors.borderSubtle : "rgba(16, 185, 129, 0.15)",
              },
            ]}
          >
            <SearchIcon size={20} color={colors.textMuted} strokeWidth={2} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search trip IDs, routes…"
              placeholderTextColor={colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              returnKeyType="search"
            />
          </View>
          <View
            style={[
              styles.segmentOuter,
              {
                backgroundColor: isDark ? colors.surfaceElevated : "rgba(241, 245, 249, 0.65)",
                borderColor: isDark ? colors.borderSubtle : "#ffffff",
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                tripView === "active" && [
                  styles.segmentBtnActive,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isDark ? colors.borderSubtle : colors.border,
                  },
                ],
              ]}
              onPress={() => setTripView("active")}
              activeOpacity={0.8}
            >
              <View style={styles.segmentLabelRow}>
                <Text
                  style={[
                    styles.segmentLabel,
                    {
                      color:
                        tripView === "active" ? colors.emerald : colors.textMuted,
                    },
                  ]}
                  numberOfLines={1}
                >
                  Active
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                tripView === "history" && [
                  styles.segmentBtnActive,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isDark ? colors.borderSubtle : colors.border,
                  },
                ],
              ]}
              onPress={() => setTripView("history")}
              activeOpacity={0.8}
            >
              <View style={styles.segmentLabelRow}>
                <Text
                  style={[
                    styles.segmentLabel,
                    {
                      color:
                        tripView === "history" ? colors.emerald : colors.textMuted,
                    },
                  ]}
                  numberOfLines={1}
                >
                  History
                </Text>
                <View
                  style={[
                    styles.segmentCountBadge,
                    {
                      backgroundColor:
                        tripView === "history" ? colors.emerald : colors.surface,
                      borderColor: tripView === "history" ? colors.emerald : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentCountBadgeText,
                      {
                        color:
                          tripView === "history" ? colors.textOnPrimary : colors.textMuted,
                      },
                    ]}
                  >
                    {historyTripsCount}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.toolbarFooter}>
          <Text style={[styles.resultMeta, { color: colors.textMuted }]}>
            Showing {filteredTrips.length} of {poolCountForTab}
          </Text>
          {searchQuery.trim().length > 0 ? (
            <TouchableOpacity
              style={[
                styles.clearBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => setSearchQuery("")}
              activeOpacity={0.8}
            >
              <Text style={[styles.clearBtnText, { color: colors.text }]}>Clear</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.clearBtnPlaceholder} />
          )}
        </View>
      </View>
      <FlatList
        data={filteredTrips}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 80 },
        ]}
        ListEmptyComponent={
          filteredTrips.length === 0 ? (
            tripView === "active" && searchQuery.trim().length === 0 ? (
              <View style={styles.emptyActiveWrap}>
                <View
                  style={[
                    styles.emptyActiveIconCircle,
                    {
                      backgroundColor: colors.whiteMuted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <FontAwesome name="send-o" size={26} color={colors.emerald} />
                </View>
                <Text style={[styles.emptyActiveTitle, { color: colors.text }]}>
                  No active trips right now
                </Text>
                <Text
                  style={[styles.emptyActiveSubtitle, { color: colors.textMuted }]}
                >
                  Fresh assignments appear here instantly once dispatched.
                </Text>
                {historyTripsCount > 0 ? (
                  <TouchableOpacity
                    style={[
                      styles.emptyActiveButton,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    onPress={() => setTripView("history")}
                    activeOpacity={0.85}
                  >
                    <FontAwesome
                      name="history"
                      size={12}
                      color={colors.text}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[styles.emptyActiveButtonText, { color: colors.text }]}
                    >
                      View history
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View style={styles.empty}>
                <FontAwesome
                  name="history"
                  size={40}
                  color={colors.tabInactive}
                />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  {trips.length === 0
                    ? "No trips completed yet"
                    : tripView === "history" && activeTripsCount > 0 && historyTripsCount === 0
                      ? "History lists delivered & completed trips only. Open Active for trips in progress."
                      : "No trips found"}
                </Text>
              </View>
            )
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
                  paddingTop: 12,
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
                  size={22}
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
                      setSelectedTrip(null);
                      setTimeout(() => {
                        router.push(`/(driver)/chat?tripId=${id}` as Href);
                      }, 0);
                    }}
                    activeOpacity={0.75}
                    accessibilityLabel="Trip chat"
                  >
                    <MessageSquare size={20} color={colors.text} />
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
                  <Share2 size={20} color={colors.text} />
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
                  paddingBottom: Layout.modalBottomPadding + insets.bottom,
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
                          {selectedTripPickupParts.primary.toUpperCase()}
                        </Text>
                        <Text style={styles.tdHeroState} numberOfLines={1}>
                          {(selectedTripPickupParts.secondary ?? "Origin").toUpperCase()}
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
                          {selectedTripDropParts.primary.toUpperCase()}
                        </Text>
                        <Text style={[styles.tdHeroState, styles.tdHeroStateRight]} numberOfLines={1}>
                          {(selectedTripDropParts.secondary ?? "Destination").toUpperCase()}
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
                            {selectedTripDistanceDisplay}
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
                            {selectedTripDurationDisplay}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.tdHeroAssignerRow}>
                      <ShieldCheck size={14} color={Theme.driverPrimary} />
                      <Text style={styles.tdHeroAssignerLabel}>Assigned by</Text>
                      <Text style={styles.tdHeroAssignerValue} numberOfLines={1}>
                        {selectedTripAssigner}
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
                    Journey Log
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
                <View style={{ marginBottom: 20 }}>
                  <View style={styles.tdTimelineHeader}>
                    <View style={styles.tdTimelineHeaderIcon}>
                      <Calendar size={16} color="#ffffff" />
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
                                  borderRadius: 16,
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
                                    <CheckCircle2 size={14} color="#ffffff" />
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
                                      <ChevronUp size={16} color={colors.textMuted} />
                                    ) : (
                                      <ChevronDown size={16} color={colors.textMuted} />
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
                      <FileImage size={16} color="#ffffff" />
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
                      <ActivityIndicator
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
                              size={18}
                              color={colors.emerald}
                              style={{ marginRight: 10 }}
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

              {detailTab === "settlement" ? (
                <View style={{ marginBottom: 20 }}>
                  <View style={styles.tdSettlementGlow}>
                    <View
                      style={[
                        styles.tdNetCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.tdNetBlur} pointerEvents="none" />
                      <View style={styles.tdNetHeader}>
                        <View style={styles.tdNetWalletIcon}>
                          <Wallet size={28} color={colors.emerald} />
                        </View>
                        <Text style={[styles.tdNetKicker, { color: colors.textMuted }]}>
                          Net Payout
                        </Text>
                        <View style={styles.tdNetAmountRow}>
                          {getEarning(selectedTrip) === "SALARY" ? null : (
                            <Text style={[styles.tdNetRupee, { color: colors.textMuted }]}>
                              ₹
                            </Text>
                          )}
                          <Text
                            style={[styles.tdNetAmount, { color: colors.text }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            {getEarning(selectedTrip) === "SALARY"
                              ? "SALARY"
                              : Math.round(getEarningAmount(selectedTrip)).toLocaleString()}
                          </Text>
                        </View>
                        <View style={[styles.tdNetSuccessPill, { backgroundColor: `${colors.emerald}22` }]}>
                          <CheckCircle2 size={16} color={colors.emerald} />
                          <Text style={[styles.tdNetSuccessText, { color: colors.emerald }]}>
                            Settlement Success
                          </Text>
                        </View>
                      </View>
                      <View style={styles.tdNetMiniGrid}>
                        <View style={[styles.tdNetMiniCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Text style={[styles.tdNetMiniK, { color: colors.textMuted }]}>
                            Gross total
                          </Text>
                          <Text style={[styles.tdNetMiniV, { color: colors.text }]}>
                            {getGrossRevenue(selectedTrip) === "SALARY"
                              ? "SALARY"
                              : `₹${Number(getGrossRevenue(selectedTrip)).toLocaleString()}`}
                          </Text>
                        </View>
                        <View style={[styles.tdNetMiniCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Text style={[styles.tdNetMiniK, { color: colors.textMuted }]}>
                            Deductions
                          </Text>
                          <Text style={[styles.tdNetMiniV, { color: Theme.negative }]}>
                            -₹0
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={styles.tdEarningsHeader}>
                    <Text style={[styles.tdEarningsHeaderTitle, { color: colors.textMuted }]}>
                      Earnings detail
                    </Text>
                    <Info size={16} color={colors.textMuted} />
                  </View>

                  <View
                    style={[
                      styles.tdBreakdownCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.tdBreakRow}>
                      <View style={styles.tdBreakLeft}>
                        <View style={[styles.tdBreakIcon, { backgroundColor: colors.border }]}>
                          <Banknote size={20} color={colors.textMuted} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.tdBreakTitle, { color: colors.text }]}>
                            Base fare
                          </Text>
                          <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                            Calculation based on route distance
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.tdBreakValue, { color: colors.text }]}>
                        {getGrossRevenue(selectedTrip) === "SALARY"
                          ? "SALARY"
                          : `₹${Number(getGrossRevenue(selectedTrip)).toLocaleString()}`}
                      </Text>
                    </View>

                    <View style={[styles.tdBreakRowHighlight, { backgroundColor: `${colors.emerald}18` }]}>
                      <View style={styles.tdBreakLeft}>
                        <View style={[styles.tdBreakIcon, { backgroundColor: `${colors.emerald}33` }]}>
                          <Sparkles size={20} color={colors.emerald} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.tdBreakTitleRow}>
                            <Text style={[styles.tdBreakTitle, { color: colors.text }]}>
                              Partner bonus
                            </Text>
                            <View style={[styles.tdActiveBadge, { backgroundColor: colors.emerald }]}>
                              <Text style={styles.tdActiveBadgeText}>Active</Text>
                            </View>
                          </View>
                          <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                            Precision pilot multiplier applied
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.tdBreakValue, { color: colors.emerald }]}>
                        {getEarning(selectedTrip) === "SALARY"
                          ? "—"
                          : `+₹${Math.round(getEarningAmount(selectedTrip)).toLocaleString()}`}
                      </Text>
                    </View>

                    <View style={styles.tdBreakRow}>
                      <View style={styles.tdBreakLeft}>
                        <View style={[styles.tdBreakIcon, { backgroundColor: `${Theme.negative}22` }]}>
                          <ShieldCheck size={20} color={Theme.negative} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.tdBreakTitle, { color: colors.text }]}>
                            TDS / Platform
                          </Text>
                          <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                            Standard regulatory overhead
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.tdBreakValue, { color: Theme.negative }]}>
                        -₹0
                      </Text>
                    </View>
                  </View>

                  <View style={styles.tdSettledBar}>
                    <View style={styles.tdSettledLeft}>
                      <View style={styles.tdSettledCalWrap}>
                        <Calendar size={22} color="#ffffff" />
                      </View>
                      <View>
                        <Text style={styles.tdSettledK}>Settled on</Text>
                        <Text style={styles.tdSettledV}>
                          {formatDate(
                            selectedTrip.pickup_date ?? selectedTrip.created_at,
                          )}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.tdSettledExport}
                      activeOpacity={0.85}
                      accessibilityLabel="Export settlement reference"
                      onPress={() => {
                        void Share.share({
                          message: `Settlement reference #${getDriverTripDisplayNumber(selectedTrip, driverTripNumberById)}`,
                        }).catch(() => {});
                      }}
                    >
                      <ArrowDownToLine size={20} color="#ffffff" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.tdQueryBtn,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.tdQueryBtnText, { color: colors.textMuted }]}>
                      Raise a query
                    </Text>
                    <ChevronRight size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>

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
                      <ActivityIndicator size="large" color={colors.emerald} />
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
    ...Typography.headerSubtitle,
    marginBottom: 1,
  },
  welcomeTitle: {
    ...Typography.headerTitle,
    textTransform: "none",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  creditsSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 6,
  },
  creditsTitle: {
    fontSize: 42,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -2,
    lineHeight: 44,
    textTransform: "uppercase",
  },
  creditsSubtitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
    marginTop: 4,
    textTransform: "uppercase",
    opacity: 0.82,
  },
  toolbarWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  toolbarTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchWrap: {
    flex: 1,
    minHeight: 54,
    borderWidth: 0,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    paddingVertical: 14,
  },
  segmentOuter: {
    height: 54,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 4,
    flexDirection: "row",
    alignItems: "stretch",
    minWidth: 174,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  segmentBtnActive: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  segmentLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  segmentLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
  },
  segmentCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentCountBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.2,
    lineHeight: 11,
  },
  toolbarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  resultMeta: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
    opacity: 0.75,
    marginLeft: 6,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clearBtnPlaceholder: {
    width: 50,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  cardRef: {
    backgroundColor: TRIP_CARD_REF.cardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TRIP_CARD_REF.border,
    borderRadius: 28,
    padding: 28,
    marginBottom: 22,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.06,
    shadowRadius: 28,
    elevation: 4,
  },
  cardWatermark: {
    position: "absolute",
    right: -18,
    top: "28%",
    opacity: 0.045,
    zIndex: 0,
  },
  cardRefAccentLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 5,
    zIndex: 1,
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
  routeCorridorHint: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    opacity: 0.62,
  },
  cardAssignedByLine: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    opacity: 0.9,
  },
  badgeRef: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
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
    fontSize: 9,
    fontWeight: "900",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 1.4,
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
  yieldValueRefLarge: {
    fontSize: 22,
    letterSpacing: -0.6,
  },
  yieldValueCompleted: { color: TRIP_CARD_REF.emeraldYield },
  yieldValueMuted: { color: TRIP_CARD_REF.muted },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyActiveWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 68,
    paddingHorizontal: 30,
  },
  emptyActiveIconCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyActiveTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  emptyActiveSubtitle: {
    ...driverBodyPrimary,
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 320,
  },
  emptyActiveButton: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emptyActiveButtonText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyText: {
    ...driverBodySecondary,
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
  detailHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  detailTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
    minWidth: 0,
    marginLeft: 12,
  },
  tdHeaderCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 0,
  },
  tdStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
      },
      default: { elevation: 2 },
    }),
  },
  tdHeroOuter: {
    marginBottom: 20,
    borderRadius: 40,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      default: { elevation: 10 },
    }),
  },
  tdHeroCard: {
    borderRadius: 40,
    padding: 32,
    paddingBottom: 28,
    overflow: "hidden",
  },
  tdHeroGlow: {
    position: "absolute",
    bottom: -48,
    left: -48,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(16,185,129,0.22)",
    opacity: 1,
  },
  tdHeroWatermark: {
    position: "absolute",
    top: 28,
    right: 28,
    opacity: 1,
    transform: [{ rotate: "12deg" }],
  },
  tdHeroInner: {
    position: "relative",
    zIndex: 2,
  },
  tdHeroKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 4,
    color: "rgba(148,163,184,0.95)",
    textTransform: "uppercase",
    marginBottom: 24,
  },
  tdHeroRouteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 22,
  },
  tdHeroRouteSide: {
    flex: 1,
    minWidth: 0,
  },
  tdHeroRouteSideRight: {
    alignItems: "flex-end",
  },
  tdHeroCity: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -1,
    textTransform: "uppercase",
    lineHeight: 27,
  },
  tdHeroCityRight: {
    textAlign: "right",
  },
  tdHeroState: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.8,
    color: "rgba(148,163,184,0.95)",
    textTransform: "uppercase",
    marginTop: 7,
    maxWidth: "100%",
  },
  tdHeroStateRight: {
    textAlign: "right",
  },
  tdHeroRouteConnector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    width: 48,
    paddingTop: 12,
  },
  tdHeroToRail: {
    alignItems: "center",
    width: 14,
  },
  tdHeroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tdHeroRailGrad: {
    width: 2,
    height: 18,
    marginTop: 2,
    borderRadius: 1,
  },
  tdHeroConnectorLine: {
    flex: 1,
    height: 1,
    minWidth: 6,
    backgroundColor: "rgba(148,163,184,0.3)",
  },
  tdHeroToLabel: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  tdHeroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 18,
  },
  tdHeroMetaRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 28,
  },
  tdHeroMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  tdHeroMetaIconWrap: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tdHeroMetaKicker: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(148,163,184,0.95)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  tdHeroMetaValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
  tdHeroAssignerRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.16)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tdHeroAssignerLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(148,163,184,0.95)",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  tdHeroAssignerValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },
  tdHeroAccentBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  tdTabBar: {
    flexDirection: "row",
    padding: 6,
    borderRadius: 18,
    gap: 6,
    marginBottom: 22,
  },
  tdTabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  tdTabBtnActive: {
    backgroundColor: "#0f172a",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      default: { elevation: 4 },
    }),
  },
  tdTabLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tdTimelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  tdTimelineHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  tdTimelineHeaderTitle: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  tdTimelineCard: {
    borderRadius: 36,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 18,
    marginBottom: 16,
    overflow: "visible",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      default: { elevation: 2 },
    }),
  },
  tdEmptyTimeline: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 20,
  },
  tdPodRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  tdPodFileName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
  },
  podPreviewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  podPreviewInner: {
    borderRadius: 16,
    overflow: "hidden",
    maxHeight: "88%",
  },
  podPreviewClose: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  podPreviewImageBox: {
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 32,
  },
  podPreviewImage: {
    width: "100%",
    minHeight: 280,
    maxHeight: 480,
  },
  podPreviewFallback: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  tdLogRowWrap: {
    position: "relative",
    paddingBottom: 22,
  },
  tdLogConnector: {
    position: "absolute",
    left: 31,
    top: 44,
    bottom: 0,
    width: 2,
    zIndex: 0,
  },
  tdLogTouchable: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 8,
    zIndex: 1,
  },
  tdLogMarkerCol: {
    width: 40,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  tdLogCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    ...Platform.select({
      ios: {
        shadowColor: Theme.driverEmerald,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      default: { elevation: 2 },
    }),
  },
  tdLogBody: {
    flex: 1,
    minWidth: 0,
  },
  tdLogHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  tdLogHeadRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tdLogStatus: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  tdLogTime: {
    fontSize: 10,
    fontWeight: "800",
  },
  tdLogLoc: {
    fontSize: 11,
    fontWeight: "600",
  },
  tdLogExpanded: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(148,163,184,0.35)",
  },
  tdLogDetailsKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tdLogDetailsBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  tdLogDetailsText: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 17,
  },
  tdLogMetaGrid: {
    flexDirection: "row",
    gap: 24,
    flexWrap: "wrap",
  },
  tdLogMetaK: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  tdLogMetaV: {
    fontSize: 11,
    fontWeight: "600",
  },
  tdLogInTransitGrid: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  tdLogInTransitCol: {
    flex: 1,
    minWidth: 0,
  },
  tdDeliveredBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 22,
    marginTop: 4,
  },
  tdDeliveredKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 3,
    color: "rgba(236,253,245,0.95)",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tdDeliveredTitle: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  tdDeliveredIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  tdProgressBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 22,
    marginTop: 4,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      default: { elevation: 2 },
    }),
  },
  tdProgressKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tdProgressTitle: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
    fontStyle: "italic",
  },
  tdSettlementGlow: {
    marginBottom: 22,
    borderRadius: 42,
    padding: 4,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  tdNetCard: {
    borderRadius: 38,
    borderWidth: 1,
    paddingHorizontal: 28,
    paddingTop: 26,
    paddingBottom: 22,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      default: { elevation: 3 },
    }),
  },
  tdNetBlur: {
    position: "absolute",
    top: -48,
    right: -48,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(16,185,129,0.14)",
    opacity: 1,
  },
  tdNetHeader: {
    alignItems: "center",
  },
  tdNetWalletIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    backgroundColor: "rgba(16,185,129,0.12)",
  },
  tdNetKicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 4,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  tdNetAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginBottom: 14,
    maxWidth: "100%",
  },
  tdNetRupee: {
    fontSize: 28,
    fontWeight: "700",
    marginRight: 2,
  },
  tdNetAmount: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -2,
    flexShrink: 1,
  },
  tdNetSuccessPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  tdNetSuccessText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  tdNetMiniGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 26,
  },
  tdNetMiniCard: {
    flex: 1,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 0,
  },
  tdNetMiniK: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  tdNetMiniV: {
    fontSize: 17,
    fontWeight: "900",
  },
  tdEarningsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  tdEarningsHeaderTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  tdBreakdownCard: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 4,
    marginBottom: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      default: { elevation: 2 },
    }),
  },
  tdBreakRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 12,
    borderRadius: 20,
  },
  tdBreakRowHighlight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 12,
    borderRadius: 20,
    marginVertical: 2,
  },
  tdBreakLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  tdBreakIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tdBreakTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  tdBreakTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 2,
  },
  tdBreakSub: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  tdBreakValue: {
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 0,
    textAlign: "right",
  },
  tdActiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tdActiveBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
    color: "#ffffff",
    textTransform: "uppercase",
  },
  tdSettledBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderRadius: 26,
    marginBottom: 14,
    backgroundColor: "#0f172a",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      default: { elevation: 6 },
    }),
  },
  tdSettledLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  tdSettledCalWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tdSettledK: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3,
    color: "rgba(148,163,184,0.95)",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  tdSettledV: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  tdSettledExport: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tdQueryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 20,
    borderRadius: 26,
    borderWidth: 1,
  },
  tdQueryBtnText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 4,
    textTransform: "uppercase",
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
    ...Platform.select({
      web: { textShadow: "0px 0px 3px rgba(255,255,255,0.6)" } as object,
      default: {
        textShadowColor: "rgba(255,255,255,0.6)",
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 3,
      },
    }),
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
    color: Theme.driverPrimary,
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
