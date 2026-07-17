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
import type { DriverRow } from "../../services/drivers.service";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FleetDriverRow {
  id: string;
  name?: string;
  trips?: number;
  due?: number;
  paid?: number;
  pending?: number;
  rating?: number;
  ratingCount?: number;
  left_at?: string | null;
}

interface Props {
  rows: FleetDriverRow[];
  drivers?: DriverRow[];
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={chartCardStyles.card}>
      <View style={chartCardStyles.header}>
        <Text style={chartCardStyles.title}>{title}</Text>
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
  color: string;
}

function HBarChart({ items, width }: { items: HBarItem[]; width: number }) {
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
        const displayLabel =
          item.label.length > 10 ? item.label.slice(0, 9) + "…" : item.label;
        return (
          <G key={item.id}>
            <Rect
              x={LABEL_W}
              y={y + 4}
              width={chartW}
              height={ROW_H - 8}
              fill={Theme.surfaceGray}
              rx={4}
            />
            <AnimatedRect
              x={LABEL_W}
              y={y + 4}
              width={animW as any}
              height={ROW_H - 8}
              fill={item.color}
              rx={4}
              fillOpacity={0.85}
            />
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
  row: FleetDriverRow;
  rank: number;
}) {
  const badgeStyle = RANK_BADGE[rank] ?? null;
  const due = row.due ?? 0;
  const paid = row.paid ?? 0;
  const pending = row.pending ?? 0;
  const settlePct = due > 0 ? Math.round((paid / due) * 100) : 0;
  const settleColor =
    settlePct >= 90
      ? Theme.darkGreen
      : settlePct >= 50
        ? Theme.warning
        : Theme.teslaRed;

  return (
    <View style={lbStyles.row}>
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
      <View style={lbStyles.nameCell}>
        <Text style={lbStyles.name} numberOfLines={1}>
          {row.name ?? "—"}
        </Text>
        <Text style={lbStyles.type} numberOfLines={1}>
          {row.trips ?? 0} trips
        </Text>
      </View>
      <View style={lbStyles.statCell}>
        <Text style={lbStyles.statValue}>{formatINRChip(due)}</Text>
        <Text style={lbStyles.statLabel}>Due</Text>
      </View>
      <View style={lbStyles.statCell}>
        <Text style={[lbStyles.statValue, { color: settleColor }]}>
          {settlePct}%
        </Text>
        <Text style={lbStyles.statLabel}>Settled</Text>
      </View>
      <View style={lbStyles.statCell}>
        <Text
          style={[
            lbStyles.statValue,
            { color: pending > 0 ? Theme.teslaRed : Theme.darkGreen },
          ]}
          numberOfLines={1}
        >
          {formatINRChip(pending)}
        </Text>
        <Text style={lbStyles.statLabel}>Pending</Text>
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
  statValue: { fontSize: 11, fontWeight: "800", color: Theme.textPrimaryDark },
  statLabel: { fontSize: 8, fontWeight: "600", color: Theme.textMuted },
});

const lbHeaderStyles = StyleSheet.create({
  th: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});

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

