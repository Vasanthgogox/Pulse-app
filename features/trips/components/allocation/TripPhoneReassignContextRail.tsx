import { memo, useMemo } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pencil } from "lucide-react-native";

import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import type { ReassignFocus } from "@/features/trips/components/allocation/tripPhoneAssignmentWizardSteps";

function isPlaceholderDriverName(value: string | null | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return !v || v === "driver" || v === "—" || v === "-";
}

function formatDriverDisplayName(
  name: string | null | undefined,
  phone?: string | null,
): string {
  const n = (name ?? "").trim();
  if (n && !isPlaceholderDriverName(n)) return n;
  const ph = (phone ?? "").trim();
  if (ph) return ph;
  return "Name not set";
}

export type TripPhoneReassignContextRailProps = {
  tripLabel: string;
  driverName: string;
  driverPhone?: string | null;
  vehiclePlate: string;
  focus: ReassignFocus;
  onFocusChange: (focus: ReassignFocus) => void;
  /** Load current driver into the form to edit phone/name. */
  onEditCurrentDriver?: () => void;
  /** Load current vehicle into the form to edit plate. */
  onEditCurrentVehicle?: () => void;
  layout?: "rail" | "row";
  incomingDriverName?: string | null;
  incomingDriverPhone?: string | null;
  incomingVehiclePlate?: string | null;
};

