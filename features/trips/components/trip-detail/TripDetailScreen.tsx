import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { SemanticAddIcon } from "@/components/SemanticAddIcon";
import { TeslaHeader } from "@/components/TeslaHeader";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDriverById } from "@/features/drivers/services/drivers.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getSupplierById } from "@/features/suppliers/services/suppliers.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import { getVehicleDocumentViewUrl } from "@/features/vehicles/services/vehicleDocuments.service";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import { DOCUMENT_LABELS, DOCUMENT_EXPIRY_ORDER } from "@/features/vehicles/utils/vehicleDocuments.util";
import { useOrganization } from "@/contexts/OrganizationContext";
import { canAssignTrip, getCapabilitiesFromProfile } from "@/lib/capabilities";
import { isAggregateTrip } from "@/lib/driverUtils";
import { formatIndianVehicleNumber } from "@/lib/format";
import { useShipperDisplayNamesQuery, useTransactionsQuery } from "@/lib/queries";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { ReceiptText } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { useRealtimeTrip } from "../../hooks/useRealtimeTrips";
import type { TripAssignmentAuditRow } from "../../services/trip-assignment-audit.service";
import { getTripAssignmentAuditHistory } from "../../services/trip-assignment-audit.service";
import type { TripAdjustment } from "../../services/tripAdjustments";
import * as tripDocumentsService from "@/services/tripDocumentsService";
import * as driverLocationService from "@/services/driverLocationService";
import {
    addTripAdjustment,
    getTripAdjustments,
    removeTripAdjustment,
} from "../../services/tripAdjustments";
import { getTripOtpForDisplay } from "../../services/tripOtp.service";
import {
    getTripById,
    getTripDisplayNumber,
    getTripsWhereOrgIsSupplier,
    isTripCompleted,
    type TripRow,
} from "../../services/trips.service";
import {
    clearInitialTripForDetail,
    getInitialTripForDetail,
} from "../../initialTripForDetail";
import { TripRatingsBlock } from "@/features/ratings/components/TripRatingsBlock";
import { averageScore, getRatingsForTrip } from "@/features/ratings/services/ratings.service";
import {
    TripAssignmentBlock,
    type AssignmentSource,
} from "../TripAssignmentBlock";
import { TripAdjustmentModal } from "./TripAdjustmentModal";
import { TripDetailFinanceView, type TripDocItem } from "./TripDetailFinanceView";
import { TrackingMapBlock, VehicleTrackingCard } from "./TrackingMapBlock";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import type * as ExpoLocationTypes from "expo-location";

let ExpoLocationModule: typeof ExpoLocationTypes | null = null;

async function safeReverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ExpoLocationTypes.LocationGeocodedAddress[]> {
  try {
    if (!ExpoLocationModule) {
      ExpoLocationModule = await import("expo-location");
    }
    return await ExpoLocationModule.reverseGeocodeAsync({ latitude, longitude });
  } catch {
    return [];
  }
}

