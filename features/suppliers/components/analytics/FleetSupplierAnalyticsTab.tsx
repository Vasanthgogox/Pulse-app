/**
 * Fleet-wide supplier analytics tab.
 *
 * Receives already-computed data — no own fetches. All stats are derived
 * client-side via useMemo. Flat component (no own ScrollView) — rendered
 * inside SuppliersTab's existing ScrollView.
 *
 * Layout:
 *   Context note → KPI grid → Settlement ring → Supplier Cost Leaderboard
 *   → Settlement distribution chart → Supplier type breakdown chart
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
import { UtilizationRing } from "@/features/vehicles/components/analytics/AnalyticsChart";
import type { SupplierRow } from "../../services/suppliers.service";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FleetSupplierRow {
  id: string;
  name?: string;
  trips?: number;         // sourced trips count
  due?: number;           // total payables (supplier_rate sum)
  paid?: number;          // amount paid from ledger
  pending?: number;       // outstanding payable
  supplier_type?: "integrated" | "offline" | "marketplace";
}

interface Props {
  rows: FleetSupplierRow[];
  suppliers?: SupplierRow[];
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

// ─── HBarChart (supplier cost leaderboard bars) ───────────────────────────────

interface HBarItem {
  id: string;
  label: string;
  value: number;
  settlePct: number; // 0–100
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
          item.settlePct >= 90
            ? Theme.darkGreen
            : item.settlePct >= 60
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
              width={animW as any}
              height={ROW_H - 8}
              fill={barColor}
              rx={4}
              fillOpacity={0.85}
            />
            {/* Supplier label */}
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

// ─── BucketBarChart (settlement distribution / type breakdown) ────────────────

interface BucketItem {
  label: string;
  count: number;
  color: string;
}

