/**
 * Create Load — supplier target.
 * Phone: full-page keypad (client-sale compact).
 * Desktop: sale-value card + Edit modal keypad (client-sale desktop).
 */
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { WizardNumericKeypadFlow } from "@/components/full-page-wizard/WizardNumericKeypadFlow";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import {
  parseRawToNumber,
  toRawString,
} from "@/components/mobile-input/keypad";
import Theme from "@/constants/Theme";
import { DesktopSectionHeading } from "@/features/trips/components/add-trip/CreateTripDesktopUi";
import { PartnerRateSaleMarginStrip } from "@/features/trips/components/add-trip/PartnerRateSaleMarginStrip";
import { createTripDesktopStyles as s } from "@/features/trips/components/add-trip/createTripDesktop.styles";

import { IndentTargetDesktopModal } from "./IndentTargetDesktopModal";

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

function formatInr(raw: string): string | null {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${n.toLocaleString("en-IN")}`;
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

export type CreateIndentNetworkTargetStepProps = {
  supplierTarget: string;
  onSupplierTargetChange: (value: string) => void;
  clientPrice?: string;
  errorMessage?: string;
  compact?: boolean;
  partyPreview?: NumericEntryPartyPreview;
  onPartyPress?: () => void;
};

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

export const CreateIndentNetworkTargetStep = memo(
  function CreateIndentNetworkTargetStep({
    supplierTarget,
    onSupplierTargetChange,
    clientPrice = "",
    errorMessage,
    compact = false,
    partyPreview,
    onPartyPress,
  }: CreateIndentNetworkTargetStepProps) {
    const [targetModalOpen, setTargetModalOpen] = useState(false);
    const [doneAttempted, setDoneAttempted] = useState(false);
    const targetDisplay = formatInr(supplierTarget);
    const raw = fieldToRaw(supplierTarget);

    const handleRawChange = useCallback(
      (nextRaw: string) => {
        setDoneAttempted(false);
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
          errorMessage:
            errorMessage ||
            (doneAttempted && !targetDisplay
              ? "Enter a target greater than 0"
              : undefined),
        },
      ],
      [raw, handleRawChange, errorMessage, doneAttempted, targetDisplay],
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

    const keypad = (
      <WizardNumericKeypadFlow
        fields={fields}
        partyPreview={partyPreview}
        onPartyPress={onPartyPress}
        compact
        forceMobileLayout={!compact}
        hint={
          compact
            ? "Required network estimate. Tap a margin % above the keypad to auto-fill."
            : undefined
        }
        accessory={
          compact ? (
            marginStrip
          ) : (
            <View style={styles.modalAccessory}>
              {marginStrip}
              {marginChips}
            </View>
          )
        }
        dockAccessory={compact ? marginChips : undefined}
      />
    );

    const handleDone = useCallback(() => {
      if (!targetDisplay) {
        setDoneAttempted(true);
        return;
      }
      setDoneAttempted(false);
      setTargetModalOpen(false);
    }, [targetDisplay]);

    if (compact) {
      return <View style={s.saleMobileKeypadRoot}>{keypad}</View>;
    }

    return (
      <View style={s.stepBody}>
        <View style={s.commodityClientSection}>
          <Text style={s.sectionHeading}>Network target *</Text>
          <Text style={styles.hint}>
            Required estimate for partners to quote against. Use a margin % to
            fill from client sale, or enter a value.
          </Text>
          <View style={s.sourceRatesBlock}>
            <DesktopSectionHeading>Supplier target</DesktopSectionHeading>
            <Pressable
              style={[
                s.sourceRateSummaryCard,
                Boolean(errorMessage) && s.sourceRateSummaryCardError,
              ]}
              onPress={() => {
                setDoneAttempted(false);
                setTargetModalOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit supplier target"
            >
              <View style={s.sourceRateSummaryCopy}>
                <Text style={s.sourceRateSummaryLabel}>Supplier target</Text>
                {targetDisplay ? (
                  <Text style={s.sourceRateSummaryValue}>{targetDisplay}</Text>
                ) : (
                  <Text style={s.sourceRateSummaryValueMuted}>
                    Tap to enter target
                  </Text>
                )}
                {errorMessage ? (
                  <Text style={s.salePriceError}>{errorMessage}</Text>
                ) : null}
              </View>
              <View style={s.sourceRateSummaryAction}>
                <Text style={s.sourceRateSummaryActionText}>
                  {targetDisplay ? "Edit" : "Add target"}
                </Text>
              </View>
            </Pressable>
          </View>
          <View style={styles.accessoryStack}>
            {marginStrip}
            {marginChips}
          </View>
        </View>

        <IndentTargetDesktopModal
          visible={targetModalOpen}
          onClose={() => {
            setDoneAttempted(false);
            setTargetModalOpen(false);
          }}
          onDone={handleDone}
        >
          {keypad}
        </IndentTargetDesktopModal>
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
  modalAccessory: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    alignItems: "stretch",
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
});
