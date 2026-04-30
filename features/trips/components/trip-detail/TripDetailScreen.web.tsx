/**
 * Web Trip Detail — two-tab layout.
 * "Tracking" tab (default): TripInfo + Assignment + Timeline + Map + LR Docs
 * "Finance" tab: Expenses + Finance Overview + Receivables
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { TripMap } from "./TripMap.web";
import { Theme } from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { TripRatingsBlock } from "@/features/ratings/components/TripRatingsBlock";
import { isAggregateTrip } from "@/lib/driverUtils";
import { formatINR, formatIndianVehicleNumber } from "@/lib/format";
import { getDocumentViewUrl } from "@/services/tripDocumentsService";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  adjustedCost,
  adjustedRevenue,
  COST_REASON_OPTIONS,
  REVENUE_REASON_OPTIONS,
  type TripAdjustmentImpact,
  type TripAdjustmentType,
  type TripAdjustment,
} from "../../services/tripAdjustments";
import { regenerateTripOtp } from "../../services/tripOtp.service";
import { getTripDisplayNumber } from "../../services/trips.service";
import { TripAssignmentBlock } from "../TripAssignmentBlock";
import { TripAdjustmentModal } from "./TripAdjustmentModal";
import type { TripDetailScreenProps } from "./TripDetailScreen.types";
import { useTripDetail } from "./hooks/useTripDetail";
import { type ExpenseRow } from "./sections/ExpensesTable";
import { LRDocumentsSection } from "./sections/LRDocumentsSection";
import {
    TripStatusTimeline,
    type TripStageTimestamp,
} from "./sections/TripStatusTimeline";

type Tab = "trip" | "finance" | "tracking" | "docs";

function formatLedgerDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const mi = Number(m);
  if (!y || !day || !Number.isFinite(mi) || mi < 1 || mi > 12) return "—";
  return `${day} ${months[mi - 1]} ${y}`;
}

function ledgerHistoryTitle(tx: LedgerRow, isIn: boolean) {
  const desc = tx.description?.trim();
  if (desc) return desc;
  if (isIn && tx.contact_type === "client") return "Customer payment";
  if (!isIn && tx.contact_type === "supplier") return "Supplier payment";
  if (!isIn && tx.contact_type === "driver") return "Driver payment";
  return isIn ? "Cash in" : "Cash out";
}

/** Revenue additions + supplier credits (cost −) improve simplified net. */
function adjustmentsCountingAsIncome(adjustments: TripAdjustment[]) {
  return adjustments.filter(
    (a) =>
      (a.type === "revenue" && a.impact === "plus") ||
      (a.type === "cost" && a.impact === "minus"),
  );
}

/** Revenue deductions + supplier add-ons (cost +) reduce simplified net. */
function adjustmentsCountingAsDeductions(adjustments: TripAdjustment[]) {
  return adjustments.filter(
    (a) =>
      (a.type === "revenue" && a.impact === "minus") ||
      (a.type === "cost" && a.impact === "plus"),
  );
}

function getInlineReasonOptions(
  type: TripAdjustmentType,
  impact: TripAdjustmentImpact,
): readonly string[] {
  if (type === "revenue" && impact === "plus") {
    return ["Loading Charges", "Unloading Charges", "Other"];
  }
  if (type === "revenue" && impact === "minus") {
    return ["Late Delivery", "Damages / Missing", "Other"];
  }
  if (type === "cost" && impact === "plus") {
    return COST_REASON_OPTIONS;
  }
  return ["Damages / Missing", "Other"];
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

/** Straight-line km between coordinates; ~×1.3 used as rough road distance when DB/map omit km. */
function haversineKmBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number | null {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  if (
    !Number.isFinite(a.latitude) ||
    !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) ||
    !Number.isFinite(b.longitude)
  )
    return null;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Number.isFinite(km) && km > 0 ? km : null;
}

const DISTANCE_CITY_COORDS: Record<string, [number, number]> = {
  mumbai: [19.076, 72.8777],
  delhi: [28.6139, 77.209],
  bangalore: [12.9716, 77.5946],
  bengaluru: [12.9716, 77.5946],
  chennai: [13.0827, 80.2707],
  kolkata: [22.5726, 88.3639],
  hyderabad: [17.385, 78.4867],
  ahmedabad: [23.0225, 72.5714],
  pune: [18.5204, 73.8567],
  shimla: [31.1048, 77.1734],
};

function inferCoordsFromLocationName(
  location: string | null | undefined,
): { latitude: number; longitude: number } | null {
  const raw = (location ?? "").trim().toLowerCase();
  if (!raw) return null;
  const firstPart = raw.split(",")[0]?.trim() ?? raw;
  const direct = DISTANCE_CITY_COORDS[firstPart];
  if (direct) return { latitude: direct[0], longitude: direct[1] };
  for (const [city, coords] of Object.entries(DISTANCE_CITY_COORDS)) {
    if (firstPart.includes(city) || raw.includes(city)) {
      return { latitude: coords[0], longitude: coords[1] };
    }
  }
  return null;
}

