import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { MapPin } from "lucide-react-native";
import Theme from "@/constants/Theme";
import type { BranchCitySlice } from "@/features/business-pulse/selectors/pulseBranchSelectors";

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

type Props = {
  slices: BranchCitySlice[];
  subtitle?: string;
  /** `grid` wraps city tiles on desktop; `scroll` keeps horizontal carousel. */
  layout?: "scroll" | "grid";
};

function CityTile({
  slice,
  maxRevenue,
  compact,
}: {
  slice: BranchCitySlice;
  maxRevenue: number;
  compact?: boolean;
}) {
  const widthPct = Math.max(8, (slice.revenue / maxRevenue) * 100);
  return (
    <View style={[styles.card, compact ? styles.cardCompact : null]}>
      <Text style={styles.city} numberOfLines={2}>
        {slice.label}
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${widthPct}%` }]} />
      </View>
      <Text style={styles.revenue}>{inr(slice.revenue)}</Text>
      <Text style={styles.meta}>
        {slice.trips} trips · {slice.sharePct}% · P&L {inr(slice.margin)}
      </Text>
    </View>
  );
}

export function PulseBranchCityWidget({ slices, subtitle, layout = "scroll" }: Props) {
  const { width } = useWindowDimensions();
  const maxRevenue = Math.max(...slices.map((slice) => slice.revenue), 1);
  const useGrid = layout === "grid" && width >= 1024;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MapPin size={12} color={Theme.primary} />
        <Text style={styles.title}>Branch / city concentration</Text>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {slices.length === 0 ? (
        <Text style={styles.empty}>No pickup cities in the current scope.</Text>
      ) : useGrid ? (
        <View style={styles.gridLane}>
          {slices.map((slice) => (
            <View key={slice.key} style={styles.gridCell}>
              <CityTile slice={slice} maxRevenue={maxRevenue} compact />
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lane}>
          {slices.map((slice) => (
            <CityTile key={slice.key} slice={slice} maxRevenue={maxRevenue} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 10, fontWeight: "800", color: Theme.textPrimaryDark },
  subtitle: { fontSize: 9, color: Theme.textMuted, marginTop: -4 },
  empty: { fontSize: 9, color: Theme.textMuted },
  lane: { gap: 8, paddingVertical: 2 },
  gridLane: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 2,
  },
  gridCell: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 148,
    maxWidth: "33.333%",
  },
  card: {
    width: 132,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.whiteMuted,
    padding: 8,
    gap: 4,
  },
  cardCompact: {
    width: "100%",
    minHeight: 96,
  },
  city: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    minHeight: 28,
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: Theme.primary,
    borderRadius: 999,
  },
  revenue: { fontSize: 11, fontWeight: "800", color: Theme.text },
  meta: { fontSize: 8, color: Theme.textMuted, lineHeight: 12 },
});
