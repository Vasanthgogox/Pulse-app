/**
 * Finance / ledger service — Supabase.
 * Uses public.transactions table (q-mobile schema: amount_in, amount_out, party_name, transaction_date).
 * When connected to Q-unified-base DB with cash_entries, that table can be used instead; this keeps compatibility with q-mobile migrations.
 *
 * Double-entry interpretation: every row maps to a debit/credit pair per docs/CORE_ACCOUNTING_MODEL.md.
 * Use getDoubleEntryFromLedgerRow (features/finance/accounting/accountingModel.ts) for consistent interpretation.
 * Service-layer validation: amount cap, date format, string length.
 */
import { supabase } from '@/lib/supabase';
import { LEDGER_PAGE_SIZE, type PageOpts } from '@/lib/pagination';
import { VALIDATION, dateISO } from '@/lib/validation';

export interface LedgerRow {
  id: string;
  organization_id: string;
  trip_id: string | null;
  /** Resolved from joined trips.trip_number or trip list */
  trip_number?: string | null;
  party_name: string;
  description: string;
  amount_in: number;
  amount_out: number;
  transaction_date: string;
  created_at: string;
  /** From cash_entries for entity tab aggregation */
  contact_id?: string | null;
  contact_type?: 'client' | 'supplier' | 'driver' | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  trips?: { trip_number: string; display_trip_id?: string | null } | null;
}

export interface CreateLedgerEntryData {
  trip_id?: string | null;
  trip_number?: string | null;
  /** Party display name; stored as contact_name */
  party_name: string;
  description: string;
  amount_in: number;
  amount_out: number;
  transaction_date?: string;
  /** When provided, stored on cash_entries for aggregation and auto-tag */
  contact_id?: string | null;
  contact_type?: 'client' | 'supplier' | 'driver' | null;
  category?: string | null;
  indent_id?: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
}

export async function getTransactionsByOrganization(
  orgId: string,
  opts?: PageOpts
): Promise<{ error: Error | null; transactions: LedgerRow[]; hasMore?: boolean }> {
  const q = supabase()
    .from('transactions')
    .select('*')
    .eq('organization_id', orgId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (opts != null) {
    const limit = opts.limit ?? LEDGER_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await q.range(offset, offset + limit);
    if (error) return { error: new Error(error.message), transactions: [] };
    const rows = (data ?? []) as Array<{
      id: string;
      organization_id: string;
      trip_id: string | null;
      party_name: string | null;
      description: string | null;
      amount_in: number;
      amount_out: number;
      transaction_date: string;
      created_at: string;
      contact_id: string | null;
      contact_type: string | null;
      vehicle_number?: string | null;
      driver_name?: string | null;
      trips?: { trip_number: string } | null;
    }>;
    const transactions: LedgerRow[] = rows.slice(0, limit).map((row) => {
      const tripNumber = row.trips?.trip_number ?? null;
      return {
        id: row.id,
        organization_id: row.organization_id,
        trip_id: row.trip_id ?? null,
        trip_number: tripNumber,
        party_name: row.party_name ?? '—',
        description: row.description ?? 'ENTRY',
        amount_in: Number(row.amount_in ?? 0),
        amount_out: Number(row.amount_out ?? 0),
        transaction_date: row.transaction_date,
        created_at: row.created_at,
        contact_id: row.contact_id ?? null,
        contact_type: (row.contact_type as LedgerRow['contact_type']) ?? null,
        vehicle_number: row.vehicle_number ?? null,
        driver_name: row.driver_name ?? null,
        trips: row.trips ? { trip_number: row.trips.trip_number, display_trip_id: row.trips.trip_number } : null,
      };
    });
    return { error: null, transactions, hasMore: rows.length > limit };
  }

  const { data, error } = await q;
  if (error) return { error: new Error(error.message), transactions: [] };

  const rows = (data ?? []) as Array<{
    id: string;
    organization_id: string;
    trip_id: string | null;
    party_name: string | null;
    description: string | null;
    amount_in: number;
    amount_out: number;
    transaction_date: string;
    created_at: string;
    contact_id: string | null;
    contact_type: string | null;
    vehicle_number?: string | null;
    driver_name?: string | null;
    trips?: { trip_number: string } | null;
  }>;

  const transactions: LedgerRow[] = rows.map((row) => {
    const tripNumber = row.trips?.trip_number ?? null;
    return {
      id: row.id,
      organization_id: row.organization_id,
      trip_id: row.trip_id ?? null,
      trip_number: tripNumber,
      party_name: row.party_name ?? '—',
      description: row.description ?? 'ENTRY',
      amount_in: Number(row.amount_in ?? 0),
      amount_out: Number(row.amount_out ?? 0),
      transaction_date: row.transaction_date,
      created_at: row.created_at,
      contact_id: row.contact_id ?? null,
      contact_type: (row.contact_type as LedgerRow['contact_type']) ?? null,
      vehicle_number: row.vehicle_number ?? null,
      driver_name: row.driver_name ?? null,
      trips: row.trips ? { trip_number: row.trips.trip_number, display_trip_id: row.trips.trip_number } : null,
    };
  });

  return { error: null, transactions };
}

/** Fetch ledger transactions for a specific party (client/entity level). */
export async function getTransactionsByOrganizationAndParty(
  orgId: string,
  partyName: string
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  if (!partyName?.trim()) return getTransactionsByOrganization(orgId);
  const { data, error } = await supabase()
    .from('transactions')
    .select('*, trips(trip_number)')
    .eq('organization_id', orgId)
    .ilike('party_name', `%${partyName.trim()}%`)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), transactions: [] };
  const rows = (data ?? []) as LedgerRow[];
  for (const row of rows) {
    if (row.trips?.trip_number) row.trip_number = row.trips.trip_number;
  }
  return { error: null, transactions: rows };
}

