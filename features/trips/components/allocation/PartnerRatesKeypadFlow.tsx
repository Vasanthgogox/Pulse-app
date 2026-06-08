/**
 * GPay-style partner rate + optional advance (custom keypad, no system keyboard).
 * Shared by Create Trip allocation and indent aggregate deploy.
 */
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { WizardNumericKeypadFlow } from "@/components/full-page-wizard/WizardNumericKeypadFlow";

import { DecimalKeypad } from "@/components/mobile-input/DecimalKeypad";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import { NumericDisplay } from "@/components/mobile-input/NumericDisplay";
import { NumericEntryRecipientHero } from "@/components/mobile-input/NumericEntryRecipientHero";
import {
  applyKeypadPress,
  parseRawToNumber,
  toRawString,
  type KeypadKey,
} from "@/components/mobile-input/keypad";
import Theme from "@/constants/Theme";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";

type ActiveField = "rate" | "advance";

function fieldToRaw(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const n = parseRawToNumber(trimmed.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return "";
  return toRawString(n);
}

export interface PartnerRatesKeypadFlowProps {
  partnerRate: string;
  onPartnerRateChange: (value: string) => void;
  advancePaid: string;
  onAdvancePaidChange: (value: string) => void;
  /** Selected transport partner — centered avatar block above amount (Create Trip parity). */
  partyPreview?: NumericEntryPartyPreview;
  hint?: string;
  /** No negative horizontal bleed (use inside padded wizard shell). */
  keypadInset?: boolean;
  /** Compact layout inside FullPageWizardShell fillBody (keypad stays above footer). */
  wizardShell?: boolean;
  /** Hide centered party card when parent already shows context row. */
  suppressPartyPreview?: boolean;
}

export const PartnerRatesKeypadFlow = memo(function PartnerRatesKeypadFlow({
  partnerRate,
  onPartnerRateChange,
  advancePaid,
  onAdvancePaidChange,
  partyPreview,
  hint = "Enter the rate you will pay this partner.",
  keypadInset = false,
  wizardShell = false,
  suppressPartyPreview = false,
}: PartnerRatesKeypadFlowProps) {
  const [active, setActive] = useState<ActiveField>("rate");

  const rateRaw = fieldToRaw(partnerRate);
  const advanceRaw = fieldToRaw(advancePaid);

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (active === "rate") {
        onPartnerRateChange(applyKeypadPress(rateRaw, key, { maxDecimalPlaces: 2 }));
        return;
      }
      onAdvancePaidChange(
        applyKeypadPress(advanceRaw, key, { maxDecimalPlaces: 2 }),
      );
    },
    [active, advanceRaw, onAdvancePaidChange, onPartnerRateChange, rateRaw],
  );

  const useInset = keypadInset || wizardShell;

  const wizardFields = useMemo(
    () => [
      {
        id: "rate",
        label: "Partner rate",
        rawValue: rateRaw,
        onRawValueChange: onPartnerRateChange,
      },
    ],
    [onPartnerRateChange, rateRaw],
  );

  if (wizardShell) {
    return (
      <WizardNumericKeypadFlow
        fields={wizardFields}
        partyPreview={suppressPartyPreview ? undefined : partyPreview}
        hint={hint}
      />
    );
  }

  const mainContent = (
    <>
      {partyPreview ? (
        <NumericEntryRecipientHero
          party={partyPreview}
          caption="Partner rate"
          compact={false}
        />
      ) : null}

      <Pressable
        onPress={() => setActive("rate")}
        style={[styles.fieldBlock, active === "rate" && styles.fieldBlockActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: active === "rate" }}
      >
        <Text style={styles.fieldLabel}>Partner rate (₹) *</Text>
        <NumericDisplay
          rawValue={rateRaw}
          type="currency"
          prefix="₹"
          placeholder="0"
          variant="hero"
        />
      </Pressable>

      <Pressable
        onPress={() => setActive("advance")}
        style={[
          styles.fieldBlock,
          active === "advance" && styles.fieldBlockActive,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: active === "advance" }}
      >
        <View style={styles.advanceLabelRow}>
          <Text style={styles.fieldLabelSecondary}>Advance paid (₹)</Text>
          <Text style={styles.optionalPill}>Optional</Text>
        </View>
        <NumericDisplay
          rawValue={advanceRaw}
          type="currency"
          prefix="₹"
          placeholder="0"
          variant={active === "advance" ? "hero" : "default"}
        />
      </Pressable>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </>
  );

  return (
    <View style={[flow.root, styles.root]}>
      <View style={[flow.main, styles.main]}>{mainContent}</View>

      <View style={[flow.keypadDock, useInset && styles.keypadDockInset]}>
        <DecimalKeypad
          onKey={handleKey}
          showDecimal
          variant="pay"
          size="compact"
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
  },
  main: {
    gap: 8,
    paddingTop: 2,
    paddingBottom: 4,
  },
  fieldBlock: {
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: Theme.cardWhite,
  },
  fieldBlockActive: {
    borderColor: Theme.primary + "33",
    backgroundColor: Theme.primary + "08",
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  fieldLabelSecondary: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  advanceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  optionalPill: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.4,
  },
  hint: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    lineHeight: 17,
    marginTop: 4,
    textAlign: "center",
  },
  keypadDockInset: {
    marginHorizontal: 0,
    paddingHorizontal: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
});