function AssignmentCard({
  label,
  name,
  subtitle,
  entityType,
  selected,
  warn,
  actionLabel,
  onPress,
  compact,
}: {
  label: string;
  name: string;
  subtitle: string;
  entityType: "driver" | "vehicle";
  selected?: boolean;
  warn?: boolean;
  actionLabel: string;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        compact && styles.cardCompact,
        selected && styles.cardSelected,
        warn && styles.cardWarn,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel}. ${label}: ${name}`}
    >
      <PartyAvatar
        name={name}
        entityType={entityType}
        size={compact ? 28 : 36}
        shape="rounded"
      />
      <View style={styles.cardText}>
        <Text style={[styles.cardLabel, compact && styles.cardLabelCompact]}>
          {label}
        </Text>
        <Text
          style={[styles.cardName, compact && styles.cardNameCompact]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {compact ? null : (
          <Text style={styles.cardSub} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={[styles.cardAction, compact && styles.cardActionCompact]}>
        <Pencil
          size={compact ? 11 : 12}
          color={selected ? Theme.primary : Theme.textMuted}
        />
        {compact ? null : (
          <Text
            style={[
              styles.cardActionText,
              selected && styles.cardActionTextActive,
            ]}
          >
            {actionLabel}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export const TripPhoneReassignContextRail = memo(
  function TripPhoneReassignContextRail({
    tripLabel,
    driverName,
    driverPhone,
    vehiclePlate,
    focus,
    onFocusChange,
    onEditCurrentDriver,
    onEditCurrentVehicle,
    layout = "rail",
    incomingDriverName = null,
    incomingDriverPhone = null,
    incomingVehiclePlate = null,
  }: TripPhoneReassignContextRailProps) {
    const compact = layout === "row";
    const currentDriverLabel = formatDriverDisplayName(driverName, driverPhone);
    const currentDriverMissingName = isPlaceholderDriverName(driverName);
    const phoneTrim = (driverPhone ?? "").trim();

    const currentDriverSubtitle = currentDriverMissingName
      ? phoneTrim
        ? `${phoneTrim} · tap Edit to set name`
        : "No driver yet · tap Edit to assign"
      : phoneTrim || "Assigned on this trip";

    const vehicleSubtitle = vehiclePlate.trim()
      ? "Assigned on this trip · tap Edit to change"
      : "No vehicle · tap Edit to set";

    const incomingPreview = useMemo(() => {
      if (focus === "vehicle") {
        const plate = (incomingVehiclePlate ?? "").trim();
        return {
          label: "New vehicle",
          name: plate || "Waiting for plate…",
          sub: plate
            ? "Driver stays the same"
            : compact
              ? "Enter plate below"
              : "Enter plate on the right →",
          empty: !plate,
        };
      }
      const name = (incomingDriverName ?? "").trim();
      const phone = (incomingDriverPhone ?? "").trim();
      const hasName = name && !isPlaceholderDriverName(name);
      if (hasName) {
        return {
          label: "New driver",
          name,
          sub: phone || "Name set",
          empty: false,
        };
      }
      if (phone) {
        return {
          label: "New driver",
          name: phone,
          sub: "Name required on next step",
          empty: false,
        };
      }
      return {
        label: "New driver",
        name: "Waiting for phone…",
        sub: compact ? "Enter details below" : "Enter details on the right →",
        empty: true,
      };
    }, [
      compact,
      focus,
      incomingDriverName,
      incomingDriverPhone,
      incomingVehiclePlate,
    ]);

    const driverSelected = focus === "driver";
    const vehicleSelected = focus === "vehicle";

    const editDriver = () => {
      onFocusChange("driver");
      onEditCurrentDriver?.();
    };
    const editVehicle = () => {
      onFocusChange("vehicle");
      onEditCurrentVehicle?.();
    };

    const focusToggle = (
      <View style={[styles.focusToggle, compact && styles.focusToggleCompact]}>
        <Pressable
          style={[
            styles.focusChip,
            compact && styles.focusChipCompact,
            driverSelected && styles.focusChipActive,
          ]}
          onPress={() => {
            onFocusChange("driver");
            onEditCurrentDriver?.();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: driverSelected }}
        >
          <Text
            style={[
              styles.focusChipText,
              compact && styles.focusChipTextCompact,
              driverSelected && styles.focusChipTextActive,
            ]}
          >
            Edit driver
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.focusChip,
            compact && styles.focusChipCompact,
            vehicleSelected && styles.focusChipActive,
          ]}
          onPress={() => {
            onFocusChange("vehicle");
            onEditCurrentVehicle?.();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: vehicleSelected }}
        >
          <Text
            style={[
              styles.focusChipText,
              compact && styles.focusChipTextCompact,
              vehicleSelected && styles.focusChipTextActive,
            ]}
          >
            Edit vehicle
          </Text>
        </Pressable>
      </View>
    );

    const assignmentCards = compact ? (
      <View style={styles.cardRow}>
        <View style={styles.cardRowItem}>
          <AssignmentCard
            label="Driver"
            name={currentDriverLabel}
            subtitle={currentDriverSubtitle}
            entityType="driver"
            selected={driverSelected}
            warn={currentDriverMissingName}
            actionLabel="Edit"
            onPress={editDriver}
            compact
          />
        </View>
        <View style={styles.cardRowItem}>
          <AssignmentCard
            label="Vehicle"
            name={vehiclePlate.trim() || "—"}
            subtitle={vehicleSubtitle}
            entityType="vehicle"
            selected={vehicleSelected}
            actionLabel="Edit"
            onPress={editVehicle}
            compact
          />
        </View>
      </View>
    ) : (
      <>
        <AssignmentCard
          label="Driver"
          name={currentDriverLabel}
          subtitle={currentDriverSubtitle}
          entityType="driver"
          selected={driverSelected}
          warn={currentDriverMissingName}
          actionLabel="Edit"
          onPress={editDriver}
        />
        <AssignmentCard
          label="Vehicle"
          name={vehiclePlate.trim() || "—"}
          subtitle={vehicleSubtitle}
          entityType="vehicle"
          selected={vehicleSelected}
          actionLabel="Edit"
          onPress={editVehicle}
        />
      </>
    );

    const body = (
      <>
        {focusToggle}
        {compact ? null : <Text style={styles.listHeading}>On this trip</Text>}
        {assignmentCards}
        <View
          style={[
            styles.previewCard,
            compact && styles.previewCardCompact,
            incomingPreview.empty ? styles.previewEmpty : styles.previewFilled,
          ]}
        >
          <View style={styles.previewTextCol}>
            <Text
              style={[
                styles.previewLabel,
                compact && styles.previewLabelCompact,
              ]}
            >
              {incomingPreview.label}
            </Text>
            <Text
              style={[
                styles.previewName,
                compact && styles.previewNameCompact,
                incomingPreview.empty && styles.previewNamePlaceholder,
              ]}
              numberOfLines={1}
            >
              {incomingPreview.name}
            </Text>
          </View>
          <Text
            style={[styles.previewSub, compact && styles.previewSubCompact]}
            numberOfLines={1}
          >
            {incomingPreview.sub}
          </Text>
        </View>
        {compact ? null : (
          <Text style={styles.hint}>
            {driverSelected
              ? "Edit phone or name on the right, then Continue."
              : "Edit the vehicle number on the right, then Continue."}
          </Text>
        )}
      </>
    );

    if (layout === "row") {
      return (
        <View style={styles.rowWrap}>
          <Text style={styles.sectionLabel} numberOfLines={1}>
            Change assignment · {tripLabel}
          </Text>
          {body}
        </View>
      );
    }

    return (
      <View style={styles.rail}>
        <View style={styles.railHeader}>
          <Text style={styles.sectionLabel}>Change assignment</Text>
          <Text style={styles.tripHint} numberOfLines={1}>
            Trip {tripLabel}
          </Text>
        </View>
        <ScrollView
          style={styles.railScroll}
          contentContainerStyle={styles.railScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  rail: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    gap: 10,
  },
  railHeader: {
    gap: 4,
    width: "100%",
    flexShrink: 0,
  },
  railScroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  railScrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  rowWrap: {
    width: "100%",
    gap: 6,
    flexShrink: 0,
  },
  focusToggle: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
  },
  focusToggleCompact: {
    gap: 6,
  },
  focusChip: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    ...Platform.select({ web: { cursor: "pointer" as const }, default: {} }),
  },
  focusChipCompact: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  focusChipActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  focusChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  focusChipTextCompact: {
    fontSize: 11,
  },
  focusChipTextActive: {
    color: Theme.primary,
  },
  listHeading: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginTop: 4,
  },
  cardRow: {
    flexDirection: "row",
    gap: 6,
    width: "100%",
  },
  cardRowItem: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    ...Platform.select({ web: { cursor: "pointer" as const }, default: {} }),
  },
  cardCompact: {
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    minHeight: 44,
  },
  cardSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  cardWarn: {
    borderColor: Theme.warning,
    backgroundColor: Theme.warningMuted,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  cardLabelCompact: {
    fontSize: 8,
    letterSpacing: 0.3,
  },
  cardName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  cardNameCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  cardSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  cardAction: {
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  cardActionCompact: {
    paddingLeft: 2,
  },
  cardActionText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  cardActionTextActive: {
    color: Theme.primary,
  },
  previewCard: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 2,
  },
  previewCardCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  previewTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  previewEmpty: {
    borderColor: Theme.borderLight,
    borderStyle: "dashed",
    backgroundColor: Theme.surface,
  },
  previewFilled: {
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  previewLabelCompact: {
    fontSize: 8,
  },
  previewName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  previewNameCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  previewNamePlaceholder: {
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  previewSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  previewSubCompact: {
    marginTop: 0,
    fontSize: 10,
    flexShrink: 0,
    maxWidth: "42%",
    textAlign: "right",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
  tripHint: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  hint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 15,
    marginTop: 2,
  },
});
