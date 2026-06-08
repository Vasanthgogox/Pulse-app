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
  layout?: "scroll" | "grid";
  hideHeader?: boolean;
};

function CityAvatar({ label }: { label: string }) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length === 0
      ? "?"
      : parts.length === 1
        ? (parts[0]![0] ?? "?").toUpperCase()
        : ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

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
      <View style={styles.cardHead}>
        <CityAvatar label={slice.label} />
        <Text style={styles.city} numberOfLines={2}>
          {slice.label}
        </Text>
      </View>
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

export function PulseBranchCityWidget({
  slices,
  subtitle,
  layout = "scroll",
  hideHeader = false,
}: Props) {
  const { width } = useWindowDimensions();
  const maxRevenue = Math.max(...slices.map((slice) => slice.revenue), 1);
  const useGrid = layout === "grid" && width >= 720;
  const useGridMultiCol = useGrid && width >= 1100;
  const useVerticalStack = width < 480 && layout !== "grid";

  return (
    <View style={styles.wrap}>
      {!hideHeader ? (
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <MapPin size={14} color={Theme.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Branch / city concentration</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
      ) : null}
      {slices.length === 0 ? (
        <Text style={styles.empty}>No pickup cities in the current scope.</Text>
      ) : useVerticalStack ? (
        <View style={styles.stackLane}>
          {slices.map((slice) => (
            <CityTile key={slice.key} slice={slice} maxRevenue={maxRevenue} compact />
          ))}
        </View>
      ) : useGridMultiCol ? (
        <View style={styles.gridLane}>
          {slices.map((slice) => (
            <View key={slice.key} style={styles.gridCell}>
              <CityTile slice={slice} maxRevenue={maxRevenue} compact />
            </View>
          ))}
        </View>
      ) : useGrid ? (
        <View style={styles.stackLane}>
          {slices.map((slice) => (
            <CityTile key={slice.key} slice={slice} maxRevenue={maxRevenue} compact />
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
  wrap: { gap: 10, flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(79,70,229,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(79,70,229,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 10,
    color: Theme.textMuted,
    lineHeight: 14,
  },
  empty: { fontSize: 11, color: Theme.textMuted, paddingVertical: 8 },
  lane: { gap: 10, paddingVertical: 2 },
  stackLane: { gap: 8, paddingVertical: 2 },
  gridLane: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 2,
  },
  gridCell: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 148,
    maxWidth: "50%",
  },
  card: {
    width: 140,
    borderWidth: 1,
    borderColor: "#eff2f5",
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    padding: 10,
    gap: 8,
  },
  cardCompact: {
    width: "100%",
    minHeight: 108,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f4f9",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  city: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
    minWidth: 0,
  },
  barTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: Theme.primary,
  },
  revenue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#181C32",
    letterSpacing: -0.15,
  },
  meta: { fontSize: 9, color: Theme.textMuted, lineHeight: 13 },
});
