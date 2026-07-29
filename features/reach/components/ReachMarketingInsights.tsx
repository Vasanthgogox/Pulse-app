/**
 * Marketing Insights panel — fleet mix from real campaigns + illustrative
 * impression bars (relative heights for the selected timeframe UI only).
 * No CTR/CPM; no invented conversion rates.
 */
import Theme from "@/constants/Theme";
import { REACH_M } from "@/features/reach/styles/reachMetronic";
import type { ReachCampaignRow } from "@/features/reach/services/campaigns.service";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Timeframe = "24h" | "7d" | "30d";

const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
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

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Insights</Text>
        <View style={styles.tfRow}>
          {TIMEFRAMES.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTf(t.key)}
              style={[styles.tfBtn, tf === t.key && styles.tfBtnActive]}
            >
              <Text style={[styles.tfText, tf === t.key && styles.tfTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>Impressions</Text>
          <Text style={styles.trendText}>{chart.trend}</Text>
        </View>
        <View style={styles.chartBox}>
          <View style={styles.bars}>
            {chart.values.map((v, i) => {
              const h = Math.max(6, Math.round((v / maxVal) * 64));
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
              <Text key={l} style={styles.dayLabel}>
                {l}
              </Text>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.section, styles.sectionBorder]}>
        <Text style={styles.sectionLabel}>Audience mix</Text>
        {fleets.length === 0 ? (
          <Text style={styles.emptyHint}>Vehicle mix appears once campaigns run.</Text>
        ) : (
          fleets.map((f) => (
            <View key={f.label} style={styles.fleetBlock}>
              <View style={styles.fleetLabelRow}>
                <Text style={styles.fleetLabel} numberOfLines={1}>
                  {f.label}
                </Text>
                <Text style={styles.fleetPct}>{f.pct}%</Text>
              </View>
              <View style={styles.fleetTrack}>
                <View style={[styles.fleetFill, { width: `${f.pct}%` }]} />
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
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: REACH_M.border,
    padding: 14,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  tfRow: {
    flexDirection: "row",
    backgroundColor: Theme.surface,
    borderRadius: 6,
    padding: 2,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  tfBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  tfBtnActive: { backgroundColor: Theme.cardWhite },
  tfText: { fontSize: 11, fontWeight: "600", color: Theme.textMuted },
  tfTextActive: { color: Theme.textPrimaryDark, fontWeight: "700" },
  section: { gap: 8 },
  sectionBorder: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  trendText: { fontSize: 11, fontWeight: "500", color: Theme.textRouteCard },
  chartBox: {
    backgroundColor: Theme.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 10,
    gap: 6,
  },
  bars: {
    height: 72,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    paddingTop: 4,
  },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "100%", borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  barPeak: { backgroundColor: REACH_M.primary },
  barIdle: { backgroundColor: Theme.borderMedium },
  dayRow: { flexDirection: "row", justifyContent: "space-between" },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  emptyHint: { fontSize: 11, fontWeight: "500", color: Theme.textMuted },
  fleetBlock: { gap: 4 },
  fleetLabelRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  fleetLabel: { flex: 1, fontSize: 11, fontWeight: "500", color: Theme.textRouteCard },
  fleetPct: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  fleetTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.surface,
    overflow: "hidden",
  },
  fleetFill: { height: "100%", borderRadius: 2, backgroundColor: REACH_M.primary },
});