function BucketBarChart({
  items,
  width,
}: {
  items: BucketItem[];
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
  }, [items.map((i) => i.count).join(",")]);

  const total = items.reduce((s, i) => s + i.count, 0) || 1;
  const BAR_H = 20;
  const GAP = 10;
  const LABEL_W = 80;
  const COUNT_W = 32;
  const chartW = Math.max(1, width - LABEL_W - COUNT_W - 8);
  const svgH = items.length * (BAR_H + GAP);

  return (
    <Svg width={width} height={svgH}>
      {items.map((item, i) => {
        const y = i * (BAR_H + GAP);
        const finalW = (item.count / total) * chartW;
        const animW = barAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.max(2, finalW)],
        });
        return (
          <G key={item.label}>
            {/* Track */}
            <Rect
              x={LABEL_W}
              y={y + 2}
              width={chartW}
              height={BAR_H - 4}
              fill={Theme.surfaceGray}
              rx={4}
            />
            {/* Animated fill */}
            <AnimatedRect
              x={LABEL_W}
              y={y + 2}
              width={animW as any}
              height={BAR_H - 4}
              fill={item.color}
              rx={4}
              fillOpacity={0.85}
            />
            {/* Bucket label */}
            <SvgText
              x={LABEL_W - 6}
              y={y + BAR_H / 2 + 4}
              textAnchor="end"
              fontSize={9}
              fill={Theme.textMuted}
              fontWeight="600"
            >
              {item.label}
            </SvgText>
            {/* Count */}
            <SvgText
              x={LABEL_W + chartW + 5}
              y={y + BAR_H / 2 + 4}
              textAnchor="start"
              fontSize={9}
              fill={Theme.textPrimaryDark}
              fontWeight="700"
            >
              {item.count}
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
  row: FleetSupplierRow;
  rank: number;
}) {
  const due = row.due ?? 0;
  const paid = row.paid ?? 0;
  const settlePct = due > 0 ? Math.round((paid / due) * 100) : paid > 0 ? 100 : 0;
  const badgeStyle = RANK_BADGE[rank] ?? null;

  const settleColor =
    settlePct >= 90
      ? Theme.darkGreen
      : settlePct >= 60
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
      {/* Supplier name + type */}
      <View style={lbStyles.nameCell}>
        <Text style={lbStyles.name} numberOfLines={1}>
          {row.name ?? "—"}
        </Text>
        {row.supplier_type ? (
          <Text style={lbStyles.type} numberOfLines={1}>
            {row.supplier_type}
          </Text>
        ) : null}
      </View>
      {/* Due */}
      <View style={lbStyles.statCell}>
        <Text style={lbStyles.statValue}>{formatINRChip(due)}</Text>
        <Text style={lbStyles.statLabel}>Due</Text>
      </View>
      {/* Settlement % */}
      <View style={lbStyles.statCell}>
        <Text style={[lbStyles.statValue, { color: settleColor }]}>
          {settlePct}%
        </Text>
        <Text style={lbStyles.statLabel}>Settled</Text>
      </View>
      {/* Trips */}
      <View style={lbStyles.tripsCell}>
        <Text style={lbStyles.statValue}>{row.trips ?? 0}</Text>
        <Text style={lbStyles.statLabel}>Trips</Text>
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
  statValue: { fontSize: 11, fontWeight: "800", color: Theme.textPrimaryDark },
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

// ─── Settlement ring styles ───────────────────────────────────────────────────

const ringStyles = StyleSheet.create({
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

export const FleetSupplierAnalyticsTab = memo(function FleetSupplierAnalyticsTab({
  rows,
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
    totalSuppliers,
    activeSuppliers,
    totalDue,
    totalPaid,
    totalPending,
    settlementRate,
    avgCostPerTrip,
    integratedPartners,
    totalTrips,
  } = useMemo(() => {
    const totalSuppliers = rows.length;
    const activeSuppliers = rows.filter((r) => (r.trips ?? 0) > 0).length;
    const totalDue = rows.reduce((s, r) => s + (r.due ?? 0), 0);
    const totalPaid = rows.reduce((s, r) => s + (r.paid ?? 0), 0);
    const totalPending = rows.reduce((s, r) => s + (r.pending ?? 0), 0);
    const settlementRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;
    const totalTrips = rows.reduce((s, r) => s + (r.trips ?? 0), 0);
    const avgCostPerTrip = totalDue / Math.max(totalTrips, 1);
    const integratedPartners = rows.filter(
      (r) => r.supplier_type === "integrated",
    ).length;

    return {
      totalSuppliers,
      activeSuppliers,
      totalDue,
      totalPaid,
      totalPending,
      settlementRate,
      avgCostPerTrip,
      integratedPartners,
      totalTrips,
    };
  }, [rows]);

  // ── KPI items ────────────────────────────────────────────────────────────────
  const kpiItems = useMemo(() => {
    const settleColor =
      settlementRate >= 90
        ? Theme.darkGreen
        : settlementRate >= 60
          ? Theme.warning
          : Theme.teslaRed;

    return [
      {
        id: "total",
        label: "Total Suppliers",
        value: String(totalSuppliers),
      },
      {
        id: "active",
        label: "Active Suppliers",
        value: String(activeSuppliers),
        accent: Theme.primary,
      },
      {
        id: "due",
        label: "Total Payables",
        value: formatINRChip(totalDue),
        accent: Theme.primary,
      },
      {
        id: "paid",
        label: "Total Paid",
        value: formatINRChip(totalPaid),
        accent: Theme.darkGreen,
      },
      {
        id: "pending",
        label: "Outstanding",
        value: formatINRChip(totalPending),
        accent: totalPending > 0 ? Theme.teslaRed : Theme.darkGreen,
        alert: totalPending > 0,
      },
      {
        id: "settle",
        label: "Settlement Rate",
        value: `${settlementRate.toFixed(1)}%`,
        accent: settleColor,
      },
      {
        id: "avgcost",
        label: "Avg Cost / Trip",
        value: formatINRChip(avgCostPerTrip),
        sub: `Across ${totalTrips} trips`,
      },
      {
        id: "integrated",
        label: "Integrated Partners",
        value: String(integratedPartners),
        accent: Theme.primary,
      },
    ];
  }, [
    totalSuppliers,
    activeSuppliers,
    totalDue,
    totalPaid,
    totalPending,
    settlementRate,
    avgCostPerTrip,
    integratedPartners,
    totalTrips,
  ]);

  const kpiRows = useMemo(
    () => chunk(kpiItems, ITEMS_PER_ROW),
    [kpiItems, ITEMS_PER_ROW],
  );

  // ── Leaderboard (top 10 by due) ──────────────────────────────────────────────
  const leaderboard = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => (b.due ?? 0) - (a.due ?? 0))
        .slice(0, 10),
    [rows],
  );

  // ── HBar data (cost leaderboard bars) ────────────────────────────────────────
  const hBarData = useMemo(
    () =>
      leaderboard.map((r) => {
        const due = r.due ?? 0;
        const paid = r.paid ?? 0;
        const settlePct = due > 0 ? Math.round((paid / due) * 100) : paid > 0 ? 100 : 0;
        return {
          id: r.id,
          label: r.name ?? r.id,
          value: due,
          settlePct,
        };
      }),
    [leaderboard],
  );

  // ── Settlement distribution ──────────────────────────────────────────────────
  const settlementDistribution = useMemo((): BucketItem[] => {
    const fullySettled = rows.filter((r) => (r.pending ?? 0) === 0 && (r.due ?? 0) > 0).length;
    const partial = rows.filter(
      (r) => (r.pending ?? 0) > 0 && (r.pending ?? 0) < (r.due ?? 0),
    ).length;
    const outstanding = rows.filter((r) => (r.paid ?? 0) === 0 && (r.due ?? 0) > 0).length;
    return [
      { label: "Fully Settled", count: fullySettled, color: Theme.darkGreen },
      { label: "Partial", count: partial, color: Theme.primary },
      { label: "Outstanding", count: outstanding, color: Theme.teslaRed },
    ];
  }, [rows]);

  // ── Supplier type breakdown ───────────────────────────────────────────────────
  const typeBreakdown = useMemo((): BucketItem[] => {
    const integrated = rows.filter((r) => r.supplier_type === "integrated").length;
    const offline = rows.filter((r) => r.supplier_type === "offline").length;
    const marketplace = rows.filter(
      (r) => r.supplier_type === "marketplace" || !r.supplier_type,
    ).length;
    return [
      { label: "Integrated", count: integrated, color: Theme.darkGreen },
      { label: "Offline", count: offline, color: Theme.primary },
      { label: "Marketplace", count: marketplace, color: Theme.teslaRed },
    ];
  }, [rows]);

  // ── Settlement ring color ────────────────────────────────────────────────────
  const ringColor =
    settlementRate >= 90
      ? Theme.darkGreen
      : settlementRate >= 60
        ? Theme.primary
        : Theme.teslaRed;

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <View style={emptyStyles.wrap}>
        <Text style={emptyStyles.icon}>🏭</Text>
        <Text style={emptyStyles.title}>No supplier data available</Text>
        <Text style={emptyStyles.sub}>
          Supplier analytics will appear once suppliers have sourced trips with
          financial records.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        isDesktop && { maxWidth: 860, alignSelf: "center", width: "100%" },
      ]}
    >
      {/* ── Context note ──────────────────────────────────────────────────── */}
      <Text style={styles.contextNote}>
        Vendor performance across all {totalSuppliers} supplier
        {totalSuppliers !== 1 ? "s" : ""}
      </Text>

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

      {/* ── Settlement Ring ───────────────────────────────────────────────── */}
      <SectionHeader
        title="Settlement Rate"
        sub="Paid vs total payables fleet-wide"
      />
      <View style={ringStyles.grid}>
        {/* Ring card */}
        <View style={ringStyles.ringCard}>
          <View style={ringStyles.ringWrap}>
            <UtilizationRing pct={Math.round(settlementRate)} size={80} color={ringColor} />
            <View style={ringStyles.ringCenter}>
              <Text style={ringStyles.ringPct}>{Math.round(settlementRate)}%</Text>
            </View>
          </View>
          <Text style={ringStyles.ringLabel}>Settlement</Text>
          <Text style={ringStyles.ringSub}>Fleet-wide</Text>
        </View>
        {/* Stats 2×2 */}
        <View style={ringStyles.statsCol}>
          <View style={ringStyles.statRow}>
            <View style={ringStyles.statItem}>
              <Text style={ringStyles.statLabel}>Total Paid</Text>
              <Text style={ringStyles.statValue}>{formatINRChip(totalPaid)}</Text>
            </View>
            <View style={ringStyles.statItem}>
              <Text style={ringStyles.statLabel}>Outstanding</Text>
              <Text style={[ringStyles.statValue, totalPending > 0 ? { color: Theme.teslaRed } : { color: Theme.darkGreen }]}>
                {formatINRChip(totalPending)}
              </Text>
            </View>
          </View>
          <View style={ringStyles.divider} />
          <View style={ringStyles.statRow}>
            <View style={ringStyles.statItem}>
              <Text style={ringStyles.statLabel}>Total Payables</Text>
              <Text style={ringStyles.statValue}>{formatINRChip(totalDue)}</Text>
            </View>
            <View style={ringStyles.statItem}>
              <Text style={ringStyles.statLabel}>Active</Text>
              <Text style={ringStyles.statValue}>{activeSuppliers}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Supplier Cost Leaderboard ──────────────────────────────────────── */}
      {leaderboard.length > 0 && (
        <>
          <SectionHeader
            title="Supplier Cost Leaderboard"
            sub="Top 10 by total payables — bar color: settlement rate ≥90% green, ≥60% indigo, red otherwise"
          />
          <View style={sectionCardStyles.card}>
            {/* Header row */}
            <View style={lbStyles.row}>
              <Text style={[lbHeaderStyles.th, { width: 38 }]}>Rank</Text>
              <Text style={[lbHeaderStyles.th, { flex: 1 }]}>Supplier</Text>
              <Text
                style={[
                  lbHeaderStyles.th,
                  { width: 52, textAlign: "right" },
                ]}
              >
                Due
              </Text>
              <Text
                style={[
                  lbHeaderStyles.th,
                  { width: 52, textAlign: "right" },
                ]}
              >
                Settled
              </Text>
              <Text
                style={[
                  lbHeaderStyles.th,
                  { width: 32, textAlign: "right" },
                ]}
              >
                Trips
              </Text>
            </View>
            {leaderboard.map((row, i) => (
              <LeaderboardRow key={row.id} row={row} rank={i + 1} />
            ))}
          </View>
        </>
      )}

      {/* ── Cost Leaderboard Bar Chart ─────────────────────────────────────── */}
      {hBarData.length > 0 && (
        <>
          <SectionHeader
            title="Cost Comparison"
            sub="Top suppliers by payables — bar color: settlement rate"
          />
          <ChartCard title="Payables by Supplier">
            <HBarChart items={hBarData} width={chartWidth} />
          </ChartCard>
        </>
      )}

      {/* ── Settlement Distribution ────────────────────────────────────────── */}
      <SectionHeader
        title="Settlement Distribution"
        sub="Breakdown of suppliers by payment status"
      />
      <ChartCard title="Payment Status Buckets">
        <BucketBarChart items={settlementDistribution} width={chartWidth} />
      </ChartCard>

      {/* ── Supplier Type Breakdown ────────────────────────────────────────── */}
      <SectionHeader
        title="Supplier Type Breakdown"
        sub="Integrated vs offline vs marketplace suppliers"
      />
      <ChartCard title="Supplier Types">
        <BucketBarChart items={typeBreakdown} width={chartWidth} />
      </ChartCard>

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
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 16,
  },
  contextNote: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 16,
    letterSpacing: 0.2,
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
