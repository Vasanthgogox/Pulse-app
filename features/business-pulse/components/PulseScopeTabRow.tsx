import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { ExecutionScope } from "@/features/business-pulse/lib/pulseExecutionScope.util";
import { pulseEnterpriseStyles as ent } from "@/features/business-pulse/components/pulseEnterpriseStyles";

type TabChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function TabChip({ label, active, onPress }: TabChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[ent.filterChip, active && ent.filterChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[ent.filterChipText, active && ent.filterChipTextActive]} numberOfLines={1}>
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
      <Text style={ent.filterRowLabel}>Execution</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={ent.filterTrack}
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
  scroll: {
    flex: 1,
    minWidth: 0,
  },
});
