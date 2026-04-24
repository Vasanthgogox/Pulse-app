import type { TripEntryFinancialSnapshot } from "@/features/finance/utils/computeTripEntryFinancials.util";
import React from "react";
import { TripFinancialCard } from "@/components/TripFinancialCard";

export type TripLedgerSmartTag = "client" | "supplier" | "driver";

export interface TripLedgerFinancialSummaryProps {
  snapshot: TripEntryFinancialSnapshot;
  selectedTag: TripLedgerSmartTag | null;
  onTagPress: (tag: TripLedgerSmartTag) => void;
  variant?: "stack" | "side";
  ledgerFlow?: "in" | "out";
}

/** Ledger sync / modal: compact trip financial snapshot + due CTAs (market vs asset aware). */
export function TripLedgerFinancialSummary({
  snapshot,
  selectedTag,
  onTagPress,
  variant = "stack",
  ledgerFlow,
}: TripLedgerFinancialSummaryProps) {
  return (
    <TripFinancialCard
      snapshot={snapshot}
      selectedTag={selectedTag}
      onDuePress={onTagPress}
      variant={variant}
      title="Trip financial summary"
      ledgerFlow={ledgerFlow}
    />
  );
}
