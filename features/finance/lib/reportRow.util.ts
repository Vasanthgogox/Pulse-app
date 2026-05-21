import type { LedgerRow } from "../services/finance.service";

export function createReportRow({
  id,
  organizationId,
  partyName,
  description,
  amountIn,
  amountOut,
  transactionDate,
  tripNumber,
  tripId = null,
  contactId,
  contactType = null,
}: {
  id: string;
  organizationId: string | null;
  partyName: string;
  description: string;
  amountIn: number;
  amountOut: number;
  transactionDate: string;
  tripNumber?: string | null;
  tripId?: string | null;
  contactId?: string;
  contactType?: "client" | "supplier" | "driver" | null;
}): LedgerRow {
  const date = transactionDate || new Date().toISOString();
  return {
    id,
    organization_id: organizationId ?? "",
    trip_id: tripId,
    trip_number: tripNumber ?? null,
    party_name: partyName,
    description,
    amount_in: amountIn,
    amount_out: amountOut,
    transaction_date: date,
    created_at: date,
    contact_id: contactId ?? null,
    contact_type: contactType,
  };
}