export const FleetDriverAnalyticsTab = memo(function FleetDriverAnalyticsTab({
  rows,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 640;
  const isDesktop = windowWidth >= 1024;
  const ITEMS_PER_ROW = isTablet ? 4 : 2;

  const chartWidth = Math.max(
    160,
    windowWidth - 2 * Layout.screenPaddingHorizontal - 32,
  );

  // ── Fleet stats ──────────────────────────────────────────────────────────────
  const {
    totalDrivers,
    activeDrivers,
    fleetUtilPct,
    totalDue,
    totalPaid,
    totalPending,
    settlementRate,
    avgTripsPerDriver,
  } = useMemo(() => {
    const totalDrivers = rows.length;
    const activeDrivers = rows.filter((r) => (r.trips ?? 0) > 0).length;
    const fleetUtilPct =
      totalDrivers > 0 ? Math.round((activeDrivers / totalDrivers) * 100) : 0;
    const totalDue = rows.reduce((s, r) => s + (r.due ?? 0), 0);
    const totalPaid = rows.reduce((s, r) => s + (r.paid ?? 0), 0);
    const totalPending = rows.reduce((s, r) => s + (r.pending ?? 0), 0);
    const settlementRate =
      totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
    const totalTrips = rows.reduce((s, r) => s + (r.trips ?? 0), 0);
    const avgTripsPerDriver =
      activeDrivers > 0 ? totalTrips / activeDrivers : 0;

    return {
      totalDrivers,
      activeDrivers,
      fleetUtilPct,
      totalDue,
      totalPaid,
      totalPending,
      settlementRate,
      totalTrips,
      avgTripsPerDriver,
    };
  }, [rows]);

  // ── KPI items ────────────────────────────────────────────────────────────────
  const kpiItems = useMemo(() => {
    const utilColor =
      fleetUtilPct >= 70
        ? Theme.darkGreen
        : fleetUtilPct >= 40
          ? Theme.warning
          : Theme.teslaRed;
    const settleColor =
      settlementRate >= 90
        ? Theme.darkGreen
        : settlementRate >= 50
          ? Theme.warning
          : Theme.teslaRed;
    return [
      {
        id: "fleet-size",
        label: "Fleet Size",
        value: String(totalDrivers),
        sub: "total drivers",
      },
      {
        id: "active",
        label: "Active Drivers",
        value: String(activeDrivers),
        sub: "have trips",
        accent: Theme.primary,
      },
      {
        id: "util",
        label: "Fleet Utilization",
        value: `${fleetUtilPct}%`,
        accent: utilColor,
      },
      {
        id: "outstanding",
        label: "Outstanding Balance",
        value: formatINRChip(totalPending),
        accent: totalPending > 0 ? Theme.teslaRed : Theme.darkGreen,
        alert: totalPending > 0,
      },
      {
        id: "due",
        label: "Total Earnings Due",
        value: formatINRChip(totalDue),
        accent: Theme.primary,
      },
      {
        id: "paid",
        label: "Total Paid Out",
        value: formatINRChip(totalPaid),
        accent: Theme.darkGreen,
      },
      {
        id: "settle-rate",
        label: "Settlement Rate",
        value: `${settlementRate}%`,
        accent: settleColor,
      },
      {
        id: "avg-trips",
        label: "Avg Trips / Driver",
        value: avgTripsPerDriver.toFixed(1),
        sub: "per active driver",
      },
    ];
  }, [
    totalDrivers,
    activeDrivers,
    fleetUtilPct,
    totalPending,
    totalDue,
    totalPaid,
    settlementRate,
    avgTripsPerDriver,
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

  // ── Earnings bar data ────────────────────────────────────────────────────────
  const earningsBarData = useMemo(
    () =>
      leaderboard.map((r) => ({
        id: r.id,
        label: r.name ?? r.id,
        value: r.due ?? 0,
        color: Theme.primary,
      })),
    [leaderboard],
  );

  // ── Settlement distribution ──────────────────────────────────────────────────
  const settlementDistData = useMemo(() => {
    const fullySettled = rows.filter((r) => (r.pending ?? 0) === 0).length;
    const partial = rows.filter(
      (r) => (r.pending ?? 0) > 0 && (r.paid ?? 0) > 0,
    ).length;
    const outstanding = rows.filter(
      (r) => (r.pending ?? 0) > 0 && (r.paid ?? 0) === 0,
    ).length;
    return [
      { id: "settled", label: "Fully Settled", value: fullySettled, color: Theme.darkGreen },
      { id: "partial", label: "Partial", value: partial, color: Theme.primary },
      { id: "outstanding", label: "Outstanding", value: outstanding, color: Theme.teslaRed },
    ];
  }, [rows]);

  // ── Performance tier data ────────────────────────────────────────────────────
  const tierData = useMemo(() => {
    const high = rows.filter((r) => (r.trips ?? 0) >= 10).length;
    const regular = rows.filter(
      (r) => (r.trips ?? 0) >= 1 && (r.trips ?? 0) < 10,
    ).length;
    const inactive = rows.filter((r) => (r.trips ?? 0) === 0).length;
    return [
      { id: "high", label: "High Activity", value: high, color: Theme.darkGreen },
      { id: "regular", label: "Regular", value: regular, color: Theme.primary },
      { id: "inactive", label: "Inactive", value: inactive, color: Theme.teslaRed },
    ];
  }, [rows]);

  // ── Rating snapshot ──────────────────────────────────────────────────────────
  const ratingData = useMemo(() => {
    const rated = rows.filter((r) => r.rating !== undefined);
    if (rated.length === 0) return null;
    const avgRating =
      rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length;
    const totalRatingCount = rated.reduce(
      (s, r) => s + (r.ratingCount ?? 0),
      0,
    );
    return { avgRating, ratedCount: rated.length, totalRatingCount };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <View style={emptyStyles.wrap}>
        <Text style={emptyStyles.icon}>🚚</Text>
        <Text style={emptyStyles.title}>No driver data available</Text>
        <Text style={emptyStyles.sub}>
          Fleet driver analytics will appear once drivers have been assigned
          trips or have earnings recorded.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        isDesktop && { alignSelf: "stretch", width: "100%" },
      ]}
    >
      {/* ── Context note ──────────────────────────────────────────────────── */}
      <Text style={styles.contextNote}>
        Fleet-wide analytics across all {totalDrivers} driver
        {totalDrivers !== 1 ? "s" : ""}
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

      {/* ── Settlement Health ring ─────────────────────────────────────────── */}
      <View style={{ marginTop: 18 }}>
        <SectionHeader
          title="Settlement Health"
          sub="Fleet-wide payment settlement rate"
        />
      </View>
      <View style={utilStyles.grid}>
        <View style={utilStyles.ringCard}>
          <View style={utilStyles.ringWrap}>
            <UtilizationRing
              pct={settlementRate}
              size={80}
              color={
                settlementRate >= 90
                  ? Theme.darkGreen
                  : settlementRate >= 50
                    ? Theme.warning
                    : Theme.teslaRed
              }
            />
            <View style={utilStyles.ringCenter}>
              <Text style={utilStyles.ringPct}>{settlementRate}%</Text>
            </View>
          </View>
          <Text style={utilStyles.ringLabel}>Settlement</Text>
          <Text style={utilStyles.ringSub}>Fleet-wide</Text>
        </View>
        <View style={utilStyles.statsCol}>
          <View style={utilStyles.statRow}>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Total Due</Text>
              <Text style={utilStyles.statValue}>{formatINRChip(totalDue)}</Text>
            </View>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Paid Out</Text>
              <Text style={utilStyles.statValue}>{formatINRChip(totalPaid)}</Text>
            </View>
          </View>
          <View style={utilStyles.divider} />
          <View style={utilStyles.statRow}>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Pending</Text>
              <Text
                style={[
                  utilStyles.statValue,
                  { color: totalPending > 0 ? Theme.teslaRed : Theme.darkGreen },
                ]}
              >
                {formatINRChip(totalPending)}
              </Text>
            </View>
            <View style={utilStyles.statItem}>
              <Text style={utilStyles.statLabel}>Active</Text>
              <Text style={utilStyles.statValue}>
                {activeDrivers}/{totalDrivers}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Driver Earnings Leaderboard ────────────────────────────────────── */}
      {leaderboard.length > 0 && (
        <>
          <View style={{ marginTop: 18 }}>
            <SectionHeader
              title="Earnings Leaderboard"
              sub="Top 10 drivers ranked by earnings due"
            />
          </View>
          <View style={sectionCardStyles.card}>
            <View style={lbStyles.row}>
              <Text style={[lbHeaderStyles.th, { width: 38 }]}>Rank</Text>
              <Text style={[lbHeaderStyles.th, { flex: 1 }]}>Driver</Text>
              <Text style={[lbHeaderStyles.th, { width: 52, textAlign: "right" }]}>
                Due
              </Text>
              <Text style={[lbHeaderStyles.th, { width: 52, textAlign: "right" }]}>
                Settled
              </Text>
              <Text style={[lbHeaderStyles.th, { width: 52, textAlign: "right" }]}>
                Pending
              </Text>
            </View>
            {leaderboard.map((row, i) => (
              <LeaderboardRow key={row.id} row={row} rank={i + 1} />
            ))}
          </View>

          <View style={{ marginTop: 18 }}>
            <SectionHeader
              title="Earnings Comparison"
              sub="Top drivers by earnings — bar shows total due"
            />
          </View>
          <ChartCard title="Earnings by Driver">
            <HBarChart items={earningsBarData} width={chartWidth} />
          </ChartCard>
        </>
      )}

      {/* ── Settlement Distribution ────────────────────────────────────────── */}
      <View style={{ marginTop: 18 }}>
        <SectionHeader
          title="Settlement Distribution"
          sub="Breakdown of driver payment settlement status"
        />
      </View>
      <ChartCard title="Settlement Buckets">
        <HBarChart items={settlementDistData} width={chartWidth} />
      </ChartCard>

      {/* ── Performance Tier ──────────────────────────────────────────────── */}
      <View style={{ marginTop: 18 }}>
        <SectionHeader
          title="Performance Tiers"
          sub="High ≥10 trips · Regular 1–9 trips · Inactive 0 trips"
        />
      </View>
      <ChartCard title="Driver Activity Tiers">
        <HBarChart items={tierData} width={chartWidth} />
      </ChartCard>

      {/* ── Rating Snapshot ───────────────────────────────────────────────── */}
      {ratingData !== null && (
        <>
          <View style={{ marginTop: 18 }}>
            <SectionHeader
              title="Rating Snapshot"
              sub="Average fleet rating from completed trips"
            />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard
              label="Avg Fleet Rating"
              value={`${ratingData.avgRating.toFixed(1)} / 5`}
              accent={
                ratingData.avgRating >= 4
                  ? Theme.darkGreen
                  : ratingData.avgRating >= 3
                    ? Theme.warning
                    : Theme.teslaRed
              }
            />
            <KpiCard
              label="Rated Drivers"
              value={String(ratingData.ratedCount)}
              sub={`of ${totalDrivers} total`}
              accent={Theme.primary}
            />
            {ratingData.totalRatingCount > 0 && (
              <KpiCard
                label="Total Reviews"
                value={String(ratingData.totalRatingCount)}
                sub="across fleet"
              />
            )}
          </View>
        </>
      )}

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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 0,
  },
  contextNote: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginBottom: 14,
  },
  kpiGrid: {
    gap: 8,
    marginBottom: 24,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
});
