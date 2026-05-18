import Theme from "@/constants/Theme";
import { LayoutGrid, List } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

export type NetworkViewLayout = "grid" | "list";

export function NetworkViewLayoutToggle({
  value,
  onChange,
}: {
  value: NetworkViewLayout;
  onChange: (next: NetworkViewLayout) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => onChange("list")}
        style={({ pressed }) => [
          styles.btn,
          value === "list" && styles.btnOn,
          pressed && { opacity: 0.88 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="List view"
        accessibilityState={{ selected: value === "list" }}
      >
        <List
          size={14}
          color={value === "list" ? Theme.textOnPrimary : Theme.textSecondary}
          strokeWidth={2.4}
        />
      </Pressable>
      <Pressable
        onPress={() => onChange("grid")}
        style={({ pressed }) => [
          styles.btn,
          value === "grid" && styles.btnOn,
          pressed && { opacity: 0.88 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Grid view"
        accessibilityState={{ selected: value === "grid" }}
      >
        <LayoutGrid
          size={14}
          color={value === "grid" ? Theme.textOnPrimary : Theme.textSecondary}
          strokeWidth={2.4}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    padding: 2,
    gap: 2,
    flexShrink: 0,
  },
  btn: {
    width: 30,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOn: {
    backgroundColor: Theme.textPrimaryDark,
  },
});
