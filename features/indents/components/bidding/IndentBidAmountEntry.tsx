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
  /** e.g. Container / Trailer */
  vehicleType?: string | null;
  /** e.g. 30 t / 30000 KG */
  weightLabel?: string | null;
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

function cleanSpec(value?: string | null): string | undefined {
  const v = (value ?? "").trim();
  if (!v || v === "—") return undefined;
  return v;
}

export function IndentBidAmountEntry({
  visible,
  onClose,
  onSubmitAmount,
  indentDisplayNumber,
  origin,
  destination,
  vehicleType,
  weightLabel,
  targetRateInr,
  initialAmount,
  isUpdate = false,
  validationError,
  onClearValidationError,
  onInvalidAmount,
}: IndentBidAmountEntryProps) {
  const title = isUpdate ? "Update your bid" : "Place your bid";

  const initialValue = useMemo(() => {
    if (initialAmount != null && Number(initialAmount) > 0) {
      return toRawString(initialAmount);
    }
    return "";
  }, [visible, initialAmount]);

  const loadSpecs = useMemo(() => {
    const parts = [cleanSpec(vehicleType), cleanSpec(weightLabel)].filter(
      Boolean,
    ) as string[];
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }, [vehicleType, weightLabel]);

  const partyPreview = useMemo((): NumericEntryPartyPreview | undefined => {
    const route = routeSubtitle(origin, destination);
    const subtitleParts = [
      route,
      loadSpecs,
      targetRateInr != null && targetRateInr > 0
        ? `Target ${formatINR(targetRateInr)}`
        : null,
    ].filter(Boolean) as string[];
    return {
      name: title,
      subtitle:
        subtitleParts.length > 0
          ? subtitleParts.join(" · ")
          : `Indent ${indentDisplayNumber}`,
      entityType: "supplier",
    };
  }, [
    title,
    indentDisplayNumber,
    origin,
    destination,
    loadSpecs,
    targetRateInr,
  ]);

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
      label={title}
      contextLine={undefined}
      partyPreview={partyPreview}
      type="currency"
      prefix="₹"
      placeholder="0"
      allowDecimal={false}
      maxDecimalPlaces={0}
      submitLabel={isUpdate ? "Update bid" : "Submit bid"}
      validationError={validationError}
      targetRate={
        targetRateInr != null && targetRateInr > 0 ? targetRateInr : null
      }
    />
  );
}
