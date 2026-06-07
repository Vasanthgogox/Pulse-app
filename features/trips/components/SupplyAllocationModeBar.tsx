import Theme from "@/constants/Theme";
import {
  assignmentShellColors,
  assignmentShellStyles,
} from "@/features/trips/styles/assignmentShellShared";
import { Building2, ListChecks, Truck } from "lucide-react-native";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";

export type SupplyAllocationMode = "asset" | "aggregate";

export type SupplyAllocationModeBarProps = {
  mode: SupplyAllocationMode;
  onModeChange: (mode: SupplyAllocationMode) => void;
  assignLater: boolean;
  onAssignLaterChange: (value: boolean) => void;
  assignLaterDisabled?: boolean;
  compact?: boolean;
  /** stack: segment above assign-later; inline: one row (desktop). */
  layout?: "stack" | "inline";
};

export function SupplyAllocationModeBar({
  mode,
  onModeChange,
  assignLater,
  onAssignLaterChange,
  assignLaterDisabled = false,
  compact = false,
  layout = "stack",
}: SupplyAllocationModeBarProps) {
  const isAsset = mode === "asset";
  const isInline = layout === "inline";

  const segmentPill = (
    <View
      style={[
        assignmentShellStyles.supplySegmentSection,
        isInline && styles.supplySegmentSectionInline,
      ]}
    >
      <View style={assignmentShellStyles.supplySegmentPill}>
        <TouchableOpacity
          style={[
            assignmentShellStyles.supplySegBtn,
            isAsset && assignmentShellStyles.supplySegBtnActive,
          ]}
          onPress={() => onModeChange("asset")}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityState={{ selected: isAsset }}
        >
          <Truck size={14} color={isAsset ? "#ffffff" : "#94a3b8"} />
          <Text
            style={[
              assignmentShellStyles.supplySegBtnText,
              isAsset && assignmentShellStyles.supplySegBtnTextActive,
            ]}
          >
            Asset
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            assignmentShellStyles.supplySegBtn,
            !isAsset && assignmentShellStyles.supplySegBtnActive,
          ]}
          onPress={() => onModeChange("aggregate")}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityState={{ selected: !isAsset }}
        >
          <Building2 size={14} color={!isAsset ? "#ffffff" : "#94a3b8"} />
          <Text
            style={[
              assignmentShellStyles.supplySegBtnText,
              !isAsset && assignmentShellStyles.supplySegBtnTextActive,
            ]}
          >
            Aggregate
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const assignLaterRow = (
    <View
      style={[
        assignmentShellStyles.supplyAssignLaterOuter,
        compact && assignmentShellStyles.supplyAssignLaterOuterCompact,
        isInline && styles.supplyAssignLaterInline,
        assignLaterDisabled && styles.assignLaterDisabled,
      ]}
    >
      <View style={assignmentShellStyles.supplyAssignLaterLeft}>
        <View style={assignmentShellStyles.supplyAssignLaterIconWrap}>
          <ListChecks size={18} color={Theme.textSecondary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={assignmentShellStyles.supplyAssignLaterTitle}>
            Assign later
          </Text>
          <Text style={assignmentShellStyles.supplyAssignLaterSub}>
            {isAsset
              ? "(vehicle & driver from trip detail)"
              : "(vehicle & driver phone from trip detail)"}
          </Text>
        </View>
      </View>
      <Switch
        value={assignLater}
        onValueChange={onAssignLaterChange}
        disabled={assignLaterDisabled}
        trackColor={{
          false: "#e2e8f0",
          true: assignmentShellColors.title,
        }}
        thumbColor="#ffffff"
      />
    </View>
  );

  if (isInline) {
    return (
      <View style={styles.supplyModeRowInline}>
        {segmentPill}
        {assignLaterRow}
      </View>
    );
  }

  return (
    <>
      {segmentPill}
      {assignLaterRow}
    </>
  );
}

const styles = StyleSheet.create({
  assignLaterDisabled: {
    opacity: 0.65,
  },
  supplyModeRowInline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
    width: "100%",
    minWidth: 0,
    flexWrap: "nowrap",
  },
  supplySegmentSectionInline: {
    alignItems: "flex-start",
    marginBottom: 0,
    flexShrink: 0,
    width: "auto",
  },
  supplyAssignLaterInline: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
    maxWidth: 420,
    marginLeft: "auto",
  },
});
