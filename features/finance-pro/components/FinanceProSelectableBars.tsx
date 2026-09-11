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
    minHeight: 44,
    paddingVertical: 6,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EFF2F5",
  },
  rowSelected: {
    backgroundColor: Theme.brandBlueWashSubtle,
  },
  meta: {
    flex: 1.1,
    minWidth: 72,
    maxWidth: 160,
    flexShrink: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#181C32",
  },
  caption: {
    fontSize: 11,
    color: "#78829D",
    marginTop: 1,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F1F1F4",
    overflow: "hidden",
  },
  barFill: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.primary,
  },
  value: {
    width: 64,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: "#181C32",
  },
  empty: {
    fontSize: 13,
    color: "#78829D",
    paddingVertical: 12,
  },
});
