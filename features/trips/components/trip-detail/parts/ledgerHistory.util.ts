/**
 * Shared ledger-history helpers + row type used by both the main TripDetailScreen
 * and the extracted LedgerCard. Pure functions, moved verbatim (no behavior change).
 */
import type { LedgerRow } from "@/features/finance/services/finance.service";

export type FinanceHistoryRow = {
  key: string;
  tx: LedgerRow;
  isIn: boolean;
  amount: number;
};

export function formatLedgerDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const mi = Number(m);
  if (!y || !day || !Number.isFinite(mi) || mi < 1 || mi > 12) return "—";
  return `${day} ${months[mi - 1]} ${y}`;
}

export function ledgerHistoryTitle(tx: LedgerRow, isIn: boolean) {
  const desc = tx.description?.trim();
  if (desc) return desc;
  if (isIn && tx.contact_type === "client") return "Customer payment";
  if (!isIn && tx.contact_type === "supplier") return "Supplier payment";
  if (!isIn && tx.contact_type === "driver") return "Driver payment";
  return isIn ? "Cash in" : "Cash out";
}
