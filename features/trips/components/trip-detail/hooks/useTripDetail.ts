/**
 * Core data hook for TripDetailScreen.
 * Extracts all state, data loading, side effects, and computed values
 * from the 5k-line monolith so the screen component stays thin.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    getClientById,
    getClientDetails,
    getLinkedOrgProfile,
} from "@/features/clients/services/clients.service";
import {
    getDriverById,
    getDriverProfileDisplay,
} from "@/features/drivers/services/drivers.service";
import { openTripLedgerEntryChooser } from "@/features/finance/ledger/tripLedgerEntryChooser";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { averageScore, getRatingsForTrip } from "@/features/ratings/services/ratings.service";
import {
    getLinkedOrgProfileForSupplier,
    getSupplierById,
    getSupplierDetails,
} from "@/features/suppliers/services/suppliers.service";
import { getVehicleDocumentViewUrl } from "@/features/vehicles/services/vehicleDocuments.service";
import { getVehicleById } from "@/features/vehicles/services/vehicles.service";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import {
    DOCUMENT_EXPIRY_ORDER,
    DOCUMENT_LABELS,
} from "@/features/vehicles/utils/vehicleDocuments.util";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { canAssignTrip, getCapabilitiesFromProfile } from "@/lib/capabilities";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import {
  isIntegratedClientRow,
  isIntegratedSupplierRow,
} from "@/features/trips/visibility/tripVisibility";
import { formatIndianVehicleNumber } from "@/lib/format";
import {
    useShipperDisplayNamesQuery,
    useTransactionsQuery,
    useTripSubcontractsQuery,
} from "@/lib/queries";
import { isBundleEnabled, useTripDetailBundleQuery } from "@/lib/queries/useTripDetailBundleQuery";
import { queryKeys } from "@/lib/queryKeys";
import * as driverLocationService from "@/features/driver/services/driverLocation.service";
import type { DisputeRow } from "@/features/finance/services/sharedLedger.service";
import {
    acceptPartnerView,
    createDispute,
    getSharedLedgerEntriesForPartner,
    resolveDispute,
    resolveDisputeTableOnly,
} from "@/features/finance/services/sharedLedger.service";
import {
    useOpenDisputesQuery,
    useDisputesReceivedQuery,
} from "@/lib/queries";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRealtimeDriverLocations, useRealtimeTrip, useRealtimeTripDocuments } from "../../../hooks/useRealtimeTrips";
import { useTrackingTripBroadcast } from "@/features/tracking/hooks/useTrackingTripBroadcast";
import { isTrackingBroadcastV1Enabled } from "@/features/tracking/trackingFeatureFlags";
import {
  getTrackingState,
  isTripDriverMapEligible,
  isTripTrackingActive,
  shouldShowDriverTrackingOfflineOverlay,
} from "@/features/trips/utils/tripTrackingStatus.util";
import { useTripLiveTracking } from "@/features/trips/hooks/useTripLiveTracking";
import { useRequestDriverPing } from "@/features/trips/hooks/useRequestDriverPing";
import {
    clearInitialTripForDetail,
    getInitialTripForDetail,
} from "../../../initialTripForDetail";
import type { TripAssignmentAuditRow } from "../../../services/trip-assignment-audit.service";
import { getTripAssignmentAuditHistory } from "../../../services/trip-assignment-audit.service";
import type {
    TripAdjustment,
    TripAdjustmentImpact,
    TripAdjustmentType,
} from "../../../services/tripAdjustments";
import {
    addTripAdjustment,
    getTripAdjustments,
    updateTripAdjustment,
    voidTripAdjustment,
} from "../../../services/tripAdjustments";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { getTripOtpForDisplay } from "../../../services/tripOtp.service";
import {
    getTripById,
    getTripDisplayNumber,
    getTripsWhereOrgIsSupplier,
    supplierRowToTripRow,
    isTripCompleted,
    type TripRow,
} from "../../../services/trips.service";
import type { AssignmentSource } from "../../TripAssignmentBlock";
import type { ReassignCompletedMeta } from "../../reassign/reassign.types";

export type { ReassignCompletedMeta };
import type {
    ReconciliationPartyInfo,
    TripDetailTab,
} from "../TripDetailFinanceView";
import type { TripDocItem } from "../tripDocTypes";

import {
  resolveMapLocationLabel,
  resolveMapLocationLabelsBatch,
} from "@/lib/mapLocationLabel.service";
import { getTripTrackingMapStore } from "@/features/tracking/map/TripTrackingMapStore";
import {
  TRACKING_LOCATION_GEOCODE_MAX,
  TRIP_TRACKING_HISTORY_FETCH_LIMIT,
} from "@/lib/trackingLocation.constants";

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
      status_context: "started" | "in_transit" | "completed" | "created" | "accepted" | "assigned";
      detail_line: string;
    };

type TripMapCoordinateFields = TripRow & {
  pickup_lat?: unknown;
  pickup_lon?: unknown;
  drop_lat?: unknown;
  drop_lon?: unknown;
};

/** Linked org + contact fields for global {@link PartyAvatar} resolution. */
export type TripPartyAvatarFields = {
  organizationImageUrl: string | null;
  organizationAvatarSeed: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
};

function emptyTripPartyAvatarFields(): TripPartyAvatarFields {
  return {
    organizationImageUrl: null,
    organizationAvatarSeed: null,
    avatarUrl: null,
    avatarSeed: null,
  };
}

function nStr(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length ? v : null;
}

function pickClientDisplayName(
  client: { name?: string | null; contact_person?: string | null } | null | undefined,
): string | null {
  if (!client) return null;
  return (client.name || client.contact_person || "").trim() || null;
}