export default function TripDetailScreen({
  tripId,
  entryContext,
  clientIdFromContext,
  clientNameFromContext,
  onBack,
}: TripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const { t } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>("trip");
  const [financeSubTab, setFinanceSubTab] = useState<"summary" | "transactions">(
    "summary",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [showFinanceProvisionPanel, setShowFinanceProvisionPanel] = useState<
    "client" | "supplier" | null
  >(null);
  const [showInlineAdjustmentForm, setShowInlineAdjustmentForm] = useState(false);
  const [inlineAdjType, setInlineAdjType] = useState<TripAdjustmentType>("revenue");
  const [inlineAdjImpact, setInlineAdjImpact] = useState<TripAdjustmentImpact>("plus");
  const [inlineAdjAmount, setInlineAdjAmount] = useState("");
  const [inlineAdjReason, setInlineAdjReason] = useState("");
  const [inlineAdjOtherReason, setInlineAdjOtherReason] = useState("");
  const [showAssignmentManager, setShowAssignmentManager] = useState(false);
  const [otpResending, setOtpResending] = useState(false);

  const isMobile = screenWidth < 640;
  const isTablet = screenWidth >= 640 && screenWidth < 1024;
  const isDesktop = screenWidth >= 1024;
  const desktopTab: "tracking" | "finance" = activeTab === "finance" ? "finance" : "tracking";
  const hPad = isMobile ? 12 : isTablet ? 16 : 24;
  const mapHeight = isMobile ? 220 : isTablet ? 380 : 600;

  const detail = useTripDetail({
    tripId,
    entryContext,
    clientIdFromContext,
    clientNameFromContext,
    onBack,
  });

  const [mapRouteDistanceKm, setMapRouteDistanceKm] = useState<string | null>(null);

  useEffect(() => {
    setMapRouteDistanceKm(null);
  }, [tripId]);

  const resolvedDistanceLabel = useMemo(() => {
    const tr = detail.trip;
    if (!tr) return null;
    const raw = tr.distance;
    if (raw != null && raw !== "") {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (Number.isFinite(n) && n >= 0) {
        const s =
          Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(1);
        return `${s} km`;
      }
    }
    const mapKm = mapRouteDistanceKm?.trim();
    if (mapKm) return `${mapKm} km`;
    const o = detail.trackingMapOriginCoordinate;
    const d = detail.trackingMapDestinationCoordinate;
    const crow = o && d ? haversineKmBetween(o, d) : null;
    if (crow != null)
      return `≈ ${(crow * 1.3).toFixed(1)} km`;
    const inferredOrigin = inferCoordsFromLocationName(tr.pickup_area);
    const inferredDestination = inferCoordsFromLocationName(tr.drop_location);
    const inferredKm =
      inferredOrigin && inferredDestination
        ? haversineKmBetween(inferredOrigin, inferredDestination)
        : null;
    if (inferredKm != null) return `≈ ${(inferredKm * 1.3).toFixed(1)} km`;
    return null;
  }, [
    detail.trip,
    detail.trackingMapOriginCoordinate,
    detail.trackingMapDestinationCoordinate,
    mapRouteDistanceKm,
  ]);

  const timelineDistanceKm =
    resolvedDistanceLabel?.replace(/^≈\s*/, "").replace(/\s*km$/i, "").trim() || undefined;

  if (detail.loading && !detail.trip) {
    return <CenteredLoadingView message="Loading trip…" />;
  }

  if (detail.error || !detail.trip) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText}>{detail.error ?? "Trip not found"}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={detail.load}
          activeOpacity={0.8}
        >
          <FontAwesome
            name="refresh"
            size={14}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { trip } = detail;
  const isAggregate = isAggregateTrip(trip);

  const driverSummaryText = (() => {
    const name = detail.driverName?.trim();
    const r = detail.driverRatingAvg;
    const hasScore = r != null && Number.isFinite(Number(r));
    if (!name && !hasScore) return null;
    const score = hasScore ? Number(r).toFixed(1) : "—";
    return `${name || "Driver"} — ${score} \u2605`;
  })();

  const openTripDirectionsInMaps = () => {
    const o = detail.trackingMapOriginCoordinate;
    const d = detail.trackingMapDestinationCoordinate;
    if (!o || !d) return;
    const url = `https://www.google.com/maps/dir/${o.latitude},${o.longitude}/${d.latitude},${d.longitude}`;
    void Linking.openURL(url);
  };
  const inlineReasonOptions = getInlineReasonOptions(inlineAdjType, inlineAdjImpact);
  const inlineFinalReason =
    inlineAdjReason === "Other"
      ? inlineAdjOtherReason.trim() || "Other"
      : inlineAdjReason.trim();
  const inlineAmountNum = Math.round(parseFloat(inlineAdjAmount.replace(/,/g, "")) || 0);
  const canSaveInlineAdjustment = inlineAmountNum > 0 && inlineFinalReason.length > 0;

  const openInlineAdjustmentForm = (preset?: {
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    reasonSeed?: string;
  }) => {
    if (preset) {
      setInlineAdjType(preset.type);
      setInlineAdjImpact(preset.impact);
      const seed = (preset.reasonSeed ?? "").trim();
      const opts = preset.type === "revenue" ? REVENUE_REASON_OPTIONS : COST_REASON_OPTIONS;
      if (seed && (opts as readonly string[]).includes(seed)) {
        setInlineAdjReason(seed);
        setInlineAdjOtherReason("");
      } else if (seed) {
        setInlineAdjReason("Other");
        setInlineAdjOtherReason(seed);
      } else {
        setInlineAdjReason("");
        setInlineAdjOtherReason("");
      }
    } else {
      setInlineAdjType("revenue");
      setInlineAdjImpact("plus");
      setInlineAdjReason("");
      setInlineAdjOtherReason("");
    }
    setInlineAdjAmount("");
    setShowInlineAdjustmentForm(true);
  };

  const saveInlineAdjustment = async () => {
    if (!canSaveInlineAdjustment) return;
    await detail.handleSaveAdjustment({
      type: inlineAdjType,
      impact: inlineAdjImpact,
      amount: inlineAmountNum,
      reason: inlineFinalReason,
    });
    setInlineAdjAmount("");
    setInlineAdjReason("");
    setInlineAdjOtherReason("");
    setShowInlineAdjustmentForm(false);
  };

  // ── Stage timestamps ──────────────────────────────────────────────────────────
  const stageTimestamps: TripStageTimestamp[] = [];
  if (trip.pickup_date)
    stageTimestamps.push({
      stageKey: "confirmed",
      timestamp: trip.pickup_date,
    });
  if (trip.started_at)
    stageTimestamps.push({ stageKey: "intransit", timestamp: trip.started_at });
  if (trip.completed_at)
    stageTimestamps.push({
      stageKey: "pod_received",
      timestamp: trip.completed_at,
    });

  const stageLocations: Partial<Record<string, string>> = {
    confirmed: trip.pickup_area?.trim() || undefined,
    s_in: trip.pickup_area?.trim() || undefined,
    s_out: trip.pickup_area?.trim() || undefined,
    d_in: trip.drop_location?.trim() || undefined,
    d_out: trip.drop_location?.trim() || undefined,
  };

  // ── Expense rows ──────────────────────────────────────────────────────────────
  const expenseRows: ExpenseRow[] = detail.tripLedgerEntries
    .filter((e) => Number(e.amount_out ?? 0) > 0)
    .map((e) => ({
      id: e.id,
      date: new Date(e.transaction_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      expenseId: e.id.replace(/-/g, "").slice(0, 10).toUpperCase(),
      category: e.primary_category ?? "Petty Cash",
      type: e.contact_type ?? e.party_name ?? "—",
      description: e.description ?? "—",
      amount: Number(e.amount_out),
      status: (e.reconciliation_status === "reconciled"
        ? "Paid"
        : e.reconciliation_status === "mismatch"
          ? "Requested"
          : "Pending") as ExpenseRow["status"],
    }));

  // ── Finance numbers ───────────────────────────────────────────────────────────
  // Keep POV parity with TripDetailFinanceView: supplier-side indent view should
  // use supplier settlement amounts, not client billing amounts.
  const isTripOwner =
    currentOrganization?.id != null &&
    trip.organization_id != null &&
    trip.organization_id === currentOrganization.id;
  const isPartnerSettlementView = trip.indent_id != null && !isTripOwner;
  const customerSales = Number(trip.client_price ?? 0);
  const supplierCost = Number(trip.supplier_rate ?? 0);
  const sales = isPartnerSettlementView ? supplierCost : customerSales;
  const cost = isPartnerSettlementView
    ? (detail.subcontractRate ?? supplierCost)
    : supplierCost;
  const baseFreight = sales;
  const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);
  const incomeAdjustmentRows = adjustmentsCountingAsIncome(detail.adjustments);
  const deductionAdjustmentRows = adjustmentsCountingAsDeductions(
    detail.adjustments,
  );
  const additionalIncome = incomeAdjustmentRows.reduce(
    (s, a) => s + a.amount,
    0,
  );
  const deductions = deductionAdjustmentRows.reduce((s, a) => s + a.amount, 0);

  const received = detail.tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_in ?? 0),
    0,
  );
  const pending = Math.max(0, sales - received);

  const supplierPaid = detail.tripLedgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_out ?? 0),
    0,
  );
  const supplierDue = Math.max(0, cost - supplierPaid);

  type FinanceHistoryRow = {
    key: string;
    tx: LedgerRow;
    isIn: boolean;
    amount: number;
  };
  const financeHistoryRows: FinanceHistoryRow[] = (() => {
    const rows: FinanceHistoryRow[] = [];
    for (const tx of detail.tripLedgerEntries) {
      const inAmt = Number(tx.amount_in ?? 0);
      const outAmt = Number(tx.amount_out ?? 0);
      if (inAmt > 0)
        rows.push({ key: `${tx.id}-in`, tx, isIn: true, amount: inAmt });
      if (outAmt > 0)
        rows.push({ key: `${tx.id}-out`, tx, isIn: false, amount: outAmt });
    }
    rows.sort((a, b) => {
      const da = new Date(a.tx.transaction_date || a.tx.created_at).getTime();
      const db = new Date(b.tx.transaction_date || b.tx.created_at).getTime();
      return db - da;
    });
    return rows;
  })();
  const paymentCaptured = detail.tripLedgerEntries.some(
    (row) => row.contact_type === "client" && Number(row.amount_in ?? 0) > 0,
  );

  // ── Map ───────────────────────────────────────────────────────────────────────
  const hasOrigin = !!detail.trackingMapOriginCoordinate;
  const hasDest = !!detail.trackingMapDestinationCoordinate;
  const mapCenter = hasOrigin
    ? {
        latitude: detail.trackingMapOriginCoordinate!.latitude,
        longitude: detail.trackingMapOriginCoordinate!.longitude,
      }
    : { latitude: 20.5937, longitude: 78.9629 };

  const originSplit = splitLocationPrimarySecondary(trip.pickup_area);
  const destinationSplit = splitLocationPrimarySecondary(trip.drop_location);
  const pickupAny = trip as any;
  const originStateLabel =
    originSplit.secondary || String(pickupAny.pickup_state ?? "").trim() || "Origin Node";
  const destinationStateLabel =
    destinationSplit.secondary || String(pickupAny.drop_state ?? "").trim() || "Destination Node";
  const allocatedDriverName =
    detail.driverName?.trim() ||
    String((trip as any).driver_name ?? "").trim() ||
    "Unassigned";
  const allocatedVehicleLabel =
    (detail.displayVehicleFromInput?.trim() ||
      detail.vehicleLabel?.trim() ||
      String(trip.vehicle_display_number ?? "").trim() ||
      String((trip as any).vehicle_number ?? "").trim() ||
      "Pending");
  const supplierName =
    detail.partnerName?.trim() || String((trip as any).supplier_name ?? "").trim() || "Supplier N/A";
  const clientNameCard =
    detail.displayClientName?.trim() || String(trip.client_name ?? "").trim() || "Client N/A";
  const isIntegratedTrip = Boolean(trip.indent_id);

  const journeyLogs = [
    {
      status: "Assigned",
      location: trip.pickup_area?.trim() || "Origin hub",
      time: trip.pickup_date ? new Date(trip.pickup_date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—",
      details: "Trip assigned and prepared for dispatch.",
    },
    {
      status: "Pickup",
      location: trip.pickup_area?.trim() || "Pickup point",
      time: trip.started_at ? new Date(trip.started_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—",
      details: "Pickup verification completed and movement initiated.",
    },
    {
      status: "In-Transit",
      location: "Route in progress",
      time: trip.started_at ? new Date(trip.started_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—",
      details: "Vehicle moving towards destination through planned route.",
    },
    {
      status: "Delivered",
      location: trip.drop_location?.trim() || "Destination",
      time: trip.completed_at ? new Date(trip.completed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—",
      details: "Delivery completed and settlement flow closed.",
    },
  ];
  const isTripCompleted =
    String(trip.status ?? "").toLowerCase() === "completed" || !!trip.completed_at;
  const currentStatusLabel = String(trip.status ?? "assigned")
    .replace(/_/g, " ")
    .toUpperCase();
  const tripAny = trip as any;
  const durationLabel = tripAny.duration_minutes
    ? `${Math.floor(tripAny.duration_minutes / 60)}h ${tripAny.duration_minutes % 60}m`
    : "—";
  const driverRatingLabel =
    detail.driverRatingAvg != null && Number.isFinite(Number(detail.driverRatingAvg))
      ? Number(detail.driverRatingAvg).toFixed(1)
      : "—";
  const vehicleTypeLabel =
    String((trip as any).vehicle_type ?? "").trim() ||
    String((trip as any).truck_type ?? "").trim() ||
    "MXL";
  const vehicleCapacityLabel =
    String((trip as any).capacity ?? "").trim() ||
    String((trip as any).vehicle_capacity ?? "").trim() ||
    "—";
  const adjSales = adjustedRevenue(sales, detail.adjustments);
  const adjCost = adjustedCost(cost, detail.adjustments);
  const netManifestYield = Math.max(0, adjSales - adjCost - totalExpenses);
  const revenueSideDelta = adjSales - sales;
  const costSideDelta = adjCost - cost;
  const filteredFinanceRows = financeHistoryRows.filter((row) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    const text = [
      ledgerHistoryTitle(row.tx, row.isIn),
      row.tx.description ?? "",
      row.tx.payment_mode ?? "",
      (row.tx as any).reference_no ?? "",
      formatLedgerDate(row.tx.transaction_date),
    ]
      .join(" ")
      .toLowerCase();
    return text.includes(q);
  });
  const vaultDocs = detail.computedTripDocs.slice(0, 4);

  const openDriverDetails = () => {
    if (!trip.driver_id) return;
    router.push(`/driver/${trip.driver_id}` as any);
  };

  const openVehicleDetails = () => {
    if (!trip.vehicle_id) return;
    router.push(`/vehicle/${trip.vehicle_id}` as any);
  };

  const openTripDocumentsFlow = () => {
    router.push(`/log-incoming-pods?tripId=${encodeURIComponent(trip.id)}` as any);
  };

  const handleDocOpen = async (doc: (typeof detail.computedTripDocs)[number]) => {
    if (doc.id === "vehicle-documents") {
      if (trip.vehicle_id) router.push(`/vehicle/${trip.vehicle_id}` as any);
      else openTripDocumentsFlow();
      return;
    }

    if (doc.id === "pod" && doc.storagePath) {
      try {
        const url = await getDocumentViewUrl(doc.storagePath);
        if (typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      } catch {
        openTripDocumentsFlow();
      }
      return;
    }

    openTripDocumentsFlow();
  };

  const hasDriverAssigned = !!trip.driver_id;
  const hasVehicleAssigned =
    !!trip.vehicle_id || !!String(trip.vehicle_display_number ?? "").trim();
  const canGenerateAggregateOtp = hasDriverAssigned && hasVehicleAssigned;
  const otpLockedByTripProgress = ["in_progress", "in_transit"].includes(
    String(trip.status ?? "").toLowerCase(),
  );

  const aggregateOtpState = (() => {
    if (!isAggregate) return null;
    if (!canGenerateAggregateOtp) return "not_required";
    const status = String(trip.status ?? "").toLowerCase();
    if (status === "assigned") return "otp_pending";
    if (status === "in_progress" || status === "in_transit") return "verified";
    return "not_required";
  })();

  const handleResendOtp = async () => {
    if (!trip?.id || otpResending || !canGenerateAggregateOtp || otpLockedByTripProgress) return;
    setOtpResending(true);
    try {
      await regenerateTripOtp(trip.id);
      detail.handleAssignmentUpdated();
    } finally {
      setOtpResending(false);
    }
  };

  // ── Dashboard: computed values ─────────────────────────────────────────────
  const statusLower = (trip.status ?? '').toLowerCase();
  const statusLabel =
    statusLower.includes('in_transit') || statusLower.includes('transit') ? 'In Transit'
    : statusLower.includes('in_progress') ? 'In Progress'
    : statusLower.includes('complet') || statusLower.includes('deliver') || statusLower === 'done' ? 'Completed'
    : statusLower === 'assigned' ? 'Assigned'
    : statusLower === 'pending' ? 'Pending'
    : trip.status ?? 'Pending';
  const statusColor =
    statusLabel === 'In Transit' || statusLabel === 'In Progress' ? '#22c55e'
    : statusLabel === 'Completed' ? '#60a5fa'
    : '#f59e0b';
  const pickupStr = trip.pickup_date
    ? new Date(trip.pickup_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

  const fmtAuditDate = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso.slice(0, 16).replace('T', ' '); }
  };
  const fmtTimelineTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    try {
      return new Date(iso)
        .toLocaleTimeString('en-IN', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        .toLowerCase();
    } catch {
      return '—';
    }
  };
  const timelineRows = detail.driverActivityTimelineRows ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Navigation bar ──────────────────────────────────────────────────── */}
      <View style={[styles.navBar, { paddingHorizontal: hPad }, !isDesktop && styles.navBarMobile]}>
        {isDesktop ? (
          <>
            <View style={styles.navLeft}>
              <TouchableOpacity
                onPress={onBack}
                style={styles.navBackBtn}
                activeOpacity={0.8}
              >
                <FontAwesome name="chevron-left" size={11} color="#94a3b8" />
                {!isMobile && <Text style={styles.navBackText}>Back</Text>}
              </TouchableOpacity>
              <View style={styles.navTitleWrap}>
                <Text style={[styles.navTitle, isMobile && { fontSize: 13 }]} numberOfLines={1}>
                  {getTripDisplayNumber(trip)}
                </Text>
                {!isMobile && (
                  <View
                    style={[
                      styles.navPill,
                      isAggregate ? styles.navPillAggregate : styles.navPillAsset,
                    ]}
                  >
                    <Text style={styles.navPillText}>
                      {isAggregate ? "AGGREGATE" : "ASSET"}
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.navActions}>
              <NavAction
                icon="plus"
                label={isMobile ? "" : "Add Expense"}
                onPress={detail.openAddExpense}
              />
              <NavAction
                icon="file-text-o"
                label={isMobile ? "" : "Generate Memo"}
                onPress={() => {}}
                primary
              />
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={onBack} style={styles.navCircleBtn} activeOpacity={0.85}>
              <FontAwesome name="chevron-left" size={18} color="#0f172a" />
            </TouchableOpacity>
            <View style={styles.navMobileCenter}>
              <Text style={styles.navMobileKicker}>Trip history</Text>
              <View style={styles.navMobileTripRow}>
                <Text style={styles.navMobileTripId}>{getTripDisplayNumber(trip)}</Text>
                <View style={styles.navMobilePulseRow}>
                  <View style={[styles.navMobileDot, styles.navMobileDotEmerald]} />
                  <View style={[styles.navMobileDot, styles.navMobileDotIndigo]} />
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.navCircleBtn} activeOpacity={0.85}>
              <FontAwesome name="share-alt" size={16} color="#0f172a" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Tab bar ───────────────────────────────────────────────────────────── */}
      {isDesktop ? (
        <View style={[styles.tabBar, { paddingHorizontal: hPad }]}>
          <TabButton
            label="Tracking"
            icon="map-marker"
            active={desktopTab === "tracking"}
            onPress={() => setActiveTab("tracking")}
            compact={false}
          />
          <TabButton
            label="Finance"
            icon="bar-chart"
            active={desktopTab === "finance"}
            onPress={() => setActiveTab("finance")}
            compact={false}
          />
        </View>
      ) : null}

      {/* ── Scrollable content ────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { padding: isMobile ? 16 : 22 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={detail.handleRefresh}
          />
        }
      >
        {!isDesktop ? (
          <>
            <View style={styles.refHeroCard}>
              <View style={styles.refHeroBgGlow} />
              <View style={styles.refHeroBridgeRow}>
                <View style={styles.refHeroBridgeCol}>
                  <View style={styles.refHeroBridgeIconWrap}>
                    <Feather name="briefcase" size={12} color="#818cf8" />
                  </View>
                  <View>
                    <Text style={styles.refHeroBridgeLabel}>Client Hub</Text>
                    <Text style={styles.refHeroBridgeValue} numberOfLines={1}>{clientNameCard}</Text>
                  </View>
                </View>
                <FontAwesome name="exchange" size={12} color="#64748b" />
                <View style={[styles.refHeroBridgeCol, styles.refHeroBridgeColRight]}>
                  <View>
                    <Text style={[styles.refHeroBridgeLabel, styles.refHeroBridgeLabelRight]}>Supplier Node</Text>
                    <Text style={styles.refHeroBridgeValue} numberOfLines={1}>{supplierName}</Text>
                  </View>
                  <View style={[styles.refHeroBridgeIconWrap, styles.refHeroBridgeIconWrapRose]}>
                    <Feather name="truck" size={12} color="#fb7185" />
                  </View>
                </View>
              </View>
              <View style={styles.refHeroRouteRow}>
                <View style={styles.refHeroRouteCol}>
                  <Text style={[styles.refHeroCity, isMobile && styles.refHeroCityMobile]}>
                    {originSplit.primary.toUpperCase()}
                  </Text>
                  <Text style={styles.refHeroState}>{originStateLabel.toUpperCase()}</Text>
                </View>
                <View style={styles.refHeroToRow}>
                  <View style={styles.refHeroToDot} />
                  <View style={styles.refHeroToLine} />
                </View>
                <View style={[styles.refHeroRouteCol, styles.refHeroRouteColRight]}>
                  <Text style={[styles.refHeroCity, isMobile && styles.refHeroCityMobile]} numberOfLines={2}>
                    {destinationSplit.primary.toUpperCase()}
                  </Text>
                  <Text style={styles.refHeroState}>{destinationStateLabel.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.refHeroMetaShell}>
                <View style={styles.refHeroMetaItem}>
                  <View style={styles.refHeroMetaIconWrap}>
                    <Feather name="navigation" size={12} color="#fff" />
                  </View>
                  <View>
                    <Text style={styles.refHeroMetaLabel}>Manifest range</Text>
                    <Text style={styles.refHeroMetaValue}>
                      {resolvedDistanceLabel
                        ? resolvedDistanceLabel.replace(/\s*km$/i, " KM")
                        : "—"}
                    </Text>
                  </View>
                </View>
                <View style={styles.refHeroMetaDivider} />
                <View style={[styles.refHeroMetaItem, styles.refHeroMetaItemRight]}>
                  <View>
                    <Text style={styles.refHeroMetaLabel}>ETE manifest</Text>
                    <Text style={styles.refHeroMetaValue}>{durationLabel}</Text>
                  </View>
                  <View style={styles.refHeroMetaIconGhost}>
                    <Feather name="clock" size={12} color="#a5b4fc" />
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.refAssetRow}>
              <View style={styles.refAssetCard}>
                <View style={styles.refAssetHead}>
                  <View style={styles.refAssetIconWrap}>
                    <Feather name="user" size={14} color="#4f46e5" />
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowAssignmentManager(true)}
                    style={styles.refAssetChangeBtn}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.refAssetChangeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.refAssetLabel}>Authorized Pilot</Text>
                <Text style={styles.refAssetValue} numberOfLines={1}>{allocatedDriverName}</Text>
                <Text style={styles.refAssetSubtle}>{driverRatingLabel} rank</Text>
              </View>

              <View style={styles.refAssetCard}>
                <View style={styles.refAssetHead}>
                  <View style={[styles.refAssetIconWrap, styles.refAssetIconWrapDark]}>
                    <Feather name="truck" size={14} color="#fff" />
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowAssignmentManager(true)}
                    style={styles.refAssetChangeBtn}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.refAssetChangeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.refAssetLabel}>Vehicle Asset</Text>
                <Text style={styles.refAssetValue} numberOfLines={1}>{allocatedVehicleLabel}</Text>
                <Text style={styles.refAssetSubtle}>{vehicleTypeLabel} · {vehicleCapacityLabel}</Text>
              </View>
            </View>

            <View style={styles.refTabShell}>
              <TouchableOpacity
                style={[styles.refTabBtn, activeTab === "trip" && styles.refTabBtnActive]}
                onPress={() => setActiveTab("trip")}
                activeOpacity={0.85}
              >
                <Feather name="activity" size={12} color={activeTab === "trip" ? "#818cf8" : "#94a3b8"} />
                <Text style={[styles.refTabBtnText, activeTab === "trip" && styles.refTabBtnTextActive]}>Journey</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.refTabBtn, activeTab === "finance" && styles.refTabBtnActive]}
                onPress={() => setActiveTab("finance")}
                activeOpacity={0.85}
              >
                <Feather name="credit-card" size={12} color={activeTab === "finance" ? "#818cf8" : "#94a3b8"} />
                <Text style={[styles.refTabBtnText, activeTab === "finance" && styles.refTabBtnTextActive]}>Finance</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.refTabBtn, activeTab === "docs" && styles.refTabBtnActive]}
                onPress={() => setActiveTab("docs")}
                activeOpacity={0.85}
              >
                <Feather name="shield" size={12} color={activeTab === "docs" ? "#818cf8" : "#94a3b8"} />
                <Text style={[styles.refTabBtnText, activeTab === "docs" && styles.refTabBtnTextActive]}>Vault</Text>
              </TouchableOpacity>
            </View>

            {activeTab === "trip" ? (
              <View style={styles.refTrackWrap}>
                <View style={styles.refTimelineCard}>
                  {journeyLogs.map((log, index) => {
                    const expanded = expandedLog === index;
                    const isLast = index === journeyLogs.length - 1;
                    return (
                      <View key={`${log.status}-${index}`} style={styles.refTimelineItemWrap}>
                        {!isLast ? <View style={styles.refTimelineConnector} /> : null}
                        <TouchableOpacity
                          style={[styles.refTimelineItem, expanded && styles.refTimelineItemExpanded]}
                          onPress={() => setExpandedLog(expanded ? null : index)}
                          activeOpacity={0.9}
                        >
                          <View style={styles.refTimelineDotIcon}>
                            <FontAwesome name="check" size={11} color="#fff" />
                          </View>
                          <View style={styles.refTimelineBody}>
                            <View style={styles.refTimelineTop}>
                              <Text style={styles.refTimelineStatus}>{log.status}</Text>
                              <View style={styles.refTimelineTopRight}>
                                <Text style={styles.refTimelineTime}>{log.time}</Text>
                                <FontAwesome name={expanded ? "chevron-up" : "chevron-down"} size={11} color="#94a3b8" />
                              </View>
                            </View>
                            <Text style={styles.refTimelineLocation}>{log.location}</Text>
                            {expanded ? <Text style={styles.refTimelineDetails}>{log.details}</Text> : null}
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.refDeliveredCard}>
                  <View>
                    <Text style={styles.refDeliveredLabel}>
                      {isTripCompleted ? "Final Audit Status" : "Current Status"}
                    </Text>
                    <Text style={styles.refDeliveredValue}>
                      {isTripCompleted ? "DELIVERED SUCCESSFULLY" : currentStatusLabel}
                    </Text>
                  </View>
                  <View style={styles.refDeliveredIconWrap}>
                    <FontAwesome
                      name={isTripCompleted ? "check-circle" : "clock-o"}
                      size={20}
                      color="#fff"
                    />
                  </View>
                </View>

                <View style={styles.refFeedbackWrap}>
                  <TripRatingsBlock
                    trip={trip}
                    organizationId={currentOrganization?.id ?? null}
                    partnerName={detail.partnerName}
                    driverName={detail.driverName}
                    driverAvatarUri={detail.driverAvatarUri}
                    clientName={detail.displayClientName ?? trip.client_name ?? null}
                    paymentCaptured={paymentCaptured}
                    layoutVariant="registry"
                  />
                </View>
              </View>
            ) : activeTab === "finance" ? (
              <View style={styles.refFinanceWrap}>
                <View style={styles.refFinanceSubTabs}>
                  <TouchableOpacity
                    style={styles.refFinanceSubBtn}
                    onPress={() => setFinanceSubTab("summary")}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.refFinanceSubBtnText,
                        financeSubTab === "summary" && styles.refFinanceSubBtnTextActive,
                      ]}
                    >
                      Summary
                    </Text>
                    {financeSubTab === "summary" ? <View style={styles.refFinanceSubLine} /> : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.refFinanceSubBtn}
                    onPress={() => setFinanceSubTab("transactions")}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.refFinanceSubBtnText,
                        financeSubTab === "transactions" && styles.refFinanceSubBtnTextActive,
                      ]}
                    >
                      Transactions
                    </Text>
                    {financeSubTab === "transactions" ? <View style={styles.refFinanceSubLine} /> : null}
                  </TouchableOpacity>
                </View>

                {financeSubTab === "summary" ? (
                  <>
                    <View style={[styles.refSettleCard, styles.refFinanceManifestHero]}>
                      <Text style={styles.refSettleLabel}>Net Manifest Yield</Text>
                      <Text style={styles.refManifestNetHuge}>{formatINR(netManifestYield)}</Text>
                      <Text style={styles.refSettleHint}>
                        After adjusted revenue, adjusted supplier cost, and voyage spend
                      </Text>

                      <View style={styles.refManifestHeroSplit}>
                        <View style={styles.refManifestCol}>
                          <View style={styles.refManifestColHead}>
                            <View style={styles.refManifestColHeadLeft}>
                              <View style={[styles.refManifestDot, styles.refManifestDotSales]} />
                              <Text style={styles.refManifestColTitle}>Adjusted sales</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => setShowFinanceProvisionPanel("client")}
                              style={styles.refManifestMiniPlus}
                              activeOpacity={0.85}
                            >
                              <FontAwesome name="plus" size={10} color="#4f46e5" />
                            </TouchableOpacity>
                          </View>
                          <Text style={[styles.refManifestColAmount, styles.refManifestSalesAmt]}>
                            {formatINR(adjSales)}
                          </Text>
                          <View style={styles.refManifestMicroBox}>
                            <Text style={styles.refManifestMicroLine}>Base · {formatINR(sales)}</Text>
                            <Text style={styles.refManifestMicroAdjSales}>
                              Adj · {revenueSideDelta >= 0 ? "+" : "−"}
                              {formatINR(Math.abs(revenueSideDelta))}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.refManifestHeroSep} />

                        <View style={[styles.refManifestCol, styles.refManifestColRight]}>
                          <View style={styles.refManifestColHead}>
                            <TouchableOpacity
                              onPress={() => setShowFinanceProvisionPanel("supplier")}
                              style={[styles.refManifestMiniPlus, styles.refManifestMiniPlusMuted]}
                              activeOpacity={0.85}
                            >
                              <FontAwesome name="plus" size={10} color="#e11d48" />
                            </TouchableOpacity>
                            <View style={styles.refManifestColHeadRight}>
                              <Text style={styles.refManifestColTitle}>Adjusted cost</Text>
                              <View style={[styles.refManifestDot, styles.refManifestDotCost]} />
                            </View>
                          </View>
                          <Text style={[styles.refManifestColAmount, styles.refManifestCostAmt]}>
                            {formatINR(adjCost)}
                          </Text>
                          <View style={styles.refManifestMicroBox}>
                            <Text style={[styles.refManifestMicroLine, styles.refManifestMicroRight]}>
                              Base · {formatINR(cost)}
                            </Text>
                            <Text style={styles.refManifestMicroAdjCost}>
                              Adj · {costSideDelta >= 0 ? "+" : "−"}
                              {formatINR(Math.abs(costSideDelta))}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.refSettleExpenseRow}>
                        <Text style={styles.refSettleExpenseLabel}>Petty / voyage expense</Text>
                        <Text style={styles.refSettleExpenseVal}>{formatINR(totalExpenses)}</Text>
                      </View>
                    </View>

                    {showFinanceProvisionPanel ? (
                      <View style={styles.refProvisionWrap}>
                        <View style={styles.refProvisionHeader}>
                          <Text style={styles.refProvisionTitle}>
                            Provision CN/DN ({showFinanceProvisionPanel === "client" ? "Client" : "Supplier"})
                          </Text>
                          <TouchableOpacity
                            onPress={() => setShowFinanceProvisionPanel(null)}
                            hitSlop={10}
                            style={styles.refProvisionClose}
                            accessibilityLabel="Close provision panel"
                          >
                            <Feather name="x" size={18} color="#cbd5f5" />
                          </TouchableOpacity>
                        </View>

                        <View style={styles.refProvisionDnRow}>
                          <TouchableOpacity
                            style={[styles.refProvisionDnBtn, styles.refProvisionCnBtn]}
                            onPress={() => {
                              if (!showFinanceProvisionPanel) return;
                              openInlineAdjustmentForm({
                                type: showFinanceProvisionPanel === "client" ? "revenue" : "cost",
                                impact: "minus",
                                reasonSeed: "Other",
                              });
                            }}
                            activeOpacity={0.88}
                          >
                            <Feather name="plus" size={22} color="#a5b4fc" />
                            <Text style={styles.refProvisionDnLabel}>Credit (CN)</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.refProvisionDnBtn, styles.refProvisionDnBtnDebit]}
                            onPress={() => {
                              if (!showFinanceProvisionPanel) return;
                              openInlineAdjustmentForm({
                                type: showFinanceProvisionPanel === "client" ? "revenue" : "cost",
                                impact: "plus",
                                reasonSeed: "Other",
                              });
                            }}
                            activeOpacity={0.88}
                          >
                            <Feather name="minus" size={22} color="#fca5a5" />
                            <Text style={styles.refProvisionDnLabel}>Debit (DN)</Text>
                          </TouchableOpacity>
                        </View>

                        {showInlineAdjustmentForm ? (
                          <View style={styles.refInlineAdjustWrap}>
                            <View style={styles.refInlineAdjustHead}>
                              <View>
                                <Text style={styles.refInlineAdjustTitle}>Add Adjustment</Text>
                                <Text style={styles.refInlineAdjustSub}>modify trip amounts</Text>
                                <View
                                  style={[
                                    styles.refInlineModeBadge,
                                    inlineAdjImpact === "plus"
                                      ? styles.refInlineModeBadgeDebit
                                      : styles.refInlineModeBadgeCredit,
                                  ]}
                                >
                                  <Text style={styles.refInlineModeBadgeTxt}>
                                    {`${inlineAdjImpact === "plus" ? "Debit (DN)" : "Credit (CN)"} · ${
                                      inlineAdjType === "revenue"
                                        ? "Revenue (Sale)"
                                        : "Cost (Supplier)"
                                    }`}
                                  </Text>
                                </View>
                              </View>
                              <TouchableOpacity
                                style={styles.refInlineAdjustClose}
                                onPress={() => setShowInlineAdjustmentForm(false)}
                                activeOpacity={0.85}
                              >
                                <Feather name="x" size={16} color="#475569" />
                              </TouchableOpacity>
                            </View>

                            <Text style={styles.refInlineAdjustLabel}>Adjustment Type</Text>
                            <Text style={styles.refInlineAdjustLockedMeta}>
                              {`${inlineAdjType === "revenue" ? "Revenue (Sale)" : "Cost (Supplier)"} · ${
                                inlineAdjImpact === "plus" ? "Debit (DN)" : "Credit (CN)"
                              }`}
                            </Text>

                            <Text style={styles.refInlineAdjustLabel}>Amount</Text>
                            <View style={styles.refInlineAmountRow}>
                              <Text style={styles.refInlineCurrency}>₹</Text>
                              <TextInput
                                value={inlineAdjAmount}
                                onChangeText={setInlineAdjAmount}
                                style={styles.refInlineAmountInput}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor="#64748b"
                                maxLength={14}
                              />
                            </View>

                            <Text style={styles.refInlineAdjustLabel}>Reason</Text>
                            <View style={styles.refInlineReasonWrap}>
                              {inlineReasonOptions.map((r) => (
                                <TouchableOpacity
                                  key={r}
                                  style={[
                                    styles.refInlineReasonChip,
                                    inlineAdjReason === r && styles.refInlineReasonChipActive,
                                  ]}
                                  onPress={() => setInlineAdjReason(r)}
                                  activeOpacity={0.82}
                                >
                                  <Text
                                    style={[
                                      styles.refInlineReasonChipTxt,
                                      inlineAdjReason === r && styles.refInlineReasonChipTxtActive,
                                    ]}
                                  >
                                    {r}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>

                            {inlineAdjReason === "Other" ? (
                              <TextInput
                                value={inlineAdjOtherReason}
                                onChangeText={setInlineAdjOtherReason}
                                style={styles.refInlineOtherInput}
                                placeholder="Describe reason..."
                                placeholderTextColor="#64748b"
                                maxLength={80}
                              />
                            ) : null}

                            <TouchableOpacity
                              style={[
                                styles.refInlineSaveBtn,
                                !canSaveInlineAdjustment && styles.refInlineSaveBtnDisabled,
                              ]}
                              onPress={() => void saveInlineAdjustment()}
                              disabled={!canSaveInlineAdjustment}
                              activeOpacity={0.86}
                            >
                              <Text style={styles.refInlineSaveBtnTxt}>Save Adjustment</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.refManifestSplitSection}>
                      <View style={styles.refManifestSplitHead}>
                        <Feather name="activity" size={16} color="#cbd5e1" />
                        <Text style={styles.refManifestSplitTitle}>Manifest adjustments split</Text>
                      </View>
                      <View style={styles.refManifestBands}>
                        <View style={styles.refManifestBand}>
                          <View style={styles.refManifestBandLblRow}>
                            <Text style={[styles.refManifestBandLbl, styles.refManifestBandLblIn]}>
                              Sales inbound
                            </Text>
                            <Feather name="arrow-up-right" size={14} color="#16a34a" />
                          </View>
                          {incomeAdjustmentRows.length === 0 ? (
                            <Text style={styles.refManifestBandEmpty}>No inbound adjustments yet</Text>
                          ) : (
                            incomeAdjustmentRows.map((adj) => (
                              <View key={adj.id} style={[styles.refManifestBandRow, styles.refManifestBandRowIn]}>
                                <View style={styles.refManifestBandRowInner}>
                                  <Feather name="plus" size={12} color="#16a34a" />
                                  <Text style={styles.refManifestBandReason} numberOfLines={2}>
                                    {(adj.reason || "").trim() || "Adjustment"}
                                  </Text>
                                </View>
                                <Text style={styles.refManifestBandAmtIn}>{formatINR(adj.amount)}</Text>
                              </View>
                            ))
                          )}
                        </View>

                        <View style={styles.refManifestBandSep} />

                        <View style={styles.refManifestBand}>
                          <View style={styles.refManifestBandLblRow}>
                            <Text style={[styles.refManifestBandLbl, styles.refManifestBandLblOut]}>
                              Cost outbound
                            </Text>
                            <Feather name="activity" size={14} color="#f43f5e" />
                          </View>
                          {deductionAdjustmentRows.length === 0 ? (
                            <Text style={styles.refManifestBandEmpty}>No outbound adjustments yet</Text>
                          ) : (
                            deductionAdjustmentRows.map((adj) => (
                              <View key={adj.id} style={[styles.refManifestBandRow, styles.refManifestBandRowOut]}>
                                <View style={styles.refManifestBandRowInner}>
                                  <Feather name="zap" size={12} color="#f43f5e" />
                                  <Text style={styles.refManifestBandReason} numberOfLines={2}>
                                    {(adj.reason || "").trim() || "Adjustment"}
                                  </Text>
                                </View>
                                <Text style={styles.refManifestBandAmtOut}>{formatINR(adj.amount)}</Text>
                              </View>
                            ))
                          )}
                        </View>
                      </View>
                    </View>

                    <View style={styles.refFinanceBreakCard}>
                      <View style={styles.refAdjRegHeader}>
                        <Text style={styles.refAdjRegTitle}>Adjustment registry</Text>
                      </View>
                      {detail.adjustments.length === 0 ? (
                        <Text style={styles.refFinanceEmpty}>No adjustments yet</Text>
                      ) : (
                        detail.adjustments.map((adj) => {
                          const isRev = adj.type === "revenue";
                          const isPlus = adj.impact === "plus";
                          const iconName = !isRev
                            ? isPlus
                              ? "arrow-up-right"
                              : "arrow-down-left"
                            : isPlus
                              ? "trending-up"
                              : "trending-down";
                          const tint = !isRev
                            ? isPlus
                              ? "#f43f5e"
                              : "#10b981"
                            : isPlus
                              ? "#10b981"
                              : "#f43f5e";
                          return (
                            <View key={adj.id} style={styles.refFinanceRow}>
                              <View style={styles.refFinanceRowLeft}>
                                <View style={styles.refFinanceRowIcon}>
                                  <Feather name={iconName as never} size={13} color={tint} />
                                </View>
                                <View style={styles.refAdjLabelCol}>
                                  <Text style={styles.refFinanceRowLabel}>{(adj.reason || "").trim() || "Adjustment"}</Text>
                                  <Text style={styles.refAdjPartyTag}>
                                    {adj.type === "revenue" ? "Revenue" : "Supplier cost"}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.refAdjRight}>
                                <Text
                                  style={[
                                    styles.refFinanceRowValue,
                                    (isRev ? isPlus : !isPlus)
                                      ? styles.refFinanceRowValuePositive
                                      : styles.refFinanceRowValueNegative,
                                  ]}
                                >
                                  {`${isRev ? (isPlus ? "+" : "−") : isPlus ? "+" : "−"}${formatINR(adj.amount)}`}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => void detail.handleRemoveAdjustment(adj.id)}
                                  hitSlop={10}
                                  style={styles.refAdjTrash}
                                  accessibilityLabel="Remove adjustment"
                                >
                                  <FontAwesome name="times-circle" size={15} color="#cbd5e1" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.refFinanceSearchWrap}>
                      <Feather name="search" size={14} color="#94a3b8" />
                      <TextInput
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder="Audit transaction registry..."
                        placeholderTextColor="#94a3b8"
                        style={styles.refFinanceSearchInput}
                      />
                    </View>
                    {filteredFinanceRows.map((row) => (
                      <View key={row.key} style={styles.refTxnRow}>
                        <View style={styles.refTxnLeft}>
                          <View
                            style={[
                              styles.refTxnIconWrap,
                              row.isIn ? styles.refTxnIconIn : styles.refTxnIconOut,
                            ]}
                          >
                            <Feather
                              name={row.isIn ? "arrow-down-left" : "arrow-up-right"}
                              size={16}
                              color={row.isIn ? "#10b981" : "#f43f5e"}
                            />
                          </View>
                          <View style={styles.refTxnTextWrap}>
                            <Text style={styles.refTxnLabel}>{ledgerHistoryTitle(row.tx, row.isIn)}</Text>
                            <Text style={styles.refTxnMeta}>
                              {formatLedgerDate(row.tx.transaction_date)} ·{" "}
                              {row.tx.payment_mode || "Wallet"}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.refTxnAmount,
                            row.isIn ? styles.refTxnAmountIn : styles.refTxnAmountOut,
                          ]}
                        >
                          {formatINR(row.amount)}
                        </Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            ) : activeTab === "docs" ? (
              <View style={styles.refVaultWrap}>
                <View style={styles.refVaultHeader}>
                  <View style={styles.refVaultHeaderIcon}>
                    <Feather name="shield" size={20} color="#4f46e5" />
                  </View>
                  <View>
                    <Text style={styles.refVaultTitle}>Asset Vault</Text>
                    <Text style={styles.refVaultSub}>Operational Compliance Registry</Text>
                  </View>
                </View>
                <View style={styles.refVaultGrid}>
                  {vaultDocs.map((doc) => {
                    const tone =
                      (doc.status as string) === "Missing"
                        ? "critical"
                        : doc.status === "Pending"
                          ? "pending"
                          : "ok";
                    return (
                      <View key={doc.id} style={styles.refVaultCard}>
                        <Feather
                          name={tone === "critical" ? "alert-triangle" : "file-text"}
                          size={18}
                          color={tone === "critical" ? "#fb7185" : "#94a3b8"}
                        />
                        <Text style={styles.refVaultCardTitle} numberOfLines={2}>{doc.label}</Text>
                        <Text style={styles.refVaultCardStatus}>{doc.status}</Text>
                        <TouchableOpacity
                          style={styles.refVaultViewBtn}
                          onPress={() => void handleDocOpen(doc)}
                          activeOpacity={0.85}
                        >
                          <Feather name="external-link" size={12} color="#64748b" />
                          <Text style={styles.refVaultViewText}>View</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        {/* ════════════════════ TRACKING TAB ════════════════════ */}
        {isDesktop && desktopTab === "tracking" && (
          <>
            {/* ── Hero Card ── */}
            <View style={dStyles.heroCard}>
              <View style={dStyles.heroLeft}>
                <View style={dStyles.heroTitleRow}>
                  <Text style={dStyles.heroTripId}>{getTripDisplayNumber(trip)}</Text>
                  <View style={[dStyles.statusBadge, { borderColor: statusColor }]}>
                    <View style={[dStyles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[dStyles.statusText, { color: statusColor }]}>{statusLabel.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={dStyles.routeRow}>
                  <View style={dStyles.routeStop}>
                    <Text style={dStyles.routeLabel}>ORIGIN</Text>
                    <Text style={dStyles.routeCity} numberOfLines={1}>{trip.pickup_area || '—'}</Text>
                    <Text style={dStyles.routeDate}>{pickupStr}</Text>
                  </View>
                  <View style={dStyles.routeDivider}>
                    <View style={dStyles.routeLine} />
                    <FontAwesome name="truck" size={16} color="rgba(255,255,255,0.3)" />
                    <View style={dStyles.routeLine} />
                  </View>
                  <View style={dStyles.routeStop}>
                    <Text style={dStyles.routeLabel}>DESTINATION</Text>
                    <Text style={dStyles.routeCity} numberOfLines={1}>{trip.drop_location || '—'}</Text>
                    {trip.estimated_duration ? <Text style={dStyles.routeDate}>EST: {trip.estimated_duration}</Text> : null}
                  </View>
                </View>
              </View>
              <View style={dStyles.heroStats}>
                <View style={dStyles.statBox}>
                  <Text style={dStyles.statLabel}>DISTANCE</Text>
                  <Text style={dStyles.statValue}>{resolvedDistanceLabel ?? "—"}</Text>
                </View>
                <View style={dStyles.statDivider} />
                <View style={dStyles.statBox}>
                  <Text style={dStyles.statLabel}>STATUS</Text>
                  <Text style={[dStyles.statValue, { fontSize: 14 }]}>{statusLabel}</Text>
                </View>
              </View>
            </View>

            {/* ── Map + Audit Trail ── */}
            <View style={dStyles.row}>
              <View style={[dStyles.card, dStyles.mapCol]}>
                <View style={dStyles.cardHeader}>
                  <FontAwesome name="map" size={14} color="#60a5fa" style={{ marginRight: 8 }} />
                  <Text style={dStyles.cardTitle}>Live Tracking</Text>
                  {detail.trackingMapOriginCoordinate && detail.trackingMapDestinationCoordinate && (
                    <TouchableOpacity style={dStyles.openMapsBtn} onPress={openTripDirectionsInMaps} activeOpacity={0.8}>
                      <Feather name="navigation" size={12} color="#60a5fa" />
                      <Text style={dStyles.openMapsBtnText}>Open Maps</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={dStyles.telemetryWrap}>
                  <TripMap
                    source={(trip.pickup_area ?? "").trim() || undefined}
                    destination={(trip.drop_location ?? "").trim() || undefined}
                    sourceCoords={detail.trackingMapOriginCoordinate ?? undefined}
                    destCoords={detail.trackingMapDestinationCoordinate ?? undefined}
                    truckLocation={detail.driverLocation ?? undefined}
                    height={mapHeight}
                    onDistanceCalculated={setMapRouteDistanceKm}
                  />
                  <View style={dStyles.telemetryBar}>
                    <FontAwesome name="compass" size={14} color="#60a5fa" style={{ marginRight: 8 }} />
                    <View>
                      <Text style={dStyles.telemetryTitle}>Telemetry Link Secured</Text>
                      <Text style={dStyles.telemetrySub}>Protocol v4.2 synchronized live</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={[dStyles.card, dStyles.auditCol]}>
                <View style={dStyles.cardHeader}>
                  <View style={dStyles.timelineHeaderIcon}>
                    <FontAwesome name="calendar-o" size={10} color="#0f172a" />
                  </View>
                  <Text style={dStyles.timelineHeaderTitle}>TRIP TIMELINE</Text>
                </View>
                <ScrollView style={dStyles.auditScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {timelineRows.length === 0 ? (
                    <Text style={dStyles.emptyText}>No activity yet</Text>
                  ) : timelineRows.map((item, idx) => {
                      const isLast = idx === timelineRows.length - 1;
                      if (item.kind === 'status') {
                        const iconTone =
                          item.status_context === 'completed' || item.status_context === 'in_transit'
                            ? '#059669'
                            : 'rgba(15,23,42,0.35)';
                        return (
                          <View key={item.id} style={[dStyles.auditItem, isLast && dStyles.auditItemLast]}>
                            <View style={dStyles.auditTrackCol}>
                              <View
                                style={[
                                  dStyles.auditTimelineDot,
                                  { borderColor: iconTone, backgroundColor: item.status_context === 'completed' || item.status_context === 'in_transit' ? '#ecfdf5' : '#f8fafc' },
                                ]}
                              >
                                <View style={[dStyles.auditTimelineDotInner, { backgroundColor: iconTone }]} />
                              </View>
                              {!isLast ? <View style={dStyles.auditTimelineLine} /> : null}
                            </View>
                            <View style={dStyles.auditContentRow}>
                              <View style={dStyles.auditBody}>
                                <Text style={dStyles.auditTitle}>{item.status_label}</Text>
                                <Text style={dStyles.auditDetail}>{item.detail_line}</Text>
                              </View>
                              <View style={dStyles.auditMeta}>
                                <Text style={dStyles.auditTime}>{fmtTimelineTime(item.changed_at)}</Text>
                                <FontAwesome name="angle-down" size={12} color="rgba(15,23,42,0.35)" />
                              </View>
                            </View>
                          </View>
                        );
                      }

                      const row = item.row;
                      const dName = row.driver_id_new
                        ? (detail.assignmentDriverNames[row.driver_id_new] ?? null)
                        : null;
                      const vLabel = row.vehicle_id_new
                        ? (detail.assignmentVehicleLabels[row.vehicle_id_new] ?? null)
                        : null;

                      return (
                        <View key={row.id} style={[dStyles.auditItem, isLast && dStyles.auditItemLast]}>
                          <View style={dStyles.auditTrackCol}>
                            <View style={dStyles.auditTimelineDot}>
                              <View style={dStyles.auditTimelineDotInner} />
                            </View>
                            {!isLast ? <View style={dStyles.auditTimelineLine} /> : null}
                          </View>
                          <View style={dStyles.auditContentRow}>
                            <View style={dStyles.auditBody}>
                                <Text style={dStyles.auditTitle}>Assigned</Text>
                              <Text style={dStyles.auditDetail}>
                                {(dName || vLabel)
                                  ? [dName, vLabel].filter(Boolean).join(' · ')
                                    : (trip.pickup_area || 'Driver assigned')}
                              </Text>
                            </View>
                            <View style={dStyles.auditMeta}>
                              <Text style={dStyles.auditTime}>{fmtTimelineTime(row.changed_at)}</Text>
                              <FontAwesome name="angle-down" size={12} color="rgba(15,23,42,0.35)" />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                </ScrollView>
              </View>
            </View>

            {/* ── Driver / Vehicle + Documents ── */}
            <View style={dStyles.row}>
              <View style={dStyles.bottomLeft}>
                <View style={dStyles.card}>
                  <Text style={dStyles.cardMicroLabel}>PRIMARY DRIVER</Text>
                  <View style={dStyles.driverRow}>
                    {detail.driverAvatarUri ? (
                      <Image source={{ uri: detail.driverAvatarUri }} style={dStyles.driverAvatar} />
                    ) : (
                      <View style={dStyles.driverAvatarFallback}>
                        <FontAwesome name="user" size={20} color="rgba(255,255,255,0.5)" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={dStyles.driverName}>{detail.driverName || '—'}</Text>
                      {detail.driverRatingAvg != null && (
                        <Text style={dStyles.driverRating}>★ {Number(detail.driverRatingAvg).toFixed(1)}</Text>
                      )}
                    </View>
                    {trip.started_at ? (
                      <View style={dStyles.statBoxSm}>
                        <Text style={dStyles.statLabelSm}>STARTED</Text>
                        <Text style={dStyles.statValueSm}>
                          {new Date(trip.started_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={dStyles.card}>
                  <Text style={dStyles.cardMicroLabel}>ASSIGNED VEHICLE</Text>
                  <View style={dStyles.vehicleRow}>
                    <View style={dStyles.vehicleIconWrap}>
                      <FontAwesome name="truck" size={20} color="rgba(255,255,255,0.5)" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={dStyles.vehicleName}>
                        {detail.vehicleLabel || detail.displayVehicleFromInput || '—'}
                      </Text>
                      {trip.load_type ? <Text style={dStyles.vehicleSub}>{trip.load_type}</Text> : null}
                    </View>
                  </View>
                </View>
              </View>

              <View style={[dStyles.card, dStyles.docsCol]}>
                <View style={dStyles.cardHeader}>
                  <FontAwesome name="file-text-o" size={14} color="#60a5fa" style={{ marginRight: 8 }} />
                  <Text style={dStyles.cardTitle}>Required Documents</Text>
                  <View style={dStyles.docsBadge}>
                    <Text style={dStyles.docsBadgeText}>
                      {detail.computedTripDocs.filter(d => d.status === 'Uploaded').length}/{detail.computedTripDocs.length} VERIFIED
                    </Text>
                  </View>
                </View>
                {detail.computedTripDocs.map((doc) => (
                  <TouchableOpacity key={doc.id} style={dStyles.docRow} onPress={() => handleDocOpen(doc)} activeOpacity={0.75}>
                    <View style={dStyles.docIconWrap}>
                      <FontAwesome name="file-o" size={14} color="rgba(255,255,255,0.4)" />
                    </View>
                    <Text style={dStyles.docLabel} numberOfLines={1}>{doc.label}</Text>
                    <View style={[dStyles.docStatusPill, doc.status === 'Uploaded' ? dStyles.docStatusVerified : dStyles.docStatusPending]}>
                      <Text style={[dStyles.docStatusText, doc.status === 'Uploaded' ? dStyles.docStatusTextVerified : dStyles.docStatusTextPending]}>
                        {doc.status === 'Uploaded' ? 'VERIFIED' : 'PENDING'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Placeholder for dead code path below — preserve existing view refs */}
            {false && <View style={styles.workspaceRow}>
              <View style={styles.workspaceLeftCol}>
                <View style={styles.voyageCard}>
                  <View style={styles.sectionKickerRow}>
                    <View style={styles.sectionKickerBar} />
                    <Text style={styles.sectionKicker}>Voyage Manifest</Text>
                  </View>
                  <View style={styles.routeLineWrap}>
                    <View style={styles.routeDotsCol}>
                      <View style={[styles.routeDot, styles.routeDotStart]} />
                      <View style={styles.routeDashedLine} />
                      <View style={[styles.routeDot, styles.routeDotEnd]} />
                    </View>
                    <View style={styles.routeTextCol}>
                      <Text style={styles.routePlace}>{trip.pickup_area || "Pickup"}</Text>
                      <Text style={styles.routePlace}>{trip.drop_location || "Destination"}</Text>
                    </View>
                  </View>
                  <View style={styles.voyageMetaGrid}>
                    <View style={styles.voyageMetaCell}>
                      <Text style={styles.voyageMetaLabel}>Client</Text>
                      <Text style={styles.voyageMetaValue}>{detail.displayClientName || "—"}</Text>
                    </View>
                    <View style={styles.voyageMetaCell}>
                      <Text style={styles.voyageMetaLabel}>Material</Text>
                      <Text style={styles.voyageMetaValue}>{trip.load_type || "General Load"}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.operatorCard}>
                  <View style={styles.operatorBadge}>
                    <FontAwesome name="user" size={16} color="#64748b" />
                    <View>
                      <Text style={styles.operatorLabel}>Operator</Text>
                      <Text style={styles.operatorValue}>{detail.driverName || "Unassigned"}</Text>
                    </View>
                  </View>
                  <Text style={styles.operatorSub}>
                    {detail.vehicleLabel || detail.displayVehicleFromInput || "Vehicle pending assignment"}
                  </Text>
                </View>


                {trip.organization_id ? (
                  <TripAssignmentBlock
                    trip={trip}
                    organizationId={currentOrganization?.id ?? ""}
                    canAssign={detail.canAssign}
                    onUpdated={detail.handleAssignmentUpdated}
                    partnerName={detail.partnerName}
                    driverName={detail.driverName}
                    vehicleLabel={
                      isAggregate
                        ? detail.displayVehicleFromInput.trim() ||
                          detail.vehicleLabel ||
                          null
                        : detail.vehicleLabel
                    }
                    driverAvatarUri={detail.driverAvatarUri}
                    showAssignByPhone={detail.showAssignByPhone}
                    assignmentSource={detail.assignmentSource}
                    currentUserId={detail.currentUserId}
                    previousDriverName={detail.previousDriverName}
                    latestReassignmentSummary={detail.latestReassignmentSummary}
                    driverAssignOrgId={
                      detail.showAssignByPhone
                        ? currentOrganization?.id ?? null
                        : null
                    }
                    onVehicleDisplayChange={(value) => {
                      const normalized = formatIndianVehicleNumber(value ?? "");
                      detail.setDisplayVehicleFromInput(normalized);
                    }}
                    inlineSection={
                      isAggregate ? (
                        <View style={styles.otpStateCardInline}>
                          <View style={styles.otpStateHeader}>
                            {aggregateOtpState === "verified" ? (
                              <View style={[styles.otpStateBadge, styles.otpStateBadgeVerified]}>
                                <Text
                                  style={[
                                    styles.otpStateBadgeText,
                                    styles.otpStateBadgeTextVerified,
                                  ]}
                                >
                                  Driver verified
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.otpStateBodyRow}>
                            <View style={styles.otpStateBodyLeft}>
                              <Text style={styles.otpStateSub}>
                                {!canGenerateAggregateOtp
                                  ? "OTP will unlock after assigning both driver and vehicle."
                                  : aggregateOtpState === "verified"
                                  ? "Driver has verified assignment from the driver app."
                                  : detail.tripOtp?.expires_at
                                    ? `OTP generated. Expires at ${new Date(
                                        detail.tripOtp!.expires_at!,
                                      ).toLocaleString("en-IN")}`
                                    : "OTP will be generated during assignment confirmation flow."}
                              </Text>
                              {aggregateOtpState !== "verified" && detail.tripOtp?.code ? (
                                <View style={styles.otpCodeRow}>
                                  <Text style={styles.otpCodeLabel}>OTP</Text>
                                  <Text style={styles.otpCodeValue}>{detail.tripOtp?.code}</Text>
                                </View>
                              ) : null}
                            </View>
                            <View style={styles.otpStateBodyRight}>
                              {aggregateOtpState === "verified" ? (
                                <Text style={styles.otpActionStatus}>Status: Verified</Text>
                              ) : null}
                              {canGenerateAggregateOtp && aggregateOtpState !== "verified" ? (
                                <TouchableOpacity
                                  style={styles.otpResendBtn}
                                  onPress={handleResendOtp}
                                  disabled={otpResending}
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.otpResendBtnText}>
                                    {otpResending ? "Resending..." : "Resend OTP"}
                                  </Text>
                                </TouchableOpacity>
                              ) : null}
                              {!canGenerateAggregateOtp ? (
                                <View style={styles.otpDisabledBtn}>
                                  <Text style={styles.otpDisabledBtnText}>Assign to enable OTP</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      ) : null
                    }
                  />
                ) : null}

                <View style={styles.lrGrow}>
                  <LRDocumentsSection
                    presentation="gallery"
                    docs={detail.computedTripDocs.map((d) => {
                      const openable =
                        d.status !== "Pending" ||
                        !!d.storagePath ||
                        d.id === "vehicle-documents";
                      return {
                        id: d.id,
                        label: d.label,
                        type: d.type,
                        status: d.status === "Verified" ? "Uploaded" : d.status,
                        onView: openable ? () => detail.setSelectedDoc(d) : undefined,
                      };
                    })}
                    onUpdateLR={openTripDocumentsFlow}
                    onAddDocument={openTripDocumentsFlow}
                  />
                </View>
              </View>

              <View style={styles.workspaceRightCol}>
                <TripStatusTimeline
                  variant="journey"
                  trip={trip}
                  stageTimestamps={stageTimestamps}
                  stageLocations={stageLocations}
                  lastUpdatedAt={trip.updated_at}
                  canAdvance={detail.canAssign}
                  distanceKm={timelineDistanceKm}
                  driverSummaryText={driverSummaryText}
                  onOpenMaps={
                    detail.trackingMapOriginCoordinate &&
                    detail.trackingMapDestinationCoordinate
                      ? openTripDirectionsInMaps
                      : undefined
                  }
                  mapPreview={
                    <View style={styles.telemetryWrap}>
                      <TripMap
                        source={(trip.pickup_area ?? "").trim() || undefined}
                        destination={(trip.drop_location ?? "").trim() || undefined}
                        sourceCoords={detail.trackingMapOriginCoordinate ?? undefined}
                        destCoords={detail.trackingMapDestinationCoordinate ?? undefined}
                        truckLocation={detail.driverLocation ?? undefined}
                        height={520}
                        onDistanceCalculated={setMapRouteDistanceKm}
                      />
                      <View style={styles.telemetryOverlay}>
                        <FontAwesome name="compass" size={20} color="#60a5fa" />
                        <Text style={styles.telemetryTitle}>Telemetry Link Secured</Text>
                        <Text style={styles.telemetrySub}>Protocol v4.2 synchronized live</Text>
                      </View>
                    </View>
                  }
                />
              </View>
            </View>}

            {/* Feedback / Ratings section */}
            {currentOrganization?.id && (
              <View style={styles.feedbackWrap}>
                {detail.tripCompleted ? (
                  <TripRatingsBlock
                    trip={trip}
                    organizationId={currentOrganization.id}
                    partnerName={detail.partnerName}
                    driverName={detail.driverName}
                    driverAvatarUri={detail.driverAvatarUri}
                    clientName={
                      detail.displayClientName ?? trip.client_name ?? null
                    }
                    paymentCaptured={detail.tripLedgerEntries.some(
                      (row) =>
                        row.contact_type === "client" &&
                        Number(row.amount_in ?? 0) > 0,
                    )}
                    layoutVariant="registry"
                  />
                ) : (
                  <FeedbackPlaceholder />
                )}
              </View>
            )}
          </>
        )}

        {/* ════════════════════ FINANCE TAB ════════════════════ */}
        {isDesktop && desktopTab === "finance" && (
          <View style={styles.financeColsRow}>
            <View style={styles.financeLeftCol}>
              <View style={styles.yieldCard}>
                <View style={styles.yieldHeader}>
                  <Text style={styles.yieldTitle}>Yield Analysis</Text>
                  <Text style={styles.yieldSub}>Consolidated ledger manifest</Text>
                </View>
                <View style={styles.yieldStatsGrid}>
                  <View style={[styles.yieldStatItem, styles.yieldStatPositive]}>
                    <FontAwesome name="line-chart" size={20} color="#16a34a" />
                    <Text style={styles.yieldStatAmount}>{formatINR(baseFreight)}</Text>
                    <Text style={styles.yieldStatLabel}>Gross Revenue</Text>
                  </View>
                  <View style={[styles.yieldStatItem, styles.yieldStatNegative]}>
                    <FontAwesome name="arrow-down" size={20} color="#dc2626" />
                    <Text style={styles.yieldStatAmount}>{formatINR(totalExpenses)}</Text>
                    <Text style={styles.yieldStatLabel}>Voyage Cost</Text>
                  </View>
                </View>
                <View style={styles.netResultCard}>
                  <Text style={styles.netResultLabel}>Operational Net Result</Text>
                  <Text style={styles.netResultValue}>
                    {formatINR(baseFreight + additionalIncome - deductions - totalExpenses)}
                  </Text>
                  <View style={styles.netResultTrend}>
                    <FontAwesome name="arrow-up" size={12} color="#34d399" />
                    <Text style={styles.netResultTrendText}>Live profitability snapshot</Text>
                  </View>
                </View>
              </View>

              <View style={styles.financeAdjustmentsCard}>
                <View style={styles.financeAdjustmentsHeader}>
                  <Text style={styles.financeAdjustmentsTitle}>Adjustments</Text>
                  <Text style={styles.financeAdjustmentsSub}>Revenue and deduction controls</Text>
                </View>
                <View style={styles.financeAdjustmentsRow}>
                  <View style={styles.financeAdjustmentsMetric}>
                    <Text style={styles.financeAdjustmentsMetricLabel}>Additional Income</Text>
                    <Text style={[styles.financeAdjustmentsMetricValue, styles.financeAdjustmentsMetricValuePositive]}>
                      {formatINR(additionalIncome)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={detail.openClientIncomeAdjustment}
                    style={styles.financeAdjustmentsBtn}
                    activeOpacity={0.8}
                  >
                    <FontAwesome name="plus" size={12} color="#fff" />
                    <Text style={styles.financeAdjustmentsBtnText}>Add Income</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.financeAdjustmentsRow}>
                  <View style={styles.financeAdjustmentsMetric}>
                    <Text style={styles.financeAdjustmentsMetricLabel}>Deductions</Text>
                    <Text style={[styles.financeAdjustmentsMetricValue, styles.financeAdjustmentsMetricValueNegative]}>
                      {formatINR(deductions)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={detail.openClientDeductionAdjustment}
                    style={[styles.financeAdjustmentsBtn, styles.financeAdjustmentsBtnAlt]}
                    activeOpacity={0.8}
                  >
                    <FontAwesome name="minus" size={12} color="#334155" />
                    <Text style={[styles.financeAdjustmentsBtnText, styles.financeAdjustmentsBtnTextAlt]}>
                      Add Deduction
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.financeRightCol}>
              <LedgerCard
                sales={sales}
                received={received}
                pending={pending}
                totalExpenses={totalExpenses}
                supplierPaid={supplierPaid}
                supplierDue={supplierDue}
                financeHistoryRows={financeHistoryRows}
                compact={isMobile}
              />

              <ExpenseListCard
                expenses={expenseRows}
                onAddExpense={detail.openAddExpense}
              />
            </View>
          </View>
        )}

        <View style={{ height: !isDesktop ? 120 : 48 }} />
      </ScrollView>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
      <TripAdjustmentModal
        visible={detail.showAdjustmentModal}
        preset={detail.adjustmentModalPreset}
        onClose={detail.closeTripAdjustmentModal}
        onSave={detail.handleSaveAdjustment}
      />
      <ThemedAlertModal
        visible={detail.showDriverRejectedModal}
        title="Driver Rejected"
        message="The assigned driver has rejected this trip."
        onOk={() => detail.setShowDriverRejectedModal(false)}
        variant="warning"
      />

      <Modal
        visible={showAssignmentManager}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAssignmentManager(false)}
      >
        <View style={styles.assignModalBackdrop}>
          <View style={styles.assignModalCard}>
            <View style={styles.assignModalHeader}>
              <Text style={styles.assignModalTitle}>Current Assignment</Text>
              <TouchableOpacity
                onPress={() => setShowAssignmentManager(false)}
                style={styles.assignModalClose}
                activeOpacity={0.85}
              >
                <FontAwesome name="times" size={16} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {trip.organization_id ? (
                <TripAssignmentBlock
                  trip={trip}
                  organizationId={currentOrganization?.id ?? ""}
                  canAssign={detail.canAssign}
                  onUpdated={async () => {
                    await detail.handleAssignmentUpdated();
                    setShowAssignmentManager(false);
                  }}
                  partnerName={detail.partnerName}
                  driverName={detail.driverName}
                  vehicleLabel={
                    isAggregate
                      ? detail.displayVehicleFromInput.trim() ||
                        detail.vehicleLabel ||
                        null
                      : detail.vehicleLabel
                  }
                  driverAvatarUri={detail.driverAvatarUri}
                  showAssignByPhone={detail.showAssignByPhone}
                  assignmentSource={detail.assignmentSource}
                  currentUserId={detail.currentUserId}
                  previousDriverName={detail.previousDriverName}
                  latestReassignmentSummary={detail.latestReassignmentSummary}
                  driverAssignOrgId={
                    detail.showAssignByPhone && currentOrganization?.id
                      ? currentOrganization.id
                      : null
                  }
                  onVehicleDisplayChange={(value) => {
                    const normalized = formatIndianVehicleNumber(value ?? "");
                    detail.setDisplayVehicleFromInput(normalized);
                  }}
                />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!detail.selectedDoc}
        animationType="fade"
        transparent
        onRequestClose={() => detail.setSelectedDoc(null)}
      >
        <View style={styles.docModalBackdrop}>
          <View
            style={[
              styles.docModalCard,
              { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 },
            ]}
          >
            <View style={styles.docModalHeader}>
              <TouchableOpacity
                onPress={() => detail.setSelectedDoc(null)}
                style={styles.docModalCloseIcon}
                activeOpacity={0.8}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <FontAwesome name="times" size={18} color="#0f172a" />
              </TouchableOpacity>
              <View style={styles.docModalTitleBlock}>
                <Text style={styles.docModalTitle} numberOfLines={2}>
                  {detail.isVehicleGalleryDoc
                    ? "Vehicle documents"
                    : detail.selectedDoc?.label ?? "Document"}
                </Text>
                <Text style={styles.docModalSubtitle} numberOfLines={1}>
                  {detail.isVehicleGalleryDoc && detail.activeVehiclePreviewDoc
                    ? `${detail.vehiclePreviewIndex + 1}/${detail.vehiclePreviewDocs.length} · ${detail.activeVehiclePreviewDoc.label}`
                    : "Preview"}
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>

            <View style={styles.docModalBody}>
              {detail.docPreviewLoading ? (
                <View style={styles.docModalCenter}>
                  <ActivityIndicator size="large" color={Theme.primary} />
                  <Text style={styles.docModalHint}>Loading preview…</Text>
                </View>
              ) : detail.isVehicleGalleryDoc ? (
                <View style={styles.docModalCenter}>
                  {detail.activeVehiclePreviewDoc?.storagePath ? (
                    (() => {
                      const vDoc = detail.activeVehiclePreviewDoc;
                      const url = vDoc ? detail.vehiclePreviewUrls[vDoc.id] : null;
                      const isPdf = vDoc?.type === "PDF";
                      if (url && !isPdf) {
                        return (
                          <Image
                            source={{ uri: url }}
                            style={styles.docModalImage}
                            resizeMode="contain"
                          />
                        );
                      }
                      return (
                        <>
                          <FontAwesome name="file-pdf-o" size={48} color={Theme.primary} />
                          <Text style={styles.docModalHint}>
                            {url
                              ? "PDF preview may be limited in the browser."
                              : "Generating secure link…"}
                          </Text>
                        </>
                      );
                    })()
                  ) : (
                    <>
                      <FontAwesome name="file-o" size={48} color="#94a3b8" />
                      <Text style={styles.docModalHint}>No vehicle document on file yet.</Text>
                    </>
                  )}
                </View>
              ) : detail.docPreviewUrl ? (
                <Image
                  source={{ uri: detail.docPreviewUrl }}
                  style={styles.docModalImage}
                  resizeMode="contain"
                />
              ) : detail.docPreviewError ? (
                <View style={styles.docModalCenter}>
                  <FontAwesome name="exclamation-triangle" size={40} color="#94a3b8" />
                  <Text style={styles.docModalHint}>Could not load this document.</Text>
                </View>
              ) : (
                <View style={styles.docModalCenter}>
                  <FontAwesome name="file-o" size={48} color="#94a3b8" />
                  <Text style={styles.docModalHint}>
                    {detail.selectedDoc?.status === "Pending"
                      ? "This document has not been uploaded yet."
                      : "No preview available."}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.docModalFooter}>
              <TouchableOpacity
                style={styles.docModalFooterBtn}
                onPress={() => detail.setSelectedDoc(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.docModalFooterBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Financial Ledger Card (dark) ───────────────────────────────────────────────

type FinanceHistoryRow = {
  key: string;
  tx: LedgerRow;
  isIn: boolean;
  amount: number;
};

function LedgerCard({
  sales,
  received,
  pending,
  totalExpenses,
  supplierPaid,
  supplierDue,
  financeHistoryRows,
  compact,
}: {
  sales: number;
  received: number;
  pending: number;
  totalExpenses: number;
  supplierPaid: number;
  supplierDue: number;
  financeHistoryRows: FinanceHistoryRow[];
  compact?: boolean;
}) {
  return (
    <View style={ldStyles.card}>
      {/* Header */}
      <View style={ldStyles.header}>
        <View style={ldStyles.headerLeft}>
          <FontAwesome name="book" size={12} color="#3b82f6" />
          <Text style={ldStyles.headerTitle}>FINANCIAL LEDGER</Text>
        </View>
        <View style={ldStyles.syncBadge}>
          <Text style={ldStyles.syncText}>Synced</Text>
        </View>
      </View>

      {/* Sale / Received / Due */}
      <View style={[ldStyles.statRow, compact && { flexWrap: "wrap", gap: 8 }]}>
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel} numberOfLines={1}>Sale</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[ldStyles.statValue, compact && { fontSize: 13 }]}>{formatINR(sales)}</Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <View style={ldStyles.statLabelRow}>
            <View style={ldStyles.greenDot} />
            <Text style={[ldStyles.statLabel, ldStyles.statLabelGreen]} numberOfLines={1}>
              Received
            </Text>
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[ldStyles.statValue, ldStyles.statValueGreen, compact && { fontSize: 13 }]}>
            {formatINR(received)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel} numberOfLines={1}>Due</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[ldStyles.statValue, compact && { fontSize: 13 }]}>{formatINR(pending)}</Text>
        </View>
      </View>

      {/* Asset Expenses / Paid / Payable */}
      <View style={[ldStyles.statRow, compact && { flexWrap: "wrap", gap: 8 }]}>
        <View style={ldStyles.statGroup}>
          <Text style={ldStyles.statLabel} numberOfLines={1}>Asset Exp.</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[ldStyles.statValue, compact && { fontSize: 13 }]}>{formatINR(totalExpenses)}</Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text style={[ldStyles.statLabel, ldStyles.statLabelRed]} numberOfLines={1}>Paid</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[ldStyles.statValue, ldStyles.statValueRed, compact && { fontSize: 13 }]}>
            {formatINR(supplierPaid)}
          </Text>
        </View>
        <View style={ldStyles.statDivider} />
        <View style={ldStyles.statGroup}>
          <Text style={[ldStyles.statLabel, ldStyles.statLabelOrange]} numberOfLines={1}>
            Payable
          </Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[ldStyles.statValue, ldStyles.statValueOrange, compact && { fontSize: 13 }]}>
            {formatINR(supplierDue)}
          </Text>
        </View>
      </View>

      {/* Transactions */}
      <View style={ldStyles.txSection}>
        <View style={ldStyles.txSectionHeader}>
          <Text style={ldStyles.txHeader}>RECENT TRANSACTIONS</Text>
          {financeHistoryRows.length > 0 && (
            <Text style={ldStyles.txViewAll}>View All →</Text>
          )}
        </View>

        {financeHistoryRows.length === 0 ? (
          <Text style={ldStyles.txEmpty}>
            No transactions for this trip yet
          </Text>
        ) : (
          financeHistoryRows.slice(0, 5).map(({ key, tx, isIn, amount }) => (
            <View key={key} style={ldStyles.txRow}>
              <View
                style={[
                  ldStyles.txIcon,
                  isIn ? ldStyles.txIconIn : ldStyles.txIconOut,
                ]}
              >
                <FontAwesome
                  name={isIn ? "arrow-down" : "arrow-up"}
                  size={11}
                  color={isIn ? "#34d399" : "#f43f5e"}
                />
              </View>
              <View style={ldStyles.txInfo}>
                <Text style={ldStyles.txTitle} numberOfLines={1}>
                  {ledgerHistoryTitle(tx, isIn)}
                </Text>
                <Text style={ldStyles.txMeta} numberOfLines={1}>
                  {formatLedgerDate(tx.transaction_date || tx.created_at)} ·{" "}
                  {tx.party_name?.trim() || "—"}
                </Text>
              </View>
              <Text
                style={[
                  ldStyles.txAmount,
                  isIn ? ldStyles.txAmountIn : ldStyles.txAmountOut,
                ]}
              >
                {isIn ? "+ " : "− "}
                {formatINR(amount)}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// ── Expense List Card (white) ──────────────────────────────────────────────────

function ExpenseListCard({
  expenses,
  onAddExpense,
}: {
  expenses: ExpenseRow[];
  onAddExpense?: () => void;
}) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  function getCategoryIcon(
    category: string,
  ): React.ComponentProps<typeof FontAwesome>["name"] {
    const c = category.toLowerCase();
    if (c.includes("fuel") || c.includes("diesel") || c.includes("petrol"))
      return "tint";
    if (c.includes("toll") || c.includes("road")) return "road";
    if (c.includes("driver") || c.includes("labour")) return "user";
    if (c.includes("maintenance") || c.includes("repair")) return "wrench";
    if (c.includes("loading") || c.includes("unloading")) return "archive";
    return "file-text-o";
  }

  function getCategoryColor(category: string): string {
    const c = category.toLowerCase();
    if (c.includes("fuel") || c.includes("diesel") || c.includes("petrol"))
      return "#f97316";
    if (c.includes("toll") || c.includes("road")) return "#3b82f6";
    if (c.includes("driver") || c.includes("labour")) return "#8b5cf6";
    if (c.includes("maintenance") || c.includes("repair")) return "#ef4444";
    return "#64748b";
  }

  return (
    <View style={elStyles.card}>
      <View style={elStyles.header}>
        <View style={elStyles.headerLeft}>
          <Text style={elStyles.title}>Trip Expenses</Text>
          {expenses.length > 0 && (
            <View style={elStyles.badge}>
              <Text style={elStyles.badgeText}>{expenses.length}</Text>
            </View>
          )}
        </View>
        <View style={elStyles.headerRight}>
          <Text style={elStyles.total}>{formatINR(total)}</Text>
          {onAddExpense && (
            <TouchableOpacity
              style={elStyles.addBtn}
              onPress={onAddExpense}
              activeOpacity={0.8}
            >
              <FontAwesome name="plus" size={10} color="#fff" />
              <Text style={elStyles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {expenses.length === 0 ? (
        <View style={elStyles.empty}>
          <FontAwesome name="inbox" size={24} color="#cbd5e1" />
          <Text style={elStyles.emptyText}>No expenses recorded</Text>
        </View>
      ) : (
        <View style={elStyles.list}>
          {expenses.map((exp) => {
            const iconColor = getCategoryColor(exp.category);
            const iconName = getCategoryIcon(exp.category);
            const isPaid = exp.status === "Paid";
            return (
              <View key={exp.id} style={elStyles.item}>
                <View
                  style={[
                    elStyles.itemIcon,
                    { backgroundColor: iconColor + "18" },
                  ]}
                >
                  <FontAwesome name={iconName} size={16} color={iconColor} />
                </View>
                <View style={elStyles.itemInfo}>
                  <Text style={elStyles.itemTitle} numberOfLines={1}>
                    {exp.description !== "—" ? exp.description : exp.category}
                  </Text>
                  <Text style={elStyles.itemMeta} numberOfLines={1}>
                    {exp.date} · {exp.type}
                  </Text>
                </View>
                <View style={elStyles.itemRight}>
                  <Text style={elStyles.itemAmount}>
                    ₹{exp.amount.toLocaleString("en-IN")}
                  </Text>
                  <View
                    style={[
                      elStyles.itemStatus,
                      {
                        backgroundColor: isPaid ? "#dcfce7" : "#fef3c7",
                        borderColor: isPaid ? "#bbf7d0" : "#fde68a",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        elStyles.itemStatusText,
                        { color: isPaid ? "#15803d" : "#b45309" },
                      ]}
                    >
                      {exp.status}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Feedback placeholder ───────────────────────────────────────────────────────

function FeedbackPlaceholder() {
  return (
    <View style={fbStyles.card}>
      <View style={fbStyles.headerRow}>
        <View style={fbStyles.titleCluster}>
          <View style={fbStyles.awardCircle}>
            <Feather name="award" size={22} color={Theme.primary} />
          </View>
          <View style={fbStyles.titleTextWrap}>
            <Text style={fbStyles.title}>Ratings</Text>
            <Text style={fbStyles.subtitle}>
              Track service quality across completed trips
            </Text>
          </View>
        </View>
      </View>
      <View style={fbStyles.body}>
        <Feather name="clock" size={32} color={Theme.borderLight} />
        <Text style={fbStyles.message}>
          Feedback available once the trip is completed
        </Text>
        <Text style={fbStyles.sub}>
          Driver, supplier, and client ratings will appear here with audit-style
          entries when this voyage is closed.
        </Text>
      </View>
    </View>
  );
}

const fbStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    paddingHorizontal: 24,
    paddingVertical: 20,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  titleCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  awardCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Theme.primary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  titleTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  body: {
    paddingVertical: 28,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 12,
  },
  message: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  sub: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
    maxWidth: 440,
    lineHeight: 18,
  },
});

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabButton({
  label,
  icon,
  active,
  onPress,
  compact = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabBtn, compact && styles.tabBtnCompact, active && styles.tabBtnActive, compact && active && styles.tabBtnActiveCompact]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {!compact ? (
        <FontAwesome
          name={icon}
          size={13}
          color={active ? "#2563eb" : "#6b7280"}
        />
      ) : null}
      <Text style={[styles.tabBtnText, compact && styles.tabBtnTextCompact, active && styles.tabBtnTextActive, compact && active && styles.tabBtnTextActiveCompact]}>
        {label}
      </Text>
      {compact && active ? <View style={styles.tabUnderlineCompact} /> : null}
    </TouchableOpacity>
  );
}

// ── Nav action button ──────────────────────────────────────────────────────────

function NavAction({
  icon,
  label,
  onPress,
  primary,
  danger,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  onPress?: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.navActionBtn,
        primary && styles.navActionBtnPrimary,
        danger && styles.navActionBtnDanger,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <FontAwesome
        name={icon}
        size={12}
        color={primary ? "#fff" : danger ? "#ef4444" : "#94a3b8"}
      />
      <Text
        style={[
          styles.navActionText,
          primary && styles.navActionTextPrimary,
          danger && styles.navActionTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Dashboard styles ────────────────────────────────────────────────────────────
const DS_BG = '#F8FAFC';
const DS_CARD = '#FFFFFF';
const DS_BORDER = 'rgba(15,23,42,0.08)';
const DS_TEXT = '#0F172A';
const DS_MUTED = 'rgba(15,23,42,0.55)';

const dStyles = StyleSheet.create({
  heroCard: {
    flexDirection: 'row',
    backgroundColor: DS_CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DS_BORDER,
    padding: 24,
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 20,
  },
  heroLeft: { flex: 1, minWidth: 260 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  heroTripId: { fontSize: 26, fontWeight: '800', color: DS_TEXT, letterSpacing: -0.5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  routeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  routeStop: { flex: 1, minWidth: 100 },
  routeLabel: { fontSize: 9, fontWeight: '700', color: DS_MUTED, letterSpacing: 1.2, marginBottom: 4 },
  routeCity: { fontSize: 17, fontWeight: '700', color: DS_TEXT },
  routeDate: { fontSize: 12, color: DS_MUTED, marginTop: 4 },
  routeDivider: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeLine: { height: 1, width: 32, backgroundColor: 'rgba(15,23,42,0.15)' },
  heroStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DS_BORDER,
    padding: 20,
    alignItems: 'center',
    alignSelf: 'center',
    minWidth: 200,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 9, fontWeight: '700', color: DS_MUTED, letterSpacing: 1, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', color: DS_TEXT },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(15,23,42,0.09)', marginHorizontal: 8 },
  statBoxSm: { alignItems: 'flex-end' },
  statLabelSm: { fontSize: 9, fontWeight: '700', color: DS_MUTED, letterSpacing: 1, marginBottom: 4 },
  statValueSm: { fontSize: 14, fontWeight: '700', color: DS_TEXT },
  row: { flexDirection: 'row', gap: 16, marginBottom: 16, flexWrap: 'wrap' },
  card: { backgroundColor: DS_CARD, borderRadius: 16, borderWidth: 1, borderColor: DS_BORDER, padding: 20 },
  mapCol: { flex: 3, minWidth: 300 },
  auditCol: { flex: 2, minWidth: 260 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: DS_TEXT, flex: 1 },
  openMapsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(96,165,250,0.3)', backgroundColor: 'rgba(96,165,250,0.08)' },
  openMapsBtnText: { fontSize: 11, fontWeight: '600', color: '#60a5fa' },
  telemetryWrap: { borderRadius: 10 },
  telemetryBar: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#0f141a', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  telemetryTitle: { fontSize: 12, fontWeight: '700', color: DS_TEXT },
  telemetrySub: { fontSize: 10, color: DS_MUTED, marginTop: 1 },
  timelineHeaderIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  timelineHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(15,23,42,0.8)',
    letterSpacing: 0.9,
  },
  auditScroll: { maxHeight: 360 },
  auditItem: { flexDirection: 'row', gap: 12, paddingBottom: 10, marginBottom: 6 },
  auditItemLast: { marginBottom: 0, paddingBottom: 0 },
  auditTrackCol: { width: 18, alignItems: 'center', flexShrink: 0 },
  auditTimelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#059669',
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  auditTimelineDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#059669',
  },
  auditTimelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(5,150,105,0.28)',
    marginTop: 4,
    minHeight: 18,
  },
  auditContentRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  auditBody: { flex: 1, minWidth: 0 },
  auditTitle: { fontSize: 14, fontWeight: '700', color: DS_TEXT, marginBottom: 1 },
  auditDetail: { fontSize: 11, color: DS_MUTED },
  auditMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 1 },
  auditTime: { fontSize: 10, color: 'rgba(15,23,42,0.42)', fontWeight: '600', minWidth: 56, textAlign: 'right' },
  emptyText: { fontSize: 13, color: DS_MUTED, textAlign: 'center', paddingVertical: 32 },
  bottomLeft: { flex: 2, minWidth: 220, gap: 12 },
  docsCol: { flex: 3, minWidth: 280 },
  cardMicroLabel: { fontSize: 9, fontWeight: '700', color: DS_MUTED, letterSpacing: 1.2, marginBottom: 14 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  driverAvatar: { width: 44, height: 44, borderRadius: 22 },
  driverAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(15,23,42,0.06)', alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 15, fontWeight: '700', color: DS_TEXT },
  driverRating: { fontSize: 12, color: '#f59e0b', marginTop: 3 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleIconWrap: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(15,23,42,0.05)', borderWidth: 1, borderColor: DS_BORDER, alignItems: 'center', justifyContent: 'center' },
  vehicleName: { fontSize: 15, fontWeight: '700', color: DS_TEXT },
  vehicleSub: { fontSize: 12, color: DS_MUTED, marginTop: 3 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.06)' },
  docIconWrap: { width: 22, alignItems: 'center' },
  docLabel: { flex: 1, fontSize: 13, color: DS_TEXT, fontWeight: '500' },
  docStatusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  docStatusVerified: { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.28)' },
  docStatusPending: { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.28)' },
  docStatusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  docStatusTextVerified: { color: '#22c55e' },
  docStatusTextPending: { color: '#f59e0b' },
  docsBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(15,23,42,0.04)', borderWidth: 1, borderColor: DS_BORDER },
  docsBadgeText: { fontSize: 10, fontWeight: '700', color: DS_MUTED, letterSpacing: 0.4 },
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  refTrackWrap: { gap: 14 },
  refHeroBridgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  refHeroBridgeCol: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refHeroBridgeColRight: {
    justifyContent: "flex-end",
  },
  refHeroBridgeIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.14)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.35)",
  },
  refHeroBridgeIconWrapRose: {
    backgroundColor: "rgba(244,63,94,0.14)",
    borderColor: "rgba(251,113,133,0.35)",
  },
  refHeroBridgeLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  refHeroBridgeLabelRight: {
    textAlign: "right",
  },
  refHeroBridgeValue: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    textTransform: "uppercase",
  },
  refHeroRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refHeroRouteCol: {
    flex: 1,
    minWidth: 0,
  },
  refHeroRouteColRight: {
    alignItems: "flex-end",
  },
  refHeroMetaShell: {
    marginTop: 12,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refHeroMetaIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
  refHeroMetaIconGhost: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  refHeroMetaDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  refHeroMetaItemRight: {
    justifyContent: "space-between",
  },
  refAssetRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
    marginBottom: 14,
  },
  refAssetCard: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef2f7",
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  refAssetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  refAssetIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2ff",
  },
  refAssetIconWrapDark: {
    backgroundColor: "#0f172a",
  },
  refAssetChangeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  refAssetChangeBtnText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  refAssetLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  refAssetValue: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
  },
  refAssetSubtle: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  refTabShell: {
    marginBottom: 16,
    padding: 6,
    borderRadius: 24,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    gap: 4,
  },
  refTabBtn: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  refTabBtnActive: {
    backgroundColor: "#0f172a",
  },
  refTabBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  refTabBtnTextActive: {
    color: "#fff",
  },
  refFinanceSubTabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  refFinanceSubBtn: {
    paddingBottom: 8,
  },
  refFinanceSubBtnText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: "#94a3b8",
  },
  refFinanceSubBtnTextActive: {
    color: "#0f172a",
  },
  refFinanceSubLine: {
    marginTop: 4,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#6366f1",
  },
  refSettleMetaRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  refSettleMetaLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  refSettleMetaValuePositive: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "900",
    color: "#10b981",
  },
  refSettleMetaSep: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#eef2f7",
  },
  refSettleMetaRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  refSettleMetaValueNegative: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "900",
    color: "#f43f5e",
  },
  refFinanceRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  refFinanceRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  refFinanceRowValuePositive: {
    color: "#10b981",
  },
  refFinanceRowValueNegative: {
    color: "#f43f5e",
  },
  refFinanceSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 24,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 8,
  },
  refFinanceSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    paddingVertical: 8,
  },
  refTxnRow: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#eef2f7",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  refTxnLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  refTxnIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  refTxnIconIn: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  refTxnIconOut: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  refTxnTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  refTxnLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  refTxnMeta: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  refTxnAmount: {
    fontSize: 14,
    fontWeight: "900",
  },
  refTxnAmountIn: {
    color: "#10b981",
  },
  refTxnAmountOut: {
    color: "#f43f5e",
  },
  refVaultWrap: {
    borderRadius: 34,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
    padding: 18,
    gap: 12,
  },
  refVaultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  refVaultHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  refVaultTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  refVaultSub: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  refVaultGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  refVaultCard: {
    width: "48.3%",
    borderRadius: 24,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef2f7",
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: "center",
    gap: 5,
  },
  refVaultCardTitle: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: "#0f172a",
    textTransform: "uppercase",
  },
  refVaultCardStatus: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  refVaultViewBtn: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#eef2f7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  refVaultViewText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
  },
  refHeroCard: {
    marginBottom: 16,
    backgroundColor: "#030b1f",
    borderRadius: 42,
    paddingHorizontal: 24,
    paddingVertical: 22,
    overflow: "hidden",
    borderBottomWidth: 3,
    borderBottomColor: Theme.driverEmerald,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  refModePillTopRight: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 2,
  },
  refHeroBgGlow: {
    position: "absolute",
    left: -58,
    bottom: -58,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(16,185,129,0.14)",
  },
  refHeroKickerRow: { marginBottom: 14 },
  refHeroKicker: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 3.8,
    color: "#94a3b8",
  },
  refHeroCity: {
    fontSize: 36,
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: -1.1,
    lineHeight: 38,
  },
  refHeroCityMobile: {
    fontSize: 30,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  refHeroState: {
    marginTop: 2,
    marginBottom: 10,
    fontSize: 9,
    fontWeight: "900",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 2.2,
  },
  refHeroToRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 4 },
  refHeroToDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.positive },
  refHeroToLine: { width: 1, height: 14, backgroundColor: "rgba(16,185,129,0.5)" },
  refHeroToText: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, color: Theme.positive },
  refHeroDivider: { marginTop: 4, marginBottom: 12, height: 1, backgroundColor: "rgba(255,255,255,0.12)" },
  refHeroMetaRow: { flexDirection: "row", gap: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.12)" },
  refHeroMetaItem: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  refHeroMetaLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 2.2,
    color: "#94a3b8",
  },
  refHeroMetaValue: { fontSize: 11, fontWeight: "800", color: "#ffffff", marginTop: 1, letterSpacing: 0.4 },
  refHeroAssignedRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "nowrap",
  },
  refHeroPartyInfoRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 12,
  },
  refHeroPartyInfoCell: {
    flex: 1,
    minWidth: 0,
  },
  refHeroPartyInfoTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  refHeroAssignedLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 2.1,
  },
  refHeroAssignedValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.2,
  },
  refModePill: {
    marginLeft: "auto",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  refModePillIntegrated: {
    backgroundColor: "rgba(16,185,129,0.12)",
    borderColor: "rgba(16,185,129,0.45)",
  },
  refModePillManual: {
    backgroundColor: "rgba(148,163,184,0.12)",
    borderColor: "rgba(148,163,184,0.35)",
  },
  refModePillText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  refModePillTextIntegrated: {
    color: Theme.positive,
  },
  refModePillTextManual: {
    color: "#cbd5e1",
  },
  refHeroPartyRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  refHeroPartyCell: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  refHeroPartyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  refHeroPartyLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 2.1,
    color: "#94a3b8",
  },
  refHeroPartyBtn: {
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  refHeroPartyBtnText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#ffffff",
  },
  refHeroPartyValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: -0.1,
  },
  refFeedbackWrap: {
    marginTop: 10,
    borderRadius: 14,
    overflow: "hidden",
  },
  assignModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  assignModalCard: {
    maxHeight: "86%",
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 14,
  },
  assignModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  assignModalTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  assignModalClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  refTimelineHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4, marginBottom: 4 },
  refTimelineHeaderIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  refManifestCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 16,
  },
  refKickerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  refKickerBar: { width: 4, height: 16, borderRadius: 2, backgroundColor: "#2563eb" },
  refKickerText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.8,
    color: "#64748b",
  },
  refRouteRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  refRouteDots: { width: 10, alignItems: "center", marginTop: 5 },
  refDot: { width: 7, height: 7, borderRadius: 4 },
  refDotStart: { backgroundColor: "#10b981" },
  refDotEnd: { backgroundColor: "#ef4444" },
  refDotLine: { width: 1.5, flex: 1, minHeight: 16, marginVertical: 4, backgroundColor: "#e2e8f0" },
  refRouteTextCol: { flex: 1, gap: 8 },
  refRoutePlace: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  refMetaGrid: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  refMetaCell: { flex: 1, minWidth: 0 },
  refMetaLabel: { fontSize: 10, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 },
  refMetaValue: { marginTop: 2, fontSize: 13, fontWeight: "700", color: "#1e293b" },
  refOperatorCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
  },
  refOperatorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refOperatorLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8" },
  refOperatorValue: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  refOperatorSub: { marginTop: 9, fontSize: 12, fontWeight: "500", color: "#64748b" },
  refAssignCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
    gap: 8,
  },
  refAssignTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a", marginBottom: 2 },
  refAssignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    paddingTop: 10,
  },
  refAssignTxtWrap: { flex: 1, minWidth: 0 },
  refAssignLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: "#94a3b8" },
  refAssignValue: { marginTop: 1, fontSize: 14, fontWeight: "700", color: "#0f172a" },
  refAssignFoot: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  refAssignFootText: { flex: 1, minWidth: 0, fontSize: 11, color: "#6b7280" },
  refOtpBtn: { backgroundColor: "#0f172a", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  refOtpBtnText: { color: "#fff", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  refDocCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
  },
  refDocHeader: { marginBottom: 8 },
  refTimelineWrap: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 14,
    gap: 8,
  },
  refTimelineTitle: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 2, color: "#0f172a" },
  refTimelineCard: {
    backgroundColor: "#fff",
    borderRadius: 38,
    borderWidth: 1,
    borderColor: "#e6edf5",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  refTimelineItemWrap: {
    position: "relative",
    paddingLeft: 0,
  },
  refTimelineConnector: {
    position: "absolute",
    left: 17,
    top: 34,
    bottom: -8,
    width: 2,
    backgroundColor: "#e5e7eb",
  },
  refTimelineItem: { flexDirection: "row", gap: 14, paddingVertical: 12 },
  refTimelineItemExpanded: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingHorizontal: 6,
  },
  refTimelineDotIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 3,
  },
  refTimelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10b981", marginTop: 5 },
  refTimelineBody: { flex: 1, minWidth: 0 },
  refTimelineTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  refTimelineTopRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  refTimelineStatus: { fontSize: 12, fontWeight: "900", color: "#0f172a", textTransform: "uppercase", letterSpacing: 1.1 },
  refTimelineTime: { fontSize: 10, fontWeight: "700", color: "#94a3b8" },
  refTimelineLocation: { marginTop: 3, fontSize: 11, color: "#64748b", fontWeight: "700" },
  refTimelineDetails: { marginTop: 8, fontSize: 10, color: "#475569", lineHeight: 15, fontStyle: "italic" },
  refAssignInlineRow: {
    marginTop: 2,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 12,
    gap: 10,
    flexDirection: "row",
  },
  refAssignInlineCell: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#eef2f7",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#f8fafc",
  },
  refAssignInlineLabel: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    color: "#94a3b8",
  },
  refAssignInlineValue: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
  refAssignInlineBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#0f172a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refAssignInlineBtnText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  refDeliveredCard: {
    marginTop: 4,
    borderRadius: 30,
    backgroundColor: "#059669",
    paddingHorizontal: 18,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refDeliveredLabel: {
    fontSize: 10,
    color: "#d1fae5",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  refDeliveredValue: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    fontStyle: "italic",
  },
  refDeliveredIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  refFinanceWrap: { gap: 14 },
  refFinanceManifestHero: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    overflow: "hidden",
  },
  refManifestNetHuge: {
    marginTop: 8,
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -1.2,
    color: "#0f172a",
  },
  refManifestHeroSplit: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    flexDirection: "row",
    gap: 8,
    width: "100%",
  },
  refManifestCol: { flex: 1, minWidth: 0 },
  refManifestColRight: { alignItems: "stretch" },
  refManifestHeroSep: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#eef2f7",
    marginHorizontal: 4,
    minHeight: 120,
  },
  refManifestColHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 6,
  },
  refManifestColHeadLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 },
  refManifestColHeadRight: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0, justifyContent: "flex-end" },
  refManifestColTitle: {
    fontSize: 9,
    fontWeight: "900",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  refManifestDot: { width: 6, height: 6, borderRadius: 3 },
  refManifestDotSales: { backgroundColor: "#22c55e" },
  refManifestDotCost: { backgroundColor: "#fb7185" },
  refManifestMiniPlus: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  refManifestMiniPlusMuted: { marginRight: 4 },
  refManifestColAmount: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
    fontStyle: "italic",
  },
  refManifestSalesAmt: { color: "#16a34a" },
  refManifestCostAmt: { color: "#e11d48", textAlign: "right", alignSelf: "stretch" },
  refManifestMicroBox: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eef2f7",
    backgroundColor: "rgba(248,250,252,0.7)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  refManifestMicroLine: { fontSize: 8, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase" },
  refManifestMicroRight: { alignSelf: "flex-end", textAlign: "right", width: "100%" },
  refManifestMicroAdjSales: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "900",
    color: "#16a34a",
    textTransform: "uppercase",
  },
  refManifestMicroAdjCost: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "900",
    color: "#e11d48",
    textTransform: "uppercase",
    textAlign: "right",
  },
  refProvisionWrap: {
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    ...Platform.select({
      web: { boxShadow: "0 24px 50px rgba(15,23,42,0.1)" },
      default: {},
    }),
  },
  refProvisionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  refProvisionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#0f172a",
    letterSpacing: -0.3,
    textTransform: "uppercase",
    minWidth: 0,
  },
  refProvisionClose: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignSelf: "flex-start",
  },
  refProvisionDnRow: { flexDirection: "row", gap: 12 },
  refProvisionDnBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  refProvisionCnBtn: {
    borderColor: "rgba(99,102,241,0.35)",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  refProvisionDnBtnDebit: {
    borderColor: "rgba(244,63,94,0.35)",
    backgroundColor: "rgba(244,63,94,0.08)",
  },
  refProvisionDnLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  refInlineAdjustWrap: {
    marginTop: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    gap: 12,
    ...Platform.select({
      web: { boxShadow: "0 12px 28px rgba(15,23,42,0.08)" },
      default: {},
    }),
  },
  refInlineAdjustHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  refInlineAdjustTitle: {
    fontSize: 14,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#0f172a",
    textTransform: "uppercase",
  },
  refInlineAdjustSub: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  refInlineModeBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refInlineModeBadgeCredit: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(22,163,74,0.35)",
  },
  refInlineModeBadgeDebit: {
    backgroundColor: "rgba(244,63,94,0.1)",
    borderColor: "rgba(225,29,72,0.28)",
  },
  refInlineModeBadgeTxt: {
    fontSize: 9,
    fontWeight: "900",
    color: "#1e293b",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  refInlineAdjustClose: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
  },
  refInlineAdjustLabel: {
    fontSize: 8,
    fontWeight: "900",
    color: "#64748b",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  refInlineAdjustLockedMeta: {
    marginTop: -2,
    fontSize: 10,
    fontWeight: "800",
    color: "#334155",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  refInlineAdjustRow: {
    flexDirection: "row",
    gap: 10,
  },
  refInlineAdjustBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  refInlineAdjustBtnActive: {
    borderColor: "#4f46e5",
    backgroundColor: "rgba(79,70,229,0.2)",
  },
  refInlineAdjustImpactPlus: {
    borderColor: "rgba(34,197,94,0.45)",
    backgroundColor: "rgba(34,197,94,0.18)",
  },
  refInlineAdjustImpactMinus: {
    borderColor: "rgba(244,63,94,0.45)",
    backgroundColor: "rgba(244,63,94,0.18)",
  },
  refInlineAdjustBtnText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#cbd5e1",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  refInlineAdjustBtnTextActive: {
    color: "#fff",
  },
  refInlineAmountRow: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  refInlineCurrency: {
    fontSize: 28,
    fontWeight: "300",
    color: "#334155",
    marginRight: 10,
  },
  refInlineAmountInput: {
    flex: 1,
    fontSize: 30,
    fontWeight: "300",
    color: "#0f172a",
    ...Platform.select({
      web: { outlineStyle: "none" } as any,
      default: {},
    }),
  },
  refInlineReasonWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  refInlineReasonChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  refInlineReasonChipActive: {
    borderColor: "#4f46e5",
    backgroundColor: "rgba(79,70,229,0.12)",
  },
  refInlineReasonChipTxt: {
    fontSize: 9,
    fontWeight: "900",
    color: "#475569",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  refInlineReasonChipTxtActive: {
    color: "#3730a3",
  },
  refInlineOtherInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#ffffff",
    ...Platform.select({
      web: { outlineStyle: "none" } as any,
      default: {},
    }),
  },
  refInlineSaveBtn: {
    marginTop: 2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    backgroundColor: "#4f46e5",
  },
  refInlineSaveBtnDisabled: {
    opacity: 0.45,
  },
  refInlineSaveBtnTxt: {
    fontSize: 10,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  refManifestSplitSection: { gap: 10 },
  refManifestSplitHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  refManifestSplitTitle: {
    fontSize: 9,
    fontWeight: "900",
    color: "#cbd5e1",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  refManifestBands: {
    backgroundColor: "#fff",
    borderRadius: 28,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eef2f7",
    gap: 14,
    ...Platform.select({
      web: { boxShadow: "0 18px 50px rgba(15,23,42,0.05)" },
      default: {},
    }),
  },
  refManifestBand: { gap: 8 },
  refManifestBandSep: { height: 1, backgroundColor: "#f1f5f9" },
  refManifestBandLblRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  refManifestBandLbl: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  refManifestBandLblIn: { color: "#15803d" },
  refManifestBandLblOut: { color: "#e11d48" },
  refManifestBandEmpty: {
    paddingVertical: 8,
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "600",
    fontStyle: "italic",
  },
  refManifestBandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 10,
    borderWidth: 1,
  },
  refManifestBandRowIn: {
    borderColor: "rgba(34,197,94,0.12)",
    backgroundColor: "rgba(236,253,245,0.45)",
  },
  refManifestBandRowOut: {
    borderColor: "rgba(244,63,94,0.12)",
    backgroundColor: "rgba(254,242,242,0.45)",
  },
  refManifestBandRowInner: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  refManifestBandReason: { flex: 1, fontSize: 12, fontWeight: "900", color: "#1e293b" },
  refManifestBandAmtIn: {
    fontSize: 13,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#15803d",
  },
  refManifestBandAmtOut: {
    fontSize: 13,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#e11d48",
  },
  refSettleCard: {
    backgroundColor: "#fff",
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 22,
    alignItems: "center",
  },
  refSettleLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.6, textTransform: "uppercase", color: "#94a3b8" },
  refSettleValue: { marginTop: 6, fontSize: 40, fontWeight: "900", color: "#0f172a", letterSpacing: -0.8 },
  refSettleHint: {
    marginTop: 4,
    paddingHorizontal: 8,
    fontSize: 9,
    fontWeight: "600",
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 14,
  },
  refSettleMicro: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "600",
    color: "#94a3b8",
  },
  refSettleMicroRight: {
    textAlign: "right",
    alignSelf: "flex-end",
  },
  refSettleMetaLabelRightAligned: {
    textAlign: "right",
    alignSelf: "flex-end",
  },
  refSettleExpenseRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refSettleExpenseLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  refSettleExpenseVal: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  mobileFinanceAdjCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    gap: 10,
  },
  mobileFinanceAdjHeader: {
    gap: 3,
    marginBottom: 4,
  },
  mobileFinanceAdjTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  mobileFinanceAdjSub: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.85,
  },
  mobileFinanceAdjRow: {
    borderWidth: 1,
    borderColor: "#f1f5f9",
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#f8fafc",
  },
  mobileFinanceAdjMetric: {
    flex: 1,
    minWidth: 0,
  },
  mobileFinanceAdjMetricLbl: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.65,
    marginBottom: 3,
  },
  mobileFinanceAdjMetricVal: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  mobileFinanceAdjMetPos: { color: "#16a34a" },
  mobileFinanceAdjMetNeg: { color: "#dc2626" },
  mobileFinanceAdjBtn: {
    borderRadius: 10,
    backgroundColor: "#0f172a",
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#0f172a",
  },
  mobileFinanceAdjBtnMuted: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
  },
  mobileFinanceAdjBtnCost: {
    backgroundColor: "#1e293b",
    borderColor: "#1e293b",
  },
  mobileFinanceAdjBtnTxt: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  mobileFinanceAdjBtnTxtMuted: {
    color: "#334155",
  },
  mobileFinanceAdjGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  mobileFinanceAdjGhostTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  refSettleBadge: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refSettleBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#059669",
  },
  refFinanceBreakCard: {
    backgroundColor: "#fff",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#e6edf5",
    padding: 16,
    gap: 10,
  },
  refAdjRegHeader: {
    marginBottom: 2,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  refAdjRegTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#64748b",
  },
  refFinanceEmpty: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 6,
  },
  refFinanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  refAdjLabelCol: { flex: 1, minWidth: 0 },
  refAdjPartyTag: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.65,
    color: "#94a3b8",
  },
  refAdjRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  refAdjTrash: { padding: 2 },
  refFinanceRowLabel: { fontSize: 12, color: "#475569", fontWeight: "700" },
  refFinanceRowValue: { fontSize: 13, color: "#0f172a", fontWeight: "800" },
  refFinanceRowValueStrong: { fontSize: 15 },
  refBottomInfo: {
    borderRadius: 22,
    backgroundColor: "#0f172a",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refBottomInfoLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: "#94a3b8",
  },
  refBottomInfoValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  refBottomInfoBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  root: {
    flex: 1,
    backgroundColor: DS_BG,
    overflow: "hidden",
  },

  // ── Top nav ──
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    flexWrap: "wrap",
    gap: 12,
  },
  navBarMobile: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
    paddingTop: 10,
    paddingBottom: 10,
    flexWrap: "nowrap",
  },
  navCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  navMobileCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  navMobileKicker: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 3.8,
    textTransform: "uppercase",
    color: "#cbd5e1",
  },
  navMobileTripRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navMobileTripId: {
    fontSize: 17,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#0f172a",
    letterSpacing: -0.35,
  },
  navMobilePulseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  navMobileDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  navMobileDotEmerald: {
    backgroundColor: "#34d399",
  },
  navMobileDotIndigo: {
    backgroundColor: "#6366f1",
  },
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  navBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  navBackText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
  },
  navTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  navPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  navPillAsset: { backgroundColor: "#DBEAFE" },
  navPillAggregate: { backgroundColor: "#FEF3C7" },
  navPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.5,
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  navActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  navActionBtnPrimary: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  navActionBtnDanger: {
    borderColor: "#FECACA",
    backgroundColor: "#FFFFFF",
  },
  navActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  navActionTextPrimary: { color: "#fff" },
  navActionTextDanger: { color: "#ef4444" },

  // ── Tab bar ──
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tabBarMobile: {
    marginHorizontal: 12,
    marginTop: 10,
    borderBottomWidth: 0,
    borderRadius: 14,
    backgroundColor: "rgba(226,232,240,0.55)",
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 4,
  },
  tabBarMobileInline: {
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: "rgba(226,232,240,0.55)",
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 4,
    flexDirection: "row",
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginRight: 28,
    position: "relative",
  },
  tabBtnActive: {},
  tabBtnCompact: {
    flex: 1,
    marginRight: 0,
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  tabBtnActiveCompact: {
    backgroundColor: "#0f172a",
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  tabBtnTextCompact: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tabBtnTextActive: {
    color: "#60a5fa",
  },
  tabBtnTextActiveCompact: {
    color: "#ffffff",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#60a5fa",
    borderRadius: 1,
  },
  tabUnderlineCompact: {
    position: "absolute",
    bottom: 2,
    left: "32%",
    right: "32%",
    height: 2,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },

  // ── Scroll ──
  scroll: { flex: 1 },
  scrollContent: {
    width: "100%",
    maxWidth: 1680,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 20,
  },

  // ── Tracking tab layout ──
  workspaceRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  workspaceLeftCol: {
    flex: 0.95,
    minWidth: 360,
    gap: 16,
  },
  workspaceRightCol: {
    flex: 1.05,
    minWidth: 420,
    gap: 16,
  },
  voyageCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
    gap: 16,
  },
  sectionKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionKickerBar: {
    width: 4,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#2563eb",
  },
  sectionKicker: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  routeLineWrap: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  routeDotsCol: {
    width: 14,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#fff",
  },
  routeDotStart: {
    backgroundColor: "#10b981",
  },
  routeDotEnd: {
    backgroundColor: "#ef4444",
  },
  routeDashedLine: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: "#cbd5e1",
    borderStyle: "dashed",
    marginVertical: 4,
  },
  routeTextCol: {
    flex: 1,
    justifyContent: "space-between",
    minHeight: 62,
  },
  routePlace: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  voyageMetaGrid: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 12,
    flexDirection: "row",
    gap: 12,
  },
  voyageMetaCell: {
    flex: 1,
    minWidth: 0,
  },
  voyageMetaLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  voyageMetaValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  operatorCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    gap: 8,
  },
  operatorBadge: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  operatorLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  operatorValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  operatorSub: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  telemetryWrap: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    position: "relative",
  },
  telemetryOverlay: {
    position: "absolute",
    bottom: 16,
    right: 16,
    left: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.4)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  telemetryTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0F172A",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  telemetrySub: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  lrGrow: {
    flex: 1,
  },
  otpStateCardInline: {
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 4,
  },
  otpStateBodyRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  otpStateBodyLeft: {
    flex: 1,
    minWidth: 0,
  },
  otpStateBodyRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  otpActionStatus: {
    fontSize: 9,
    fontWeight: "600",
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  otpStateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  otpStateTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  otpStateSub: {
    fontSize: 11,
    color: "#6b7280",
    lineHeight: 16,
  },
  otpCodeRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  otpCodeLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  otpCodeValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: 0.8,
  },
  otpResendBtn: {
    marginTop: 0,
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  otpResendBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  otpDisabledBtn: {
    marginTop: 0,
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "#111827",
    opacity: 0.72,
  },
  otpDisabledBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  otpStateBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  otpStateBadgePending: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  otpStateBadgeVerified: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  otpStateBadgeText: {
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  otpStateBadgeTextPending: {
    color: "#b45309",
  },
  otpStateBadgeTextVerified: {
    color: "#047857",
  },
  trackingRightCol: {
    flex: 1,
    minWidth: 0,
  },
  assignTimelineRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
    flex: 1,
  },
  truckCol: {
    width: "36%",
    flexShrink: 0,
    minWidth: 240,
  },
  timelineCol: {
    flex: 1,
    minWidth: 0,
  },
  feedbackWrap: {
    marginTop: 4,
  },

  // ── Finance tab layout ──
  financeRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },
  financeContentRow: {
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },
  financeOverviewCol: {
    flex: 7,
    minWidth: 0,
  },
  financeSummaryCol: {
    flex: 3,
    minWidth: 0,
  },
  darkSection: {
    backgroundColor: "#fff",
    borderRadius: 6,
    marginBottom: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  darkSectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#F1F5F9",
    textTransform: "uppercase",
  },
  detailBody: {
    backgroundColor: "#fff",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  detailValue: { fontSize: 10, fontWeight: "600", color: "#111827" },
  detailValueRed: { color: "#ef4444" },
  detailValueBoldItalic: {
    fontSize: 10,
    fontWeight: "700",
    color: "#111827",
    fontStyle: "italic",
  },
  detailValueBold: { fontSize: 10, fontWeight: "700", color: "#111827" },
  detailValueGreen: { color: "#15803d" },
  twoColRow: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 10,
  },
  twoColItem: { flex: 1, minWidth: 0 },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryCardItem: { flex: 1, alignItems: "flex-start" },
  summaryCardLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  summaryCardValue: { fontSize: 11, fontWeight: "700", color: "#0F172A" },
  summaryCardValueGreen: { color: "#22c55e" },
  summaryCardValueRed: { color: "#ef4444" },
  transactionHistoryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  transactionHistoryHeader: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  transactionHistoryEmpty: {
    fontSize: 13,
    color: "#64748b",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  transactionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  transactionIconIn: {
    backgroundColor: "#16a34a",
  },
  transactionIconOut: {
    backgroundColor: "#dc2626",
  },
  transactionInfo: { flex: 1, minWidth: 0 },
  transactionText1: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  transactionText2: { fontSize: 11, color: "#64748B", marginTop: 2 },
  transactionAmount: { fontSize: 13, fontWeight: "700" },
  transactionAmountIn: { color: "#22c55e" },
  transactionAmountOut: { color: "#ef4444" },

  // ── Error ──
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  errorText: { fontSize: 15, color: "#6b7280" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#111827",
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },

  // ── Finance two-col layout ──
  financeColsRow: {
    flexDirection: "row",
    gap: 24,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  financeLeftCol: {
    flex: 0.95,
    minWidth: 380,
    gap: 16,
  },
  financeRightCol: {
    flex: 1.05,
    minWidth: 420,
    flexDirection: "column",
    gap: 20,
  },
  yieldCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
    gap: 16,
  },
  yieldHeader: {
    gap: 4,
  },
  yieldTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.4,
  },
  yieldSub: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  yieldStatsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  yieldStatItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  yieldStatPositive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  },
  yieldStatNegative: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
  },
  yieldStatAmount: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  yieldStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  netResultCard: {
    backgroundColor: "#0f172a",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 16,
    gap: 8,
  },
  netResultLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  netResultValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#f8fafc",
    letterSpacing: -0.8,
  },
  netResultTrend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  netResultTrendText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#34d399",
  },
  financeAdjustmentsCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
    gap: 12,
  },
  financeAdjustmentsHeader: {
    gap: 3,
    marginBottom: 4,
  },
  financeAdjustmentsTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  financeAdjustmentsSub: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  financeAdjustmentsRow: {
    borderWidth: 1,
    borderColor: "#f1f5f9",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "#f8fafc",
  },
  financeAdjustmentsMetric: {
    flex: 1,
    minWidth: 0,
  },
  financeAdjustmentsMetricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  financeAdjustmentsMetricValue: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  financeAdjustmentsMetricValuePositive: {
    color: "#16a34a",
  },
  financeAdjustmentsMetricValueNegative: {
    color: "#dc2626",
  },
  financeAdjustmentsBtn: {
    borderRadius: 10,
    backgroundColor: "#0f172a",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#0f172a",
  },
  financeAdjustmentsBtnAlt: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
  },
  financeAdjustmentsBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  financeAdjustmentsBtnTextAlt: {
    color: "#334155",
  },

  // ── Document preview modal (web) ──
  docModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  docModalCard: {
    width: "100%",
    maxWidth: 920,
    maxHeight: "90%",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  docModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 10,
  },
  docModalCloseIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
  docModalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  docModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  docModalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  docModalBody: {
    minHeight: 280,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  docModalCenter: {
    flex: 1,
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 24,
  },
  docModalImage: {
    width: "100%",
    height: 420,
    minHeight: 280,
    backgroundColor: "#f8fafc",
  },
  docModalHint: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  docModalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    alignItems: "flex-end",
  },
  docModalFooterBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0f172a",
  },
  docModalFooterBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});

