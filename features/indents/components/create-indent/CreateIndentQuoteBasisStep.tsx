/**
 * Create Load — how the supplier target is quoted (per trip vs per MT).
 * Split from Vasanth's Target step so amount + distribution stay on Target.
 */
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Theme from "@/constants/Theme";
import { createTripDesktopStyles as s } from "@/features/trips/components/add-trip/createTripDesktop.styles";

import type { SupplierRateBasis } from "./CreateIndentNetworkTargetStep";

const BASIS_OPTIONS: { value: SupplierRateBasis; label: string; hint: string }[] =
  [
    { value: "per_trip", label: "Per trip", hint: "One lump sum" },
    { value: "per_mt", label: "Per MT", hint: "Rate x tonnage" },
  ];

function parseAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export type CreateIndentQuoteBasisStepProps = {
  supplierTarget: string;
  supplierRateBasis: SupplierRateBasis;
  onSupplierRateBasisChange: (value: SupplierRateBasis) => void;
  weightTons?: string;
  compact?: boolean;
};

export const CreateIndentQuoteBasisStep = memo(
  function CreateIndentQuoteBasisStep({
    supplierTarget,
    supplierRateBasis,
    onSupplierRateBasisChange,
    weightTons,
    compact = false,
  }: CreateIndentQuoteBasisStepProps) {
    const tons = parseAmount(weightTons ?? "");
    const rate = parseAmount(supplierTarget);
    const tripTotal =
      supplierRateBasis === "per_mt" &&
      tons != null &&
      tons > 0 &&
      rate != null &&
      rate > 0
        ? Math.round(rate * tons)
        : null;

    return (
      <View style={compact ? styles.compactRoot : s.stepBody}>
        <View style={s.commodityClientSection}>
          <Text style={s.sectionHeading}>How is this target quoted? *</Text>
          <Text style={styles.hint}>
            Partners need to know if ₹
            {rate != null ? rate.toLocaleString("en-IN") : "—"} is a trip total
            or a ₹/MT rate.
          </Text>
          <View style={styles.basisOptions}>
            {BASIS_OPTIONS.map((opt) => {
              const selected = supplierRateBasis === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onSupplierRateBasisChange(opt.value)}
                  style={[
                    styles.basisOption,
                    selected && styles.basisOptionSelected,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${opt.label} — ${opt.hint}`}
                >
                  <Text
                    style={[
                      styles.basisOptionLabel,
                      selected && styles.basisOptionLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={styles.basisOptionHint}>{opt.hint}</Text>
                </Pressable>
              );
            })}
          </View>
          {supplierRateBasis === "per_mt" ? (
            <Text style={styles.basisPreview}>
              {tripTotal != null
                ? `₹${rate?.toLocaleString("en-IN")}/MT x ${tons} t ≈ ₹${tripTotal.toLocaleString("en-IN")} — final on loading`
                : tons == null || tons === 0
                  ? "Add tonnage on the load step to estimate the trip total."
                  : "Enter a ₹/MT rate to estimate the trip total."}
            </Text>
          ) : rate != null && rate > 0 ? (
            <Text style={styles.basisPreview}>
              ₹{rate.toLocaleString("en-IN")} lump sum for the trip
            </Text>
          ) : null}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  compactRoot: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  hint: {
    color: Theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    marginBottom: 8,
  },
  basisOptions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
    maxWidth: 400,
  },
  basisOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  basisOptionSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primaryLight,
  },
  basisOptionLabel: {
    color: Theme.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  basisOptionLabelSelected: {
    color: Theme.primary,
  },
  basisOptionHint: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  basisPreview: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
});
