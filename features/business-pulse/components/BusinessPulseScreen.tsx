import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path, Polyline } from "react-native-svg";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Building2,
  CheckCircle2,
  IndianRupee,
  ListChecks,
  Route,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react-native";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import { useVehiclesQuery } from "@/lib/queries/useVehiclesQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { supabase } from "@/lib/supabase";
import {
  applyPulseFilters,
  selectBusinessPulseOverview,
  selectCashExposure,
  selectClientProfitability,
  selectComplianceExpiryRisk,
  selectDocumentVerificationExposure,
  selectDriverComplianceExposure,
  selectDriverSettlementRisk,
  selectOperationalHealth,
  selectRevenueTrend,
  selectSupplierProfitability,
  selectSupplierReliability,
  selectSupplierSettlementExposure,
  selectPayableAging,
  selectReceivableAging,
  selectBranchCitySlices,
  selectBranchCitySlicesFromTrips,
  selectAssetFleetSummary,
  selectAssetFleetVehicles,
  selectAssetDriverPayroll,
} from "@/features/business-pulse/selectors";
import { restrictToAssetExecution } from "@/features/business-pulse/lib/pulseDomainScope.util";
import {
  executionModelsForScope,
  executionScopeFromFilters,
  type ExecutionScope,
} from "@/features/business-pulse/lib/pulseExecutionScope.util";
import { PulseScopeTabRow } from "@/features/business-pulse/components/PulseScopeTabRow";
import { PulseBranchCityWidget } from "@/features/business-pulse/components/PulseBranchCityWidget";
import {
  PulseWidgetCol,
  PulseWidgetRow,
  usePulseDesktopLayout,
} from "@/features/business-pulse/components/PulseWidgetBoard";
import type { FinanceAgingKind } from "@/features/business-pulse/selectors/pulseAgingSelectors";
import { PulseAgingReport } from "@/features/business-pulse/components/PulseAgingReport";
import { PulseContributionFilters } from "@/features/business-pulse/components/PulseContributionFilters";
import { PulseDateRangeTabBar } from "@/features/business-pulse/components/PulseDateRangeTabBar";
import { PulseDrilldownTable } from "@/features/business-pulse/components/PulseDrilldownTable";
import {
  PulseRankingTable,
  PulseTableSection,
} from "@/features/business-pulse/components/PulseRankingTable";
import {
  PULSE_CLIENT_COLUMNS,
  PULSE_COMPLIANCE_COLUMNS,
  PULSE_DRIVER_PAYROLL_COLUMNS,
  PULSE_FLEET_VEHICLE_COLUMNS,
  PULSE_ROUTE_COLUMNS,
  PULSE_SUPPLIER_COLUMNS,
} from "@/features/business-pulse/lib/pulseTableColumns";
import { buildPulseDrilldownView } from "@/features/business-pulse/lib/pulseDrilldownContext.util";
import {
  buildVehicleLabelMap,
  vehicleDisplayLabel,
} from "@/features/business-pulse/lib/vehicleDisplay.util";
import { usePulseFilters } from "@/features/business-pulse/state/pulseFilterStore";
import type { PulseDataset } from "@/features/business-pulse/types";
import { formatIndianVehicleNumber } from "@/lib/format";
import {
  computePeriodDeltaPct,
  formatCompareCaption,
  getCompareDateRange,
  getEffectiveDateRange,
  getPresetDateRange,
  type ComparePreset,
  type TimePreset,
} from "@/features/business-pulse/lib/pulseCompare.util";

type DomainTab =
  | "overview"
  | "sales"
  | "supply"
  | "fleet"
  | "drivers"
  | "finance"
  | "compliance"
  | "operations";
type WidgetDensity = "tiny" | "compact" | "standard";

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthLabel(month: string): string {
  const [, mm] = month.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Number(mm) - 1;
  return names[idx] ?? month;
}

