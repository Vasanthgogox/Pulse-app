/**
 * Full-page client sale value entry — Create Trip wizard (mobile).
 * Matches attribution / ledger keypad UX (party row + amount + docked keypad).
 */
import { memo, useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { DecimalKeypad } from "@/components/mobile-input/DecimalKeypad";
import { NumericDisplay } from "@/components/mobile-input/NumericDisplay";
import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import {
  applyKeypadPress,
  parseRawToNumber,
  toRawString,
  type KeypadKey,
} from "@/components/mobile-input/keypad";
import {
  fullPageWizardStyles,
  WizardClientSummaryCard,
} from "@/components/full-page-wizard";
import { partyKeypadFlowStyles as flow } from "@/components/party/keypad/partyKeypadFlowStyles";
import Theme from "@/constants/Theme";

function fieldToRaw(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const n = parseRawToNumber(trimmed.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return "";
  return toRawString(n);
}

export interface ClientSaleKeypadFlowProps {
  clientPrice: string;
  onClientPriceChange: (value: string) => void;
  partyPreview?: NumericEntryPartyPreview;
  errorMessage?: string;
}

export const ClientSaleKeypadFlow = memo(function ClientSaleKeypadFlow({
  clientPrice,
  onClientPriceChange,
  partyPreview,
  errorMessage,
}: ClientSaleKeypadFlowProps) {
  const raw = fieldToRaw(clientPrice);

  const handleKey = useCallback(
    (key: KeypadKey) => {
      onClientPriceChange(applyKeypadPress(raw, key, { maxDecimalPlaces: 2 }));
    },
    [onClientPriceChange, raw],
  );

  return (
    <View style={[flow.root, styles.root]}>
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.main}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {partyPreview ? (
          <WizardClientSummaryCard
            label="Client"
            name={partyPreview.name}
            subtitle={partyPreview.subtitle}
            avatarUrl={partyPreview.avatarUrl}
            avatarSeed={partyPreview.avatarSeed}
          />
        ) : null}

        <View style={fullPageWizardStyles.wizardFieldBlock}>
          <Text style={fullPageWizardStyles.wizardFieldLabel}>
            Client sale price (₹) *
          </Text>
          <NumericDisplay
            rawValue={raw}
            type="currency"
            prefix="₹"
            placeholder="0"
            variant="hero"
          />
          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </View>

        <View style={styles.hintCard}>
          <Text style={styles.hintText}>
            Revenue should match what you bill this client for this lane.
          </Text>
        </View>
      </ScrollView>

      <View style={flow.keypadDockWizard}>
        <DecimalKeypad onKey={handleKey} showDecimal variant="pay" size="compact" />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
  },
  mainScroll: {
    flex: 1,
    minHeight: 0,
  },
  main: {
    gap: 12,
    paddingTop: 2,
    paddingBottom: 8,
  },
  hintCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  errorText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.destructive,
    marginTop: 4,
  },
});
