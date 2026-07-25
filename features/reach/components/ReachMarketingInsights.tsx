/**
 * Marketing Insights panel — fleet mix from real campaigns + illustrative
 * impression bars (relative heights for the selected timeframe UI only).
 * No CTR/CPM; no invented conversion rates.
 */
import Theme from "@/constants/Theme";
import type { ReachCampaignRow } from "@/features/reach/services/campaigns.service";
import { ArrowUpRight, BarChart3 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Timeframe = "24h" | "7d" | "30d";

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "24h", label: "24 Hours" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
];

const CHART: Record<Timeframe, { labels: string[]; values: number[]; trend: string }> = {
  "24h": {
    labels: ["12a", "4a", "8a", "12p", "4p", "8p"],
    values: [12, 8, 35, 55, 80, 48],
    trend: "Peak mid-day",
  },
  "7d": {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    values: [35, 50, 40, 75, 95, 60, 30],
    trend: "Week pattern",
  },
  "30d": {
    labels: ["W1", "W2", "W3", "W4"],
    values: [45, 60, 78, 90],
    trend: "Month pattern",
  },
};

interface ReachMarketingInsightsProps {
  campaigns: ReachCampaignRow[];
}

export function ReachMarketingInsights({ campaigns }: ReachMarketingInsightsProps) {
  const [tf, setTf] = useState<Timeframe>("7d");
  const chart = CHART[tf];
  const maxVal = Math.max(...chart.values, 1);

  const fleets = useMemo(() => {
    const fleetMap = new Map<string, number>();
    for (const c of campaigns) {
      const vt = c.snapshot_vehicle_type?.trim();
      if (vt) fleetMap.set(vt, (fleetMap.get(vt) ?? 0) + 1);
    }
    const total = [...fleetMap.values()].reduce((s, n) => s + n, 0) || 1;
    return [...fleetMap.entries()]
      .map(([label, count]) => ({ label, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);
  }, [campaigns]);

  const fleetColors = [Theme.textPrimaryDark, Theme.primary, Theme.accentGoldPressed];

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <BarChart3 size={12} color={Theme.primary} />
          </View>
          <Text style={styles.title}>Marketing Insights</Text>
        </View>
        <View style={styles.liveBadge}>
          <Text style={styles.liveBadgeText}>Live Analytics</Text>
        </View>
      </View>

      <View style={styles.tfRow}>
        {TIMEFRAMES.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTf(t.key)}
            style={[styles.tfBtn, tf === t.key && styles.tfBtnActive]}
          >
            <Text style={[styles.tfText, tf === t.key && styles.tfTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>Driver Impressions</Text>
          <View style={styles.trendRow}>
            <ArrowUpRight size={10} color={Theme.success} />
            <Text style={styles.trendText}>{chart.trend}</Text>
          </View>
        </View>
        <View style={styles.chartBox}>
          <View style={styles.bars}>
            {chart.values.map((v, i) => {
              const h = Math.max(8, Math.round((v / maxVal) * 72));
              const isPeak = v === maxVal;
              return (
                <View key={chart.labels[i]} style={styles.barCol}>
                  <View
                    style={[
                      styles.bar,
                      { height: h },
                      isPeak ? styles.barPeak : styles.barIdle,
                    ]}
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.dayRow}>
            {chart.labels.map((l) => (
              <Text key={l} style={styles.dayLabel}>{l}</Text>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.section, styles.sectionBorder]}>
        <Text style={styles.sectionLabel}>Driver Fleet Reach</Text>
        {fleets.length === 0 ? (
          <Text style={styles.emptyHint}>Vehicle mix appears once campaigns run.</Text>
        ) : (
          fleets.map((f, i) => (
            <View key={f.label} style={styles.fleetBlock}>
              <View style={styles.fleetLabelRow}>
                <Text style={styles.fleetLabel} numberOfLines={1}>{f.label}</Text>
                <Text style={styles.fleetPct}>{f.pct}%</Text>
              </View>
              <View style={styles.fleetTrack}>
                <View
                  style={[
                    styles.fleetFill,
                    { width: `${f.pct}%`, backgroundColor: fleetColors[i % fleetColors.length] },
                  ]}
                />
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.networkCardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.networkCardBorder,
    padding: 16,
    gap: 14,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: Theme.brandBlueWash,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 10,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  liveBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.networkHubListCardConnectedBorder,
  },
  liveBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.success,
    textTransform: "uppercase",
  },
  tfRow: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  tfBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center" },
  tfBtnActive: { backgroundColor: Theme.cardWhite },
  tfText: { fontSize: 9, fontWeight: "700", color: Theme.textMuted },
  tfTextActive: { color: Theme.textPrimaryDark },
  section: { gap: 8 },
  sectionBorder: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.networkSectionLabel,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  trendText: { fontSize: 9, fontWeight: "700", color: Theme.success },
  chartBox: {
    backgroundColor: Theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 10,
    gap: 6,
  },
  bars: { height: 80, flexDirection: "row", alignItems: "flex-end", gap: 5, paddingTop: 8 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "100%", borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barPeak: { backgroundColor: Theme.primary },
  barIdle: { backgroundColor: Theme.borderMedium },
  dayRow: { flexDirection: "row", justifyContent: "space-between" },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  emptyHint: { fontSize: 10, fontWeight: "500", color: Theme.textMuted },
  fleetBlock: { gap: 4 },
  fleetLabelRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  fleetLabel: { flex: 1, fontSize: 10, fontWeight: "500", color: Theme.textSecondary },
  fleetPct: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  fleetTrack: { height: 5, borderRadius: 999, backgroundColor: Theme.surface, overflow: "hidden" },
  fleetFill: { height: "100%", borderRadius: 999 },
});
