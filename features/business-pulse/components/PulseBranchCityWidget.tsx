import { ScrollView, StyleSheet, Text, View } from "react-native";
import { MapPin } from "lucide-react-native";
import Theme from "@/constants/Theme";
import type { BranchCitySlice } from "@/features/business-pulse/selectors/pulseBranchSelectors";

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

type Props = {
  slices: BranchCitySlice[];
  subtitle?: string;
};

export function PulseBranchCityWidget({ slices, subtitle }: Props) {
  const maxRevenue = Math.max(...slices.map((slice) => slice.revenue), 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MapPin size={12} color={Theme.primary} />
        <Text style={styles.title}>Branch / city concentration</Text>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {slices.length === 0 ? (
        <Text style={styles.empty}>No pickup cities in the current scope.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lane}>
          {slices.map((slice) => {
            const widthPct = Math.max(8, (slice.revenue / maxRevenue) * 100);
            return (
              <View key={slice.key} style={styles.card}>
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
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 10, fontWeight: "800", color: Theme.textPrimaryDark },
  subtitle: { fontSize: 9, color: Theme.textMuted, marginTop: -4 },
  empty: { fontSize: 9, color: Theme.textMuted },
  lane: { gap: 8, paddingVertical: 2 },
  card: {
    width: 132,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    backgroundColor: Theme.whiteMuted,
    padding: 8,
    gap: 4,
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
