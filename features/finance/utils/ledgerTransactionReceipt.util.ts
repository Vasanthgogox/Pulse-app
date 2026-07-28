import type { LedgerEntryReceiptDetailRow } from "@/components/ledger/LedgerEntryReceiptCard";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { FinancialRowData } from "@/features/finance/components/FinancialRow";
import type { LedgerRow } from "@/features/finance/services/finance.service";

export function formatLedgerReceiptDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const mi = Number(m);
  if (!y || !day || !Number.isFinite(mi) || mi < 1 || mi > 12) return "—";
  return `${day} ${months[mi - 1]} ${y}`;
}

export function ledgerReceiptTitle(tx: LedgerRow): string {
  const label = getDoubleEntryDisplayLabel(tx);
  if (label) return label;
  const desc = tx.description?.trim();
  if (desc) return desc;
  if (Number(tx.amount_in ?? 0) > 0 && tx.contact_type === "client") {
    return "Customer payment";
  }
  if (Number(tx.amount_out ?? 0) > 0 && tx.contact_type === "supplier") {
    return "Supplier payment";
  }
  if (Number(tx.amount_out ?? 0) > 0 && tx.contact_type === "driver") {
    return "Driver payment";
  }
  return Number(tx.amount_in ?? 0) > 0 ? "Cash in" : "Cash out";
}

export function buildLedgerReceiptDetails(
  tx: LedgerRow,
): LedgerEntryReceiptDetailRow[] {
  const party = (tx.party_name ?? "").trim() || "—";
  const details: LedgerEntryReceiptDetailRow[] = [
    {
      label: "Date",
      value: formatLedgerReceiptDate(tx.transaction_date ?? tx.created_at),
    },
    { label: "Party", value: party },
    {
      label: "Payment mode",
      value: tx.payment_mode?.trim() || "—",
    },
    {
      label: "Reference",
      value: tx.payment_reference?.trim() || "—",
    },
  ];
  if (tx.description?.trim()) {
    details.push({
      label: "Note",
      value: tx.description.trim(),
      multiline: true,
    });
  }
  return details;
}

export function ledgerReceiptFromRow(tx: LedgerRow) {
  const inAmt = Number(tx.amount_in ?? 0);
  const outAmt = Number(tx.amount_out ?? 0);
  const amount = inAmt > 0 ? inAmt : outAmt;
  const isIn = inAmt > 0;
  return {
    // Direction alone does not mean the money moved: pending salary requests are
    // surfaced as synthetic amount_out rows, and labelling those "Payment sent"
    // told the payer they had already paid a claim still awaiting approval.
    statusLabel: tx.is_pending_request
      ? "Payment pending"
      : isIn
        ? "Payment received"
        : "Payment sent",
    title: ledgerReceiptTitle(tx),
    amount,
    isIn,
    details: buildLedgerReceiptDetails(tx),
    tripId: tx.trip_id ?? null,
  };
}

export function ledgerReceiptFromFinancialRowData(data: FinancialRowData) {
  const inAmt = Number(data.in ?? 0);
  const outAmt = Number(data.out ?? 0);
  const amount = inAmt > 0 ? inAmt : outAmt;
  const isIn = inAmt > 0;
  const party = (data.name ?? "").trim() || "—";
  const details: LedgerEntryReceiptDetailRow[] = [
    {
      label: "Date",
      value: formatLedgerReceiptDate(data.transaction_date),
    },
    { label: "Party", value: party },
    {
      label: "Payment mode",
      value: data.paymentMode?.trim() || "—",
    },
    {
      label: "Reference",
      value: data.paymentReference?.trim() || "—",
    },
  ];
  const note = [data.category, data.desc].filter(Boolean).join(" · ").trim();
  if (note && note !== "GENERAL") {
    details.push({ label: "Note", value: note, multiline: true });
  }
  return {
    statusLabel: isIn ? "Payment received" : "Payment sent",
    title: data.transactionTypeLabel?.trim() || party || "Transaction",
    amount,
    isIn,
    details,
    tripId: data.tripId ?? null,
  };
}
