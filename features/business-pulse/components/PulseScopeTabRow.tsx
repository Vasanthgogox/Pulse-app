import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import type { ExecutionScope } from "@/features/business-pulse/lib/pulseExecutionScope.util";

type TabChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function TabChip({ label, active, onPress }: TabChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabChip, active && styles.tabChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabChipText, active && styles.tabChipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

type Props = {
  executionScope: ExecutionScope;
  onExecutionScope: (scope: ExecutionScope) => void;
};

export function PulseScopeTabRow({ executionScope, onExecutionScope }: Props) {
  const executionTabs: Array<{ key: ExecutionScope; label: string }> = [
    { key: "all", label: "All" },
    { key: "asset", label: "Asset" },
    { key: "aggregate", label: "Aggregate" },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.groupLabel}>Execution</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {executionTabs.map((tab) => (
          <TabChip
            key={tab.key}
            label={tab.label}
            active={executionScope === tab.key}
            onPress={() => onExecutionScope(tab.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    width: 72,
    flexShrink: 0,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 4,
    flexGrow: 1,
  },
  tabChip: {
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Theme.surface,
  },
  tabChipActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  tabChipText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.text,
  },
  tabChipTextActive: {
    color: "#fff",
  },
});
