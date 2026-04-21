/**
 * Core data hook for TripDetailScreen.
 * Extracts all state, data loading, side effects, and computed values
 * from the 5k-line monolith so the screen component stays thin.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getClientById } from "@/features/clients/services/clients.service";
import {
  getDriverById,
  getDriverProfileDisplay,
} from "@/features/drivers/services/drivers.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { averageScore, getRatingsForTrip } from "@/features/ratings/services/ratings.service";
import {
  getSupplierById,
  getSupplierDetails,
} from "@/features/suppliers/services/suppliers.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import {
  DOCUMENT_EXPIRY_ORDER,
  DOCUMENT_LABELS,
} from "@/features/vehicles/utils/vehicleDocuments.util";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { canAssignTrip, getCapabilitiesFromProfile } from "@/lib/capabilities";
import { isAggregateTrip } from "@/lib/driverUtils";
import { formatIndianVehicleNumber } from "@/lib/format";
import {
  useShipperDisplayNamesQuery,
  useTransactionsQuery,
  useTripSubcontractsQuery,
} from "@/lib/queries";
import * as driverLocationService from "@/services/driverLocationService";
import * as tripDocumentsService from "@/services/tripDocumentsService";
import {
  acceptPartnerView,
  createDispute,
  getDisputesForPartner,
  getDisputesReceived,
  getSharedLedgerEntriesForPartner,
  resolveDispute,
  resolveDisputeTableOnly,
} from "@/services/sharedLedgerService";
import type { DisputeRow } from "@/services/sharedLedgerService";
import type * as ExpoLocationTypes from "expo-location";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRealtimeTrip } from "../../../hooks/useRealtimeTrips";
import {
  clearInitialTripForDetail,
  getInitialTripForDetail,
} from "../../../initialTripForDetail";
import type { TripAssignmentAuditRow } from "../../../services/trip-assignment-audit.service";
import { getTripAssignmentAuditHistory } from "../../../services/trip-assignment-audit.service";
import type { TripAdjustment } from "../../../services/tripAdjustments";
import {
  addTripAdjustment,
  getTripAdjustments,
  removeTripAdjustment,
} from "../../../services/tripAdjustments";
import { getTripOtpForDisplay } from "../../../services/tripOtp.service";
import {
  getTripById,
  getTripDisplayNumber,
  getTripsWhereOrgIsSupplier,
  isTripCompleted,
  type TripRow,
} from "../../../services/trips.service";
import type { AssignmentSource } from "../../TripAssignmentBlock";
import type {
  ReconciliationPartyInfo,
  TripDetailTab,
  TripDocItem,
} from "../TripDetailFinanceView";

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

function docTypeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "heic" || ext === "heif") return "HEIC";
  if (ext === "jpg" || ext === "jpeg") return "JPG";
  if (ext === "png") return "PNG";
  if (ext === "pdf") return "PDF";
  return ext ? ext.toUpperCase() : "JPG";
}

export interface VehiclePreviewDoc {
  id: string;
  label: string;
  type: string;
  status: "Uploaded" | "Pending";
  storagePath?: string;
  expiryDate?: string | null;
}

export type DriverActivityTimelineRow =
  | { kind: "assignment"; row: TripAssignmentAuditRow }
  | {
      kind: "status";
      id: string;
      status_label: string;
      changed_at: string;
      status_context: "started" | "in_transit" | "completed";
      detail_line: string;
    };

export interface UseTripDetailOptions {
  tripId: string;
  entryContext?: "supplier" | "vehicle" | "client";
  clientIdFromContext?: string;
  clientNameFromContext?: string;
  onBack: () => void;
}

export function useTripDetail({
  tripId,
  entryContext,
  clientIdFromContext,
  clientNameFromContext,
  onBack,
}: UseTripDetailOptions) {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, user } = useAuth();
  const { currentOrganization } = useOrganization();

  // ── Trip data ─────────────────────────────────────────────────────────────
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Assignment / driver / vehicle ─────────────────────────────────────────
  const [driverName, setDriverName] = useState<string | null>(null);
  const [driverAvatarUri, setDriverAvatarUri] = useState<string | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);
  const [vehicleDocs, setVehicleDocs] = useState<VehicleDocuments | null>(null);
  const [displayVehicleFromInput, setDisplayVehicleFromInput] = useState("");
  const [driverLinked, setDriverLinked] = useState(false);

  // ── Partner / supplier / client ───────────────────────────────────────────
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [counterpartyIntegrated, setCounterpartyIntegrated] = useState<boolean | null>(null);
  const [partnerOrgId, setPartnerOrgId] = useState<string | null>(null);
  const [clientPartyRes, setClientPartyRes] = useState<{
    name: string | null;
    integrated: boolean;
    orgId: string | null;
  } | null>(null);
  const [supplierPartyRes, setSupplierPartyRes] = useState<{
    name: string | null;
    integrated: boolean;
    orgId: string | null;
  } | null>(null);

  // ── Disputes ──────────────────────────────────────────────────────────────
  const [tripDispute, setTripDispute] = useState<DisputeRow | null>(null);
  const [tripDisputeDirection, setTripDisputeDirection] = useState<
    "RAISED_BY_US" | "RECEIVED" | null
  >(null);
  const [tripDisputeByType, setTripDisputeByType] = useState<
    Partial<
      Record<
        "client" | "supplier",
        { dispute: DisputeRow; direction: "RAISED_BY_US" | "RECEIVED" }
      >
    >
  >({});
  const [reconcileActionLoading, setReconcileActionLoading] = useState(false);
  const [reconcileLoadingByType, setReconcileLoadingByType] = useState<
    Partial<Record<"client" | "supplier", boolean>>
  >({});

  // ── Finance / adjustments ─────────────────────────────────────────────────
  const [financeRefreshKey, setFinanceRefreshKey] = useState(0);
  const [adjustments, setAdjustments] = useState<TripAdjustment[]>([]);
  const [counterpartyEntries, setCounterpartyEntries] = useState<
    Array<{
      id: string;
      partnerKey: string;
      amount: number;
      transaction_date: string;
      reference_id?: string;
    }>
  >([]);

  // ── Assignment audit ──────────────────────────────────────────────────────
  const [assignmentAuditRows, setAssignmentAuditRows] = useState<TripAssignmentAuditRow[]>([]);
  const [assignmentDriverNames, setAssignmentDriverNames] = useState<Record<string, string>>({});
  const [assignmentVehicleLabels, setAssignmentVehicleLabels] = useState<Record<string, string>>({});
  const [tripOtp, setTripOtp] = useState<{ code: string | null; expires_at: string | null } | null>(null);

  // ── Tracking / location ───────────────────────────────────────────────────
  const [driverLocation, setDriverLocation] =
    useState<driverLocationService.DriverLocationRow | null>(null);
  const [driverLocationLoading, setDriverLocationLoading] = useState(false);
  const [tripLocationPoints, setTripLocationPoints] = useState<
    { latitude: number; longitude: number; recorded_at: string }[]
  >([]);
  const [driverLocationAddress, setDriverLocationAddress] = useState<string | null>(null);
  const [pastLocationAddresses, setPastLocationAddresses] = useState<
    [string | null, string | null]
  >([null, null]);

  // ── Documents ─────────────────────────────────────────────────────────────
  const [tripDocuments, setTripDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState(false);
  const [vehiclePreviewUrls, setVehiclePreviewUrls] = useState<Record<string, string | null>>({});
  const [vehiclePreviewIndex, setVehiclePreviewIndex] = useState(0);
  const [selectedDoc, setSelectedDoc] = useState<TripDocItem | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [showFullScreenMap, setShowFullScreenMap] = useState(false);
  const [showDriverRejectedModal, setShowDriverRejectedModal] = useState(false);
  const [tripDetailTab, setTripDetailTab] = useState<TripDetailTab>("finance");
  const [expandedTimelineEntryIds, setExpandedTimelineEntryIds] = useState<
    Record<string, boolean>
  >({});
  const [tripRatings, setTripRatings] = useState<{ score: number }[]>([]);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const refetchTransactionsRef = useRef<() => void>(() => {});
  const prevDriverIdRef = useRef<string | null>(null);
  const podModalRefetchDoneRef = useRef(false);
  const loadCompletedForIdRef = useRef<string | null>(null);
  const supplierRetryForTripIdRef = useRef<string | null>(null);
  const tripRef = useRef<TripRow | null>(null);
  tripRef.current = trip;

  // ── Shipper display names (platform-level alias) ──────────────────────────
  const { data: shipperNameByTripId = {} } = useShipperDisplayNamesQuery(
    currentOrganization?.id ?? null,
  );
  const displayClientName = trip
    ? (shipperNameByTripId[trip.id] ?? trip.client_name ?? undefined)
    : undefined;

  // ── Derived flags ─────────────────────────────────────────────────────────
  const isAggregate = useMemo(() => (trip ? isAggregateTrip(trip) : false), [trip]);
  const tripCompleted = trip != null && isTripCompleted(trip);
  const currentUserId = user?.uid ?? null;

  const capabilities = useMemo(
    () => getCapabilitiesFromProfile(profile),
    [profile],
  );
  const canAssign = useMemo(
    () => (trip ? canAssignTrip(capabilities) : false),
    [capabilities, trip],
  );

  const showAssignByPhone = useMemo(() => {
    if (!trip) return false;
    return isAggregateTrip(trip) && !trip.driver_id;
  }, [trip]);

  const assignmentSource = useMemo<AssignmentSource>(() => {
    if (!assignmentAuditRows.length) return "unassigned";
    const latest = assignmentAuditRows[0];
    if (!latest?.driver_id_new) return "unassigned";
    return latest.changed_by === currentUserId ? "private" : "shared";
  }, [assignmentAuditRows, currentUserId]);

  const effectiveDriverIdForLocation = useMemo(
    () => trip?.driver_id ?? assignmentAuditRows[0]?.driver_id_new ?? null,
    [trip?.driver_id, assignmentAuditRows],
  );

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
    const hasAssignedDriver =
      !!effectiveDriverIdForLocation || hasJourneyRuntimeStatus;
    if (!hasAssignedDriver) return true;
    const hasLiveTrackingSignal =
      !!driverLocation || tripLocationPoints.length > 0;
    const viewerOrgId = currentOrganization?.id ?? null;
    const isSharedClientOrNonOwnerView =
      !!trip &&
      !!viewerOrgId &&
      !!trip.organization_id &&
      trip.organization_id !== viewerOrgId;
    const isClientOwnerIndentView =
      !!trip &&
      !!trip.indent_id &&
      !!viewerOrgId &&
      !!trip.organization_id &&
      trip.organization_id === viewerOrgId;
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

  const driverRatingAvg = useMemo(() => averageScore(tripRatings), [tripRatings]);

  const previousDriverName = useMemo(() => {
    const prev = assignmentAuditRows.find((r) => r.driver_id_prev != null);
    return prev ? (assignmentDriverNames[prev.driver_id_prev!] ?? null) : null;
  }, [assignmentAuditRows, assignmentDriverNames]);

  const latestReassignmentSummary = useMemo(() => {
    const reassign = assignmentAuditRows.find((r) => r.event_type === "reassignment");
    if (!reassign) return null;
    const from = reassign.driver_id_prev
      ? (assignmentDriverNames[reassign.driver_id_prev] ?? "Previous driver")
      : "Previous driver";
    const to = reassign.driver_id_new
      ? (assignmentDriverNames[reassign.driver_id_new] ?? "New driver")
      : "New driver";
    return `Reassigned: ${from} → ${to}`;
  }, [assignmentAuditRows, assignmentDriverNames]);

  // ── Transactions (React Query) ────────────────────────────────────────────
  const orgIdForTransactions = currentOrganization?.id ?? null;
  const { data: transactionsData = [], refetch: refetchTransactions } =
    useTransactionsQuery(orgIdForTransactions);
  refetchTransactionsRef.current = refetchTransactions;
  const transactions: LedgerRow[] | null = orgIdForTransactions ? transactionsData : null;

  const tripLedgerEntries = useMemo(
    () => getTripLedgerEntries(transactions, trip?.id),
    [transactions, trip?.id],
  );

  const { data: tripSubcontracts = [] } = useTripSubcontractsQuery(
    currentOrganization?.id ?? null,
    trip ? [trip.id] : [],
  );

  const subcontractRate = useMemo(() => {
    if (tripSubcontracts.length > 0 && trip) {
      const exact = tripSubcontracts.find((row) => row.trip_id === trip.id);
      return exact?.rate ?? null;
    }
    return null;
  }, [tripSubcontracts, trip]);

  // ── Finance totals ────────────────────────────────────────────────────────
  const paidToDriver = useMemo(
    () =>
      tripLedgerEntries.reduce(
        (s, r) => (r.contact_type === "driver" ? s + Number(r.amount_out ?? 0) : s),
        0,
      ),
    [tripLedgerEntries],
  );

  // ── Map coordinates ───────────────────────────────────────────────────────
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

  const trackingMapLocationLabels = useMemo(
    (): [string, string, string, string, string] => [
      (trip?.pickup_area ?? "Origin").trim() || "Start",
      pastLocationAddresses[0] ?? "Past location 1",
      pastLocationAddresses[1] ?? "Past location 2",
      driverLocationAddress?.trim() || "Current location",
      (trip?.drop_location ?? "Destination").trim() || "Destination",
    ],
    [trip?.pickup_area, trip?.drop_location, pastLocationAddresses, driverLocationAddress],
  );

  // ── Vehicle preview docs ──────────────────────────────────────────────────
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

  // ── Realtime ──────────────────────────────────────────────────────────────
  const handleRealtimeTripUpdate = useCallback(() => {
    isRefreshingRef.current = true;
    load();
    loadAssignmentAudit();
    setFinanceRefreshKey((k) => k + 1);
    refetchTransactionsRef.current();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useRealtimeTrip(trip?.id ?? null, handleRealtimeTripUpdate);

  // ── Data loaders ──────────────────────────────────────────────────────────
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
    tripDocumentsService
      .getDocumentsByTripId(tripId)
      .then(({ documents, error }) => {
        if (error) setTripDocuments([]);
        else setTripDocuments(documents ?? []);
      });
  }, [tripId]);

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
        const historyByDriver =
          await driverLocationService.getDriverLocationHistoryByDriverId(driverId);
        if (!historyByDriver.error) effectivePoints = historyByDriver.points;
      }
      setDriverLocation(latestRes.error ? null : (latestRes.location ?? null));
      setTripLocationPoints(
        effectivePoints.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          recorded_at: p.recorded_at,
        })),
      );
    } catch {
      // silently ignore
    }
  }, [trip?.id, effectiveDriverIdForLocation]);

  const handleRefresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    load();
    loadAdjustments();
    loadAssignmentAudit();
    setFinanceRefreshKey((k) => k + 1);
    refetchTransactionsRef.current();
  }, [load, loadAdjustments, loadAssignmentAudit]);

  // ── Reconciliation actions ────────────────────────────────────────────────
  const refreshTripDispute = useCallback(async () => {
    const orgId = currentOrganization?.id ?? null;
    const tId = trip?.id ?? null;
    const clientOrg = clientPartyRes?.orgId ?? null;
    const supplierOrg = supplierPartyRes?.orgId ?? null;
    if (!orgId || !tId || (!clientOrg && !supplierOrg)) {
      setTripDispute(null);
      setTripDisputeDirection(null);
      setTripDisputeByType({});
      return;
    }
    try {
      const [received, clientRaised, supplierRaised] = await Promise.all([
        getDisputesReceived(orgId),
        clientOrg
          ? getDisputesForPartner(orgId, clientOrg)
          : Promise.resolve({ disputes: [] as DisputeRow[] }),
        supplierOrg
          ? getDisputesForPartner(orgId, supplierOrg)
          : Promise.resolve({ disputes: [] as DisputeRow[] }),
      ]);
      const matchByTrip = (d: DisputeRow) =>
        String(d.transaction_id ?? "").toLowerCase() === String(tId).toLowerCase();
      const receivedByOrg = new Map<string, DisputeRow>();
      for (const d of received.disputes ?? []) {
        if (!matchByTrip(d) || d.status !== "OPEN") continue;
        if (d.raised_by_org_id) receivedByOrg.set(d.raised_by_org_id, d);
      }
      const byType: Partial<
        Record<"client" | "supplier", { dispute: DisputeRow; direction: "RAISED_BY_US" | "RECEIVED" }>
      > = {};
      const pickForSide = (
        side: "client" | "supplier",
        partnerOrg: string | null,
        raised: { disputes: DisputeRow[] | undefined },
      ) => {
        if (!partnerOrg) return;
        const raisedOpen = (raised.disputes ?? []).filter(
          (d) => matchByTrip(d) && d.status === "OPEN",
        )[0];
        if (raisedOpen) {
          byType[side] = { dispute: raisedOpen, direction: "RAISED_BY_US" };
          return;
        }
        const receivedOpen = receivedByOrg.get(partnerOrg);
        if (receivedOpen) byType[side] = { dispute: receivedOpen, direction: "RECEIVED" };
      };
      pickForSide("client", clientOrg, clientRaised);
      pickForSide("supplier", supplierOrg, supplierRaised);
      setTripDisputeByType(byType);
      const primary = byType.supplier ?? byType.client ?? null;
      setTripDispute(primary?.dispute ?? null);
      setTripDisputeDirection(primary?.direction ?? null);
    } catch {
      setTripDispute(null);
      setTripDisputeDirection(null);
      setTripDisputeByType({});
    }
  }, [currentOrganization?.id, trip?.id, clientPartyRes?.orgId, supplierPartyRes?.orgId]);

  type PartyType = "client" | "supplier";

  const handleAcceptPartnerView = useCallback(
    async (partyType?: PartyType) => {
      const orgId = currentOrganization?.id ?? null;
      if (!orgId || !trip?.id) return;
      const type: "client" | "supplier" =
        partyType ?? (trip.supplier_id ? "supplier" : "client");
      const sideRes = type === "client" ? clientPartyRes : supplierPartyRes;
      if (!sideRes?.integrated) {
        Alert.alert("Partner offline", "This party is not connected on the network.");
        return;
      }
      const sideContactId = type === "client" ? trip.client_id ?? null : trip.supplier_id ?? null;
      const sidePartnerKey = sideContactId?.toString().trim().toLowerCase();
      const sideEntries = counterpartyEntries.filter(
        (e) => e.partnerKey.toLowerCase() === sidePartnerKey,
      );
      const partnerAmount = sideEntries.reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const sideDispute = tripDisputeByType[type];
      const dispute = sideDispute?.dispute ?? null;
      const direction = sideDispute?.direction ?? null;
      const partnerSales =
        dispute?.raised_sales != null ? Number(dispute.raised_sales) : partnerAmount;
      const partnerPaid =
        dispute?.raised_paid != null ? Number(dispute.raised_paid) : partnerAmount;

      const setLoadingFn = partyType
        ? (v: boolean) => setReconcileLoadingByType((p) => ({ ...p, [type]: v }))
        : (v: boolean) => setReconcileActionLoading(v);
      setLoadingFn(true);
      try {
        if (dispute && direction === "RECEIVED") {
          const { error, rpcUnavailable } = await resolveDispute(dispute.id, "ACCEPT", orgId);
          if (!error) {
            setFinanceRefreshKey((k) => k + 1);
            await refreshTripDispute();
            return;
          }
          if (!rpcUnavailable) {
            Alert.alert("Update failed", error.message);
            return;
          }
        }
        const { error: acceptErr } = await acceptPartnerView(
          orgId,
          trip.id,
          partnerSales,
          partnerPaid,
          sideContactId,
        );
        if (acceptErr) {
          Alert.alert("Update failed", acceptErr.message);
          return;
        }
        if (dispute) await resolveDisputeTableOnly(dispute.id, orgId);
        setFinanceRefreshKey((k) => k + 1);
        await refreshTripDispute();
      } finally {
        setLoadingFn(false);
      }
    },
    [
      currentOrganization?.id,
      trip?.id,
      trip?.client_id,
      trip?.supplier_id,
      clientPartyRes,
      supplierPartyRes,
      tripDisputeByType,
      counterpartyEntries,
      refreshTripDispute,
    ],
  );

  const handleRaiseDispute = useCallback(
    async (partyType?: PartyType) => {
      const orgId = currentOrganization?.id ?? null;
      if (!orgId || !trip?.id) return;
      const type: "client" | "supplier" =
        partyType ?? (trip.supplier_id ? "supplier" : "client");
      const sideRes = type === "client" ? clientPartyRes : supplierPartyRes;
      const partnerOrgToUse = sideRes?.orgId ?? partnerOrgId;
      if (!partnerOrgToUse) return;
      const sidePartnerKey = (
        type === "client" ? trip.client_id : trip.supplier_id
      )?.toString().trim().toLowerCase();
      const sideEntries = counterpartyEntries.filter(
        (e) => e.partnerKey.toLowerCase() === sidePartnerKey,
      );
      const partnerAmount = sideEntries.reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const ourTotal = tripLedgerEntries.reduce(
        (s, r) =>
          r.contact_type === type
            ? s + Number(type === "client" ? (r.amount_in ?? 0) : (r.amount_out ?? 0))
            : s,
        0,
      );
      const setLoadingFn = partyType
        ? (v: boolean) => setReconcileLoadingByType((p) => ({ ...p, [type]: v }))
        : (v: boolean) => setReconcileActionLoading(v);
      setLoadingFn(true);
      try {
        const { error } = await createDispute({
          orgId,
          transaction_id: trip.id,
          partner_org_id: partnerOrgToUse,
          internal_snapshot: ourTotal,
          partner_snapshot: partnerAmount,
        });
        if (error) {
          Alert.alert("Error", "Failed to raise dispute. Please try again.");
        } else {
          setFinanceRefreshKey((k) => k + 1);
          await refreshTripDispute();
        }
      } finally {
        setLoadingFn(false);
      }
    },
    [
      currentOrganization?.id,
      trip?.id,
      trip?.client_id,
      trip?.supplier_id,
      clientPartyRes,
      supplierPartyRes,
      partnerOrgId,
      counterpartyEntries,
      tripLedgerEntries,
      refreshTripDispute,
    ],
  );

  const openCompareVerifyFromTrip = useCallback(
    (partyType?: PartyType) => {
      if (!trip?.id) return;
      const targetPartyRes = partyType === "client" ? clientPartyRes : supplierPartyRes;
      const orgToUse = targetPartyRes?.orgId ?? partnerOrgId;
      if (!orgToUse) return;
      router.push(`/(modals)/compare-verify?tripId=${trip.id}&partnerOrgId=${orgToUse}` as any);
    },
    [trip?.id, clientPartyRes, supplierPartyRes, partnerOrgId, router],
  );

  // ── Entry modal ───────────────────────────────────────────────────────────
  const openAddEntry = useCallback(() => {
    if (!trip?.id) return;
    const tripNumber = getTripDisplayNumber(trip);
    const params = new URLSearchParams({ tripId: trip.id, tripNumber });
    if (entryContext === "supplier" && trip.supplier_id) {
      params.set("defaultType", "out");
      params.set("partyContext", "suppliers");
      params.set("partyId", trip.supplier_id);
      if (partnerName) params.set("partyName", partnerName);
    } else if (entryContext === "vehicle" && trip.vehicle_id) {
      params.set("defaultType", "out");
      params.set("tripId", trip.id);
    } else if (entryContext === "client" && (clientIdFromContext ?? trip.client_id)) {
      params.set("defaultType", "in");
      params.set("partyContext", "clients");
      params.set("partyId", clientIdFromContext ?? trip.client_id ?? "");
      const name = clientNameFromContext ?? displayClientName ?? trip.client_name ?? "";
      if (name) params.set("partyName", name);
    }
    router.push(`/(modals)/ledger-sync?${params.toString()}`);
  }, [
    trip,
    entryContext,
    clientIdFromContext,
    clientNameFromContext,
    partnerName,
    displayClientName,
    router,
  ]);

  const handleRecordDriverPayment = useCallback(() => {
    if (!trip?.id || !trip.driver_id) return;
    const tripNumber = getTripDisplayNumber(trip);
    const params = new URLSearchParams({
      tripId: trip.id,
      tripNumber,
      defaultType: "out",
      partyContext: "drivers",
      partyId: trip.driver_id,
      partyName: driverName ?? t("driver"),
    });
    router.push(`/(modals)/ledger-sync?${params.toString()}`);
  }, [trip, driverName, router, t]);

  // ── Adjustment handlers ───────────────────────────────────────────────────
  const handleAddAdjustment = useCallback(() => {
    setShowAdjustmentModal(true);
  }, []);

  const handleSaveAdjustment = useCallback(
    async (params: {
      type: "revenue" | "cost";
      impact: "plus" | "minus";
      amount: number;
      reason: string;
    }) => {
      if (!trip?.id) return;
      await addTripAdjustment(trip.id, params);
      loadAdjustments();
    },
    [trip?.id, loadAdjustments],
  );

  const handleRemoveAdjustment = useCallback(
    async (adjustmentId: string) => {
      if (!trip?.id) return;
      await removeTripAdjustment(trip.id, adjustmentId);
      loadAdjustments();
    },
    [trip?.id, loadAdjustments],
  );

  // ── Timeline expand ───────────────────────────────────────────────────────
  const toggleTimelineItemExpanded = useCallback((id: string) => {
    setExpandedTimelineEntryIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ── Reconciliation parties (for multi-party hero) ─────────────────────────
  const reconciliationParties = useMemo<ReconciliationPartyInfo[]>(() => {
    if (!trip) return [];
    const out: ReconciliationPartyInfo[] = [];
    const clientKey = trip.client_id?.toString().trim().toLowerCase() ?? null;
    const supplierKey = trip.supplier_id?.toString().trim().toLowerCase() ?? null;
    const receivedFromClient = tripLedgerEntries.reduce(
      (s, r) => (r.contact_type === "client" ? s + Number(r.amount_in ?? 0) : s),
      0,
    );
    const paidToSupplier = tripLedgerEntries.reduce(
      (s, r) => (r.contact_type === "supplier" ? s + Number(r.amount_out ?? 0) : s),
      0,
    );

    if (trip.client_id && clientPartyRes) {
      const entries = clientKey
        ? counterpartyEntries.filter((e) => e.partnerKey.toLowerCase() === clientKey)
        : [];
      const theirTotal = entries.reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const disp = tripDisputeByType.client ?? null;
      out.push({
        type: "client",
        name:
          clientPartyRes.name ?? displayClientName ?? trip.client_name ?? t("client"),
        integrated: clientPartyRes.integrated,
        counterpartyEntries: entries,
        ourTotal: receivedFromClient,
        ourTotalLabel: "Your received total",
        theirTotal,
        expectedAmount: Number(trip.client_price ?? 0) || undefined,
        disputeStatus: disp ? "OPEN" : null,
        disputeDirection: disp?.direction ?? null,
        actionLoading: !!reconcileLoadingByType.client,
        onAcceptPartnerView: clientPartyRes.integrated
          ? () => void handleAcceptPartnerView("client")
          : undefined,
        onRaiseDispute:
          clientPartyRes.integrated && !disp
            ? () => void handleRaiseDispute("client")
            : undefined,
        onOpenCompareVerify: clientPartyRes.integrated
          ? () => openCompareVerifyFromTrip("client")
          : undefined,
      });
    }
    if (trip.supplier_id && supplierPartyRes) {
      const entries = supplierKey
        ? counterpartyEntries.filter((e) => e.partnerKey.toLowerCase() === supplierKey)
        : [];
      const theirTotal = entries.reduce((s, e) => s + Number(e.amount ?? 0), 0);
      const disp = tripDisputeByType.supplier ?? null;
      out.push({
        type: "supplier",
        name:
          supplierPartyRes.name ?? partnerName ?? trip.supplier_name ?? t("supplier"),
        integrated: supplierPartyRes.integrated,
        counterpartyEntries: entries,
        ourTotal: paidToSupplier,
        ourTotalLabel: "Your paid total",
        theirTotal,
        expectedAmount: Number(trip.supplier_rate ?? 0) || undefined,
        disputeStatus: disp ? "OPEN" : null,
        disputeDirection: disp?.direction ?? null,
        actionLoading: !!reconcileLoadingByType.supplier,
        onAcceptPartnerView: supplierPartyRes.integrated
          ? () => void handleAcceptPartnerView("supplier")
          : undefined,
        onRaiseDispute:
          supplierPartyRes.integrated && !disp
            ? () => void handleRaiseDispute("supplier")
            : undefined,
        onOpenCompareVerify: supplierPartyRes.integrated
          ? () => openCompareVerifyFromTrip("supplier")
          : undefined,
      });
    }
    const showDriverParty = trip.driver_id != null && !isAggregateTrip(trip);
    if (showDriverParty) {
      const expected = Number(trip.driver_commission ?? 0);
      out.push({
        type: "driver",
        name: driverName ?? t("driver"),
        integrated: false,
        ourTotal: paidToDriver,
        ourTotalLabel: "Paid to driver",
        theirTotal: 0,
        expectedAmount: expected > 0 ? expected : undefined,
        onRecordPayment: handleRecordDriverPayment,
      });
    }
    return out;
  }, [
    trip,
    tripLedgerEntries,
    counterpartyEntries,
    clientPartyRes,
    supplierPartyRes,
    tripDisputeByType,
    reconcileLoadingByType,
    displayClientName,
    partnerName,
    driverName,
    paidToDriver,
    handleAcceptPartnerView,
    handleRaiseDispute,
    handleRecordDriverPayment,
    openCompareVerifyFromTrip,
    t,
  ]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Stash: preloaded trip from load-flow
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

  // Initial load
  useEffect(() => load(), [load]);

  // Supplier retry when org becomes available
  useEffect(() => {
    if (!tripId || !currentOrganization?.id || trip !== null || loading) return;
    if (supplierRetryForTripIdRef.current === tripId) return;
    supplierRetryForTripIdRef.current = tripId;
    setLoading(true);
    load();
  }, [tripId, currentOrganization?.id, trip, loading, load]);

  // Adjustments + audit on mount
  useEffect(() => {
    if (tripId) loadAdjustments();
  }, [tripId, loadAdjustments]);
  useEffect(() => {
    if (tripId) loadAssignmentAudit();
  }, [tripId, loadAssignmentAudit]);

  // Trip documents
  useEffect(() => {
    if (trip?.id) loadTripDocuments();
    else setTripDocuments([]);
  }, [trip?.id, loadTripDocuments]);

  // OTP for aggregate trips
  useEffect(() => {
    const isRosterFromLoadHub =
      trip?.source === "direct_quote" && trip?.driver_id != null && trip?.vehicle_id != null;
    if (trip?.id && isAggregateTrip(trip) && !isRosterFromLoadHub) {
      loadTripOtp();
    } else {
      setTripOtp(null);
    }
  }, [trip?.id, trip?.supplier_id, trip?.source, trip?.driver_id, trip?.vehicle_id, loadTripOtp]);

  // Counterparty entries
  useEffect(() => {
    const orgId = currentOrganization?.id ?? null;
    if (!orgId || !trip?.id || counterpartyIntegrated === false) {
      setCounterpartyEntries([]);
      return;
    }
    const partnerKeys = [trip.supplier_id, trip.client_id]
      .map((k) => (k ?? "").trim())
      .filter(Boolean)
      .filter((k, idx, arr) => arr.indexOf(k) === idx);
    if (!partnerKeys.length) {
      setCounterpartyEntries([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      partnerKeys.map((partnerKey) =>
        getSharedLedgerEntriesForPartner(orgId, partnerKey).then((res) => ({
          partnerKey,
          entries: res.entries ?? [],
        })),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const tripRef2 = String(trip.id).trim().toLowerCase();
        const merged = results.flatMap((result) =>
          result.entries
            .filter(
              (entry) =>
                String(entry.reference_id ?? "").trim().toLowerCase() === tripRef2,
            )
            .map((entry) => ({
              id: entry.id,
              partnerKey: result.partnerKey,
              amount: Number(entry.amount ?? 0),
              transaction_date: entry.transaction_date,
              reference_id: entry.reference_id,
            })),
        );
        const deduped = Array.from(new Map(merged.map((row) => [row.id, row])).values()).sort(
          (a, b) =>
            new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime(),
        );
        setCounterpartyEntries(deduped);
      })
      .catch(() => {
        if (!cancelled) setCounterpartyEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id, trip?.id, trip?.supplier_id, trip?.client_id, counterpartyIntegrated]);

  // Dispute refresh
  useEffect(() => {
    void refreshTripDispute();
  }, [refreshTripDispute, financeRefreshKey]);

  // Ratings (completed trips only)
  useEffect(() => {
    if (!trip?.id || !tripCompleted) {
      setTripRatings([]);
      return;
    }
    getRatingsForTrip(trip.id).then(({ error, ratings }) => {
      if (error) return;
      const driverRatings = (ratings ?? []).filter((r) => r.rated_type === "driver");
      setTripRatings(driverRatings);
    });
  }, [trip?.id, tripCompleted]);

  // Driver location reverse geocoding
  useEffect(() => {
    if (!driverLocation) {
      setDriverLocationAddress(null);
      return;
    }
    safeReverseGeocode(driverLocation.latitude, driverLocation.longitude).then(
      (results) => {
        const addr = results[0];
        if (!addr) return;
        const parts = [addr.street, addr.city, addr.region].filter(Boolean);
        setDriverLocationAddress(parts.join(", "));
      },
    );
  }, [driverLocation?.latitude, driverLocation?.longitude]);

  // Past location geocoding
  useEffect(() => {
    const past = tripLocationPoints.slice(-2).reverse();
    setPastLocationAddresses([null, null]);
    past.forEach((pt, i) => {
      safeReverseGeocode(pt.latitude, pt.longitude).then((results) => {
        const addr = results[0];
        if (!addr) return;
        const parts = [addr.street, addr.city].filter(Boolean);
        setPastLocationAddresses((prev) => {
          const next: [string | null, string | null] = [...prev];
          next[i] = parts.join(", ") || null;
          return next;
        });
      });
    });
  }, [tripLocationPoints]);

  return {
    // Data
    trip,
    loading,
    error,
    refreshing,
    tripCompleted,
    isAggregate,

    // People
    driverName,
    driverAvatarUri,
    vehicleLabel,
    vehicleDocs,
    displayVehicleFromInput,
    setDisplayVehicleFromInput,
    driverLinked,
    partnerName,
    counterpartyIntegrated,
    partnerOrgId,
    clientPartyRes,
    supplierPartyRes,
    displayClientName,

    // Finance
    tripLedgerEntries,
    adjustments,
    subcontractRate,
    counterpartyEntries,
    paidToDriver,
    tripDispute,
    tripDisputeDirection,
    tripDisputeByType,
    reconcileActionLoading,
    reconcileLoadingByType,
    financeRefreshKey,
    reconciliationParties,

    // Assignment
    assignmentAuditRows,
    assignmentDriverNames,
    assignmentVehicleLabels,
    tripOtp,
    canAssign,
    showAssignByPhone,
    assignmentSource,
    previousDriverName,
    latestReassignmentSummary,

    // Tracking
    driverLocation,
    driverLocationLoading,
    tripLocationPoints,
    driverLocationAddress,
    trackingMapLocationLabels,
    trackingMapOriginCoordinate,
    trackingMapDestinationCoordinate,
    isDriverOffline,
    effectiveDriverIdForLocation,

    // Documents
    tripDocuments,
    computedTripDocs,
    vehiclePreviewDocs,
    vehiclePreviewUrls,
    vehiclePreviewIndex,
    setVehiclePreviewIndex,
    selectedDoc,
    setSelectedDoc,
    docPreviewUrl,
    setDocPreviewUrl,
    docPreviewLoading,
    setDocPreviewLoading,
    docPreviewError,
    setDocPreviewError,

    // Ratings
    driverRatingAvg,

    // UI state
    showAdjustmentModal,
    setShowAdjustmentModal,
    showTrackingModal,
    setShowTrackingModal,
    showFullScreenMap,
    setShowFullScreenMap,
    showDriverRejectedModal,
    setShowDriverRejectedModal,
    tripDetailTab,
    setTripDetailTab,
    expandedTimelineEntryIds,
    toggleTimelineItemExpanded,

    // Actions
    load,
    handleRefresh,
    openAddEntry,
    handleAcceptPartnerView,
    handleRaiseDispute,
    openCompareVerifyFromTrip,
    handleAddAdjustment,
    handleSaveAdjustment,
    handleRemoveAdjustment,
    handleRecordDriverPayment,
    fetchDriverLocationFromDb,

    // Misc
    currentUserId,
    currentOrganization,
    profile,
    t,

    // Setters needed by child components that mutate shared state
    setTrip,
    setVehicleLabel,
    setDriverName,
    setDriverAvatarUri,
    setDriverLinked,
    setPartnerName,
    setCounterpartyIntegrated,
    setPartnerOrgId,
    setClientPartyRes,
    setSupplierPartyRes,
    setVehiclePreviewUrls,
    setVehicleDocs,
    setDriverLocation,
    setDriverLocationLoading,
  };
}
