/**
 * Client fleet analytics tab.
 *
 * Receives already-computed data — no own fetches. All stats are derived
 * client-side via useMemo. Flat component (no own ScrollView) — rendered
 * inside CustomersTab's existing ScrollView.
 *
 * Layout:
 *   Context note → KPI grid → Collection health ring → Revenue Leaderboard
 *   → Payment status distribution → Client tiers
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
import type { ClientRow } from "../../services/clients.service";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FleetClientRow {
  id: string;
  name?: string;
  trips?: number;
  billed?: number;
  received?: number;
  pending?: number;
  is_integrated?: boolean;
}

interface Props {
  rows: FleetClientRow[];
  clients?: ClientRow[];
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
  pending: number;
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
  const VAL_W = 56;
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
        // Pending color-coded: red if pending > 0, green if fully paid
        const barColor = item.pending > 0 ? Theme.primary : Theme.darkGreen;
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
            {/* Client label */}
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
            {/* Billed value */}
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

// ─── Simple bar chart for distribution ───────────────────────────────────────

interface DistBarItem {
  label: string;
  count: number;
  color: string;
}

function DistBarChart({
  items,
  width,
}: {
  items: DistBarItem[];
  width: number;
}) {
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    barAnim.setValue(0);
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [items.map((i) => i.count).join(",")]);

  const LABEL_H = 24;
  const BAR_AREA_H = 80;
  const svgH = BAR_AREA_H + LABEL_H + 16;
  const maxCount = Math.max(...items.map((i) => i.count), 1);
  const barW = Math.max(3, Math.min(48, (width / items.length) * 0.5));
  const groupW = width / items.length;

  return (
    <Svg width={width} height={svgH}>
      {items.map((item, i) => {
        const cx = groupW * i + groupW / 2;
        const finalH = Math.max(2, (item.count / maxCount) * BAR_AREA_H);
        const animH = barAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, finalH],
        });
        const animY = barAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [BAR_AREA_H, BAR_AREA_H - finalH],
        });
        return (
          <G key={item.label}>
            {/* Track */}
            <Rect
              x={cx - barW / 2}
              y={0}
              width={barW}
              height={BAR_AREA_H}
              fill={Theme.surfaceGray}
              rx={4}
            />
            {/* Animated bar */}
            <AnimatedRect
              x={cx - barW / 2}
              y={animY as unknown as number}
              width={barW}
              height={animH as unknown as number}
              fill={item.color}
              rx={4}
              fillOpacity={0.85}
            />
            {/* Count label above bar */}
            <SvgText
              x={cx}
              y={BAR_AREA_H - finalH - 4}
              textAnchor="middle"
              fontSize={10}
              fill={Theme.textPrimaryDark}
              fontWeight="700"
            >
              {item.count}
            </SvgText>
            {/* X label */}
            <SvgText
              x={cx}
              y={BAR_AREA_H + 14}
              textAnchor="middle"
              fontSize={9}
              fill={Theme.textMuted}
              fontWeight="600"
            >
              {item.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─── Leaderboard row ──────────────────────────────────────────────────────────

const LeaderboardRow = memo(function LeaderboardRow({
  row,
  rank,
}: {
  row: FleetClientRow;
  rank: number;
}) {
  const badgeStyle = RANK_BADGE[rank] ?? null;
  const pending = row.pending ?? 0;
  const billed = row.billed ?? 0;
  const pendingColor =
    pending === 0
      ? Theme.darkGreen
      : pending >= billed
        ? Theme.teslaRed
        : Theme.warning;

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
      {/* Client name */}
      <View style={lbStyles.nameCell}>
        <Text style={lbStyles.name} numberOfLines={1}>
          {row.name ?? "—"}
        </Text>
        {row.is_integrated ? (
          <Text style={lbStyles.integratedBadge}>INTEGRATED</Text>
        ) : null}
      </View>
      {/* Billed */}
      <View style={lbStyles.statCell}>
        <Text style={lbStyles.statValue}>{formatINRChip(billed)}</Text>
        <Text style={lbStyles.statLabel}>Billed</Text>
      </View>
      {/* Pending */}
      <View style={lbStyles.statCell}>
        <Text style={[lbStyles.statValue, { color: pendingColor }]}>
          {formatINRChip(pending)}
        </Text>
        <Text style={lbStyles.statLabel}>Pending</Text>
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
  integratedBadge: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.3,
  },
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

// ─── Collection health ring styles ───────────────────────────────────────────

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

export const FleetClientAnalyticsTab = memo(function FleetClientAnalyticsTab({
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

  // ── Fleet client stats ───────────────────────────────────────────────────────
  const {
    totalClients,
    activeClients,
    totalBilled,
    totalReceived,
    totalPending,
    collectionRate,
    avgRevenuePerClient,
    integratedCount,
  } = useMemo(() => {
    const totalClients = rows.length;
    const activeClients = rows.filter((r) => (r.trips ?? 0) > 0).length;
    const totalBilled = rows.reduce((s, r) => s + (r.billed ?? 0), 0);
    const totalReceived = rows.reduce((s, r) => s + (r.received ?? 0), 0);
    const totalPending = rows.reduce((s, r) => s + (r.pending ?? 0), 0);
    const collectionRate =
      totalBilled > 0 ? (totalReceived / totalBilled) * 100 : 0;
    const avgRevenuePerClient = totalBilled / Math.max(activeClients, 1);
    const integratedCount = rows.filter((r) => r.is_integrated === true).length;

    return {
      totalClients,
      activeClients,
      totalBilled,
      totalReceived,
      totalPending,
      collectionRate,
      avgRevenuePerClient,
      integratedCount,
    };
  }, [rows]);

  // ── KPI items ────────────────────────────────────────────────────────────────
  const kpiItems = useMemo(() => {
    const collectionColor =
      collectionRate >= 90
        ? Theme.darkGreen
        : collectionRate >= 60
          ? Theme.warning
          : Theme.teslaRed;

    return [
      {
        id: "totalClients",
        label: "Total Clients",
        value: String(totalClients),
      },
      {
        id: "activeClients",
        label: "Active Clients",
        value: String(activeClients),
        sub: "have trips",
        accent: Theme.primary,
      },
      {
        id: "totalRevenue",
        label: "Total Revenue",
        value: formatINRChip(totalBilled),
        accent: Theme.primary,
      },
      {
        id: "totalCollected",
        label: "Total Collected",
        value: formatINRChip(totalReceived),
        accent: Theme.darkGreen,
      },
      {
        id: "outstandingAR",
        label: "Outstanding AR",
        value: formatINRChip(totalPending),
        accent: totalPending > 0 ? Theme.teslaRed : Theme.darkGreen,
        alert: totalPending > 0,
      },
      {
        id: "collectionRate",
        label: "Collection Rate",
        value: `${collectionRate.toFixed(1)}%`,
        accent: collectionColor,
      },
      {
        id: "avgRevenue",
        label: "Avg Revenue / Client",
        value: formatINRChip(avgRevenuePerClient),
        sub: "Active clients only",
      },
      {
        id: "integrated",
        label: "Integrated",
        value: `${integratedCount} / ${totalClients}`,
        sub: "vs offline",
        accent: integratedCount > 0 ? Theme.primary : undefined,
      },
    ];
  }, [
    totalClients,
    activeClients,
    totalBilled,
    totalReceived,
    totalPending,
    collectionRate,
    avgRevenuePerClient,
    integratedCount,
  ]);

  const kpiRows = useMemo(
    () => chunk(kpiItems, ITEMS_PER_ROW),
    [kpiItems, ITEMS_PER_ROW],
  );

  // ── Leaderboard (top 10 by billed) ──────────────────────────────────────────
  const leaderboard = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => (b.billed ?? 0) - (a.billed ?? 0))
        .slice(0, 10),
    [rows],
  );

  // ── Horizontal bar data ──────────────────────────────────────────────────────
  const hBarData = useMemo(
    () =>
      leaderboard.map((r) => ({
        id: r.id,
        label: r.name ?? r.id,
        value: r.billed ?? 0,
        pending: r.pending ?? 0,
      })),
    [leaderboard],
  );

  // ── Payment status distribution ──────────────────────────────────────────────
  const paymentDistData = useMemo(() => {
    const fullyPaid = rows.filter((r) => (r.pending ?? 0) === 0).length;
    const partial = rows.filter(
      (r) => (r.pending ?? 0) > 0 && (r.pending ?? 0) < (r.billed ?? 0),
    ).length;
    const outstanding = rows.filter(
      (r) => (r.received ?? 0) === 0,
    ).length;
    return [
      { label: "Fully Paid", count: fullyPaid, color: Theme.darkGreen },
      { label: "Partial", count: partial, color: Theme.primary },
      { label: "Outstanding", count: outstanding, color: Theme.teslaRed },
    ];
  }, [rows]);

  // ── Client tiers ─────────────────────────────────────────────────────────────
  const tierData = useMemo(() => {
    const enterprise = rows.filter((r) => (r.billed ?? 0) >= 500000).length;
    const regular = rows.filter(
      (r) => (r.billed ?? 0) >= 10000 && (r.billed ?? 0) < 500000,
    ).length;
    const lowVolume = rows.filter((r) => (r.billed ?? 0) < 10000).length;
    return { enterprise, regular, lowVolume };
  }, [rows]);

  // ── Rounded collection rate for the ring ────────────────────────────────────
  const collectionRatePct = Math.round(collectionRate);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <View style={emptyStyles.wrap}>
        <Text style={emptyStyles.icon}>🏢</Text>
        <Text style={emptyStyles.title}>No client data available</Text>
        <Text style={emptyStyles.sub}>
          Client analytics will appear once clients have associated trips and
          financial records.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        isDesktop && { alignSelf: "stretch" as const, width: "100%" as const },
      ]}
    >
      {/* ── Context note ──────────────────────────────────────────────────── */}
      <Text style={styles.contextNote}>
        Client performance across all {totalClients} customer
        {totalClients !== 1 ? "s" : ""}
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

      {/* ── Collection Health Ring ────────────────────────────────────────── */}
      <SectionHeader
        title="Collection Health"
        sub="Fleet-wide receivables collection rate"
      />
      <View style={ringStyles.grid}>
        {/* Ring card */}
        <View style={ringStyles.ringCard}>
          <View style={ringStyles.ringWrap}>
            <UtilizationRing
              pct={collectionRatePct}
              size={80}
              color={
                collectionRatePct >= 90
                  ? Theme.darkGreen
                  : collectionRatePct >= 60
                    ? Theme.warning
                    : Theme.teslaRed
              }
            />
            <View style={ringStyles.ringCenter}>
              <Text style={ringStyles.ringPct}>{collectionRatePct}%</Text>
            </View>
          </View>
          <Text style={ringStyles.ringLabel}>Collection</Text>
          <Text style={ringStyles.ringSub}>Fleet-wide</Text>
        </View>
        {/* Stats 2×2 */}
        <View style={ringStyles.statsCol}>
          <View style={ringStyles.statRow}>
            <View style={ringStyles.statItem}>
              <Text style={ringStyles.statLabel}>Collected</Text>
              <Text style={ringStyles.statValue}>
                {formatINRChip(totalReceived)}
              </Text>
            </View>
            <View style={ringStyles.statItem}>
              <Text style={ringStyles.statLabel}>Pending</Text>
              <Text
                style={[
                  ringStyles.statValue,
                  totalPending > 0 ? { color: Theme.teslaRed } : undefined,
                ]}
              >
                {formatINRChip(totalPending)}
              </Text>
            </View>
          </View>
          <View style={ringStyles.divider} />
          <View style={ringStyles.statRow}>
            <View style={ringStyles.statItem}>
              <Text style={ringStyles.statLabel}>Total Billed</Text>
              <Text style={ringStyles.statValue}>
                {formatINRChip(totalBilled)}
              </Text>
            </View>
            <View style={ringStyles.statItem}>
              <Text style={ringStyles.statLabel}>Active</Text>
              <Text style={ringStyles.statValue}>{activeClients}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Revenue Leaderboard ───────────────────────────────────────────── */}
      {leaderboard.length > 0 && (
        <>
          <SectionHeader
            title="Revenue Leaderboard"
            sub="Top 10 clients by billed amount — pending color: green = paid, red = outstanding"
          />
          <View style={sectionCardStyles.card}>
            {/* Header row */}
            <View style={lbStyles.row}>
              <Text style={[lbHeaderStyles.th, { width: 38 }]}>Rank</Text>
              <Text style={[lbHeaderStyles.th, { flex: 1 }]}>Client</Text>
              <Text
                style={[
                  lbHeaderStyles.th,
                  { width: 52, textAlign: "right" },
                ]}
              >
                Billed
              </Text>
              <Text
                style={[
                  lbHeaderStyles.th,
                  { width: 52, textAlign: "right" },
                ]}
              >
                Pending
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

      {/* ── Revenue bar chart ─────────────────────────────────────────────── */}
      {hBarData.length > 0 && (
        <>
          <SectionHeader
            title="Revenue Comparison"
            sub="Top clients by billed — bar color: green = fully paid, indigo = has pending"
          />
          <ChartCard title="Revenue by Client">
            <HBarChart items={hBarData} width={chartWidth} />
          </ChartCard>
        </>
      )}

      {/* ── Payment Status Distribution ───────────────────────────────────── */}
      <SectionHeader
        title="Payment Status"
        sub="Distribution across all clients"
      />
      <ChartCard title="Payment Status Distribution">
        <DistBarChart items={paymentDistData} width={chartWidth} />
      </ChartCard>

      {/* ── Client Tiers ──────────────────────────────────────────────────── */}
      <SectionHeader
        title="Client Tiers"
        sub="Enterprise ≥ ₹5L · Regular ₹10k–₹5L · Low Volume < ₹10k"
      />
      <View style={tierStyles.grid}>
        <View style={[tierStyles.card, { borderLeftColor: Theme.warning }]}>
          <Text style={tierStyles.count}>{tierData.enterprise}</Text>
          <Text style={tierStyles.label}>Enterprise</Text>
          <Text style={tierStyles.sub}>≥ ₹5,00,000</Text>
        </View>
        <View style={[tierStyles.card, { borderLeftColor: Theme.primary }]}>
          <Text style={tierStyles.count}>{tierData.regular}</Text>
          <Text style={tierStyles.label}>Regular</Text>
          <Text style={tierStyles.sub}>₹10k – ₹5L</Text>
        </View>
        <View style={[tierStyles.card, { borderLeftColor: Theme.textMuted }]}>
          <Text style={tierStyles.count}>{tierData.lowVolume}</Text>
          <Text style={tierStyles.label}>Low Volume</Text>
          <Text style={tierStyles.sub}>{"< ₹10,000"}</Text>
        </View>
      </View>

      {/* Bottom spacing */}
      <View style={{ height: 32 }} />
    </View>
  );
});

// ─── Tier styles ───────────────────────────────────────────────────────────────

const tierStyles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  card: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderLeftWidth: 3,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 3,
    alignItems: "center",
  },
  count: {
    fontSize: 22,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textPrimary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  sub: {
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
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
