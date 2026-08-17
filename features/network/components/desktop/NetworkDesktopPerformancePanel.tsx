/**
 * Hub Performance tab — the future unified Target vs Actual / cross-filtered
 * analytics page (Goals + Sales + Asset merge).
 *
 * Phase 1, Commit 1 (route proof): a spinner, nothing else.
 * Phase 1, Commit 2: the PerformanceCrossFilter/perspective state model,
 *   declared but unwired.
 * Phase 1, Commit 3 (this commit): data pipeline + dashboard shell.
 *   Wires the same data hooks and existing analytics util functions Goals
 *   already uses (nothing new computed, nothing new fetched), renders the
 *   locked visual hierarchy (period + perspective + KPI band + trend +
 *   breakdown), but deliberately does NOT yet compute:
 *     - previous-period actual, target-to-date, pacing %, variance
 *     - a target-vs-actual trend overlay (trend shows Actual only)
 *     - KAM / Region / Supplier breakdown groupings (no util function for
 *       these exists yet -- those are new analytical helpers, correctly a
 *       separate, controlled commit)
 *   The cross-filter context bar renders structurally ("Showing: All
 *   business") but nothing is clickable yet -- crossFilter never changes
 *   from empty in this commit. Aggregate and Client perspectives share the
 *   same breakdown table today (both read buildEntityGoalRows("client", ...)
 *   unfiltered) since neither cross-filtering nor per-perspective grouping
 *   exists yet; they will diverge once Commits 5-6 land.
 */
import Theme from "@/constants/Theme";
import {
  DEFAULT_NETWORK_GOALS_STORE,
  loadNetworkGoalsStore,
  type NetworkGoalsStore,
} from "@/features/network/services/networkGoalsStorage.service";
import {
  buildBalanceTrendPoints,
  buildEntityGoalRows,
  buildGoalSummaryRows,
  computeGoalsActualsForRollup,
  getRecentMonthKeys,
  type EntityGoalRow,
  type GoalTargetRow,
  type GoalsRollup,
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

function formatMetricValue(row: GoalTargetRow): string {
  if (row.unit === "trips") return String(Math.round(row.actual));
  if (row.unit === "pct") return `${row.actual.toFixed(1)}%`;
  return formatINRChip(row.actual);
}

function formatMetricTarget(row: GoalTargetRow): string {
  if (row.target <= 0) return "Not set";
  if (row.unit === "trips") return `${Math.round(row.target)} trips`;
  if (row.unit === "pct") return `${row.target.toFixed(1)}%`;
  return formatINRChip(row.target);
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

  const actuals = useMemo(
    () => computeGoalsActualsForRollup(trips, selectedMonthKey, rollup),
    [trips, selectedMonthKey, rollup],
  );

  const summaryRows = useMemo(
    () => buildGoalSummaryRows(goalsStore, actuals, selectedMonthKey, rollup),
    [goalsStore, actuals, selectedMonthKey, rollup],
  );

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

  const trendPoints = useMemo(
    () => buildBalanceTrendPoints(trips, monthOptions),
    [trips, monthOptions],
  );
  const maxTrendValue = Math.max(1, ...trendPoints.map((p) => p.receivable));

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
        {summaryRows.map((row) => (
          <View key={row.id} style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{row.label}</Text>
            <Text style={styles.kpiActual}>{formatMetricValue(row)}</Text>
            <Text style={styles.kpiTarget}>Target {formatMetricTarget(row)}</Text>
            <Text style={styles.kpiAchievement}>
              {row.target > 0 ? `${row.progressPct}% achieved` : "No target set"}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Actual trend</Text>
        <View style={styles.trendRow}>
          {trendPoints.map((p) => (
            <View key={p.monthKey} style={styles.trendBarWrap}>
              <View
                style={[
                  styles.trendBar,
                  { height: Math.max(4, (p.receivable / maxTrendValue) * 96) },
                ]}
              />
              <Text style={styles.trendBarLabel}>{p.label}</Text>
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
  kpiActual: { fontSize: 22, fontWeight: "800", color: Theme.textPrimaryDark },
  kpiTarget: { fontSize: 12, color: Theme.textSecondary },
  kpiAchievement: { fontSize: 12, fontWeight: "700", color: Theme.primary },
  sectionCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    gap: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: Theme.textPrimaryDark },
  trendRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    minHeight: 120,
  },
  trendBarWrap: { alignItems: "center", gap: 6, width: 40 },
  trendBar: { width: 18, backgroundColor: Theme.primary, borderRadius: 4 },
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
