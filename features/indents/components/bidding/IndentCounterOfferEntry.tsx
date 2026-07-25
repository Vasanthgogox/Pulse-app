/**
 * Counter-offer amount entry — same full-view keypad as bid entry.
 */
import { useCallback, useMemo, useState } from "react";

import {
  FullscreenNumericEntry,
  parseRawToNumber,
  toRawString,
} from "@/components/mobile-input";
import type { NumericEntryPartyPreview } from "@/components/mobile-input";
import { formatINR } from "@/lib/format";

export interface IndentCounterOfferEntryProps {
  visible: boolean;
  onClose: () => void;
  /** Return false to keep the entry open. */
  onSubmitAmount: (amountInr: number) => Promise<boolean>;
  carrierName: string;
  currentBidAmount: number;
  indentDisplayNumber?: string;
  origin?: string | null;
  destination?: string | null;
  initialCounterAmount?: number | null;
  submitting?: boolean;
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

export function IndentCounterOfferEntry({
  visible,
  onClose,
  onSubmitAmount,
  carrierName,
  currentBidAmount,
  indentDisplayNumber,
  origin,
  destination,
  initialCounterAmount,
  submitting = false,
}: IndentCounterOfferEntryProps) {
  const [validationError, setValidationError] = useState<string | undefined>();

  const initialValue = useMemo(() => {
    if (initialCounterAmount != null && Number(initialCounterAmount) > 0) {
      return toRawString(Math.round(Number(initialCounterAmount)));
    }
    if (currentBidAmount > 0) {
      const seed = Math.max(0, Math.round(currentBidAmount) - 1000);
      return seed > 0 ? toRawString(seed) : "";
    }
    return "";
  }, [visible, initialCounterAmount, currentBidAmount]);

  const contextLine = useMemo(() => {
    const parts: string[] = [];
    if (indentDisplayNumber) parts.push(`Indent ${indentDisplayNumber}`);
    if (currentBidAmount > 0) {
      parts.push(`Current bid ${formatINR(currentBidAmount)}`);
    }
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }, [indentDisplayNumber, currentBidAmount]);

  const partyPreview = useMemo((): NumericEntryPartyPreview | undefined => {
    const subtitle =
      routeSubtitle(origin, destination) ??
      (currentBidAmount > 0
        ? `Current bid ${formatINR(currentBidAmount)}`
        : undefined);
    return {
      name: carrierName.trim() || "Supplier",
      subtitle,
      entityType: "supplier",
    };
  }, [carrierName, origin, destination, currentBidAmount]);

  const handleSubmit = useCallback(
    (raw: string) => {
      if (submitting) return;
      void (async () => {
        setValidationError(undefined);
        const amount = parseRawToNumber(raw);
        if (!Number.isFinite(amount) || amount <= 0) {
          setValidationError("Enter a counter amount greater than 0.");
          return;
        }
        const ok = await onSubmitAmount(amount);
        if (!ok) {
          setValidationError("Could not send counter offer. Try again.");
        }
      })();
    },
    [onSubmitAmount, submitting],
  );

  return (
    <FullscreenNumericEntry
      visible={visible}
      onClose={() => {
        if (submitting) return;
        setValidationError(undefined);
        onClose();
      }}
      onSubmit={handleSubmit}
      initialValue={initialValue}
      label="Counter offer"
      contextLine={partyPreview ? undefined : contextLine}
      partyPreview={partyPreview}
      type="currency"
      prefix="₹"
      placeholder="0"
      allowDecimal={false}
      maxDecimalPlaces={0}
      submitLabel={submitting ? "Sending…" : "Submit counter"}
      validationError={validationError}
    />
  );
}
