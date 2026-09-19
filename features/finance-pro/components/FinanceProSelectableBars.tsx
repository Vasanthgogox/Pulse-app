import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { formatFinanceChip } from "./financeProFormat";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function FinanceProSelectableBars({
  items,
  selectedId,
  onSelect,
}: {
  items: { id: string; label: string; value: number; caption?: string }[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <Text style={styles.empty}>Nothing to plot.</Text>;
  }
  return (
    <View>
      {items.map((item) => {
        const selected = selectedId === item.id;
        const widthPct = Math.max(2, (item.value / max) * 100);
        return (
          <Pressable
            key={item.id}
            onPress={() => onSelect?.(item.id)}
            style={[styles.row, selected && styles.rowSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${item.label} ${formatFinanceChip(item.value)}`}
          >
            <View style={styles.meta}>
              <Text style={styles.label} numberOfLines={1}>
                {item.label}
              </Text>
              {item.caption ? (
                <Text style={styles.caption} numberOfLines={1}>
                  {item.caption}
                </Text>
              ) : null}
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${widthPct}%` }]} />
            </View>
            <Text style={styles.value}>{formatFinanceChip(item.value)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  rowSelected: {
    backgroundColor: Theme.brandBlueWashSubtle,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  meta: {
    flex: 1.1,
    minWidth: 72,
    maxWidth: 180,
    flexShrink: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  caption: {
    fontSize: 11,
    color: Theme.textSecondary,
    marginTop: 1,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.surfaceGray,
    overflow: "hidden",
  },
  barFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.darkGreen,
  },
  value: {
    width: 72,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: Theme.textPrimary,
  },
  empty: {
    fontSize: 13,
    color: Theme.textSecondary,
    paddingVertical: 12,
  },
});