function LineChart({
  points,
  selectedMonth,
  onSelectMonth,
}: {
  points: Array<{ month: string; value: number }>;
  selectedMonth: string | null;
  onSelectMonth: (month: string | null) => void;
}) {
  if (points.length === 0) return <Text style={styles.mutedText}>No data in current filter scope.</Text>;
  const max = Math.max(...points.map((item) => item.value), 1);
  const plot = points
    .map((item, i) => {
      const x = points.length <= 1 ? 0 : (i / (points.length - 1)) * 100;
      const y = 100 - (item.value / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={160} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Path d="M0 100 L100 100" stroke={Theme.borderLight} strokeWidth={1} />
        <Polyline points={plot} fill="none" stroke={Theme.primary} strokeWidth={2.6} strokeLinecap="round" />
        {points.map((item, i) => {
          const x = points.length <= 1 ? 0 : (i / (points.length - 1)) * 100;
          const y = 100 - (item.value / max) * 100;
          const active = selectedMonth === item.month;
          return (
            <Circle
              key={item.month}
              cx={x}
              cy={y}
              r={active ? 2.7 : 1.8}
              fill={active ? Theme.teslaRed : Theme.surface}
              stroke={active ? Theme.teslaRed : Theme.primary}
              strokeWidth={1.7}
            />
          );
        })}
      </Svg>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.axisRow}>
        {points.map((item) => {
          const active = selectedMonth === item.month;
          return (
            <Pressable
              key={item.month}
              onPress={() => onSelectMonth(active ? null : item.month)}
              style={[styles.axisChip, active && styles.axisChipActive]}
            >
              <Text style={[styles.axisChipText, active && styles.axisChipTextActive]}>
                {monthLabel(item.month)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function MetricCard({
  title,
  value,
  deltaPct,
  insight,
  state,
  density,
  compareActive,
  desktopQuarter,
}: {
  title: string;
  value: string;
  deltaPct: number;
  insight: string;
  state: "healthy" | "warning" | "critical";
  density: WidgetDensity;
  compareActive: boolean;
  /** Four-across KPI strip on wide desktop. */
  desktopQuarter?: boolean;
}) {
  const up = deltaPct >= 0;
  return (
    <View
      style={[
        styles.metricCard,
        desktopQuarter && styles.metricCardQuarter,
        state === "healthy" ? styles.stateHealthy : state === "warning" ? styles.stateWarning : styles.stateCritical,
        density === "tiny" ? styles.metricTiny : density === "compact" ? styles.metricCompact : styles.metricStandard,
      ]}
    >
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {compareActive ? (
        <View style={styles.metricDeltaRow}>
          {up ? <TrendingUp size={10} color="#047857" /> : <TrendingDown size={10} color={Theme.teslaRed} />}
          <Text style={[styles.metricDeltaText, up ? styles.positive : styles.negative]}>
            {up ? "+" : "−"}
            {Math.abs(deltaPct).toFixed(1)}% vs prior
          </Text>
        </View>
      ) : null}
      <Text style={styles.metricInsight}>{insight}</Text>
    </View>
  );
}

function DomainTabBar({ active, onChange }: { active: DomainTab; onChange: (tab: DomainTab) => void }) {
  const tabs: Array<{ key: DomainTab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "sales", label: "Sales" },
    { key: "supply", label: "Supply" },
    { key: "fleet", label: "Fleet" },
    { key: "drivers", label: "Drivers" },
    { key: "finance", label: "Finance" },
    { key: "compliance", label: "Compliance" },
    { key: "operations", label: "Operations" },
  ];
  return (
    <View style={styles.labeledTabShell}>
      <Text style={styles.labeledTabLabel}>Domain</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.labeledTabScroll}
        contentContainerStyle={styles.tabBar}
        keyboardShouldPersistTaps="handled"
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[styles.tabChip, active === tab.key && styles.tabChipActive]}
          >
            <Text style={[styles.tabChipText, active === tab.key && styles.tabChipTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

type BusinessPulseScreenProps = {
  /** When true, route shell already provides top bar — hide duplicate chrome */
  embedded?: boolean;
  /** Extra top inset when not embedded (standalone route adds its own) */
  topInset?: number;
};

export function BusinessPulseScreen({ embedded = false, topInset }: BusinessPulseScreenProps) {
  const insets = useSafeAreaInsets();
  const resolvedTopInset = topInset ?? (embedded ? 0 : insets.top + 8);
  const { width } = useWindowDimensions();
  const { isDesktop, isWideDesktop } = usePulseDesktopLayout();
  const wide = width >= 720;
  const twoCol = width >= 1080;
  const halfCardStyle = wide ? styles.halfCardWide : styles.halfCardNarrow;
  const kpiQuarter = isWideDesktop;
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const { filters, toggleFilterValue, setDateRange, setFilters } = usePulseFilters();

  const [activeDomain, setActiveDomain] = useState<DomainTab>("overview");
  const density: WidgetDensity = "compact";
  const [timePreset, setTimePreset] = useState<TimePreset>("all");
  const [comparePreset, setComparePreset] = useState<ComparePreset>("none");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [financeLedger, setFinanceLedger] = useState<FinanceAgingKind>("receivable");

  const clientsQuery = useClientsQuery(orgId);
  const suppliersQuery = useSuppliersQuery(orgId);
  const tripsQuery = useTripsQuery(orgId);
  const vehiclesQuery = useVehiclesQuery(orgId);
  const driversQuery = useDriversQuery(orgId);

  const pulseAuxQuery = useQuery({
    queryKey: ["q", "business-pulse", "aux", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [vehicleLedger, fuelRows, tollRows, maintenanceRows] = await Promise.all([
        supabase()
          .from("vehicle_ledger_entries")
          .select("id,trip_id,vehicle_id,source_type,amount,created_at")
          .eq("organization_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(4000),
        supabase()
          .from("trip_fuel_entries")
          .select("id,trip_id,amount_inr,approval_state,reimbursement_state,payment_owner,posting_state,status")
          .order("created_at", { ascending: false })
          .limit(4000),
        supabase()
          .from("trip_toll_entries")
          .select("id,trip_id,amount_inr,approval_state,reimbursement_state,payment_owner,posting_state,status")
          .order("created_at", { ascending: false })
          .limit(4000),
        supabase()
          .from("vehicle_maintenance_entries")
          .select("id,vehicle_id,amount_inr,status,created_at")
          .eq("organization_id", orgId!)
          .order("created_at", { ascending: false })
          .limit(2000),
      ]);
      if (vehicleLedger.error) throw new Error(vehicleLedger.error.message);
      if (fuelRows.error) throw new Error(fuelRows.error.message);
      if (tollRows.error) throw new Error(tollRows.error.message);
      if (maintenanceRows.error) throw new Error(maintenanceRows.error.message);
      return {
        vehicleLedger: vehicleLedger.data ?? [],
        fuelRows: fuelRows.data ?? [],
        tollRows: tollRows.data ?? [],
        maintenanceRows: maintenanceRows.data ?? [],
      };
    },
    staleTime: 60_000,
  });

  const loading =
    clientsQuery.isLoading ||
    suppliersQuery.isLoading ||
    tripsQuery.isLoading ||
    vehiclesQuery.isLoading ||
    driversQuery.isLoading ||
    pulseAuxQuery.isLoading;

  const dataset: PulseDataset = useMemo(
    () => ({
      trips: tripsQuery.data ?? [],
      clients: clientsQuery.data ?? [],
      suppliers: suppliersQuery.data ?? [],
      vehicles: vehiclesQuery.data ?? [],
      drivers: driversQuery.data ?? [],
      vehicleLedger: pulseAuxQuery.data?.vehicleLedger ?? [],
      fuelRows: pulseAuxQuery.data?.fuelRows ?? [],
      tollRows: pulseAuxQuery.data?.tollRows ?? [],
      maintenanceRows: pulseAuxQuery.data?.maintenanceRows ?? [],
    }),
    [
      tripsQuery.data,
      clientsQuery.data,
      suppliersQuery.data,
      vehiclesQuery.data,
      driversQuery.data,
      pulseAuxQuery.data?.vehicleLedger,
      pulseAuxQuery.data?.fuelRows,
      pulseAuxQuery.data?.tollRows,
      pulseAuxQuery.data?.maintenanceRows,
    ],
  );

  const effectiveRange = useMemo(
    () => getEffectiveDateRange(timePreset, filters.dateRange, comparePreset),
    [comparePreset, filters.dateRange, timePreset],
  );

  const activeFilters = useMemo(() => {
    if (comparePreset === "none" || !effectiveRange?.start || !effectiveRange?.end) {
      return filters;
    }
    return { ...filters, dateRange: effectiveRange };
  }, [comparePreset, effectiveRange, filters]);

  const executionScope = useMemo(
    () => executionScopeFromFilters(activeFilters),
    [activeFilters],
  );

  const setExecutionScope = useCallback(
    (scope: ExecutionScope) => {
      setFilters({ executionModels: executionModelsForScope(scope) });
    },
    [setFilters],
  );

  const compareRange = useMemo(
    () => getCompareDateRange(effectiveRange, comparePreset),
    [comparePreset, effectiveRange],
  );

  const compareFilters = useMemo(
    () =>
      compareRange?.start && compareRange?.end
        ? { ...filters, dateRange: compareRange }
        : null,
    [compareRange, filters],
  );

  const compareCaption = useMemo(
    () => formatCompareCaption(comparePreset, effectiveRange, compareRange),
    [comparePreset, compareRange, effectiveRange],
  );

  const compareActive = comparePreset !== "none" && compareFilters != null;

  const handleComparePreset = (preset: ComparePreset) => {
    if (preset !== "none" && preset === comparePreset) {
      setComparePreset("none");
      return;
    }
    setComparePreset(preset);
    if (preset === "none") return;
    const hasExplicitRange = Boolean(filters.dateRange.start && filters.dateRange.end);
    if (hasExplicitRange) return;
    if (timePreset === "all") {
      setTimePreset("month");
      const range = getPresetDateRange("month");
      setDateRange(range.start, range.end);
      return;
    }
    const range = getPresetDateRange(timePreset);
    if (range.start && range.end) {
      setDateRange(range.start, range.end);
    }
  };

  const scoped = useMemo(() => applyPulseFilters(dataset, activeFilters), [activeFilters, dataset]);
  const assetScoped = useMemo(() => restrictToAssetExecution(scoped), [scoped]);

  const branchCitySlices = useMemo(
    () => selectBranchCitySlices(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const overview = useMemo(
    () => selectBusinessPulseOverview(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const revenueTrend = useMemo(() => selectRevenueTrend(dataset, activeFilters), [activeFilters, dataset]);
  const clientProfitability = useMemo(
    () => selectClientProfitability(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const supplierProfitability = useMemo(
    () => selectSupplierProfitability(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const supplierReliability = useMemo(
    () => selectSupplierReliability(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const supplierSettlement = useMemo(
    () => selectSupplierSettlementExposure(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const driverSettlement = useMemo(
    () => selectDriverSettlementRisk(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const driverCompliance = useMemo(
    () => selectDriverComplianceExposure(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const complianceRisk = useMemo(
    () => selectComplianceExpiryRisk(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const docExposure = useMemo(
    () => selectDocumentVerificationExposure(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const cash = useMemo(() => selectCashExposure(dataset, activeFilters), [activeFilters, dataset]);
  const operations = useMemo(
    () => selectOperationalHealth(dataset, activeFilters),
    [activeFilters, dataset],
  );

  const compareOverview = useMemo(
    () => (compareFilters ? selectBusinessPulseOverview(dataset, compareFilters) : null),
    [compareFilters, dataset],
  );

  const deltas = useMemo(() => {
    if (!compareOverview) {
      return { revenue: 0, margin: 0, cashExposure: 0, utilization: 0 };
    }
    return {
      revenue: computePeriodDeltaPct(overview.revenue, compareOverview.revenue),
      margin: computePeriodDeltaPct(overview.margin, compareOverview.margin),
      cashExposure: computePeriodDeltaPct(overview.cashExposure, compareOverview.cashExposure),
      utilization: computePeriodDeltaPct(overview.fleetUtilization, compareOverview.fleetUtilization),
    };
  }, [compareOverview, overview]);

  const routePerf = useMemo(() => {
    const byRoute = new Map<string, { revenue: number; margin: number; trips: number }>();
    for (const trip of scoped.trips) {
      const route = `${trip.pickup_area ?? "—"} -> ${trip.drop_location ?? "—"}`;
      const row = byRoute.get(route) ?? { revenue: 0, margin: 0, trips: 0 };
      const rev = Number(trip.client_price ?? 0);
      const spend = Number(trip.supplier_rate ?? 0);
      row.revenue += rev;
      row.margin += rev - spend;
      row.trips += 1;
      byRoute.set(route, row);
    }
    return Array.from(byRoute.entries())
      .map(([route, row]) => ({ route, ...row }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [scoped.trips]);

  const vehicleLabels = useMemo(
    () => buildVehicleLabelMap(dataset.vehicles),
    [dataset.vehicles],
  );

  const tripSettlementByTripId = useMemo(() => {
    const rank = { healthy: 0, attention: 1, critical: 2 };
    const labels = { healthy: "Settled", attention: "Attention", critical: "Critical" };
    const worst = new Map<string, keyof typeof rank>();
    const consider = (tripId: string, state: keyof typeof rank) => {
      const current = worst.get(tripId) ?? "healthy";
      if (rank[state] > rank[current]) worst.set(tripId, state);
    };
    for (const row of scoped.fuelRows) {
      const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
      if (paymentOwner !== "driver") continue;
      const posting = String(row.posting_state ?? "").toLowerCase();
      const reimbursement = String(row.reimbursement_state ?? "").toLowerCase();
      if (posting !== "posted") consider(row.trip_id, "attention");
      else if (!reimbursement || reimbursement !== "reimbursed") consider(row.trip_id, "critical");
    }
    for (const row of scoped.tollRows) {
      const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
      if (paymentOwner !== "driver") continue;
      const posting = String(row.posting_state ?? "").toLowerCase();
      const reimbursement = String(row.reimbursement_state ?? "").toLowerCase();
      if (posting !== "posted") consider(row.trip_id, "attention");
      else if (!reimbursement || reimbursement !== "reimbursed") consider(row.trip_id, "critical");
    }
    const out = new Map<string, string>();
    for (const trip of scoped.trips) {
      const state = worst.get(trip.id) ?? "healthy";
      out.set(trip.id, labels[state]);
    }
    return out;
  }, [scoped.fuelRows, scoped.tollRows, scoped.trips]);

  const tripPayableAmountByTripId = useMemo(() => {
    const amounts = new Map<string, number>();
    const add = (tripId: string, amount: number) => {
      if (amount <= 0) return;
      amounts.set(tripId, (amounts.get(tripId) ?? 0) + amount);
    };
    for (const trip of scoped.trips) {
      const supplierDue = Math.max(0, Number(trip.supplier_rate ?? 0));
      if (supplierDue > 0 && trip.supplier_id) add(trip.id, supplierDue);
    }
    const unsettled = (row: { trip_id: string; amount_inr: number | null; payment_owner?: string | null; posting_state?: string | null; reimbursement_state?: string | null }) => {
      const paymentOwner = String(row.payment_owner ?? "").toLowerCase();
      if (paymentOwner !== "driver") return false;
      const posting = String(row.posting_state ?? "").toLowerCase();
      const reimbursement = String(row.reimbursement_state ?? "").toLowerCase();
      if (posting !== "posted") return true;
      return !reimbursement || reimbursement !== "reimbursed";
    };
    for (const row of scoped.fuelRows) {
      if (!unsettled(row)) continue;
      add(row.trip_id, Math.max(0, Number(row.amount_inr ?? 0)));
    }
    for (const row of scoped.tollRows) {
      if (!unsettled(row)) continue;
      add(row.trip_id, Math.max(0, Number(row.amount_inr ?? 0)));
    }
    return amounts;
  }, [scoped.fuelRows, scoped.tollRows, scoped.trips]);

  const nameLabels = useMemo(
    () => ({
      clientNames: new Map(dataset.clients.map((x) => [x.id, x.name])),
      supplierNames: new Map(
        dataset.suppliers.map((x) => [x.id, x.company_name ?? x.name ?? "Supplier"]),
      ),
      vehicleLabels,
      driverNames: new Map(dataset.drivers.map((x) => [x.id, x.name])),
    }),
    [dataset.clients, dataset.drivers, dataset.suppliers, vehicleLabels],
  );

  const assetBranchCitySlices = useMemo(
    () => selectBranchCitySlicesFromTrips(assetScoped.trips),
    [assetScoped.trips],
  );

  const assetFleetSummary = useMemo(
    () => selectAssetFleetSummary(dataset, activeFilters),
    [activeFilters, dataset],
  );
  const assetFleetVehicles = useMemo(
    () => selectAssetFleetVehicles(dataset, activeFilters, nameLabels.driverNames),
    [activeFilters, dataset, nameLabels.driverNames],
  );
  const assetDriverPayroll = useMemo(
    () => selectAssetDriverPayroll(dataset, activeFilters, nameLabels.vehicleLabels),
    [activeFilters, dataset, nameLabels.vehicleLabels],
  );

  const drilldownDateLabel = useMemo(() => {
    const start = effectiveRange?.start ?? filters.dateRange.start;
    const end = effectiveRange?.end ?? filters.dateRange.end;
    if (start && end) return `${start} – ${end}`;
    if (start) return `From ${start}`;
    if (end) return `Until ${end}`;
    return "All time";
  }, [effectiveRange?.end, effectiveRange?.start, filters.dateRange.end, filters.dateRange.start]);

  const drilldownView = useMemo(
    () =>
      buildPulseDrilldownView({
        trips:
          activeDomain === "fleet" || activeDomain === "drivers"
            ? assetScoped.trips
            : scoped.trips,
        filters: activeFilters,
        activeDomain,
        financeLedger,
        nameLabels,
        tripSettlementByTripId,
        tripPayableAmountByTripId,
        dateRangeLabel: drilldownDateLabel,
        compareCaption: compareActive ? compareCaption : undefined,
      }),
    [
      activeDomain,
      activeFilters,
      compareActive,
      compareCaption,
      drilldownDateLabel,
      financeLedger,
      nameLabels,
      assetScoped.trips,
      scoped.trips,
      tripSettlementByTripId,
      tripPayableAmountByTripId,
    ],
  );

  const drilldownDisplayView = useMemo(
    () => ({
      ...drilldownView,
      rows: drilldownView.rows.slice(0, wide ? 80 : 40),
    }),
    [drilldownView, wide],
  );

  useEffect(() => {
    if (activeDomain !== "finance") return;
    if (filters.clientIds.length > 0 && filters.supplierIds.length === 0) {
      setFinanceLedger("receivable");
    } else if (filters.supplierIds.length > 0 && filters.clientIds.length === 0) {
      setFinanceLedger("payable");
    }
  }, [activeDomain, filters.clientIds.length, filters.supplierIds.length]);

  const receivableAgingReport = useMemo(
    () => selectReceivableAging(dataset, activeFilters, nameLabels),
    [activeFilters, dataset, nameLabels],
  );

  const payableAgingReport = useMemo(
    () => selectPayableAging(dataset, activeFilters, nameLabels),
    [activeFilters, dataset, nameLabels],
  );

  const handleTimePresetChange = useCallback(
    (preset: TimePreset) => {
      setTimePreset(preset);
      setSelectedMonth(null);
      const range = getPresetDateRange(preset);
      setDateRange(range.start, range.end);
    },
    [setDateRange],
  );

  if (!orgId) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.emptyText}>Business Pulse is available for an active workspace.</Text>
      </View>
    );
  }

  const renderOverview = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      {compareActive && compareOverview ? (
        <View style={styles.compareBanner}>
          <Text style={styles.compareBannerText}>{compareCaption}</Text>
          <Text style={styles.compareBannerMeta}>
            Prior period · Revenue {inr(compareOverview.revenue)} · Margin{" "}
            {inr(compareOverview.margin)}
          </Text>
        </View>
      ) : null}
      <View
        style={[
          styles.executiveGrid,
          styles.widgetGroup,
          kpiQuarter && styles.executiveGridQuarter,
        ]}
      >
        <MetricCard
          title="Revenue"
          value={inr(overview.revenue)}
          deltaPct={deltas.revenue}
          insight={
            compareActive
              ? `Current window vs prior ${inr(compareOverview?.revenue ?? 0)}`
              : deltas.revenue < 0
                ? "Revenue below prior period"
                : "Revenue expansion continues"
          }
          state={deltas.revenue < -5 ? "warning" : "healthy"}
          density={density}
          compareActive={compareActive}
          desktopQuarter={kpiQuarter}
        />
        <MetricCard
          title="Net Margin"
          value={inr(overview.margin)}
          deltaPct={deltas.margin}
          insight={
            compareActive
              ? `Prior margin ${inr(compareOverview?.margin ?? 0)}`
              : deltas.margin < 0
                ? "Fuel/Maintenance pressure"
                : "Margin quality stable"
          }
          state={deltas.margin < -3 ? "warning" : "healthy"}
          density={density}
          compareActive={compareActive}
          desktopQuarter={kpiQuarter}
        />
        <MetricCard
          title="Cashflow Exposure"
          value={inr(overview.cashExposure)}
          deltaPct={deltas.cashExposure}
          insight={
            compareActive
              ? `Prior exposure ${inr(compareOverview?.cashExposure ?? 0)}`
              : overview.cashExposure > 0
                ? "Working capital blocked in settlements"
                : "Healthy cash movement"
          }
          state={overview.cashExposure > 0 ? "warning" : "healthy"}
          density={density}
          compareActive={compareActive}
          desktopQuarter={kpiQuarter}
        />
        <MetricCard
          title="Compliance Risk"
          value={`${docExposure.vehiclesAtRisk + docExposure.driversAtRisk}`}
          deltaPct={0}
          insight="Insurance/Permit/DL backlog concentration"
          state={docExposure.vehiclesAtRisk + docExposure.driversAtRisk > 0 ? "critical" : "healthy"}
          density={density}
          compareActive={false}
          desktopQuarter={kpiQuarter}
        />
      </View>
      <PulseWidgetRow>
        <PulseWidgetCol flex={isDesktop ? 1.55 : 1}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <BarChart2 size={13} color={Theme.primary} />
                <Text style={styles.cardTitle}>Revenue Trend</Text>
              </View>
              <Text style={styles.cardSubTitle}>Tap month for cross-filter drilldown</Text>
            </View>
            <LineChart
              points={revenueTrend.map((item) => ({ month: item.month, value: item.revenue }))}
              selectedMonth={selectedMonth}
              onSelectMonth={(month) => {
                setSelectedMonth(month);
                if (!month) {
                  const range = getPresetDateRange(timePreset);
                  setDateRange(range.start, range.end);
                  return;
                }
                setDateRange(`${month}-01`, `${month}-31`);
              }}
            />
          </View>
        </PulseWidgetCol>
        <PulseWidgetCol flex={1} minWidth={isDesktop ? 300 : undefined}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <PulseBranchCityWidget
              slices={branchCitySlices}
              subtitle="Pickup cities across all trips in scope"
              layout={isDesktop ? "grid" : "scroll"}
            />
          </View>
        </PulseWidgetCol>
      </PulseWidgetRow>
    </View>
  );

  const renderSales = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <PulseWidgetRow>
        <PulseWidgetCol flex={1}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <PulseTableSection
              title="Client Comparison Matrix"
              icon={<Target size={13} color={Theme.primary} />}
            >
              <PulseRankingTable
                columns={PULSE_CLIENT_COLUMNS}
                rows={clientProfitability.slice(0, 10).map((client) => ({
                  id: client.id,
                  selected: filters.clientIds.includes(client.id),
                  cells: {
                    name: client.name,
                    trips: String(client.tripCount),
                    revenue: inr(client.revenue),
                    margin: inr(client.margin),
                    marginTone: client.margin >= 0 ? "positive" : "negative",
                  },
                }))}
                onRowPress={(id) => toggleFilterValue("clientIds", id)}
                emptyMessage="No clients in current scope."
              />
            </PulseTableSection>
          </View>
        </PulseWidgetCol>
        <PulseWidgetCol flex={1}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <PulseTableSection
              title="Lane Profitability"
              icon={<Route size={13} color={Theme.primary} />}
            >
              <PulseRankingTable
                columns={PULSE_ROUTE_COLUMNS}
                rows={routePerf.map((row) => ({
                  id: row.route,
                  selected: filters.routes.includes(row.route),
                  cells: {
                    name: row.route,
                    trips: String(row.trips),
                    revenue: inr(row.revenue),
                    margin: inr(row.margin),
                    marginTone: row.margin >= 0 ? "positive" : "negative",
                  },
                }))}
                onRowPress={(id) => toggleFilterValue("routes", id)}
                emptyMessage="No lanes in current scope."
              />
            </PulseTableSection>
          </View>
        </PulseWidgetCol>
      </PulseWidgetRow>
      <View style={[styles.card, styles.widgetCard]}>
        <PulseBranchCityWidget
          slices={branchCitySlices}
          subtitle="Revenue concentration by pickup city"
          layout={isDesktop ? "grid" : "scroll"}
        />
      </View>
    </View>
  );

  const renderSupply = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.card, styles.widgetCard]}>
        <PulseTableSection
          title="Supplier Performance Heatmap"
          icon={<Building2 size={13} color={Theme.primary} />}
        >
          <PulseRankingTable
            columns={PULSE_SUPPLIER_COLUMNS}
            rows={supplierProfitability.slice(0, 10).map((supplier) => {
              const rel = supplierReliability.find((r) => r.id === supplier.id);
              const settle = supplierSettlement.find((s) => s.id === supplier.id);
              const tone =
                rel?.risk === "critical"
                  ? "critical"
                  : rel?.risk === "warning"
                    ? "warning"
                    : "healthy";
              return {
                id: supplier.id,
                selected: filters.supplierIds.includes(supplier.id),
                tone,
                cells: {
                  name: supplier.name,
                  reliability: rel?.reliabilityScore.toFixed(0) ?? "0",
                  margin: inr(supplier.contributionMargin),
                  settlement: inr(settle?.settlementExposure ?? 0),
                },
              };
            })}
            onRowPress={(id) => toggleFilterValue("supplierIds", id)}
            emptyMessage="No suppliers in current scope."
          />
        </PulseTableSection>
      </View>
    </View>
  );

  const renderFleet = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <View style={[styles.sectionBlock, twoCol && styles.sectionRow]}>
        <View style={[styles.card, twoCol ? halfCardStyle : styles.fullCard]}>
          <MetricCard
            title="Asset trips"
            value={String(assetFleetSummary.assetTripCount)}
            deltaPct={0}
            insight={`${assetFleetSummary.activeVehicles} vehicles · ${assetFleetSummary.activeDrivers} drivers`}
            state="healthy"
            density={density}
            compareActive={false}
          />
        </View>
        <View style={[styles.card, twoCol ? halfCardStyle : styles.fullCard]}>
          <MetricCard
            title="Fleet P&L"
            value={inr(assetFleetSummary.netFleetPnL)}
            deltaPct={0}
            insight={`Revenue ${inr(assetFleetSummary.totalRevenue)}`}
            state={assetFleetSummary.netFleetPnL >= 0 ? "healthy" : "warning"}
            density={density}
            compareActive={false}
          />
        </View>
      </View>
      <PulseWidgetRow>
        <PulseWidgetCol flex={1}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Truck size={13} color={Theme.primary} />
                <Text style={styles.cardTitle}>Asset expense summary</Text>
              </View>
              <Text style={styles.cardSubTitle}>Own-fleet trips only</Text>
            </View>
            <View style={styles.opsRow}>
              <View style={styles.opsBadge}>
                <Text style={styles.opsBadgeText}>Ops {inr(assetFleetSummary.totalOperationalCost)}</Text>
              </View>
              <View style={styles.opsBadge}>
                <Text style={styles.opsBadgeText}>Ownership {inr(assetFleetSummary.totalOwnershipCost)}</Text>
              </View>
              <View style={styles.opsBadge}>
                <Text style={styles.opsBadgeText}>Maint {inr(assetFleetSummary.totalMaintenanceCost)}</Text>
              </View>
              <View style={styles.opsBadge}>
                <Text style={styles.opsBadgeText}>Settlement {inr(assetFleetSummary.totalSettlementExposure)}</Text>
              </View>
            </View>
          </View>
        </PulseWidgetCol>
        <PulseWidgetCol flex={1}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <PulseBranchCityWidget
              slices={assetBranchCitySlices}
              subtitle="Asset trip pickup cities"
              layout={isDesktop ? "grid" : "scroll"}
            />
          </View>
        </PulseWidgetCol>
      </PulseWidgetRow>
      <View style={[styles.card, styles.widgetCard]}>
        <PulseTableSection
          title="Asset vehicles & operators"
          icon={<Truck size={13} color={Theme.primary} />}
        >
          <PulseRankingTable
            columns={PULSE_FLEET_VEHICLE_COLUMNS}
            rows={assetFleetVehicles.slice(0, 12).map((vehicle) => ({
              id: vehicle.vehicleId,
              selected: filters.vehicleIds.includes(vehicle.vehicleId),
              cells: {
                name: vehicleDisplayLabel(vehicleLabels, vehicle.vehicleId),
                trips: String(vehicle.tripCount),
                operators:
                  vehicle.operatorNames.length > 0 ? vehicle.operatorNames.join(", ") : "—",
                expenses: inr(
                  vehicle.operationalCost + vehicle.ownershipCost + vehicle.maintenanceCost,
                ),
                pnl: inr(vehicle.netProfitability),
                pnlTone: vehicle.netProfitability >= 0 ? "positive" : "negative",
              },
            }))}
            onRowPress={(id) => toggleFilterValue("vehicleIds", id)}
            emptyMessage="No asset vehicles in current scope."
          />
        </PulseTableSection>
      </View>
    </View>
  );

  const renderDrivers = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.sectionBlock, twoCol && styles.sectionRow]}>
        <View style={[styles.card, twoCol ? halfCardStyle : styles.fullCard]}>
          <MetricCard
            title="Asset drivers"
            value={String(assetDriverPayroll.length)}
            deltaPct={0}
            insight="Fleet payroll party · own trips only"
            state="healthy"
            density={density}
            compareActive={false}
          />
        </View>
        <View style={[styles.card, twoCol ? halfCardStyle : styles.fullCard]}>
          <MetricCard
            title="Payable queue"
            value={inr(assetDriverPayroll.reduce((sum, row) => sum + row.payableTotal, 0))}
            deltaPct={0}
            insight="Commission + reimbursement due"
            state={
              assetDriverPayroll.some((row) => row.payableTotal > 0) ? "warning" : "healthy"
            }
            density={density}
            compareActive={false}
          />
        </View>
      </View>
      <View style={[styles.card, styles.widgetCard]}>
        <PulseTableSection
          title="Asset driver payroll"
          subtitle="Commission, salary terms & settlement exposure"
          icon={<Users size={13} color={Theme.primary} />}
        >
          <PulseRankingTable
            columns={PULSE_DRIVER_PAYROLL_COLUMNS}
            rows={assetDriverPayroll.slice(0, 12).map((driver) => {
              const compliance = driverCompliance.find((d) => d.driverId === driver.driverId);
              const tone =
                !compliance?.hasLicense || driver.settlementExposure > 0 ? "warning" : null;
              return {
                id: driver.driverId,
                selected: filters.driverIds.includes(driver.driverId),
                tone,
                cells: {
                  name: driver.driverName,
                  trips: String(driver.tripCount),
                  vehicles: driver.vehicleLabels.join(", ") || "—",
                  commission: inr(driver.commissionDue),
                  salary: driver.monthlySalary != null ? inr(driver.monthlySalary) : "Comm",
                  payable: inr(driver.payableTotal),
                  payableTone: driver.payableTotal > 0 ? "negative" : "positive",
                },
              };
            })}
            onRowPress={(id) => toggleFilterValue("driverIds", id)}
            emptyMessage="No asset drivers in current scope."
          />
        </PulseTableSection>
      </View>
    </View>
  );

  const renderFinance = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <View style={[styles.executiveGrid, styles.widgetGroup]}>
        <View style={[styles.card, styles.metricCardShell, twoCol ? halfCardStyle : styles.fullCard]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <IndianRupee size={13} color={Theme.primary} />
              <Text style={styles.cardTitle}>Accounts Receivable</Text>
            </View>
          </View>
          <Text style={styles.cardSubTitleBlock}>Client billing · 7+ days outstanding</Text>
          <MetricCard
            title="Receivable"
            value={inr(receivableAgingReport.totalOutstanding)}
            deltaPct={0}
            insight={`${receivableAgingReport.lines.length} open client items`}
            state={receivableAgingReport.totalOutstanding > 0 ? "warning" : "healthy"}
            density={density}
            compareActive={compareActive}
          />
        </View>
        <View style={[styles.card, styles.metricCardShell, twoCol ? halfCardStyle : styles.fullCard]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <ListChecks size={13} color={Theme.primary} />
              <Text style={styles.cardTitle}>Accounts Payable</Text>
            </View>
          </View>
          <Text style={styles.cardSubTitleBlock}>
            Suppliers{" "}
            {inr(
              payableAgingReport.lines
                .filter((l) => l.category === "Supplier payable")
                .reduce((s, l) => s + l.amount, 0),
            )}{" "}
            · Settlement {inr(cash.payableExposure)}
          </Text>
          <MetricCard
            title="Payable"
            value={inr(payableAgingReport.totalOutstanding)}
            deltaPct={deltas.cashExposure}
            insight="Supplier dues + driver reimbursement queue"
            state={payableAgingReport.totalOutstanding > 0 ? "warning" : "healthy"}
            density={density}
            compareActive={compareActive}
          />
        </View>
      </View>
      <PulseWidgetRow>
        <PulseWidgetCol flex={1}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <IndianRupee size={13} color={Theme.primary} />
                <Text style={styles.cardTitle}>Receivable Aging</Text>
              </View>
            </View>
            <PulseAgingReport
              report={receivableAgingReport}
              reportTitle={`Business Pulse Receivable — ${currentOrganization?.name ?? "Workspace"}`}
              companyName={currentOrganization?.name ?? "Workspace"}
            />
          </View>
        </PulseWidgetCol>
        <PulseWidgetCol flex={1}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <ListChecks size={13} color={Theme.primary} />
                <Text style={styles.cardTitle}>Payable Aging</Text>
              </View>
              <Text style={styles.cardSubTitle}>
                Fleet payables {inr(overview.outstandingPayables)} · Driver settlement{" "}
                {inr(cash.payableExposure)}
              </Text>
            </View>
            <PulseAgingReport
              report={payableAgingReport}
              reportTitle={`Business Pulse Payable — ${currentOrganization?.name ?? "Workspace"}`}
              companyName={currentOrganization?.name ?? "Workspace"}
            />
          </View>
        </PulseWidgetCol>
      </PulseWidgetRow>
    </View>
  );

  const renderCompliance = () => (
    <View style={styles.sectionBlock}>
      <View style={[styles.card, styles.widgetCard]}>
        <PulseTableSection
          title="Risk Severity Matrix"
          icon={<ShieldAlert size={13} color={Theme.primary} />}
        >
          <PulseRankingTable
            columns={PULSE_COMPLIANCE_COLUMNS}
            rows={complianceRisk.slice(0, 12).map((row) => ({
              id: row.vehicleId,
              selected: filters.vehicleIds.includes(row.vehicleId),
              tone:
                row.state === "critical" || row.state === "missing"
                  ? "critical"
                  : row.state === "expiring_soon"
                    ? "warning"
                    : "healthy",
              cells: {
                name: formatIndianVehicleNumber(row.vehicleNumber) || row.vehicleNumber || "—",
                state: row.state.replaceAll("_", " ").toUpperCase(),
                docs: String(row.riskCount),
              },
            }))}
            onRowPress={(id) => toggleFilterValue("vehicleIds", id)}
            emptyMessage="No compliance risks in current scope."
          />
        </PulseTableSection>
      </View>
    </View>
  );

  const renderOperations = () => (
    <View style={[styles.sectionBlock, isDesktop && styles.sectionBlockDesktop]}>
      <PulseWidgetRow>
        <PulseWidgetCol flex={isDesktop ? 0.9 : 1} minWidth={isDesktop ? 320 : undefined}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <Activity size={13} color={Theme.primary} />
                <Text style={styles.cardTitle}>Operational Health Telemetry</Text>
              </View>
            </View>
            <View style={styles.opsRow}>
              <View style={styles.opsBadge}>
                <AlertTriangle size={11} color="#b45309" />
                <Text style={styles.opsBadgeText}>Delayed Trips: {operations.delayedTrips}</Text>
              </View>
              <View style={styles.opsBadge}>
                <ListChecks size={11} color={Theme.primary} />
                <Text style={styles.opsBadgeText}>Pending Approvals: {operations.pendingApprovals}</Text>
              </View>
              <View style={styles.opsBadge}>
                <CheckCircle2 size={11} color="#047857" />
                <Text style={styles.opsBadgeText}>State: {String(operations.state).toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </PulseWidgetCol>
        <PulseWidgetCol flex={1.1}>
          <View style={[styles.card, styles.widgetCard, styles.widgetCardFill]}>
            <PulseBranchCityWidget
              slices={branchCitySlices}
              subtitle="Operational spread by pickup city"
              layout={isDesktop ? "grid" : "scroll"}
            />
          </View>
        </PulseWidgetCol>
      </PulseWidgetRow>
    </View>
  );

  const renderActiveDomain = () => {
    if (activeDomain === "overview") return renderOverview();
    if (activeDomain === "sales") return renderSales();
    if (activeDomain === "supply") return renderSupply();
    if (activeDomain === "fleet") return renderFleet();
    if (activeDomain === "drivers") return renderDrivers();
    if (activeDomain === "finance") return renderFinance();
    if (activeDomain === "compliance") return renderCompliance();
    return renderOperations();
  };

  const activeFilterCount =
    filters.routes.length +
    (timePreset !== "all" ? 1 : 0) +
    (executionScope !== "all" ? 1 : 0);

  const heroStripLayout = wide
    ? { flexDirection: "row" as const, alignItems: "center" as const }
    : { flexDirection: "column" as const, alignItems: "stretch" as const };

  return (
    <View style={[styles.container, { paddingTop: resolvedTopInset }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24, paddingTop: embedded ? 6 : 4 },
        ]}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.contextRibbon, embedded ? styles.contextRibbonEmbedded : null, heroStripLayout]}>
          <View style={styles.heroLeft}>
            {!embedded ? (
              <View style={styles.heroBadge}>
                <Target size={12} color={Theme.primary} />
                <Text style={styles.heroBadgeText}>Pulse Intelligence</Text>
              </View>
            ) : null}
            <Text style={embedded ? styles.contextTitle : styles.heroTitle}>
              {embedded ? "Live scope" : "Executive operating cockpit"}
            </Text>
            <Text style={embedded ? styles.contextSubtitle : styles.heroSubtitle}>
              {scoped.trips.length} trips · {activeFilterCount} filters
            </Text>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStatBox}>
              <Text style={styles.heroStatValue}>{scoped.trips.length}</Text>
              <Text style={styles.heroStatLabel}>Trips</Text>
            </View>
            <View style={styles.heroStatBox}>
              <Text style={styles.heroStatValue}>{activeFilterCount}</Text>
              <Text style={styles.heroStatLabel}>Filters</Text>
            </View>
            <View style={styles.heroStatBox}>
              <Text style={[styles.heroStatValue, styles.heroStatValueAccent]}>
                {activeDomain.slice(0, 3).toUpperCase()}
              </Text>
              <Text style={styles.heroStatLabel}>Domain</Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.header,
            styles.stickyFilterHeader,
            embedded && styles.headerEmbedded,
          ]}
        >
          <DomainTabBar active={activeDomain} onChange={setActiveDomain} />

          <PulseDateRangeTabBar active={timePreset} onChange={handleTimePresetChange} />

          <PulseScopeTabRow
            executionScope={executionScope}
            onExecutionScope={setExecutionScope}
          />

          {activeDomain === "finance" ? (
            <View style={styles.globalFilterStrip}>
              <PulseContributionFilters
                financeLedger={financeLedger}
                onFinanceLedger={setFinanceLedger}
              />
            </View>
          ) : null}
        </View>

        {loading ? <Text style={styles.mutedText}>Loading intelligence workspace...</Text> : null}

        <View style={[styles.widgetZone, isDesktop && styles.widgetZoneDesktop]}>
          <Text style={styles.widgetZoneTitle}>
            {activeDomain.charAt(0).toUpperCase() + activeDomain.slice(1)}
          </Text>
          {renderActiveDomain()}
        </View>

        <View style={[styles.card, styles.widgetCard, styles.drilldownCard]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <ListChecks size={13} color={Theme.primary} />
              <Text style={styles.cardTitle}>Cross-filter Drilldown</Text>
            </View>
            <Text style={styles.cardSubTitle}>
              {drilldownView.lensLabel} · {scoped.trips.length} trips
            </Text>
          </View>
          <PulseDrilldownTable
            view={drilldownDisplayView}
            exportView={drilldownView}
            reportTitle={`Business Pulse — ${currentOrganization?.name ?? "Workspace"}`}
            companyName={currentOrganization?.name ?? "Workspace"}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  scroll: { flex: 1 },
  scrollContent: {
    gap: 0,
  },
  contextRibbon: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    padding: 10,
    marginBottom: 8,
    justifyContent: "space-between",
    gap: 10,
  },
  contextRibbonEmbedded: {
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f8faff",
    borderColor: "#c7d2fe",
  },
  contextTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  contextSubtitle: {
    fontSize: 9,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  header: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    padding: 12,
    gap: 10,
    marginBottom: 12,
  },
  headerEmbedded: {
    padding: 8,
    gap: 6,
    marginBottom: 6,
  },
  stickyFilterHeader: {
    zIndex: 20,
    backgroundColor: Theme.screenBackground,
    marginBottom: 12,
  },
  executionScopeWrap: {
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  executionScopeLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 2,
  },
  labeledTabShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  labeledTabLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    width: 48,
    flexShrink: 0,
  },
  labeledTabScroll: {
    flex: 1,
    minWidth: 0,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 3,
    paddingRight: 8,
  },
  tabChip: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Theme.surface,
    minHeight: 34,
    justifyContent: "center",
  },
  tabChipActive: {
    backgroundColor: "#eef2ff",
    borderColor: Theme.primary,
    shadowColor: Theme.primary,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.text,
  },
  tabChipTextActive: {
    color: Theme.primary,
  },
  globalFilterStrip: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 4,
  },
  compareBanner: {
    borderWidth: 1,
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
    marginBottom: 10,
  },
  compareBannerText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    textTransform: "uppercase",
    letterSpacing: 0.35,
  },
  compareBannerMeta: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  widgetZone: {
    marginTop: 4,
    marginBottom: 14,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    gap: 12,
  },
  widgetZoneTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  stripTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 10,
    alignItems: "center",
  },
  filterChip: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: Theme.surface,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  filterChipActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  filterChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.text,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  sectionBlock: {
    gap: 12,
    marginBottom: 14,
    paddingBottom: 4,
  },
  sectionBlockDesktop: {
    gap: 16,
  },
  widgetGroup: {
    marginBottom: 4,
  },
  widgetZoneDesktop: {
    maxWidth: 1440,
    alignSelf: "center",
    width: "100%",
  },
  widgetCardFill: {
    flex: 1,
    height: "100%",
  },
  widgetCard: {
    marginBottom: 0,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  drilldownCard: {
    marginTop: 4,
  },
  sectionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 8,
  },
  executiveGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "stretch",
  },
  executiveGridQuarter: {
    flexWrap: "nowrap",
    gap: 12,
  },
  metricCardShell: {
    marginBottom: 0,
    gap: 6,
  },
  cardSubTitleBlock: {
    fontSize: 9,
    color: Theme.textMuted,
    fontWeight: "600",
    marginTop: -2,
    marginBottom: 4,
    lineHeight: 13,
  },
  heroLeft: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "#eef2ff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  heroBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 0.4,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  heroSubtitle: {
    fontSize: 10,
    color: Theme.textSecondary,
    lineHeight: 15,
    maxWidth: 520,
  },
  heroStats: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
  },
  heroStatBox: {
    minWidth: 56,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  heroStatValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  heroStatValueAccent: {
    color: Theme.primary,
    fontSize: 13,
    letterSpacing: 0.6,
  },
  heroStatLabel: {
    fontSize: 8,
    color: Theme.textMuted,
    marginTop: 2,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricCard: {
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    width: "48%",
    flexGrow: 1,
    maxWidth: "100%",
    minWidth: 140,
  },
  metricCardQuarter: {
    flex: 1,
    width: undefined,
    minWidth: 0,
    maxWidth: undefined,
  },
  metricTiny: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  metricCompact: {
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  metricStandard: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  stateHealthy: { borderColor: "#a7f3d0" },
  stateWarning: { borderColor: "#fcd34d" },
  stateCritical: { borderColor: "#fecdd3" },
  metricTitle: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    marginTop: 2,
  },
  metricDeltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  metricDeltaText: {
    fontSize: 9,
    fontWeight: "800",
  },
  metricInsight: {
    fontSize: 9,
    color: Theme.textSecondary,
    marginTop: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    padding: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  halfCardWide: {
    flex: 1,
    minWidth: "48%",
  },
  halfCardNarrow: {
    flex: 1,
    width: "100%",
  },
  fullCard: {
    width: "100%",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
    gap: 8,
    flexWrap: "wrap",
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  cardSubTitle: {
    fontSize: 9,
    color: Theme.textMuted,
  },
  chartWrap: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.whiteMuted,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  axisRow: {
    flexDirection: "row",
    gap: 4,
    paddingRight: 8,
    marginTop: 3,
  },
  axisChip: {
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  axisChipActive: {
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
  },
  axisChipText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  axisChipTextActive: {
    color: Theme.primary,
  },
  row: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 7,
    paddingVertical: 6,
    marginBottom: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowSelected: {
    borderColor: Theme.primary,
    backgroundColor: "#eef2ff",
  },
  heatHealthy: {
    backgroundColor: "#f0fdf4",
  },
  heatWarning: {
    backgroundColor: "#fffbeb",
  },
  heatCritical: {
    backgroundColor: "#fff1f2",
  },
  tableHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  thCell: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  colWide: {
    flex: 1,
    minWidth: 72,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.text,
  },
  colName: {
    flex: 1,
    minWidth: 90,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.text,
  },
  colSmall: {
    width: 64,
    textAlign: "right",
    fontSize: 8,
    color: Theme.textMuted,
    fontWeight: "700",
  },
  colMoney: {
    width: 76,
    textAlign: "right",
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  opsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  opsBadge: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: Theme.whiteMuted,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  opsBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.text,
  },
  tableHeader: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 8,
    backgroundColor: Theme.whiteMuted,
    paddingHorizontal: 6,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tableCell: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.text,
  },
  colTrip: {
    width: 92,
  },
  colEntity: {
    flex: 1,
    minWidth: 75,
  },
  positive: {
    color: "#047857",
  },
  negative: {
    color: Theme.teslaRed,
  },
  mutedText: {
    fontSize: 9,
    color: Theme.textMuted,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.screenBackground,
  },
  emptyText: {
    fontSize: 12,
    color: Theme.textSecondary,
  },
});
