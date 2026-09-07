/**
 * Create Load — network / supplier target step (required quote estimate).
 * Mobile: full-page currency keypad + margin presets from client sale.
 * Desktop: field entry + same margin presets.
 */
import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { WizardNumericKeypadFlow } from "@/components/full-page-wizard/WizardNumericKeypadFlow";
import { SmartInput } from "@/components/mobile-input";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import {
  parseRawToNumber,
  toRawString,
} from "@/components/mobile-input/keypad";
import Theme from "@/constants/Theme";
import { PartnerRateSaleMarginStrip } from "@/features/trips/components/add-trip/PartnerRateSaleMarginStrip";
import { createTripDesktopStyles as s } from "@/features/trips/components/add-trip/createTripDesktop.styles";

const MARGIN_PRESETS = [5, 10, 15, 20] as const;

function fieldToRaw(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const n = parseRawToNumber(trimmed.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return "";
  return toRawString(n);
}

function parseAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Supplier target for a margin % of client sale (rounded to nearest rupee). */
export function supplierTargetForMarginPct(
  clientPrice: string,
  marginPct: number,
): string | null {
  const sale = parseAmount(clientPrice);
  if (sale == null || sale <= 0) return null;
  const target = Math.round(sale * (1 - marginPct / 100));
  if (target < 0) return null;
  return toRawString(target);
}

function activeMarginPct(
  clientPrice: string,
  supplierTarget: string,
): number | null {
  const sale = parseAmount(clientPrice);
  const target = parseAmount(supplierTarget);
  if (sale == null || sale <= 0 || target == null) return null;
  for (const pct of MARGIN_PRESETS) {
    const expected = supplierTargetForMarginPct(clientPrice, pct);
    if (expected != null && Math.abs(Number(expected) - target) < 0.5) {
      return pct;
    }
  }
  return null;
}

export type IndentDistributionChoice = "integrated_supplier" | "marketplace" | "both";

export type SupplierRateBasis = "per_mt" | "per_trip";

export type CreateIndentNetworkTargetStepProps = {
  supplierTarget: string;
  onSupplierTargetChange: (value: string) => void;
  /**
   * Unit of the target. `per_mt` means the entered number is a ₹/MT rate that
   * downstream pricing multiplies by tonnage; `per_trip` is a lump sum.
   */
  supplierRateBasis?: SupplierRateBasis;
  onSupplierRateBasisChange?: (value: SupplierRateBasis) => void;
  /** Tonnes from the load step — powers the live "x N t = ₹Total" preview. */
  weightTons?: string;
  /** Client sale — shown under target with live margin + presets. */
  clientPrice?: string;
  errorMessage?: string;
  compact?: boolean;
  /** Billing client chip above the keypad on mobile. */
  partyPreview?: NumericEntryPartyPreview;
  onPartyPress?: () => void;
  /** Who receives this load. Defaults to integrated_supplier if omitted. */
  circulationTarget?: IndentDistributionChoice;
  onCirculationTargetChange?: (value: IndentDistributionChoice) => void;
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
    // A9.4: the old copy said only "verified DCO / fleet owners", but
    // organization-type bidders (other businesses) can also respond via
    // Marketplace (see market_bids.bidder_type) -- confirmed real
    // organization-type bids exist in production. Businesses choosing this
    // option should know both audiences can respond.
    hint: "Share with verified fleet owners and businesses on Marketplace",
  },
  {
    value: "both",
    label: "Both",
    hint: "Send to suppliers + Marketplace",
  },
];

