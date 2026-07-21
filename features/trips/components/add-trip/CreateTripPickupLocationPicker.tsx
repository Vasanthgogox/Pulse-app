/**
 * Grouped Office / Warehouse pickup picker for Create Trip route step.
 */
import { Building2, Check, MapPin, Warehouse } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import Theme from "@/constants/Theme";

import { createTripDesktopStyles as s } from "./createTripDesktop.styles";
import {
  groupPickupRecommendations,
  type PickupRecommendation,
} from "./pickupRecommendations.util";

export type CreateTripPickupLocationPickerProps = {
  recommendations: readonly PickupRecommendation[];
  selectedAddress: string;
  onSelect: (rec: PickupRecommendation) => void;
  /** True while linked-org / warehouse queries are loading. */
  loading?: boolean;
  compact?: boolean;
};

function LocationCard({
  rec,
  selected,
  onPress,
}: {
  rec: PickupRecommendation;
  selected: boolean;
  onPress: () => void;
}) {
  const Icon = rec.kind === "office" ? Building2 : Warehouse;
  return (
    <Pressable
      style={[s.pickupLocCard, selected && s.pickupLocCardSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Use ${rec.title} as pickup`}
    >
      <View style={[s.pickupLocIconWrap, selected && s.pickupLocIconWrapSelected]}>
        <Icon
          size={16}
          color={selected ? Theme.textOnPrimary : Theme.textRouteCard}
          strokeWidth={2.25}
        />
      </View>
      <View style={s.pickupLocCardCopy}>
        <View style={s.pickupLocCardTopRow}>
          <Text
            style={[s.pickupLocTypePill, selected && s.pickupLocTypePillSelected]}
            numberOfLines={1}
          >
            {rec.typeLabel}
          </Text>
          {selected ? (
            <View style={s.pickupLocCheck}>
              <Check size={12} color={Theme.textOnPrimary} strokeWidth={3} />
            </View>
          ) : null}
        </View>
        <Text
          style={[s.pickupLocCardTitle, selected && s.pickupLocCardTitleSelected]}
          numberOfLines={1}
        >
          {rec.title}
        </Text>
        <Text
          style={[s.pickupLocCardAddress, selected && s.pickupLocCardAddressSelected]}
          numberOfLines={2}
        >
          {rec.address}
        </Text>
      </View>
    </Pressable>
  );
}

function Section({
  title,
  icon,
  items,
  selectedAddress,
  onSelect,
  compact,
  emptyHint,
}: {
  title: string;
  icon: "office" | "warehouse";
  items: readonly PickupRecommendation[];
  selectedAddress: string;
  onSelect: (rec: PickupRecommendation) => void;
  compact?: boolean;
  emptyHint: string;
}) {
  const SectionIcon = icon === "office" ? Building2 : Warehouse;
  return (
    <View style={s.pickupLocSection}>
      <View style={s.pickupLocSectionHead}>
        <SectionIcon size={14} color={Theme.textMuted} strokeWidth={2.25} />
        <Text style={s.pickupLocSectionTitle}>{title}</Text>
        {items.length > 0 ? (
          <Text style={s.pickupLocSectionCount}>{items.length}</Text>
        ) : null}
      </View>
      {items.length === 0 ? (
        <Text style={s.pickupLocSectionEmpty}>{emptyHint}</Text>
      ) : (
        <View style={[s.pickupLocGrid, compact && s.pickupLocGridCompact]}>
          {items.map((rec) => {
            const selected =
              selectedAddress.trim().toLowerCase() ===
              rec.address.trim().toLowerCase();
            return (
              <View
                key={rec.id}
                style={[s.pickupLocGridItem, compact && s.pickupLocGridItemCompact]}
              >
                <LocationCard
                  rec={rec}
                  selected={selected}
                  onPress={() => onSelect(rec)}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export const CreateTripPickupLocationPicker = memo(
  function CreateTripPickupLocationPicker({
    recommendations,
    selectedAddress,
    onSelect,
    loading = false,
    compact = false,
  }: CreateTripPickupLocationPickerProps) {
    const { offices, warehouses } = groupPickupRecommendations(recommendations);
    const hasAny = recommendations.length > 0;

    if (loading && !hasAny) {
      return (
        <View style={s.pickupRecommendBlock}>
          <Text style={s.pickupRecommendEmpty}>Loading client locations…</Text>
        </View>
      );
    }

    if (!hasAny) {
      return (
        <View style={s.pickupRecommendBlock}>
          <View style={s.pickupLocEmptyBanner}>
            <MapPin size={16} color={Theme.textMuted} strokeWidth={2.25} />
            <Text style={s.pickupRecommendEmpty}>
              No client location found — search or pick pickup manually below.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={s.pickupRecommendBlock}>
        <Text style={s.pickupRecommendLabel}>Client locations</Text>
        <Text style={s.pickupRecommendHint}>
          Tap an office or warehouse to set pickup — or search manually below.
        </Text>
        <View style={[s.pickupLocSections, compact && s.pickupLocSectionsCompact]}>
          <Section
            title="Office"
            icon="office"
            items={offices}
            selectedAddress={selectedAddress}
            onSelect={onSelect}
            compact={compact}
            emptyHint="No office on file for this client."
          />
          <Section
            title="Warehouse"
            icon="warehouse"
            items={warehouses}
            selectedAddress={selectedAddress}
            onSelect={onSelect}
            compact={compact}
            emptyHint="No warehouse on file for this client."
          />
        </View>
      </View>
    );
  },
);
