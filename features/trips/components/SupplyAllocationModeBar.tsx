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
  /** When set, only these modes are selectable (asset-only / aggregate-only RBAC). */
  allowedModes?: readonly SupplyAllocationMode[];
  /** Show Asset / Aggregate toggle (default true). */
  showModeToggle?: boolean;
  /** Show Assign later row (default true). */
  showAssignLater?: boolean;
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
  allowedModes = ["asset", "aggregate"],
  showModeToggle: showModeToggleProp = true,
  showAssignLater = true,
}: SupplyAllocationModeBarProps) {
  const isAsset = mode === "asset";
  const isInline = layout === "inline";
  const isWizard = variant === "wizard";
  const showAsset = allowedModes.includes("asset");
  const showAggregate = allowedModes.includes("aggregate");
  const canToggleModes = showAsset && showAggregate;

  /** Single-mode orgs: show affirmative label (own fleet / partner) — not a locked toggle. */
  const singleModeBanner =
    showModeToggleProp && !canToggleModes && (showAsset || showAggregate) ? (
      <View
        style={[
          isWizard ? fullPageWizardStyles.modeRow : assignmentShellStyles.supplySegmentSection,
          isInline && (isWizard ? styles.modeRowInline : styles.supplySegmentSectionInline),
        ]}
      >
        <View
          style={
            isWizard
              ? [fullPageWizardStyles.modeChip, fullPageWizardStyles.modeChipActive, isInline && styles.modeChipInline]
              : [assignmentShellStyles.supplySegBtn, assignmentShellStyles.supplySegBtnActive]
          }
        >
          <View style={styles.wizardChipInner}>
            {showAsset ? (
              <Truck size={isWizard ? 13 : 14} color={isWizard ? Theme.primary : "#ffffff"} />
            ) : (
              <Building2 size={isWizard ? 13 : 14} color={isWizard ? Theme.primary : "#ffffff"} />
            )}
            <Text
              style={
                isWizard
                  ? [fullPageWizardStyles.modeChipText, fullPageWizardStyles.modeChipTextActive]
                  : [assignmentShellStyles.supplySegBtnText, assignmentShellStyles.supplySegBtnTextActive]
              }
            >
              {showAsset ? "Own fleet" : "Partner fleet"}
            </Text>
          </View>
        </View>
      </View>
    ) : null;

  const segmentPill = !canToggleModes
    ? singleModeBanner
    : isWizard ? (
    <View
      style={[
        fullPageWizardStyles.modeRow,
        isInline && styles.modeRowInline,
      ]}
    >
      <Pressable
        style={[
          fullPageWizardStyles.modeChip,
          isInline && styles.modeChipInline,
          isAsset && fullPageWizardStyles.modeChipActive,
        ]}
        onPress={() => onModeChange("asset")}
        accessibilityRole="button"
        accessibilityState={{ selected: isAsset }}
      >
        <View style={styles.wizardChipInner}>
          <Truck
            size={15}
            color={isAsset ? Theme.textPrimaryDark : Theme.textMuted}
            strokeWidth={2.25}
          />
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
          isInline && styles.modeChipInline,
          !isAsset && fullPageWizardStyles.modeChipActive,
        ]}
        onPress={() => onModeChange("aggregate")}
        accessibilityRole="button"
        accessibilityState={{ selected: !isAsset }}
      >
        <View style={styles.wizardChipInner}>
          <Building2
            size={15}
            color={!isAsset ? Theme.textPrimaryDark : Theme.textMuted}
            strokeWidth={2.25}
          />
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
        fullPageWizardStyles.shipperMarkCardFlat,
        isInline && styles.assignLaterInlineCard,
        assignLaterDisabled && styles.assignLaterDisabled,
      ]}
    >
      <View style={styles.wizardAssignLaterRow}>
        <View style={styles.wizardAssignLaterIcon}>
          <ListChecks size={16} color={Theme.textPrimaryDark} />
        </View>
        <View style={fullPageWizardStyles.partyTextWrap}>
          <Text style={fullPageWizardStyles.partyName} numberOfLines={1}>
            Assign later
          </Text>
          <Text style={fullPageWizardStyles.blockMeta} numberOfLines={1}>
            {isAsset
              ? "Pick vehicle & driver on trip detail"
              : "Add vehicle & driver phone on trip detail"}
          </Text>
        </View>
        <Switch
          value={assignLater}
          onValueChange={onAssignLaterChange}
          disabled={assignLaterDisabled}
          trackColor={{ false: Theme.borderLight, true: Theme.textPrimaryDark }}
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
        {showModeToggleProp ? segmentPill : null}
        {showAssignLater ? assignLaterRow : null}
      </View>
    );
  }

  return (
    <View style={isWizard ? styles.wizardStack : undefined}>
      {showModeToggleProp ? segmentPill : null}
      {showAssignLater ? assignLaterRow : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wizardStack: {
    gap: 12,
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
  modeRowInline: {
    width: "auto",
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "center",
  },
  modeChipInline: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    paddingHorizontal: 14,
  },
  assignLaterInlineCard: {
    flex: 1,
    minWidth: 0,
    maxWidth: 440,
    marginLeft: "auto",
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