function DistributionTargetSelector({
  value,
  onChange,
}: {
  value: IndentDistributionChoice;
  onChange: (value: IndentDistributionChoice) => void;
}) {
  return (
    <View style={styles.distributionWrap}>
      <Text style={styles.distributionLabel}>Who should receive this load?</Text>
      <View style={styles.distributionOptions}>
        {DISTRIBUTION_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[
                styles.distributionOption,
                selected && styles.distributionOptionSelected,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={opt.label}
            >
              <View
                style={[
                  styles.distributionRadio,
                  selected && styles.distributionRadioSelected,
                ]}
              >
                {selected ? <View style={styles.distributionRadioDot} /> : null}
              </View>
              <View style={styles.distributionCopy}>
                <Text
                  style={[
                    styles.distributionOptionLabel,
                    selected && styles.distributionOptionLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.distributionOptionHint}>{opt.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MarginPresetChips({
  clientPrice,
  supplierTarget,
  onPick,
}: {
  clientPrice: string;
  supplierTarget: string;
  onPick: (raw: string) => void;
}) {
  const sale = parseAmount(clientPrice);
  const active = activeMarginPct(clientPrice, supplierTarget);
  const disabled = sale == null || sale <= 0;

  return (
    <View style={styles.presetsWrap}>
      <Text style={styles.presetsLabel}>Margin target</Text>
      <View style={styles.presetsRow}>
        {MARGIN_PRESETS.map((pct) => {
          const selected = active === pct;
          return (
            <Pressable
              key={pct}
              disabled={disabled}
              onPress={() => {
                const next = supplierTargetForMarginPct(clientPrice, pct);
                if (next != null) onPick(next);
              }}
              style={[
                styles.presetChip,
                selected && styles.presetChipActive,
                disabled && styles.presetChipDisabled,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${pct} percent margin`}
            >
              <Text
                style={[
                  styles.presetChipText,
                  selected && styles.presetChipTextActive,
                  disabled && styles.presetChipTextDisabled,
                ]}
              >
                {pct}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const BASIS_OPTIONS: { value: SupplierRateBasis; label: string; hint: string }[] = [
  { value: "per_trip", label: "Per trip", hint: "One lump sum" },
  { value: "per_mt", label: "Per MT", hint: "Rate x tonnage" },
];

/**
 * Which unit the supplier target is quoted in.
 *
 * Without this the number was ambiguous in the database: a ₹3,200/MT rate and
 * a ₹3,200 trip total were stored identically, so every read surface guessed —
 * and showed a ₹1.24L trip as ₹3,200 (IND197 Bhandara -> Hosur).
 */
function SupplierRateBasisSelector({
  value,
  onChange,
  target,
  weightTons,
}: {
  value: SupplierRateBasis;
  onChange: (value: SupplierRateBasis) => void;
  target: string;
  weightTons?: string;
}) {
  const tons = parseAmount(weightTons ?? "");
  const rate = parseAmount(target);
  const tripTotal =
    value === "per_mt" && tons != null && tons > 0 && rate != null && rate > 0
      ? Math.round(rate * tons)
      : null;

  return (
    <View style={styles.basisWrap}>
      <Text style={styles.basisLabel}>How is this target quoted?</Text>
      <View style={styles.basisOptions}>
        {BASIS_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
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
      {value === "per_mt" ? (
        <Text style={styles.basisPreview}>
          {tripTotal != null
            ? `₹${rate?.toLocaleString("en-IN")}/MT x ${tons} t = ₹${tripTotal.toLocaleString("en-IN")} per trip`
            : tons == null || tons === 0
              ? "Add tonnage on the load step to see the trip total."
              : "Enter a ₹/MT rate to see the trip total."}
        </Text>
      ) : null}
    </View>
  );
}

export const CreateIndentNetworkTargetStep = memo(
  function CreateIndentNetworkTargetStep({
    supplierTarget,
    onSupplierTargetChange,
    supplierRateBasis = "per_trip",
    onSupplierRateBasisChange,
    weightTons,
    clientPrice = "",
    errorMessage,
    compact = false,
    partyPreview,
    onPartyPress,
    circulationTarget = "integrated_supplier",
    onCirculationTargetChange,
  }: CreateIndentNetworkTargetStepProps) {
    const raw = fieldToRaw(supplierTarget);

    const handleRawChange = useCallback(
      (nextRaw: string) => {
        onSupplierTargetChange(nextRaw);
      },
      [onSupplierTargetChange],
    );

    const fields = useMemo(
      () => [
        {
          id: "supplierTarget",
          label:
            supplierRateBasis === "per_mt"
              ? "Supplier target (₹/MT)"
              : "Supplier target (₹/trip)",
          rawValue: raw,
          onRawValueChange: handleRawChange,
          errorMessage,
        },
      ],
      [raw, handleRawChange, errorMessage, supplierRateBasis],
    );

    const marginStrip = (
      <PartnerRateSaleMarginStrip
        saleValue={clientPrice}
        partnerRate={supplierTarget}
        saleLabel="Client"
        rateEmptyHint="Type target"
      />
    );

    const marginChips = (
      <MarginPresetChips
        clientPrice={clientPrice}
        supplierTarget={supplierTarget}
        onPick={onSupplierTargetChange}
      />
    );

    const basisSelector = onSupplierRateBasisChange ? (
      <SupplierRateBasisSelector
        value={supplierRateBasis}
        onChange={onSupplierRateBasisChange}
        target={supplierTarget}
        weightTons={weightTons}
      />
    ) : null;

    const distributionSelector = onCirculationTargetChange ? (
      <DistributionTargetSelector
        value={circulationTarget}
        onChange={onCirculationTargetChange}
      />
    ) : null;

    if (compact) {
      return (
        <View style={s.saleMobileKeypadRoot}>
          <WizardNumericKeypadFlow
            fields={fields}
            partyPreview={partyPreview}
            onPartyPress={onPartyPress}
            compact
            hint="Required network estimate. Tap a margin % above the keypad to auto-fill."
            accessory={marginStrip}
            dockAccessory={
              <View style={styles.dockStack}>
                {marginChips}
                {basisSelector}
                {distributionSelector}
              </View>
            }
          />
        </View>
      );
    }

    return (
      <View style={s.stepBody}>
        <View style={s.commodityClientSection}>
          <Text style={s.sectionHeading}>Network target *</Text>
          <Text style={styles.hint}>
            Required estimate for partners to quote against. Use a margin % to
            fill from client sale, or enter a value.
          </Text>
          <View style={s.fieldSection}>
            <SmartInput
              type="currency"
              label={
                supplierRateBasis === "per_mt"
                  ? "Supplier target (₹/MT) *"
                  : "Supplier target (₹/trip) *"
              }
              value={supplierTarget}
              onChange={onSupplierTargetChange}
              variant="field"
              density="default"
              placeholder="Enter target"
              errorMessage={errorMessage}
            />
          </View>
          <View style={styles.accessoryStack}>
            {marginStrip}
            {marginChips}
          </View>
          {basisSelector}
          {distributionSelector}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  basisWrap: {
    // Matches distributionWrap so both dock blocks share one column width.
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    gap: 8,
  },
  basisLabel: {
    color: Theme.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  basisOptions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  basisOption: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 2,
  },
  basisOptionSelected: {
    borderColor: Theme.primary,
    backgroundColor: Theme.primaryLight,
  },
  basisOptionLabel: {
    color: Theme.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  basisOptionLabelSelected: {
    color: Theme.primary,
  },
  basisOptionHint: {
    color: Theme.textSecondary,
    fontSize: 11,
    fontWeight: "500",
  },
  basisPreview: {
    color: Theme.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  hint: {
    color: Theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  accessoryStack: {
    width: "100%",
    alignItems: "center",
    gap: 8,
  },
  presetsWrap: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    gap: 4,
  },
  presetsLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    textAlign: "center",
  },
  presetsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  presetChip: {
    minWidth: 52,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  presetChipActive: {
    backgroundColor: Theme.accentBrownMuted,
    borderColor: Theme.accentBrownBorder,
  },
  presetChipDisabled: {
    opacity: 0.45,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: -0.1,
  },
  presetChipTextActive: {
    color: Theme.accentBrownDeep,
  },
  presetChipTextDisabled: {
    color: Theme.textMuted,
  },
  dockStack: {
    width: "100%",
    gap: 10,
  },
  distributionWrap: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    gap: 8,
  },
  distributionLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  distributionOptions: {
    gap: 8,
  },
  distributionOption: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
  },
  distributionOptionSelected: {
    borderColor: Theme.accentBrownBorder,
    backgroundColor: Theme.accentBrownMuted,
  },
  distributionRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  distributionRadioSelected: {
    borderColor: Theme.accentBrownDeep,
  },
  distributionRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Theme.accentBrownDeep,
  },
  distributionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  distributionOptionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  distributionOptionLabelSelected: {
    color: Theme.accentBrownDeep,
  },
  distributionOptionHint: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 14,
  },
});
