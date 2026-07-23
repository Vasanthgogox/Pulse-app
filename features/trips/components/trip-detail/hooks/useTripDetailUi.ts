/**
 * useTripDetailUi — client-only UI state for the trip-detail screen.
 *
 * MIGRATION STEP 1 (docs/TRIP_DETAIL_ARCHITECTURE.md): the first focused domain
 * hook. Owns ONLY self-contained view state — modal/sheet visibility, the finance
 * sub-tab, search text, and expand toggles. It touches no server/domain data and
 * no `useTripDetail` internals, so extracting it changes no behavior.
 *
 * NOTE: `activeTab` is intentionally NOT moved here yet — it is entangled with the
 * tab auto-select effects (expense pending count, operations summary). That belongs
 * to a later step once those effects are relocated.
 */
import { useState } from "react";

import type { LedgerRow } from "@/features/finance/services/finance.service";

export type FinanceSubTab = "summary" | "transactions";

export interface UseTripDetailUiOptions {
  /** Seed for the finance sub-tab (from route/entry context). */
  initialFinanceSubTab?: FinanceSubTab;
}

export function useTripDetailUi(options?: UseTripDetailUiOptions) {
  const [financeSubTab, setFinanceSubTab] = useState<FinanceSubTab>(
    options?.initialFinanceSubTab ?? "summary",
  );
  const [previewLedgerTx, setPreviewLedgerTx] = useState<LedgerRow | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [locationLogExpanded, setLocationLogExpanded] = useState(false);
  const [showReassignSheet, setShowReassignSheet] = useState(false);
  const [showTripAuditLog, setShowTripAuditLog] = useState(false);
  const [otpResending, setOtpResending] = useState(false);

  return {
    financeSubTab,
    setFinanceSubTab,
    previewLedgerTx,
    setPreviewLedgerTx,
    searchTerm,
    setSearchTerm,
    expandedLog,
    setExpandedLog,
    locationLogExpanded,
    setLocationLogExpanded,
    showReassignSheet,
    setShowReassignSheet,
    showTripAuditLog,
    setShowTripAuditLog,
    otpResending,
    setOtpResending,
  };
}