/** Format "Updated X min ago" from ISO recorded_at (Live Tracking). */
function formatLocationUpdatedAt(recordedAt: string): string {
  const then = new Date(recordedAt).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffM = Math.floor(diffMs / 60000);
  if (diffM < 1) return "Updated just now";
  if (diffM === 1) return "Updated 1 min ago";
  if (diffM < 60) return `Updated ${diffM} min ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH === 1) return "Updated 1 hr ago";
  return `Updated ${diffH} hr ago`;
}

/** Derive document type label from file name (e.g. JPG, HEIC, PDF). */
function docTypeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "heic" || ext === "heif") return "HEIC";
  if (ext === "jpg" || ext === "jpeg") return "JPG";
  if (ext === "png") return "PNG";
  if (ext === "pdf") return "PDF";
  return ext ? ext.toUpperCase() : "JPG";
}

function formatDocumentExpiryDate(expiryDate: string | null | undefined): string | null {
  if (!expiryDate) return null;
  const date = new Date(expiryDate);
  if (Number.isNaN(date.getTime())) return expiryDate;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getDocumentExpiryState(
  expiryDate: string | null | undefined,
): "valid" | "expiringSoon" | "expired" | null {
  if (!expiryDate) return null;
  const date = new Date(expiryDate);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  if (date < today) return "expired";
  const soonThreshold = new Date(today);
  soonThreshold.setDate(soonThreshold.getDate() + 30);
  if (date <= soonThreshold) return "expiringSoon";
  return "valid";
}

function getDocumentExpiryLabel(expiryDate: string | null | undefined): string | null {
  const formatted = formatDocumentExpiryDate(expiryDate);
  if (!formatted) return null;
  const state = getDocumentExpiryState(expiryDate);
  if (state === "expired") return `Expired on ${formatted}`;
  if (state === "expiringSoon") return `Expiring soon: ${formatted}`;
  return `Valid till ${formatted}`;
}

interface VehiclePreviewDoc {
  id: string;
  label: string;
  type: string;
  status: "Uploaded" | "Pending";
  storagePath?: string;
  expiryDate?: string | null;
}

/** Step 1–4 and display label from trip status (aligned with driver app flow). */
function trackingStepAndLabel(status: string | null | undefined): {
  step: number;
  label: string;
} {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "delivered" || s === "done")
    return { step: 4, label: "Completed" };
  if (s === "arrived" || s === "at_destination" || s === "at_drop")
    return { step: 3, label: "Arrived" };
  if (
    s === "in_progress" ||
    s === "in_transit" ||
    s === "dispatched" ||
    s === "picked_up" ||
    s === "pickup"
  )
    return { step: 2, label: "In progress" };
  return { step: 1, label: "Assigned" };
}

/** Unified row for Driver Activity Timeline: assignment audit or driver status change. */
type DriverActivityTimelineRow =
  | { kind: "assignment"; row: TripAssignmentAuditRow }
  | {
      kind: "status";
      id: string;
      status_label: string;
      changed_at: string;
      status_context: "started" | "in_transit" | "completed";
      detail_line: string;
    };

export interface TripDetailScreenProps {
  tripId: string;
  /**
   * When "supplier", add-entry opens with defaultType "out" and supplier pre-filled.
   * When "vehicle", add-entry opens with defaultType "out" and trip pre-selected (vehicle expense flow).
   * When "client", add-entry opens with defaultType "in" and client pre-filled (customer payment flow).
   */
  entryContext?: "supplier" | "vehicle" | "client";
  /** When entryContext="client", the local client id/name for integrated flows. */
  clientIdFromContext?: string;
  clientNameFromContext?: string;
  onBack: () => void;
}

export default function TripDetailScreen({
  tripId,
  entryContext,
  clientIdFromContext,
  clientNameFromContext,
  onBack,
}: TripDetailScreenProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [trip, setTrip] = useState<TripRow | null>(null);
  const { data: shipperNameByTripId = {} } = useShipperDisplayNamesQuery(currentOrganization?.id ?? null);
  const displayClientName = trip ? (shipperNameByTripId[trip.id] ?? trip.client_name ?? undefined) : undefined;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);
  const [vehicleDocs, setVehicleDocs] = useState<VehicleDocuments | null>(null);
  const [displayVehicleFromInput, setDisplayVehicleFromInput] = useState("");
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [financeRefreshKey, setFinanceRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [adjustments, setAdjustments] = useState<TripAdjustment[]>([]);
  const [assignmentAuditRows, setAssignmentAuditRows] = useState<
    TripAssignmentAuditRow[]
  >([]);
  const [assignmentDriverNames, setAssignmentDriverNames] = useState<
    Record<string, string>
  >({});
  const [assignmentVehicleLabels, setAssignmentVehicleLabels] = useState<
    Record<string, string>
  >({});
  const [tripOtp, setTripOtp] = useState<{
    code: string | null;
    expires_at: string | null;
  } | null>(null);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [expandedTimelineEntryIds, setExpandedTimelineEntryIds] = useState<Record<string, boolean>>({});
  const [showFullScreenMap, setShowFullScreenMap] = useState(false);
  const [showDriverRejectedModal, setShowDriverRejectedModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<TripDocItem | null>(null);
  /** True when assigned driver has linked their account (user_id set); false when unlinked (e.g. OTP not claimed). */
  const [driverLinked, setDriverLinked] = useState(false);
  /** Latest driver location for Live Tracking map (from driver_locations). */
  const [driverLocation, setDriverLocation] = useState<driverLocationService.DriverLocationRow | null>(null);
  const [driverLocationLoading, setDriverLocationLoading] = useState(false);
  /** Location history for trip (first/last = pickup/drop proxy on map). */
  const [tripLocationPoints, setTripLocationPoints] = useState<{ latitude: number; longitude: number; recorded_at: string }[]>([]);
  /** Reverse-geocoded address for driver current location. */
  const [driverLocationAddress, setDriverLocationAddress] = useState<string | null>(null);
  /** Reverse-geocoded addresses for first two trip location history points (Past 1, Past 2 on map). */
  const [pastLocationAddresses, setPastLocationAddresses] = useState<[string | null, string | null]>([null, null]);
  const [tripDocuments, setTripDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState(false);
  const [vehiclePreviewUrls, setVehiclePreviewUrls] = useState<Record<string, string | null>>({});
  const [vehiclePreviewIndex, setVehiclePreviewIndex] = useState(0);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const refetchTransactionsRef = useRef<() => void>(() => {});
  const prevDriverIdRef = useRef<string | null>(null);
  const podModalRefetchDoneRef = useRef(false);
  /** When set, we've completed a load for this tripId; subsequent load() for same id is background refresh (no loading spinner). */
  const loadCompletedForIdRef = useRef<string | null>(null);
  const supplierRetryForTripIdRef = useRef<string | null>(null);
  /** Current trip for comparison in supplier fallback; avoid setTrip when data unchanged to reduce flicker. */
  const tripRef = useRef<TripRow | null>(null);
  tripRef.current = trip;

  /** Current driver id for location fetch: trip.driver_id or latest assignment audit row. */
  const effectiveDriverIdForLocation = useMemo(
    () => trip?.driver_id ?? assignmentAuditRows[0]?.driver_id_new ?? null,
    [trip?.driver_id, assignmentAuditRows],
  );
  /** Driver is offline when no driver is assigned or driver has not accepted/linked (no live tracking). */
  const isDriverOffline = useMemo(() => {
    const statusLower = (trip?.status ?? "").toLowerCase();
    const hasJourneyRuntimeStatus =
      statusLower === "in_progress" ||
      statusLower === "in_transit" ||
      statusLower === "picked_up" ||
      statusLower === "arrived" ||
      statusLower === "at_destination" ||
      statusLower === "completed" ||
      statusLower === "delivered" ||
      statusLower === "done";
    const hasAssignedDriver = !!effectiveDriverIdForLocation || hasJourneyRuntimeStatus;
    if (!hasAssignedDriver) return true;
    const hasLiveTrackingSignal =
      !!driverLocation || tripLocationPoints.length > 0;
    const viewerOrgId = currentOrganization?.id ?? null;
    const isSharedClientOrNonOwnerView =
      !!trip &&
      !!viewerOrgId &&
      !!trip.organization_id &&
      trip.organization_id !== viewerOrgId;
    /**
     * Client-owned indent trips can be opened from multiple entry points (not always
     * via `entryContext=client`). Keep tracking view active for this ownership case.
     */
    const isClientOwnerIndentView =
      !!trip &&
      !!trip.indent_id &&
      !!viewerOrgId &&
      !!trip.organization_id &&
      trip.organization_id === viewerOrgId;
    /**
     * Client-side trip detail should be trackable when a driver is assigned, even if
     * linked-driver metadata (drivers.user_id) is not readable in the client's org context.
     */
    const isClientTrackingView = entryContext === "client" && !!trip;
    if (
      isClientTrackingView ||
      isClientOwnerIndentView ||
      isSharedClientOrNonOwnerView ||
      hasLiveTrackingSignal
    ) {
      return false;
    }
    return !driverLinked;
  }, [
    effectiveDriverIdForLocation,
    entryContext,
    trip,
    driverLinked,
    currentOrganization?.id,
    driverLocation,
    tripLocationPoints,
  ]);

  const tripCompleted = trip != null && isTripCompleted(trip);

  /** Trip ratings fetched when completed; used for driver rating display and TripRatingsBlock. */
  const [tripRatings, setTripRatings] = useState<{ score: number }[]>([]);
  const driverRatingAvg = useMemo(() => averageScore(tripRatings), [tripRatings]);
  const handleRatingsLoaded = useCallback((ratings: { rated_type: string; score: number }[]) => {
    const driverRatings = ratings.filter((r) => r.rated_type === "driver");
    setTripRatings(driverRatings);
  }, []);

  useEffect(() => {
    if (!trip?.id || !tripCompleted) {
      setTripRatings([]);
      return;
    }
    getRatingsForTrip(trip.id).then(({ error, ratings }) => {
      if (error) return;
      handleRatingsLoaded(ratings ?? []);
    });
  }, [trip?.id, tripCompleted, handleRatingsLoaded]);

  /** Five labels for map: origin, past 1, past 2, current (live), destination. */
  const trackingMapLocationLabels = useMemo((): [string, string, string, string, string] => {
    const origin = (trip?.pickup_area ?? "Origin").trim() || "Start";
    const destination = (trip?.drop_location ?? "Destination").trim() || "Destination";
    const past1 = pastLocationAddresses[0] ?? "Past location 1";
    const past2 = pastLocationAddresses[1] ?? "Past location 2";
    const current = driverLocationAddress?.trim() || "Current location";
    return [origin, past1, past2, current, destination];
  }, [trip?.pickup_area, trip?.drop_location, pastLocationAddresses, driverLocationAddress]);

  const trackingMapOriginCoordinate = useMemo(() => {
    const latitude = Number((trip as any)?.pickup_lat);
    const longitude = Number((trip as any)?.pickup_lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }, [trip]);

  const trackingMapDestinationCoordinate = useMemo(() => {
    const latitude = Number((trip as any)?.drop_lat);
    const longitude = Number((trip as any)?.drop_lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }, [trip]);

  const load = useCallback(() => {
    if (!tripId) {
      setLoading(false);
      loadCompletedForIdRef.current = null;
      return;
    }
    const isRepeatLoadForSameId = loadCompletedForIdRef.current === tripId;
    if (isRepeatLoadForSameId || isRefreshingRef.current) {
      isRefreshingRef.current = true;
    } else if (!initialLoadDoneRef.current) {
      setLoading(true);
    }
    setError(null);
    getTripById(tripId)
      .then((res) => {
        if (res.error) {
          setError(res.error.message);
          setTrip(null);
        } else if (res.trip) {
          setTrip(res.trip);
        } else {
          const alreadyHaveTripForThisId = tripRef.current?.id === tripId;
          if (!alreadyHaveTripForThisId) setTrip(null);
        }
        return res;
      })
      .then(async (res) => {
        if (res.trip) return;
        const orgId = currentOrganization?.id;
        if (!orgId) return;
        const supplierRes = await getTripsWhereOrgIsSupplier(orgId);
        if (supplierRes.error) return;
        const found = supplierRes.trips.find((t) => t.id === tripId);
        if (found) {
          const current = tripRef.current;
          const unchanged =
            current?.id === found.id &&
            current?.updated_at === found.updated_at &&
            (current?.status ?? "") === (found.status ?? "");
          if (!unchanged) {
            setTrip(found);
            setError(null);
          }
        }
      })
      .finally(() => {
        loadCompletedForIdRef.current = tripId;
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [tripId, currentOrganization?.id]);

  const loadAdjustments = useCallback(() => {
    if (!tripId) return;
    getTripAdjustments(tripId).then(setAdjustments);
  }, [tripId]);

  const loadAssignmentAudit = useCallback(() => {
    if (!tripId) return;
    getTripAssignmentAuditHistory(tripId).then(({ error, rows }) => {
      if (!error) setAssignmentAuditRows(rows ?? []);
      else setAssignmentAuditRows([]);
    });
  }, [tripId]);

  /** For aggregate trips, load current OTP for display in Assignments section. */
  const loadTripOtp = useCallback(() => {
    if (!trip?.id || !isAggregateTrip(trip)) {
      setTripOtp(null);
      return;
    }
    getTripOtpForDisplay(trip.id).then(({ error, code, expires_at }) => {
      if (error) setTripOtp(null);
      else setTripOtp({ code: code ?? null, expires_at: expires_at ?? null });
    });
  }, [trip?.id, trip?.supplier_id]);

  const loadTripDocuments = useCallback(() => {
    if (!tripId) return;
    tripDocumentsService.getDocumentsByTripId(tripId).then(({ documents, error }) => {
      if (error) setTripDocuments([]);
      else setTripDocuments(documents ?? []);
    });
  }, [tripId]);

  const handleRefresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    load();
    loadAdjustments();
    loadAssignmentAudit();
    setFinanceRefreshKey((k) => k + 1);
    refetchTransactionsRef.current();
  }, [load, loadAdjustments, loadAssignmentAudit]);

  /** When realtime reports trip change (e.g. driver rejected), refetch trip and audit so Assignment block and Activity Log stay in sync. Skip loading state to avoid flicker. */
  const handleRealtimeTripUpdate = useCallback(() => {
    isRefreshingRef.current = true;
    load();
    loadAssignmentAudit();
    setFinanceRefreshKey((k) => k + 1);
    refetchTransactionsRef.current();
  }, [load, loadAssignmentAudit]);

  /** When trip is loaded and aggregate, load OTP for Assignments section. */
  useEffect(() => {
    const isRosterFromLoadHubNow =
      trip?.source === "direct_quote" &&
      trip?.driver_id != null &&
      trip?.vehicle_id != null;

    if (trip?.id && isAggregateTrip(trip) && !isRosterFromLoadHubNow) {
      loadTripOtp();
    } else {
      setTripOtp(null);
    }
  }, [
    trip?.id,
    trip?.supplier_id,
    trip?.source,
    trip?.driver_id,
    trip?.vehicle_id,
    loadTripOtp,
  ]);

  const orgIdForTransactions = trip?.organization_id ?? null;
  const { data: transactionsData = [], refetch: refetchTransactions } =
    useTransactionsQuery(orgIdForTransactions);
  refetchTransactionsRef.current = refetchTransactions;
  const transactions: LedgerRow[] | null = orgIdForTransactions
    ? transactionsData
    : null;

  const tripLedgerEntries = useMemo(() => {
    return getTripLedgerEntries(transactions, trip?.id);
  }, [transactions, trip?.id]);

  /** When opening from load flow (supplier Authorize Voyage), use stashed trip so we never show "Trip not found". */
  useEffect(() => {
    if (!tripId) return;
    const initial = getInitialTripForDetail(tripId);
    if (initial) {
      setTrip(initial);
      setError(null);
      setLoading(false);
      loadCompletedForIdRef.current = tripId;
      clearInitialTripForDetail(tripId);
    }
  }, [tripId]);

  useEffect(() => load(), [load]);

  /** When supplier opens trip before org is ready: retry load once when org becomes available so supplier fallback can run. Show loading during retry to avoid "Trip not found" flash. */
  useEffect(() => {
    if (!tripId || !currentOrganization?.id || trip !== null || loading) return;
    if (supplierRetryForTripIdRef.current === tripId) return;
    supplierRetryForTripIdRef.current = tripId;
    setLoading(true);
    load();
  }, [tripId, currentOrganization?.id, trip, loading, load]);

  useEffect(() => {
    if (tripId) loadAdjustments();
  }, [tripId, loadAdjustments]);
  useEffect(() => {
    if (tripId) loadAssignmentAudit();
  }, [tripId, loadAssignmentAudit]);

  useEffect(() => {
    if (trip?.id) loadTripDocuments();
    else setTripDocuments([]);
  }, [trip?.id, loadTripDocuments]);

  const vehiclePreviewDocs = useMemo<VehiclePreviewDoc[]>(() => {
    return DOCUMENT_EXPIRY_ORDER.map((docType) => {
      const vDoc = vehicleDocs?.[docType];
      const storagePath = vDoc?.url?.trim();

      return storagePath
        ? {
            id: `vehicle-${docType}`,
            label: DOCUMENT_LABELS[docType],
            type: docTypeFromFileName(storagePath),
            status: "Uploaded" as const,
            storagePath,
            expiryDate: vDoc?.expiryDate ?? null,
          }
        : {
            id: `vehicle-${docType}`,
            label: DOCUMENT_LABELS[docType],
            type: "JPG",
            status: "Pending" as const,
            expiryDate: vDoc?.expiryDate ?? null,
          };
    });
  }, [vehicleDocs]);

  const computedTripDocs = useMemo<TripDocItem[]>(() => {
    const podDoc = tripDocuments[0];
    const hasVehicleDoc = vehiclePreviewDocs.some((doc) => !!doc.storagePath);

    return [
      {
        id: "manifest",
        label: "Trip Manifest",
        type: "PDF",
        status: "Pending" as const,
        category: "trip" as const,
      },
      {
        id: "vehicle-documents",
        label: "Vehicle Document",
        type: hasVehicleDoc ? "DOCS" : "JPG",
        status: hasVehicleDoc ? ("Uploaded" as const) : ("Pending" as const),
        docSource: "vehicle" as const,
        category: "vehicle" as const,
      },
      podDoc
        ? {
            id: "pod",
            label: "Driver POD",
            type: (podDoc.mime_type ?? "image/jpeg").includes("pdf") ? "PDF" : "JPG",
            status: "Uploaded" as const,
            storagePath: podDoc.storage_path,
            documentId: podDoc.id,
            category: "driver" as const,
          }
        : {
            id: "pod",
            label: "Driver POD",
            type: "JPG",
            status: "Pending" as const,
            category: "driver" as const,
          },
    ];
  }, [tripDocuments, vehiclePreviewDocs]);

  /** Fetch driver current location from DB (driver_locations) for Live Tracking map. */
  const fetchDriverLocationFromDb = useCallback(async () => {
    if (!trip?.id) return;
    const driverId = effectiveDriverIdForLocation;
    try {
      const [latestRes, historyByTrip] = await Promise.all([
        driverLocationService.getLatestDriverLocationForTripOrDriver(trip.id, driverId),
        driverLocationService.getTripLocationHistory(trip.id),
      ]);
      let effectivePoints = !historyByTrip.error ? historyByTrip.points : [];
      if (effectivePoints.length === 0 && driverId) {
        const historyByDriver = await driverLocationService.getDriverLocationHistoryByDriverId(driverId);
        if (!historyByDriver.error) effectivePoints = historyByDriver.points;
      }
      setDriverLocation(!latestRes.error ? latestRes.location : null);
      setTripLocationPoints(effectivePoints);
    } catch {
      setDriverLocation(null);
      setTripLocationPoints([]);
    } finally {
      setDriverLocationLoading(false);
    }
  }, [trip?.id, effectiveDriverIdForLocation]);

  /** When Live Tracking modal opens, fetch from DB immediately and then poll every 10s. */
  useEffect(() => {
    if (!showTrackingModal || !trip?.id) {
      setDriverLocation(null);
      setTripLocationPoints([]);
      setDriverLocationLoading(false);
      return;
    }
    setDriverLocation(null);
    setTripLocationPoints([]);
    setDriverLocationLoading(true);
    fetchDriverLocationFromDb();

    const interval = setInterval(() => {
      setDriverLocationLoading(true);
      fetchDriverLocationFromDb();
    }, 10000);

    return () => {
      clearInterval(interval);
      setDriverLocationLoading(false);
      setDriverLocation(null);
      setTripLocationPoints([]);
    };
  }, [showTrackingModal, trip?.id, fetchDriverLocationFromDb]);

  /** Reverse-geocode driver location so we show address text (same as driver app). */
  useEffect(() => {
    if (!driverLocation) {
      setDriverLocationAddress(null);
      return;
    }
    let cancelled = false;
    safeReverseGeocode(driverLocation.latitude, driverLocation.longitude)
      .then((results) => {
        if (cancelled || !results?.length) return;
        const place = results[0];
        const parts = [
          place.name ?? place.street ?? null,
          place.city ?? place.subregion ?? null,
        ].filter(Boolean) as string[];
        if (parts.length > 0) setDriverLocationAddress(parts.join(", "));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  /** Reverse-geocode first two trip location history points for map labels (Past 1, Past 2). */
  useEffect(() => {
    if (!tripLocationPoints || tripLocationPoints.length < 2) {
      setPastLocationAddresses([null, null]);
      return;
    }
    const [p0, p1] = tripLocationPoints;
    let cancelled = false;
    Promise.all([
      safeReverseGeocode(p0.latitude, p0.longitude),
      safeReverseGeocode(p1.latitude, p1.longitude),
    ])
      .then(([results0, results1]) => {
        if (cancelled) return;
        const formatPlace = (results: ExpoLocationTypes.LocationGeocodedAddress[] | null) => {
          if (!results?.length) return null;
          const place = results[0];
          const parts = [
            place.name ?? place.street ?? null,
            place.city ?? place.subregion ?? null,
          ].filter(Boolean) as string[];
          return parts.length > 0 ? parts.join(", ") : null;
        };
        setPastLocationAddresses([formatPlace(results0), formatPlace(results1)]);
      })
      .catch(() => {
        if (!cancelled) setPastLocationAddresses([null, null]);
      });
    return () => {
      cancelled = true;
    };
  }, [tripLocationPoints]);

  /** Resolve preview URLs for the selected trip doc or the vehicle-doc gallery. */
  const docPreviewStoragePath =
    selectedDoc?.storagePath ??
    (selectedDoc?.id === "pod" && tripDocuments[0] ? tripDocuments[0].storage_path : undefined);
  const isVehicleGalleryDoc = selectedDoc?.id === "vehicle-documents";
  const activeVehiclePreviewDoc = vehiclePreviewDocs[vehiclePreviewIndex] ?? null;

  useEffect(() => {
    if (!selectedDoc) {
      setDocPreviewUrl(null);
      setDocPreviewLoading(false);
      setDocPreviewError(false);
      setVehiclePreviewUrls({});
      setVehiclePreviewIndex(0);
      return;
    }
    if (isVehicleGalleryDoc) return;
    if (!docPreviewStoragePath) return;
    let isActive = true;
    setDocPreviewLoading(true);
    setDocPreviewUrl(null);
    setDocPreviewError(false);
    const urlPromise =
      selectedDoc.docSource === "vehicle"
        ? getVehicleDocumentViewUrl(docPreviewStoragePath)
        : tripDocumentsService.getDocumentViewUrl(docPreviewStoragePath);
    urlPromise
      .then((url) => {
        if (isActive) {
          setDocPreviewUrl(url);
          setDocPreviewLoading(false);
        }
      })
      .catch(() => {
        if (isActive) {
          setDocPreviewError(true);
          setDocPreviewLoading(false);
        }
      });
    return () => {
      isActive = false;
    };
  }, [selectedDoc, docPreviewStoragePath, isVehicleGalleryDoc]);

  useEffect(() => {
    if (!selectedDoc || !isVehicleGalleryDoc) return;

    const firstUploadedIndex = vehiclePreviewDocs.findIndex((doc) => !!doc.storagePath);
    setVehiclePreviewIndex(firstUploadedIndex >= 0 ? firstUploadedIndex : 0);
    setDocPreviewUrl(null);
    setDocPreviewError(false);
    setVehiclePreviewUrls({});

    const docsToResolve = vehiclePreviewDocs.filter((doc) => !!doc.storagePath);
    if (docsToResolve.length === 0) {
      setDocPreviewLoading(false);
      return;
    }

    let isActive = true;
    setDocPreviewLoading(true);

    Promise.all(
      docsToResolve.map(async (doc) => [doc.id, await getVehicleDocumentViewUrl(doc.storagePath!)] as const),
    )
      .then((resolved) => {
        if (!isActive) return;
        setVehiclePreviewUrls(Object.fromEntries(resolved));
        setDocPreviewLoading(false);
      })
      .catch(() => {
        if (!isActive) return;
        setDocPreviewError(true);
        setDocPreviewLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [selectedDoc, isVehicleGalleryDoc, vehiclePreviewDocs]);

  /** When POD modal opens without a path, refetch trip documents once (handles late load or stale data). */
  useEffect(() => {
    if (!selectedDoc) {
      podModalRefetchDoneRef.current = false;
      return;
    }
    if (selectedDoc.id !== "pod" || docPreviewStoragePath || !tripId) return;
    if (podModalRefetchDoneRef.current) return;
    podModalRefetchDoneRef.current = true;
    loadTripDocuments();
  }, [selectedDoc, docPreviewStoragePath, tripId, loadTripDocuments]);

  /** Resolve driver and vehicle ids from assignment audit rows to names/labels for display. */
  useEffect(() => {
    const orgId = trip?.organization_id;
    if (!orgId || assignmentAuditRows.length === 0) {
      setAssignmentDriverNames({});
      setAssignmentVehicleLabels({});
      return;
    }
    const driverIds = new Set<string>();
    const vehicleIds = new Set<string>();
    for (const row of assignmentAuditRows) {
      if (row.driver_id_prev) driverIds.add(row.driver_id_prev);
      if (row.driver_id_new) driverIds.add(row.driver_id_new);
      if (row.vehicle_id_prev) vehicleIds.add(row.vehicle_id_prev);
      if (row.vehicle_id_new) vehicleIds.add(row.vehicle_id_new);
    }
    let cancelled = false;
    const driverPromises = Array.from(driverIds).map(async (id) => {
      const res = await getDriverById(orgId, id);
      return {
        id,
        name: res.driver ? res.driver.name || res.driver.phone || id : id,
      };
    });
    const vehiclePromises = Array.from(vehicleIds).map(async (id) => {
      const res = await getVehicleById(orgId, id);
      const label = res.vehicle
        ? [res.vehicle.vehicle_number, res.vehicle.vehicle_type]
            .filter(Boolean)
            .join(" · ") || id
        : id;
      return { id, label };
    });
    Promise.all([Promise.all(driverPromises), Promise.all(vehiclePromises)])
      .then(([driverResults, vehicleResults]) => {
        if (cancelled) return;
        const drivers: Record<string, string> = {};
        const vehicles: Record<string, string> = {};
        for (const r of driverResults) drivers[r.id] = r.name;
        for (const r of vehicleResults) vehicles[r.id] = r.label;
        setAssignmentDriverNames(drivers);
        setAssignmentVehicleLabels(vehicles);
      })
      .catch(() => {
        if (!cancelled) {
          setAssignmentDriverNames({});
          setAssignmentVehicleLabels({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trip?.organization_id, assignmentAuditRows]);

  useEffect(() => {
    setDisplayVehicleFromInput("");
  }, [tripId]);

  /** When trip had a driver and now has none (e.g. driver rejected), notify dispatcher/supplier. */
  useEffect(() => {
    if (!trip?.id || trip.id !== tripId) return;
    const prevDriverId = prevDriverIdRef.current;
    prevDriverIdRef.current = trip.driver_id ?? null;
    if (prevDriverId != null && (trip.driver_id ?? null) === null) {
      setShowDriverRejectedModal(true);
    }
  }, [trip?.id, trip?.driver_id, tripId, t]);

  useEffect(() => {
    if (financeRefreshKey > 0) refetchTransactions();
  }, [financeRefreshKey, refetchTransactions]);

  useFocusEffect(
    useCallback(() => {
      if (tripId && trip) {
        isRefreshingRef.current = true;
        load();
        loadAssignmentAudit();
        const isRosterFromLoadHubNow =
          trip.source === "direct_quote" &&
          trip.driver_id != null &&
          trip.vehicle_id != null;
        if (isAggregateTrip(trip) && !isRosterFromLoadHubNow) {
          loadTripOtp();
        }
        setFinanceRefreshKey((k) => k + 1);
      }
    }, [tripId, load, loadAssignmentAudit, loadTripOtp, trip]),
  );
  useRealtimeTrip(tripId || null, handleRealtimeTripUpdate);

  /** When trip is in progress (assigned or in_progress), poll periodically so journey progress updates even if realtime is delayed. Skip loading state to avoid flicker. */
  useEffect(() => {
    if (!tripId || !trip || isTripCompleted(trip)) return;
    const statusLower = (trip.status ?? "").toLowerCase();
    if (statusLower !== "assigned" && statusLower !== "in_progress") return;
    const intervalMs = 15000;
    const id = setInterval(() => {
      isRefreshingRef.current = true;
      load();
    }, intervalMs);
    return () => clearInterval(id);
  }, [tripId, trip?.id, trip?.status, trip?.completed_at, load]);

  useEffect(() => {
    if (!trip?.organization_id) {
      setDriverName(null);
      setVehicleLabel(null);
      setPartnerName(null);
      setDriverLinked(false);
      return;
    }
    const fallbackDriverName = (trip.driver_display_name ?? "").trim() || null;
    let cancelled = false;
    const orgId = trip.organization_id;
    if (trip.driver_id) {
      setDriverName(fallbackDriverName);
      setDriverLinked(false);
      getDriverById(orgId, trip.driver_id).then((res) => {
        if (cancelled) return;
        const d = res.driver;
        if (d) {
          const fromDriver = (d.name || d.phone || "").trim() || null;
          setDriverName(fromDriver ?? fallbackDriverName ?? "—");
          setDriverLinked(!!d.user_id);
          return;
        }
        // Driver not in trip org: for load-based (aggregate) trips the driver may live in the supplier's org
        const trySupplierOrgThenViewerOrg = () => {
          if (!trip.supplier_id) {
            tryViewerOrg();
            return;
          }
          getSupplierById(orgId, trip.supplier_id).then((r) => {
            if (cancelled) return;
            const linkedOrgId = r.supplier?.linked_organization_id;
            if (linkedOrgId) {
              getDriverById(linkedOrgId, trip.driver_id!).then((res2) => {
                if (cancelled) return;
                const d2 = res2.driver;
                if (d2) {
                  const fromDriver2 = (d2.name || d2.phone || "").trim() || null;
                  setDriverName(fromDriver2 ?? fallbackDriverName ?? "—");
                  setDriverLinked(!!d2.user_id);
                  return;
                }
                tryViewerOrg();
              });
            } else {
              tryViewerOrg();
            }
          });
        };
        const tryViewerOrg = () => {
          const viewerOrgId = currentOrganization?.id;
          if (!viewerOrgId || viewerOrgId === orgId) {
            setDriverName(fallbackDriverName ?? "—");
            setDriverLinked(false);
            return;
          }
          getDriverById(viewerOrgId, trip.driver_id!).then((res3) => {
            if (cancelled) return;
            const d3 = res3.driver;
            const fromDriver3 = d3 ? (d3.name || d3.phone || "").trim() || null : null;
            setDriverName(fromDriver3 ?? fallbackDriverName ?? "—");
            setDriverLinked(!!d3?.user_id);
          });
        };
        trySupplierOrgThenViewerOrg();
      });
    } else {
      setDriverName(fallbackDriverName);
      setDriverLinked(false);
    }
    if (trip.vehicle_id) {
      getVehicleById(orgId, trip.vehicle_id).then((res) => {
        if (!cancelled && res.vehicle) {
          const parts = [res.vehicle.vehicle_number];
          if (res.vehicle.vehicle_type) parts.push(res.vehicle.vehicle_type);
          setVehicleLabel(parts.join(" · "));
          setVehicleDocs(res.vehicle.documents ?? null);
        }
      });
    } else if (trip.vehicle_display_number?.trim()) {
      setVehicleLabel(
        formatIndianVehicleNumber(trip.vehicle_display_number.trim()),
      );
      setVehicleDocs(null);
    } else {
      setVehicleLabel(null);
      setVehicleDocs(null);
    }
    if (trip.supplier_id) {
      getSupplierById(orgId, trip.supplier_id).then((r) => {
        if (!cancelled) {
          const s = r.supplier;
          setPartnerName(
            r.error
              ? null
              : s?.company_name || s?.name || s?.contact_person || null,
          );
        }
      });
    } else setPartnerName(null);
    return () => {
      cancelled = true;
    };
  }, [
    trip?.id,
    trip?.organization_id,
    trip?.driver_id,
    trip?.driver_display_name,
    trip?.vehicle_id,
    trip?.vehicle_display_number,
    trip?.supplier_id,
    currentOrganization?.id,
  ]);

  const isAggregate = isAggregateTrip(trip);
  /** Roster flow from Load Hub: driver + vehicle set at create — asset-based; do not show OTP/assign-by-phone. */
  const isRosterFromLoadHub =
    trip?.source === "direct_quote" &&
    trip?.driver_id != null &&
    trip?.vehicle_id != null;
  const showAssignByPhone = isAggregate && !isRosterFromLoadHub;
  /** For UI pill/label: show "Asset" when roster-from-LoadHub (asset-based assignment) or when no supplier. */
  const displayAsAsset = !isAggregate || isRosterFromLoadHub;
  /** Client-side indent trip is read-only for assignment/reassignment controls. */
  const isClientIndentView = useMemo(() => {
    if (!trip?.indent_id) return false;
    const viewerOrgId = currentOrganization?.id ?? null;
    if (!viewerOrgId || !trip.organization_id) return false;
    // In indent flow, trip owner org is the client-side (shipper) view.
    return viewerOrgId === trip.organization_id;
  }, [trip?.indent_id, trip?.organization_id, currentOrganization?.id]);
  const insets = useSafeAreaInsets();

  const capabilities = useMemo(
    () =>
      getCapabilitiesFromProfile(
        profile
          ? {
              role: profile.role,
              aggregated: profile.aggregated,
              asset: profile.asset,
            }
          : null,
      ),
    [profile],
  );
  const canAssign = canAssignTrip(capabilities);
  const currentUserId = user?.uid ?? null;

  /** Load creator (shipper who created the load and awarded the quote). Previously this view was read-only for assignments/OTP, but trip-based flow now allows full control, so this flag is informational only. */
  const isLoadCreatorViewOnly =
    !!currentOrganization?.id &&
    !!trip?.organization_id &&
    isAggregate &&
    currentOrganization.id === trip.organization_id;

  /** Assignment source (Private Book / Shared / Unassigned) from latest audit row. O(1). */
  const assignmentSource = useMemo((): AssignmentSource => {
    const latest = assignmentAuditRows[0];
    if (!latest) return "unassigned";
    return latest.changed_by === currentUserId ? "private" : "shared";
  }, [assignmentAuditRows, currentUserId]);

  /** Latest reassignment row (newest first); used for previousDriverName and summary. O(1). */
  const latestReassignmentRow = useMemo(
    () => assignmentAuditRows.find((r) => r.event_type === "reassignment"),
    [assignmentAuditRows],
  );
  const previousDriverName = useMemo(() => {
    if (!latestReassignmentRow?.driver_id_prev) return null;
    return assignmentDriverNames[latestReassignmentRow.driver_id_prev] ?? null;
  }, [latestReassignmentRow, assignmentDriverNames]);
  const latestReassignmentSummary = useMemo(() => {
    if (!latestReassignmentRow) return null;
    const parts: string[] = [];
    const driverPrev = latestReassignmentRow.driver_id_prev
      ? assignmentDriverNames[latestReassignmentRow.driver_id_prev]
      : null;
    const driverNew = latestReassignmentRow.driver_id_new
      ? assignmentDriverNames[latestReassignmentRow.driver_id_new]
      : null;
    const vehiclePrev = latestReassignmentRow.vehicle_id_prev
      ? assignmentVehicleLabels[latestReassignmentRow.vehicle_id_prev]
      : null;
    const vehicleNew = latestReassignmentRow.vehicle_id_new
      ? assignmentVehicleLabels[latestReassignmentRow.vehicle_id_new]
      : null;

    const isDriverDeclined =
      driverPrev != null && latestReassignmentRow.driver_id_new == null;

    if (isDriverDeclined) {
      parts.push(t("driverRejected"));
    } else {
      if (driverPrev != null && driverNew != null)
        parts.push(`Driver: ${driverPrev} → ${driverNew}`);
      else if (driverNew != null) parts.push(`Driver: ${driverNew}`);
      else if (driverPrev != null)
        parts.push(`Driver: ${driverPrev} (rejected)`);
      if (vehiclePrev != null && vehicleNew != null)
        parts.push(`Vehicle: ${vehiclePrev} → ${vehicleNew}`);
      else if (vehicleNew != null) parts.push(`Vehicle: ${vehicleNew}`);
      else if (vehiclePrev != null)
        parts.push(`Vehicle: ${vehiclePrev} (rejected)`);
    }

    if (latestReassignmentRow.changed_at) {
      try {
        parts.push(
          new Date(latestReassignmentRow.changed_at).toLocaleDateString(
            "en-IN",
            {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            },
          ),
        );
      } catch {
        parts.push(latestReassignmentRow.changed_at.slice(0, 16));
      }
    }
    return parts.length > 0 ? parts.join("  ·  ") : null;
  }, [
    latestReassignmentRow,
    assignmentDriverNames,
    assignmentVehicleLabels,
    t,
  ]);

  /** Activity log rows (with fallback when trip has assignment but no audit yet). Same as TripDetailFinanceView Assignments section. */
  const effectiveActivityRows = useMemo(() => {
    const hasCurrentAssignment = !!(
      trip?.driver_id ||
      trip?.vehicle_id ||
      (trip?.vehicle_display_number ?? "").trim()
    );
    const fallbackRow: TripAssignmentAuditRow | null =
      assignmentAuditRows.length === 0 && hasCurrentAssignment && trip
        ? {
            id: "fallback",
            trip_id: trip.id,
            event_type: "assignment",
            driver_id_prev: null,
            driver_id_new: trip.driver_id ?? null,
            vehicle_id_prev: null,
            vehicle_id_new: trip.vehicle_id ?? null,
            changed_at:
              trip.created_at ?? trip.updated_at ?? new Date().toISOString(),
            changed_by: null,
          }
        : null;
    return assignmentAuditRows.length > 0
      ? assignmentAuditRows
      : fallbackRow
        ? [fallbackRow]
        : [];
  }, [trip, assignmentAuditRows]);

  const tripStatusLower = (trip?.status ?? "").toLowerCase();
  const showInTransitStatusEvent =
    tripStatusLower === "in_progress" ||
    tripStatusLower === "in_transit" ||
    tripStatusLower === "picked_up" ||
    tripStatusLower === "arrived" ||
    tripStatusLower === "at_destination" ||
    tripStatusLower === "completed" ||
    tripStatusLower === "delivered" ||
    tripStatusLower === "done";

  /** Driver activity timeline: assignment/reassignment + status changes, newest first. */
  const driverActivityTimelineRows =
    useMemo((): DriverActivityTimelineRow[] => {
      const assignmentRows: DriverActivityTimelineRow[] =
        effectiveActivityRows.map((row) => ({
          kind: "assignment" as const,
          row,
        }));
      const statusRows: DriverActivityTimelineRow[] = [];
      if (trip?.started_at && String(trip.started_at).trim()) {
        statusRows.push({
          kind: "status",
          id: "status-started",
          status_label: "Started trip",
          changed_at: trip.started_at,
          status_context: "started",
          detail_line: "Trip started after pickup confirmation",
        });
      }
      if (showInTransitStatusEvent) {
        const inTransitTime =
          trip?.started_at ??
          trip?.updated_at ??
          trip?.created_at ??
          new Date().toISOString();
        statusRows.push({
          kind: "status",
          id: "status-in-transit",
          status_label: "In-transit",
          changed_at: inTransitTime,
          status_context: "in_transit",
          detail_line: "Vehicle is moving between pickup and destination",
        });
      }
      if (trip?.completed_at && String(trip.completed_at).trim()) {
        statusRows.push({
          kind: "status",
          id: "status-completed",
          status_label: "Completed trip",
          changed_at: trip.completed_at,
          status_context: "completed",
          detail_line: "Trip marked complete at destination",
        });
      }
      const combined: DriverActivityTimelineRow[] = [
        ...assignmentRows,
        ...statusRows,
      ];
      combined.sort((a, b) => {
        const at = a.kind === "assignment" ? a.row.changed_at : a.changed_at;
        const bt = b.kind === "assignment" ? b.row.changed_at : b.changed_at;
        return new Date(bt).getTime() - new Date(at).getTime();
      });
      return combined;
    }, [
      effectiveActivityRows,
      showInTransitStatusEvent,
      trip?.created_at,
      trip?.updated_at,
      trip?.started_at,
      trip?.completed_at,
    ]);

  /** Driver status change events only (for "Status changes" block below current step). Newest first. */
  const statusChangeRowsOnly = useMemo(() => {
    const rows: { id: string; status_label: string; changed_at: string }[] = [];
    if (trip?.started_at && String(trip.started_at).trim()) {
      rows.push({
        id: "status-started",
        status_label: "Started trip",
        changed_at: trip.started_at,
      });
    }
    if (showInTransitStatusEvent) {
      rows.push({
        id: "status-in-transit",
        status_label: "In-transit",
        changed_at: trip?.started_at ?? trip?.updated_at ?? trip?.created_at ?? new Date().toISOString(),
      });
    }
    if (trip?.completed_at && String(trip.completed_at).trim()) {
      rows.push({
        id: "status-completed",
        status_label: "Completed trip",
        changed_at: trip.completed_at,
      });
    }
    rows.sort(
      (a, b) =>
        new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
    );
    return rows;
  }, [
    showInTransitStatusEvent,
    trip?.created_at,
    trip?.updated_at,
    trip?.started_at,
    trip?.completed_at,
  ]);

  const timelineItemId = useCallback((item: DriverActivityTimelineRow) => {
    if (item.kind === "status") return item.id;
    return item.row.id;
  }, []);

  const toggleTimelineItemExpanded = useCallback((itemId: string) => {
    setExpandedTimelineEntryIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }, []);

  useEffect(() => {
    setExpandedTimelineEntryIds({});
  }, [trip?.id, showTrackingModal]);

  const openAddEntry = useCallback(() => {
    if (!trip?.id) return;
    const hasSupplier =
      trip.supplier_id != null && trip.supplier_id.trim() !== "";

    const tripNumber = getTripDisplayNumber(trip);
    // Supplier-origin trip detail: default OUT with supplier as party.
    if (entryContext === "supplier" && hasSupplier) {
      const params = new URLSearchParams({
        tripId: trip.id,
        tripNumber,
        defaultType: "out",
        partyContext: "suppliers",
        partyId: trip.supplier_id ?? "",
        partyName: (trip.supplier_name ?? "").trim() || t("supplier"),
      });
      router.push(`/(modals)/ledger-sync?${params.toString()}`);
      return;
    }

    // Client-origin trip detail (from Customers tab/integrated client): default IN with client pre-selected.
    if (entryContext === "client" && clientIdFromContext) {
      const params = new URLSearchParams({
        tripId: trip.id,
        tripNumber,
        defaultType: "in",
        partyContext: "customers",
        partyId: clientIdFromContext,
        partyName:
          clientNameFromContext ??
          displayClientName ??
          trip.client_name ??
          t("client"),
      });
      router.push(`/(modals)/ledger-sync?${params.toString()}`);
      return;
    }

    // Vehicle-origin trip detail: default OUT with this trip pre-selected (vehicle expense flow).
    if (entryContext === "vehicle") {
      const params = new URLSearchParams({
        tripId: trip.id,
        tripNumber,
        defaultType: "out",
      });
      router.push(`/(modals)/ledger-sync?${params.toString()}`);
      return;
    }

    // Default: IN against client (or "all" when supplier exists so OUT can select supplier later).
    const partyContext =
      hasSupplier ? "all" : "customers";
    const params = new URLSearchParams({
      tripId: trip.id,
      tripNumber,
      defaultType: "in",
      partyContext,
      partyId: trip.client_id ?? "",
      partyName: displayClientName ?? trip.client_name ?? t("client"),
    });
    router.push(`/(modals)/ledger-sync?${params.toString()}`);
  }, [
    trip?.id,
    trip?.client_id,
    displayClientName,
    trip?.client_name,
    trip?.supplier_id,
    trip?.supplier_name,
    entryContext,
    router,
    t,
  ]);

  const handleAddAdjustment = () => setShowAdjustmentModal(true);
  const handleSaveAdjustment = useCallback(
    async (params: {
      type: "revenue" | "cost";
      impact: "plus" | "minus";
      amount: number;
      reason: string;
    }) => {
      if (!trip?.id) return;
      const tripId = trip.id;
      await addTripAdjustment(tripId, params);
      loadAdjustments();
    },
    [trip?.id, loadAdjustments],
  );
  const handleRemoveAdjustment = useCallback(
    async (adjustmentId: string) => {
      if (!trip?.id) return;
      const tripId = trip.id;
      await removeTripAdjustment(tripId, adjustmentId);
      loadAdjustments();
    },
    [trip?.id, loadAdjustments],
  );

  if (loading && !trip) {
    return <CenteredLoadingView message={t("loadingTrip")} />;
  }

  /** Supplier: avoid flashing "Trip not found" before retry effect runs; show loading until retry runs. */
  const awaitingSupplierRetry =
    !trip &&
    !loading &&
    !!tripId &&
    !!currentOrganization?.id &&
    supplierRetryForTripIdRef.current !== tripId;
  if (awaitingSupplierRetry) {
    return <CenteredLoadingView message={t("loadingTrip")} />;
  }

  if (error || !trip) {
    return (
      <View style={styles.container}>
        <View style={styles.darkBlock}>
          <TeslaHeader
            title={t("trip")}
            showBack
            onBack={onBack}
            onLoadClick={() => {
              onBack();
              router.push("/load-board");
            }}
            onNetworkClick={() => {
              onBack();
              router.push("/(tabs)/network");
            }}
            onNotificationClick={() => {
              onBack();
              router.push("/milestone");
            }}
            onProfileClick={() => {
              onBack();
              router.push("/(tabs)/profile");
            }}
          />
        </View>
        <View style={styles.scrollContent}>
          <Text style={styles.errorText}>{error || t("tripNotFound")}</Text>
          <TouchableOpacity
            onPress={() => {
              setError(null);
              loadCompletedForIdRef.current = null;
              isRefreshingRef.current = true;
              load();
            }}
            style={[styles.retryBtn, { marginTop: 16 }]}
            activeOpacity={0.8}
            accessibilityLabel={t("tryAgain")}
            accessibilityRole="button"
          >
            <FontAwesome name="refresh" size={14} color={Theme.textOnPrimary} style={{ marginRight: 8 }} />
            <Text style={styles.retryBtnText}>{t("tryAgain")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.headerBack}
          activeOpacity={0.8}
          accessibilityLabel={t("back")}
        >
          <FontAwesome name="chevron-left" size={16} color={Theme.textMuted} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {getTripDisplayNumber(trip)}
          </Text>
          <Text style={styles.headerSubtitle}>Trip Details</Text>
          <Text style={styles.headerTripTypeLabel}>
            {displayAsAsset ? t("assetBasedTrip") : t("aggregateBasedTrip")}
          </Text>
          <Text
            style={[
              styles.headerTripOwnershipLabel,
              isAggregate ? styles.headerTripOwnershipLoadBased : styles.headerTripOwnershipOwn,
            ]}
          >
            {isAggregate ? "Load-based" : "Own"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={openAddEntry}
          style={styles.headerAction}
          activeOpacity={0.8}
          accessibilityLabel={t("addEntry")}
        >
          <SemanticAddIcon
            IconComponent={ReceiptText}
            iconSize={16}
            iconColor={Theme.textOnPrimary}
            badgeSize={16}
            badgeIconSize={11}
            badgeBackgroundColor={Theme.textOnPrimary}
            badgeIconColor={Theme.darkBackground}
            badgeOffsetX={-7}
            badgeOffsetY={-5}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: "#F9FAFB" }]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + 80 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Theme.textOnDark}
          />
        }
      >
          <TripDetailFinanceView
            trip={trip}
            tripLedgerEntries={tripLedgerEntries}
            adjustments={adjustments}
            viewerOrgId={currentOrganization?.id ?? null}
            assignmentAuditRows={assignmentAuditRows}
            assignmentDriverNames={assignmentDriverNames}
            assignmentVehicleLabels={assignmentVehicleLabels}
            tripOtp={tripOtp}
            partnerName={partnerName}
            driverName={driverName}
            driverRating={driverRatingAvg}
            vehicleLabel={
              isAggregate
                ? ((displayVehicleFromInput.trim() || vehicleLabel) ?? null)
                : vehicleLabel
            }
            onAddAdjustment={handleAddAdjustment}
            onRemoveAdjustment={handleRemoveAdjustment}
            currentUserId={currentUserId}
            isDriverOffline={isDriverOffline}
            onOpenTracking={() => setShowTrackingModal(true)}
          tripDocs={computedTripDocs}
          onOpenDoc={(doc) => setSelectedDoc(doc)}
          clientName={displayClientName}
          assignmentBlock={
            trip.organization_id ? (
              <TripAssignmentBlock
                trip={trip}
                organizationId={trip.organization_id}
                canAssign={canAssign}
                onUpdated={handleRefresh}
                driverName={driverName}
                vehicleLabel={
                  isAggregate
                    ? ((displayVehicleFromInput.trim() || vehicleLabel) ?? null)
                    : vehicleLabel
                }
                partnerName={isAggregate ? partnerName : undefined}
                assignmentSource={assignmentSource}
                currentUserId={currentUserId}
                showAssignByPhone={showAssignByPhone}
                onVehicleDisplayChange={setDisplayVehicleFromInput}
                previousDriverName={previousDriverName}
                latestReassignmentSummary={latestReassignmentSummary}
                viewOnly={isClientIndentView}
                driverAssignOrgId={showAssignByPhone ? currentOrganization?.id ?? undefined : undefined}
              />
            ) : null
          }
        />
        {tripCompleted && trip && currentOrganization?.id && (
          <TripRatingsBlock
            trip={trip}
            organizationId={currentOrganization.id}
            partnerName={partnerName}
            driverName={driverName}
            onRatingsLoaded={handleRatingsLoaded}
          />
        )}
      </ScrollView>

      <TripAdjustmentModal
        visible={showAdjustmentModal}
        onClose={() => setShowAdjustmentModal(false)}
        onSave={handleSaveAdjustment}
      />
      <ThemedAlertModal
        visible={showDriverRejectedModal}
        title={t("driverRejected")}
        message={t("driverRejectedNotify")}
        onOk={() => setShowDriverRejectedModal(false)}
        variant="warning"
      />

      {/* Full-screen Live Tracking view — light mode, tactical map + Driver's Activity Timeline */}
      <Modal
        visible={showTrackingModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowTrackingModal(false)}
      >
        <View
          style={[
            styles.container,
            styles.trackingPageContainer,
            { paddingTop: insets.top },
          ]}
        >
          {/* Header: back, Live Tracking + Real-time Connection Active, map icon */}
          <View style={styles.trackingPageHeader}>
            <TouchableOpacity
              onPress={() => setShowTrackingModal(false)}
              style={styles.trackingPageBackBtn}
              activeOpacity={0.8}
              accessibilityLabel={t("back")}
            >
              <FontAwesome
                name="chevron-left"
                size={18}
                color={Theme.textMuted}
              />
            </TouchableOpacity>
            <View style={styles.trackingPageTitleWrap}>
              <Text style={styles.trackingPageTitle}>Live Tracking</Text>
              <Text
                style={[
                  styles.trackingPageSubtitle,
                  isDriverOffline && styles.trackingPageSubtitleOffline,
                ]}
              >
                {isDriverOffline
                  ? "Driver Node Offline"
                  : "Real-time Connection Active"}
              </Text>
            </View>
            <View
              style={[
                styles.trackingPageMapIconWrap,
                isDriverOffline && styles.trackingPageIconWrapOffline,
              ]}
            >
              <FontAwesome
                name={isDriverOffline ? "exclamation-circle" : "map"}
                size={18}
                color={isDriverOffline ? Theme.negative : Theme.primary}
              />
            </View>
          </View>

          {isDriverOffline ? (
            <View
              style={[
                styles.driverOfflineRoot,
                { paddingBottom: 24 + insets.bottom },
              ]}
            >
              <View style={styles.driverOfflineContent}>
                <View style={styles.driverOfflineIconWrap}>
                  <FontAwesome
                    name="user-times"
                    size={48}
                    color={Theme.negative}
                  />
                </View>
                <Text style={styles.driverOfflineTitle}>Driver is Offline</Text>
                <Text style={styles.driverOfflineMessage}>
                  Assigned driver node is currently disconnected. Please ask the
                  driver to{" "}
                  <Text style={styles.driverOfflineMessageBold}>login</Text> and{" "}
                  <Text style={styles.driverOfflineMessageBold}>
                    accept the trip
                  </Text>{" "}
                  to activate journey tracking.
                </Text>
                <View style={styles.driverOfflineActions}>
                  <TouchableOpacity
                    style={styles.driverOfflineBtnPrimary}
                    onPress={() => setShowTrackingModal(false)}
                    activeOpacity={0.8}
                  >
                    <FontAwesome name="bell" size={16} color={Theme.primary} />
                    <Text style={styles.driverOfflineBtnPrimaryText}>
                      Send Login Reminder
                    </Text>
                  </TouchableOpacity>
                  {!isClientIndentView ? (
                    <TouchableOpacity
                      style={styles.driverOfflineBtnSecondary}
                      onPress={() => {
                        setShowTrackingModal(false);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.driverOfflineBtnSecondaryText}>
                        Re-assign Driver
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.driverOfflineProtocol}>
                  <FontAwesome name="lock" size={12} color={Theme.textMuted} />
                  <Text style={styles.driverOfflineProtocolText}>
                    Encrypted Grid Protocol v4.2
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.trackingModalScroll}
                contentContainerStyle={[
                  styles.trackingPageScrollContent,
                  { paddingBottom: 24 + insets.bottom },
                ]}
                showsVerticalScrollIndicator={false}
              >
                {/* Map area — constrained height so card sits above timeline without overlap */}
                <TrackingMapBlock
                  mapHeight={Math.min(Dimensions.get("window").height * 0.38, 300)}
                  vehicleLabel={vehicleLabel}
                  locationLabels={trackingMapLocationLabels}
                  originCoordinate={trackingMapOriginCoordinate}
                  destinationCoordinate={trackingMapDestinationCoordinate}
                  latestLocation={driverLocation}
                  driverLocationLoading={driverLocationLoading}
                  tripLocationPoints={tripLocationPoints}
                  locationAddress={driverLocationAddress}
                />

                {/* Vehicle card — below map, above Driver's Activity Timeline */}
                <VehicleTrackingCard
                  vehicleLabel={vehicleLabel}
                  cardStatusText={
                    driverLocationLoading
                      ? "Fetching from DB..."
                      : driverLocation
                        ? "LIVE"
                        : "No location in DB yet"
                  }
                  cardSubtext={
                    driverLocation
                      ? (driverLocationAddress
                          ? `${driverLocationAddress} · ${formatLocationUpdatedAt(driverLocation.recorded_at)}`
                          : `Current location (from DB): ${driverLocation.latitude.toFixed(5)}°, ${driverLocation.longitude.toFixed(5)}° · ${formatLocationUpdatedAt(driverLocation.recorded_at)}`)
                      : "Open map to see driver position"
                  }
                />

                {/* Driver's Activity Timeline — current step + log of assignment and status changes */}
                <View style={styles.trackingPageTimelineWrap}>
                  <View style={styles.trackingPageTimelineHeader}>
                    <FontAwesome
                      name="list-alt"
                      size={14}
                      color={Theme.primary}
                    />
                    <Text style={styles.trackingPageTimelineTitle}>
                      Driver's Activity Timeline
                    </Text>
                    <View style={styles.trackingPageLiveBadge}>
                      <Text style={styles.trackingPageLiveBadgeText}>
                        Live Updates
                      </Text>
                    </View>
                  </View>
                  {(() => {
                    const { step, label } = trackingStepAndLabel(trip.status);
                    return (
                      <View style={styles.trackingPageCurrentStepWrap}>
                        <Text style={styles.trackingPageCurrentStepLabel}>
                          Current step
                        </Text>
                        <Text style={styles.trackingPageCurrentStepValue}>
                          Step {step} of 4 — {label}
                        </Text>
                      </View>
                    );
                  })()}

                  {statusChangeRowsOnly.length > 0 && (
                    <View style={styles.trackingPageStatusChangesWrap}>
                      <Text style={styles.trackingPageStatusChangesTitle}>
                        Status changes
                      </Text>
                      {statusChangeRowsOnly.map((row, idx) => (
                        <View
                          key={row.id}
                          style={[
                            styles.trackingPageStatusChangeRow,
                            idx === statusChangeRowsOnly.length - 1 &&
                              styles.trackingPageStatusChangeRowLast,
                          ]}
                        >
                          <Text style={styles.trackingPageStatusChangeLabel}>
                            {row.status_label}
                          </Text>
                          <Text style={styles.trackingPageStatusChangeTime}>
                            {formatAssignmentDate(row.changed_at)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.trackingPageTimelineList}>
                    {driverActivityTimelineRows.length === 0 ? (
                      <View style={styles.trackingPageTimelineEmpty}>
                        <FontAwesome
                          name="bolt"
                          size={32}
                          color={Theme.textMuted}
                        />
                        <Text style={styles.trackingActivityEmpty}>
                          No log data recorded
                        </Text>
                      </View>
                    ) : (
                      <>
                        <View style={styles.trackingPageTimelineLine} />
                        {driverActivityTimelineRows.map((item, idx) => {
                          const itemId = timelineItemId(item);
                          const isExpanded = !!expandedTimelineEntryIds[itemId];
                          if (item.kind === "status") {
                            const dateStr = formatAssignmentDate(item.changed_at);
                            const statusEventLabel =
                              item.status_context === "completed"
                                ? "Delivery completed"
                                : item.status_context === "in_transit"
                                  ? "Movement update"
                                  : "Driver status change";
                            return (
                              <View key={item.id} style={styles.trackingPageTimelineItem}>
                                <View
                                  style={[
                                    styles.trackingPageTimelineDot,
                                    idx === 0 && styles.trackingPageTimelineDotActive,
                                  ]}
                                >
                                  {idx === 0 ? (
                                    <View style={styles.trackingPageTimelineDotInner} />
                                  ) : null}
                                </View>
                                <View
                                  style={[
                                    styles.trackingPageTimelineItemBody,
                                    idx < driverActivityTimelineRows.length - 1 && styles.trackingPageTimelineItemBorder,
                                  ]}
                                >
                                  <TouchableOpacity
                                    style={styles.trackingPageTimelineItemRow}
                                    activeOpacity={0.85}
                                    onPress={() => toggleTimelineItemExpanded(itemId)}
                                  >
                                    <View style={styles.trackingPageTimelineItemLeft}>
                                      <Text
                                        style={[
                                          styles.trackingPageTimelineLocation,
                                          idx === 0 && styles.trackingPageTimelineLocationActive,
                                        ]}
                                        numberOfLines={2}
                                      >
                                        {item.status_label}
                                      </Text>
                                      <Text style={styles.trackingPageTimelineCoords}>{statusEventLabel}</Text>
                                    </View>
                                    <View style={styles.trackingPageTimelineTimeBadge}>
                                      <Text style={styles.trackingPageTimelineTimeText}>{dateStr}</Text>
                                    </View>
                                  </TouchableOpacity>
                                  <View style={styles.trackingPageTimelineStatusRow}>
                                    <View
                                      style={[
                                        styles.trackingPageTimelineStatusBadge,
                                        idx === 0 && styles.trackingPageTimelineStatusBadgeActive,
                                      ]}
                                    >
                                      <View
                                        style={[
                                          styles.trackingPageTimelineStatusDot,
                                          idx === 0 && styles.trackingPageTimelineStatusDotActive,
                                        ]}
                                      />
                                      <Text
                                        style={[
                                          styles.trackingPageTimelineStatusText,
                                          idx === 0 && styles.trackingPageTimelineStatusTextActive,
                                        ]}
                                        numberOfLines={1}
                                      >
                                        {item.status_label}
                                      </Text>
                                    </View>
                                    <Text style={styles.trackingPageTimelineNode} numberOfLines={1}>
                                      {dateStr}
                                    </Text>
                                  </View>
                                  {isExpanded ? (
                                    <View style={styles.trackingPageTimelineExpandedPanel}>
                                      <Text style={styles.trackingPageTimelineExpandedTitle}>
                                        Activity details
                                      </Text>
                                      <Text style={styles.trackingPageTimelineExpandedLine}>
                                        Event: {item.status_label}
                                      </Text>
                                      <Text style={styles.trackingPageTimelineExpandedLine}>
                                        Context: {item.detail_line}
                                      </Text>
                                      <Text style={styles.trackingPageTimelineExpandedLine}>
                                        Recorded at: {dateStr}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                            );
                          }
                          const row = item.row;
                          const eventLabel = row.event_type === "reassignment" ? "Reassignment" : "Assignment";
                          const dateStr = formatAssignmentDate(row.changed_at);
                          const byLabel =
                            row.changed_by != null
                              ? row.changed_by === currentUserId
                                ? " • BY YOU"
                                : " • BY DISPATCHER"
                              : "";
                          const isFallback = row.id === "fallback";
                          const driverPrev =
                            !isFallback && row.driver_id_prev
                              ? (assignmentDriverNames[row.driver_id_prev] ?? row.driver_id_prev)
                              : null;
                          const driverNew = row.driver_id_new
                            ? (assignmentDriverNames[row.driver_id_new] ??
                               (isFallback ? driverName ?? null : row.driver_id_new))
                            : null;
                          const vehiclePrev =
                            !isFallback && row.vehicle_id_prev
                              ? (assignmentVehicleLabels[row.vehicle_id_prev] ?? row.vehicle_id_prev)
                              : null;
                          const vehicleNew = row.vehicle_id_new
                            ? (assignmentVehicleLabels[row.vehicle_id_new] ??
                               (isFallback ? vehicleLabel ?? null : row.vehicle_id_new))
                            : isFallback && (trip.vehicle_display_number ?? "").trim()
                              ? (trip.vehicle_display_number ?? "").trim()
                              : null;
                          const driverLine =
                            driverPrev != null && driverNew != null
                              ? `Driver: ${driverPrev} → ${driverNew}`
                              : driverNew != null
                                ? `Driver: ${driverNew}`
                                : driverPrev != null
                                  ? `Driver: ${driverPrev} (removed)`
                                  : null;
                          const vehicleLine =
                            vehiclePrev != null && vehicleNew != null
                              ? `Vehicle: ${vehiclePrev} → ${vehicleNew}`
                              : vehicleNew != null
                                ? `Vehicle: ${vehicleNew}`
                                : vehiclePrev != null
                                  ? `Vehicle: ${vehiclePrev} (removed)`
                                  : null;
                          const detail = [driverLine, vehicleLine].filter(Boolean).join("  ·  ");
                          const locationLabel = detail || eventLabel;
                          return (
                            <View key={row.id} style={styles.trackingPageTimelineItem}>
                              <View
                                style={[
                                  styles.trackingPageTimelineDot,
                                  idx === 0 && styles.trackingPageTimelineDotActive,
                                ]}
                              >
                                {idx === 0 ? (
                                  <View style={styles.trackingPageTimelineDotInner} />
                                ) : null}
                              </View>
                              <View
                                style={[
                                  styles.trackingPageTimelineItemBody,
                                  idx < driverActivityTimelineRows.length - 1 && styles.trackingPageTimelineItemBorder,
                                ]}
                              >
                                <TouchableOpacity
                                  style={styles.trackingPageTimelineItemRow}
                                  activeOpacity={0.85}
                                  onPress={() => toggleTimelineItemExpanded(itemId)}
                                >
                                  <View style={styles.trackingPageTimelineItemLeft}>
                                    <Text
                                      style={[
                                        styles.trackingPageTimelineLocation,
                                        idx === 0 && styles.trackingPageTimelineLocationActive,
                                      ]}
                                      numberOfLines={2}
                                    >
                                      {locationLabel}
                                    </Text>
                                    <Text style={styles.trackingPageTimelineCoords}>{eventLabel} @ node</Text>
                                  </View>
                                  <View style={styles.trackingPageTimelineTimeBadge}>
                                    <Text style={styles.trackingPageTimelineTimeText}>{dateStr}</Text>
                                  </View>
                                </TouchableOpacity>
                                <View style={styles.trackingPageTimelineStatusRow}>
                                  <View
                                    style={[
                                      styles.trackingPageTimelineStatusBadge,
                                      idx === 0 &&
                                        styles.trackingPageTimelineStatusBadgeActive,
                                    ]}
                                  >
                                    <View
                                      style={[
                                        styles.trackingPageTimelineStatusDot,
                                        idx === 0 &&
                                          styles.trackingPageTimelineStatusDotActive,
                                      ]}
                                    />
                                    <Text
                                      style={[
                                        styles.trackingPageTimelineStatusText,
                                        idx === 0 &&
                                          styles.trackingPageTimelineStatusTextActive,
                                      ]}
                                    >
                                      {eventLabel} confirmed
                                    </Text>
                                  </View>
                                  <Text style={styles.trackingPageTimelineNode}>
                                    {dateStr}
                                    {byLabel}
                                  </Text>
                                </View>
                                {isExpanded ? (
                                  <View style={styles.trackingPageTimelineExpandedPanel}>
                                    <Text style={styles.trackingPageTimelineExpandedTitle}>
                                      Activity details
                                    </Text>
                                    <Text style={styles.trackingPageTimelineExpandedLine}>
                                      Event type: {eventLabel}
                                    </Text>
                                    <Text style={styles.trackingPageTimelineExpandedLine}>
                                      Driver update: {driverLine ?? "No driver change recorded"}
                                    </Text>
                                    <Text style={styles.trackingPageTimelineExpandedLine}>
                                      Vehicle update: {vehicleLine ?? "No vehicle change recorded"}
                                    </Text>
                                    <Text style={styles.trackingPageTimelineExpandedLine}>
                                      Updated by: {byLabel ? byLabel.replace(" • ", "") : "System"}
                                    </Text>
                                    <Text style={styles.trackingPageTimelineExpandedLine}>
                                      Recorded at: {dateStr}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </>
                    )}
                  </View>
                </View>
              </ScrollView>
            </>
          )}

          <View
            style={[
              styles.trackingModalFooter,
              styles.trackingPageFooter,
              { paddingBottom: 16 + insets.bottom },
            ]}
          >
            <TouchableOpacity
              onPress={() => setShowTrackingModal(false)}
              style={[styles.trackingModalCloseBtn, styles.trackingPageDoneBtn]}
              activeOpacity={0.8}
            >
              <FontAwesome name="shield" size={18} color={Theme.primary} />
              <Text style={styles.trackingModalCloseText}>Done Viewing Timeline</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full-screen location view (schematic, no MapView) — opened from Live Tracking expand button */}
      <Modal
        visible={showFullScreenMap}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowFullScreenMap(false)}
        statusBarTranslucent
        supportedOrientations={["portrait", "landscape"]}
      >
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              width: Dimensions.get("window").width,
              height: Dimensions.get("window").height,
            },
          ]}
        >
          <LinearGradient
            colors={["rgba(67,56,202,0.04)", "rgba(67,56,202,0.08)", "rgba(67,56,202,0.04)"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.trackingMapLine, styles.trackingMapLine1]} />
          <View style={[styles.trackingMapLine, styles.trackingMapLine2]} />
          <View style={[styles.trackingMapLine, styles.trackingMapLine3]} />
          <View style={[styles.trackingMapDotWrap, styles.trackingMapDotOrigin]}>
            <View style={[styles.trackingMapDot, styles.trackingMapDotIndigo]} />
            <Text style={styles.trackingMapDotLabel} numberOfLines={1}>
              {(trip?.pickup_area ?? "Origin").trim() || "Start"}
            </Text>
          </View>
          <View style={[styles.trackingMapDotWrap, styles.trackingMapDotW1]}>
            <View style={[styles.trackingMapDot, styles.trackingMapDotIndigo]} />
            <Text style={styles.trackingMapDotLabel} numberOfLines={1}>Waypoint 1</Text>
          </View>
          <View style={[styles.trackingMapDotWrap, styles.trackingMapDotW2]}>
            <View style={[styles.trackingMapDot, styles.trackingMapDotIndigo]} />
            <Text style={styles.trackingMapDotLabel} numberOfLines={1}>Waypoint 2</Text>
          </View>
          <View style={[styles.trackingMapDotWrap, styles.trackingMapDotCurrent]}>
            <View style={[styles.trackingMapDot, styles.trackingMapDotCurrentInner]} />
            <Text style={styles.trackingMapDotLabelCurrent} numberOfLines={1}>
              {(trip?.drop_location ?? "Current Node").trim() || "Current Node"}
            </Text>
          </View>
          {driverLocation ? (
            <View style={[styles.trackingMapDotWrap, styles.fullScreenDriverDotWrap]}>
              <View style={[styles.trackingMapDot, styles.trackingMapDotCurrentInner]} />
              <Text style={styles.trackingMapDotLabelCurrent} numberOfLines={1}>Driver</Text>
              <Text style={styles.fullScreenDriverCoords} numberOfLines={1}>
                {driverLocationAddress
                  ? driverLocationAddress
                  : `${driverLocation.latitude.toFixed(5)}°, ${driverLocation.longitude.toFixed(5)}°`}
              </Text>
              <Text style={styles.fullScreenDriverUpdated}>
                {formatLocationUpdatedAt(driverLocation.recorded_at)}
              </Text>
            </View>
          ) : driverLocationLoading ? (
            <View style={[styles.trackingMapDotWrap, styles.fullScreenDriverDotWrap]}>
              <Text style={styles.fullScreenDriverUpdated}>Fetching location…</Text>
            </View>
          ) : null}
          <View style={[styles.fullScreenMapLocationCard, { bottom: 24 + insets.bottom }]}>
            <Text style={styles.fullScreenMapLocationCardTitle}>Live location</Text>
            <Text style={styles.fullScreenMapLocationCardText} numberOfLines={2}>
              {driverLocation
                ? (driverLocationAddress
                    ? `${driverLocationAddress} · ${formatLocationUpdatedAt(driverLocation.recorded_at)}`
                    : `Current position: ${driverLocation.latitude.toFixed(5)}°, ${driverLocation.longitude.toFixed(5)}° · ${formatLocationUpdatedAt(driverLocation.recorded_at)}`)
                : driverLocationLoading
                  ? "Fetching from DB…"
                  : "No location in DB yet"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowFullScreenMap(false)}
            style={[styles.fullScreenMapCloseBtn, { top: insets.top + 12 }]}
            activeOpacity={0.8}
            accessibilityLabel="Close full screen map"
          >
            <FontAwesome name="times" size={20} color={Theme.primary} />
            <Text style={styles.fullScreenMapCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Doc preview — opened from Documents section */}
      <Modal
        visible={!!selectedDoc}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedDoc(null)}
      >
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.docModalHeader}>
            <TouchableOpacity
              onPress={() => setSelectedDoc(null)}
              style={styles.docModalBack}
              activeOpacity={0.8}
            >
              <FontAwesome
                name="times"
                size={18}
                color={Theme.textPrimaryDark}
              />
            </TouchableOpacity>
            <View style={styles.docModalTitleWrap}>
              <Text style={styles.docModalTitle}>
                {isVehicleGalleryDoc ? "Vehicle Documents" : selectedDoc?.label ?? "Document"}
              </Text>
              <Text style={styles.docModalSubtitle}>
                {isVehicleGalleryDoc
                  ? activeVehiclePreviewDoc
                    ? `${vehiclePreviewIndex + 1}/${vehiclePreviewDocs.length} · ${activeVehiclePreviewDoc.label}`
                    : "Preview"
                  : "Preview"}
              </Text>
            </View>
            <View style={styles.docModalIcon}>
              <FontAwesome name="download" size={16} color={Theme.primary} />
            </View>
          </View>
          <View style={styles.docModalContent}>
            {docPreviewLoading ? (
              <View style={styles.docModalPlaceholder}>
                <ActivityIndicator size="large" color={Theme.primary} />
                <Text style={styles.docModalPlaceholderText}>Loading preview…</Text>
              </View>
            ) : isVehicleGalleryDoc ? (
              vehiclePreviewDocs.length > 0 ? (
                <>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(event) => {
                      const pageWidth = event.nativeEvent.layoutMeasurement.width;
                      if (pageWidth <= 0) return;
                      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
                      setVehiclePreviewIndex(
                        Math.max(0, Math.min(nextIndex, vehiclePreviewDocs.length - 1)),
                      );
                    }}
                  >
                    {vehiclePreviewDocs.map((doc) => {
                      const previewUrl = vehiclePreviewUrls[doc.id] ?? null;
                      const isPdf = doc.type === "PDF";
                      const expiryLabel = getDocumentExpiryLabel(doc.expiryDate);
                      const expiryState = getDocumentExpiryState(doc.expiryDate);

                      return (
                        <View key={doc.id} style={styles.docGallerySlide}>
                          <View style={styles.docGalleryMeta}>
                            <View style={styles.docGalleryMetaLeft}>
                              <Text style={styles.docGalleryLabel}>{doc.label}</Text>
                              <Text style={styles.docGalleryType}>
                                {doc.type} · {doc.status}
                              </Text>
                            </View>
                            {expiryLabel ? (
                              <Text
                                style={[
                                  styles.docGalleryExpiry,
                                  expiryState === "valid" && styles.docGalleryExpiryValid,
                                  expiryState === "expiringSoon" && styles.docGalleryExpiryWarning,
                                  expiryState === "expired" && styles.docGalleryExpiryExpired,
                                ]}
                              >
                                {expiryLabel}
                              </Text>
                            ) : null}
                          </View>
                          {previewUrl && !isPdf ? (
                            <Image
                              source={{ uri: previewUrl }}
                              style={styles.docModalImage}
                              resizeMode="contain"
                            />
                          ) : previewUrl ? (
                            <View style={styles.docModalPlaceholder}>
                              <FontAwesome name="file-pdf-o" size={56} color={Theme.primary} />
                              <Text style={styles.docModalPlaceholderText}>{doc.label}</Text>
                              <Text style={styles.docModalPlaceholderHint}>
                                PDF uploaded for this vehicle document
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.docModalPlaceholder}>
                              <FontAwesome name="file-text-o" size={64} color={Theme.surfaceGray} />
                              <Text style={styles.docModalPlaceholderText}>{doc.label}</Text>
                              <Text style={styles.docModalPlaceholderHint}>
                                No document uploaded yet
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                  {vehiclePreviewDocs.length > 1 ? (
                    <View style={styles.docGalleryDots}>
                      {vehiclePreviewDocs.map((doc, index) => (
                        <View
                          key={doc.id}
                          style={[
                            styles.docGalleryDot,
                            index === vehiclePreviewIndex
                              ? styles.docGalleryDotActive
                              : styles.docGalleryDotInactive,
                          ]}
                        />
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.docModalPlaceholder}>
                  <FontAwesome name="file-text-o" size={64} color={Theme.surfaceGray} />
                  <Text style={styles.docModalPlaceholderText}>Vehicle Documents</Text>
                  <Text style={styles.docModalPlaceholderHint}>
                    No document uploaded yet
                  </Text>
                </View>
              )
            ) : docPreviewUrl ? (
              <Image
                source={{ uri: docPreviewUrl }}
                style={styles.docModalImage}
                resizeMode="contain"
              />
            ) : docPreviewError ? (
              <View style={styles.docModalPlaceholder}>
                <FontAwesome name="exclamation-triangle" size={48} color={Theme.textMuted} />
                <Text style={styles.docModalPlaceholderText}>Failed to load preview</Text>
              </View>
            ) : (
              <View style={styles.docModalPlaceholder}>
                <FontAwesome name="file-text-o" size={64} color={Theme.surfaceGray} />
                <Text style={styles.docModalPlaceholderText}>
                  {selectedDoc?.type ?? "—"} · {selectedDoc?.status ?? "—"}
                </Text>
                <Text style={styles.docModalPlaceholderHint}>
                  No document uploaded yet
                </Text>
              </View>
            )}
          </View>
          <View
            style={[
              styles.docModalFooter,
              { paddingBottom: 16 + insets.bottom },
            ]}
          >
            <TouchableOpacity
              onPress={() => setSelectedDoc(null)}
              style={styles.docModalCloseBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.docModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatAssignmentDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return (iso as string).slice(0, 16).replace("T", " ") || "—";
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screenBackground },
  assignmentBlockWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 16,
  },
  errorText: { fontSize: 15, color: Theme.textSecondary },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: Theme.primary,
    borderRadius: 8,
  },
  retryBtnText: { fontSize: 15, color: Theme.textOnPrimary, fontWeight: "600" },
  darkBlock: {
    backgroundColor: Theme.darkBackground,
    width: "100%",
    paddingBottom: 4,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: Theme.surfaceGray,
  },
  headerCenter: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  headerTripTypeLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerTripOwnershipLabel: {
    fontSize: 8,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerTripOwnershipOwn: {
    color: Theme.primary,
  },
  headerTripOwnershipLoadBased: {
    color: Theme.darkGreen,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.darkBackground,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
  },
  trackingModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  trackingModalHeaderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.darkBackground,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  trackingModalTitleWrap: { flex: 1, minWidth: 0 },
  trackingModalTitle: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  trackingModalSubtitle: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1.2,
    marginTop: 2,
    textTransform: "uppercase",
  },
  trackingModalHeaderCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.darkBackground,
  },
  // --- Live Tracking page (new UI) ---
  trackingPageContainer: {
    backgroundColor: "#F9FAFB",
  },
  trackingPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  trackingPageBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
  },
  trackingPageTitleWrap: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  trackingPageTitle: {
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
  },
  trackingPageSubtitle: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.positive,
    letterSpacing: 1,
    marginTop: 4,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  trackingPageMapIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.fiscalTabActiveBg ?? "#e8eaf6",
    alignItems: "center",
    justifyContent: "center",
  },
  trackingPageSubtitleOffline: {
    color: Theme.negative,
  },
  trackingPageIconWrapOffline: {
    backgroundColor: Theme.positiveMuted ?? "#fef2f2",
  },
  driverOfflineRoot: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
    justifyContent: "center",
  },
  driverOfflineContent: {
    alignItems: "center",
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    minWidth: 0,
  },
  driverOfflineIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  driverOfflineTitle: {
    fontSize: 20,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.5,
    marginBottom: 16,
    textAlign: "center",
  },
  driverOfflineMessage: {
    fontSize: 11,
    color: Theme.textSecondary,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  driverOfflineMessageBold: {
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  driverOfflineActions: {
    width: "100%",
    gap: 12,
  },
  driverOfflineBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Theme.darkBackground,
    paddingVertical: 18,
    borderRadius: 12,
    marginBottom: 12,
  },
  driverOfflineBtnPrimaryText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textOnDark,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  driverOfflineBtnSecondary: {
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  driverOfflineBtnSecondaryText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  driverOfflineProtocol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 32,
    opacity: 0.5,
  },
  driverOfflineProtocolText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  trackingPageScrollContent: {
    paddingBottom: 24,
  },
  trackingMapLine: {
    position: "absolute",
    height: 0,
    borderBottomWidth: 2,
    borderBottomColor: Theme.primary,
    ...(Platform.OS === "android" ? { borderStyle: "dashed" as const } : {}),
    opacity: 0.5,
  },
  trackingMapLine1: {
    width: "38%",
    left: "5%",
    top: "41%",
    transform: [{ rotate: "-51deg" }],
  },
  trackingMapLine2: {
    width: "28%",
    left: "34%",
    top: "34%",
    transform: [{ rotate: "34deg" }],
  },
  trackingMapLine3: {
    width: "45%",
    left: "49%",
    top: "22%",
    transform: [{ rotate: "-58deg" }],
  },
  trackingMapDotWrap: {
    position: "absolute",
    alignItems: "center",
  },
  trackingMapDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trackingMapDotIndigo: {
    backgroundColor: Theme.primary,
    opacity: 0.8,
  },
  trackingMapDotOrigin: { left: "10%", top: "55%" },
  trackingMapDotW1: { left: "34%", top: "25%" },
  trackingMapDotW2: { left: "58%", top: "41%" },
  trackingMapDotCurrent: { left: "82%", top: "3%" },
  trackingMapDotCurrentInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.primary,
  },
  trackingMapDotLabel: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "700",
    color: Theme.primary,
    fontStyle: "italic",
    maxWidth: 72,
    textAlign: "center",
  },
  trackingMapDotLabelCurrent: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "700",
    color: Theme.primary,
    fontStyle: "italic",
    maxWidth: 72,
    textAlign: "center",
  },
  trackingPageTimelineWrap: {
    marginTop: 20,
    backgroundColor: Theme.screenBackground,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 24,
    paddingBottom: 24,
    minHeight: 320,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  trackingPageTimelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  trackingPageTimelineTitle: {
    flex: 1,
    marginLeft: 8,
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontStyle: "italic",
  },
  trackingPageLiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  trackingPageLiveBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  trackingPageCurrentStepWrap: {
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  trackingPageCurrentStepLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  trackingPageCurrentStepValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.primary,
  },
  trackingPageStatusChangesWrap: {
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  trackingPageStatusChangesTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  trackingPageStatusChangeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  trackingPageStatusChangeLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  trackingPageStatusChangeTime: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    flexShrink: 0,
  },
  trackingPageStatusChangeRowLast: {
    borderBottomWidth: 0,
  },
  trackingPageTimelineList: {
    position: "relative",
    paddingLeft: 4,
  },
  trackingPageTimelineLine: {
    position: "absolute",
    left: 13,
    top: 8,
    bottom: 24,
    width: 2,
    backgroundColor: Theme.borderLight,
  },
  trackingPageTimelineEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  trackingPageTimelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 8,
  },
  trackingPageTimelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    zIndex: 1,
  },
  trackingPageTimelineDotActive: {
    backgroundColor: Theme.positive,
    borderColor: Theme.positive,
  },
  trackingPageTimelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.screenBackground,
  },
  trackingPageTimelineItemBody: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 24,
  },
  trackingPageTimelineItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  trackingPageTimelineItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  trackingPageTimelineItemLeft: { flex: 1, minWidth: 0 },
  trackingPageTimelineLocation: {
  fontSize: 11,
  fontWeight: "700",
  fontStyle: "italic",
  color: Theme.textMuted,
  textTransform: "uppercase",
  },
  trackingPageTimelineLocationActive: {
    color: Theme.textPrimaryDark,
  },
  trackingPageTimelineCoords: {
  fontSize: 7,
  fontWeight: "500",
  color: Theme.primary,
  letterSpacing: 0.6,
  marginTop: 4,
  textTransform: "uppercase",
  },
  trackingPageTimelineTimeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 4,
    flexShrink: 0,
    marginLeft: 8,
  },
  trackingPageTimelineTimeText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  trackingPageTimelineStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  trackingPageTimelineStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Theme.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "75%",
  },
  trackingPageTimelineStatusBadgeActive: {
    borderColor: Theme.positiveMuted,
  },
  trackingPageTimelineStatusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.textMuted,
  },
  trackingPageTimelineStatusDotActive: {
    backgroundColor: Theme.positive,
  },
  trackingPageTimelineStatusText: {
  fontSize: 8,
  fontWeight: "600",
  fontStyle: "italic",
  color: Theme.textMuted,
  textTransform: "uppercase",
  },
  trackingPageTimelineStatusTextActive: {
    color: Theme.positive,
  },
  trackingPageTimelineNode: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textSection,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flexShrink: 0,
    marginLeft: 8,
  },
  trackingPageTimelineExpandedPanel: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    gap: 4,
  },
  trackingPageTimelineExpandedTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  trackingPageTimelineExpandedLine: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    lineHeight: 14,
  },
  trackingPageFooter: {
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 8,
  },
  trackingPageDoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  trackingMapArea: {
    height: 280,
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 16,
    marginBottom: 0,
  backgroundColor: "rgba(67,56,202,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(67,56,202,0.12)",
    overflow: "hidden",
    position: "relative",
  },
  trackingMapDotted: {
    position: "absolute",
    left: 24,
    right: 24,
    top: 48,
    bottom: 80,
    ...(Platform.OS === "android" ? { borderStyle: "dashed" as const } : {}),
  borderWidth: 4,
  borderColor: Theme.primaryLight,
  borderRadius: 12,
  opacity: 0.9,
  },
  trackingMapNodeCard: {
    position: "absolute",
    left: Layout.screenPaddingHorizontal,
    right: Layout.screenPaddingHorizontal,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  trackingSummaryCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  trackingSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  trackingSummaryLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  trackingSummaryId: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  trackingSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  trackingSummaryCaption: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  trackingSummaryValue: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginLeft: 12,
    flex: 1,
    textAlign: "right",
  },
  trackingSummaryFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 10,
  },
  trackingSummaryStatus: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  trackingSummaryAmountBlock: { alignItems: "flex-end" },
  trackingSummaryAmount: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  trackingAssignCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  trackingAssignHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  trackingAssignTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  trackingAssignRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  trackingAssignIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  trackingAssignBody: { flex: 1, minWidth: 0 },
  trackingAssignLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
  },
  trackingAssignValue: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  trackingAssignMetaRow: {
    marginTop: 6,
  },
  trackingAssignMetaLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  trackingAssignMetaValue: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  trackingModalScroll: { flex: 1, backgroundColor: "#F9FAFB" },
  trackingMapPlaceholder: {
    height: 200,
    margin: Layout.screenPaddingHorizontal,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    ...(Platform.OS === "android" ? { borderStyle: "dashed" as const } : {}),
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  trackingMapRoute: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  trackingMapVehicle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  trackingMapDriver: { fontSize: 10, color: Theme.textSecondary },
  trackingActivityWrap: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    marginTop: 24,
    padding: 16,
    backgroundColor: Theme.screenBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  trackingActivitySectionLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.8,
    fontStyle: "italic",
    textTransform: "uppercase",
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(67,56,202,0.15)",
  },
  trackingActivityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  trackingActivityTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  trackingActivityEmpty: {
    fontSize: 11,
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  trackingActivityRow: { flexDirection: "row", marginBottom: 4 },
  trackingActivityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.surfaceGray,
    borderWidth: 2,
    borderColor: Theme.borderLight,
    marginRight: 12,
    marginTop: 4,
  },
  trackingActivityDotActive: {
    backgroundColor: Theme.darkGreen,
    borderColor: Theme.darkGreen,
  },
  trackingActivityLine: {
    position: "absolute",
    left: 4,
    top: 18,
    width: 2,
    height: "100%",
    backgroundColor: Theme.borderLight,
  },
  trackingActivityBody: { flex: 1, minWidth: 0 },
  trackingActivityRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  trackingActivityLocation: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  trackingActivityLocationActive: {
    color: Theme.textPrimaryDark,
  },
  trackingActivityTime: { fontSize: 10, color: Theme.textMuted, marginTop: 2 },
  trackingActivityDetail: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginTop: 4,
  },
  trackingModalFooter: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  fullScreenMapCloseBtn: {
    position: "absolute",
    left: Layout.screenPaddingHorizontal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "rgba(67,56,202,0.2)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
  },
  fullScreenMapCloseText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.primary,
  },
  fullScreenDriverDotWrap: {
    left: "50%",
    top: "70%",
    marginLeft: -36,
    alignItems: "center",
  },
  fullScreenDriverCoords: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    maxWidth: 200,
    textAlign: "center",
  },
  fullScreenDriverUpdated: {
    marginTop: 2,
    fontSize: 9,
    color: Theme.textMuted,
  },
  fullScreenMapLocationCard: {
    position: "absolute",
    left: Layout.screenPaddingHorizontal,
    right: Layout.screenPaddingHorizontal,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(67,56,202,0.15)",
    zIndex: 10,
  },
  fullScreenMapLocationCardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fullScreenMapLocationCardText: {
    fontSize: 13,
    color: Theme.textSecondary,
  },
  trackingModalCloseBtn: {
    alignSelf: "stretch",
    backgroundColor: Theme.darkBackground,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  trackingModalCloseText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnDark,
    textTransform: "uppercase",
  },
  docModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
  },
  docModalBack: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  docModalTitleWrap: { flex: 1, alignItems: "center" },
  docModalTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  docModalSubtitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    marginTop: 2,
  },
  docModalIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  docModalContent: { flex: 1, backgroundColor: "#F9FAFB" },
  docGallerySlide: {
    width: Dimensions.get("window").width,
    flex: 1,
  },
  docGalleryMeta: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    gap: 12,
  },
  docGalleryMetaLeft: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  docGalleryLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  docGalleryType: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  docGalleryExpiry: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
    flexShrink: 0,
    maxWidth: "46%",
  },
  docGalleryExpiryValid: {
    color: Theme.positive,
  },
  docGalleryExpiryWarning: {
    color: Theme.warning,
  },
  docGalleryExpiryExpired: {
    color: Theme.negative,
  },
  docModalImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  docModalPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  docModalPlaceholderText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  docModalPlaceholderHint: { fontSize: 10, color: Theme.textSecondary },
  docGalleryDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: 16,
  },
  docGalleryDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  docGalleryDotActive: {
    width: 18,
    backgroundColor: Theme.primary,
  },
  docGalleryDotInactive: {
    backgroundColor: Theme.borderLight,
  },
  docModalFooter: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
    backgroundColor: Theme.screenBackground,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  docModalCloseBtn: {
    backgroundColor: Theme.darkBackground,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  docModalCloseText: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textOnDark,
    textTransform: "uppercase",
  },
});
