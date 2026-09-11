import { supabase } from "@/lib/supabase";
import type { LedgerRow } from "@/features/finance/services/finance.service";

type Row = {
  id?: unknown;
  organization_id?: unknown;
  trip_id?: unknown;
  party_name?: unknown;
  description?: unknown;
  amount_in?: unknown;
  amount_out?: unknown;
  transaction_date?: unknown;
  created_at?: unknown;
  contact_id?: unknown;
  contact_type?: unknown;
  payment_reference?: unknown;
  payment_mode?: unknown;
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function mapRow(row: Row): LedgerRow {
  const contactType = row.contact_type;
  const typed =
    contactType === "client" ||
    contactType === "supplier" ||
    contactType === "driver" ||
    contactType === "dco"
      ? contactType
      : null;
  return {
    id: str(row.id),
    organization_id: str(row.organization_id),
    trip_id: row.trip_id == null ? null : str(row.trip_id),
    party_name: str(row.party_name),
    description: str(row.description),
    amount_in: num(row.amount_in),
    amount_out: num(row.amount_out),
    transaction_date: str(row.transaction_date),
    created_at: str(row.created_at),
    contact_id: row.contact_id == null ? null : str(row.contact_id),
    contact_type: typed,
    payment_reference: row.payment_reference == null ? null : str(row.payment_reference),
    payment_mode: row.payment_mode == null ? null : str(row.payment_mode),
  };
}

/** One ledger row by primary key. Not a scan. */
export async function fetchFinanceProLedgerRowById(
  orgId: string,
  transactionId: string,
): Promise<{ error: Error | null; row: LedgerRow | null }> {
  try {
    const { data, error } = await supabase()
      .from("transactions")
      .select(
        "id, organization_id, trip_id, party_name, description, amount_in, amount_out, transaction_date, created_at, contact_id, contact_type, payment_reference, payment_mode",
      )
      .eq("organization_id", orgId)
      .eq("id", transactionId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { error: null, row: null };
    return { error: null, row: mapRow(data as Row) };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      row: null,
    };
  }
}
