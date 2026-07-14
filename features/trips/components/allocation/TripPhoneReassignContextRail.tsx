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
}: {
  label: string;
  name: string;
  subtitle: string;
  entityType: "driver" | "vehicle";
  selected?: boolean;
  warn?: boolean;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        selected && styles.cardSelected,
        warn && styles.cardWarn,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${actionLabel}. ${label}: ${name}`}
    >
      <PartyAvatar name={name} entityType={entityType} size={36} shape="rounded" />
      <View style={styles.cardText}>
        <Text style={styles.cardLabel}>{label}</Text>
        <Text style={styles.cardName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.cardSub} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.cardAction}>
        <Pencil size={12} color={selected ? Theme.primary : Theme.textMuted} />
        <Text style={[styles.cardActionText, selected && styles.cardActionTextActive]}>
          {actionLabel}
        </Text>
      </View>
    </Pressable>
  );
}

export const TripPhoneReassignContextRail = memo(function TripPhoneReassignContextRail({
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
        sub: plate ? "Driver stays the same" : "Enter plate on the right →",
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
      sub: "Enter details on the right →",
      empty: true,
    };
  }, [focus, incomingDriverName, incomingDriverPhone, incomingVehiclePlate]);

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
    <View style={styles.focusToggle}>
      <Pressable
        style={[styles.focusChip, driverSelected && styles.focusChipActive]}
        onPress={() => {
          onFocusChange("driver");
          onEditCurrentDriver?.();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: driverSelected }}
      >
        <Text
          style={[styles.focusChipText, driverSelected && styles.focusChipTextActive]}
        >
          Edit driver
        </Text>
      </Pressable>
      <Pressable
        style={[styles.focusChip, vehicleSelected && styles.focusChipActive]}
        onPress={() => {
          onFocusChange("vehicle");
          onEditCurrentVehicle?.();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: vehicleSelected }}
      >
        <Text
          style={[styles.focusChipText, vehicleSelected && styles.focusChipTextActive]}
        >
          Edit vehicle
        </Text>
      </Pressable>
    </View>
  );

  const body = (
    <>
      {focusToggle}
      <Text style={styles.listHeading}>On this trip</Text>
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
      <Text style={styles.listHeading}>
        {focus === "vehicle" ? "Updating to" : "Saving as"}
      </Text>
      <View
        style={[
          styles.previewCard,
          incomingPreview.empty ? styles.previewEmpty : styles.previewFilled,
        ]}
      >
        <Text style={styles.previewLabel}>{incomingPreview.label}</Text>
        <Text
          style={[
            styles.previewName,
            incomingPreview.empty && styles.previewNamePlaceholder,
          ]}
          numberOfLines={1}
        >
          {incomingPreview.name}
        </Text>
        <Text style={styles.previewSub} numberOfLines={2}>
          {incomingPreview.sub}
        </Text>
      </View>
      <Text style={styles.hint}>
        {driverSelected
          ? "Edit phone or name on the right, then Continue."
          : "Edit the vehicle number on the right, then Continue."}
      </Text>
    </>
  );

  if (layout === "row") {
    return (
      <View style={styles.rowWrap}>
        <Text style={styles.sectionLabel}>Change assignment · Trip {tripLabel}</Text>
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
});

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
    marginBottom: 12,
    gap: 10,
  },
  focusToggle: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
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
  focusChipActive: {
    borderColor: Theme.primary,
    backgroundColor: Theme.surfaceLight,
  },
  focusChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
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
  cardName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
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
  previewName: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
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
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textMuted,
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
