/**
 * Full-page client sale value entry — Create Trip wizard (mobile).
 * Pay-style centered layout (supplier target parity) + attribution typography.
 */
import { memo, useCallback, useMemo } from "react";

import type { NumericEntryPartyPreview } from "@/components/mobile-input/NumericEntryPartyBanner";
import {
  parseRawToNumber,
  toRawString,
} from "@/components/mobile-input/keypad";
import { WizardNumericKeypadFlow } from "@/components/full-page-wizard/WizardNumericKeypadFlow";

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
        label: "Client sale price",
        rawValue: raw,
        onRawValueChange: handleRawChange,
        errorMessage,
      },
    ],
    [raw, handleRawChange, errorMessage],
  );

  return (
    <WizardNumericKeypadFlow
      fields={fields}
      partyPreview={partyPreview}
      hint="Revenue should match what you bill this client for this lane."
    />
  );
});
