/**
 * Create Load — network / supplier target step (optional quote estimate).
 * Matches Create Trip compact enterprise density on mobile.
 */
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SmartInput } from "@/components/mobile-input";
import Theme from "@/constants/Theme";
import { createTripDesktopStyles as s } from "@/features/trips/components/add-trip/createTripDesktop.styles";

export type CreateIndentNetworkTargetStepProps = {
  supplierTarget: string;
  onSupplierTargetChange: (value: string) => void;
  errorMessage?: string;
  compact?: boolean;
};

export const CreateIndentNetworkTargetStep = memo(
  function CreateIndentNetworkTargetStep({
    supplierTarget,
    onSupplierTargetChange,
    errorMessage,
    compact = false,
  }: CreateIndentNetworkTargetStepProps) {
    return (
      <View style={[s.stepBody, compact && s.compactStepBody]}>
        <View style={[s.commodityClientSection, compact && { gap: 8 }]}>
          <Text style={[s.sectionHeading, compact && s.compactSectionHeading]}>
            Network target
          </Text>
          <Text style={[styles.hint, compact && styles.hintCompact]}>
            Optional estimate for partners to quote against. Leave blank to let
            the network discover the market rate.
          </Text>
          <View style={s.fieldSection}>
            <SmartInput
              type="currency"
              label="Supplier target"
              value={supplierTarget}
              onChange={onSupplierTargetChange}
              variant="field"
              density={compact ? "compact" : "default"}
              placeholder="Optional estimate"
              errorMessage={errorMessage}
            />
          </View>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  hint: {
    color: Theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  hintCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
});
