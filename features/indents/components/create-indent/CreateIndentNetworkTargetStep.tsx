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

export type SupplierRateBasis = "per_mt" | "per_trip";

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

/**
 * Client sale expressed in the SAME unit as the supplier target.
 *
 * `client_price` is always a trip total, but the supplier target may be a ₹/MT
 * rate. Comparing the two directly mixed units: a 5% margin preset on a
 * ₹1,27,680 sale wrote 1,21,296 into a ₹/MT field, which then multiplied out
 * to ₹46,09,248. On a per-MT basis the sale must be divided by tonnage first
 * so both sides are ₹/MT (₹3,360/MT sale -> ₹3,192/MT target at 5%).
 *
 * Returns null on a per-MT basis with no usable tonnage — margin cannot be
 * expressed per-MT until tonnage is known, so the presets disable instead of
 * producing a wrong number.
 */
export function effectiveSaleForBasis(
  clientPrice: string,
  basis: SupplierRateBasis,
  weightTons?: string,
): number | null {
  const sale = parseAmount(clientPrice);
  if (sale == null || sale <= 0) return null;
  if (basis !== "per_mt") return sale;
  const tons = parseAmount(weightTons ?? "");
  if (tons == null || tons <= 0) return null;
  return sale / tons;
}

/** Supplier target for a margin % of client sale, in the target's own unit. */
export function supplierTargetForMarginPct(
  clientPrice: string,
  marginPct: number,
  basis: SupplierRateBasis = "per_trip",
  weightTons?: string,
): string | null {
  const sale = effectiveSaleForBasis(clientPrice, basis, weightTons);
  if (sale == null) return null;
  const target = Math.round(sale * (1 - marginPct / 100));
  if (target < 0) return null;
  return toRawString(target);
}

function activeMarginPct(
  clientPrice: string,
  supplierTarget: string,
  basis: SupplierRateBasis = "per_trip",
  weightTons?: string,
): number | null {
  const sale = effectiveSaleForBasis(clientPrice, basis, weightTons);
  const target = parseAmount(supplierTarget);
  if (sale == null || target == null) return null;
  for (const pct of MARGIN_PRESETS) {
    const expected = supplierTargetForMarginPct(
      clientPrice,
      pct,
      basis,
      weightTons,
    );
    if (expected != null && Math.abs(Number(expected) - target) < 0.5) {
      return pct;
    }
  }
  return null;
}

export type IndentDistributionChoice = "integrated_supplier" | "marketplace" | "both";

export type CreateIndentNetworkTargetStepProps = {
  supplierTarget: string;
  onSupplierTargetChange: (value: string) => void;
  /**
   * Unit already chosen on the Quote step. Used only so margin chips stay in
   * the same unit if the user goes back after picking per-MT.
   */
  supplierRateBasis?: SupplierRateBasis;
  /** Tonnes from the load step — needed for per-MT margin presets. */
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
  basis = "per_trip",
  weightTons,
}: {
  clientPrice: string;
  supplierTarget: string;
  onPick: (raw: string) => void;
  basis?: SupplierRateBasis;
  weightTons?: string;
}) {
  // Per-MT margin needs tonnage; effectiveSaleForBasis returns null without it.
  const sale = effectiveSaleForBasis(clientPrice, basis, weightTons);
  const active = activeMarginPct(clientPrice, supplierTarget, basis, weightTons);
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
                const next = supplierTargetForMarginPct(
                  clientPrice,
                  pct,
                  basis,
                  weightTons,
                );
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

export const CreateIndentNetworkTargetStep = memo(
  function CreateIndentNetworkTargetStep({
    supplierTarget,
    onSupplierTargetChange,
    supplierRateBasis = "per_trip",
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
          label: "Supplier target",
          rawValue: raw,
          onRawValueChange: handleRawChange,
          errorMessage,
        },
      ],
      [raw, handleRawChange, errorMessage],
    );

    const perMtTons =
      supplierRateBasis === "per_mt" ? parseAmount(weightTons ?? "") : null;

    const marginStrip = (
      <PartnerRateSaleMarginStrip
        saleValue={clientPrice}
        partnerRate={supplierTarget}
        saleLabel="Client"
        rateEmptyHint="Type target"
        saleDivisorTons={perMtTons}
        unitSuffix={supplierRateBasis === "per_mt" && perMtTons ? "/MT" : ""}
      />
    );

    const marginChips = (
      <MarginPresetChips
        clientPrice={clientPrice}
        supplierTarget={supplierTarget}
        onPick={onSupplierTargetChange}
        basis={supplierRateBasis}
        weightTons={weightTons}
      />
    );

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
              label="Supplier target *"
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
          {distributionSelector}
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
