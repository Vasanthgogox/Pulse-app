/**
 * Fleet-wide analytics tab for GarrageTab.
 *
 * Receives already-computed data — no own fetches. All stats are derived
 * client-side via useMemo. Flat component (no own ScrollView) — rendered
 * inside GarrageTab's existing ScrollView.
 *
 * Layout:
 *   Period context note → KPI grid → Fleet Utilization ring → Vehicle
 *   Revenue Leaderboard → Revenue Comparison horizontal bar chart
 */
import React, { memo, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { formatINRChip } from "@/lib/format";
import { UtilizationRing } from "./AnalyticsChart";
import type { VehiclePnLRow } from "../../pnl";
import type { VehicleRow } from "../../services/vehicles.service";
import type { TripRow } from "@/features/trips/services/trips.service";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  vehiclesList: VehiclePnLRow[]; // from buildVehiclePnLList — already filtered for period
  vehicles: VehicleRow[];        // master vehicle data (for doc expiry)
  trips: TripRow[];              // all trips in the org (for trip count stats)
  organizationId: string | null;
}

// ─── Rank badge constants ─────────────────────────────────────────────────────

const RANK_BADGE: Record<number, { bg: string; text: string }> = {
  1: { bg: "#FEF3C7", text: "#B45309" },
  2: { bg: "#F1F5F9", text: "#475569" },
  3: { bg: "#FEF2F2", text: "#92400E" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  id?: string;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  alert?: boolean;
}

const KpiCard = memo(function KpiCard({
  label,
  value,
  sub,
  accent,
  alert,
}: KpiCardProps) {
  return (
    <View
      style={[
        kpiStyles.card,
        alert && kpiStyles.cardAlert,
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined,
      ]}
    >
      <Text style={kpiStyles.label}>{label}</Text>
      <Text
        style={[kpiStyles.value, accent ? { color: accent } : undefined]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? (
        <Text style={kpiStyles.sub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
});

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 3,
    minHeight: 76,
    justifyContent: "flex-end",
  },
  cardAlert: {
    backgroundColor: "rgba(232,33,39,0.04)",
    borderColor: "rgba(232,33,39,0.20)",
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 20,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
    paddingLeft: Layout.currencyTextPaddingStart,
  },
  sub: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
});

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={secStyles.wrap}>
      <Text style={secStyles.title}>{title}</Text>
      {sub ? <Text style={secStyles.sub}>{sub}</Text> : null}
    </View>
  );
}

const secStyles = StyleSheet.create({
  wrap: { gap: 1, marginBottom: 10 },
  title: {
    fontSize: 13,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
    textTransform: "uppercase",
  },
  sub: { fontSize: 10, fontWeight: "600", color: Theme.textMuted },
});

// ─── ChartCard ────────────────────────────────────────────────────────────────

function ChartCard({
  title,
  legend,
  children,
}: {
  title: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={chartCardStyles.card}>
      <View style={chartCardStyles.header}>
        <Text style={chartCardStyles.title}>{title}</Text>
        {legend}
      </View>
      {children}
    </View>
  );
}

const chartCardStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimary,
    letterSpacing: 0.1,
  },
});

// ─── Animated SVG Rect ────────────────────────────────────────────────────────

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// ─── HBarChart ────────────────────────────────────────────────────────────────

interface HBarItem {
  id: string;
  label: string;
  value: number;
  margin: number;
}

