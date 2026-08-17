/**
 * Hub Performance tab — the future unified Target vs Actual / cross-filtered
 * analytics page (Goals + Sales + Asset merge).
 *
 * Phase 1, Commit 1 (route proof): a spinner, nothing else.
 * Phase 1, Commit 2: the PerformanceCrossFilter/perspective state model,
 *   declared but unwired.
 * Phase 1, Commit 3: data pipeline + dashboard shell. Wired the data hooks
 *   and existing analytics util functions Goals already uses, rendered the
 *   locked visual hierarchy, KAM/Region/Supplier breakdown groupings and
 *   cross-filter interaction deliberately deferred.
 * Phase 1, Commit 4 (this commit): the analytical correctness layer --
 *   Period Target, Target-to-date, Achievement %, Pacing %, vs Previous
 *   Period, and Variance (features/network/utils/connectionGoalsAnalytics.util.ts,
 *   unit-tested in __tests__/connectionGoalsAnalytics.util.test.ts covering
 *   first/mid/last day of period, zero target, zero target-to-date, no/
 *   partial previous-period data, quarter/year boundaries, and future
 *   periods -- never Infinity/NaN/a misleading 0%).
 *
 *   Still deliberately deferred to later commits:
 *     - cross-filter interaction -- crossFilter (Commit 2) never leaves its
 *       empty default; this commit proves the calculations are correct for
 *       a fixed (unfiltered) dataset, Commit 5 proves they stay correct when
 *       the dataset changes through a cross-filter
 *     - KAM / Region / Supplier breakdown groupings (Commit 6)
 *     - Progress modal, trip evidence table, export (Commits 7-8)
 *   Aggregate and Client perspectives still share the same unfiltered
 *   client-focus breakdown table (unchanged from Commit 3).
 */
import Theme from "@/constants/Theme";
import {
  DEFAULT_NETWORK_GOALS_STORE,
  loadNetworkGoalsStore,
  type NetworkGoalsStore,
} from "@/features/network/services/networkGoalsStorage.service";
import {
  buildEntityGoalRows,
  buildPerformanceKpiRow,
  computeGoalsActualsForRollup,
  computePreviousPeriodActuals,
  getRecentMonthKeys,
  resolvePeriodTarget,
  type EntityGoalRow,
  type GoalsRollup,
  type PerformanceKpiRow,
} from "@/features/network/utils/connectionGoalsAnalytics.util";
import { formatINRChip } from "@/lib/format";
import { canAccessClients, canAccessDrivers, canAccessSuppliers } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useDriversQuery } from "@/lib/queries/useDriversQuery";
import { useTripsQuery } from "@/lib/queries/useTripsQuery";
import { useVehiclesQuery } from "@/lib/queries/useVehiclesQuery";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * Which grouping/breakdown the page is currently showing -- a view mode,
 * not a filter dimension. Mirrors NetworkDesktopSalesPanel's SalesScope
 * ("aggregate" | "asset"), extended to six; that panel's own scope becomes
 * derived from this once it's wired in (not an independent second toggle).
 */
export type PerformancePerspective =
  | "aggregate"
  | "kam"
  | "client"
  | "region"
  | "supplier"
  | "asset";

export type PerformanceCrossFilter = {
  kamId: string | null;
  clientId: string | null;
  regionId: string | null;
  supplierId: string | null;
  assetId: string | null;
  performanceStatus: "behind" | "on_track" | "exceeded" | null;
  /** Day/week/month key selected on the trend chart. Not the global Period/
   * Granularity picker (Month/Quarter/Year) -- that remains separate global
   * context, per the locked Global-vs-cross-filter split. */
  trendPointKey: string | null;
};

const EMPTY_PERFORMANCE_CROSS_FILTER: PerformanceCrossFilter = {
  kamId: null,
  clientId: null,
  regionId: null,
  supplierId: null,
  assetId: null,
  performanceStatus: null,
  trendPointKey: null,
};

