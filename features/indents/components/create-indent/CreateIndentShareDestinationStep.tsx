/**
 * Create Load — who should receive this indent after the supplier target is set.
 */
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { createTripDesktopStyles as s } from "@/features/trips/components/add-trip/createTripDesktop.styles";

import type { IndentDistributionChoice } from "./createIndentForm.types";

export type CreateIndentShareDestinationStepProps = {
  value: IndentDistributionChoice;
  onChange: (value: IndentDistributionChoice) => void;
  compact?: boolean;
};

const DISTRIBUTION_OPTIONS: Array<{
  value: IndentDistributionChoice;
  label: string;
  hint: string;
}> = [
  {
    value: "integrated_supplier",
    label: "Integrated suppliers",
    hint: "Send to my connected supplier network",
  },
  {
    value: "marketplace",
    label: "Marketplace",
    hint: "Share with verified fleet owners and businesses on Marketplace",
  },
  {
    value: "both",
    label: "Both",
    hint: "Send to suppliers + Marketplace",
  },
];

export const CreateIndentShareDestinationStep = memo(
  function CreateIndentShareDestinationStep({
    value,
    onChange,
    compact = false,
  }: CreateIndentShareDestinationStepProps) {
    const cards = (
      <View style={styles.options}>
        {DISTRIBUTION_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.option, selected && styles.optionSelected]}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={opt.label}
            >
              <View
                style={[styles.radio, selected && styles.radioSelected]}
              >
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.copy}>
                <Text
                  style={[
                    styles.optionLabel,
                    selected && styles.optionLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.optionHint}>{opt.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );

    if (compact) {
      return (
        <View style={styles.compactRoot}>
          <Text style={styles.heading}>Who should receive this load?</Text>
          {cards}
        </View>
      );
    }

    return (
      <View style={s.stepBody}>
        <View style={s.commodityClientSection}>
          <Text style={s.sectionHeading}>Who should receive this load?</Text>
          <Text style={styles.hint}>
            Choose suppliers, Marketplace, or both before sharing.
          </Text>
          {cards}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  compactRoot: {
    width: "100%",
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 12,
  },
  heading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  hint: {
    color: Theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  options: {
    width: "100%",
    gap: 10,
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  optionSelected: {
    borderColor: Theme.accentBrownBorder,
    backgroundColor: Theme.accentBrownMuted,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: Theme.accentBrownDeep,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.accentBrownDeep,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  optionLabelSelected: {
    color: Theme.accentBrownDeep,
  },
  optionHint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 16,
  },
});