/** Fetch ledger transactions for a specific contact (client/supplier id). Used for dispute audit. */
export async function getTransactionsByOrganizationAndContactId(
  orgId: string,
  contactId: string
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  if (!contactId?.trim()) return { error: null, transactions: [] };
  const { data, error } = await supabase()
    .from('transactions')
    .select('*, trips(trip_number)')
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), transactions: [] };
  const rows = (data ?? []) as LedgerRow[];
  for (const row of rows) {
    if (row.trips?.trip_number) row.trip_number = row.trips.trip_number;
  }
  return { error: null, transactions: rows };
}

/** Fetch ledger transactions for a driver (contact_type=driver, contact_id=driverId). Used for driver LEDGER tab. */
export async function getTransactionsByOrganizationAndDriver(
  orgId: string,
  driverId: string
): Promise<{ error: Error | null; transactions: LedgerRow[] }> {
  if (!driverId?.trim()) return { error: null, transactions: [] };
  const { data, error } = await supabase()
    .from('transactions')
    .select('*, trips(trip_number)')
    .eq('organization_id', orgId)
    .eq('contact_type', 'driver')
    .eq('contact_id', driverId.trim())
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) return { error: new Error(error.message), transactions: [] };
  const rows = (data ?? []) as Array<{
    id: string;
    organization_id: string;
    trip_id: string | null;
    party_name: string | null;
    description: string | null;
    amount_in: number;
    amount_out: number;
    transaction_date: string;
    created_at: string;
    contact_id: string | null;
    contact_type: string | null;
    vehicle_number?: string | null;
    driver_name?: string | null;
    trips?: { trip_number: string } | null;
  }>;
  const transactions: LedgerRow[] = rows.map((row) => {
    const tripNumber = row.trips?.trip_number ?? null;
    return {
      id: row.id,
      organization_id: row.organization_id,
      trip_id: row.trip_id ?? null,
      trip_number: tripNumber,
      party_name: row.party_name ?? '—',
      description: row.description ?? 'ENTRY',
      amount_in: Number(row.amount_in ?? 0),
      amount_out: Number(row.amount_out ?? 0),
      transaction_date: row.transaction_date,
      created_at: row.created_at,
      contact_id: row.contact_id ?? null,
      contact_type: (row.contact_type as LedgerRow['contact_type']) ?? null,
      vehicle_number: row.vehicle_number ?? null,
      driver_name: row.driver_name ?? null,
      trips: row.trips ? { trip_number: row.trips.trip_number, display_trip_id: row.trips.trip_number } : null,
    };
  });
  return { error: null, transactions };
}