function pickSupplierDisplayName(
  supplier: {
    company_name?: string | null;
    name?: string | null;
    contact_person?: string | null;
  } | null | undefined,
): string | null {
  if (!supplier) return null;
  return (
    supplier.company_name ||
    supplier.name ||
    supplier.contact_person ||
    ""
  ).trim() || null;
}

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
  const queryClient = useQueryClient();
  void onBack;

  // ── Trip data ─────────────────────────────────────────────────────────────
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Assignment / driver / vehicle ─────────────────────────────────────────
  const [driverName, setDriverName] = useState<string | null>(null);
  const [driverPhone, setDriverPhone] = useState<string | null>(null);
  const [driverAvatarUri, setDriverAvatarUri] = useState<string | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);
  const [vehicleDocs, setVehicleDocs] = useState<VehicleDocuments | null>(null);
  const [displayVehicleFromInput, setDisplayVehicleFromInput] = useState("");
  const [driverLinked, setDriverLinked] = useState(false);

  // ── Partner / supplier / client ───────────────────────────────────────────
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [clientAvatarUri, setClientAvatarUri] = useState<string | null>(null);
  const [supplierAvatarUri, setSupplierAvatarUri] = useState<string | null>(null);
  const [clientPartyAvatarFields, setClientPartyAvatarFields] =
    useState<TripPartyAvatarFields | null>(null);
  const [supplierPartyAvatarFields, setSupplierPartyAvatarFields] =
    useState<TripPartyAvatarFields | null>(null);
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
  const qc = useQueryClient();
  const orgId = currentOrganization?.id ?? null;
  const { data: openDisputes } = useOpenDisputesQuery(orgId);
  const { data: receivedDisputes } = useDisputesReceivedQuery(orgId);

  const tripDisputeByType = useMemo(() => {
    const tId = trip?.id ?? null;
    const clientOrg = clientPartyRes?.orgId ?? null;
    const supplierOrg = supplierPartyRes?.orgId ?? null;
    if (!tId || (!clientOrg && !supplierOrg)) return {};
    const matchByTrip = (d: DisputeRow) =>
      String(d.transaction_id ?? "").toLowerCase() === String(tId).toLowerCase();
    const receivedByOrg = new Map<string, DisputeRow>();
    for (const d of receivedDisputes ?? []) {
      if (!matchByTrip(d) || d.status !== "OPEN") continue;
      if (d.raised_by_org_id) receivedByOrg.set(d.raised_by_org_id, d);
    }
    const byType: Partial<Record<"client" | "supplier", { dispute: DisputeRow; direction: "RAISED_BY_US" | "RECEIVED" }>> = {};
    const pickForSide = (side: "client" | "supplier", partnerOrg: string | null) => {
      if (!partnerOrg) return;
      const raisedOpen = (openDisputes ?? []).find(
        (d) => matchByTrip(d) && d.status === "OPEN" && d.partner_org_id === partnerOrg,
      );
      if (raisedOpen) { byType[side] = { dispute: raisedOpen, direction: "RAISED_BY_US" }; return; }
      const receivedOpen = receivedByOrg.get(partnerOrg);
      if (receivedOpen) byType[side] = { dispute: receivedOpen, direction: "RECEIVED" };
    };
    pickForSide("client", clientOrg);
    pickForSide("supplier", supplierOrg);
    return byType;
  }, [openDisputes, receivedDisputes, trip?.id, clientPartyRes?.orgId, supplierPartyRes?.orgId]);

  const primary = tripDisputeByType.supplier ?? tripDisputeByType.client ?? null;
  const tripDispute = primary?.dispute ?? null;
  const tripDisputeDirection = primary?.direction ?? null;
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
  /** After reassign: show tracking copy until new driver presence arrives (max 60s). */
  const [waitingForNewDriverLocation, setWaitingForNewDriverLocation] = useState(false);

  // ── Tracking / location ───────────────────────────────────────────────────
  const [driverLocation, setDriverLocation] =
    useState<driverLocationService.DriverLocationRow | null>(null);
  // ISO timestamp from broadcast (not lat/lon — GPS never enters React state from broadcast path).
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [driverLocationLoading, setDriverLocationLoading] = useState(false);
  const [tripLocationPoints, setTripLocationPoints] = useState<
    { latitude: number; longitude: number; recorded_at: string }[]
  >([]);
  const [driverLocationAddress, setDriverLocationAddress] = useState<string | null>(null);
  const [pastLocationAddresses, setPastLocationAddresses] = useState<
    [string | null, string | null]
  >([null, null]);
  const [locationTrailWithNames, setLocationTrailWithNames] = useState<
    { latitude: number; longitude: number; recorded_at: string; locationName: string | null }[]
  >([]);

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
  /** When opening the modal from Finance Overview (shortcuts / protocol chips may seed reason). */
  const [adjustmentModalPreset, setAdjustmentModalPreset] = useState<{
    type?: TripAdjustmentType;
    impact?: TripAdjustmentImpact;
    reasonSeed?: string | null;
  } | null>(null);
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
  const podModalRefetchDoneRef = useRef(false);
  const loadCompletedForIdRef = useRef<string | null>(null);
  const supplierFallbackLastFetchAtRef = useRef<number>(0);
  const SUPPLIER_FALLBACK_MIN_INTERVAL_MS = 60_000;
  const supplierRetryForTripIdRef = useRef<string | null>(null);
  const tripRef = useRef<TripRow | null>(null);
  tripRef.current = trip;
  // Phase 3c: deduplicates dual-filter Realtime events (trip_id + driver_id on same channel).
  const lastSeenLocationIdRef = useRef<string | null>(null);
  // Coarse gate: only re-geocode when position changes by > ~100m (3 decimal degrees).
  const lastGeocodedLocRef = useRef<{ lat: number; lng: number } | null>(null);
  // Broadcast timestamp ref — written per GPS tick, flushed into React state at 1s cadence.
  const lastBroadcastTimestampRef = useRef<string | null>(null);
  // Phase 3b: true after bundle data has been seeded into state on initial mount.
  const bundleSeededRef = useRef(false);

  // ── Shipper display names (platform-level alias) ──────────────────────────
  const { data: shipperNameByTripId = {} } = useShipperDisplayNamesQuery(
    currentOrganization?.id ?? null,
  );
  const displayClientName = trip
    ? (shipperNameByTripId[trip.id] ??
        (trip.organization_id !== currentOrganization?.id ? undefined : trip.client_name ?? undefined))
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
    // Aggregate assignments should keep phone + OTP workflow visible
    // even after driver assignment, so dispatch can re-share OTP when needed.
    return isAggregateTrip(trip);
  }, [trip]);

  const assignmentSource = useMemo<AssignmentSource>(() => {
    if (!assignmentAuditRows.length) return "unassigned";
    const latest = assignmentAuditRows[0];
    if (!latest?.driver_id_new) return "unassigned";
    return latest.changed_by === currentUserId ? "private" : "shared";
  }, [assignmentAuditRows, currentUserId]);

  const latestAssignmentRow = useMemo(() => {
    if (!assignmentAuditRows.length) return null;
    return [...assignmentAuditRows].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
    )[0] ?? null;
  }, [assignmentAuditRows]);

  const effectiveDriverIdForLocation = useMemo(
    () => trip?.driver_id ?? latestAssignmentRow?.driver_id_new ?? null,
    [trip?.driver_id, latestAssignmentRow],
  );

  const trackingBroadcastEnabled =
    isTrackingBroadcastV1Enabled() &&
    isTripTrackingActive(trip?.status, trip?.completed_at) &&
    !!trip?.id;

  /** Load presence + checkpoint trail whenever a driver is on an open trip (incl. assigned). */
  const driverMapDataEnabled =
    !!trip?.id &&
    !!effectiveDriverIdForLocation &&
    isTripDriverMapEligible(
      trip.status,
      trip.completed_at,
      effectiveDriverIdForLocation,
    );

  const liveTracking = useTripLiveTracking({
    tripId: trip?.id ?? null,
    driverId: effectiveDriverIdForLocation,
    trackingEnabled: driverMapDataEnabled,
  });

  const driverPing = useRequestDriverPing({
    tripId: trip?.id ?? null,
    trackingEnabled: trackingBroadcastEnabled || driverMapDataEnabled,
  });

  const isDriverOffline = useMemo(() => {
    if (!trip) return true;

    if (isTripTrackingActive(trip.status, trip.completed_at)) {
      const trailLast = liveTracking.trail[liveTracking.trail.length - 1]?.recorded_at;
      const pointsLast = tripLocationPoints[tripLocationPoints.length - 1]?.recorded_at;
      const lastLocationAt =
        lastSeenAt ??
        driverPing.lastPingRespondedAt ??
        driverLocation?.recorded_at ??
        trailLast ??
        pointsLast ??
        null;
      return shouldShowDriverTrackingOfflineOverlay({
        tripStatus: trip.status,
        completedAt: trip.completed_at,
        driverId: effectiveDriverIdForLocation ?? trip.driver_id,
        driverOnline: getTrackingState(trip.id, trip.status, {
          lastSeenAt,
          lastPingRespondedAt: driverPing.lastPingRespondedAt,
        }).driverOnline,
        lastLocationAt,
      });
    }

    const statusLower = (trip.status ?? "").toLowerCase();
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
    const trailPointCount = liveTracking.trail.length;
    const hasLiveTrackingSignal = !!driverLocation || trailPointCount > 0;
    const viewerOrgId = currentOrganization?.id ?? null;
    const isSharedClientOrNonOwnerView =
      !!viewerOrgId &&
      !!trip.organization_id &&
      trip.organization_id !== viewerOrgId;
    const isClientOwnerIndentView =
      !!trip.indent_id &&
      !!viewerOrgId &&
      !!trip.organization_id &&
      trip.organization_id === viewerOrgId;
    const isClientTrackingView = entryContext === "client";
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
    liveTracking.trail.length,
    tripLocationPoints.length,
    lastSeenAt,
    driverPing.lastPingRespondedAt,
  ]);

  // Seed map store from DB pings when broadcast is off (assigned / stale broadcast).
  useEffect(() => {
    if (!trip?.id || !driverMapDataEnabled || trackingBroadcastEnabled) return;
    const seed = liveTracking.seedPoint;
    const lat = driverLocation?.latitude ?? seed?.latitude;
    const lng = driverLocation?.longitude ?? seed?.longitude;
    const recordedAt = driverLocation?.recorded_at ?? seed?.recorded_at;
    if (lat == null || lng == null || !recordedAt) return;
    getTripTrackingMapStore(trip.id).applySeed(lat, lng, recordedAt);
    setLastSeenAt((prev) => {
      if (!prev || new Date(recordedAt).getTime() >= new Date(prev).getTime()) {
        return recordedAt;
      }
      return prev;
    });
  }, [
    trip?.id,
    driverMapDataEnabled,
    trackingBroadcastEnabled,
    driverLocation?.latitude,
    driverLocation?.longitude,
    driverLocation?.recorded_at,
    liveTracking.seedPoint?.latitude,
    liveTracking.seedPoint?.longitude,
    liveTracking.seedPoint?.recorded_at,
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

  const driverActivityTimelineRows = useMemo<DriverActivityTimelineRow[]>(() => {
    if (!trip) return [];

    const rows: DriverActivityTimelineRow[] = [];
    const tripStatusMeta = trip as TripRow & { status_updated_at?: string | null };
    if (trip.created_at) {
      rows.push({
        kind: "status",
        id: "status-created",
        status_label: "Trip Created",
        changed_at: trip.created_at,
        status_context: "created",
        detail_line: `System generated trip ${getTripDisplayNumber(trip)}`,
      });
    }

    if (assignmentAuditRows.length > 0) {
      const orderedAudit = [...assignmentAuditRows].sort(
        (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
      );
      orderedAudit.forEach((row, idx) => {
        const dName = row.driver_id_new
          ? (assignmentDriverNames[row.driver_id_new] ?? trip.driver_display_name ?? null)
          : null;
        const vLabel = row.vehicle_id_new
          ? (assignmentVehicleLabels[row.vehicle_id_new] ?? trip.vehicle_display_number ?? null)
          : null;
        rows.push({
          kind: "status",
          id: `status-assigned-${row.id}-${idx}`,
          status_label: "Assigned",
          changed_at: row.changed_at,
          status_context: "assigned",
          detail_line:
            [dName, vLabel].filter(Boolean).join(" · ") ||
            trip.pickup_area ||
            "Driver assigned",
        });
      });
    } else if (trip.driver_id || trip.driver_display_name || trip.vehicle_id || trip.vehicle_display_number) {
      rows.push({
        kind: "status",
        id: "status-assigned-fallback",
        status_label: "Assigned",
        changed_at: trip.updated_at ?? trip.created_at ?? new Date().toISOString(),
        status_context: "assigned",
        detail_line:
          [trip.driver_display_name, trip.vehicle_display_number].filter(Boolean).join(" · ") ||
          trip.pickup_area ||
          "Driver assigned",
      });
    }

    if (
      (trip.status_updated_role === "driver" || Number(trip.status_revision ?? 0) > 0) &&
      (trip.updated_at || trip.started_at)
    ) {
      rows.push({
        kind: "status",
        id: "status-accepted",
        status_label: "Driver Accepted",
        changed_at: trip.updated_at ?? trip.started_at ?? new Date().toISOString(),
        status_context: "accepted",
        detail_line: trip.pickup_area || "Accepted assignment",
      });
    }

    const statusLower = String(trip.status ?? "").toLowerCase();
    const inTransitLikeStatus =
      statusLower === "in_progress" ||
      statusLower === "in_transit" ||
      statusLower === "pickup" ||
      statusLower === "picked_up" ||
      statusLower === "at_drop";

    if (trip.started_at || inTransitLikeStatus) {
      rows.push({
        kind: "status",
        id: "status-in-transit",
        status_label: "In transit",
        changed_at:
          trip.started_at ??
          tripStatusMeta.status_updated_at ??
          trip.updated_at ??
          new Date().toISOString(),
        status_context: "in_transit",
        detail_line: trip.pickup_area || "Origin",
      });
    }

    const completedLikeStatus =
      statusLower.includes("complet") ||
      statusLower.includes("deliver") ||
      statusLower === "done";
    if (trip.completed_at || completedLikeStatus) {
      rows.push({
        kind: "status",
        id: "status-completed",
        status_label: "Delivered",
        changed_at:
          trip.completed_at ??
          tripStatusMeta.status_updated_at ??
          trip.updated_at ??
          new Date().toISOString(),
        status_context: "completed",
        detail_line: trip.drop_location || "Destination",
      });
    }

    return rows;
  }, [trip, assignmentAuditRows, assignmentDriverNames, assignmentVehicleLabels]);

  // ── Transactions (React Query) ────────────────────────────────────────────
  const orgIdForTransactions = currentOrganization?.id ?? null;
  const tripOwnerOrgIdForTransactions = trip?.organization_id ?? null;
  const secondaryOrgIdForTransactions =
    orgIdForTransactions &&
    tripOwnerOrgIdForTransactions &&
    tripOwnerOrgIdForTransactions !== orgIdForTransactions
      ? tripOwnerOrgIdForTransactions
      : null;
  const { data: primaryTransactionsData = [], refetch: refetchPrimaryTransactions } =
    useTransactionsQuery(orgIdForTransactions);
  const { data: secondaryTransactionsData = [], refetch: refetchSecondaryTransactions } =
    useTransactionsQuery(secondaryOrgIdForTransactions);
  refetchTransactionsRef.current = () => {
    void refetchPrimaryTransactions();
    if (secondaryOrgIdForTransactions) void refetchSecondaryTransactions();
  };
  const transactions: LedgerRow[] | null = useMemo(() => {
    if (!orgIdForTransactions) return null;
    const merged = [...primaryTransactionsData, ...secondaryTransactionsData];
    if (merged.length <= 1) return merged;
    const deduped = new Map<string, LedgerRow>();
    for (const row of merged) deduped.set(row.id, row);
    return Array.from(deduped.values());
  }, [
    orgIdForTransactions,
    primaryTransactionsData,
    secondaryTransactionsData,
  ]);

  const tripLedgerEntries = useMemo(
    () =>
      getTripLedgerEntries(
        transactions,
        trip?.id,
        trip ? getTripDisplayNumber(trip) : undefined,
      ),
    [transactions, trip],
  );

  const { data: tripSubcontracts = [] } = useTripSubcontractsQuery(
    currentOrganization?.id ?? null,
    trip ? [trip.id] : [],
  );

  // Phase 3b: single-RPC bundle replacing 18-24 serial calls.
  // bundleActive is false for all orgs not in BUNDLE_ENABLED_ORG_IDS and when global flag is off —
  // all guards below become no-ops, preserving existing behavior for those orgs.
  const { bundle } = useTripDetailBundleQuery(tripId, currentOrganization?.id ?? null);
  const bundleActive = isBundleEnabled(currentOrganization?.id ?? null);

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
    const tripWithCoords = trip as TripMapCoordinateFields | null;
    const latitude = Number(tripWithCoords?.pickup_lat);
    const longitude = Number(tripWithCoords?.pickup_lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }, [trip]);

  const trackingMapDestinationCoordinate = useMemo(() => {
    const tripWithCoords = trip as TripMapCoordinateFields | null;
    const latitude = Number(tripWithCoords?.drop_lat);
    const longitude = Number(tripWithCoords?.drop_lon);
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
    const hasVehicleDoc = vehiclePreviewDocs.some((doc) => !!doc.storagePath);

    const lrDocs = tripDocuments.filter((d) => d.document_type === 'lr');
    const manifestDocs = tripDocuments.filter((d) => d.document_type === 'manifest');
    const rawPodDocs = tripDocuments.filter((d) => d.document_type === 'pod');

    const manifestCard: TripDocItem =
      manifestDocs.length > 0
        ? {
            id: `manifest-${manifestDocs[0].id}`,
            label: "Trip Manifest",
            type: (manifestDocs[0].mime_type ?? "").includes("pdf") ? "PDF" : "JPG",
            status: "Uploaded" as const,
            storagePath: manifestDocs[0].storage_path,
            documentId: manifestDocs[0].id,
            category: "trip" as const,
          }
        : {
            id: "manifest",
            label: "Trip Manifest",
            type: "PDF",
            status: "Pending" as const,
            category: "trip" as const,
          };

    const podDocs: TripDocItem[] =
      rawPodDocs.length > 0
        ? rawPodDocs.map((podDoc, index) => ({
            id: `pod-${podDoc.id}`,
            label: rawPodDocs.length > 1 ? `Driver POD ${index + 1}` : "Driver POD",
            type: (podDoc.mime_type ?? "image/jpeg").includes("pdf") ? "PDF" : "JPG",
            status: "Uploaded" as const,
            storagePath: podDoc.storage_path,
            documentId: podDoc.id,
            category: "driver" as const,
          }))
        : [
            {
              id: "pod",
              label: "Driver POD",
              type: "JPG",
              status: "Pending" as const,
              category: "driver" as const,
            },
          ];

    const lrCard: TripDocItem =
      lrDocs.length > 0
        ? {
            id: `lr-${lrDocs[0].id}`,
            label: 'LR Document',
            type: (lrDocs[0].mime_type ?? '').includes('pdf') ? 'PDF' : 'JPG',
            status: 'Uploaded' as const,
            storagePath: lrDocs[0].storage_path,
            documentId: lrDocs[0].id,
            category: 'lr' as const,
          }
        : {
            id: 'lr',
            label: 'LR Document',
            type: 'PDF',
            status: 'Pending' as const,
            category: 'lr' as const,
          };

    return [
      lrCard,
      manifestCard,
      {
        id: "vehicle-documents",
        label: "Vehicle Document",
        type: hasVehicleDoc ? "DOCS" : "JPG",
        status: hasVehicleDoc ? ("Uploaded" as const) : ("Pending" as const),
        docSource: "vehicle" as const,
        category: "vehicle" as const,
      },
      ...podDocs,
    ];
  }, [tripDocuments, vehiclePreviewDocs]);

  const docPreviewStoragePath = useMemo(() => {
    if (!selectedDoc) return undefined;
    if (selectedDoc.storagePath) return selectedDoc.storagePath;
    if (selectedDoc.id.startsWith("pod")) {
      return tripDocuments.find((d) => d.document_type === 'pod')?.storage_path;
    }
    return undefined;
  }, [selectedDoc, tripDocuments]);

  const isVehicleGalleryDoc = selectedDoc?.id === "vehicle-documents";

  const activeVehiclePreviewDoc = useMemo(
    () => vehiclePreviewDocs[vehiclePreviewIndex] ?? null,
    [vehiclePreviewDocs, vehiclePreviewIndex],
  );

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
        const now = Date.now();
        if (now - supplierFallbackLastFetchAtRef.current < SUPPLIER_FALLBACK_MIN_INTERVAL_MS) {
          return;
        }
        supplierFallbackLastFetchAtRef.current = now;
        const supplierRes = await getTripsWhereOrgIsSupplier(orgId);
        if (supplierRes.error) return;
        const found = supplierRes.trips.find((t) => t.id === tripId);
        if (found) {
          const mapped = supplierRowToTripRow(found);
          const current = tripRef.current;
          const unchanged =
            current?.id === found.id &&
            current?.updated_at === found.updated_at &&
            (current?.status ?? "") === (found.status ?? "");
          if (!unchanged) {
            setTrip(mapped);
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

  const loadAdjustments = useCallback(async () => {
    if (!tripId) return;
    const list = await getTripAdjustments(tripId);
    setAdjustments(list);
  }, [tripId]);

  const loadAssignmentAudit = useCallback(() => {
    if (!tripId) return;
    getTripAssignmentAuditHistory(tripId).then(({ error, rows }) => {
      if (!error) {
        const sorted = [...(rows ?? [])].sort(
          (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
        );
        setAssignmentAuditRows(sorted);
      }
      else setAssignmentAuditRows([]);
    });
  }, [tripId]);

  // ── Realtime (UPDATE merges row from WAL — no getTripById refetch) ───────────
  const handleRealtimeTripUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (
        payload.eventType === "UPDATE" &&
        payload.new &&
        typeof payload.new === "object" &&
        (payload.new as { id?: string }).id === tripId
      ) {
        setTrip((prev) => {
          if (!prev || prev.id !== tripId) return prev;
          return { ...prev, ...(payload.new as Partial<TripRow>) } as TripRow;
        });
        return;
      }
      isRefreshingRef.current = true;
      load();
      loadAssignmentAudit();
      setFinanceRefreshKey((k) => k + 1);
      refetchTransactionsRef.current();
    },
    [tripId, load, loadAssignmentAudit],
  );

  useRealtimeTrip(tripId ?? null, handleRealtimeTripUpdate);

  /** Resolve audit row IDs to labels. Skipped on bundle path — names are already inlined by the RPC. */
  useEffect(() => {
    if (bundleActive && bundleSeededRef.current) return;
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
    const resolveDriverDisplay = async (id: string): Promise<string> => {
      const res = await getDriverById(orgId, id);
      if (res.driver) return res.driver.name || res.driver.phone || id;
      if (trip.supplier_id) {
        const sup = await getSupplierById(orgId, trip.supplier_id);
        const linkedOrgId = sup.supplier?.linked_organization_id;
        if (linkedOrgId) {
          const res2 = await getDriverById(linkedOrgId, id);
          if (res2.driver) return res2.driver.name || res2.driver.phone || id;
        }
      }
      const viewerOrgId = currentOrganization?.id;
      if (viewerOrgId && viewerOrgId !== orgId) {
        const res3 = await getDriverById(viewerOrgId, id);
        if (res3.driver) return res3.driver.name || res3.driver.phone || id;
      }
      return id;
    };
    const resolveVehicleDisplay = async (id: string): Promise<string> => {
      const res = await getVehicleById(orgId, id);
      if (res.vehicle) {
        return (
          [res.vehicle.vehicle_number, res.vehicle.vehicle_type]
            .filter(Boolean)
            .join(" · ") || id
        );
      }
      if (trip.supplier_id) {
        const sup = await getSupplierById(orgId, trip.supplier_id);
        const linkedOrgId = sup.supplier?.linked_organization_id;
        if (linkedOrgId) {
          const res2 = await getVehicleById(linkedOrgId, id);
          if (res2.vehicle) {
            return (
              [res2.vehicle.vehicle_number, res2.vehicle.vehicle_type]
                .filter(Boolean)
                .join(" · ") || id
            );
          }
        }
      }
      return id;
    };
    const driverPromises = Array.from(driverIds).map(async (id) => ({
      id,
      name: await resolveDriverDisplay(id),
    }));
    const vehiclePromises = Array.from(vehicleIds).map(async (id) => ({
      id,
      label: await resolveVehicleDisplay(id),
    }));
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
  }, [
    trip?.organization_id,
    trip?.supplier_id,
    assignmentAuditRows,
    currentOrganization?.id,
  ]);

  /** Primary driver card + vehicle label. Skipped on bundle path — driver/vehicle seeded from RPC. */
  useEffect(() => {
    if (bundleActive && bundleSeededRef.current) return;
    if (!trip?.organization_id) {
      setDriverName(null);
      setDriverPhone(null);
      setDriverAvatarUri(null);
      setVehicleLabel(null);
      setVehicleDocs(null);
      setDriverLinked(false);
      return;
    }
    const fallbackDriverName = (trip.driver_display_name ?? "").trim() || null;
    let cancelled = false;
    const orgId = trip.organization_id;
    const resolveDriverAvatarUri = async (
      driverId: string,
      candidateUrl?: string | null,
    ) => {
      let rawAvatar = (candidateUrl ?? "").trim();
      if (!rawAvatar) {
        const profileRes = await getDriverProfileDisplay(driverId);
        rawAvatar = (profileRes.profile?.avatarUrl ?? "").trim();
      }
      if (!rawAvatar) return null;
      if (rawAvatar.startsWith("http://") || rawAvatar.startsWith("https://")) {
        return rawAvatar;
      }
      const signed = await getSignedAvatarUrl(rawAvatar);
      return signed ?? null;
    };
    if (trip.driver_id) {
      setDriverName(fallbackDriverName);
      setDriverPhone(null);
      setDriverAvatarUri(null);
      setDriverLinked(false);
      getDriverById(orgId, trip.driver_id).then((res) => {
        if (cancelled) return;
        const d = res.driver;
        if (d) {
          const fromDriver = (d.name || d.phone || "").trim() || null;
          setDriverName(fromDriver ?? fallbackDriverName ?? "—");
          setDriverPhone((d.phone ?? "").trim() || null);
          setDriverLinked(!!d.user_id);
          void resolveDriverAvatarUri(trip.driver_id!, d.avatar_url ?? null).then(
            (uri) => {
              if (!cancelled) setDriverAvatarUri(uri);
            },
          );
          return;
        }
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
                  setDriverPhone((d2.phone ?? "").trim() || null);
                  setDriverLinked(!!d2.user_id);
                  void resolveDriverAvatarUri(trip.driver_id!, d2.avatar_url ?? null).then(
                    (uri) => {
                      if (!cancelled) setDriverAvatarUri(uri);
                    },
                  );
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
            setDriverPhone(null);
            void resolveDriverAvatarUri(trip.driver_id!, null).then((uri) => {
              if (!cancelled) setDriverAvatarUri(uri);
            });
            setDriverLinked(false);
            return;
          }
          getDriverById(viewerOrgId, trip.driver_id!).then((res3) => {
            if (cancelled) return;
            const d3 = res3.driver;
            const fromDriver3 = d3
              ? (d3.name || d3.phone || "").trim() || null
              : null;
            setDriverName(fromDriver3 ?? fallbackDriverName ?? "—");
            setDriverPhone((d3?.phone ?? "").trim() || null);
            void resolveDriverAvatarUri(trip.driver_id!, d3?.avatar_url ?? null).then(
              (uri) => {
                if (!cancelled) setDriverAvatarUri(uri);
              },
            );
            setDriverLinked(!!d3?.user_id);
          });
        };
        trySupplierOrgThenViewerOrg();
      });
    } else {
      setDriverName(fallbackDriverName);
      setDriverAvatarUri(null);
      setDriverLinked(false);
    }
    const aggregateVehicleDisplay = (trip.vehicle_display_number ?? "").trim();
    if (isAggregateTrip(trip) && aggregateVehicleDisplay) {
      setVehicleLabel(formatIndianVehicleNumber(aggregateVehicleDisplay));
      setVehicleDocs(null);
    } else if (trip.vehicle_id) {
      const applyVehicleRow = (v: NonNullable<Awaited<ReturnType<typeof getVehicleById>>["vehicle"]>) => {
        const parts = [v.vehicle_number];
        if (v.vehicle_type) parts.push(v.vehicle_type);
        setVehicleLabel(parts.join(" · "));
        setVehicleDocs(v.documents ?? null);
      };
      getVehicleById(orgId, trip.vehicle_id).then((res) => {
        if (cancelled) return;
        if (res.vehicle) {
          applyVehicleRow(res.vehicle);
          return;
        }
        if (!trip.supplier_id) return;
        getSupplierById(orgId, trip.supplier_id).then((r) => {
          if (cancelled) return;
          const linkedOrgId = r.supplier?.linked_organization_id;
          if (!linkedOrgId) return;
          getVehicleById(linkedOrgId, trip.vehicle_id!).then((res2) => {
            if (cancelled || !res2.vehicle) return;
            applyVehicleRow(res2.vehicle);
          });
        });
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
    return () => {
      cancelled = true;
    };
  }, [trip, currentOrganization?.id]);

  useEffect(() => {
    let cancelled = false;
    const ownerOrg = trip?.organization_id ?? currentOrganization?.id ?? null;
    const resolvePartyAvatarUri = async (raw: string | null | undefined) => {
      const value = (raw ?? "").trim();
      if (!value) return null;
      if (value.startsWith("http://") || value.startsWith("https://")) return value;
      return (await getSignedAvatarUrl(value)) ?? null;
    };

    setClientAvatarUri(null);
    setSupplierAvatarUri(null);
    setClientPartyAvatarFields(null);
    setSupplierPartyAvatarFields(null);
    if (!bundleActive || !bundleSeededRef.current) {
      setClientPartyRes(null);
      setSupplierPartyRes(null);
      setPartnerName(null);
    }
    if (!trip || !ownerOrg) return;

    void (async () => {
      if (trip.client_id) {
        const fields = emptyTripPartyAvatarFields();
        let rawAvatar = "";
        const details = await getClientDetails(trip.client_id);
        if (!cancelled && details.client) {
          fields.avatarUrl = nStr(details.client.avatar_url);
          fields.avatarSeed = nStr(details.client.avatar_seed);
          if (details.client.linked_organization_id) {
            const linked = await getLinkedOrgProfile(details.client.linked_organization_id);
            if (!cancelled && linked.profile) {
              fields.organizationImageUrl = nStr(linked.profile.avatarUrl);
              fields.organizationAvatarSeed = nStr(linked.profile.avatarSeed);
            }
          }
        }
        if (!cancelled && details.client?.avatar_url) rawAvatar = details.client.avatar_url;
        if (!rawAvatar && details.client?.linked_organization_id) {
          const linked = await getLinkedOrgProfile(details.client.linked_organization_id);
          if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
        }
        if (!rawAvatar) {
          const { client } = await getClientById(ownerOrg, trip.client_id);
          if (!cancelled && client) {
            if (!fields.avatarUrl) fields.avatarUrl = nStr(client.avatar_url);
            if (!fields.avatarSeed) fields.avatarSeed = nStr(client.avatar_seed);
            if (!fields.organizationImageUrl && client.linked_organization_id) {
              const linked = await getLinkedOrgProfile(client.linked_organization_id);
              if (!cancelled && linked.profile) {
                if (!fields.organizationImageUrl)
                  fields.organizationImageUrl = nStr(linked.profile.avatarUrl);
                if (!fields.organizationAvatarSeed)
                  fields.organizationAvatarSeed = nStr(linked.profile.avatarSeed);
              }
            }
            if (!cancelled && client.avatar_url) rawAvatar = client.avatar_url;
            if (!rawAvatar && client.linked_organization_id) {
              const linked = await getLinkedOrgProfile(client.linked_organization_id);
              if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
            }
          }
        }
        const uri = await resolvePartyAvatarUri(rawAvatar || null);
        if (!cancelled) {
          setClientPartyAvatarFields(fields);
          setClientAvatarUri(uri);
        }
        let clientRow = details.client;
        if (!clientRow) {
          const { client } = await getClientById(ownerOrg, trip.client_id);
          clientRow = client;
        }
        if (!cancelled && clientRow) {
          setClientPartyRes({
            name: pickClientDisplayName(clientRow),
            integrated: isIntegratedClientRow(clientRow),
            orgId: nStr(clientRow.linked_organization_id),
          });
        }
      }

      if (trip.supplier_id) {
        const fields = emptyTripPartyAvatarFields();
        let rawAvatar = "";
        const details = await getSupplierDetails(trip.supplier_id);
        if (!cancelled && details.supplier) {
          fields.avatarUrl = nStr(details.supplier.avatar_url);
          fields.avatarSeed = nStr(details.supplier.avatar_seed);
          if (details.supplier.linked_organization_id) {
            const linked = await getLinkedOrgProfileForSupplier(
              details.supplier.linked_organization_id,
            );
            if (!cancelled && linked.profile) {
              fields.organizationImageUrl = nStr(linked.profile.avatarUrl);
              fields.organizationAvatarSeed = nStr(linked.profile.avatarSeed);
            }
          }
        }
        if (!cancelled && details.supplier?.avatar_url) rawAvatar = details.supplier.avatar_url;
        if (!rawAvatar && details.supplier?.linked_organization_id) {
          const linked = await getLinkedOrgProfileForSupplier(details.supplier.linked_organization_id);
          if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
        }
        if (!rawAvatar) {
          const { supplier } = await getSupplierById(ownerOrg, trip.supplier_id);
          if (!cancelled && supplier) {
            if (!fields.avatarUrl) fields.avatarUrl = nStr(supplier.avatar_url);
            if (!fields.avatarSeed) fields.avatarSeed = nStr(supplier.avatar_seed);
            if (!fields.organizationImageUrl && supplier.linked_organization_id) {
              const linked = await getLinkedOrgProfileForSupplier(supplier.linked_organization_id);
              if (!cancelled && linked.profile) {
                if (!fields.organizationImageUrl)
                  fields.organizationImageUrl = nStr(linked.profile.avatarUrl);
                if (!fields.organizationAvatarSeed)
                  fields.organizationAvatarSeed = nStr(linked.profile.avatarSeed);
              }
            }
            if (!cancelled && supplier.avatar_url) rawAvatar = supplier.avatar_url;
            if (!rawAvatar && supplier.linked_organization_id) {
              const linked = await getLinkedOrgProfileForSupplier(supplier.linked_organization_id);
              if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
            }
          }
        }
        const viewerOrgId = currentOrganization?.id;
        if (!rawAvatar && viewerOrgId && viewerOrgId !== ownerOrg) {
          const { supplier } = await getSupplierById(viewerOrgId, trip.supplier_id);
          if (!cancelled && supplier?.avatar_url) rawAvatar = supplier.avatar_url;
        }
        const uri = await resolvePartyAvatarUri(rawAvatar || null);
        if (!cancelled) {
          setSupplierPartyAvatarFields(fields);
          setSupplierAvatarUri(uri);
        }

        const pick = pickSupplierDisplayName;
        let supplierRow = details.supplier;
        if (!supplierRow) {
          const { supplier, error: errOwner } = await getSupplierById(ownerOrg, trip.supplier_id);
          if (!errOwner) supplierRow = supplier;
        }
        if (!supplierRow && viewerOrgId && viewerOrgId !== ownerOrg) {
          const { supplier, error: errViewer } = await getSupplierById(
            viewerOrgId,
            trip.supplier_id,
          );
          if (!errViewer) supplierRow = supplier;
        }
        const fallback = (trip.supplier_name ?? "").trim() || null;
        const supplierName = supplierRow ? pick(supplierRow) ?? fallback : fallback;
        if (!cancelled) {
          setPartnerName(supplierName);
          if (supplierRow || supplierName) {
            setSupplierPartyRes({
              name: supplierName,
              integrated: supplierRow
                ? isIntegratedSupplierRow(supplierRow)
                : false,
              orgId: supplierRow
                ? nStr(supplierRow.linked_organization_id)
                : null,
            });
          } else {
            setSupplierPartyRes(null);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    trip?.id,
    trip?.client_id,
    trip?.supplier_id,
    trip?.supplier_name,
    trip?.organization_id,
    currentOrganization?.id,
    bundleActive,
  ]);

  useEffect(() => {
    if (!trip) {
      setCounterpartyIntegrated(null);
      setPartnerOrgId(null);
      return;
    }
    if (!clientPartyRes && !supplierPartyRes) {
      setCounterpartyIntegrated(null);
      setPartnerOrgId(null);
      return;
    }
    setCounterpartyIntegrated(
      !!(clientPartyRes?.integrated || supplierPartyRes?.integrated),
    );
    setPartnerOrgId(supplierPartyRes?.orgId ?? clientPartyRes?.orgId ?? null);
  }, [trip, clientPartyRes, supplierPartyRes]);

  useEffect(() => {
    setDisplayVehicleFromInput("");
  }, [tripId]);

  const loadTripOtp = useCallback(() => {
    const hasDriverAssigned = !!trip?.driver_id;
    const hasVehicleAssigned =
      !!trip?.vehicle_id || !!String(trip?.vehicle_display_number ?? "").trim();
    const isAggregateTripFlag = isAggregateTrip(trip);
    // Load OTP when:
    //   A) aggregate trip with driver + vehicle assigned (original path), OR
    //   B) any trip where the assigned driver row has no user_id yet (unlinked
    //      tracking-only driver) — dispatcher needs the code to share with the driver.
    const needsOtp =
      (isAggregateTripFlag && hasDriverAssigned && hasVehicleAssigned) ||
      (!isAggregateTripFlag && hasDriverAssigned && !driverLinked);
    if (!trip?.id || !needsOtp) {
      setTripOtp(null);
      return;
    }
    getTripOtpForDisplay(trip.id).then(({ error, code, expires_at }) => {
      if (error) setTripOtp(null);
      else setTripOtp({ code: code ?? null, expires_at: expires_at ?? null });
    });
  }, [trip?.id, trip?.supplier_id, trip?.driver_id, trip?.vehicle_id, trip?.vehicle_display_number, driverLinked]);

  const loadTripDocuments = useCallback(() => {
    if (!tripId) return;
    tripDocumentsService
      .getDocumentsByTripId(tripId)
      .then(({ documents, error }) => {
        if (error) setTripDocuments([]);
        else setTripDocuments(documents ?? []);
      });
  }, [tripId]);

  // Ops has no other signal for a driver-uploaded document (e.g. POD) — trip_documents
  // has no org-scoped realtime coverage elsewhere, so this per-trip subscription is the
  // only way this screen learns about a new upload without a manual refresh.
  useRealtimeTripDocuments(tripId ?? null, loadTripDocuments);

  const fetchDriverLocationFromDb = useCallback(async () => {
    if (!trip?.id) return;
    const driverId = effectiveDriverIdForLocation;
    setDriverLocationLoading(true);
    try {
      const [latestRes, historyByTrip] = await Promise.all([
        driverLocationService.getLatestDriverLocationForTripOrDriver(trip.id, driverId),
        driverLocationService.getTripLocationHistory(
          trip.id,
          TRIP_TRACKING_HISTORY_FETCH_LIMIT,
        ),
      ]);
      let effectivePoints = !historyByTrip.error ? historyByTrip.points : [];
      if (effectivePoints.length === 0 && driverId) {
        const historyByDriver =
          await driverLocationService.getDriverLocationHistoryByDriverId(driverId);
        if (!historyByDriver.error) effectivePoints = historyByDriver.points;
      }
      const latest = latestRes.error ? null : (latestRes.location ?? null);
      setDriverLocation(latest);
      setTripLocationPoints(
        effectivePoints.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          recorded_at: p.recorded_at,
        })),
      );
    } catch {
      // Location fetch failed silently — UI shows offline state
    } finally {
      setDriverLocationLoading(false);
    }
  }, [trip?.id, effectiveDriverIdForLocation]);

  const handleRefresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    load();
    loadAdjustments();
    loadAssignmentAudit();
    loadTripDocuments();
    setFinanceRefreshKey((k) => k + 1);
    refetchTransactionsRef.current();
    if (bundleActive && tripId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
    }
  }, [load, loadAdjustments, loadAssignmentAudit, loadTripDocuments, tripId, queryClient]);


  /** Immediate refresh after assignment/reassignment actions. */
  const handleAssignmentUpdated = useCallback(() => {
    load();
    loadAssignmentAudit();
    loadAdjustments();
    loadTripDocuments();
    setFinanceRefreshKey((k) => k + 1);
    refetchTransactionsRef.current();
    loadTripOtp();
    if (bundleActive && tripId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
    }
  }, [load, loadAssignmentAudit, loadAdjustments, loadTripDocuments, loadTripOtp, tripId, queryClient]);

  // ── Reconciliation actions ────────────────────────────────────────────────
  const refreshTripDispute = useCallback(() => {
    if (!orgId) return;
    void qc.invalidateQueries({ queryKey: queryKeys.disputes.all(orgId) });
  }, [orgId, qc]);

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
      router.push(`/(modals)/compare-verify?tripId=${trip.id}&partnerOrgId=${orgToUse}` as never);
    },
    [trip?.id, clientPartyRes, supplierPartyRes, partnerOrgId, router],
  );

  // ── Entry modal ───────────────────────────────────────────────────────────
  const openAddEntry = useCallback(() => {
    if (!trip?.id) return;
    openTripLedgerEntryChooser({
      trip,
      router,
      displayClientName: displayClientName ?? null,
      clientIdFromContext: clientIdFromContext ?? null,
      clientNameFromContext: clientNameFromContext ?? null,
      partnerName: partnerName ?? null,
      driverDisplayName: driverName,
      labels: {
        addTransaction: t("addEntry"),
      },
    });
  }, [
    trip,
    router,
    clientIdFromContext,
    clientNameFromContext,
    partnerName,
    displayClientName,
    driverName,
    t,
  ]);

  /** Cash OUT / trip expense — same query shape as TripLedgerDetailScreen.onAddExpense. */
  const openAddExpense = useCallback(() => {
    if (!trip?.id) return;
    const tripNumber = getTripDisplayNumber(trip);
    const params = new URLSearchParams({
      tripId: trip.id,
      tripNumber,
      defaultType: "out",
    });

    const sales = Number(trip.client_price ?? 0);
    const received = tripLedgerEntries.reduce(
      (s, tx) => s + Number(tx.amount_in ?? 0),
      0,
    );
    const pendingAmt = Math.max(0, sales - received);

    const supplierCost = Number(trip.supplier_rate ?? 0);
    const paidOut = tripLedgerEntries.reduce(
      (s, tx) => s + Number(tx.amount_out ?? 0),
      0,
    );
    const supplierDueAmt = Math.max(0, supplierCost - paidOut);

    if (pendingAmt > 0) params.set("dueAmountIn", String(pendingAmt));
    if (supplierDueAmt > 0) params.set("dueAmountOut", String(supplierDueAmt));

    if (entryContext === "supplier" && trip.supplier_id) {
      params.set("partyContext", "suppliers");
      params.set("partyId", trip.supplier_id);
      if (partnerName) params.set("partyName", partnerName);
    } else if (entryContext === "client" && (clientIdFromContext ?? trip.client_id)) {
      params.set("partyContext", "customers");
      params.set("partyId", clientIdFromContext ?? trip.client_id ?? "");
      const name = clientNameFromContext ?? displayClientName ?? trip.client_name ?? "";
      if (name) params.set("partyName", name);
    } else if (entryContext === "vehicle" && trip.vehicle_id) {
      params.set("entityType", "VEHICLE");
      params.set("entityId", trip.vehicle_id);
    }

    router.push(`/(modals)/ledger-sync?${params.toString()}`);
  }, [
    trip,
    tripLedgerEntries,
    entryContext,
    partnerName,
    clientIdFromContext,
    clientNameFromContext,
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

  const closeTripAdjustmentModal = useCallback(() => {
    setShowAdjustmentModal(false);
    setAdjustmentModalPreset(null);
  }, []);

  const openTripAdjustmentModal = useCallback(
    (
      preset: {
        type?: TripAdjustmentType;
        impact?: TripAdjustmentImpact;
        reasonSeed?: string | null;
      } | null = null,
    ) => {
      setAdjustmentModalPreset(preset);
      setShowAdjustmentModal(true);
    },
    [],
  );

  // ── Adjustment handlers ───────────────────────────────────────────────────
  const handleAddAdjustment = useCallback(() => {
    openTripAdjustmentModal(null);
  }, [openTripAdjustmentModal]);

  /** Maps to Finance Overview “Additional Income” (revenue + addition). */
  const openClientIncomeAdjustment = useCallback(() => {
    openTripAdjustmentModal({ type: "revenue", impact: "plus" });
  }, [openTripAdjustmentModal]);

  /** Maps to Finance Overview “Deductions” (revenue + deduction). */
  const openClientDeductionAdjustment = useCallback(() => {
    openTripAdjustmentModal({ type: "revenue", impact: "minus" });
  }, [openTripAdjustmentModal]);

  /** Supplier cost increases (cost + addition). */
  const openSupplierCostAdditionAdjustment = useCallback(() => {
    openTripAdjustmentModal({ type: "cost", impact: "plus" });
  }, [openTripAdjustmentModal]);

  /** Supplier cost reductions (credit to cost). */
  const openSupplierCostReductionAdjustment = useCallback(() => {
    openTripAdjustmentModal({ type: "cost", impact: "minus" });
  }, [openTripAdjustmentModal]);

  const handleSaveAdjustment = useCallback(
    async (params: {
      type: "revenue" | "cost";
      impact: "plus" | "minus";
      amount: number;
      reason: string;
    }) => {
      if (!trip?.id) return;
      // Row must pass trip org check + RLS; prefer trip owner over UI org context.
      const orgId =
        trip.organization_id?.trim() || currentOrganization?.id || null;
      const missionRaw = getTripOperationalDisplay({
        trip_operational_code: trip.trip_operational_code ?? null,
        trip_code: trip.trip_code ?? null,
        display_trip_id: trip["display_trip_id"] ?? null,
        trip_number: trip["trip_number"] ?? null,
      });
      await addTripAdjustment(
        trip.id,
        params,
        orgId
          ? { organizationId: orgId, missionKey: missionRaw === "—" ? null : missionRaw }
          : undefined,
      );
      await loadAdjustments();
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
      });
    },
    [trip, currentOrganization?.id, loadAdjustments, queryClient],
  );

  const handleVoidAdjustment = useCallback(
    async (adjustmentId: string, voidReason: string) => {
      if (!trip?.id) return;
      const r = String(voidReason ?? "").trim();
      if (!r) return;
      await voidTripAdjustment(trip.id, adjustmentId, r);
      await loadAdjustments();
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
      });
    },
    [trip?.id, loadAdjustments, queryClient],
  );

  const handleUpdateAdjustment = useCallback(
    async (
      adjustmentId: string,
      params: {
        type: TripAdjustmentType;
        impact: TripAdjustmentImpact;
        amount: number;
        reason: string;
      },
    ) => {
      if (!trip?.id) return;
      await updateTripAdjustment(trip.id, adjustmentId, params);
      await loadAdjustments();
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
      });
    },
    [trip?.id, loadAdjustments, queryClient],
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

  // Phase 3b: seed all state from bundle on initial mount and on bundle cache refresh.
  // Individual load effects below are guarded by bundleActive so they do not
  // fire their own DB calls when the bundle path is active.
  useEffect(() => {
    if (!bundle) return;
    bundleSeededRef.current = true;

    setTrip(bundle.trip as unknown as TripRow);
    setLoading(false);
    setError(null);
    loadCompletedForIdRef.current = bundle.trip.id;
    initialLoadDoneRef.current = true;

    const sorted = [...bundle.assignment_audit].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
    );
    setAssignmentAuditRows(sorted as unknown as TripAssignmentAuditRow[]);

    const driverNames: Record<string, string> = {};
    const vehicleLabels: Record<string, string> = {};
    for (const aa of bundle.assignment_audit) {
      if (aa.driver_id_new && aa.driver_new_name) driverNames[aa.driver_id_new] = aa.driver_new_name;
      if (aa.driver_id_prev && aa.driver_prev_name) driverNames[aa.driver_id_prev] = aa.driver_prev_name;
      if (aa.vehicle_id_new && aa.vehicle_new_label) vehicleLabels[aa.vehicle_id_new] = aa.vehicle_new_label;
      if (aa.vehicle_id_prev && aa.vehicle_prev_label) vehicleLabels[aa.vehicle_id_prev] = aa.vehicle_prev_label;
    }
    setAssignmentDriverNames(driverNames);
    setAssignmentVehicleLabels(vehicleLabels);

    setAdjustments(bundle.adjustments as unknown as TripAdjustment[]);
    setTripDocuments(
      bundle.documents.map((d) => ({
        ...(d as unknown as tripDocumentsService.TripDocumentRow),
        document_type: (d as any).document_type ?? 'pod',
      })),
    );

    if (bundle.otp) {
      setTripOtp({ code: bundle.otp.code, expires_at: bundle.otp.expires_at });
    }
    if (bundle.latest_driver_location) {
      setDriverLocation(bundle.latest_driver_location);
    }
    if (bundle.driver) {
      const d = bundle.driver;
      setDriverName((d.name || d.phone || '').trim() || (bundle.trip as unknown as TripRow).driver_display_name || null);
      setDriverPhone((d.phone ?? "").trim() || null);
      setDriverLinked(!!d.user_id);
    }
    if (bundle.vehicle) {
      const v = bundle.vehicle;
      setVehicleLabel([v.vehicle_number, v.vehicle_type].filter(Boolean).join(' · '));
      setVehicleDocs((v.documents ?? null) as unknown as VehicleDocuments | null);
    }

    const tripRow = bundle.trip as unknown as TripRow;
    if (bundle.client_detail?.client) {
      const c = bundle.client_detail.client;
      const linkedId = nStr(c.linked_organization_id);
      setClientPartyRes({
        name: pickClientDisplayName(c),
        integrated: !!linkedId,
        orgId: linkedId,
      });
    } else {
      setClientPartyRes(null);
    }

    if (bundle.supplier_detail?.supplier) {
      const s = bundle.supplier_detail.supplier;
      const linkedId = nStr(s.linked_organization_id);
      const supplierName =
        pickSupplierDisplayName(s) ?? nStr(tripRow.supplier_name);
      setPartnerName(supplierName);
      setSupplierPartyRes({
        name: supplierName,
        integrated: !!linkedId,
        orgId: linkedId,
      });
    } else {
      const fallbackSupplierName = nStr(tripRow.supplier_name);
      setPartnerName(fallbackSupplierName);
      setSupplierPartyRes(
        fallbackSupplierName
          ? { name: fallbackSupplierName, integrated: false, orgId: null }
          : null,
      );
    }
  }, [bundle]);

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

  // Initial load — skipped on bundle path (bundle seeding effect owns initial hydration)
  useEffect(() => {
    if (bundleActive) return;
    load();
  }, [load]);

  // Supplier retry when org becomes available
  useEffect(() => {
    if (!tripId || !currentOrganization?.id || trip !== null || loading) return;
    if (supplierRetryForTripIdRef.current === tripId) return;
    supplierRetryForTripIdRef.current = tripId;
    setLoading(true);
    load();
  }, [tripId, currentOrganization?.id, trip, loading, load]);

  // Adjustments + audit on mount — skipped on bundle path (bundle seeding effect provides both)
  useEffect(() => {
    if (bundleActive) return;
    if (tripId) loadAdjustments();
  }, [tripId, loadAdjustments]);
  useEffect(() => {
    if (bundleActive) return;
    if (tripId) loadAssignmentAudit();
  }, [tripId, loadAssignmentAudit]);

  // Trip documents — skipped on bundle path (bundle seeding effect provides documents)
  useEffect(() => {
    if (bundleActive && bundleSeededRef.current) return;
    if (trip?.id) loadTripDocuments();
    else setTripDocuments([]);
  }, [trip?.id, loadTripDocuments]);

  useEffect(() => {
    if (!selectedDoc) {
      podModalRefetchDoneRef.current = false;
    }
  }, [selectedDoc]);

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

  useEffect(() => {
    if (!selectedDoc) {
      return;
    }
    if (!selectedDoc.id.startsWith("pod") || docPreviewStoragePath || !tripId) return;
    if (podModalRefetchDoneRef.current) return;
    podModalRefetchDoneRef.current = true;
    loadTripDocuments();
  }, [selectedDoc, docPreviewStoragePath, tripId, loadTripDocuments]);

  // OTP — skipped on bundle path (bundle seeding effect provides otp or null)
  useEffect(() => {
    if (bundleActive && bundleSeededRef.current) return;
    if (trip?.id && (isAggregateTrip(trip) || (!!trip.driver_id && !driverLinked))) {
      loadTripOtp();
    } else {
      setTripOtp(null);
    }
  }, [trip?.id, trip?.supplier_id, trip?.driver_id, driverLinked, loadTripOtp]);

  // Driver_locations history + latest fix (mobile app pings) — always for assigned / in-transit trips.
  useEffect(() => {
    if (!driverMapDataEnabled) {
      setDriverLocation(null);
      setTripLocationPoints([]);
      setDriverLocationLoading(false);
      return;
    }
    void fetchDriverLocationFromDb();
  }, [
    driverMapDataEnabled,
    trip?.id,
    effectiveDriverIdForLocation,
    fetchDriverLocationFromDb,
  ]);

  // Live tracking seed/trail: TanStack Query key is [tripId, driverId] — driver change refetches once, no per-render loop.

  // Phase 3c: on trip status/update events, fetch latest location only — history unchanged by status transitions.
  useEffect(() => {
    if (!trip?.id || !effectiveDriverIdForLocation) return;
    void driverLocationService.getLatestDriverLocationForTripOrDriver(trip.id, effectiveDriverIdForLocation)
      .then(res => { if (!res.error && res.location) setDriverLocation(res.location); });
   
  }, [trip?.updated_at, trip?.status, effectiveDriverIdForLocation, trip?.id]);

  useTrackingTripBroadcast({
    tripId: trip?.id ?? null,
    enabled: trackingBroadcastEnabled,
    // Only the ISO timestamp escapes into React — coordinates go exclusively to TripTrackingMapStore.
    onTimestamp: (ts) => {
      lastBroadcastTimestampRef.current = ts;
    },
    onReseed: () => {
      liveTracking.reseed();
    },
  });

  // Flush broadcast timestamp ref → React state at 1s cadence (drives "Updated X min ago" label).
  useEffect(() => {
    if (!trackingBroadcastEnabled) return;
    const id = globalThis.setInterval(() => {
      const ts = lastBroadcastTimestampRef.current;
      if (ts) setLastSeenAt(ts);
    }, 1000);
    return () => globalThis.clearInterval(id);
  }, [trackingBroadcastEnabled]);

  // Geocode live position from store (broadcast path) — no driverLocation state dependency.
  useEffect(() => {
    if (!trackingBroadcastEnabled || !trip?.id) return;
    const store = getTripTrackingMapStore(trip.id);
    const unsub = store.subscribe((point) => {
      if (!point) return;
      const roundedLat = Math.round(point.latitude * 1000) / 1000;
      const roundedLng = Math.round(point.longitude * 1000) / 1000;
      const last = lastGeocodedLocRef.current;
      if (last && last.lat === roundedLat && last.lng === roundedLng) return;
      lastGeocodedLocRef.current = { lat: roundedLat, lng: roundedLng };
      void resolveMapLocationLabel(point.latitude, point.longitude, { mode: 'full' }).then((label) => {
        setDriverLocationAddress(label);
      });
    });
    return unsub;
  }, [trackingBroadcastEnabled, trip?.id]);

  /**
   * Legacy WAL path — disabled when EXPO_PUBLIC_TRACKING_BROADCAST_V1=1.
   * Preserved for rollout; removes postgres_changes fanout at scale.
   */
  useRealtimeDriverLocations(
    trackingBroadcastEnabled ? null : trip?.id ?? null,
    trackingBroadcastEnabled ? null : effectiveDriverIdForLocation,
    (payload) => {
      if (payload.eventType !== "INSERT" || !payload.new) return;
      const raw = payload.new as Record<string, unknown>;
      const locId = raw.id as string | undefined;
      if (!locId || locId === lastSeenLocationIdRef.current) return;
      lastSeenLocationIdRef.current = locId;
      const loc: driverLocationService.DriverLocationRow = {
        latitude: raw.latitude as number,
        longitude: raw.longitude as number,
        accuracy: (raw.accuracy as number | null) ?? null,
        recorded_at: raw.recorded_at as string,
      };
      setDriverLocation(loc);
      setTripLocationPoints((prev) => [
        ...prev,
        {
          latitude: loc.latitude,
          longitude: loc.longitude,
          recorded_at: loc.recorded_at,
        },
      ]);
    },
  );

  /**
   * Phase 3c: fallback poll fetches latest location only (not history).
   * History is established at initial mount and updated via realtime payload merge.
   * 1 DB call per 60s vs 2-3 calls previously.
   * Disabled when broadcast is active — broadcast updates arrive at 30s cadence.
   */
  useEffect(() => {
    if (!driverMapDataEnabled || tripCompleted) return;
    const id = globalThis.setInterval(() => {
      void fetchDriverLocationFromDb();
    }, 60_000);
    return () => globalThis.clearInterval(id);
  }, [driverMapDataEnabled, tripCompleted, fetchDriverLocationFromDb]);

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
    let isActive = true;
    getRatingsForTrip(trip.id).then(({ error, ratings }) => {
      if (!isActive || error) return;
      const driverRatings = (ratings ?? []).filter((r) => r.rated_type === "driver");
      setTripRatings(driverRatings);
    });
    return () => {
      isActive = false;
    };
  }, [trip?.id, tripCompleted]);

  // Driver location — Mapbox/Nominatim label (no raw lat/lon in UI).
  // When broadcast is active, the store subscriber above handles geocoding instead.
  useEffect(() => {
    if (trackingBroadcastEnabled) return;
    if (!driverLocation) {
      setDriverLocationAddress(null);
      return;
    }
    // Only re-geocode when position moves > ~100m (3 decimal degrees ≈ 111m).
    const roundedLat = Math.round(driverLocation.latitude * 1000) / 1000;
    const roundedLng = Math.round(driverLocation.longitude * 1000) / 1000;
    const last = lastGeocodedLocRef.current;
    if (last && last.lat === roundedLat && last.lng === roundedLng) return;
    lastGeocodedLocRef.current = { lat: roundedLat, lng: roundedLng };
    let isActive = true;
    void resolveMapLocationLabel(
      driverLocation.latitude,
      driverLocation.longitude,
      { mode: "full" },
    ).then((label) => {
      if (!isActive) return;
      setDriverLocationAddress(label);
    });
    return () => {
      isActive = false;
    };
  }, [driverLocation?.latitude, driverLocation?.longitude, trackingBroadcastEnabled]);

  // Past location labels (last 2 checkpoints) for map stage markers
  useEffect(() => {
    const past = liveTracking.trail.slice(-2).reverse();
    setPastLocationAddresses([null, null]);
    if (past.length === 0) return;
    let isActive = true;
    past.forEach((pt, i) => {
      void resolveMapLocationLabel(pt.latitude, pt.longitude, { mode: "city" }).then(
        (label) => {
          if (!isActive) return;
          setPastLocationAddresses((prev) => {
            const next: [string | null, string | null] = [...prev];
            next[i] = label;
            return next;
          });
        },
      );
    });
    return () => {
      isActive = false;
    };
  }, [liveTracking.trail]);

  // Location trail — batch reverse geocode (up to 10 recent checkpoints)
  useEffect(() => {
    type TrailRow = { latitude: number; longitude: number; recorded_at: string; locationName: string | null };
    setLocationTrailWithNames(
      liveTracking.trail.map((p) => ({ ...p, locationName: null })),
    );
    if (liveTracking.trail.length === 0) return;
    let isActive = true;
    void resolveMapLocationLabelsBatch(liveTracking.trail, {
      maxResolve: TRACKING_LOCATION_GEOCODE_MAX,
      mode: "full",
      onProgress: (resolved) => {
        if (isActive) setLocationTrailWithNames(resolved as TrailRow[]);
      },
    }).then((resolved) => {
      if (isActive) setLocationTrailWithNames(resolved as TrailRow[]);
    });
    return () => {
      isActive = false;
    };
  }, [liveTracking.trail]);

  // Clear "waiting for new driver" when presence arrives for the assigned driver.
  useEffect(() => {
    if (!waitingForNewDriverLocation) return;
    const driverId = trip?.driver_id;
    const seed = liveTracking.seedPoint;
    if (
      driverId &&
      seed &&
      seed.driver_id === driverId &&
      seed.trip_id === trip?.id
    ) {
      setWaitingForNewDriverLocation(false);
    }
  }, [
    waitingForNewDriverLocation,
    trip?.driver_id,
    trip?.id,
    liveTracking.seedPoint,
  ]);

  useEffect(() => {
    if (!waitingForNewDriverLocation) return;
    const t = setTimeout(() => setWaitingForNewDriverLocation(false), 60_000);
    return () => clearTimeout(t);
  }, [waitingForNewDriverLocation]);

  /**
   * After reassign: refresh trip row, assignment audit, finance labels, documents, adjustments, OTP.
   * Reseed is driven by effectiveDriverIdForLocation effect — not called directly here
   * to avoid stale driver_id on seed.
   *
   * Intentionally excluded vs handleAssignmentUpdated:
   * - refetchTransactionsRef — ledger transaction list unchanged by driver/vehicle swap alone
   * - no duplicate audit pipeline beyond loadAssignmentAudit()
   */
  const handleReassignCompleted = useCallback(
    async (meta?: { driverIdChanged?: boolean }) => {
      await load();
      loadAssignmentAudit();
      loadAdjustments();
      loadTripDocuments();
      setFinanceRefreshKey((k) => k + 1);
      loadTripOtp();
      if (meta?.driverIdChanged) {
        setWaitingForNewDriverLocation(true);
      }
      if (bundleActive && tripId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
      }
    },
    [
      load,
      loadAssignmentAudit,
      loadAdjustments,
      loadTripDocuments,
      loadTripOtp,
      bundleActive,
      tripId,
      queryClient,
    ],
  );

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
    driverPhone,
    driverAvatarUri,
    vehicleLabel,
    vehicleDocs,
    displayVehicleFromInput,
    setDisplayVehicleFromInput,
    driverLinked,
    partnerName,
    clientAvatarUri,
    supplierAvatarUri,
    clientPartyAvatarFields,
    supplierPartyAvatarFields,
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
    driverActivityTimelineRows,

    // Tracking
    driverLocation,
    driverLocationLoading,
    tripLocationPoints,
    locationTrailWithNames,
    driverLocationAddress,
    trackingMapLocationLabels,
    trackingMapOriginCoordinate,
    trackingMapDestinationCoordinate,
    isDriverOffline,
    effectiveDriverIdForLocation,
    /** @deprecated Use useTrackingState(tripId, tripStatus).broadcastActive instead. */
    trackingActive: trackingBroadcastEnabled,
    trackingTrail: liveTracking.trail,
    lastSeenAt,
    requestDriverPing: driverPing.requestPing,
    /** @deprecated Use useTrackingState(tripId, tripStatus, overrides).isPinging instead. */
    isPingingDriver: driverPing.isPinging,
    /** @deprecated Use useTrackingState(tripId, tripStatus, overrides).lastPingRespondedAt instead. */
    lastPingRespondedAt: driverPing.lastPingRespondedAt,
    /** UI-only — do not pass through useTrackingState overrides. True for 3s after ping timeout. */
    isPingTimedOut: driverPing.pingTimedOut,
    waitingForNewDriverLocation,

    // Documents
    tripDocuments,
    computedTripDocs,
    vehiclePreviewDocs,
    vehiclePreviewUrls,
    vehiclePreviewIndex,
    setVehiclePreviewIndex,
    activeVehiclePreviewDoc,
    isVehicleGalleryDoc,
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
    adjustmentModalPreset,
    closeTripAdjustmentModal,
    openClientIncomeAdjustment,
    openClientDeductionAdjustment,
    openSupplierCostAdditionAdjustment,
    openSupplierCostReductionAdjustment,
    openTripAdjustmentModal,
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
    handleAssignmentUpdated,
    handleReassignCompleted,
    openAddEntry,
    openAddExpense,
    handleAcceptPartnerView,
    handleRaiseDispute,
    openCompareVerifyFromTrip,
    handleAddAdjustment,
    handleSaveAdjustment,
    handleVoidAdjustment,
    handleUpdateAdjustment,
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
