import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Theme from "@/constants/Theme";
import {
  complianceTabLabel,
  type ComplianceScope,
} from "@/features/business-pulse/lib/pulseComplianceScope.util";
import type { ExecutionScope } from "@/features/business-pulse/lib/pulseExecutionScope.util";
import type { ContributionSlice } from "@/features/business-pulse/selectors/pulseContributionSelectors";
import type { PulseComplianceState } from "@/features/business-pulse/types";

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
  complianceScope: ComplianceScope;
  onComplianceScope: (scope: ComplianceScope) => void;
  complianceSlices: ContributionSlice[];
};

export function PulseScopeTabRow({
  executionScope,
  onExecutionScope,
  complianceScope,
  onComplianceScope,
  complianceSlices,
}: Props) {
  const executionTabs: Array<{ key: ExecutionScope; label: string }> = [
    { key: "all", label: "All" },
    { key: "asset", label: "Asset" },
    { key: "aggregate", label: "Aggregate" },
  ];

  const complianceTabs: Array<{ key: ComplianceScope; label: string }> = [
    { key: "all", label: "Compliance all" },
    ...complianceSlices.map((slice) => ({
      key: slice.key as PulseComplianceState,
      label: complianceTabLabel(slice.key as PulseComplianceState, slice.sharePct),
    })),
  ];

  const { width } = useWindowDimensions();
  const stacked = width < 560;

  const renderChipLane = (
    label: string,
    tabs: Array<{ key: string; label: string; active: boolean; onPress: () => void }>,
  ) => (
    <View style={[styles.lane, stacked && styles.laneStacked]}>
      <Text style={styles.groupLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        {tabs.map((tab) => (
          <TabChip
            key={tab.key}
            label={tab.label}
            active={tab.active}
            onPress={tab.onPress}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.wrap, stacked && styles.wrapStacked]}>
      {renderChipLane(
        "Execution",
        executionTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          active: executionScope === tab.key,
          onPress: () => onExecutionScope(tab.key),
        })),
      )}
      {!stacked ? <View style={styles.divider} /> : null}
      {renderChipLane(
        "Compliance",
        complianceTabs.map((tab) => ({
          key: String(tab.key),
          label: tab.key === "all" ? "All" : tab.label,
          active: complianceScope === tab.key,
          onPress: () => onComplianceScope(tab.key),
        })),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  wrapStacked: {
    flexDirection: "column",
    gap: 8,
  },
  lane: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  laneStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 4,
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
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: Theme.borderLight,
    marginVertical: 2,
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