// ── Ledger card styles ────────────────────────────────────────────────────────

const ldStyles = StyleSheet.create({
  card: {
    backgroundColor: "#0b1120",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30, 41, 59, 0.8)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  syncBadge: {
    backgroundColor: "rgba(30, 41, 59, 0.5)",
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  syncText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "stretch",
    flexShrink: 1,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: "rgba(30, 41, 59, 0.4)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.5)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statGroup: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 6,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#34d399",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statLabelGreen: { color: "#34d399" },
  statLabelRed: { color: "#f43f5e" },
  statLabelOrange: { color: "#fb923c" },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#f8fafc",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  statValueGreen: { color: "#34d399" },
  statValueRed: { color: "#f43f5e" },
  statValueOrange: { color: "#fb923c" },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(51, 65, 85, 0.5)",
    marginHorizontal: 12,
    alignSelf: "stretch",
  },
  txSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  txSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  txHeader: {
    fontSize: 9,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  txViewAll: {
    fontSize: 10,
    fontWeight: "700",
    color: "#3b82f6",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  txEmpty: { fontSize: 13, color: "#475569", paddingVertical: 8 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(30, 41, 59, 0.3)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.5)",
    gap: 12,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  txIconIn: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.2)",
  },
  txIconOut: {
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    borderColor: "rgba(244, 63, 94, 0.2)",
  },
  txInfo: { flex: 1, minWidth: 0 },
  txTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#e2e8f0",
    marginBottom: 4,
  },
  txMeta: {
    fontSize: 9,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  txAmount: { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  txAmountIn: { color: "#34d399" },
  txAmountOut: { color: "#f43f5e" },
});

// ── Expense list card styles ───────────────────────────────────────────────────

const elStyles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    letterSpacing: -0.2,
  },
  badge: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#2563eb" },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  total: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
    letterSpacing: -0.5,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#0f172a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: { fontSize: 13, color: "#94a3b8", fontStyle: "italic" },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    marginBottom: 8,
    gap: 12,
    backgroundColor: "#fff",
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 3,
  },
  itemMeta: { fontSize: 10, color: "#94a3b8", fontWeight: "500" },
  itemRight: { alignItems: "flex-end", gap: 4 },
  itemAmount: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  itemStatus: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  itemStatusText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
