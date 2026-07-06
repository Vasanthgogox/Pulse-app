import { useCallback, useMemo } from "react";

import {
  FullscreenNumericEntry,
  parseRawToNumber,
  toRawString,
} from "@/components/mobile-input";
import type { NumericEntryPartyPreview } from "@/components/mobile-input";
import { formatINR } from "@/lib/format";

export interface IndentBidAmountEntryProps {
  visible: boolean;
  onClose: () => void;
  /** Called with validated INR amount; return false to keep entry open. */
  onSubmitAmount: (amountInr: number) => Promise<boolean>;
  indentDisplayNumber: string;
  origin?: string | null;
  destination?: string | null;
  targetRateInr?: number;
  /** Pre-fill when updating an existing quote. */
  initialAmount?: number | null;
  isUpdate?: boolean;
  validationError?: string;
  onClearValidationError?: () => void;
  onInvalidAmount?: () => void;
}

function routeSubtitle(
  origin?: string | null,
  destination?: string | null,
): string | undefined {
  const o = (origin ?? "").trim();
  const d = (destination ?? "").trim();
  if (!o && !d) return undefined;
  if (!o) return d;
  if (!d) return o;
  return `${o} → ${d}`;
}

export function IndentBidAmountEntry({
  visible,
  onClose,
  onSubmitAmount,
  indentDisplayNumber,
  origin,
  destination,
  targetRateInr,
  initialAmount,
  isUpdate = false,
  validationError,
  onClearValidationError,
  onInvalidAmount,
}: IndentBidAmountEntryProps) {
  const initialValue = useMemo(() => {
    if (initialAmount != null && Number(initialAmount) > 0) {
      return toRawString(initialAmount);
    }
    return "";
  }, [visible, initialAmount]);

  const contextLine = useMemo(() => {
    const parts = [`Indent ${indentDisplayNumber}`];
    if (targetRateInr != null && targetRateInr > 0) {
      parts.push(`Target ${formatINR(targetRateInr)}`);
    }
    return parts.join(" · ");
  }, [indentDisplayNumber, targetRateInr]);

  const partyPreview = useMemo((): NumericEntryPartyPreview | undefined => {
    const subtitle = routeSubtitle(origin, destination);
    if (!subtitle) return undefined;
    return {
      name: indentDisplayNumber,
      subtitle,
      entityType: "supplier",
    };
  }, [indentDisplayNumber, origin, destination]);

  const handleSubmit = useCallback(
    (raw: string) => {
      void (async () => {
        onClearValidationError?.();
        const amount = parseRawToNumber(raw);
        if (!Number.isFinite(amount) || amount <= 0) {
          onInvalidAmount?.();
          return;
        }
        await onSubmitAmount(amount);
      })();
    },
    [onClearValidationError, onInvalidAmount, onSubmitAmount],
  );

  return (
    <FullscreenNumericEntry
      visible={visible}
      onClose={onClose}
      onSubmit={handleSubmit}
      initialValue={initialValue}
      label={isUpdate ? "Update your bid" : "Your bid"}
      contextLine={partyPreview ? undefined : contextLine}
      partyPreview={partyPreview}
      type="currency"
      prefix="₹"
      placeholder="0"
      allowDecimal={false}
      maxDecimalPlaces={0}
      submitLabel={isUpdate ? "Update bid" : "Submit bid"}
      validationError={validationError}
    />
  );
}