const ROLLUPS: { id: GoalsRollup; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

const PERSPECTIVES: {
  id: PerformancePerspective;
  label: string;
  requires?: "clients" | "suppliers" | "drivers";
}[] = [
  { id: "aggregate", label: "Aggregate" },
  { id: "kam", label: "KAM", requires: "clients" },
  { id: "client", label: "Client", requires: "clients" },
  { id: "region", label: "Region", requires: "clients" },
  { id: "supplier", label: "Supplier", requires: "suppliers" },
  { id: "asset", label: "Asset", requires: "drivers" },
];

function formatKpiValue(unit: PerformanceKpiRow["unit"], value: number): string {
  if (unit === "trips") return String(Math.round(value));
  if (unit === "pct") return `${value.toFixed(1)}%`;
  return formatINRChip(value);
}

type Props = {
  orgId: string;
};

export function NetworkDesktopPerformancePanel({ orgId }: Props) {
  const capabilities = useCapabilities();
  const availablePerspectives = useMemo(
    () =>
      PERSPECTIVES.filter((p) => {
        if (p.requires === "clients") return canAccessClients(capabilities);
        if (p.requires === "suppliers") return canAccessSuppliers(capabilities);
        if (p.requires === "drivers") return canAccessDrivers(capabilities);
        return true;
      }),
    [capabilities],
  );

  const [perspective, setPerspective] = useState<PerformancePerspective>("aggregate");
  // Declared in Commit 2, still unconsumed by any visual/calculation/query.
  const [crossFilter, setCrossFilter] = useState<PerformanceCrossFilter>(
    EMPTY_PERFORMANCE_CROSS_FILTER,
  );
  void crossFilter;
  void setCrossFilter;

  const monthOptions = useMemo(() => getRecentMonthKeys(6), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(
    () => monthOptions[monthOptions.length - 1] ?? getRecentMonthKeys(1)[0],
  );
  const [rollup, setRollup] = useState<GoalsRollup>("month");

  const [goalsStore, setGoalsStore] = useState<NetworkGoalsStore>(
    DEFAULT_NETWORK_GOALS_STORE,
  );
  useEffect(() => {
    let cancelled = false;
    void loadNetworkGoalsStore(orgId).then((loaded) => {
      if (!cancelled) setGoalsStore(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const tripsQ = useTripsQuery(orgId);
  const clientsQ = useClientsQuery(orgId);
  const driversQ = useDriversQuery(orgId);
  const vehiclesQ = useVehiclesQuery(orgId);

  const trips = tripsQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const drivers = driversQ.data ?? [];
  const vehicles = vehiclesQ.data ?? [];

  // Stable per mount -- a dashboard shell doesn't need a live-ticking clock;
  // revisit if a specific need for intra-session freshness surfaces.
  const asOf = useMemo(() => new Date(), []);

  const actuals = useMemo(
    () => computeGoalsActualsForRollup(trips, selectedMonthKey, rollup),
    [trips, selectedMonthKey, rollup],
  );

  const periodTarget = useMemo(
    () => resolvePeriodTarget(goalsStore, selectedMonthKey, rollup),
    [goalsStore, selectedMonthKey, rollup],
  );

  const previousActuals = useMemo(
    () => computePreviousPeriodActuals(trips, selectedMonthKey, rollup, asOf),
    [trips, selectedMonthKey, rollup, asOf],
  );

  const kpiRows: PerformanceKpiRow[] = useMemo(
    () => [
      buildPerformanceKpiRow(
        "Sales revenue",
        "inr",
        actuals.revenueInr,
        periodTarget.revenueInr,
        previousActuals.revenueInr,
        selectedMonthKey,
        rollup,
        asOf,
      ),
      buildPerformanceKpiRow(
        "Trips",
        "trips",
        actuals.tripCount,
        periodTarget.tripCount,
        previousActuals.tripCount,
        selectedMonthKey,
        rollup,
        asOf,
      ),
      buildPerformanceKpiRow(
        "Margin",
        "pct",
        actuals.marginPct,
        periodTarget.marginPct,
        previousActuals.marginPct,
        selectedMonthKey,
        rollup,
        asOf,
      ),
    ],
    [actuals, periodTarget, previousActuals, selectedMonthKey, rollup, asOf],
  );
  const revenueRow = kpiRows[0];

  // Aggregate and Client currently share the same unfiltered client-focus
  // breakdown -- they diverge once cross-filtering (Commit 5) and per-
  // perspective grouping (Commit 6) land.
  const showsClientBreakdown = perspective === "aggregate" || perspective === "client";
  const entityRows: EntityGoalRow[] = useMemo(() => {
    if (!showsClientBreakdown) return [];
    return buildEntityGoalRows(
      "client",
      goalsStore,
      clients,
      drivers,
      vehicles,
      trips,
      selectedMonthKey,
      rollup,
      12,
    );
  }, [showsClientBreakdown, goalsStore, clients, drivers, vehicles, trips, selectedMonthKey, rollup]);

  const trendCompareItems = useMemo(
    () => [
      { label: "Previous period", value: revenueRow.previousActual },
      { label: "Target-to-date", value: revenueRow.targetToDate ?? 0 },
      { label: "Actual", value: revenueRow.actual },
    ],
    [revenueRow],
  );
  const maxTrendValue = Math.max(1, ...trendCompareItems.map((p) => p.value));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Performance</Text>
        <View style={styles.rollupRow}>
          {ROLLUPS.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setRollup(r.id)}
              style={[styles.rollupChip, rollup === r.id && styles.rollupChipOn]}
            >
              <Text style={[styles.rollupChipText, rollup === r.id && styles.rollupChipTextOn]}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.perspectiveScroll}
        contentContainerStyle={styles.perspectiveRow}
      >
        {availablePerspectives.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setPerspective(p.id)}
            style={[styles.perspectiveChip, perspective === p.id && styles.perspectiveChipOn]}
          >
            <Text
              style={[
                styles.perspectiveChipText,
                perspective === p.id && styles.perspectiveChipTextOn,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Cross-filter context bar -- structural only in this commit, no
          chips render yet because crossFilter never leaves its empty
          default (wiring lands in Commit 5). */}
      <Text style={styles.showingLine}>Showing: All business</Text>

      <View style={styles.kpiRow}>
        {kpiRows.map((row) => (
          <View key={row.label} style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{row.label}</Text>
            <View style={styles.kpiPrimaryRow}>
              <View style={styles.kpiPrimaryCell}>
                <Text style={styles.kpiPrimaryValue}>
                  {row.hasTarget ? formatKpiValue(row.unit, row.periodTarget) : "Not set"}
                </Text>
                <Text style={styles.kpiPrimaryCaption}>Period target</Text>
              </View>
              <View style={styles.kpiPrimaryCell}>
                <Text style={styles.kpiPrimaryValue}>{formatKpiValue(row.unit, row.actual)}</Text>
                <Text style={styles.kpiPrimaryCaption}>Actual</Text>
              </View>
              <View style={styles.kpiPrimaryCell}>
                <Text style={styles.kpiPrimaryValue}>
                  {row.achievement != null ? `${row.achievement}%` : "—"}
                </Text>
                <Text style={styles.kpiPrimaryCaption}>Achievement</Text>
              </View>
            </View>
            {row.targetToDate != null ? (
              <View style={styles.kpiSecondaryRow}>
                <Text style={styles.kpiSecondaryText}>
                  {formatKpiValue(row.unit, row.targetToDate)} target-to-date
                </Text>
                <Text style={styles.kpiSecondaryText}>
                  {row.pacing != null ? `${row.pacing}% pacing` : "Pacing unavailable"}
                </Text>
              </View>
            ) : null}
            <Text style={styles.kpiTertiaryText}>
              {row.hasPreviousData && row.changeVsPrevious != null
                ? `${row.changeVsPrevious >= 0 ? "↑" : "↓"} ${Math.abs(row.changeVsPrevious)}% vs previous period`
                : "No previous period data"}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Actual vs Target-to-date vs Previous period</Text>
        <Text style={styles.trendCaption}>
          Sales revenue, same period/date basis as the KPI band above. A rolling multi-month
          overlay is later polish, not built here -- this proves the three values agree today.
        </Text>
        <View style={styles.trendRow}>
          {trendCompareItems.map((item) => (
            <View key={item.label} style={styles.trendBarWrap}>
              <View
                style={[
                  styles.trendBar,
                  { height: Math.max(4, (item.value / maxTrendValue) * 96) },
                ]}
              />
              <Text style={styles.trendBarValue}>{formatINRChip(item.value)}</Text>
              <Text style={styles.trendBarLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Performance breakdown</Text>
        <View style={styles.breakdownHeadRow}>
          <Text style={[styles.breakdownHeadCell, styles.breakdownColName]}>Name</Text>
          <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Actual</Text>
          <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>Target</Text>
          <Text style={[styles.breakdownHeadCell, styles.breakdownColNum]}>%</Text>
        </View>
        {entityRows.length === 0 ? (
          <View style={styles.breakdownEmpty} />
        ) : (
          entityRows.map((row) => (
            <View key={row.id} style={styles.breakdownRow}>
              <Text style={[styles.breakdownCell, styles.breakdownColName]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                {formatINRChip(row.actualRevenue)}
              </Text>
              <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                {row.hasTarget ? formatINRChip(row.targetRevenue) : "—"}
              </Text>
              <Text style={[styles.breakdownCell, styles.breakdownColNum]}>
                {row.hasTarget ? `${row.revenueProgressPct}%` : "—"}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7fb" },
  content: { padding: 20, gap: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 20, fontWeight: "800", color: Theme.textPrimaryDark },
  rollupRow: { flexDirection: "row", gap: 6 },
  rollupChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Theme.surfaceForm,
    borderRadius: 8,
  },
  rollupChipOn: { backgroundColor: Theme.primary },
  rollupChipText: { fontSize: 12, fontWeight: "700", color: Theme.textSecondary },
  rollupChipTextOn: { color: Theme.textOnPrimary },
  perspectiveScroll: { flexGrow: 0 },
  perspectiveRow: { flexDirection: "row", gap: 8 },
  perspectiveChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
  },
  perspectiveChipOn: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  perspectiveChipText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimaryDark },
  perspectiveChipTextOn: { color: Theme.textOnPrimary },
  showingLine: { fontSize: 12, color: Theme.textMuted, fontWeight: "600" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: {
    flexGrow: 1,
    flexBasis: 180,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 4,
  },
  kpiLabel: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
  kpiPrimaryRow: { flexDirection: "row", gap: 12 },
  kpiPrimaryCell: { flex: 1 },
  kpiPrimaryValue: { fontSize: 18, fontWeight: "800", color: Theme.textPrimaryDark },
  kpiPrimaryCaption: { fontSize: 10, fontWeight: "700", color: Theme.textMuted },
  kpiSecondaryRow: { flexDirection: "row", justifyContent: "space-between" },
  kpiSecondaryText: { fontSize: 11, fontWeight: "600", color: Theme.textSecondary },
  kpiTertiaryText: { fontSize: 11, fontWeight: "700", color: Theme.primary },
  sectionCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  trendCaption: { fontSize: 11, color: Theme.textMuted },
  trendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    gap: 10,
    minHeight: 120,
  },
  trendBarWrap: { alignItems: "center", gap: 6, width: 96 },
  trendBar: { width: 32, backgroundColor: Theme.primary, borderRadius: 4 },
  trendBarValue: { fontSize: 12, fontWeight: "700", color: Theme.textPrimaryDark },
  trendBarLabel: { fontSize: 10, color: Theme.textMuted },
  breakdownHeadRow: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  breakdownHeadCell: { fontSize: 11, fontWeight: "800", color: Theme.textMuted },
  breakdownColName: { flex: 2 },
  breakdownColNum: { flex: 1, textAlign: "right" },
  breakdownRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  breakdownCell: { fontSize: 13, color: Theme.textPrimaryDark },
  breakdownEmpty: { minHeight: 40 },
});
