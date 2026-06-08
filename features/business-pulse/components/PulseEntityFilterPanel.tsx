import { Pressable, StyleSheet, Text, View } from "react-native";
import { X } from "lucide-react-native";

import { PulsePartyAvatar } from "@/features/business-pulse/components/PulsePartyAvatar";
import Theme from "@/constants/Theme";
import type { PulseScopeIntelRow } from "@/features/business-pulse/components/PulseScopeIntelCard";
import {
  pulsePartyForRoute,
  type PulsePartyMaps,
  type PulsePartyProfile,
} from "@/features/business-pulse/lib/pulsePartyAvatars.util";
import type { PulseFilterState } from "@/features/business-pulse/types";

type ToggleFilterKey = Exclude<keyof PulseFilterState, "dateRange">;

type FilterChip = {
  key: ToggleFilterKey;
  id: string;
  label: string;
  party: PulsePartyProfile;
};

type Props = {
  filters: PulseFilterState;
  partyMaps: PulsePartyMaps;
  clientNames: Map<string, string>;
  supplierNames: Map<string, string>;
  driverNames: Map<string, string>;
  vehicleLabels: Map<string, string>;
  executionLabel?: string;
  onToggle: (key: ToggleFilterKey, value: string) => void;
  onClearAll?: () => void;
};

function buildFilterChips(
  filters: PulseFilterState,
  partyMaps: PulsePartyMaps,
  names: {
    clientNames: Map<string, string>;
    supplierNames: Map<string, string>;
    driverNames: Map<string, string>;
    vehicleLabels: Map<string, string>;
  },
): FilterChip[] {
  const chips: FilterChip[] = [];

  for (const id of filters.clientIds) {
    const party = partyMaps.clients.get(id);
    chips.push({
      key: "clientIds",
      id,
      label: party?.name ?? names.clientNames.get(id) ?? "Client",
      party: party ?? { name: names.clientNames.get(id) ?? "Client", entityType: "client", avatarSeed: id },
    });
  }
  for (const id of filters.supplierIds) {
    const party = partyMaps.suppliers.get(id);
    chips.push({
      key: "supplierIds",
      id,
      label: party?.name ?? names.supplierNames.get(id) ?? "Supplier",
      party: party ?? { name: names.supplierNames.get(id) ?? "Supplier", entityType: "supplier", avatarSeed: id },
    });
  }
  for (const id of filters.driverIds) {
    const party = partyMaps.drivers.get(id);
    chips.push({
      key: "driverIds",
      id,
      label: party?.name ?? names.driverNames.get(id) ?? "Driver",
      party: party ?? { name: names.driverNames.get(id) ?? "Driver", entityType: "driver", avatarSeed: id },
    });
  }
  for (const id of filters.vehicleIds) {
    const party = partyMaps.vehicles.get(id);
    chips.push({
      key: "vehicleIds",
      id,
      label: party?.name ?? names.vehicleLabels.get(id) ?? "Vehicle",
      party: party ?? { name: names.vehicleLabels.get(id) ?? "Vehicle", entityType: "vehicle", avatarSeed: id },
    });
  }
  for (const route of filters.routes) {
    chips.push({
      key: "routes",
      id: route,
      label: route,
      party: pulsePartyForRoute(route),
    });
  }

  return chips;
}

/** Active cross-entity filters with avatars — left-rail filter panel. */
export function PulseEntityFilterPanel({
  filters,
  partyMaps,
  clientNames,
  supplierNames,
  driverNames,
  vehicleLabels,
  executionLabel,
  onToggle,
  onClearAll,
}: Props) {
  const chips = buildFilterChips(filters, partyMaps, {
    clientNames,
    supplierNames,
    driverNames,
    vehicleLabels,
  });

  if (chips.length === 0 && !executionLabel) {
    return (
      <Text style={styles.empty}>
        No entity filters active. Tap rows in tables below to cross-filter.
      </Text>
    );
  }

  return (
    <View style={styles.wrap}>
      {executionLabel ? (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Execution</Text>
          <Text style={styles.metaValue}>{executionLabel}</Text>
        </View>
      ) : null}
      {chips.length > 0 ? (
        <>
          <View style={styles.headRow}>
            <Text style={styles.headTitle}>Pinned entities</Text>
            {onClearAll ? (
              <Pressable onPress={onClearAll} hitSlop={8} accessibilityRole="button">
                <Text style={styles.clearAll}>Clear all</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.chipList}>
            {chips.map((chip) => (
              <Pressable
                key={`${chip.key}-${chip.id}`}
                onPress={() => onToggle(chip.key, chip.id)}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Remove filter ${chip.label}`}
              >
                <PulsePartyAvatar party={chip.party} size={32} />
                <View style={styles.chipTextCol}>
                  <Text style={styles.chipName} numberOfLines={1}>
                    {chip.label}
                  </Text>
                  <Text style={styles.chipMeta} numberOfLines={1}>
                    {chip.key === "routes"
                      ? "Lane filter"
                      : chip.key.replace("Ids", "").replace(/^\w/, (c) => c.toUpperCase())}
                  </Text>
                </View>
                <View style={styles.chipRemove}>
                  <X size={14} color={Theme.textMuted} strokeWidth={2.2} />
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export function scopeRowsWithDomain(
  base: PulseScopeIntelRow[],
  extra: PulseScopeIntelRow[],
): PulseScopeIntelRow[] {
  return [...base.slice(0, 3), ...extra];
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 10,
  },
  empty: {
    fontSize: 12,
    lineHeight: 17,
    color: "#A1A5B7",
    paddingVertical: 6,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eff2f5",
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#A1A5B7",
  },
  metaValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#181C32",
    textAlign: "right",
    flex: 1,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#A1A5B7",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  clearAll: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.primary,
  },
  chipList: {
    gap: 0,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eff2f5",
  },
  chipPressed: {
    opacity: 0.88,
  },
  chipTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  chipName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#181C32",
  },
  chipMeta: {
    fontSize: 10,
    fontWeight: "500",
    color: "#A1A5B7",
  },
  chipRemove: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