function HBarChart({
  items,
  width,
}: {
  items: HBarItem[];
  width: number;
}) {
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    barAnim.setValue(0);
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [items.length]);

  const ROW_H = 28;
  const GAP = 8;
  const LABEL_W = 80;
  const VAL_W = 48;
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const chartW = Math.max(1, width - LABEL_W - VAL_W - 8);
  const svgH = items.length * (ROW_H + GAP);

  return (
    <Svg width={width} height={svgH}>
      {items.map((item, i) => {
        const y = i * (ROW_H + GAP);
        const finalW = (item.value / maxVal) * chartW;
        const animW = barAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.max(2, finalW)],
        });
        const barColor =
          item.margin >= 15
            ? Theme.darkGreen
            : item.margin >= 0
              ? Theme.primary
              : Theme.teslaRed;
        const displayLabel =
          item.label.length > 10 ? item.label.slice(0, 9) + "…" : item.label;
        return (
          <G key={item.id}>
            {/* Track background */}
            <Rect
              x={LABEL_W}
              y={y + 4}
              width={chartW}
              height={ROW_H - 8}
              fill={Theme.surfaceGray}
              rx={4}
            />
            {/* Animated bar */}
            <AnimatedRect
              x={LABEL_W}
              y={y + 4}
              width={animW as unknown as number}
              height={ROW_H - 8}
              fill={barColor}
              rx={4}
              fillOpacity={0.85}
            />
            {/* Vehicle label */}
            <SvgText
              x={LABEL_W - 6}
              y={y + ROW_H / 2 + 4}
              textAnchor="end"
              fontSize={9}
              fill={Theme.textMuted}
              fontWeight="600"
            >
              {displayLabel}
            </SvgText>
            {/* Value */}
            <SvgText
              x={LABEL_W + chartW + 5}
              y={y + ROW_H / 2 + 4}
              textAnchor="start"
              fontSize={9}
              fill={Theme.textPrimaryDark}
              fontWeight="700"
            >
              {formatINRChip(item.value)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─── LeaderboardRow ───────────────────────────────────────────────────────────

const LeaderboardRow = memo(function LeaderboardRow({
  row,
  rank,
}: {
  row: VehiclePnLRow;
  rank: number;
}) {
  const pnlPositive = row.pnl >= 0;
  const badgeStyle = RANK_BADGE[rank] ?? null;

  const marginColor =
    row.margin >= 15
      ? Theme.darkGreen
      : row.margin >= 0
        ? Theme.warning
        : Theme.teslaRed;

  return (
    <View style={lbStyles.row}>
      {/* Rank */}
      <View style={lbStyles.rankCell}>
        {badgeStyle ? (
          <View style={[lbStyles.rankBadge, { backgroundColor: badgeStyle.bg }]}>
            <Text style={[lbStyles.rankBadgeText, { color: badgeStyle.text }]}>
              #{rank}
            </Text>
          </View>
        ) : (
          <Text style={lbStyles.rankNum}>#{rank}</Text>
        )}
      </View>
      {/* Vehicle name + type */}
      <View style={lbStyles.nameCell}>
        <Text style={lbStyles.name} numberOfLines={1}>
          {row.name}
        </Text>
        {row.type && row.type !== "—" ? (
          <Text style={lbStyles.type} numberOfLines={1}>
            {row.type}
          </Text>
        ) : null}
      </View>
      {/* Revenue */}
      <View style={lbStyles.statCell}>
        <Text style={lbStyles.statValue}>{formatINRChip(row.sales)}</Text>
        <Text style={lbStyles.statLabel}>Revenue</Text>
      </View>
      {/* Margin % */}
      <View style={lbStyles.statCell}>
        <Text style={[lbStyles.statValue, { color: marginColor }]}>
          {row.margin.toFixed(0)}%
        </Text>
        <Text style={lbStyles.statLabel}>Margin</Text>
      </View>
      {/* Trips */}
      <View style={lbStyles.tripsCell}>
        <Text style={lbStyles.statValue}>{row.trips}</Text>
        <Text style={lbStyles.statLabel}>Trips</Text>
      </View>
      {/* P&L */}
      <View style={lbStyles.pnlCell}>
        <Text
          style={[
            lbStyles.pnlValue,
            { color: pnlPositive ? Theme.darkGreen : Theme.teslaRed },
          ]}
          numberOfLines={1}
        >
          {pnlPositive ? "+" : ""}
          {formatINRChip(row.pnl)}
        </Text>
        <Text style={lbStyles.statLabel}>P&amp;L</Text>
      </View>
    </View>
  );
});

const lbStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  rankCell: { width: 38, alignItems: "center" },
  rankBadge: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rankBadgeText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.3 },
  rankNum: { fontSize: 11, fontWeight: "700", color: Theme.textMuted },
  nameCell: { flex: 1, minWidth: 0, gap: 1 },
  name: { fontSize: 11, fontWeight: "700", color: Theme.textPrimaryDark },
  type: { fontSize: 9, fontWeight: "600", color: Theme.textMuted },
  statCell: { width: 52, alignItems: "flex-end", gap: 1 },
  tripsCell: { width: 32, alignItems: "flex-end", gap: 1 },
  pnlCell: { width: 56, alignItems: "flex-end", gap: 1 },
  statValue: { fontSize: 11, fontWeight: "800", color: Theme.textPrimaryDark },
  pnlValue: { fontSize: 10, fontWeight: "800" },
  statLabel: { fontSize: 8, fontWeight: "600", color: Theme.textMuted },
});

// ─── Leaderboard header styles ────────────────────────────────────────────────

