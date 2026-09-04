/**
 * Full-page client sale value entry — Create Trip wizard (mobile).
 * Google Pay payout layout — identical shell to PartnerRatesKeypadFlow (wizardShell).
 */
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import {
  parseRawToNumber,
  toRawString,
} from "@/components/mobile-input/keypad";
import { WizardNumericKeypadFlow } from "@/components/full-page-wizard/WizardNumericKeypadFlow";
import Theme from "@/constants/Theme";
import type { SaleRateBasis } from "@/features/clients/utils/saleRateSnapshot.util";

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
  /** e.g. payment terms row above the keypad. */
  accessory?: ReactNode;
  /** Tap recipient to change billing client. */
  onPartyPress?: () => void;
  /** Force mobile GPay layout on wide screens (desktop popup). */
  forceMobileLayout?: boolean;
  /** Tighter type for desktop popup sheets. */
  compact?: boolean;
  saleRateBasis?: SaleRateBasis;
  onSaleRateBasisChange?: (basis: SaleRateBasis) => void;
  /** Contract lane locked the basis — chips stay visible but disabled. */
  saleBasisLocked?: boolean;
}

export const ClientSaleKeypadFlow = memo(function ClientSaleKeypadFlow({
  clientPrice,
  onClientPriceChange,
  partyPreview,
  errorMessage,
  accessory,
  onPartyPress,
  forceMobileLayout = false,
  compact = false,
  saleRateBasis = "per_trip",
  onSaleRateBasisChange,
  saleBasisLocked = false,
}: ClientSaleKeypadFlowProps) {
  const raw = fieldToRaw(clientPrice);
  const perMt = saleRateBasis === "per_mt";

  const handleRawChange = useCallback(
    (nextRaw: string) => {
      onClientPriceChange(nextRaw);
    },
    [onClientPriceChange],
  );

  const fields = useMemo(
    () => [
      {
        id: "clientSale",
        label: perMt ? "Rate per MT" : "Client sale price",
        rawValue: raw,
        onRawValueChange: handleRawChange,
        errorMessage,
      },
    ],
    [raw, handleRawChange, errorMessage, perMt],
  );

  const basisChips = onSaleRateBasisChange ? (
    <View style={styles.basisRow}>
      {(
        [
          { id: "per_trip" as const, label: "Trip total" },
          { id: "per_mt" as const, label: "₹ / MT" },
        ] as const
      ).map((opt) => {
        const active = saleRateBasis === opt.id;
        return (
          <Pressable
            key={opt.id}
            disabled={saleBasisLocked}
            onPress={() => onSaleRateBasisChange(opt.id)}
            style={[
              styles.basisChip,
              active && styles.basisChipActive,
              saleBasisLocked && styles.basisChipLocked,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: saleBasisLocked }}
          >
            <Text style={[styles.basisChipText, active && styles.basisChipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  return (
    <WizardNumericKeypadFlow
      fields={fields}
      partyPreview={partyPreview}
      onPartyPress={onPartyPress}
      forceMobileLayout={forceMobileLayout}
      compact={compact}
      hint={
        perMt
          ? "₹/MT stays on the load. Total is computed when tons are known — including after loading."
          : "Revenue should match what you bill this client for this lane."
      }
      accessory={
        basisChips || accessory ? (
          <View>
            {basisChips}
            {accessory}
          </View>
        ) : null
      }
    />
  );
});

const styles = StyleSheet.create({
  basisRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  basisChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 44,
    justifyContent: "center",
  },
  basisChipActive: {
    backgroundColor: Theme.primary,
    borderColor: Theme.primary,
  },
  basisChipLocked: {
    opacity: 0.7,
  },
  basisChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  basisChipTextActive: {
    color: Theme.textOnPrimary,
  },
});
