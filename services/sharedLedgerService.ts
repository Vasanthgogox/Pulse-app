/**
 * Shared Ledger service — verified balances, connections, shared entries, disputes.
 * Single bounded context; calls Supabase RPC/tables defined in Q-unified-base.
 * See docs/SHARED_LEDGER_BACKEND_CONTRACT.md for backend contract.
 */
import { supabase } from '@/lib/supabase';

export interface VerifiedBalance {
  partnerKey: string;
  balance: number;
}

export interface SharedLedgerConnection {
  partner_org_id: string;
  contact_id?: string;
}

export interface SharedLedgerEntry {
  id: string;
  amount: number;
  transaction_date: string;
  reference_id?: string;
}

/** Per-trip partner sales (trip charge) and partner paid (bilateral only); excludes supplier expenses from client view. */
export interface SharedLedgerTripSummaryRow {
  trip_id: string;
  partner_sales: number;
  partner_paid: number;
}

export interface DisputeRow {
  id: string;
  transaction_id: string;
  raised_by_org_id: string;
  partner_org_id: string;
  status: 'OPEN' | 'RESOLVED' | 'WITHDRAWN';
  internal_snapshot: number;
  partner_snapshot: number;
  /** Raiser's sales for this trip; when receiver accepts, used to update their ledger. */
  raised_sales?: number;
  /** Raiser's paid for this trip; when receiver accepts, used to update their ledger. */
  raised_paid?: number;
  evidence_url?: string | null;
  reason_code?: string | null;
  proposed_amount?: number | null;
}

export interface CreateDisputePayload {
  orgId: string;
  transaction_id: string;
  partner_org_id: string;
  internal_snapshot: number;
  partner_snapshot: number;
  /** Raiser's sales (so receiver can apply when accepting). */
  raised_sales?: number;
  /** Raiser's paid (so receiver can apply when accepting). */
  raised_paid?: number;
  reason_code?: string;
  evidence_url?: string;
  proposed_amount?: number;
}

/**
 * Get aggregated verified balances per partner for an org.
 * RPC get_verified_balances(org_id) returns { partner_key, balance }[].
 */
export async function getVerifiedBalances(orgId: string): Promise<{
  error: Error | null;
  balances: VerifiedBalance[];
}> {
  const { data, error } = await supabase().rpc('get_verified_balances', {
    org_id: orgId,
  });
  if (error) return { error: new Error(error.message), balances: [] };
  const rows = (Array.isArray(data) ? data : []) as Array<{ partner_key: string; balance: number }>;
  const balances: VerifiedBalance[] = rows.map((r) => ({
    partnerKey: r.partner_key ?? '',
    balance: Number(r.balance ?? 0),
  }));
  return { error: null, balances };
}

/**
 * Get active shared-ledger connections for an org.
 * RPC get_shared_ledger_connections(org_id) or table shared_ledger_connection.
 */
export async function getSharedLedgerConnections(orgId: string): Promise<{
  error: Error | null;
  connections: SharedLedgerConnection[];
}> {
  const { data, error } = await supabase().rpc('get_shared_ledger_connections', {
    org_id: orgId,
  });
  if (!error) {
    const rows = (Array.isArray(data) ? data : []) as Array<{ partner_org_id: string; contact_id?: string }>;
    const connections: SharedLedgerConnection[] = rows.map((r) => ({
      partner_org_id: r.partner_org_id ?? '',
      contact_id: r.contact_id,
    }));
    return { error: null, connections };
  }
  // Fallback: if RPC does not exist yet, try table (RLS may allow read)
  const { data: tableData, error: tableError } = await supabase()
    .from('shared_ledger_connection')
    .select('org_a_id, org_b_id')
    .or(`org_a_id.eq.${orgId},org_b_id.eq.${orgId}`)
    .eq('status', 'ACTIVE');
  if (tableError) return { error: new Error(error.message), connections: [] };
  const rows = (tableData ?? []) as Array<{ org_a_id: string; org_b_id: string }>;
  const connections: SharedLedgerConnection[] = rows.map((row) => ({
    partner_org_id: row.org_a_id === orgId ? row.org_b_id : row.org_a_id,
  }));
  return { error: null, connections };
}

/**
 * Get transaction-level shared ledger entries for a partner (dispute audit).
 * RPC get_shared_ledger_entries(org_id, partner_key).
 */
export async function getSharedLedgerEntriesForPartner(
  orgId: string,
  partnerKey: string
): Promise<{
  error: Error | null;
  entries: SharedLedgerEntry[];
}> {
  const { data, error } = await supabase().rpc('get_shared_ledger_entries', {
    org_id: orgId,
    partner_key: partnerKey,
  });
  if (error) return { error: new Error(error.message), entries: [] };
  const rows = (Array.isArray(data) ? data : []) as Array<{
    id: string;
    amount: number;
    transaction_date: string;
    reference_id?: string;
  }>;
  const entries: SharedLedgerEntry[] = rows.map((r) => ({
    id: r.id ?? '',
    amount: Number(r.amount ?? 0),
    transaction_date: r.transaction_date ?? '',
    reference_id: r.reference_id,
  }));
  return { error: null, entries };
}

