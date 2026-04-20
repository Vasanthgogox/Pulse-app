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
import { getAvatarUriForSeed } from '@/constants/DriverLevels';
import { resolveAvatarPublicUrl } from '@/lib/avatarUpload';

export async function getProfileImage(
  contactId: string | null | undefined,
  contactType: "client" | "supplier" | "driver" | null | undefined,
): Promise<string | null> {
  if (!contactId || !contactType) return null;

  // Only drivers have a user_id → profiles link; clients/suppliers have no direct profile connection.
  if (contactType !== 'driver') return null;

  // Step 1: get user_id from the driver record
  const { data: driverData, error: driverError } = await supabase()
    .from('drivers')
    .select('user_id')
    .eq('id', contactId)
    .maybeSingle();

  if (driverError || !driverData?.user_id) return null;

  // Step 2: get avatar_url + avatar_seed from profiles
  const { data: profileData, error: profileError } = await supabase()
    .from('profiles')
    .select('avatar_url, avatar_seed')
    .eq('id', driverData.user_id)
    .maybeSingle();

  if (profileError || !profileData) return null;

  // Public bucket — resolve synchronously, no signed URL round-trip needed
  const publicUrl = resolveAvatarPublicUrl(profileData.avatar_url);
  if (publicUrl) return publicUrl;

  // Fall back to preset avatar from seed
  const seed = (profileData.avatar_seed ?? '').trim();
  if (!seed) return null;
  return getAvatarUriForSeed(seed);
}

export interface LedgerRow {
  id: string;
  organization_id: string;
  profileImageUrl?: string | null;
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
  primary_category?: string | null;
  payment_mode?: string | null;
  payment_reference?: string | null;
  reconciliation_status?: 'match_found' | 'reconciled' | 'mismatch' | null;
  reconciliation_label?: string | null;
  reconciliation_action_label?: string | null;
  reconciliation_helper_text?: string | null;
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

function normalizePrimaryCategory(raw: string | null | undefined): string {
  const firstPart = String(raw ?? '')
    .split('|')[0]
    ?.trim();
  return firstPart || 'ENTRY';
}

function parsePaymentMode(raw: string | null | undefined): string | null {
  const match = String(raw ?? '').match(/(?:^|\|)\s*Mode:\s*([^|]+)/i);
  return match?.[1]?.trim() || null;
}

function parsePaymentReference(raw: string | null | undefined): string | null {
  const match = String(raw ?? '').match(/(?:^|\|)\s*UTR:\s*([^|]+)/i);
  return match?.[1]?.trim() || null;
}

function deriveReconciliationMeta(row: {
  description?: string | null;
  trip_id?: string | null;
  contact_id?: string | null;
  contact_type?: LedgerRow['contact_type'];
  amount_in?: number;
  amount_out?: number;
}): Pick<
  LedgerRow,
  | 'reconciliation_status'
  | 'reconciliation_label'
  | 'reconciliation_action_label'
  | 'reconciliation_helper_text'
> {
  const description = String(row.description ?? '').toLowerCase();
  if (description.includes('shared ledger sync')) {
    return {
      reconciliation_status: 'reconciled',
      reconciliation_label: 'Reconciled',
      reconciliation_action_label: 'View linked entry',
      reconciliation_helper_text: 'Linked using shared ledger reconciliation.',
    };
  }

  const hasCounterparty = !!row.contact_id && !!row.contact_type;
  const hasTripAnchor = !!row.trip_id;
  const hasMoney = Number(row.amount_in ?? 0) > 0 || Number(row.amount_out ?? 0) > 0;
  if (hasCounterparty && hasTripAnchor && hasMoney) {
    return {
      reconciliation_status: 'match_found',
      reconciliation_label: 'Match found',
      reconciliation_action_label: Number(row.amount_out ?? 0) > 0 ? 'Edit & link' : 'Validate & link',
      reconciliation_helper_text: 'Trip, party, and amount are ready for reconciliation.',
    };
  }

  return {
    reconciliation_status: null,
    reconciliation_label: null,
    reconciliation_action_label: null,
    reconciliation_helper_text: null,
  };
}

function toLedgerRow(row: {
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
}): LedgerRow {
  const tripNumber = row.trips?.trip_number ?? null;
  const description = row.description ?? 'ENTRY';
  return {
    id: row.id,
    organization_id: row.organization_id,
    trip_id: row.trip_id ?? null,
    trip_number: tripNumber,
    party_name: row.party_name ?? '—',
    description,
    amount_in: Number(row.amount_in ?? 0),
    amount_out: Number(row.amount_out ?? 0),
    transaction_date: row.transaction_date,
    created_at: row.created_at,
    contact_id: row.contact_id ?? null,
    contact_type: (row.contact_type as LedgerRow['contact_type']) ?? null,
    vehicle_number: row.vehicle_number ?? null,
    driver_name: row.driver_name ?? null,
    trips: row.trips ? { trip_number: row.trips.trip_number, display_trip_id: row.trips.trip_number } : null,
    profileImageUrl: null,
    primary_category: normalizePrimaryCategory(description),
    payment_mode: parsePaymentMode(description),
    payment_reference: parsePaymentReference(description),
    ...deriveReconciliationMeta({
      description,
      trip_id: row.trip_id,
      contact_id: row.contact_id,
      contact_type: (row.contact_type as LedgerRow['contact_type']) ?? null,
      amount_in: row.amount_in,
      amount_out: row.amount_out,
    }),
  };
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
    const transactions: LedgerRow[] = rows.slice(0, limit).map(toLedgerRow);
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

  const transactions: LedgerRow[] = rows.map(toLedgerRow);

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
  const rows = (data ?? []) as Array<Parameters<typeof toLedgerRow>[0]>;
  return { error: null, transactions: rows.map(toLedgerRow) };
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
  const rows = (data ?? []) as Array<Parameters<typeof toLedgerRow>[0]>;
  return { error: null, transactions: rows.map(toLedgerRow) };
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
  const transactions: LedgerRow[] = rows.map(toLedgerRow);
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

  return { error: null, row: toLedgerRow(row) };
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

  return { error: null, row: toLedgerRow(row) };
}
