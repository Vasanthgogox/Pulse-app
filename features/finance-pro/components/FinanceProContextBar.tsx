import { METRONIC } from "@/features/network/components/desktop/networkDesktopHub.styles";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function FinanceProContextBar({
  label,
  onClear,
}: {
  label: string | null;
  onClear: () => void;
}) {
  if (!label) return null;
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Pressable
        onPress={onClear}
        hitSlop={8}
        style={styles.chip}
        accessibilityRole="button"
        accessibilityLabel={`Clear ${label}`}
      >
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.x}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 44,
    borderRadius: 6,
    backgroundColor: "rgba(62, 151, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(62, 151, 255, 0.35)",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: METRONIC.link,
  },
  x: {
    fontSize: 12,
    fontWeight: "700",
    color: METRONIC.link,
    lineHeight: 14,
  },
});