const lbHeaderStyles = StyleSheet.create({
  th: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

// ─── Section card styles ──────────────────────────────────────────────────────

const sectionCardStyles = StyleSheet.create({
  card: {
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 24,
    paddingHorizontal: 16,
    marginBottom: 28,
    overflow: "hidden",
  },
});

// ─── Utilization styles ───────────────────────────────────────────────────────

const utilStyles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  ringCard: {
    width: 110,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  ringWrap: {
    width: 80,
    height: 80,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPct: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  ringLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  ringSub: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
  statsCol: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 20,
    padding: 14,
    justifyContent: "center",
    gap: 10,
  },
  statRow: { flexDirection: "row", gap: 8 },
  statItem: { flex: 1, gap: 2 },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.borderLight,
  },
});

// ─── Main component ───────────────────────────────────────────────────────────

export const FleetAnalyticsTab = memo(function FleetAnalyticsTab({
  vehiclesList,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 640;
  const isDesktop = windowWidth >= 1024;
  const ITEMS_PER_ROW = isTablet ? 4 : 2;

  // Chart width: screen - 2×screenPadding - 2×cardPadding
  const chartWidth = Math.max(
    160,
    windowWidth - 2 * Layout.screenPaddingHorizontal - 32,
  );

  // ── Fleet stats ─────────────────────────────────────────────────────────────
  const {
    assigned,
    totalRevenue,
    fleetMargin,
    activeVehicles,
    profitableVehicles,
    lossVehicles,
    avgMargin,
    underutilized,
    fleetUtilPct,
  } = useMemo(() => {
    const assigned = vehiclesList.filter((r) => !r.isUnassigned);
    const totalRevenue = assigned.reduce((s, r) => s + r.sales, 0);
    const totalExpense = assigned.reduce((s, r) => s + r.expense, 0);
    const fleetMargin =
      totalRevenue > 0
        ? ((totalRevenue - totalExpense) / totalRevenue) * 100
        : 0;
    const activeVehicles = assigned.filter((r) => r.trips > 0).length;
    const profitableVehicles = assigned.filter((r) => r.pnl > 0).length;
    const lossVehicles = assigned.filter((r) => r.pnl < 0).length;
    const avgMargin =
      assigned.length > 0
        ? assigned.reduce((s, r) => s + r.margin, 0) / assigned.length
        : 0;
    const underutilized = assigned.filter(
      (r) => r.trips > 0 && r.trips < 3,
    ).length;
    const fleetUtilPct =
      assigned.length > 0
        ? Math.round((activeVehicles / assigned.length) * 100)
        : 0;

    return {
      assigned,
      totalRevenue,
      totalExpense,
      fleetMargin,
      activeVehicles,
      profitableVehicles,
      lossVehicles,
      avgMargin,
      underutilized,
      fleetUtilPct,
    };
  }, [vehiclesList]);

  // ── KPI items ────────────────────────────────────────────────────────────────
  const kpiItems = useMemo(() => {
    const marginColor =
      fleetMargin >= 20
        ? Theme.darkGreen
        : fleetMargin >= 5
          ? Theme.warning
          : Theme.teslaRed;
    return [
      {
        id: "rev",
        label: "Total Revenue",
        value: formatINRChip(totalRevenue),
        accent: Theme.primary,
      },
      {
        id: "margin",
        label: "Fleet Margin",
        value: `${fleetMargin.toFixed(1)}%`,
        accent: marginColor,
      },
      {
        id: "active",
        label: "Active Vehicles",
        value: `${activeVehicles} / ${assigned.length}`,
        accent: Theme.primary,
      },
      {
        id: "avgMargin",
        label: "Avg Margin",
        value: `${avgMargin.toFixed(1)}%`,
        sub: "Across active vehicles",
      },
      {
        id: "profitable",
        label: "Profitable",
        value: String(profitableVehicles),
        accent: Theme.darkGreen,
      },
      {
        id: "loss",
        label: "Loss Making",
        value: String(lossVehicles),
        accent: lossVehicles > 0 ? Theme.teslaRed : Theme.darkGreen,
        alert: lossVehicles > 0,
      },
      {
        id: "underutilized",
        label: "Underutilized",
        value: String(underutilized),
        sub: "< 3 trips in period",
        alert: underutilized > 0,
        accent: underutilized > 0 ? Theme.warning : Theme.darkGreen,
      },
    ];
  }, [
    assigned.length,
    totalRevenue,
    fleetMargin,
    activeVehicles,
    avgMargin,
    profitableVehicles,
    lossVehicles,
    underutilized,
  ]);

  const kpiRows = useMemo(
    () => chunk(kpiItems, ITEMS_PER_ROW),
    [kpiItems, ITEMS_PER_ROW],
  );

  // ── Leaderboard (top 10 by revenue) ─────────────────────────────────────────
  const leaderboard = useMemo(
    () =>
      assigned
        .slice()
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 10),
    [assigned],
  );

  // ── Horizontal bar data ──────────────────────────────────────────────────────
  const hBarData = useMemo(
    () =>
      leaderboard.map((r) => ({
        id: r.id,
        label: r.name,
        value: r.sales,
        margin: r.margin,
      })),
    [leaderboard],
  );

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (assigned.length === 0) {
    return (
      <View style={emptyStyles.wrap}>
        <Text style={emptyStyles.icon}>🚛</Text>
        <Text style={emptyStyles.title}>No fleet data for this period</Text>
        <Text style={emptyStyles.sub}>
          Fleet analytics will appear once vehicles have trips with financial
          records in the selected period.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" },
      ]}
    >
      {/* ── KPI Grid ──────────────────────────────────────────────────────── */}
      <View style={styles.kpiGrid}>
        {kpiRows.map((row, ri) => (
          <View key={ri} style={styles.kpiRow}>
            {row.map((item) => (
              <KpiCard key={item.id} {...item} />
            ))}
          </View>
        ))}
      </View>

      {/* ── Fleet Utilization ─────────────────────────────────────────────── */}
      <SectionHeader
        title="Fleet Utilization"
        sub="Vehicles with at least one trip in period"
      />
      <View style={utilStyles.grid}>
        {/* Ring card */}
        <View style={utilStyles.ringCard}>
          <View style={utilStyles.ringWrap}>
            <UtilizationRing pct={fleetUtilPct} size={80} />
            <View style={utilStyles.ringCenter}>
              <Text style={utilStyles.ringPct}>{fleetUtilPct}%</Text>
            </View>
          </View>
          <Text style={utilStyles.ringLabel}>Utilized</Text>
          <Text style={utilStyles.ringSub}>
            {activeVehicles} of {assigned.length}
          </Text>
        </View>
        {/* Stats 2×2 */}
        <View style={utilStyles.statsCol}>
          <View style={utilStyles.statRow}>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Active</Text>
              <Text style={utilStyles.statValue}>{activeVehicles}</Text>
            </View>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Idle</Text>
              <Text style={utilStyles.statValue}>
                {assigned.length - activeVehicles}
              </Text>
            </View>
          </View>
          <View style={utilStyles.divider} />
          <View style={utilStyles.statRow}>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Total Revenue</Text>
              <Text style={utilStyles.statValue}>
                {formatINRChip(totalRevenue)}
              </Text>
            </View>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Fleet Margin</Text>
              <Text style={utilStyles.statValue}>
                {fleetMargin.toFixed(1)}%
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Vehicle Revenue Leaderboard ────────────────────────────────────── */}
      {leaderboard.length > 0 && (
        <>
          <SectionHeader
            title="Vehicle Leaderboard"
            sub="Ranked by revenue in selected period"
          />
          <View style={sectionCardStyles.card}>
            {/* Header row */}
            <View style={lbStyles.row}>
              <Text style={[lbHeaderStyles.th, { width: 38 }]}>Rank</Text>
              <Text style={[lbHeaderStyles.th, { flex: 1 }]}>Vehicle</Text>
              <Text
                style={[
                  lbHeaderStyles.th,
                  { width: 52, textAlign: "right" },
                ]}
              >
                Revenue
              </Text>
              <Text
                style={[
                  lbHeaderStyles.th,
                  { width: 52, textAlign: "right" },
                ]}
              >
                Margin
              </Text>
              <Text
                style={[
                  lbHeaderStyles.th,
                  { width: 32, textAlign: "right" },
                ]}
              >
                Trips
              </Text>
              <Text
                style={[
                  lbHeaderStyles.th,
                  { width: 56, textAlign: "right" },
                ]}
              >
                P&amp;L
              </Text>
            </View>
            {leaderboard.map((row, i) => (
              <LeaderboardRow key={row.id} row={row} rank={i + 1} />
            ))}
          </View>
        </>
      )}

      {/* ── Revenue Comparison Chart ───────────────────────────────────────── */}
      {hBarData.length > 0 && (
        <>
          <SectionHeader
            title="Revenue Comparison"
            sub="Top vehicles by revenue — bar color: green ≥15% margin, indigo ≥0%, red negative"
          />
          <ChartCard title="Revenue by Vehicle">
            <HBarChart items={hBarData} width={chartWidth} />
          </ChartCard>
        </>
      )}

      {/* Bottom spacing */}
      <View style={{ height: 32 }} />
    </View>
  );
});

// ─── Empty state styles ────────────────────────────────────────────────────────

const emptyStyles = StyleSheet.create({
  wrap: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  icon: { fontSize: 36 },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  sub: {
    fontSize: 12,
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
});

// ─── Root styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    gap: 0,
  },
  kpiGrid: {
    gap: 8,
    marginBottom: 24,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
  },
});
