import Theme from "@/constants/Theme";
import { fullPageWizardStyles } from "@/components/full-page-wizard";
import {
  assignmentShellColors,
  assignmentShellStyles,
} from "@/features/trips/styles/assignmentShellShared";
import { Building2, ListChecks, Truck } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
  /** Light wizard chips — matches attribution / create trip. */
  variant?: "classic" | "wizard";
};

export function SupplyAllocationModeBar({
  mode,
  onModeChange,
  assignLater,
  onAssignLaterChange,
  assignLaterDisabled = false,
  compact = false,
  layout = "stack",
  variant = "classic",
}: SupplyAllocationModeBarProps) {
  const isAsset = mode === "asset";
  const isInline = layout === "inline";
  const isWizard = variant === "wizard";

  const segmentPill = isWizard ? (
    <View style={fullPageWizardStyles.modeRow}>
      <Pressable
        style={[
          fullPageWizardStyles.modeChip,
          isAsset && fullPageWizardStyles.modeChipActive,
        ]}
        onPress={() => onModeChange("asset")}
        accessibilityRole="button"
        accessibilityState={{ selected: isAsset }}
      >
        <View style={styles.wizardChipInner}>
          <Truck size={13} color={isAsset ? Theme.primary : Theme.textMuted} />
          <Text
            style={[
              fullPageWizardStyles.modeChipText,
              isAsset && fullPageWizardStyles.modeChipTextActive,
            ]}
          >
            Asset
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={[
          fullPageWizardStyles.modeChip,
          !isAsset && fullPageWizardStyles.modeChipActive,
        ]}
        onPress={() => onModeChange("aggregate")}
        accessibilityRole="button"
        accessibilityState={{ selected: !isAsset }}
      >
        <View style={styles.wizardChipInner}>
          <Building2 size={13} color={!isAsset ? Theme.primary : Theme.textMuted} />
          <Text
            style={[
              fullPageWizardStyles.modeChipText,
              !isAsset && fullPageWizardStyles.modeChipTextActive,
            ]}
          >
            Aggregate
          </Text>
        </View>
      </Pressable>
    </View>
  ) : (
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

  const assignLaterRow = isWizard ? (
    <View
      style={[
        fullPageWizardStyles.shipperMarkCard,
        assignLaterDisabled && styles.assignLaterDisabled,
      ]}
    >
      <View style={styles.wizardAssignLaterRow}>
        <View style={styles.wizardAssignLaterIcon}>
          <ListChecks size={16} color={Theme.primary} />
        </View>
        <View style={fullPageWizardStyles.partyTextWrap}>
          <Text style={fullPageWizardStyles.partyName}>Assign later</Text>
          <Text style={fullPageWizardStyles.blockMeta} numberOfLines={2}>
            {isAsset
              ? "Pick vehicle & driver on trip detail"
              : "Add vehicle & driver phone on trip detail"}
          </Text>
        </View>
        <Switch
          value={assignLater}
          onValueChange={onAssignLaterChange}
          disabled={assignLaterDisabled}
          trackColor={{ false: Theme.borderLight, true: Theme.primary }}
          thumbColor="#ffffff"
        />
      </View>
    </View>
  ) : (
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
    <View style={isWizard ? styles.wizardStack : undefined}>
      {segmentPill}
      {assignLaterRow}
    </View>
  );
}

const styles = StyleSheet.create({
  wizardStack: {
    gap: 10,
    width: "100%",
  },
  wizardChipInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  wizardAssignLaterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  wizardAssignLaterIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Theme.screenBackground,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
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