export async function createLedgerEntry(
  orgId: string,
  entry: CreateLedgerEntryData
): Promise<{ error: Error | null; row: LedgerRow | null }> {
  const amountIn = Math.max(0, Math.min(VALIDATION.AMOUNT_MAX, entry.amount_in ?? 0));
  const amountOut = Math.max(0, Math.min(VALIDATION.AMOUNT_MAX, entry.amount_out ?? 0));
  const rawDate = (entry.transaction_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const dateErr = dateISO()(rawDate);
  const date = dateErr ? new Date().toISOString().slice(0, 10) : rawDate;
  const partyName = ((entry.party_name || '—').trim() || '—').slice(0, VALIDATION.PARTY_NAME_MAX_LENGTH);
  const description = (entry.description ?? 'ENTRY').slice(0, VALIDATION.DESCRIPTION_MAX_LENGTH);
  // DB CHECK: exactly one of amount_in or amount_out must be positive
  const isCashIn = amountIn > 0;

  const payload = {
    organization_id: orgId,
    trip_id: entry.trip_id ?? null,
    party_name: partyName,
    description,
    amount_in: isCashIn ? amountIn : 0,
    amount_out: isCashIn ? 0 : amountOut,
    transaction_date: date,
    contact_id: entry.contact_id ?? null,
    contact_type: entry.contact_type ?? null,
  };

  const { data, error } = await supabase()
    .from('transactions')
    .insert(payload)
    .select('*, trips(trip_number)')
    .single();

  if (error) return { error: new Error(error.message), row: null };

  const row = data as {
    id: string;
    organization_id: string;
    trip_id: string | null;
    party_name: string | null;
    description: string | null;
    amount_in: number;
    amount_out: number;
    transaction_date: string;
    created_at: string;
    contact_id: string | null;
    contact_type: string | null;
    vehicle_number?: string | null;
    driver_name?: string | null;
    trips?: { trip_number: string } | null;
  };

  const tripNumber = row.trips?.trip_number ?? null;
  const ledgerRow: LedgerRow = {
    id: row.id,
    organization_id: row.organization_id,
    trip_id: row.trip_id ?? null,
    trip_number: tripNumber,
    party_name: row.party_name ?? '—',
    description: row.description ?? 'ENTRY',
    amount_in: Number(row.amount_in ?? 0),
    amount_out: Number(row.amount_out ?? 0),
    transaction_date: row.transaction_date,
    created_at: row.created_at,
    contact_id: row.contact_id ?? null,
    contact_type: (row.contact_type as LedgerRow['contact_type']) ?? null,
    vehicle_number: row.vehicle_number ?? null,
    driver_name: row.driver_name ?? null,
    trips: row.trips ? { trip_number: row.trips.trip_number, display_trip_id: row.trips.trip_number } : null,
  };

  return { error: null, row: ledgerRow };
}

export async function updateLedgerEntry(
  orgId: string,
  entryId: string,
  entry: CreateLedgerEntryData
): Promise<{ error: Error | null; row: LedgerRow | null }> {
  const amountIn = Math.max(0, Math.min(VALIDATION.AMOUNT_MAX, entry.amount_in ?? 0));
  const amountOut = Math.max(0, Math.min(VALIDATION.AMOUNT_MAX, entry.amount_out ?? 0));
  const rawDate = (entry.transaction_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const date = dateISO()(rawDate) ? new Date().toISOString().slice(0, 10) : rawDate;
  const isCashIn = amountIn > 0;
  const partyName = ((entry.party_name || '—').trim() || '—').slice(0, VALIDATION.PARTY_NAME_MAX_LENGTH);
  const description = (entry.description ?? 'ENTRY').slice(0, VALIDATION.DESCRIPTION_MAX_LENGTH);

  const payload = {
    trip_id: entry.trip_id ?? null,
    party_name: partyName,
    description,
    amount_in: isCashIn ? amountIn : 0,
    amount_out: isCashIn ? 0 : amountOut,
    transaction_date: date,
    contact_id: entry.contact_id ?? null,
    contact_type: entry.contact_type ?? null,
  };

  const { data, error } = await supabase()
    .from('transactions')
    .update(payload)
    .eq('id', entryId)
    .eq('organization_id', orgId)
    .select('*, trips(trip_number)')
    .single();

  if (error) return { error: new Error(error.message), row: null };
  if (!data) return { error: new Error('Update returned no row'), row: null };

  const row = data as {
    id: string;
    organization_id: string;
    trip_id: string | null;
    party_name: string | null;
    description: string | null;
    amount_in: number;
    amount_out: number;
    transaction_date: string;
    created_at: string;
    contact_id: string | null;
    contact_type: string | null;
    vehicle_number?: string | null;
    driver_name?: string | null;
    trips?: { trip_number: string } | null;
  };

  const tripNumber = row.trips?.trip_number ?? null;
  const ledgerRow: LedgerRow = {
    id: row.id,
    organization_id: row.organization_id,
    trip_id: row.trip_id ?? null,
    trip_number: tripNumber,
    party_name: row.party_name ?? '—',
    description: row.description ?? 'ENTRY',
    amount_in: Number(row.amount_in ?? 0),
    amount_out: Number(row.amount_out ?? 0),
    transaction_date: row.transaction_date,
    created_at: row.created_at,
    contact_id: row.contact_id ?? null,
    contact_type: (row.contact_type as LedgerRow['contact_type']) ?? null,
    vehicle_number: row.vehicle_number ?? null,
    driver_name: row.driver_name ?? null,
    trips: row.trips ? { trip_number: row.trips.trip_number, display_trip_id: row.trips.trip_number } : null,
  };

  return { error: null, row: ledgerRow };
}