/**
 * Get per-trip partner sales (from partner's trip row) and partner paid (bilateral amount_in only).
 * Use for Compare & Verify so client view does not include supplier expenses. RPC: get_shared_ledger_trip_summary.
 */
export async function getSharedLedgerTripSummary(
  orgId: string,
  partnerKey: string
): Promise<{
  error: Error | null;
  rows: SharedLedgerTripSummaryRow[];
}> {
  const { data, error } = await supabase().rpc('get_shared_ledger_trip_summary', {
    org_id: orgId,
    partner_key: partnerKey,
  });
  if (error) return { error: new Error(error.message), rows: [] };
  const raw = (Array.isArray(data) ? data : []) as Array<{
    trip_id: string;
    partner_sales: number;
    partner_paid: number;
  }>;
  const rows: SharedLedgerTripSummaryRow[] = raw.map((r) => ({
    trip_id: r.trip_id ?? '',
    partner_sales: Number(r.partner_sales ?? 0),
    partner_paid: Number(r.partner_paid ?? 0),
  }));
  return { error: null, rows };
}

/**
 * Create a dispute. Backend enforces one OPEN dispute per (transaction_id, org pair).
 */
export async function createDispute(payload: CreateDisputePayload): Promise<{
  error: Error | null;
  disputeId: string | null;
  alreadyInDispute?: boolean;
}> {
  const { data, error } = await supabase()
    .from('dispute')
    .insert({
      raised_by_org_id: payload.orgId,
      transaction_id: payload.transaction_id,
      partner_org_id: payload.partner_org_id,
      internal_snapshot: payload.internal_snapshot,
      partner_snapshot: payload.partner_snapshot,
      raised_sales: payload.raised_sales ?? 0,
      raised_paid: payload.raised_paid ?? 0,
      status: 'OPEN',
      reason_code: payload.reason_code ?? null,
      evidence_url: payload.evidence_url ?? null,
      proposed_amount: payload.proposed_amount ?? null,
    })
    .select('id')
    .single();
  if (error) {
    const alreadyInDispute = error.code === '23505' || /unique|duplicate|already/i.test(error.message);
    return {
      error: new Error(error.message),
      disputeId: null,
      alreadyInDispute,
    };
  }
  const row = data as { id: string } | null;
  return { error: null, disputeId: row?.id ?? null };
}

/**
 * Get disputes for an org, optionally filtered by partner (partner_key or partner_org_id).
 * Used to show "Dispute active" per row.
 */
export async function getDisputesForPartner(
  orgId: string,
  partnerKeyOrOrgId: string
): Promise<{ error: Error | null; disputes: DisputeRow[] }> {
  const { data, error } = await supabase()
    .from('dispute')
    .select('id, transaction_id, raised_by_org_id, partner_org_id, status, internal_snapshot, partner_snapshot, raised_sales, raised_paid, evidence_url, reason_code, proposed_amount')
    .eq('raised_by_org_id', orgId)
    .eq('partner_org_id', partnerKeyOrOrgId);
  if (error) return { error: new Error(error.message), disputes: [] };
  const rows = (data ?? []) as Array<{
    id: string;
    transaction_id: string;
    raised_by_org_id: string;
    partner_org_id: string;
    status: string;
    internal_snapshot: number;
    partner_snapshot: number;
    raised_sales?: number | null;
    raised_paid?: number | null;
    evidence_url?: string | null;
    reason_code?: string | null;
    proposed_amount?: number | null;
  }>;
  const disputes: DisputeRow[] = rows.map((r) => ({
    id: r.id,
    transaction_id: r.transaction_id,
    raised_by_org_id: r.raised_by_org_id,
    partner_org_id: r.partner_org_id,
    status: r.status as DisputeRow['status'],
    internal_snapshot: Number(r.internal_snapshot ?? 0),
    partner_snapshot: Number(r.partner_snapshot ?? 0),
    raised_sales: r.raised_sales != null ? Number(r.raised_sales) : undefined,
    raised_paid: r.raised_paid != null ? Number(r.raised_paid) : undefined,
    evidence_url: r.evidence_url,
    reason_code: r.reason_code,
    proposed_amount: r.proposed_amount != null ? Number(r.proposed_amount) : null,
  }));
  return { error: null, disputes };
}

/**
 * Get all open disputes for an org (to build disputesByPartner map).
 */
