import { DriverHeader } from "@/components/driver/DriverHeader";
import { DriverInviteCard } from "@/components/driver/DriverInviteCard";
import {
    LeafletMap,
    type LeafletMapRef,
    type LeafletMarker,
} from "@/components/driver/LeafletMap";
import { DriverTripFlowCard } from "@/components/DriverTripFlowCard";
import { JobRequestCard } from "@/components/JobRequestCard";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import Typography from "@/constants/Typography";
import { useAuth } from "@/contexts/AuthContext";
import { useDriverAvatar } from "@/contexts/DriverAvatarContext";
import {
    useDriverTheme,
    useDriverThemeColors,
} from "@/contexts/DriverThemeContext";
import { computeDriverCommissionForTrip } from "@/features/finance/aggregation/aggregateDrivers";
import { claimTripByOtp, getPendingOtpTrips } from "@/features/trips";
import { getLatestAssignmentAuditByTripIds } from "@/features/trips/services/trip-assignment-audit.service";
import { useDriverAvatarUri } from "@/lib/avatarUpload";
import {
    buildOfferText,
    isActiveMission,
    isAggregateTrip,
    isAssignedNotStarted,
    isCompletedStatus,
    isRosterTrip,
} from "@/lib/driverUtils";
import { formatINR } from "@/lib/format";
import { formatEstimatedDuration } from "@/lib/formatEstimatedDuration";
import { darkMapStyle } from "@/lib/mapStyles";
import { getPopularPlacesInIndia } from "@/lib/placesService";
import MapView, {
    Callout,
    Marker,
    Polyline,
} from "@/lib/reactNativeMapsCompat";
import * as driverLocationService from "@/services/driverLocationService";
import * as driversService from "@/services/driversService";
import {
    buildRouteFetchKey,
    getOptimalRoute,
    parseRouteFetchKey,
    type RouteResult,
} from "@/services/routingService";
import * as tripsService from "@/services/tripsService";
import { supabase } from "@/lib/supabase";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import BottomSheet, {
    BottomSheetScrollView,
    BottomSheetTextInput,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, {
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Default map region when driver location is not yet available (India center). */
const DEFAULT_MAP_REGION = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

const DRIVER_MAP_BOOT_KEY = "@q-mobile/driver-map-native-booting";
const DRIVER_MAP_BOOT_TS_KEY = "@q-mobile/driver-map-native-boot-ts";

/** Trip is in progress so "Accept" does not reappear after refresh (includes started_at). */
function isTripInProgress(t: tripsService.TripRow) {
  if (isCompletedStatus(t.status)) return false;
  return isActiveMission(t.status) || !!t.started_at;
}

/** Human-readable status for dashboard status-only card (no actions). */
function getTripStatusLabel(t: tripsService.TripRow): string {
  const s = (t.status || "").toLowerCase();
  if (s === "in_progress" || s === "pickup" || s === "picked_up")
    return "Proceed to pickup";
  if (s === "in_transit" || s === "transit") return "Trip in transit";
  if (isCompletedStatus(t.status)) return "Completed";
  return "Proceed to pickup";
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUuidFragment(s: string): boolean {
  const t = String(s ?? "").trim();
  if (!t) return false;
  if (UUID_V4_RE.test(t)) return true;
  // Short prefix shown as "User abcdef12…"
  if (/^[0-9a-f]{6,12}$/i.test(t)) return true;
  return false;
}

/** Prefer assignment audit actor (who assigned driver), then explicit assigner ids, then creator. */
function resolveAssignerUserId(
  trip: tripsService.TripRow,
  auditActorByTripId: Record<string, string>,
): string {
  const meta = trip as tripsService.TripRow &
    Record<string, string | number | boolean | null | undefined>;
  const audit = (auditActorByTripId[String(trip.id)] ?? "").trim();
  const assignedByUserId = String(meta.assigned_by_user_id ?? "").trim();
  const createdByUserId = String(trip.created_by_user_id ?? "").trim();
  const assignedBy = String(meta.assigned_by ?? "").trim();
  const createdBy = String(trip.created_by ?? "").trim();

  if (audit) return audit;
  if (assignedByUserId) return assignedByUserId;
  if (createdByUserId) return createdByUserId;
  if (assignedBy && UUID_V4_RE.test(assignedBy)) return assignedBy;
  if (createdBy && UUID_V4_RE.test(createdBy)) return createdBy;
  return "";
}

function humanizeAssignerDisplayName(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (looksLikeUuidFragment(t)) return "";
  const lower = t.toLowerCase();
  if (lower === "partner") return "";
  if (/^user\s+/i.test(t)) {
    const rest = t.replace(/^user\s+/i, "").trim();
    if (looksLikeUuidFragment(rest) || /^[0-9a-f-]{6,}$/i.test(rest)) return "";
  }
  return t;
}

type DriverGuidanceStep =
  | "accepted"
  | "pickup"
  | "transit"
  | "reached"
  | "completed";

type DriverGuidanceConfig = {
  title: string;
  subtitle: string;
  toastMessage: string;
  target: "pickup" | "drop" | null;
  icon: "location-arrow" | "map-marker" | "check-circle";
};

function deriveDriverGuidanceStep(t: tripsService.TripRow): DriverGuidanceStep {
  const s = String(t.status ?? "").toLowerCase();
  const hasStarted = !!t.started_at;
  if (s === "completed" || s === "delivered" || s === "done")
    return "completed";
  if (s === "at_drop") return "reached";
  if (
    s === "in_transit" ||
    s === "transit" ||
    (s === "in_progress" && hasStarted)
  )
    return "transit";
  if (s === "picked_up" || s === "pickup" || s === "in_progress")
    return "pickup";
  return "accepted";
}

function getTripStopCoordinate(
  trip: tripsService.TripRow,
  target: "pickup" | "drop",
): { latitude: number; longitude: number } | null {
  const latitude = Number(
    target === "pickup" ? (trip as any).pickup_lat : (trip as any).drop_lat,
  );
  const longitude = Number(
    target === "pickup" ? (trip as any).pickup_lon : (trip as any).drop_lon,
  );
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    (latitude !== 0 || longitude !== 0)
  ) {
    return { latitude, longitude };
  }

  // Last resort: popular places fallback if coordinates are missing in DB
  const areaStr = (
    target === "pickup"
      ? trip.pickup_area
      : trip.drop_location || (trip as any).drop_area
  )?.trim();
  if (areaStr) {
    // 1. Exact or prefix/includes match
    const popular = getPopularPlacesInIndia(areaStr);
    if (popular.length > 0) {
      const exact = popular.find(
        (p: any) => p.displayName.toLowerCase() === areaStr.toLowerCase(),
      );
      const match = exact || popular[0];
      return { latitude: match.lat, longitude: match.lon };
    }

    // 2. Try matching individual parts (e.g. "Okhla, Delhi" -> match "Delhi")
    const parts = areaStr
      .split(/[,|\s]+/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 2);
    for (const part of parts) {
      const matches = getPopularPlacesInIndia(part);
      if (matches.length > 0) {
        return { latitude: matches[0].lat, longitude: matches[0].lon };
      }
    }
  }

  return null;
}

function getDriverGuidanceConfig(
  step: DriverGuidanceStep,
  trip: tripsService.TripRow,
): DriverGuidanceConfig {
  if (step === "accepted") {
    return {
      title: "Proceed to pickup",
      subtitle: trip.pickup_area?.trim() || "Head to the pickup location",
      toastMessage: "Trip accepted. Proceed to pickup.",
      target: "pickup",
      icon: "location-arrow",
    };
  }
  if (step === "pickup") {
    return {
      title: "Confirm pickup",
      subtitle: trip.pickup_area?.trim() || "You are at the pickup point",
      toastMessage: "You reached pickup. Confirm pickup to continue.",
      target: "pickup",
      icon: "map-marker",
    };
  }
  if (step === "transit") {
    return {
      title: "Proceed to drop-off",
      subtitle: trip.drop_location?.trim() || "Head to the drop-off location",
      toastMessage: "Pickup confirmed. Proceed to drop-off.",
      target: "drop",
      icon: "location-arrow",
    };
  }
  if (step === "reached") {
    return {
      title: "Upload POD",
      subtitle: "At drop-off. Upload POD and complete the trip.",
      toastMessage: "You reached drop-off. Upload POD to complete the trip.",
      target: "drop",
      icon: "check-circle",
    };
  }
  return {
    title: "Trip completed",
    subtitle: "All steps finished.",
    toastMessage: "Trip completed.",
    // Keep map routing/highlight active even after server marks completed.
    target: "drop",
    icon: "check-circle",
  };
}

const DRIVER_ACCEPTED_TRIP_ID_KEY = "driver_accepted_trip_id";
const OTP_LENGTH = 6;

let ExpoLocationModule: typeof Location | null = null;

async function getExpoLocation() {
  try {
    if (!ExpoLocationModule) {
      ExpoLocationModule = await import("expo-location");
    }
    return ExpoLocationModule;
  } catch {
    return null;
  }
}

/** Location report interval: 10s in dev, 30s in production when driver is on trip. */
const LOCATION_REPORT_INTERVAL_MS = __DEV__ ? 10 * 1000 : 30 * 1000;
/** Minimum displacement (metres) before sending another point; skip noisy duplicates. */
const MIN_DISPLACEMENT_M = 30;

/** Approximate distance in metres between two WGS84 points (Haversine-style). */
function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Approx initial bearing (degrees 0-360) from one lat/lon to another. */
function bearingDegrees(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number | null {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const theta = Math.atan2(y, x);
  const deg = (theta * 180) / Math.PI;
  if (!Number.isFinite(deg)) return null;
  return (deg + 360) % 360;
}

const DECLINE_WARNING_TITLE = "Decline this trip?";
const DECLINE_WARNING_MSG =
  "Warning: you will no longer be assigned to this trip. The fleet can reassign it to another driver.";

/** Keep fitToCoordinates responsive on long hauls (many vertices). */
function subsampleRouteCoordinates<
  T extends { latitude: number; longitude: number },
>(coords: T[], maxPoints: number): T[] {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < coords.length; i += step) out.push(coords[i]);
  const last = coords[coords.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function formatTripDistance(distance: unknown): string {
  if (distance == null) return "—";
  const raw = typeof distance === "string" ? distance.trim() : "";
  if (typeof distance === "string" && raw === "") return "—";

  // DB can return numeric km; other flows may return strings like "980 km" or "1,420 KM".
  const km =
    typeof distance === "number"
      ? distance
      : (() => {
          const n = parseFloat(
            String(distance)
              .replace(/,/g, "")
              .replace(/[^0-9.]/g, ""),
          );
          return Number.isFinite(n) ? n : NaN;
        })();

  if (!Number.isFinite(km) || km < 0) return "—";
  return `${Math.round(km).toLocaleString("en-IN")} km`;
}

export default function DriverRadarScreen() {
  const insets = useSafeAreaInsets();
  const { isDark, mapTheme } = useDriverTheme();
  const colors = useDriverThemeColors();
  const tabBarVerticalPad = Math.max(insets.bottom / 4, 4);
  const driverTabBarClearance =
    // Reserve only the actual footer tab bar area (not extra modal padding),
    // so the map stays full-bleed but bottom-sheet/content stops above tabs.
    Layout.tabBarDockHeight + tabBarVerticalPad + (tabBarVerticalPad + 6);
  // Driver home previously used a hardcoded dark map for contrast.
  // Now it respects the "Map Style" user setting (light, dark, or auto-sync with theme).
  const mapIsDark = mapTheme === "auto" ? isDark : mapTheme === "dark";
  /** Job request bottom sheet: earnings, addresses, pills; muted labels; hold bar */
  const jobRequestSheetPrimary = isDark
    ? Theme.textOnPrimary
    : Theme.textPrimaryDark;
  const jobRequestSheetMuted = isDark ? Theme.textOnDarkMuted : Theme.textMuted;
  const jobRequestHoldTrack = isDark
    ? "rgba(255,255,255,0.22)"
    : Theme.textPrimaryDark;
  const { profile } = useAuth();
  const { avatarSeed } = useDriverAvatar();
  const { avatarUri } = useDriverAvatarUri();
  const [driver, setDriver] = useState<driversService.DriverRow | null>(null);
  const [allTrips, setAllTrips] = useState<tripsService.TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [declinedTripId, setDeclinedTripId] = useState<string | null>(null);
  const justClaimedTripIdRef = useRef<string | null>(null);
  const justClaimedOldTripIdRef = useRef<string | null>(null);

  const [assignmentFeedback, setAssignmentFeedback] = useState<
    "accepted" | "declined" | null
  >(null);
  const [isOtpClaiming, setIsOtpClaiming] = useState(false);
  const assignmentFeedbackTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pingAnim = useRef(new Animated.Value(0)).current;
  const pickupDotPingAnim = useRef(new Animated.Value(0)).current;
  const newAssignmentBlinkAnim = useRef(new Animated.Value(0)).current;
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [invites, setInvites] = useState<driversService.DriverInviteRow[]>([]);
  const router = useRouter();
  const [showNotification, setShowNotification] = useState(false);
  const [invitationAccepted, setInvitationAccepted] = useState(false);
  const [invitationDeclined, setInvitationDeclined] = useState(false);
  const [invitationDismissed, setInvitationDismissed] = useState(false);

  // Show notification if there's any pending invite and user hasn't acted recently
  useEffect(() => {
    if (
      invites.filter((i) => i.status === "pending").length > 0 &&
      !invitationAccepted &&
      !invitationDeclined &&
      !invitationDismissed
    ) {
      setShowNotification(true);
    } else {
      setShowNotification(false);
    }
  }, [invites, invitationAccepted, invitationDeclined, invitationDismissed]);
  const pendingInvite = invites.find((i) => i.status === "pending") ?? null;

  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [acceptedTripId, setAcceptedTripId] = useState<string | null>(null);
  const [selectedIncomingTripId, setSelectedIncomingTripId] = useState<
    string | null
  >(null);
  const [notificationHistory, setNotificationHistory] = useState<
    { tripId: string; reason: "accepted_other" | "declined"; movedAt: string }[]
  >([]);
  const [pendingOtpTrips, setPendingOtpTrips] = useState<
    tripsService.TripRow[]
  >([]);
  const [assignerNamesByUserId, setAssignerNamesByUserId] = useState<
    Record<string, string>
  >({});
  /** Resolved server-side (RPC); drivers cannot read dispatcher profiles via RLS. */
  const [assignerDisplayByTripId, setAssignerDisplayByTripId] = useState<
    Record<string, string>
  >({});
  const [organizationNamesById, setOrganizationNamesById] = useState<
    Record<string, string>
  >({});
  const [assignmentActorByTripId, setAssignmentActorByTripId] = useState<
    Record<string, string>
  >({});
  const [incomingOtpPopupTripId, setIncomingOtpPopupTripId] = useState<
    string | null
  >(null);
  const [acknowledgedOtpPopupTripId, setAcknowledgedOtpPopupTripId] = useState<
    string | null
  >(null);
  const [otpClaimTripId, setOtpClaimTripId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isAssignmentSheetExpanded, setIsAssignmentSheetExpanded] =
    useState(false);
  const [reassignedTripLabels, setReassignedTripLabels] = useState<string[]>(
    [],
  );
  const previousTripsRef = useRef<Map<string, string>>(new Map());
  const searchPulseAnim = useRef(new Animated.Value(0)).current;
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "loading" | "success" | "error"
  >("loading");
  const [driverMapPosition, setDriverMapPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  // Truck marker position shown on the map; animated independently from raw GPS.
  const [truckPosition, setTruckPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Reanimated-smoothed "You" marker (Ola-style: avoid teleport between GPS fixes).
  const youLatSv = useSharedValue<number>(DEFAULT_MAP_REGION.latitude);
  const youLonSv = useSharedValue<number>(DEFAULT_MAP_REGION.longitude);
  const youHeadingSv = useSharedValue<number>(0);
  const lastHeadingFixRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const youMarkerAnimatedProps = useAnimatedProps(() => ({
    coordinate: {
      latitude: youLatSv.value,
      longitude: youLonSv.value,
    },
  }));

  const youIconAnimatedStyle = useAnimatedStyle(() => {
    // Heading rotation (if no heading yet, heading stays 0).
    return { transform: [{ rotate: `${youHeadingSv.value}deg` }] };
  });

  const OlaAnimatedMarker = useMemo(
    () =>
      (Platform.OS === "web"
        ? null
        : Reanimated.createAnimatedComponent(Marker)) as any,
    [],
  );
  const [stopsExpanded, setStopsExpanded] = useState(false);
  const [justCompletedTrip, setJustCompletedTrip] = useState(false);
  const [isFullMapVisible, setIsFullMapVisible] = useState(false);
  const [inlineMapViewportHeight, setInlineMapViewportHeight] = useState(0);
  const [toastMessage, setToastMessage] = useState("You are online now.");
  const lastSentLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const truckAnimTokenRef = useRef(0);
  const truckRafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(
    null,
  );
  const truckLastUpdateMsRef = useRef(0);
  const lastAnimatedStepKeyRef = useRef<string | null>(null);
  const lastAnimatedTripIdRef = useRef<string | null>(null);
  const mapRef = useRef<any>(null);
  const fullMapRef = useRef<any>(null);
  const leafletRef = useRef<LeafletMapRef | null>(null);
  const fullLeafletRef = useRef<LeafletMapRef | null>(null);
  const bottomSheetRef = useRef<BottomSheet | null>(null);
  const enableDriverMapAnimations = false;
  const [sheetOperationActive, setSheetOperationActive] = useState(false);
  const sheetOperationActiveRef = useRef(false);
  const sheetSnapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoExpandedIncomingTripIdRef = useRef<string | null>(null);
  const inlineMapViewportHeightRef = useRef(0);
  const inlineMapLastFitKeyRef = useRef<string | null>(null);
  const fullMapLastFitKeyRef = useRef<string | null>(null);
  /** Only one forced fit per trip bounds — avoids resetting map when sheet/POD content changes height */
  const mapHeightFitAppliedForBoundsKeyRef = useRef<string | null>(null);
  const otpInputRef = useRef<any>(null);
  const lastGuidanceKeyRef = useRef<string | null>(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [isFollowingLocation, setIsFollowingLocation] = useState(false);
  const locationWatchRef = useRef<any>(null);
  const initialLoadDoneRef = useRef(false);
  const isRefreshingRef = useRef(false);

  // Map fallback:
  // - Force Leaflet via env (debug): EXPO_PUBLIC_DRIVER_MAP_FALLBACK=leaflet
  // - If the app crashed while native map was booting last time, use Leaflet on next launch (prevents boot-loop).
  const [useLeafletFallback, setUseLeafletFallback] = useState(false);
  const googleMapsAndroidKey = String(
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || "",
  ).trim();
  const leafLetForced =
    String(process.env.EXPO_PUBLIC_DRIVER_MAP_FALLBACK || "").toLowerCase() ===
      "leaflet" ||
    // If we don't have a Google Maps key on Android, native tiles may render blank or crash on some devices.
    // Default to Leaflet in that case so the driver app is usable out of the box.
    (Platform.OS === "android" && !googleMapsAndroidKey);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (leafLetForced) {
        if (mounted) setUseLeafletFallback(true);
        return;
      }
      try {
        const [booting, ts] = await Promise.all([
          AsyncStorage.getItem(DRIVER_MAP_BOOT_KEY).catch(() => null),
          AsyncStorage.getItem(DRIVER_MAP_BOOT_TS_KEY).catch(() => null),
        ]);
        const isBooting = booting === "1";
        const bootTs = ts ? Number(ts) : 0;
        const recently = bootTs > 0 && Date.now() - bootTs < 2 * 60 * 1000;
        if (mounted && isBooting && recently) {
          setUseLeafletFallback(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [leafLetForced]);

  // When we attempt to render native map, mark "booting" so if the process dies we can switch next launch.
  useEffect(() => {
    if (useLeafletFallback || leafLetForced) return;
    void AsyncStorage.setItem(DRIVER_MAP_BOOT_KEY, "1");
    void AsyncStorage.setItem(DRIVER_MAP_BOOT_TS_KEY, String(Date.now()));
  }, [useLeafletFallback, leafLetForced]);

  useEffect(() => {
    AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY).then((id) => {
      if (id != null && id !== "") setAcceptedTripId(id);
    });
  }, []);

  const fetch = useCallback(() => {
    if (!profile?.uid) {
      setLoading(false);
      return Promise.resolve();
    }
    setAcceptError(null);
    if (!initialLoadDoneRef.current && !isRefreshingRef.current)
      setLoading(true);
    return Promise.all([
      driversService.getLinkedDriversForCurrentUser(profile.uid),
      driversService.getDriverInvitesReceived(),
      getPendingOtpTrips(),
    ])
      .then(([driversRes, invitesRes, pendingTripsRes]) => {
        setInvites(invitesRes.invites ?? []);
        setPendingOtpTrips(
          pendingTripsRes?.error ? [] : (pendingTripsRes?.trips ?? []),
        );
        const drivers = (driversRes.drivers ?? []).filter((d) => !d.left_at);
        if (drivers.length > 0) {
          const primaryDriver = drivers[0];
          setDriver(primaryDriver);
          const driverIds = drivers.map((d) => d.id);
          return tripsService.getTripsByDriverIds(driverIds).then((tRes) => {
            const trips = tRes.trips ?? [];
            const currentIds = new Set(trips.map((t) => t.id));
            const disappearedLabels: string[] = [];
            previousTripsRef.current.forEach((displayNum, id) => {
              if (!currentIds.has(id)) disappearedLabels.push(displayNum);
            });
            if (disappearedLabels.length > 0)
              setReassignedTripLabels(disappearedLabels);
            previousTripsRef.current = new Map(
              trips.map((t) => [t.id, tripsService.getTripDisplayNumber(t)]),
            );
            setAllTrips(trips);
            const normalizedDriverStatus = String(
              primaryDriver.status ?? "",
            ).toLowerCase();
            const hasActiveTrip = trips.some((t) => isTripInProgress(t));
            setIsOnline(
              (prev) =>
                prev ||
                normalizedDriverStatus === "online" ||
                normalizedDriverStatus === "on_trip" ||
                hasActiveTrip,
            );
            setLoading(false);
            initialLoadDoneRef.current = true;
            isRefreshingRef.current = false;
            setRefreshing(false);
            setAcceptedTripId((prev) => {
              if (prev == null) return prev;
              const trip = trips.find((t) => t.id === prev);

              // If we found the trip and it's already started or completed, we can clear the "accepted" flag
              // because the active mission flow will take over, or it's done.
              if (
                !isOtpClaiming &&
                trip &&
                (isTripInProgress(trip) || isCompletedStatus(trip.status))
              ) {
                AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
                return null;
              }

              // DO NOT clear if not found. Let lag catch up or let the user manually go back from the card.
              // This prevents the JobRequestCard ("Hold to accept") from reappearing due to replication lag.
              return prev;
            });
          });
        } else {
          setDriver(null);
          setAllTrips([]);
          setPendingOtpTrips([]);
          setIsOnline(false);
          previousTripsRef.current = new Map();
          setLoading(false);
          initialLoadDoneRef.current = true;
          isRefreshingRef.current = false;
          setRefreshing(false);
        }
      })
      .finally(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [profile?.uid]);


  const runDeclineTrip = useCallback(
    async (tripId: string) => {
      if (declineLoading) return;
      setAcceptError(null);
      if (otpClaimTripId === tripId) {
        setOtpClaimTripId(null);
        setOtpValue("");
        setOtpError(null);
      }
      setDeclineLoading(true);
      const { error } = await tripsService.driverRejectTrip(tripId);
      setDeclineLoading(false);
      if (error) {
        Alert.alert(
          "Decline failed",
          error.message ?? "Could not decline. Try again.",
          [{ text: "OK" }],
        );
        return;
      }
      if (
        String(acceptedTripId ?? "").toLowerCase() ===
        String(tripId).toLowerCase()
      ) {
        setAcceptedTripId(null);
        await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
      }
      setSelectedIncomingTripId((prev) =>
        String(prev ?? "").toLowerCase() === String(tripId).toLowerCase()
          ? null
          : prev,
      );
      setNotificationHistory((prev) => {
        if (prev.some((item) => item.tripId === tripId)) return prev;
        return [
          ...prev,
          { tripId, reason: "declined", movedAt: new Date().toISOString() },
        ];
      });
      setAssignmentFeedback("declined");
      setDeclinedTripId(tripId);
      fetch();
      if (assignmentFeedbackTimeoutRef.current)
        clearTimeout(assignmentFeedbackTimeoutRef.current);
      assignmentFeedbackTimeoutRef.current = setTimeout(() => {
        setAssignmentFeedback(null);
        assignmentFeedbackTimeoutRef.current = null;
      }, 1200);
    },
    [declineLoading, otpClaimTripId, acceptedTripId, fetch, setDeclinedTripId],
  );

  const confirmDeclineTrip = useCallback(
    (tripId: string) => {
      // Use web-native confirm window for the web, otherwise Expo's Alert.alert
      // silently fails to block/render if window.confirm isn't hooked up correctly
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const confirmed = window.confirm(
          `${DECLINE_WARNING_TITLE}\n\n${DECLINE_WARNING_MSG}`,
        );
        if (confirmed) {
          void runDeclineTrip(tripId);
        }
        return;
      }

      Alert.alert(DECLINE_WARNING_TITLE, DECLINE_WARNING_MSG, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline trip",
          style: "destructive",
          onPress: () => runDeclineTrip(tripId),
        },
      ]);
    },
    [runDeclineTrip],
  );

  const handleDeclineTrip = useCallback(
    async (tripId: string) => {
      confirmDeclineTrip(tripId);
    },
    [confirmDeclineTrip],
  );

  useEffect(() => {
    if (profile?.uid) fetch();
  }, [profile?.uid, fetch]);

  // Ensure notification channel exists for Android foreground services (fixes APK crashes).
  // Do not import expo-notifications in Expo Go on Android (SDK 53+): it triggers a noisy error
  // and push is unsupported there; dev/standalone builds still run this.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (Constants.executionEnvironment === "storeClient") return;
    import("expo-notifications").then((Notifications) => {
      Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: Theme.primary,
      }).catch(() => {
        /* ignore */
      });
    });
  }, []);

  const fetchLocation = useCallback(async () => {
    try {
      const expoLocation = await getExpoLocation();
      if (!expoLocation) {
        setLocationStatus("error");
        setLocationLabel(null);
        return;
      }

      // 1. Request foreground first (mandatory)
      const { status: foregroundStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== "granted") {
        setLocationStatus("error");
        setLocationLabel(null);
        return;
      }

      // 2. Get current position with explicit timeout to prevent hanging in APK
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = current.coords;

      // Show a ready location state immediately after GPS resolves,
      // then refine with reverse geocode when available.
      setLocationStatus("success");
      setLocationLabel("Current location");

      // 3. Background permission request (Defensive: separate check)
      if (Platform.OS === "android") {
        const { status: backgroundStatus } =
          await Location.getBackgroundPermissionsAsync();
        if (backgroundStatus !== "granted") {
          // Note: On Android 11+, you must explain to the user why background
          // permission is needed before calling requestBackgroundPermissionsAsync.
          // For now, we call it safely to avoid crashing.
          void Location.requestBackgroundPermissionsAsync().catch(() => {});
        }
      } else {
        void Location.requestBackgroundPermissionsAsync().catch(() => {});
      }

      // 4. Reverse geocode with timeout
      try {
        const results = (await Promise.race([
          Location.reverseGeocodeAsync({ latitude, longitude }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 5000),
          ),
        ])) as Location.LocationGeocodedAddress[];

        if (results && results.length > 0) {
          const place = results[0];
          const parts = [
            place.name || place.street || null,
            place.city || place.subregion || null,
          ].filter(Boolean) as string[];
          if (parts.length > 0) {
            setLocationLabel(parts.join(", "));
          }
        }
      } catch {
        // ignore reverse geocode failure; use fallback label so we don't show "Location not found" when we have coords (e.g. simulator)
      }
    } catch (err) {
      console.error("[DriverIndex] fetchLocation error:", err);
      setLocationStatus("error");
      setLocationLabel(null);
    }
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  // Refetch on focus and re-read accepted trip id (e.g. after OTP claim) so Dashboard shows "View trip" not "Accept & Enter OTP".
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(DRIVER_ACCEPTED_TRIP_ID_KEY).then((id) => {
        if (id != null && id !== "") setAcceptedTripId(id);
      });
      if (profile?.uid) fetch();
    }, [profile?.uid, fetch]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && profile?.uid) fetch();
    });
    return () => sub.remove();
  }, [profile?.uid, fetch]);

  // Clear declinedTripId once the declined trip is no longer present in any assignment source.
  useEffect(() => {
    if (!declinedTripId) return;
    const stillVisibleInAssigned = allTrips.some(
      (t) => t.id === declinedTripId,
    );
    const stillVisibleInPendingOtp = pendingOtpTrips.some(
      (t) => t.id === declinedTripId,
    );
    if (!stillVisibleInAssigned && !stillVisibleInPendingOtp) {
      setDeclinedTripId(null);
    }
  }, [declinedTripId, allTrips, pendingOtpTrips]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setLocationStatus("loading");
    Promise.all([fetch() ?? Promise.resolve(), fetchLocation()]).finally(() =>
      setRefreshing(false),
    );
  }, [fetch, fetchLocation]);

  const reportLocationToDb = useCallback(
    async (
      tripId: string | null,
      lat: number,
      lng: number,
      accuracy: number | null,
      source: driverLocationService.DriverLocationSource,
    ) => {
      if (!driver?.organization_id) return;
      await driverLocationService.reportDriverLocation({
        driverId: driver.id,
        organizationId: driver.organization_id,
        tripId,
        latitude: lat,
        longitude: lng,
        accuracy,
        source,
      });
    },
    [driver],
  );

  useEffect(() => {
    if (!isOnline) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pingAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pingAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isOnline, pingAnim]);

  const triggerSuccess = (message = "You are online now.") => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    setToastMessage(message);
    setShowSuccess(true);
    successTimeoutRef.current = setTimeout(() => {
      setShowSuccess(false);
      successTimeoutRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      if (assignmentFeedbackTimeoutRef.current)
        clearTimeout(assignmentFeedbackTimeoutRef.current);
    };
  }, []);

  const handleAcceptMission = async (trip: tripsService.TripRow) => {
    // OTP applies only to non-roster aggregate trips that require claim.
    const isAssetRosterTrip = isRosterTrip(trip);
    const requiresOtp =
      !isAssetRosterTrip &&
      (pendingOtpTripsRequiringOtp.some((t) => t.id === trip.id) ||
        (isAggregateTrip(trip) && isAssignedNotStarted(trip.status)));
    if (requiresOtp) {
      openOtpClaim(trip);
      return;
    }

    setAcceptError(null);
    setAcceptLoading(true);
    triggerSuccess("Trip accepted. Proceed to pickup.");
    setSelectedIncomingTripId(trip.id);
    setAcceptedTripId(trip.id);
    AsyncStorage.setItem(DRIVER_ACCEPTED_TRIP_ID_KEY, trip.id);
    setAcceptLoading(false);
    setAssignmentFeedback("accepted");

    if (assignmentFeedbackTimeoutRef.current)
      clearTimeout(assignmentFeedbackTimeoutRef.current);
    assignmentFeedbackTimeoutRef.current = setTimeout(() => {
      setAssignmentFeedback(null);
      assignmentFeedbackTimeoutRef.current = null;
      // Dashboard now hosts the in-card trip flow; do not auto-navigate to Trip screen.
    }, 1200);
  };

  const handleDeclineAssignment = (tripId: string) => {
    confirmDeclineTrip(tripId);
  };

  const renderOtpClaimCard = (
    trip: tripsService.TripRow,
    opts?: { showCancel?: boolean },
  ) => (
    <View
      style={[
        styles.centerCardWrap,
        styles.centerCardConstraint,
        styles.otpClaimCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View
        style={[
          styles.offlineIconWrap,
          { backgroundColor: colors.emeraldMuted },
        ]}
      >
        <FontAwesome name="key" size={28} color={colors.emerald} />
      </View>
      <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
        Enter trip OTP
      </Text>
      <Text
        style={[
          styles.offlineCardSubtitle,
          { color: colors.textMuted, marginTop: 4 },
        ]}
      >
        Enter the 6-digit OTP shared by your dispatcher to claim this trip.
      </Text>
      <Text style={[styles.otpTripRoute, { color: colors.text }]}>
        {trip.pickup_area?.trim() || "Pickup"} to{" "}
        {trip.drop_location?.trim() || "Drop-off"}
      </Text>
      <TouchableOpacity
        style={styles.otpBoxRow}
        onPress={() => {
          if (shouldShowMap) snapSheetToIndex(2);
          otpInputRef.current?.focus();
        }}
        activeOpacity={1}
      >
        {Array.from({ length: OTP_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.otpBox,
              {
                borderColor:
                  otpValue.length === i ? colors.emerald : colors.border,
                backgroundColor: colors.whiteMuted,
              },
            ]}
          >
            <Text style={[styles.otpBoxDigit, { color: colors.text }]}>
              {otpValue[i] ?? ""}
            </Text>
          </View>
        ))}
      </TouchableOpacity>
      <BottomSheetTextInput
        ref={otpInputRef}
        value={otpValue}
        onFocus={() => {
          if (shouldShowMap) snapSheetToIndex(2);
        }}
        onChangeText={(text) => {
          setOtpValue(text.replace(/\D/g, "").slice(0, OTP_LENGTH));
          setOtpError(null);
        }}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        style={styles.otpHiddenInput}
        caretHidden
        autoFocus
      />
      {otpError ? (
        <Text style={[styles.otpErrorText, { color: Theme.negative }]}>
          {otpError}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[
          styles.goOnlineBtn,
          {
            backgroundColor: colors.emerald,
            marginTop: 8,
            opacity: otpSubmitting || otpValue.length !== OTP_LENGTH ? 0.7 : 1,
          },
        ]}
        onPress={handleSubmitOtpClaim}
        disabled={otpSubmitting || otpValue.length !== OTP_LENGTH}
        activeOpacity={0.8}
      >
        {otpSubmitting ? (
          <ActivityIndicator size="small" color={Theme.textOnPrimary} />
        ) : (
          <>
            <FontAwesome
              name="check"
              size={16}
              color={Theme.textOnPrimary}
              style={styles.goOnlineBtnIcon}
            />
            <Text style={styles.goOnlineBtnText}>Verify OTP</Text>
          </>
        )}
      </TouchableOpacity>
      {opts?.showCancel ? (
        <TouchableOpacity
          onPress={closeOtpClaim}
          activeOpacity={0.8}
          style={styles.otpCancelLink}
        >
          <Text style={[styles.otpCancelText, { color: colors.textMuted }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const activeMission = useMemo(
    () => allTrips.find((t) => isTripInProgress(t)),
    [allTrips],
  );
  const incomingTrips = useMemo(
    () => allTrips.filter((t) => isAssignedNotStarted(t.status)),
    [allTrips],
  );
  const mergedIncomingTrips = useMemo(() => {
    const byId = new Map<string, tripsService.TripRow>();
    for (const trip of [...incomingTrips, ...pendingOtpTrips]) {
      if (!trip?.id) continue;
      if (declinedTripId && String(trip.id) === String(declinedTripId)) continue;
      if (!byId.has(trip.id)) byId.set(trip.id, trip);
    }
    return Array.from(byId.values()).sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    );
  }, [incomingTrips, pendingOtpTrips, declinedTripId]);
  const notificationHistoryTripIds = useMemo(
    () => new Set(notificationHistory.map((entry) => entry.tripId)),
    [notificationHistory],
  );
  const visibleIncomingTrips = useMemo(
    () =>
      mergedIncomingTrips.filter((trip) => !notificationHistoryTripIds.has(trip.id)),
    [mergedIncomingTrips, notificationHistoryTripIds],
  );
  const selectedIncomingTrip =
    visibleIncomingTrips.find((trip) => trip.id === selectedIncomingTripId) ??
    null;
  /** Single assignment: behave like legacy flow (map + card immediately). Multiple: picker until user selects a trip. */
  const effectiveFirstIncoming =
    visibleIncomingTrips.length === 1
      ? visibleIncomingTrips[0]
      : selectedIncomingTrip;

  /** Keep selection aligned when only one incoming trip remains (parity with legacy single-trip UX). */
  useEffect(() => {
    if (visibleIncomingTrips.length !== 1) return;
    const onlyId = visibleIncomingTrips[0]?.id;
    if (!onlyId) return;
    setSelectedIncomingTripId((prev) =>
      prev == null || prev === "" ? String(onlyId) : prev,
    );
  }, [visibleIncomingTrips]);
  // OTP only for non-roster (ad-hoc) trips; connected/roster trips accept directly.
  const pendingOtpTripsRequiringOtp = pendingOtpTrips.filter(
    (t) => !isRosterTrip(t),
  );
  // Require OTP when trip is in pending OTP list OR when it's an aggregate (assign-by-phone) trip still in assigned state
  const firstIncomingRequiresOtp = Boolean(
    effectiveFirstIncoming &&
    !isRosterTrip(effectiveFirstIncoming) &&
    (pendingOtpTripsRequiringOtp.some(
      (t) => t.id === effectiveFirstIncoming.id,
    ) ||
      (isAggregateTrip(effectiveFirstIncoming) &&
        isAssignedNotStarted(effectiveFirstIncoming.status))),
  );
  const otpClaimTrip = otpClaimTripId
    ? ([
        selectedIncomingTrip,
        effectiveFirstIncoming,
        ...pendingOtpTripsRequiringOtp,
        ...allTrips,
      ].find(
        (trip): trip is tripsService.TripRow =>
          trip != null && trip.id === otpClaimTripId,
      ) ?? null)
    : null;

  const hasIncomingTrip = visibleIncomingTrips.length > 0;
  const effectiveIncomingId = String(
    effectiveFirstIncoming?.id ?? "",
  ).toLowerCase();

  // Use driver's accepted offer (commission % or per km) for this org so commission matches control screen
  const acceptedInviteForOrg =
    effectiveFirstIncoming &&
    (invites.find(
      (i) =>
        (i.from_organization_id ?? "").trim() ===
          (effectiveFirstIncoming.organization_id ?? "").trim() &&
        String(i.status ?? "").toLowerCase() === "accepted",
    ) ??
      null);
  const offerForCommission = acceptedInviteForOrg
    ? {
        commissionPercent: acceptedInviteForOrg.commission_percent ?? null,
        commissionPerKm: acceptedInviteForOrg.commission_per_km ?? null,
      }
    : null;
  const newAssignmentCommission =
    effectiveFirstIncoming != null
      ? computeDriverCommissionForTrip(
          effectiveFirstIncoming,
          offerForCommission,
        )
      : 0;
  const activeMissionCommission =
    activeMission != null
      ? computeDriverCommissionForTrip(activeMission, offerForCommission)
      : 0;
  const firstIncomingIsAggregate =
    effectiveFirstIncoming != null && isAggregateTrip(effectiveFirstIncoming);

  // For driver view: load-based (roster/ad hoc) counterparty is the supplier (fleet); asset-only is the customer.
  const firstIncomingCounterpartyLabel = firstIncomingIsAggregate
    ? "Partner load"
    : "Customer";
  const firstIncomingCounterpartyName = firstIncomingIsAggregate
    ? (invites
        .find(
          (i) =>
            (i.from_organization_id ?? "").trim() ===
              (driver?.organization_id ?? "").trim() &&
            String(i.status ?? "").toLowerCase() === "accepted",
        )
        ?.from_org_name?.trim() ?? "Partner")
    : effectiveFirstIncoming?.client_name?.trim() || "Customer";
  const incomingTripOrgInvite =
    effectiveFirstIncoming == null
      ? null
      : (invites.find(
          (i) =>
            (i.from_organization_id ?? "").trim() ===
            (effectiveFirstIncoming.organization_id ?? "").trim(),
        ) ?? null);
  const incomingOtpPopupTitle = firstIncomingIsAggregate
    ? "Trip received from supplier"
    : "Trip received from customer";
  const incomingOtpPopupName = firstIncomingIsAggregate
    ? incomingTripOrgInvite?.from_org_name?.trim() ||
      firstIncomingCounterpartyName
    : firstIncomingCounterpartyName;
  const incomingOtpPopupAvatarUri =
    incomingTripOrgInvite?.from_org_logo_url?.trim() ||
    incomingTripOrgInvite?.from_org_avatar_url?.trim() ||
    null;
  const incomingOtpPopupPickup =
    effectiveFirstIncoming?.pickup_area?.trim() || "Pickup";
  const incomingOtpPopupDrop =
    effectiveFirstIncoming?.drop_location?.trim() || "Drop-off";
  const incomingOtpPopupBadge = firstIncomingRequiresOtp
    ? "OTP verification required"
    : "New trip";
  const incomingOtpPopupEarnings =
    newAssignmentCommission > 0 ? formatINR(newAssignmentCommission) : null;
  const handleDismissIncomingOtpPopup = () => {
    if (!effectiveFirstIncoming) return;
    setAcknowledgedOtpPopupTripId(String(effectiveFirstIncoming.id));
    setIncomingOtpPopupTripId(null);
  };
  const incomingNotificationsWithMeta = useMemo(
    () =>
      visibleIncomingTrips.map((trip) => {
        const tripMeta = trip as tripsService.TripRow &
          Record<string, string | number | boolean | null | undefined>;
        const inviteForTrip =
          invites.find(
            (i) =>
              (i.from_organization_id ?? "").trim() ===
              (trip.organization_id ?? "").trim(),
          ) ?? null;
        const assignerUserId = resolveAssignerUserId(
          trip,
          assignmentActorByTripId,
        ).trim();

        const tripAssignedByUserNameCandidates = [
          tripMeta.assigned_by_name,
          tripMeta.assigned_by_user_name,
          tripMeta.created_by_name,
          tripMeta.dispatcher_name,
        ];
        /** Fleet / assigning org — never use client/supplier names (those are cargo parties). */
        const tripAssignedByOrgNameCandidates = [
          organizationNamesById[(trip.organization_id ?? "").trim()] ?? null,
          inviteForTrip?.from_org_name ?? null,
          (tripMeta.organization_name as string | null | undefined) ?? null,
          (tripMeta.org_name as string | null | undefined) ?? null,
          (tripMeta.from_org_name as string | null | undefined) ?? null,
        ];
        const resolvedFromTripFields = tripAssignedByUserNameCandidates
          .map((value) => humanizeAssignerDisplayName(String(value ?? "")))
          .find((value) => value.length > 0);
        const resolvedFromProfiles = humanizeAssignerDisplayName(
          assignerNamesByUserId[assignerUserId] ?? "",
        );
        const fromRpc = humanizeAssignerDisplayName(
          assignerDisplayByTripId[String(trip.id)] ?? "",
        );
        const assignedByUserName =
          (fromRpc.length > 0 ? fromRpc : null) ??
          resolvedFromTripFields ??
          (resolvedFromProfiles.length > 0 ? resolvedFromProfiles : null);

        const assignedByOrgName =
          tripAssignedByOrgNameCandidates
            .map((value) => String(value ?? "").trim())
            .find((value) => value.length > 0) ??
          ((trip.organization_id ?? "").trim() ===
          (driver?.organization_id ?? "").trim()
            ? "Your fleet"
            : "Assigning fleet");

        /** Dispatcher / fleet user who assigned — not cargo party names. */
        const assignerPersonDisplay =
          (assignedByUserName ?? "").trim() || "Fleet dispatcher";

        const assignedByName = `${assignerPersonDisplay} · ${assignedByOrgName}`;
        const requiresOtp =
          !isRosterTrip(trip) &&
          (pendingOtpTripsRequiringOtp.some((t) => t.id === trip.id) ||
            (isAggregateTrip(trip) && isAssignedNotStarted(trip.status)));
        const acceptedInviteForTrip =
          invites.find(
            (i) =>
              (i.from_organization_id ?? "").trim() ===
                (trip.organization_id ?? "").trim() &&
              String(i.status ?? "").toLowerCase() === "accepted",
          ) ?? null;
        const commissionForTrip = computeDriverCommissionForTrip(trip, {
          commissionPercent: acceptedInviteForTrip?.commission_percent ?? null,
          commissionPerKm: acceptedInviteForTrip?.commission_per_km ?? null,
        });
        return {
          trip,
          assignedByName,
          assignedByUserName,
          assignedByOrgName,
          assignerPersonDisplay,
          requiresOtp,
          commissionForTrip,
        };
      }),
    [
      visibleIncomingTrips,
      invites,
      driver?.organization_id,
      pendingOtpTripsRequiringOtp,
      assignerNamesByUserId,
      assignerDisplayByTripId,
      organizationNamesById,
      assignmentActorByTripId,
    ],
  );
  const selectedIncomingMeta =
    incomingNotificationsWithMeta.find(
      (item) => item.trip.id === effectiveFirstIncoming?.id,
    ) ?? null;
  const notificationHistoryTrips = useMemo(
    () =>
      notificationHistory
        .map((entry) => {
          const trip = mergedIncomingTrips.find((row) => row.id === entry.tripId);
          return trip
            ? { trip, reason: entry.reason, movedAt: entry.movedAt }
            : null;
        })
        .filter(
          (
            row,
          ): row is {
            trip: tripsService.TripRow;
            reason: "accepted_other" | "declined";
            movedAt: string;
          } => row != null,
        )
        .slice(-3)
        .reverse(),
    [notificationHistory, mergedIncomingTrips],
  );
  useEffect(() => {
    if (activeMission) return;
    if (
      selectedIncomingTripId &&
      !visibleIncomingTrips.some((trip) => trip.id === selectedIncomingTripId)
    ) {
      setSelectedIncomingTripId(null);
    }
  }, [selectedIncomingTripId, visibleIncomingTrips, activeMission]);
  useEffect(() => {
    let cancelled = false;
    const loadAssignmentSources = async () => {
      const trips = mergedIncomingTrips;
      if (trips.length === 0) {
        if (!cancelled) {
          setAssignerNamesByUserId({});
          setAssignerDisplayByTripId({});
          setOrganizationNamesById({});
        }
        return;
      }

      const tripIdsForRpc = trips
        .map((t) => t.id)
        .filter((id): id is string => Boolean(id && String(id).length > 0));
      const { data: assignerRpcRows, error: assignerRpcError } = await supabase().rpc(
        "get_trip_assigner_displays_for_driver",
        { p_trip_ids: tripIdsForRpc },
      );
      if (!cancelled && !assignerRpcError && Array.isArray(assignerRpcRows)) {
        const byTrip: Record<string, string> = {};
        for (const row of assignerRpcRows as Array<{
          trip_id?: string;
          display_name?: string | null;
        }>) {
          const tid = row.trip_id != null ? String(row.trip_id) : "";
          const dn = String(row.display_name ?? "").trim();
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
      const organizationIds = Array.from(
        new Set(
          trips
            .flatMap((trip) => {
              const tripMeta = trip as tripsService.TripRow &
                Record<string, string | number | boolean | null | undefined>;
              return [
                (trip.organization_id ?? "").trim(),
                (
                  (tripMeta.from_organization_id as string | null | undefined) ?? ""
                ).trim(),
                ((tripMeta.from_org_id as string | null | undefined) ?? "").trim(),
              ];
            })
            .filter((id) => id.length > 0),
        ),
      );

      if (userIds.length > 0) {
        const { data, error } = await supabase()
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        if (!cancelled && !error) {
          const byId: Record<string, string> = {};
          for (const row of
            (data ?? []) as Array<{
              id: string;
              full_name?: string | null;
              email?: string | null;
            }>) {
            const fallbackEmailName =
              (row.email ?? "").trim().split("@")[0]?.trim() || "Dispatcher";
            byId[row.id] = (row.full_name ?? "").trim() || fallbackEmailName;
          }
          setAssignerNamesByUserId(byId);
        }
      } else if (!cancelled) {
        setAssignerNamesByUserId({});
      }

      if (organizationIds.length > 0) {
        const { data, error } = await supabase()
          .from("organizations")
          .select("id, name")
          .in("id", organizationIds);
        if (!cancelled && !error) {
          const byId: Record<string, string> = {};
          for (const row of
            (data ?? []) as Array<{ id: string; name?: string | null }>) {
            byId[row.id] = (row.name ?? "").trim();
          }
          setOrganizationNamesById(byId);
        }
      } else if (!cancelled) {
        setOrganizationNamesById({});
      }
    };
    void loadAssignmentSources();
    return () => {
      cancelled = true;
    };
  }, [mergedIncomingTrips, assignmentActorByTripId]);
  useEffect(() => {
    let cancelled = false;
    const loadAssignmentActors = async () => {
      const tripIds = mergedIncomingTrips.map((trip) => trip.id).filter(Boolean);
      if (tripIds.length === 0) {
        if (!cancelled) setAssignmentActorByTripId({});
        return;
      }
      const { byTripId } = await getLatestAssignmentAuditByTripIds(tripIds);
      if (cancelled) return;
      const next: Record<string, string> = {};
      byTripId.forEach((value, key) => {
        const actorId = (value.changed_by ?? "").trim();
        if (actorId) next[key] = actorId;
      });
      setAssignmentActorByTripId(next);
    };
    void loadAssignmentActors();
    return () => {
      cancelled = true;
    };
  }, [mergedIncomingTrips]);
  const activeGuidanceTrip =
    activeMission ??
    (effectiveFirstIncoming &&
    String(effectiveFirstIncoming.id).toLowerCase() ===
      String(acceptedTripId ?? "").toLowerCase()
      ? effectiveFirstIncoming
      : null);

  // Keep the driver truck moving on the map for the full guided flow:
  // accepted -> pickup -> transit -> drop-off.
  useEffect(() => {
    if (!driver || !activeGuidanceTrip) {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
      lastSentLocationRef.current = null;
      return;
    }
    const tick = async () => {
      try {
        const expoLocation = await getExpoLocation();
        if (!expoLocation) return;
        const { status } = await expoLocation.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const pos = await expoLocation.getCurrentPositionAsync({});
        const { latitude, longitude } = pos.coords;
        const acc = pos.coords.accuracy ?? null;
        const last = lastSentLocationRef.current;
        const shouldSend =
          !last ||
          distanceMeters(last.lat, last.lng, latitude, longitude) >=
            MIN_DISPLACEMENT_M;
        if (shouldSend) {
          await reportLocationToDb(
            activeGuidanceTrip.id,
            latitude,
            longitude,
            acc,
            "live",
          );
          lastSentLocationRef.current = { lat: latitude, lng: longitude };
        }
        setDriverMapPosition({ latitude, longitude });

        // Ola-style movement: interpolate the marker between GPS fixes (avoid teleport).
        youLatSv.value = withTiming(latitude, { duration: 450 });
        youLonSv.value = withTiming(longitude, { duration: 450 });

        const rawHeading = (pos.coords as any).heading;
        let headingDeg: number | null =
          typeof rawHeading === "number" && Number.isFinite(rawHeading)
            ? rawHeading
            : null;
        if (headingDeg == null && lastHeadingFixRef.current) {
          const bearing = bearingDegrees(lastHeadingFixRef.current, {
            latitude,
            longitude,
          });
          if (bearing != null) headingDeg = bearing;
        }
        if (headingDeg != null && Number.isFinite(headingDeg)) {
          youHeadingSv.value = withTiming(headingDeg, { duration: 350 });
        }
        lastHeadingFixRef.current = { latitude, longitude };
      } catch {
        // ignore
      }
    };
    tick();
    const id = setInterval(tick, LOCATION_REPORT_INTERVAL_MS);
    locationIntervalRef.current = id;
    return () => {
      clearInterval(id);
      locationIntervalRef.current = null;
    };
  }, [driver, activeGuidanceTrip, reportLocationToDb]);

  // Blink/ping for pickup dot and Live badge on the offline "Assigned trip waiting" card (must run after effectiveFirstIncoming is defined)
  const showOfflineAssignedCard = Boolean(
    driver && !isOnline && hasIncomingTrip,
  );
  useEffect(() => {
    if (!showOfflineAssignedCard) return;
    pickupDotPingAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pickupDotPingAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pickupDotPingAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showOfflineAssignedCard, pickupDotPingAnim]);

  // Blink for "New assignment" card (pending accept, or showing accept/decline feedback).
  const showNewAssignmentCard = Boolean(
    effectiveFirstIncoming &&
    (assignmentFeedback != null ||
      (effectiveIncomingId !== String(acceptedTripId ?? "").toLowerCase() &&
        effectiveIncomingId !== justClaimedTripIdRef.current &&
        effectiveIncomingId !== justClaimedOldTripIdRef.current &&
        !activeMission)),
  );
  const isAcceptedIncomingFlow = Boolean(
    effectiveFirstIncoming &&
    String(acceptedTripId ?? "").toLowerCase() ===
      String(effectiveFirstIncoming.id).toLowerCase(),
  );
  const shouldUseStaticMapSheetCard = Boolean(
    showNewAssignmentCard || activeMission || isAcceptedIncomingFlow,
  );
  const shouldShowIncomingOtpPopup = Boolean(
    effectiveFirstIncoming &&
    firstIncomingRequiresOtp &&
    incomingOtpPopupTripId != null &&
    String(incomingOtpPopupTripId).toLowerCase() ===
      String(effectiveFirstIncoming.id).toLowerCase() &&
    !assignmentFeedback &&
    !activeMission &&
    !isAcceptedIncomingFlow,
  );
  useEffect(() => {
    if (!showNewAssignmentCard) return;
    newAssignmentBlinkAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(newAssignmentBlinkAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(newAssignmentBlinkAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showNewAssignmentCard, newAssignmentBlinkAnim]);

  useEffect(() => {
    if (!effectiveFirstIncoming || !firstIncomingRequiresOtp) {
      setIncomingOtpPopupTripId(null);
      return;
    }
    const tripId = String(effectiveFirstIncoming.id);
    if (
      String(acceptedTripId ?? "").toLowerCase() === tripId.toLowerCase() ||
      String(acknowledgedOtpPopupTripId ?? "").toLowerCase() ===
        tripId.toLowerCase()
    ) {
      return;
    }
    setIncomingOtpPopupTripId(tripId);
  }, [
    effectiveFirstIncoming,
    firstIncomingRequiresOtp,
    acceptedTripId,
    acknowledgedOtpPopupTripId,
  ]);

  // Show map shell for active mission, incoming assignment (including load-based pending OTP),
  // or assignment feedback.
  const shouldShowMap = Boolean(
    activeMission ||
      isAcceptedIncomingFlow ||
      effectiveFirstIncoming ||
      assignmentFeedback != null,
  );
  const activeGuidanceStep = activeGuidanceTrip
    ? deriveDriverGuidanceStep(activeGuidanceTrip)
    : null;
  const activeGuidance =
    activeGuidanceTrip && activeGuidanceStep
      ? getDriverGuidanceConfig(activeGuidanceStep, activeGuidanceTrip)
      : null;
  const guidanceTargetCoordinate =
    activeGuidanceTrip && activeGuidance?.target
      ? getTripStopCoordinate(activeGuidanceTrip, activeGuidance.target)
      : null;
  const highlightedTarget = activeGuidance?.target ?? null;

  // Ola-style: keep the important route/marker in the top ~50% of the screen.
  const olaMapBottomPaddingPx = Math.round(
    Dimensions.get("window").height * 0.5,
  );
  const screenHeight = Dimensions.get("window").height;
  const sheetSnapPoints = useMemo(() => {
    if (shouldUseStaticMapSheetCard) {
      // In dynamic sizing mode (v5), we still need to provide valid snap points.
      // They will be used as fallback or initial points before content height is measured.
      return ["100%"];
    }
    const mid = Math.round(Dimensions.get("window").height * 0.5); // Fixed half-screen
    const min = Math.max(
      220,
      Math.min(mid - 60, Math.round(Dimensions.get("window").height * 0.28)),
    ); // Smaller card
    const expanded = Math.max(
      mid + 80,
      Math.min(
        Math.round(Dimensions.get("window").height * 0.78),
        Math.round(Dimensions.get("window").height - insets.top - 84),
      ),
    );
    return [min, mid, expanded];
  }, [screenHeight, insets.top, shouldUseStaticMapSheetCard]);

  const snapSheetToIndex = useCallback(
    (idx: number) => {
      try {
        const sheetAny = bottomSheetRef.current as any;
        // If we only have one snap point (static mode), always snap to index 0
        const targetIdx = sheetSnapPoints.length === 1 ? 0 : idx;
        if (targetIdx < sheetSnapPoints.length) {
          sheetAny?.snapToIndex?.(targetIdx);
        }
      } catch {
        // ignore
      }
    },
    [sheetSnapPoints.length],
  );

  const handleTripFlowOperationActiveChange = useCallback(
    (active: boolean) => {
      sheetOperationActiveRef.current = active;
      setSheetOperationActive(active);

      if (sheetSnapTimerRef.current) {
        clearTimeout(sheetSnapTimerRef.current);
        sheetSnapTimerRef.current = null;
      }

      if (active) {
        // Keep at mid (index 1) or allow manual scroll during operation.
        // snapSheetToIndex(1); // Optionally snap to mid if not at mid
        return;
      }

      // Return to the "resting" half position shortly after operations end.
      sheetSnapTimerRef.current = setTimeout(() => {
        if (!sheetOperationActiveRef.current) snapSheetToIndex(1);
      }, 180);
    },
    [snapSheetToIndex],
  );

  // When a fresh assignment appears, expand the bottom sheet once so the full card is visible.
  // This does not lock scrolling; user can still drag/scroll the sheet normally afterward.
  useEffect(() => {
    if (!shouldShowMap || !showNewAssignmentCard || !effectiveFirstIncoming)
      return;
    const tripId = String(effectiveFirstIncoming.id).toLowerCase();
    if (lastAutoExpandedIncomingTripIdRef.current === tripId) return;

    lastAutoExpandedIncomingTripIdRef.current = tripId;
    const t = setTimeout(() => {
      if (!sheetOperationActiveRef.current) snapSheetToIndex(1);
    }, 120);
    return () => clearTimeout(t);
  }, [
    effectiveFirstIncoming,
    showNewAssignmentCard,
    shouldShowMap,
    snapSheetToIndex,
  ]);

  const openOtpClaim = useCallback(
    (trip: tripsService.TripRow) => {
      setAcceptError(null);
      setOtpError(null);
      setOtpValue("");
      setOtpClaimTripId(trip.id);
      if (shouldShowMap) snapSheetToIndex(2);
      setTimeout(() => otpInputRef.current?.focus(), 150);
    },
    [snapSheetToIndex, shouldShowMap],
  );

  // Clear OTP claim UI only on explicit cancel or after a successful claim feedback timeout.
  // We removed the auto-clear useEffect to prevent race conditions during backend lag.
  const closeOtpClaim = useCallback(() => {
    setOtpClaimTripId(null);
    setOtpValue("");
    setOtpError(null);
    setOtpSubmitting(false);
  }, []);

  const handleSubmitOtpClaim = useCallback(async () => {
    if (otpSubmitting || assignmentFeedback != null) return;

    const trimmed = (otpValue ?? "")
      .trim()
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (trimmed.length !== OTP_LENGTH) {
      setOtpError("Enter the 6-digit OTP");
      return;
    }

    setAcceptError(null);
    setOtpError(null);
    setOtpSubmitting(true);
    setIsOtpClaiming(true);
    try {
      const { error: err, result } = await claimTripByOtp(trimmed);
      if (err) {
        setOtpError(err.message);
        return;
      }
      if (result?.ok) {
        // 1. Force the success state IMMEDIATELY and await it to ensure React processes the render
        setAssignmentFeedback("accepted");
        setOtpValue("");
        setOtpSubmitting(false);

        // Give the UI a moment to lock into the success state before doing background work
        await new Promise((resolve) => setTimeout(resolve, 50));

        const tripIdToSet = result.trip_id || otpClaimTripId;
        if (tripIdToSet) {
          justClaimedTripIdRef.current = String(tripIdToSet).toLowerCase();
          // Also track the original ID used to claim, as it may change during the process
          if (otpClaimTripId) {
            justClaimedOldTripIdRef.current =
              String(otpClaimTripId).toLowerCase();
          }
          void AsyncStorage.setItem(DRIVER_ACCEPTED_TRIP_ID_KEY, tripIdToSet);
          setAcceptedTripId(tripIdToSet);
          setSelectedIncomingTripId(tripIdToSet);
        }

        // Delay background refresh slightly more
        setTimeout(() => {
          void fetch();
        }, 500);

        if (assignmentFeedbackTimeoutRef.current)
          clearTimeout(assignmentFeedbackTimeoutRef.current);
        assignmentFeedbackTimeoutRef.current = setTimeout(() => {
          setAssignmentFeedback(null);
          setOtpClaimTripId(null);
          assignmentFeedbackTimeoutRef.current = null;
          setOtpValue(""); // Clear OTP value here, after feedback timeout
          setIsOtpClaiming(false); // Reset the flag after feedback timeout
        }, 2500); // 2.5 seconds of stable feedback
        return;
      }
      setOtpError(result?.error ?? "Could not claim trip");
    } finally {
      setOtpSubmitting(false);
    }
  }, [fetch, otpValue, otpClaimTripId, otpSubmitting, assignmentFeedback]);

  const handleOpenOtpClaimFromHeader = useCallback(() => {
    const firstIncomingRequiringOtp =
      incomingNotificationsWithMeta.find((item) => item.requiresOtp)?.trip ??
      null;
    const tripToClaim =
      otpClaimTrip ??
      (effectiveFirstIncoming && firstIncomingRequiresOtp
        ? effectiveFirstIncoming
        : null) ??
      firstIncomingRequiringOtp ??
      pendingOtpTripsRequiringOtp[0] ??
      null;

    if (!tripToClaim) {
      Alert.alert(
        "No OTP trip found",
        "There is no trip waiting for OTP right now.",
      );
      return;
    }

    openOtpClaim(tripToClaim);
  }, [
    effectiveFirstIncoming,
    firstIncomingRequiresOtp,
    incomingNotificationsWithMeta,
    openOtpClaim,
    otpClaimTrip,
    pendingOtpTripsRequiringOtp,
  ]);

  useEffect(() => {
    return () => {
      if (sheetSnapTimerRef.current) clearTimeout(sheetSnapTimerRef.current);
    };
  }, []);
  const lastCameraAnimTsRef = useRef(0);
  const lastCameraCenterRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Smoothly follow the driver marker with `animateCamera` (avoid jitter from `fitToCoordinates`).
  useEffect(() => {
    if (!shouldShowMap) return;
    if (!driverMapPosition) return;

    const showLeaflet =
      Platform.OS === "web" || useLeafletFallback || leafLetForced;

    if (!showLeaflet && !mapRef.current) return;

    const now = Date.now();
    // Throttle to prevent over-animating on frequent GPS updates.
    if (now - lastCameraAnimTsRef.current < 350) return;

    // Also require meaningful movement from the last camera center.
    if (lastCameraCenterRef.current) {
      const movedM = distanceMeters(
        lastCameraCenterRef.current.latitude,
        lastCameraCenterRef.current.longitude,
        driverMapPosition.latitude,
        driverMapPosition.longitude,
      );
      if (movedM < 120) return;
    }

    lastCameraAnimTsRef.current = now;
    lastCameraCenterRef.current = driverMapPosition;

    if (showLeaflet) {
      const targetRef = isFullMapVisible ? fullLeafletRef : leafletRef;
      if (targetRef.current) {
        targetRef.current.focusCurrentLocation(driverMapPosition, 15);
      }
      return;
    }

    try {
      const mapAny = mapRef.current as any;
      const heading = Number(youHeadingSv.value);
      mapAny?.animateCamera?.(
        {
          center: {
            latitude: driverMapPosition.latitude,
            longitude: driverMapPosition.longitude,
          },
          pitch: 0,
          heading: Number.isFinite(heading) ? heading : 0,
        },
        { duration: 450 },
      );
    } catch {
      // ignore camera animation failures
    }
  }, [
    driverMapPosition?.latitude,
    driverMapPosition?.longitude,
    shouldShowMap,
  ]);

  const [optimalRoute, setOptimalRoute] = useState<RouteResult | null>(null);
  const [optimalRouteLoading, setOptimalRouteLoading] = useState(false);
  const optimalRouteKeyRef = useRef<string | null>(null);
  const [showRouteFallback, setShowRouteFallback] = useState(false);

  // Fetch optimal route for the trip path (pickup -> drop) so the map shows an actual route,
  // not a straight-line fallback, throughout assignment -> completion.
  const routeFetchKey = useMemo(() => {
    if (!shouldShowMap) return null;
    const tripForRoute = (activeMission ||
      effectiveFirstIncoming) as tripsService.TripRow | null;
    const pickup = tripForRoute
      ? getTripStopCoordinate(tripForRoute, "pickup")
      : null;
    const drop = tripForRoute
      ? getTripStopCoordinate(tripForRoute, "drop")
      : null;

    const start =
      activeMission && driverMapPosition ? driverMapPosition : pickup;
    const end = activeMission ? guidanceTargetCoordinate : drop;

    if (!start || !end || !tripForRoute) return null;
    return buildRouteFetchKey(tripForRoute.id, start, end);
  }, [
    shouldShowMap,
    activeMission,
    effectiveFirstIncoming,
    driverMapPosition,
    guidanceTargetCoordinate,
  ]);

  useEffect(() => {
    if (!routeFetchKey) {
      setOptimalRoute(null);
      setOptimalRouteLoading(false);
      optimalRouteKeyRef.current = null;
      setShowRouteFallback(false);
      return;
    }

    let cancelled = false;

    const performFetch = async () => {
      optimalRouteKeyRef.current = routeFetchKey;
      setOptimalRouteLoading(true);
      setShowRouteFallback(false);

      const parsed = parseRouteFetchKey(routeFetchKey);
      if (!parsed) {
        if (!cancelled) {
          setOptimalRoute(null);
          setOptimalRouteLoading(false);
          setShowRouteFallback(true);
        }
        return;
      }

      const res = await getOptimalRoute(parsed.from, parsed.to);

      if (cancelled) return;

      setOptimalRoute(res ?? null);
      setOptimalRouteLoading(false);
      setShowRouteFallback(!res);
    };

    void performFetch();

    return () => {
      cancelled = true;
    };
  }, [routeFetchKey]);

  // When map is shown (online or active trip), get current position for map center and "You" marker.
  useEffect(() => {
    if (!shouldShowMap) {
      setDriverMapPosition(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const expoLocation = await getExpoLocation();
        if (!expoLocation) return;
        const { status } = await expoLocation.getForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const pos = await expoLocation.getCurrentPositionAsync({});
        if (cancelled) return;
        setDriverMapPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      } catch {
        if (!cancelled) setDriverMapPosition(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shouldShowMap]);

  // If we switch to a different trip, reset the truck marker so it starts from current GPS.
  useEffect(() => {
    const tripId = activeGuidanceTrip?.id ?? null;
    if (tripId === lastAnimatedTripIdRef.current) return;
    lastAnimatedTripIdRef.current = tripId;
    setTruckPosition(null);
    lastAnimatedStepKeyRef.current = null;
  }, [activeGuidanceTrip?.id]);

  // Stop any in-flight animation when the map closes.
  useEffect(() => {
    if (shouldShowMap) return;
    truckAnimTokenRef.current += 1;
    if (truckRafRef.current != null) cancelAnimationFrame(truckRafRef.current);
    truckRafRef.current = null;
  }, [shouldShowMap]);

  // Status-driven truck animation:
  // - accepted/pickup: animate current -> pickup
  // - transit: animate pickup -> midpoint between pickup & drop (and stop)
  // - reached/completed: animate current -> drop and stay
  useEffect(() => {
    if (!shouldShowMap || !activeGuidanceTrip || !activeGuidanceStep) return;

    const stepKey = `${activeGuidanceTrip.id}:${activeGuidanceStep}`;
    if (lastAnimatedStepKeyRef.current === stepKey) return;
    lastAnimatedStepKeyRef.current = stepKey;

    // Cancel any previous animation run.
    truckAnimTokenRef.current += 1;
    if (truckRafRef.current != null) cancelAnimationFrame(truckRafRef.current);
    truckRafRef.current = null;

    const run = async () => {
      const pickupCoord = getTripStopCoordinate(activeGuidanceTrip, "pickup");
      const dropCoord = getTripStopCoordinate(activeGuidanceTrip, "drop");

      const fromCoord = truckPosition ?? driverMapPosition;
      if (!fromCoord) return;

      const SPEED_MPS = 9; // ~32 km/h; UX timing, not real vehicle physics

      const downsample = (pts: { latitude: number; longitude: number }[]) => {
        if (pts.length <= 2) return pts;
        const minSpacingM = 25;
        const out: { latitude: number; longitude: number }[] = [pts[0]];
        let last = pts[0];
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i];
          if (
            distanceMeters(
              last.latitude,
              last.longitude,
              p.latitude,
              p.longitude,
            ) >= minSpacingM
          ) {
            out.push(p);
            last = p;
          }
        }
        const end = pts[pts.length - 1];
        if (out[out.length - 1] !== end) out.push(end);
        return out;
      };

      const buildCumDistances = (
        pts: { latitude: number; longitude: number }[],
      ) => {
        const cum: number[] = [0];
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          cum.push(
            cum[i] +
              distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude),
          );
        }
        return cum;
      };

      const interpolateAtDistance = (
        pts: { latitude: number; longitude: number }[],
        cum: number[],
        dist: number,
      ) => {
        if (pts.length === 0) return null;
        if (pts.length === 1) return pts[0];
        const total = cum[cum.length - 1] ?? 0;
        if (total <= 0) return pts[pts.length - 1];
        const clamped = Math.max(0, Math.min(total, dist));

        for (let i = 0; i < cum.length - 1; i++) {
          const d0 = cum[i];
          const d1 = cum[i + 1];
          if (clamped >= d0 && clamped <= d1) {
            const denom = d1 - d0;
            const t = denom <= 0 ? 0 : (clamped - d0) / denom;
            const a = pts[i];
            const b = pts[i + 1];
            return {
              latitude: a.latitude + (b.latitude - a.latitude) * t,
              longitude: a.longitude + (b.longitude - a.longitude) * t,
            };
          }
        }
        return pts[pts.length - 1];
      };

      const animateByDistance = (
        pts: { latitude: number; longitude: number }[],
        cum: number[],
        startDist: number,
        endDist: number,
        durationMs: number,
      ) => {
        const token = truckAnimTokenRef.current;
        const travel = Math.max(0, endDist - startDist);
        if (travel <= 0) {
          const finalPos = interpolateAtDistance(pts, cum, endDist);
          if (finalPos && token === truckAnimTokenRef.current)
            setTruckPosition(finalPos);
          return;
        }

        const startTs = Date.now();
        truckLastUpdateMsRef.current = 0;

        const frame = () => {
          if (token !== truckAnimTokenRef.current) return;
          const now = Date.now();
          const elapsed = now - startTs;
          const t = Math.min(1, elapsed / Math.max(1, durationMs));
          const dist = startDist + travel * t;

          // Throttle state updates to keep UI smooth.
          if (now - truckLastUpdateMsRef.current >= 70) {
            const p = interpolateAtDistance(pts, cum, dist);
            if (p) setTruckPosition(p);
            truckLastUpdateMsRef.current = now;
          }

          if (t < 1) {
            truckRafRef.current = requestAnimationFrame(frame);
          } else {
            const finalPos = interpolateAtDistance(pts, cum, endDist);
            if (finalPos && token === truckAnimTokenRef.current)
              setTruckPosition(finalPos);
          }
        };

        truckRafRef.current = requestAnimationFrame(frame);
      };

      const runFullAnimation = async (
        routeFrom: typeof fromCoord,
        routeTo: typeof fromCoord,
        mode: "full" | "mid",
      ) => {
        const route = await getOptimalRoute(routeFrom, routeTo);
        if (token !== truckAnimTokenRef.current) return;
        if (!route || route.coordinates.length < 2) {
          const pts = [routeFrom, routeTo];
          const cum = buildCumDistances(pts);
          const total = cum[cum.length - 1] ?? 0;
          const endDist = mode === "mid" ? total * 0.5 : total;
          animateByDistance(
            pts,
            cum,
            0,
            endDist,
            Math.min(10000, Math.max(800, (total / SPEED_MPS) * 1000)),
          );
          return;
        }
        const pts = downsample(route.coordinates);
        const cum = buildCumDistances(pts);
        const total = cum[cum.length - 1] ?? 0;
        if (total <= 0) return;

        const endDist = mode === "mid" ? total * 0.5 : total;
        animateByDistance(
          pts,
          cum,
          0,
          endDist,
          Math.min(
            10000,
            Math.max(900, route.duration * 1000 * (endDist / total)),
          ),
        );
      };

      // Needed for token checks inside route fetch helper.
      const token = truckAnimTokenRef.current;

      if (activeGuidanceStep === "transit") {
        if (!pickupCoord || !dropCoord) return;

        // For transit, animate from the current truck position (usually at pickup)
        // toward the midpoint of pickup->drop path, then stop there.
        const route = await getOptimalRoute(pickupCoord, dropCoord);
        if (token !== truckAnimTokenRef.current) return;

        if (!route || route.coordinates.length < 2) {
          const midpoint = {
            latitude:
              pickupCoord.latitude +
              (dropCoord.latitude - pickupCoord.latitude) * 0.5,
            longitude:
              pickupCoord.longitude +
              (dropCoord.longitude - pickupCoord.longitude) * 0.5,
          };
          const pts = [fromCoord, midpoint];
          const cum = buildCumDistances(pts);
          const total = cum[cum.length - 1] ?? 0;
          animateByDistance(
            pts,
            cum,
            0,
            total,
            Math.min(10000, Math.max(900, (total / SPEED_MPS) * 1000)),
          );
          return;
        }

        const pts = downsample(route.coordinates);
        const cum = buildCumDistances(pts);
        const total = cum[cum.length - 1] ?? 0;
        if (total <= 0) return;

        const endDist = total * 0.5; // midpoint stop

        // Find a startDist along the same pickup->drop path that best matches fromCoord.
        let bestI = 0;
        let bestD = Number.POSITIVE_INFINITY;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const d = distanceMeters(
            fromCoord.latitude,
            fromCoord.longitude,
            p.latitude,
            p.longitude,
          );
          if (d < bestD) {
            bestD = d;
            bestI = i;
          }
        }
        const startDist = cum[bestI] ?? 0;

        const travel = Math.max(0, endDist - startDist);
        const ratio = travel / total;
        animateByDistance(
          pts,
          cum,
          startDist,
          endDist,
          Math.min(11000, Math.max(900, route.duration * 1000 * ratio)),
        );
        return;
      }

      if (
        activeGuidanceStep === "accepted" ||
        activeGuidanceStep === "pickup"
      ) {
        if (!pickupCoord) return;
        await runFullAnimation(fromCoord, pickupCoord, "full");
        return;
      }

      if (
        activeGuidanceStep === "reached" ||
        activeGuidanceStep === "completed"
      ) {
        if (!dropCoord) return;
        await runFullAnimation(fromCoord, dropCoord, "full");
        return;
      }
    };

    run().catch(() => {
      // If routing fails, do nothing; GPS/route will recover on next step change.
    });
  }, [
    shouldShowMap,
    activeGuidanceTrip,
    activeGuidanceStep,
    driverMapPosition,
    truckPosition,
  ]);

  useEffect(() => {
    const guidanceKey =
      activeGuidanceTrip && activeGuidanceStep
        ? `${activeGuidanceTrip.id}:${activeGuidanceStep}`
        : null;
    if (!guidanceKey) {
      lastGuidanceKeyRef.current = null;
      return;
    }
    if (lastGuidanceKeyRef.current == null) {
      lastGuidanceKeyRef.current = guidanceKey;
      return;
    }
    if (lastGuidanceKeyRef.current !== guidanceKey && activeGuidance) {
      lastGuidanceKeyRef.current = guidanceKey;
      triggerSuccess(activeGuidance.toastMessage);
    }
  }, [activeGuidance, activeGuidanceStep, activeGuidanceTrip]);

  const defaultBoundsTrip = (activeMission ||
    effectiveFirstIncoming) as tripsService.TripRow | null;
  const defaultBoundsPickup = defaultBoundsTrip
    ? getTripStopCoordinate(defaultBoundsTrip, "pickup")
    : null;
  const defaultBoundsDrop = defaultBoundsTrip
    ? getTripStopCoordinate(defaultBoundsTrip, "drop")
    : null;
  const defaultBoundsTripKey =
    defaultBoundsTrip && defaultBoundsPickup && defaultBoundsDrop
      ? `${defaultBoundsTrip.id}:${defaultBoundsPickup.latitude}:${defaultBoundsPickup.longitude}:${defaultBoundsDrop.latitude}:${defaultBoundsDrop.longitude}`
      : null;

  const fitMapToActiveContext = useCallback(
    (
      targetRef: { current: any },
      options?: { isFullScreen?: boolean; force?: boolean },
    ) => {
      if (!targetRef.current) return;
      const tripForBounds = defaultBoundsTrip;
      const pickup = defaultBoundsPickup;
      const drop = defaultBoundsDrop;

      if (!tripForBounds || !pickup || !drop) return;

      const isFullScreen = options?.isFullScreen === true;
      const screenHeight = Dimensions.get("window").height;
      const inlineMapHeight =
        inlineMapViewportHeightRef.current > 0
          ? inlineMapViewportHeightRef.current
          : Math.round(screenHeight * 0.42);

      // When using Ola-style bottom sheet, reserve the lower portion for the panel.
      // This keeps pickup/drop focus visible in the top ~50%.
      const bottomPadding = isFullScreen
        ? 160
        : shouldShowMap
          ? olaMapBottomPaddingPx
          : Math.max(110, Math.round(inlineMapHeight * 0.45));

      const routeCoords = optimalRoute?.coordinates;
      const coordsForFit =
        routeCoords && routeCoords.length >= 2
          ? subsampleRouteCoordinates(routeCoords, 220)
          : [pickup, drop];

      const baseFitKey = `${tripForBounds.id}:${pickup.latitude}:${pickup.longitude}:${drop.latitude}:${drop.longitude}`;
      const fitKey = `${baseFitKey}:route:${routeCoords?.length ?? 0}`;
      const lastFitKeyRef = isFullScreen
        ? fullMapLastFitKeyRef
        : inlineMapLastFitKeyRef;

      if (!options?.force && lastFitKeyRef.current === fitKey) return;

      targetRef.current.fitToCoordinates(coordsForFit, {
        edgePadding: { top: 100, right: 50, bottom: bottomPadding, left: 50 },
        animated: false,
      });
      lastFitKeyRef.current = fitKey;
    },
    [
      defaultBoundsDrop,
      defaultBoundsPickup,
      defaultBoundsTrip,
      optimalRoute,
      shouldShowMap,
      olaMapBottomPaddingPx,
    ],
  );

  // Refit inline map when road geometry loads so the full path is visible (not just A→B).
  useEffect(() => {
    if (!shouldShowMap) return;
    if (!optimalRoute?.coordinates?.length) return;
    const t = setTimeout(() => {
      fitMapToActiveContext(mapRef, { force: true });
    }, 150);
    return () => clearTimeout(t);
  }, [optimalRoute, shouldShowMap, fitMapToActiveContext]);

  // Pulsating circle when searching for assignments (online, no mission, no incoming)
  const showSearchingOverlay = Boolean(
    driver && isOnline && !activeMission && !effectiveFirstIncoming,
  );

  useEffect(() => {
    if (!showSearchingOverlay) return;
    searchPulseAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(searchPulseAnim, {
        toValue: 1,
        duration: 1600,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [showSearchingOverlay, searchPulseAnim]);

  const driverName =
    profile?.full_name?.trim() || profile?.displayName?.trim() || "Pilot";

  const handleFocusCurrentLocation = useCallback(async (): Promise<boolean> => {
    try {
      setIsFetchingLocation(true);

      // Fetch the latest accurate location
      const expoLocation = await getExpoLocation();
      let currentPos = driverMapPosition;

      if (expoLocation) {
        let { status } = await expoLocation.getForegroundPermissionsAsync();
        if (status !== "granted") {
          const req = await expoLocation.requestForegroundPermissionsAsync();
          status = req.status;
        }
        if (status === "granted") {
          const current = await expoLocation.getCurrentPositionAsync({
            accuracy:
              (expoLocation as any).Accuracy?.High ??
              (expoLocation as any).Accuracy?.Balanced,
          });

          currentPos = {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          };

          // Update state so the "You" marker jumps there
          setDriverMapPosition(currentPos);
          // Keep the animated marker in sync (it is driven by shared values).
          youLatSv.value = withTiming(currentPos.latitude, { duration: 450 });
          youLonSv.value = withTiming(currentPos.longitude, { duration: 450 });
        }
      }

      if (!currentPos) return false;

      const showLeaflet =
        Platform.OS === "web" || useLeafletFallback || leafLetForced;

      if (showLeaflet) {
        const targetRef = isFullMapVisible ? fullLeafletRef : leafletRef;
        if (targetRef.current) {
          targetRef.current.focusCurrentLocation(currentPos, 15);
        }
        return true;
      }

      const targetRef = isFullMapVisible ? fullMapRef : mapRef;
      if (!targetRef.current) return true;
      const mapAny = targetRef.current as any;

      // Try animateCamera first (smoother if supported)
      if (mapAny?.animateCamera) {
        mapAny.animateCamera(
          {
            center: {
              latitude: currentPos.latitude,
              longitude: currentPos.longitude,
            },
            zoom: 18,
            pitch: 0,
            heading: Number(youHeadingSv.value) || 0,
          },
          { duration: 500 },
        );
      } else if (mapAny?.animateToRegion) {
        // Fallback to animateToRegion which is universally supported
        mapAny.animateToRegion(
          {
            latitude: currentPos.latitude,
            longitude: currentPos.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          },
          500,
        );
      }
      return true;
    } catch {
      return false;
    } finally {
      setIsFetchingLocation(false);
    }
  }, [
    driverMapPosition,
    isFullMapVisible,
    leafLetForced,
    useLeafletFallback,
    youHeadingSv,
    youLatSv,
    youLonSv,
  ]);

  // Live follow mode: keep centering on device GPS until toggled off.
  useEffect(() => {
    if (!shouldShowMap || !isFollowingLocation) {
      locationWatchRef.current?.remove?.();
      locationWatchRef.current = null;
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const expoLocation = await getExpoLocation();
        if (!expoLocation) return;
        const { status } = await expoLocation.getForegroundPermissionsAsync();
        if (status !== "granted") return;

        // Ensure only one watcher exists.
        locationWatchRef.current?.remove?.();
        locationWatchRef.current = await (
          expoLocation as any
        ).watchPositionAsync(
          {
            accuracy:
              (expoLocation as any).Accuracy?.Balanced ??
              (expoLocation as any).Accuracy?.High,
            distanceInterval: 20,
            timeInterval: 5000,
          } as any,
          (pos: any) => {
            if (cancelled) return;
            const next = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };
            setDriverMapPosition(next);
            // Keep the animated marker in sync with follow updates.
            youLatSv.value = withTiming(next.latitude, { duration: 450 });
            youLonSv.value = withTiming(next.longitude, { duration: 450 });

            // Keep the visible map centered while following.
            const showLeaflet =
              Platform.OS === "web" || useLeafletFallback || leafLetForced;
            if (showLeaflet) {
              const targetRef = isFullMapVisible ? fullLeafletRef : leafletRef;
              targetRef.current?.focusCurrentLocation?.(next, 15);
              return;
            }

            const targetRef = isFullMapVisible ? fullMapRef : mapRef;
            const mapAny = targetRef.current as any;
            if (!mapAny) return;
            try {
              if (mapAny?.animateCamera) {
                mapAny.animateCamera(
                  {
                    center: next,
                    zoom: 18,
                    pitch: 0,
                    heading: Number(youHeadingSv.value) || 0,
                  },
                  { duration: 450 },
                );
              } else if (mapAny?.animateToRegion) {
                mapAny.animateToRegion(
                  {
                    latitude: next.latitude,
                    longitude: next.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  },
                  450,
                );
              }
            } catch {
              // ignore
            }
          },
        );
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
      locationWatchRef.current?.remove?.();
      locationWatchRef.current = null;
    };
  }, [
    isFollowingLocation,
    isFullMapVisible,
    leafLetForced,
    shouldShowMap,
    useLeafletFallback,
    youHeadingSv,
  ]);

  useEffect(() => {
    if (!isFullMapVisible) return;
    const timer = setTimeout(() => {
      fitMapToActiveContext(fullMapRef, { isFullScreen: true, force: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [defaultBoundsTripKey, fitMapToActiveContext, isFullMapVisible]);

  const handleSetOffline = useCallback(() => {
    setIsOnline(false);
    setJustCompletedTrip(false);
  }, []);

  const renderDriverMap = (
    targetRef: { current: any },
    options?: { fullScreen?: boolean; controlsVariant?: "modal" | "embedded" },
  ) => {
    const isFullScreen = options?.fullScreen === true;
    const mapInteractionsLocked = Boolean(otpClaimTripId);
    const controlsVariant = options?.controlsVariant ?? "modal";

    const mapCenter = driverMapPosition ?? DEFAULT_MAP_REGION;

    const showLeaflet =
      Platform.OS === "web" || useLeafletFallback || leafLetForced;

    const pickup =
      shouldShowMap && (effectiveFirstIncoming || activeMission)
        ? getTripStopCoordinate(
            (activeMission || effectiveFirstIncoming) as tripsService.TripRow,
            "pickup",
          )
        : null;
    const drop =
      shouldShowMap && (effectiveFirstIncoming || activeMission)
        ? getTripStopCoordinate(
            (activeMission || effectiveFirstIncoming) as tripsService.TripRow,
            "drop",
          )
        : null;

    const leafletMarkers: LeafletMarker[] = [
      {
        id: "you",
        coordinate: mapCenter,
        label: "You",
        color: Theme.primary,
      },
    ];
    if (pickup) {
      leafletMarkers.push({
        id: "pickup",
        coordinate: pickup,
        label: "Pickup",
        color: "#10b981",
      });
    }
    if (drop) {
      leafletMarkers.push({
        id: "drop",
        coordinate: drop,
        label: "Drop",
        color: "#f59e0b",
      });
    }

    const fallbackCoordinates =
      activeMission && driverMapPosition && guidanceTargetCoordinate
        ? [driverMapPosition, guidanceTargetCoordinate]
        : pickup && drop
          ? [pickup, drop]
          : [];

    const routeCoords = optimalRoute?.coordinates;
    const leafletPolyline =
      routeCoords && routeCoords.length >= 2
        ? routeCoords
        : fallbackCoordinates.length >= 2
          ? fallbackCoordinates
          : [];

    return (
      <View
        style={isFullScreen ? styles.fullMapContainer : styles.assignedMapHalf}
        onLayout={(event) => {
          if (isFullScreen) return;
          const measured = event.nativeEvent.layout.height;
          inlineMapViewportHeightRef.current = measured;
          if (Math.abs(measured - inlineMapViewportHeight) > 1) {
            setInlineMapViewportHeight(measured);
          }
        }}
      >
        {showLeaflet ? (
          <LeafletMap
            ref={isFullScreen ? fullLeafletRef : leafletRef}
            style={isFullScreen ? styles.fullMapView : styles.assignedMapInHalf}
            center={mapCenter}
            zoom={15}
            markers={leafletMarkers}
            polyline={leafletPolyline}
            polylineColor={Theme.primary}
            lowPower={false}
          />
        ) : (
          <MapView
            ref={(instance: any) => {
              targetRef.current = instance;
            }}
            style={isFullScreen ? styles.fullMapView : styles.assignedMapInHalf}
            initialRegion={
              driverMapPosition
                ? {
                    ...driverMapPosition,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }
                : DEFAULT_MAP_REGION
            }
            mapType={
              Platform.OS === "ios" ? ("mutedStandard" as any) : "standard"
            }
            userInterfaceStyle={mapIsDark ? ("dark" as any) : ("light" as any)}
            customMapStyle={mapIsDark ? (darkMapStyle as any) : undefined}
            showsUserLocation={false}
            scrollEnabled={!mapInteractionsLocked}
            zoomEnabled={!mapInteractionsLocked}
            rotateEnabled={false}
            pitchEnabled={!mapInteractionsLocked}
            moveOnMarkerPress={false}
            pointerEvents="auto"
            onMapReady={() => {
              // Native map became ready — clear "booting" so we don't fallback on next launch.
              void AsyncStorage.setItem(DRIVER_MAP_BOOT_KEY, "0").catch(
                () => {},
              );
              void AsyncStorage.removeItem(DRIVER_MAP_BOOT_TS_KEY).catch(
                () => {},
              );
              // Do not animateCamera here — it fights fitMapToActiveContext and user pan/pinch
              // (including at drop-off / Upload POD when the bottom sheet layout shifts).
            }}
            mapPadding={{
              top: 0,
              left: 0,
              right: 0,
              bottom: olaMapBottomPaddingPx,
            }}
          >
            {/* Always render the "You" marker so the current-location indication is visible
              immediately, then it updates as driverMapPosition becomes available. */}
            {OlaAnimatedMarker ? (
              <OlaAnimatedMarker
                animatedProps={youMarkerAnimatedProps}
                coordinate={driverMapPosition ?? DEFAULT_MAP_REGION}
                anchor={{ x: 0.5, y: 1 }}
              >
                <Reanimated.View
                  style={[
                    styles.olaYouMarker,
                    youIconAnimatedStyle,
                    {
                      backgroundColor: Theme.primary,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <FontAwesome
                    name="location-arrow"
                    size={16}
                    color={Theme.textOnPrimary}
                  />
                </Reanimated.View>
                <Callout>
                  <View
                    style={[
                      styles.assignedMapCallout,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.assignedMapCalloutTitle,
                        { color: colors.text },
                      ]}
                    >
                      You
                    </Text>
                    <Text
                      style={[
                        styles.assignedMapCalloutSub,
                        { color: colors.textMuted },
                      ]}
                      numberOfLines={2}
                    >
                      {locationLabel ?? "Current location"}
                    </Text>
                  </View>
                </Callout>
              </OlaAnimatedMarker>
            ) : null}

            {shouldShowMap && (effectiveFirstIncoming || activeMission) && (
              <>
                {getTripStopCoordinate(
                  (activeMission ||
                    effectiveFirstIncoming) as tripsService.TripRow,
                  "pickup",
                ) && (
                  <Marker
                    coordinate={
                      getTripStopCoordinate(
                        (activeMission ||
                          effectiveFirstIncoming) as tripsService.TripRow,
                        "pickup",
                      )!
                    }
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View
                      style={[
                        styles.customMapMarkerPickup,
                        highlightedTarget === "pickup" &&
                          styles.customMapMarkerActive,
                      ]}
                    >
                      <FontAwesome
                        name="map-marker"
                        size={highlightedTarget === "pickup" ? 14 : 12}
                        color="white"
                      />
                    </View>
                  </Marker>
                )}
                {getTripStopCoordinate(
                  (activeMission ||
                    effectiveFirstIncoming) as tripsService.TripRow,
                  "drop",
                ) && (
                  <Marker
                    coordinate={
                      getTripStopCoordinate(
                        (activeMission ||
                          effectiveFirstIncoming) as tripsService.TripRow,
                        "drop",
                      )!
                    }
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View
                      style={[
                        styles.customMapMarkerDrop,
                        highlightedTarget === "drop" &&
                          styles.customMapMarkerActive,
                      ]}
                    >
                      <FontAwesome
                        name="flag"
                        size={highlightedTarget === "drop" ? 12 : 10}
                        color="white"
                      />
                    </View>
                  </Marker>
                )}
                {optimalRoute ? (
                  <>
                    <Polyline
                      coordinates={optimalRoute.coordinates}
                      strokeColor={`${Theme.primary}33`}
                      strokeWidth={8}
                      lineCap="round"
                      lineJoin="round"
                    />
                    <Polyline
                      coordinates={optimalRoute.coordinates}
                      strokeColor={Theme.primary}
                      strokeWidth={4}
                      lineCap="round"
                      lineJoin="round"
                    />
                  </>
                ) : (
                  showRouteFallback &&
                  (() => {
                    const fallbackPickup = getTripStopCoordinate(
                      (activeMission ||
                        effectiveFirstIncoming) as tripsService.TripRow,
                      "pickup",
                    );
                    const fallbackDrop = getTripStopCoordinate(
                      (activeMission ||
                        effectiveFirstIncoming) as tripsService.TripRow,
                      "drop",
                    );
                    const fallbackCoordinates =
                      activeMission &&
                      driverMapPosition &&
                      guidanceTargetCoordinate
                        ? [driverMapPosition, guidanceTargetCoordinate]
                        : fallbackPickup && fallbackDrop
                          ? [fallbackPickup, fallbackDrop]
                          : [];
                    return fallbackCoordinates.length >= 2 ? (
                      <>
                        <Polyline
                          coordinates={fallbackCoordinates}
                          strokeColor={`${Theme.primary}26`}
                          strokeWidth={8}
                          lineCap="round"
                          lineJoin="round"
                        />
                        <Polyline
                          coordinates={fallbackCoordinates}
                          strokeColor={Theme.primary}
                          strokeWidth={4}
                          lineCap="round"
                          lineJoin="round"
                        />
                      </>
                    ) : null;
                  })()
                )}
              </>
            )}
          </MapView>
        )}

        {activeGuidance ? (
          <View
            pointerEvents="none"
            style={[
              styles.mapGuidanceChip,
              isFullScreen
                ? { top: insets.top + 16, left: 16, right: 76 }
                : { left: 14, right: 72, bottom: 18 },
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.mapGuidanceHeaderRow}>
              <View
                style={[
                  styles.mapGuidanceIconWrap,
                  { backgroundColor: colors.emeraldMuted },
                ]}
              >
                <FontAwesome
                  name={activeGuidance.icon}
                  size={14}
                  color={colors.emerald}
                />
              </View>
              <Text
                style={[styles.mapGuidanceTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {activeGuidance.title}
              </Text>
            </View>
            <Text
              style={[styles.mapGuidanceSubtitle, { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {activeGuidance.subtitle}
            </Text>
          </View>
        ) : null}

        {/* Full route (modal) + live location — top of map, aligned.
            Hide controls during OTP entry UI. */}
        {otpClaimTripId == null ? (
          <View
            style={[
              styles.mapTopControlsRow,
              {
                // IMPORTANT:
                // - In the main Driver screen, the map is rendered "fullScreen" behind the header.
                //   So controls must be pushed down below the header (embedded variant).
                // - In the modal full-map view, controls should sit at the top safe area.
                top:
                  controlsVariant === "embedded"
                    ? insets.top + 96
                    : insets.top + 10,
              },
            ]}
            pointerEvents="box-none"
          >
            {controlsVariant === "embedded" ? (
              <TouchableOpacity
                style={[
                  styles.mapTopPillButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  setIsFullMapVisible(true);
                  setTimeout(() => {
                    try {
                      fitMapToActiveContext(fullMapRef, {
                        isFullScreen: true,
                        force: true,
                      });
                    } catch {}
                  }, 350);
                }}
                activeOpacity={0.88}
                accessibilityLabel="Open full screen map"
                accessibilityRole="button"
              >
                <FontAwesome name="expand" size={15} color={colors.text} />
                <Text
                  style={[styles.mapTopPillLabel, { color: colors.text }]}
                  numberOfLines={1}
                >
                  Full view
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.mapTopPillButton,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  setIsFullMapVisible(false);
                  setTimeout(() => {
                    try {
                      fitMapToActiveContext(mapRef, { force: true });
                    } catch {}
                  }, 200);
                }}
                activeOpacity={0.88}
                accessibilityLabel="Close full screen map"
                accessibilityRole="button"
              >
                <FontAwesome name="compress" size={15} color={colors.text} />
                <Text
                  style={[styles.mapTopPillLabel, { color: colors.text }]}
                  numberOfLines={1}
                >
                  Done
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.mapTopPillButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={async () => {
                // First: center immediately. Only enable follow if we got a real fix.
                const ok = await handleFocusCurrentLocation();
                if (ok) setIsFollowingLocation(true);
              }}
              onLongPress={() => setIsFollowingLocation(false)}
              accessibilityLabel="Track current location"
              accessibilityRole="button"
              disabled={isFetchingLocation}
            >
              {isFetchingLocation ? (
                <ActivityIndicator size="small" color={Theme.primary} />
              ) : (
                <FontAwesome name="crosshairs" size={17} color={colors.text} />
              )}
              <Text
                style={[styles.mapTopPillLabel, { color: colors.text }]}
                numberOfLines={1}
              >
                {isFollowingLocation ? "Tracking" : "My location"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  const renderDriverDashboardTripInner = (mapSheet: boolean) => (
    <>
      {/* Only show separate OTP block when first pending OTP (non-roster) is not already the main assignment card */}
      {!shouldShowMap &&
        !hasIncomingTrip &&
        pendingOtpTripsRequiringOtp.length > 0 &&
        !(
          effectiveFirstIncoming &&
          pendingOtpTripsRequiringOtp[0]?.id === effectiveFirstIncoming.id
        ) && (
          <View
            style={[
              styles.centerCardWrap,
              styles.centerCardConstraint,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                marginBottom: 16,
              },
            ]}
          >
            <View
              style={[
                styles.offlineIconWrap,
                { backgroundColor: colors.emeraldMuted },
              ]}
            >
              <FontAwesome name="key" size={28} color={colors.emerald} />
            </View>
            <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
              Trip{pendingOtpTripsRequiringOtp.length > 1 ? "s" : ""} waiting
              for OTP
            </Text>
            <Text
              style={[
                styles.offlineCardSubtitle,
                { color: colors.textMuted, marginTop: 4 },
              ]}
            >
              Enter the OTP from your dispatcher in the app to claim{" "}
              {pendingOtpTripsRequiringOtp.length > 1 ? "them" : "it"}.
            </Text>
            <TouchableOpacity
              style={[
                styles.goOnlineBtn,
                { backgroundColor: colors.emerald, marginTop: 16 },
              ]}
              onPress={() => openOtpClaim(pendingOtpTripsRequiringOtp[0])}
              activeOpacity={0.8}
            >
              <FontAwesome
                name="key"
                size={16}
                color={Theme.textOnPrimary}
                style={styles.goOnlineBtnIcon}
              />
              <Text style={styles.goOnlineBtnText}>Enter OTP to claim</Text>
              <FontAwesome
                name="chevron-right"
                size={14}
                color={Theme.textOnPrimary}
              />
            </TouchableOpacity>
          </View>
        )}
      {!shouldShowMap &&
        !hasIncomingTrip &&
        pendingOtpTripsRequiringOtp.length > 0 &&
        !(
          effectiveFirstIncoming &&
          pendingOtpTripsRequiringOtp[0]?.id === effectiveFirstIncoming.id
        ) && (
          <View style={styles.centerCardConstraint}>
            {pendingOtpTripsRequiringOtp.map((trip) => (
              <View
                key={trip.id}
                style={[
                  styles.centerCardWrap,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    marginBottom: 12,
                  },
                ]}
              >
                <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
                  {tripsService.getTripDisplayNumber(trip)}
                </Text>
                {otpClaimTripId != null &&
                String(otpClaimTripId).toLowerCase() ===
                  String(trip.id).toLowerCase() ? (
                  assignmentFeedback === "accepted" ? (
                    <View style={styles.feedbackBlock}>
                      <View
                        style={[
                          styles.feedbackIconWrap,
                          styles.feedbackIconWrapSuccess,
                          { backgroundColor: colors.emeraldMuted },
                        ]}
                      >
                        <FontAwesome
                          name="check-circle"
                          size={36}
                          color={colors.emerald}
                        />
                      </View>
                      <Text
                        style={[styles.feedbackTitle, { color: colors.text }]}
                      >
                        Trip booked
                      </Text>
                      <Text
                        style={[
                          styles.feedbackSubtitle,
                          { color: colors.textMuted },
                        ]}
                      >
                        Head to pickup. Continue below.
                      </Text>
                    </View>
                  ) : (
                    renderOtpClaimCard(trip, { showCancel: true })
                  )
                ) : (
                  <>
                    <Text
                      style={[
                        styles.offlineCardSubtitle,
                        { color: colors.textMuted, marginTop: 2 },
                      ]}
                    >
                      {trip.pickup_area?.trim() || "Pickup"} →{" "}
                      {trip.drop_location?.trim() || "Drop-off"}
                    </Text>
                    <Text
                      style={[
                        styles.offlineCardSubtitle,
                        { color: colors.textMuted, marginTop: 4 },
                      ]}
                    >
                      Aggregate trip reassigned by phone — accept and enter OTP
                      to claim.
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.goOnlineBtn,
                        {
                          backgroundColor: colors.emerald,
                          marginTop: 12,
                        },
                      ]}
                      onPress={() => openOtpClaim(trip)}
                      activeOpacity={0.8}
                    >
                      <FontAwesome
                        name="check"
                        size={14}
                        color={Theme.textOnPrimary}
                        style={styles.goOnlineBtnIcon}
                      />
                      <Text style={styles.goOnlineBtnText}>
                        Accept and enter OTP
                      </Text>
                      <FontAwesome
                        name="chevron-right"
                        size={14}
                        color={Theme.textOnPrimary}
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ))}
          </View>
        )}
      {!driver && (
        <View
          style={[
            styles.centerCardWrap,
            styles.noDriverWrap,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.offlineIconWrap,
              { backgroundColor: colors.whiteMuted },
            ]}
          >
            <FontAwesome
              name="envelope-open"
              size={40}
              color={colors.textMuted}
            />
          </View>
          <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
            No organisation linked
          </Text>
          <Text
            style={[styles.offlineCardSubtitle, { color: colors.textMuted }]}
          >
            Request an invitation from your organisation. Once accepted, your
            assigned trips will appear here.
          </Text>
        </View>
      )}
      {driver ? (
        activeMission ? (
          <DriverTripFlowCard
            trip={activeMission}
            commissionAmount={activeMissionCommission}
            onRefresh={fetch}
            onTripCompleted={() => setJustCompletedTrip(true)}
            onBackToDashboard={async () => {
              await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
              setAcceptedTripId(null);
              setSelectedIncomingTripId(null);
              setAssignmentFeedback(null);
              setJustCompletedTrip(false);
              justClaimedTripIdRef.current = null;
              justClaimedOldTripIdRef.current = null;
              fetch();
            }}
            {...(mapSheet
              ? {
                  edgeToEdge: true,
                  variant: "page" as const,
                  onOperationActiveChange: handleTripFlowOperationActiveChange,
                }
              : {})}
          />
        ) : assignmentFeedback === "accepted" ? (
          <View style={styles.feedbackBlock}>
            <View
              style={[
                styles.feedbackIconWrap,
                styles.feedbackIconWrapSuccess,
                { backgroundColor: colors.emeraldMuted },
              ]}
            >
              <FontAwesome
                name="check-circle"
                size={36}
                color={colors.emerald}
              />
            </View>
            <Text style={[styles.feedbackTitle, { color: colors.text }]}>
              Trip booked
            </Text>
            <Text
              style={[styles.feedbackSubtitle, { color: colors.textMuted }]}
            >
              Head to pickup. Continue below.
            </Text>
          </View>
        ) : assignmentFeedback === "declined" ? (
          <View style={styles.feedbackBlock}>
            <View
              style={[
                styles.feedbackIconWrap,
                styles.feedbackIconWrapSkipped,
                { backgroundColor: colors.whiteMuted },
              ]}
            >
              <FontAwesome
                name="times-circle"
                size={36}
                color={colors.textMuted}
              />
            </View>
            <Text style={[styles.feedbackTitle, { color: colors.text }]}>
              Skipped
            </Text>
            <Text
              style={[styles.feedbackSubtitle, { color: colors.textMuted }]}
            >
              Looking for your next trip.
            </Text>
          </View>
        ) : !isOnline && !hasIncomingTrip ? (
          <View style={[styles.centerCardWrap, styles.offlineCardContent]}>
            <Text style={[styles.offlineCardTitle, { color: colors.text }]}>
              You are currently offline
            </Text>
            <Text
              style={[styles.offlineCardSubtitle, { color: colors.textMuted }]}
            >
              Go online to view and accept trip assignments.
            </Text>
            <TouchableOpacity
              style={[
                styles.searchOfflineBtn,
                {
                  marginTop: 12,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={() => {
                setIsOnline(true);
                triggerSuccess("You are online now.");
                fetch();
                setLocationStatus("loading");
                fetchLocation();
                if (driver?.organization_id && driver?.id) {
                  void driversService
                    .updateDriver(driver.organization_id, driver.id, {
                      status: "online",
                    })
                    .catch(() => {});
                }
              }}
              activeOpacity={0.8}
            >
              <FontAwesome name="wifi" size={16} color={colors.text} />
              <Text
                style={[styles.searchOfflineBtnText, { color: colors.text }]}
              >
                Go online
              </Text>
            </TouchableOpacity>
          </View>
        ) : !effectiveFirstIncoming && hasIncomingTrip ? (
          <View style={styles.centerCardConstraint}>
            <View style={[styles.centerCardWrap, styles.notificationListIntro]}>
              <Text style={[styles.notificationListTitle, { color: colors.text }]}>
                New trips ({incomingNotificationsWithMeta.length})
              </Text>
              <Text style={[styles.notificationListSubtitle, { color: colors.textMuted }]}>
                Tap a trip to open the map and accept.
              </Text>
            </View>
            <ScrollView
              style={styles.invitesScroll}
              contentContainerStyle={styles.invitesScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {incomingNotificationsWithMeta.map((item) => (
                <TouchableOpacity
                  key={item.trip.id}
                  activeOpacity={0.85}
                  onPress={() => setSelectedIncomingTripId(item.trip.id)}
                  style={[
                    styles.centerCardWrap,
                    styles.notificationSelectCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.notificationSelectHeader}>
                    <Text style={[styles.notificationSelectTripId, { color: colors.text }]}>
                      {tripsService.getTripDisplayNumber(item.trip)}
                    </Text>
                    {item.requiresOtp ? (
                      <View
                        style={[
                          styles.notificationOtpBadgeMinimal,
                          {
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                      >
                        <Text style={[styles.notificationOtpBadgeMinimalText, { color: colors.textMuted }]}>
                          OTP
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.notificationSelectRoute, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {item.trip.pickup_area?.trim() || "Pickup"} →{" "}
                    {item.trip.drop_location?.trim() || "Drop-off"}
                  </Text>
                  <Text style={styles.notificationAssignedByLine} numberOfLines={2}>
                    <Text style={[styles.notificationAssignedByPrefix, { color: colors.textMuted }]}>
                      Assigned by{" "}
                    </Text>
                    <Text style={[styles.notificationAssignedByName, { color: colors.text }]}>
                      {item.assignerPersonDisplay}
                    </Text>
                  </Text>
                  <Text
                    style={[styles.notificationSelectMeta, { color: colors.textMuted, marginTop: 6 }]}
                  >
                    {item.commissionForTrip > 0
                      ? `Est. earning ${formatINR(item.commissionForTrip)}`
                      : "Est. earning · Salary"}
                  </Text>
                  <View style={styles.notificationSelectFooter}>
                    <Text style={[styles.notificationSelectActionTextMuted, { color: colors.textMuted }]}>
                      Open
                    </Text>
                    <FontAwesome name="chevron-right" size={12} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {notificationHistory.length > 0 ? (
              <View style={styles.notificationHistoryWrap}>
                <Text
                  style={[
                    styles.notificationHistoryHint,
                    { color: colors.textMuted },
                  ]}
                >
                  {notificationHistory.length} notification
                  {notificationHistory.length > 1 ? "s" : ""} moved to history.
                </Text>
                {notificationHistoryTrips.map((item) => (
                  <Text
                    key={`${item.trip.id}-${item.movedAt}`}
                    style={[
                      styles.notificationHistoryItem,
                      { color: colors.textMuted },
                    ]}
                  >
                    {tripsService.getTripDisplayNumber(item.trip)} -{" "}
                    {item.reason === "declined"
                      ? "declined"
                      : "moved after another trip was accepted"}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : effectiveFirstIncoming &&
          String(acceptedTripId ?? "").toLowerCase() ===
            String(effectiveFirstIncoming.id).toLowerCase() ? (
          <DriverTripFlowCard
            trip={effectiveFirstIncoming}
            commissionAmount={newAssignmentCommission}
            onRefresh={fetch}
            onTripCompleted={() => setJustCompletedTrip(true)}
            onBackToDashboard={async () => {
              await AsyncStorage.removeItem(DRIVER_ACCEPTED_TRIP_ID_KEY);
              setAcceptedTripId(null);
              setSelectedIncomingTripId(null);
              setAssignmentFeedback(null);
              setJustCompletedTrip(false);
              justClaimedTripIdRef.current = null;
              justClaimedOldTripIdRef.current = null;
              fetch();
            }}
            {...(mapSheet
              ? {
                  edgeToEdge: true,
                  variant: "page" as const,
                  onOperationActiveChange: handleTripFlowOperationActiveChange,
                }
              : {})}
          />
        ) : showNewAssignmentCard &&
          effectiveFirstIncoming &&
          !shouldShowIncomingOtpPopup &&
          !assignmentFeedback ? (
          <JobRequestCard
            pickup={effectiveFirstIncoming.pickup_area?.trim() || "—"}
            dropoff={effectiveFirstIncoming.drop_location?.trim() || "—"}
            distance={(() => {
              const d = effectiveFirstIncoming.distance;
              const dNum =
                d != null ? parseFloat(String(d).replace(/[^0-9.]/g, "")) : NaN;
              if (!Number.isNaN(dNum) && dNum > 0) return formatTripDistance(d);
              if (optimalRouteLoading) return "...";
              if (optimalRoute && "distance" in optimalRoute)
                return formatTripDistance(optimalRoute.distance / 1000);
              return "—";
            })()}
            eta={(() => {
              const e = effectiveFirstIncoming.estimated_duration;
              if (
                e != null &&
                String(e).trim() !== "" &&
                !String(e).includes("00:00:00")
              )
                return formatEstimatedDuration(e);
              if (optimalRouteLoading) return "...";
              if (optimalRoute && "duration" in optimalRoute) {
                const dur = optimalRoute.duration;
                return formatEstimatedDuration(
                  dur >= 3600
                    ? `${Math.floor(dur / 3600)}H ${Math.round((dur % 3600) / 60)}M`
                    : `${Math.round(dur / 60)}M`,
                );
              }
              return "—";
            })()}
            earnings={
              (selectedIncomingMeta?.commissionForTrip ?? 0) > 0
                ? formatINR(selectedIncomingMeta?.commissionForTrip ?? 0)
                : "SALARY"
            }
            onAccept={() => handleAcceptMission(effectiveFirstIncoming)}
            onDecline={() => handleDeclineAssignment(effectiveFirstIncoming.id)}
            requireOtp={firstIncomingRequiresOtp}
            disabled={acceptLoading || declineLoading}
            earningsAmountColor={jobRequestSheetPrimary}
            primaryTextColor={jobRequestSheetPrimary}
            mutedTextColor={jobRequestSheetMuted}
            holdTrackColor={jobRequestHoldTrack}
            accentColor={colors.emerald}
            errorMessage={acceptError}
            otpMode={
              otpClaimTripId != null &&
              String(otpClaimTripId).toLowerCase() ===
                String(effectiveFirstIncoming.id).toLowerCase()
            }
            otpValue={otpValue}
            onOtpChange={(value) => {
              setOtpValue(value);
              setOtpError(null);
            }}
            onOtpSubmit={handleSubmitOtpClaim}
            otpSubmitting={otpSubmitting}
            otpError={otpError}
            onOtpCancel={closeOtpClaim}
            edgeToEdge={mapSheet}
            variant={mapSheet ? "page" : "card"}
          />
        ) : showSearchingOverlay ? (
          <View style={styles.driverSearchingEmptyWrap}>
            <View style={styles.driverSearchingEmptyContent}>
              <View style={styles.driverSearchingVisualWrap}>
                <Animated.View
                  style={[
                    styles.driverSearchingRingOuter,
                    {
                      backgroundColor: colors.emerald,
                      opacity: searchPulseAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.05, 0.15, 0.05],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.driverSearchingRingMid,
                    {
                      backgroundColor: colors.emerald,
                      opacity: searchPulseAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.1, 0.25, 0.1],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.driverSearchingRingInner,
                    {
                      backgroundColor: colors.emerald,
                      opacity: searchPulseAnim.interpolate({
                        inputRange: [0, 0.6, 1],
                        outputRange: [0.2, 0.5, 0.2],
                      }),
                    },
                  ]}
                />
                <View
                  style={[
                    styles.driverSearchingVisualInner,
                    { backgroundColor: colors.emerald },
                  ]}
                >
                  <FontAwesome name="truck" size={40} color={colors.surface} />
                  <View style={styles.driverSearchingDots}>
                    <View
                      style={[
                        styles.driverSearchingDot,
                        { backgroundColor: colors.surface },
                      ]}
                    />
                    <View
                      style={[
                        styles.driverSearchingDot,
                        { backgroundColor: colors.surface, opacity: 0.7 },
                      ]}
                    />
                    <View
                      style={[
                        styles.driverSearchingDot,
                        { backgroundColor: colors.surface, opacity: 0.4 },
                      ]}
                    />
                  </View>
                </View>
              </View>

              <Text
                style={[styles.driverSearchingTitle, { color: colors.text }]}
              >
                No trips available
              </Text>
              <Text
                style={[
                  styles.driverSearchingSubtitle,
                  { color: colors.textMuted, marginTop: 8 },
                ]}
              >
                We’re looking for trips in your area.
              </Text>

              <TouchableOpacity
                style={[
                  styles.searchOfflineBtn,
                  {
                    marginTop: 18,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                onPress={handleSetOffline}
                activeOpacity={0.8}
              >
                <FontAwesome name="power-off" size={16} color={colors.text} />
                <Text
                  style={[styles.searchOfflineBtnText, { color: colors.text }]}
                >
                  Go offline
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={{ paddingTop: 10 }} />
        )
      ) : null}
    </>
  );

  return (
    <View
      style={[
        styles.container,
        {
          // Keep a solid screen background behind the footer tabs (matches other driver pages).
          // The map itself still renders on top; this only prevents "transparent" gaps showing through.
          backgroundColor: colors.background,
        },
      ]}
    >
      {showSuccess ? (
        <View
          style={[
            styles.toast,
            {
              top: insets.top + 12,
              alignSelf: "center",
              backgroundColor: colors.text,
            },
          ]}
          pointerEvents="none"
        >
          <FontAwesome name="location-arrow" size={14} color={colors.surface} />
          <Text
            style={[styles.toastText, { color: colors.surface }]}
            numberOfLines={2}
          >
            {toastMessage}
          </Text>
        </View>
      ) : null}

      {/* When the map is visible, the footer dock is semi-transparent.
          Add a solid backdrop behind the footer so the map doesn't show through. */}
      {shouldShowMap ? (
        <View
          pointerEvents="none"
          style={[
            styles.tabBarBackdrop,
            {
              height: driverTabBarClearance,
              backgroundColor: colors.background,
              zIndex: 999,
            },
          ]}
        />
      ) : null}

      {/* Ola-style persistent Operations Panel (bottom sheet) */}
      {shouldShowMap ? (
        <GestureHandlerRootView style={styles.olaDriverRoot}>
          <KeyboardAvoidingView
            style={styles.olaDriverKeyboardAvoid}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 12 : 0}
          >
            {/* Common Header for Map Mode */}
            {(showNewAssignmentCard ||
              activeMission ||
              (effectiveFirstIncoming &&
                String(effectiveFirstIncoming.id).toLowerCase() ===
                  String(acceptedTripId ?? "").toLowerCase())) && (
              <DriverHeader
                colors={colors}
                avatarUri={avatarUri}
                driverName={driverName}
                isOnline
                variant="assigned"
                style={[
                  styles.assignedStaticHeader,
                  {
                    paddingTop: insets.top + 20,
                    paddingBottom: 12,
                    paddingHorizontal: 20,
                    backgroundColor: colors.surface,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                ]}
              />
            )}

            {shouldShowMap &&
              !showNewAssignmentCard &&
              (activeMission ||
                (effectiveFirstIncoming &&
                  effectiveFirstIncoming.id === acceptedTripId)) && (
                <DriverHeader
                  colors={colors}
                  avatarUri={avatarUri}
                  driverName={driverName}
                  isOnline
                  variant="assigned"
                  style={[
                    styles.assignedStaticHeader,
                    {
                      paddingTop: insets.top + 20,
                      paddingBottom: 12,
                      paddingHorizontal: 20,
                      backgroundColor: colors.surface,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                />
              )}

            {/* Do not wrap MapView in TouchableWithoutFeedback — it steals the responder
                and prevents pan/pinch on the map. Dismiss keyboard via BottomSheet onChange. */}
            <View style={styles.olaMapDismissArea}>
              {renderDriverMap(mapRef, {
                fullScreen: true,
                controlsVariant: "embedded",
              })}
            </View>

            <BottomSheet
              snapPoints={sheetSnapPoints}
              index={
                sheetSnapPoints.length === 1
                  ? 0
                  : shouldUseStaticMapSheetCard
                    ? 0
                    : 1
              }
              enablePanDownToClose={false}
              enableHandlePanningGesture={!shouldUseStaticMapSheetCard}
              enableContentPanningGesture={!shouldUseStaticMapSheetCard}
              enableOverDrag={!shouldUseStaticMapSheetCard}
              enableDynamicSizing={shouldUseStaticMapSheetCard}
              ref={bottomSheetRef}
              keyboardBehavior="interactive"
              keyboardBlurBehavior="restore"
              android_keyboardInputMode="adjustResize"
              onChange={(index) => {
                // Only dismiss keyboard if we're snapping to a very low point or closing
                if (index <= 0 && !shouldUseStaticMapSheetCard) {
                  Keyboard.dismiss();
                }
              }}
              bottomInset={driverTabBarClearance}
              backgroundStyle={{
                backgroundColor: colors.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                overflow: "hidden",
              }}
              handleIndicatorStyle={{
                backgroundColor: shouldUseStaticMapSheetCard
                  ? "transparent"
                  : colors.border,
                width: 50,
                height: 4,
                borderRadius: 999,
              }}
            >
              {shouldUseStaticMapSheetCard ? (
                <BottomSheetView
                  style={[
                    styles.olaSheetContent,
                    {
                      paddingBottom: 0,
                      paddingHorizontal: Layout.screenPaddingHorizontal,
                      flexGrow: 0,
                    },
                  ]}
                >
                  <View style={[styles.assignedSheetContent, { flexGrow: 0 }]}>
                    {showNotification && pendingInvite && (
                      <DriverInviteCard
                        invite={pendingInvite}
                        colors={colors}
                        offerText={buildOfferText(pendingInvite)}
                        busy={inviteActionId === pendingInvite.id}
                        fallbackAvatarUri={avatarUri}
                        onClose={() => setInvitationDismissed(true)}
                        onIgnore={async () => {
                          setInviteActionId(pendingInvite.id);
                          await driversService.rejectDriverInvite(
                            pendingInvite.id,
                          );
                          setInviteActionId(null);
                          setInvitationDeclined(true);
                          fetch();
                        }}
                        onAccept={async () => {
                          setInviteActionId(pendingInvite.id);
                          const { error } =
                            await driversService.acceptDriverInvite(
                              pendingInvite.id,
                            );
                          setInviteActionId(null);
                          if (!error) {
                            setInvitationAccepted(true);
                            fetch();
                          }
                        }}
                      />
                    )}
                    {loading && !assignmentFeedback ? (
                      <ActivityIndicator
                        style={{ marginTop: 20 }}
                        size="large"
                        color={colors.primary}
                      />
                    ) : (
                      <View style={{ paddingTop: 0 }}>
                        {renderDriverDashboardTripInner(true)}
                      </View>
                    )}
                  </View>
                </BottomSheetView>
              ) : (
                <BottomSheetScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.olaSheetContent,
                    {
                      paddingBottom: insets.bottom,
                      paddingHorizontal: Layout.screenPaddingHorizontal,
                    },
                  ]}
                >
                  <View style={styles.assignedSheetContent}>
                    {showNotification && pendingInvite && (
                      <DriverInviteCard
                        invite={pendingInvite}
                        colors={colors}
                        offerText={buildOfferText(pendingInvite)}
                        busy={inviteActionId === pendingInvite.id}
                        fallbackAvatarUri={avatarUri}
                        onClose={() => setInvitationDismissed(true)}
                        onIgnore={async () => {
                          setInviteActionId(pendingInvite.id);
                          await driversService.rejectDriverInvite(
                            pendingInvite.id,
                          );
                          setInviteActionId(null);
                          setInvitationDeclined(true);
                          fetch();
                        }}
                        onAccept={async () => {
                          setInviteActionId(pendingInvite.id);
                          const { error } =
                            await driversService.acceptDriverInvite(
                              pendingInvite.id,
                            );
                          setInviteActionId(null);
                          if (!error) {
                            setInvitationAccepted(true);
                            fetch();
                          }
                        }}
                      />
                    )}
                    {loading && !assignmentFeedback ? (
                      <ActivityIndicator
                        style={{ marginTop: 20 }}
                        size="large"
                        color={colors.primary}
                      />
                    ) : (
                      <View style={{ paddingTop: 8 }}>
                        {renderDriverDashboardTripInner(true)}
                      </View>
                    )}
                  </View>
                </BottomSheetScrollView>
              )}
            </BottomSheet>
          </KeyboardAvoidingView>
        </GestureHandlerRootView>
      ) : null}

      <Modal
        visible={isFullMapVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsFullMapVisible(false)}
      >
        <View
          style={[styles.fullMapModal, { backgroundColor: colors.background }]}
        >
          {renderDriverMap(fullMapRef, { fullScreen: true })}
        </View>
      </Modal>

      <Modal
        visible={shouldShowIncomingOtpPopup}
        animationType="fade"
        transparent
        onRequestClose={handleDismissIncomingOtpPopup}
      >
        <View style={styles.incomingOtpPopupBackdrop}>
          <View
            style={[
              styles.incomingOtpPopupCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.incomingOtpPopupBadge,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <FontAwesome name="shield" size={11} color={colors.textMuted} />
              <Text
                style={[
                  styles.incomingOtpPopupBadgeText,
                  { color: colors.textMuted },
                ]}
              >
                {incomingOtpPopupBadge}
              </Text>
            </View>

            <View style={styles.incomingOtpPopupHero}>
              <View
                style={[
                  styles.incomingOtpPopupAvatarWrap,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                {incomingOtpPopupAvatarUri ? (
                  <Image
                    source={{ uri: incomingOtpPopupAvatarUri }}
                    style={styles.incomingOtpPopupAvatar}
                    resizeMode="cover"
                  />
                ) : (
                  <FontAwesome
                    name={
                      firstIncomingIsAggregate ? "briefcase" : "user-circle-o"
                    }
                    size={18}
                    color={colors.textPrimary}
                  />
                )}
              </View>
              <View style={styles.incomingOtpPopupHeroText}>
                <Text
                  style={[styles.incomingOtpPopupTitle, { color: colors.text }]}
                >
                  {incomingOtpPopupTitle}
                </Text>
                <Text
                  style={[styles.incomingOtpPopupName, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {incomingOtpPopupName}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.incomingOtpPopupRouteCard,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.incomingOtpPopupRouteRow}>
                <View
                  style={[
                    styles.incomingOtpPopupRouteIcon,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <FontAwesome
                    name="arrow-up"
                    size={11}
                    color={colors.textMuted}
                  />
                </View>
                <Text
                  style={[
                    styles.incomingOtpPopupRouteValue,
                    { color: colors.text },
                  ]}
                  numberOfLines={2}
                >
                  {incomingOtpPopupPickup}
                </Text>
              </View>
              <View
                style={[
                  styles.incomingOtpPopupRouteDivider,
                  { backgroundColor: colors.border },
                ]}
              />
              <View style={styles.incomingOtpPopupRouteRow}>
                <View
                  style={[
                    styles.incomingOtpPopupRouteIcon,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <FontAwesome
                    name="arrow-down"
                    size={11}
                    color={colors.textMuted}
                  />
                </View>
                <Text
                  style={[
                    styles.incomingOtpPopupRouteValue,
                    { color: colors.text },
                  ]}
                  numberOfLines={2}
                >
                  {incomingOtpPopupDrop}
                </Text>
              </View>
            </View>

            <View style={styles.incomingOtpPopupMetaRow}>
              <View
                style={[
                  styles.incomingOtpPopupMetaPill,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.incomingOtpPopupMetaLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  Trip type
                </Text>
                <Text
                  style={[
                    styles.incomingOtpPopupMetaValue,
                    { color: colors.text },
                  ]}
                >
                  {firstIncomingCounterpartyLabel}
                </Text>
              </View>
              {incomingOtpPopupEarnings ? (
                <View
                  style={[
                    styles.incomingOtpPopupMetaPill,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.incomingOtpPopupMetaLabel,
                      { color: colors.textMuted },
                    ]}
                  >
                    Est. earning
                  </Text>
                  <Text
                    style={[
                      styles.incomingOtpPopupMetaValue,
                      { color: colors.emerald },
                    ]}
                  >
                    {incomingOtpPopupEarnings}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={[
                styles.incomingOtpPopupCaption,
                { color: colors.textMuted },
              ]}
            >
              Review the assignment details and continue to OTP claim when you
              are ready.
            </Text>
            <TouchableOpacity
              style={[
                styles.incomingOtpPopupButton,
                {
                  backgroundColor: colors.emerald,
                  shadowColor: colors.emerald,
                },
              ]}
              activeOpacity={0.85}
              onPress={handleDismissIncomingOtpPopup}
            >
              <Text style={styles.incomingOtpPopupButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {!showNewAssignmentCard && !shouldShowMap && (
        <>
          <View style={[styles.assignedStaticHeader]}>
            <View style={styles.assignedStaticHeaderContent}>
              <DriverHeader
                colors={colors}
                avatarUri={avatarUri}
                driverName={driverName}
                isOnline={isOnline}
                onPressOtpClaim={handleOpenOtpClaimFromHeader}
              />
              {driver?.organization_id ? (
                <TouchableOpacity
                  style={[
                    styles.dashboardLocationBadge,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={async () => {
                    try {
                      const expoLocation = await getExpoLocation();
                      if (!expoLocation) return;
                      const { status } =
                        await expoLocation.getForegroundPermissionsAsync();
                      if (status !== "granted") return;
                      const pos = await expoLocation.getCurrentPositionAsync(
                        {},
                      );
                      const { latitude, longitude } = pos.coords;
                      const acc = pos.coords.accuracy ?? null;
                      await reportLocationToDb(
                        activeMission?.id ?? null,
                        latitude,
                        longitude,
                        acc,
                        "tap",
                      );
                    } catch {
                      // ignore
                    }
                  }}
                  activeOpacity={0.8}
                  accessibilityLabel="Report location"
                  accessibilityHint="Tap to send your current location to the server"
                >
                  <FontAwesome
                    name="map-marker"
                    size={14}
                    color={
                      locationStatus === "success"
                        ? colors.emerald
                        : locationStatus === "error"
                          ? Theme.negative
                          : colors.textMuted
                    }
                    style={styles.locationStatusIcon}
                  />
                  <Text
                    style={[
                      styles.dashboardLocationBadgeText,
                      { color: colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {locationStatus === "success"
                      ? (locationLabel ?? "Current location")
                      : locationStatus === "error"
                        ? "Location not found"
                        : "Fetching location..."}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {showNotification && pendingInvite && (
                <DriverInviteCard
                  invite={pendingInvite}
                  colors={colors}
                  offerText={buildOfferText(pendingInvite)}
                  busy={inviteActionId === pendingInvite.id}
                  fallbackAvatarUri={avatarUri}
                  onClose={() => setInvitationDismissed(true)}
                  onIgnore={async () => {
                    setInviteActionId(pendingInvite.id);
                    await driversService.rejectDriverInvite(pendingInvite.id);
                    setInviteActionId(null);
                    setInvitationDeclined(true);
                    fetch();
                  }}
                  onAccept={async () => {
                    setInviteActionId(pendingInvite.id);
                    const { error } = await driversService.acceptDriverInvite(
                      pendingInvite.id,
                    );
                    setInviteActionId(null);
                    if (!error) {
                      setInvitationAccepted(true);
                      fetch();
                    }
                  }}
                />
              )}
            </View>
          </View>

          <View
            style={[
              styles.content,
              {
                paddingHorizontal: 20,
                paddingTop: 20,
                backgroundColor: shouldShowMap
                  ? "transparent"
                  : colors.background,
              },
            ]}
          >
            {loading && !assignmentFeedback ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <ScrollView
                style={styles.tripsScroll}
                contentContainerStyle={[
                  styles.tripsScrollContent,
                  { paddingBottom: driverTabBarClearance },
                  // When map is showing and we're rendering the single in-progress trip card,
                  // keep it anchored near the footer (same feel as accept-card overlay).
                  shouldShowMap &&
                    activeMission &&
                    styles.tripsScrollContentBottom,
                  !driver && styles.tripsScrollContentCentered,
                  driver &&
                    (!isOnline || showSearchingOverlay) &&
                    styles.tripsScrollContentCentered,
                ]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                    tintColor={colors.emerald}
                  />
                }
              >
                {renderDriverDashboardTripInner(false)}
              </ScrollView>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.driverBackground,
  },
  driverSearchingEmptyWrap: {
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 0,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  driverSearchingEmptyContent: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  driverSearchingVisualWrap: {
    width: 280,
    height: 280,
    borderRadius: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    overflow: "visible",
    position: "relative",
  },
  driverSearchingRingOuter: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    left: 0,
    top: 0,
  },
  driverSearchingRingMid: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    left: (280 - 200) / 2,
    top: (280 - 200) / 2,
  },
  driverSearchingRingInner: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    left: (280 - 140) / 2,
    top: (280 - 140) / 2,
  },
  driverSearchingVisualInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  driverSearchingDots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  driverSearchingDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  driverSearchingTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  driverSearchingSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  // Ola-style layout: full-screen map + persistent bottom sheet.
  olaDriverRoot: {
    flex: 1,
    minHeight: 0,
  },
  classicDashboardScroll: {
    flex: 1,
  },
  classicDashboardContent: {
    flexGrow: 1,
    paddingTop: 16,
  },
  olaDriverKeyboardAvoid: {
    flex: 1,
    minHeight: 0,
  },
  olaMapDismissArea: {
    flex: 1,
    minHeight: 0,
  },
  olaSheetContent: {
    paddingHorizontal: 0,
    flexGrow: 1,
  },
  searchOfflineBtn: {
    marginTop: 20,
    minHeight: Layout.minTouchTargetSize,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  searchOfflineBtnText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  toast: {
    position: "absolute",
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 9999,
  },
  toastText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnDark,
    letterSpacing: 0.5,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: 4,
    maxWidth: "80%",
    flexShrink: 1,
  },
  locationStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  locationStatusIcon: {
    alignSelf: "center",
  },
  locationText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  locationValueText: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.2,
    marginLeft: 6,
    flexShrink: 1,
  },
  tripsScroll: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    minWidth: 0,
  },
  tripsScrollContent: {
    flexGrow: 1,
    paddingTop: 16,
  },
  tripsScrollContentBottom: {
    justifyContent: "flex-end",
    paddingTop: 0,
  },
  tripsScrollContentCentered: {
    flexGrow: 1,
    justifyContent: "center",
  },
  offlineCardCentered: {
    alignSelf: "center",
  },
  centerCardWrap: {
    width: "100%",
    marginBottom: 16,
    alignSelf: "center", // Add this for proper centering
  },
  centerCardConstraint: {
    width: "100%",
    maxWidth: 400, // Add max width for better centering on larger screens
    alignSelf: "center", // Add this for proper centering
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
  },
  locationBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
    backgroundColor: Theme.driverWhiteMuted,
  },
  locationBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    lineHeight: 13,
    flexShrink: 1,
  },
  noDriverWrap: {
    width: "100%",
    maxWidth: 400, // Add max width for better layout
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    alignSelf: "center", // Add this for proper centering
  },
  invitesScroll: { width: "100%", maxHeight: 400 },
  invitesScrollContent: { paddingVertical: 16, gap: 16 },
  invitesTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: Theme.driverEmerald,
    marginBottom: 4,
  },
  invitesSubtitle: {
    fontSize: 11,
    color: Theme.textMuted,
    textAlign: "center",
    marginBottom: 20,
  },
  notificationListIntro: {
    marginBottom: 4,
  },
  notificationListTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  notificationListSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  notificationSelectCard: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  notificationSelectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  notificationSelectTripId: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  notificationOtpBadgeMinimal: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  notificationOtpBadgeMinimalText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  notificationSelectRoute: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  notificationAssignedByLine: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  notificationAssignedByPrefix: {
    fontWeight: "400",
  },
  notificationAssignedByName: {
    fontWeight: "600",
  },
  notificationSelectMeta: {
    fontSize: 12,
    fontWeight: "400",
  },
  notificationSelectFooter: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  notificationSelectActionTextMuted: {
    fontSize: 13,
    fontWeight: "500",
  },
  notificationHistoryHint: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "500",
  },
  notificationHistoryWrap: {
    marginTop: 8,
    gap: 4,
  },
  notificationHistoryItem: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "500",
  },
  inviteCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
  },
  inviteCloseBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  inviteCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  inviteAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  inviteAvatarImg: {
    width: "100%",
    height: "100%",
  },
  inviteOrgInfo: {
    flex: 1,
  },
  inviteOrgNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inviteOrgName: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  inviteVerifiedBadge: {
    backgroundColor: "#E6F4EA",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inviteVerifiedText: {
    color: "#137333",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  inviteOrgStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  inviteOrgStatsText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inviteOrgStatsDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.textMuted,
    marginHorizontal: 6,
    opacity: 0.5,
  },
  inviteOffer: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 16,
  },
  inviteActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  inviteOfferBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  inviteOfferText: {
    fontSize: 12,
    fontWeight: "700",
  },
  inviteActionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inviteRejectBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteRejectBtnText: { fontSize: 13, fontWeight: "700" },
  inviteAcceptBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#3B82F6",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
        }
      : { elevation: 4 }),
  },
  inviteAcceptBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textOnPrimary,
  },
  inviteBtnDisabled: { opacity: 0.6 },
  activeMissionWrap: {
    alignSelf: "stretch",
    width: "100%",
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
        }
      : { elevation: 3 }),
  },
  activeMissionIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Theme.driverEmerald,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center", // Add this for proper centering
  },
  activeMissionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.driverEmerald,
    textAlign: "center",
  },
  activeMissionId: {
    fontSize: 24,
    fontWeight: "800",
    color: Theme.textOnDark,
    marginBottom: 4,
    textAlign: "center",
  },
  statusCardHint: {
    fontSize: 12,
    marginBottom: 16,
    textAlign: "center",
  },
  tacticalHudBtn: {
    alignSelf: "stretch",
    minHeight: 44,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: Theme.textOnDark,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tacticalHudBtnText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: Theme.driverBackground,
  },
  offlineCard: {
    width: "100%",
    backgroundColor: Theme.driverWhiteMuted,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    borderRadius: 24,
    padding: 0,
    alignItems: "center",
    overflow: "hidden",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        }
      : { elevation: 4 }),
  },
  offlineCardAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    opacity: 0.5,
  },
  offlineCardContent: {
    width: "100%",
    maxWidth: 400, // Add max width for better layout
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: "center",
    alignSelf: "center", // Add this for proper centering
  },
  offlineIconContainer: {
    position: "relative",
    marginBottom: 20,
    alignSelf: "center", // Add this for proper centering
    alignItems: "center", // Add this for inner content centering
  },
  offlineIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center", // Add this for proper centering
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        }
      : { elevation: 2 }),
  },
  offlineIconInner: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center", // Add this for proper centering
  },
  offlineLiveBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    gap: 4,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        }
      : { elevation: 2 }),
  },
  offlineLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  offlineLiveText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  offlineCardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Theme.textOnDark,
    marginBottom: 8,
    letterSpacing: 0.3,
    textAlign: "center",
    alignSelf: "center", // Changed from 'stretch' to 'center'
    paddingHorizontal: 16, // Add horizontal padding for better text wrapping
  },
  offlineCardSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    alignSelf: "center", // Changed from 'stretch' to 'center'
    marginBottom: 28,
    lineHeight: 20,
    paddingHorizontal: 16, // Increased from 8 for better text wrapping
    maxWidth: 320, // Add max width for better readability
  },
  offlineTripIdBadge: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  offlineTripIdText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  offlineRouteCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  offlineRouteLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
  },
  offlineRouteTimeline: {
    alignItems: "flex-start",
    marginRight: 14,
    paddingTop: 2,
  },
  offlineRouteDotWrap: {
    width: 36,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  offlineRouteDotPingRing: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  offlineRouteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  offlineRouteLine: {
    width: 2,
    height: 22,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    marginLeft: 17,
    marginVertical: 2,
    borderColor: Theme.borderMedium,
  },
  offlineRouteDestIcon: {
    width: 36,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  offlineRouteLabels: {
    flex: 1,
    minWidth: 0,
  },
  offlineRouteRow: {
    marginBottom: 18,
  },
  offlineRouteRowLast: {
    marginBottom: 0,
  },
  offlineRouteLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  offlineRouteValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  offlineRouteRight: {
    alignItems: "flex-end",
  },
  offlineRouteDistance: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  offlineRouteEst: {
    fontSize: 10,
    fontWeight: "600",
  },
  offlineCardHintBold: {
    fontWeight: "800",
  },
  offlineTrustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 12,
  },
  offlineTrustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  offlineTrustText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  offlineTrustDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  offlineCardLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    marginBottom: 10,
    paddingHorizontal: 0,
    minWidth: 0,
  },
  offlineCardLocationIcon: {
    marginRight: 8,
  },
  offlineCardLocationText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
    letterSpacing: 0.2,
    textAlign: "left",
  },
  offlineCardHint: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    alignSelf: "center", // Changed from 'stretch' to 'center'
    marginBottom: 16,
    paddingHorizontal: 16, // Increased from 8 for consistency
    lineHeight: 18,
    color: Theme.textMuted,
    maxWidth: 320, // Add max width for consistency
  },
  goOnlineBtn: {
    width: "100%",
    maxWidth: 320, // Add max width for better proportions
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18, // Increased from 16 for better touch area
    paddingHorizontal: 24, // Add horizontal padding
    backgroundColor: Theme.driverEmerald,
    borderRadius: 12,
    alignSelf: "center", // Add this for proper centering
  },
  goOnlineBtnIcon: {
    opacity: 1,
  },
  goOnlineBtnText: {
    fontSize: 14, // Increased from 13 for better readability
    fontWeight: "800",
    letterSpacing: 0.8,
    color: Theme.textOnPrimary,
    textAlign: "center",
    flex: 1, // Add flex to allow proper text centering
  },
  otpClaimCard: {
    marginTop: 12,
    padding: 20,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: "center",
  },
  otpTripRoute: {
    marginTop: 12,
    marginBottom: 16,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
    width: "100%",
  },
  otpBox: {
    width: 42,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxDigit: {
    fontSize: 20,
    fontWeight: "700",
  },
  otpHiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  otpErrorText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  otpCancelLink: {
    marginTop: 14,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  otpCancelText: {
    fontSize: 13,
    fontWeight: "700",
  },
  cardTopLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  newMissionDotWrap: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  newMissionDotPingRing: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  newMissionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  newMissionBadge: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.driverEmerald,
  },
  commissionBlock: { alignItems: "flex-end" },
  commissionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  newAssignmentRouteCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  newAssignmentRouteLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
  },
  newAssignmentTimeline: {
    alignItems: "flex-start",
    marginRight: 12,
    paddingTop: 2,
  },
  newAssignmentDotWrap: {
    width: 36,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  newAssignmentDotPingRing: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  newAssignmentRouteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  newAssignmentRouteLine: {
    width: 2,
    height: 22,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    marginLeft: 17,
    marginVertical: 2,
    borderColor: Theme.borderMedium,
  },
  newAssignmentDestIcon: {
    width: 36,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  newAssignmentRouteLabels: {
    flex: 1,
    minWidth: 0,
  },
  newAssignmentRouteRow: {
    marginBottom: 16,
  },
  newAssignmentRouteRowLast: {
    marginBottom: 0,
  },
  newAssignmentRouteLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  newAssignmentRouteValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  newAssignmentRouteRight: {
    alignItems: "flex-end",
  },
  newAssignmentRouteDistance: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  newAssignmentRouteEst: {
    fontSize: 10,
    fontWeight: "600",
  },
  nodeLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    marginBottom: 4,
  },
  nodeValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  distanceClientRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  miniBox: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.driverOverlayLight,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.driverBorder,
  },
  miniBoxLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: Theme.textMuted,
    marginBottom: 6,
  },
  miniBoxValue: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textOnDark,
  },
  declineBtn: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
  },
  acceptDeclineRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  declineBtnInRow: {
    flex: 1,
    marginTop: 0,
  },
  acceptBtnInRow: {
    flex: 1,
  },
  declineBtnText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  empty: {
    alignItems: "center",
    gap: 16,
    opacity: 0.9,
  },
  emptyCard: {
    width: "100%",
    alignItems: "center",
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  syncingText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  card: {
    width: "100%",
    backgroundColor: Theme.driverWhiteMuted,
    borderWidth: 1,
    borderTopWidth: 4,
    borderTopColor: Theme.driverEmerald,
    borderColor: Theme.driverBorder,
    borderRadius: 20,
    padding: 20,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 12,
        }
      : { elevation: 3 }),
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  revenue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: Theme.driverEmerald,
  },
  acceptBtn: {
    minHeight: 52,
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: Theme.driverEmerald,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
        }
      : { elevation: 4 }),
  },
  acceptBtnDisabled: { opacity: 0.7 },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textOnPrimary,
  },

  // --- Assigned trip waiting (reference-style: map + HUD + bottom sheet) ---
  assignedMapBg: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  /** Wrapper for map branch so header + split share vertical space. */
  assignedMapRoot: {
    flex: 1,
    minHeight: 0,
  },
  assignedKeyboardAvoid: {
    flex: 1,
  },
  /** Half map / half card split layout (no overlay). */
  assignedSplitWrap: {
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
  },
  assignedMapDismissArea: {
    flex: 1,
  },
  assignedMapHalf: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  mapTopControlsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    zIndex: 10,
    elevation: 20,
  },
  mapTopPillButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Layout.minTouchTargetSize,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  mapTopPillLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    maxWidth: 120,
  },
  incomingOtpPopupBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 16, 28, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  incomingOtpPopupCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: "stretch",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: Theme.shadow,
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 0.18,
          shadowRadius: 36,
        }
      : { elevation: 10 }),
  },
  incomingOtpPopupBadge: {
    alignSelf: "center",
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  incomingOtpPopupBadgeText: {
    ...Typography.headerTitle,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  incomingOtpPopupHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  incomingOtpPopupAvatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  incomingOtpPopupAvatar: {
    width: "100%",
    height: "100%",
  },
  incomingOtpPopupHeroText: {
    flex: 1,
    minWidth: 0,
  },
  incomingOtpPopupEyebrow: {
    ...Typography.headerTitle,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  incomingOtpPopupTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  incomingOtpPopupName: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  incomingOtpPopupRouteCard: {
    marginTop: 18,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 10,
  },
  incomingOtpPopupRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  incomingOtpPopupRouteIcon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingOtpPopupRouteValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  incomingOtpPopupRouteDivider: {
    height: 1,
    marginLeft: 14,
  },
  incomingOtpPopupMetaRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  incomingOtpPopupMetaPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 0,
  },
  incomingOtpPopupMetaLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  incomingOtpPopupMetaValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  incomingOtpPopupCaption: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 20,
    textAlign: "center",
  },
  incomingOtpPopupButton: {
    marginTop: 18,
    minWidth: 180,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderWidth: 0,
    ...(Platform.OS === "web"
      ? {
          outlineWidth: 0,
        }
      : null),
    ...(Platform.OS === "ios"
      ? {
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.22,
          shadowRadius: 20,
        }
      : { elevation: 6 }),
  },
  incomingOtpPopupButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textOnPrimary,
    letterSpacing: 0.2,
  },
  fullMapModal: {
    flex: 1,
  },
  fullMapContainer: {
    flex: 1,
    position: "relative",
  },
  assignedMapInHalf: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    zIndex: 0,
  },
  fullMapView: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  assignedCardHalf: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 0,
    paddingTop: 12,
  },
  assignedCardHalfScroll: { flex: 1, minHeight: 0 },
  assignedCardHalfScrollContent: {
    flexGrow: 1,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  assignedMapGrid: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    opacity: 0.12,
  },
  assignedMapView: {
    width: "100%",
    height: "100%",
  },
  assignedMapCallout: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 200,
  },
  assignedMapCalloutTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  assignedMapCalloutSub: {
    fontSize: 12,
  },
  assignedHudWrap: {
    position: "absolute",
    left: 24,
    right: 24,
    zIndex: 50,
  },
  assignedHudCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 28,
    borderWidth: 1,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        }
      : { elevation: 8 }),
  },
  assignedHudLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  assignedHudAvatarWrap: {
    width: 48,
    height: 48,
    borderWidth: 1,
    overflow: "hidden",
  },
  assignedHudAvatar: { width: "100%", height: "100%", borderRadius: 16 },
  assignedHudTextWrap: { flex: 1, minWidth: 0 },
  assignedHudLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  assignedHudNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  assignedHudName: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  assignedHudRatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  assignedHudRatingText: { fontSize: 10, fontWeight: "800" },
  assignedHudRight: { alignItems: "flex-end" },
  assignedHudStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 4,
  },
  assignedHudStatusDot: { width: 8, height: 8, borderRadius: 4 },
  assignedHudStatusText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  assignedHudEarnings: { fontSize: 18, fontWeight: "800" },
  mapControlsColumn: {
    position: "absolute",
    // Must stay above the Ola bottom sheet content.
    zIndex: 1200,
    elevation: 40,
    gap: 8,
  },
  mapGuidanceChip: {
    position: "absolute",
    zIndex: 45,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
        }
      : { elevation: 6 }),
  },
  mapGuidanceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapGuidanceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  mapGuidanceTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  mapGuidanceSubtitle: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        }
      : { elevation: 6 }),
  },
  mapControlBtnDisabled: {
    opacity: 0.45,
  },
  assignedFabColumn: {
    position: "absolute",
    left: 16,
    zIndex: 40,
    gap: 12,
  },
  assignedFabSafety: {
    width: 56,
    height: 56,
    borderRadius: 22,
    backgroundColor: "#e11d48",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
        }
      : { elevation: 6 }),
  },
  assignedFabCompass: {
    width: 56,
    height: 56,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        }
      : { elevation: 6 }),
  },
  assignedSheet: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    zIndex: 50,
    paddingHorizontal: 20,
    backgroundColor: "transparent",
    maxHeight: "60%",
    paddingBottom: 12,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        }
      : { elevation: 12 }),
  },
  /** Map overlay: no extra white card or handle; JobRequestCard is the only card, close via X. */
  assignedSheetNoCard: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    paddingHorizontal: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderRadius: 0,
    minHeight: "42%",
    justifyContent: "flex-end",
  },
  assignedSheetContent: {
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    flexGrow: 1,
  },
  assignedNewOrderTitleWrap: {
    alignItems: "center",
    marginBottom: 10,
  },
  assignedNewOrderTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  assignedNewOrderDivider: {
    width: "100%",
    height: 1,
    marginTop: 8,
  },
  // Reference-style incoming trip card (same layout as design)
  incomingCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  incomingCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  incomingTripPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  incomingTripPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  incomingCardHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  incomingTripType: {
    fontSize: 13,
    fontWeight: "700",
  },
  incomingTripBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  incomingTripBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  incomingEarningsWrap: {
    alignItems: "center",
    marginBottom: 16,
    paddingVertical: 4,
  },
  incomingCollapsedWrap: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    gap: 4,
  },
  incomingCollapsedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  incomingCollapsedAmount: {
    fontSize: 20,
    fontWeight: "700",
  },
  incomingCollapsedRoute: {
    fontSize: 13,
    fontWeight: "500",
  },
  incomingEarningsAmount: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  incomingEarningsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  incomingEarningsBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  incomingRouteWrap: {
    position: "relative",
    paddingLeft: 28,
    marginBottom: 20,
  },
  incomingRouteDashed: {
    position: "absolute",
    left: 11,
    top: 24,
    bottom: 24,
    width: 2,
    borderLeftWidth: 2,
    borderStyle: "dashed",
  },
  incomingRoutePickup: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  incomingRouteIconPickup: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -28,
    marginTop: 2,
  },
  incomingRouteDrop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  incomingRouteIconDrop: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    marginLeft: -28,
    marginTop: 2,
  },
  incomingRouteBody: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  incomingRouteMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  incomingRouteMetaPickup: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  incomingRouteMetaDrop: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  incomingRouteMetaDist: {
    fontSize: 10,
    fontWeight: "700",
  },
  incomingRouteTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 2,
  },
  incomingRouteSub: {
    fontSize: 13,
    fontWeight: "600",
  },
  incomingMetaRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  incomingMetaBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 0,
  },
  incomingMetaIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingMetaTextWrap: { flex: 1, minWidth: 0 },
  incomingMetaLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  incomingMetaValue: {
    fontSize: 14,
    fontWeight: "800",
  },
  incomingCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingVertical: 4,
  },
  incomingCustomerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  incomingCustomerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingCustomerInfo: {
    marginLeft: 12,
    flex: 1,
    minWidth: 0,
  },
  incomingCustomerName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  incomingCustomerSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  incomingCustomerSubText: {
    fontSize: 11,
    fontWeight: "700",
  },
  incomingCustomerActions: {
    flexDirection: "row",
    gap: 8,
  },
  incomingCustomerActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  incomingRejectBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingAcceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingLeft: 20,
    paddingRight: 12,
    borderRadius: 20,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 6,
        }
      : { elevation: 3 }),
  },
  incomingAcceptBtnLabel: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Theme.textOnPrimary,
  },
  incomingAcceptBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedSheetGreetingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  assignedSheetGreetingText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.2,
    textAlign: "left",
  },
  assignedStaticHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 60,
  },
  assignedStaticHeaderContent: {
    alignItems: "stretch",
  },
  dashboardLocationBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginLeft: Layout.driverHeaderHorizontalPadding,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "82%",
  },
  dashboardLocationBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    lineHeight: 13,
    flexShrink: 1,
  },
  assignedSheetStatusRow: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedSheetStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  assignedSheetStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  assignedSheetStatusText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  assignedSheetEarningsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 0,
    marginBottom: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  assignedSheetEarningsLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  assignedSheetEarningsValue: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  assignedSheetEarningsHint: {
    fontSize: 10,
    fontWeight: "600",
    marginLeft: 8,
  },
  assignedSheetEarningsRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  assignedCustomerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    borderBottomWidth: 0,
    paddingRight: 0,
  },
  assignedCustomerAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedCustomerTextWrap: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  assignedCustomerEarningsBlock: {
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 10,
    borderBottomWidth: 0,
    flexShrink: 0,
  },
  assignedCustomerEarningsAmount: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "right",
  },
  assignedCustomerEarningsDistance: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
    textAlign: "right",
  },
  assignedCustomerEarningsDivider: {
    width: 22,
    height: 2,
    borderRadius: 1,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  assignedTripDistanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingVertical: 6,
  },
  assignedTripDistanceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  assignedTripDistanceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedTripDistanceLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "left",
  },
  assignedTripDistanceValue: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "right",
  },
  assignedCustomerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  assignedCustomerName: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "left",
  },
  assignedCustomerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0,
    marginTop: 2,
    textAlign: "left",
  },
  assignedCustomerRatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  assignedCustomerRatingText: { fontSize: 11, fontWeight: "800" },
  assignedItinerary: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  assignedItineraryCol: {
    flex: 1,
    flexDirection: "row",
    minWidth: 0,
    alignItems: "flex-start",
  },
  assignedItineraryDots: {
    width: 46,
    alignItems: "center",
    marginRight: 10,
  },
  assignedItineraryDotPickup: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: "#333333",
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedItineraryDotPickupInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#333333",
  },
  assignedItineraryLine: {
    width: 2,
    height: 24,
    borderLeftWidth: 2,
    borderStyle: "dashed",
    marginLeft: 9,
    marginTop: 0,
    marginBottom: 0,
  },
  assignedItineraryDotDrop: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  assignedItineraryLabels: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingLeft: 0,
  },
  assignedItineraryRow: {
    marginBottom: 6,
    flexDirection: "column",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  assignedItineraryRowLast: {
    marginBottom: 0,
    marginTop: 6,
    flexDirection: "column",
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  assignedItineraryLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 3,
    textTransform: "uppercase",
    textAlign: "left",
  },
  assignedItineraryValue: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
    textAlign: "left",
  },
  assignedItineraryRight: { alignItems: "flex-end" },
  assignedItineraryDistance: {
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  assignedItineraryEst: { fontSize: 10, fontWeight: "600" },
  assignedCtaWrap: { marginTop: 4 },
  assignedCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  assignedCtaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
        }
      : { elevation: 3 }),
  },
  assignedCtaBtnGoOnline: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  assignedCtaBtnDisabled: { opacity: 0.7 },
  assignedCtaIcon: { marginRight: 6 },
  assignedCtaText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0,
    color: Theme.textOnPrimary,
  },
  assignedAcceptError: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
    textAlign: "center",
  },
  assignedDeclineBtn: {
    marginTop: 0,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 0,
  },
  assignedDeclineBtnInRow: {
    flex: 1,
    marginTop: 0,
  },
  assignedDeclineBtnText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0,
    color: Theme.textOnPrimary,
  },
  assignedTrustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 12,
  },
  assignedTrustItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  assignedTrustText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  assignedTrustDot: { width: 4, height: 4, borderRadius: 2 },
  reassignedBanner: {
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  reassignedBannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  reassignedBannerDismiss: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  reassignedBannerDismissText: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Trip booked / Skipped feedback (single card, green & black theme)
  /** Wrapper so feedback has a visible card on transparent map overlay */
  feedbackCardWrap: {
    borderRadius: 16,
    overflow: "hidden",
    marginHorizontal: 16,
  },
  feedbackBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  feedbackIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  feedbackIconWrapSuccess: {},
  feedbackIconWrapSkipped: {},
  feedbackTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 8,
  },
  feedbackSubtitle: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  customMapMarkerPickup: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.positive,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  customMapMarkerDrop: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Theme.teslaRed,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  customMapMarkerTruck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Theme.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 6,
  },
  olaYouMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3.5,
    elevation: 5,
  },
  tabBarBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  customMapMarkerActive: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  compactInviteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  compactInviteText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  notificationCard: {
    width: "92%",
    alignSelf: "center",
    marginVertical: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  notificationContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    gap: 12,
  },
  notificationIconWrap: {
    padding: 8,
    borderRadius: 12,
  },
  notificationTextContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  notificationOrgName: {
    fontSize: 14,
    fontWeight: "bold",
    lineHeight: 18,
  },
  notificationSubtitle: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  notificationRightWrap: {
    alignItems: "flex-end",
    gap: 12,
  },
  notificationCloseBtn: {
    padding: 2,
  },
  notificationTime: {
    fontSize: 10,
    marginTop: 4,
  },
});
