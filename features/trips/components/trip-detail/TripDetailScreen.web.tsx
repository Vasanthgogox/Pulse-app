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
import { useState } from "react";
import {
    ActivityIndicator,
    Image,
    Linking,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TripAdjustment } from "../../services/tripAdjustments";
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

type Tab = "tracking" | "finance";

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
  const [activeTab, setActiveTab] = useState<Tab>("tracking");
  const [otpResending, setOtpResending] = useState(false);

  const isMobile = screenWidth < 640;
  const isTablet = screenWidth >= 640 && screenWidth < 1024;
  const isDesktop = screenWidth >= 1024;
  const hPad = isMobile ? 12 : isTablet ? 16 : 24;
  const mapHeight = isMobile ? 220 : isTablet ? 380 : 600;

  const detail = useTripDetail({
    tripId,
    entryContext,
    clientIdFromContext,
    clientNameFromContext,
    onBack,
  });

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

  // ── Map ───────────────────────────────────────────────────────────────────────
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
  const driverActivityRows = detail.driverActivityTimelineRows ?? [];
  const timelineRows = [...driverActivityRows].sort((a, b) => {
    const aDate = new Date(a.kind === 'status' ? a.changed_at : a.row.changed_at).getTime();
    const bDate = new Date(b.kind === 'status' ? b.changed_at : b.row.changed_at).getTime();
    return aDate - bDate;
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Navigation bar ──────────────────────────────────────────────────── */}
      <View style={[styles.navBar, { paddingHorizontal: hPad }]}>
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
      </View>

      {/* ── Tab bar ───────────────────────────────────────────────────────────── */}
      <View style={[styles.tabBar, { paddingHorizontal: hPad }]}>
        <TabButton
          label="Tracking"
          icon="map-marker"
          active={activeTab === "tracking"}
          onPress={() => setActiveTab("tracking")}
        />
        <TabButton
          label="Finance"
          icon="bar-chart"
          active={activeTab === "finance"}
          onPress={() => setActiveTab("finance")}
        />
      </View>

      {/* ── Scrollable content ────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { padding: isMobile ? 12 : 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={detail.handleRefresh}
          />
        }
      >
        {/* ════════════════════ TRACKING TAB ════════════════════ */}
        {activeTab === "tracking" && (
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
                  <Text style={dStyles.statValue}>{trip.distance != null ? `${trip.distance} km` : '—'}</Text>
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
                    source={trip.pickup_area ?? undefined}
                    destination={trip.drop_location ?? undefined}
                    sourceCoords={detail.trackingMapOriginCoordinate ?? undefined}
                    destCoords={detail.trackingMapDestinationCoordinate ?? undefined}
                    truckLocation={detail.driverLocation ?? undefined}
                    height={mapHeight}
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
                      detail.showAssignByPhone && currentOrganization?.id
                        ? currentOrganization.id
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
                                        detail.tripOtp.expires_at,
                                      ).toLocaleString("en-IN")}`
                                    : "OTP will be generated during assignment confirmation flow."}
                              </Text>
                              {aggregateOtpState !== "verified" && detail.tripOtp?.code ? (
                                <View style={styles.otpCodeRow}>
                                  <Text style={styles.otpCodeLabel}>OTP</Text>
                                  <Text style={styles.otpCodeValue}>{detail.tripOtp.code}</Text>
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
                  distanceKm={trip.distance ? String(trip.distance) : undefined}
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
                        source={trip.pickup_area ?? undefined}
                        destination={trip.drop_location ?? undefined}
                        sourceCoords={detail.trackingMapOriginCoordinate ?? undefined}
                        destCoords={detail.trackingMapDestinationCoordinate ?? undefined}
                        truckLocation={detail.driverLocation ?? undefined}
                        height={520}
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
                    layoutVariant="workspace"
                  />
                ) : (
                  <FeedbackPlaceholder />
                )}
              </View>
            )}
          </>
        )}

        {/* ════════════════════ FINANCE TAB ════════════════════ */}
        {activeTab === "finance" && (
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

        <View style={{ height: 48 }} />
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
}: {
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <FontAwesome
        name={icon}
        size={13}
        color={active ? "#2563eb" : "#6b7280"}
      />
      <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
        {label}
      </Text>
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
  tabBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  tabBtnTextActive: {
    color: "#60a5fa",
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