export async function getOpenDisputesByOrg(orgId: string): Promise<{
  error: Error | null;
  disputes: DisputeRow[];
}> {
  const { data, error } = await supabase()
    .from('dispute')
    .select('id, transaction_id, raised_by_org_id, partner_org_id, status, internal_snapshot, partner_snapshot, raised_sales, raised_paid, evidence_url, reason_code, proposed_amount')
    .eq('raised_by_org_id', orgId)
    .eq('status', 'OPEN');
  if (error) return { error: new Error(error.message), disputes: [] };
  const rows = (data ?? []) as Array<{
    id: string;
    transaction_id: string;
    raised_by_org_id: string;
    partner_org_id: string;
    status: string;
    internal_snapshot: number;
    partner_snapshot: number;
    raised_sales?: number | null;
    raised_paid?: number | null;
    evidence_url?: string | null;
    reason_code?: string | null;
    proposed_amount?: number | null;
  }>;
  const disputes: DisputeRow[] = rows.map((r) => ({
    id: r.id,
    transaction_id: r.transaction_id,
    raised_by_org_id: r.raised_by_org_id,
    partner_org_id: r.partner_org_id,
    status: r.status as DisputeRow['status'],
    internal_snapshot: Number(r.internal_snapshot ?? 0),
    partner_snapshot: Number(r.partner_snapshot ?? 0),
    raised_sales: r.raised_sales != null ? Number(r.raised_sales) : undefined,
    raised_paid: r.raised_paid != null ? Number(r.raised_paid) : undefined,
    evidence_url: r.evidence_url,
    reason_code: r.reason_code,
    proposed_amount: r.proposed_amount != null ? Number(r.proposed_amount) : null,
  }));
  return { error: null, disputes };
}

/**
 * Get disputes received by this org (partner_org_id = orgId, status OPEN).
 */
export async function getDisputesReceived(orgId: string): Promise<{
  error: Error | null;
  disputes: DisputeRow[];
}> {
  const { data, error } = await supabase()
    .from('dispute')
    .select('id, transaction_id, raised_by_org_id, partner_org_id, status, internal_snapshot, partner_snapshot, raised_sales, raised_paid, evidence_url, reason_code, proposed_amount')
    .eq('partner_org_id', orgId)
    .eq('status', 'OPEN');
  if (error) return { error: new Error(error.message), disputes: [] };
  const rows = (data ?? []) as Array<{
    id: string;
    transaction_id: string;
    raised_by_org_id: string;
    partner_org_id: string;
    status: string;
    internal_snapshot: number;
    partner_snapshot: number;
    raised_sales?: number | null;
    raised_paid?: number | null;
    evidence_url?: string | null;
    reason_code?: string | null;
    proposed_amount?: number | null;
  }>;
  const disputes: DisputeRow[] = rows.map((r) => ({
    id: r.id,
    transaction_id: r.transaction_id,
    raised_by_org_id: r.raised_by_org_id,
    partner_org_id: r.partner_org_id,
    status: r.status as DisputeRow['status'],
    internal_snapshot: Number(r.internal_snapshot ?? 0),
    partner_snapshot: Number(r.partner_snapshot ?? 0),
    raised_sales: r.raised_sales != null ? Number(r.raised_sales) : undefined,
    raised_paid: r.raised_paid != null ? Number(r.raised_paid) : undefined,
    evidence_url: r.evidence_url,
    reason_code: r.reason_code,
    proposed_amount: r.proposed_amount != null ? Number(r.proposed_amount) : null,
  }));
  return { error: null, disputes };
}

/**
 * Resolve a dispute (receiver side). ACCEPT or DECLINE.
 * Prefers RPC resolve_dispute (updates receiver ledger on ACCEPT then marks RESOLVED).
 * If RPC is missing, returns error so caller can fall back to acceptPartnerView + resolveDisputeTableOnly.
 */
export async function resolveDispute(
  disputeId: string,
  action: 'ACCEPT' | 'DECLINE',
  resolvedByOrgId: string
): Promise<{ error: Error | null; rpcUnavailable?: boolean }> {
  const { error } = await supabase().rpc('resolve_dispute', {
    p_dispute_id: disputeId,
    p_action: action,
    p_resolved_by_org_id: resolvedByOrgId,
  });
  if (error) {
    const rpcUnavailable =
      /could not find the function|function.*resolve_dispute.*does not exist|relation.*does not exist/i.test(
        error.message
      );
    return { error: new Error(error.message), rpcUnavailable };
  }
  return { error: null };
}

/**
 * Mark dispute as RESOLVED (table update only). Use when RPC resolve_dispute is not available
 * and caller has already updated the ledger via acceptPartnerView.
 */
export async function resolveDisputeTableOnly(
  disputeId: string,
  resolvedByOrgId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase()
    .from('dispute')
    .update({ status: 'RESOLVED' })
    .eq('id', disputeId)
    .eq('partner_org_id', resolvedByOrgId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/**
 * Self-correct: accept partner's numbers and update our ledger for this trip (no dispute).
 * contactId: when provided, only that contact's transactions for the trip are updated (recommended for Compare & Verify).
 */
export async function acceptPartnerView(
  orgId: string,
  tripId: string,
  partnerSales: number,
  partnerPaid: number,
  contactId?: string | null
): Promise<{ error: Error | null }> {
  const payload: {
    org_id: string;
    trip_id: string;
    partner_sales: number;
    partner_paid: number;
    contact_id?: string | null;
  } = {
    org_id: orgId,
    trip_id: tripId,
    partner_sales: partnerSales,
    partner_paid: partnerPaid,
  };
  if (contactId != null) payload.contact_id = contactId;
  const { error } = await supabase().rpc('accept_partner_view', payload);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
