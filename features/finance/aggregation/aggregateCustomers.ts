/**
 * O(n) customer aggregation. Single source: received = ledger only; billed = trips + pre-trip indents.
 * Pending = sum of per-trip due (aligns with ClientDetailScreen). Overpayment on one trip does not reduce
 * due on another. Ledger-only parties: pending from amount_out. Per-trip attribution: amount_in with
 * trip_id → that trip; unlinked client tx → trip with largest due.
 * Pass 4: indents not yet converted to a trip add client_price to billing.
 */
import type { FinancialRowData, AggregationTotals } from './types';
import type { LedgerTx, TripForCustomer, ClientLike, TripPartyMap, IndentForAggregation } from './types';
import { buildUniqueLinkedOrgIdMap, isLoadBasedTrip } from '@/features/trips/visibility/tripVisibility';
import { allocateAmountsToLargestDueTrips } from '@/features/finance/utils/allocateToLargestDue';

function toNameKey(name: string): string {
  return (name || '').toLowerCase().trim();
}

function normId(id: string | null | undefined): string {
  return id == null ? '' : String(id).trim().toLowerCase();
}

function getClientDisplayName(c: ClientLike): string {
  return (c.name || c.contact_person || 'Unnamed').trim() || 'Unnamed';
}

/** Line 1: org name when present, else display name. Contact person is shown on line 2 (contactPerson). */
function getClientRowName(c: ClientLike): string {
  const org = (c.name ?? '').trim();
  if (org) return org;
  return getClientDisplayName(c);
}

/** Per-trip data for a client. */
interface ClientTripInfo {
  tripId: string;
  sales: number;
  amountPaid: number;
}

export function aggregateCustomers(
  clients: ClientLike[],
  trips: TripForCustomer[],
  transactions: LedgerTx[],
  tripPartyMap?: TripPartyMap | null,
  indents?: IndentForAggregation[]
): { rows: FinancialRowData[]; totals: AggregationTotals } {
  const ledgerByClientId: Record<string, { received: number; pending: number }> = {};
  const ledgerByPartyName: Record<string, { displayName: string; received: number; pending: number }> = {};

  // Single pass: ledger (customer-related only). Received = amount_in, pending = amount_out.
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (tx.contact_type === 'driver' || tx.contact_type === 'supplier') continue;
    if (tx.contact_type !== 'client') continue;

    const amtIn = Number(tx.amount_in ?? 0);
    const amtOut = Number(tx.amount_out ?? 0);

    if (tx.contact_type === 'client' && tx.contact_id) {
      const cid = tx.contact_id;
      if (!ledgerByClientId[cid]) ledgerByClientId[cid] = { received: 0, pending: 0 };
      ledgerByClientId[cid].received += amtIn;
      ledgerByClientId[cid].pending += amtOut;
    } else if (
      tx.contact_type === 'client' &&
      tx.trip_id &&
      tripPartyMap &&
      tripPartyMap[tx.trip_id]?.client_id
    ) {
      // Fallback: client tx with trip_id but no contact_id → attribute to trip's client. Non-client tx (e.g. vehicle maintenance) must not inflate customer due.
      const cid = tripPartyMap[tx.trip_id]!.client_id!;
      if (!ledgerByClientId[cid]) ledgerByClientId[cid] = { received: 0, pending: 0 };
      ledgerByClientId[cid].received += amtIn;
      ledgerByClientId[cid].pending += amtOut;
    } else {
      const name = (tx.party_name || '').trim() || '—';
      if (name !== '—') {
        const key = toNameKey(name);
        if (!ledgerByPartyName[key]) ledgerByPartyName[key] = { displayName: name, received: 0, pending: 0 };
        ledgerByPartyName[key].received += amtIn;
        ledgerByPartyName[key].pending += amtOut;
      }
    }
  }

  const clientNameKeys = new Set<string>();
  const clientIdByNameKey: Record<string, string> = {};
  for (let i = 0; i < clients.length; i++) {
    const k = toNameKey(getClientDisplayName(clients[i]));
    if (k) {
      clientNameKeys.add(k);
      clientIdByNameKey[k] = clients[i].id;
    }
  }
  const linkedClientIdByOrgId = buildUniqueLinkedOrgIdMap(clients);

  const tripCount: Record<string, number> = {};
  const billedByClientId: Record<string, number> = {};
  const tripsByClientId: Record<string, ClientTripInfo[]> = {};
  for (let i = 0; i < clients.length; i++) {
    const id = clients[i].id;
    tripCount[id] = 0;
    billedByClientId[id] = 0;
    tripsByClientId[id] = [];
  }

  // Single pass: trips -> billed, trip count, and per-trip list per client.
  // Priority:
  // 1) Trip owner view: attribute by client_id (or by name fallback) using client_price.
  // 2) Supplier view (integrated): when we are the supplier, attribute by linked_organization_id === trip.organization_id
  //    using supplier_rate (amount shipper owes supplier).
  for (let i = 0; i < trips.length; i++) {
    const t = trips[i];
    const nameKey = toNameKey(t.client_name || '');

    // 1) Direct client on trip (trip owner perspective).
    let clientId: string | null | undefined =
      t.client_id ??
      (nameKey ? clientIdByNameKey[nameKey] : undefined);

    let useSupplierRate = false;

    // 2) When no direct client match, attribute to integrated shipper when we are supplier:
    //    client.linked_organization_id === trip.organization_id.
    if (clientId == null && t.organization_id && isLoadBasedTrip(t)) {
      const linkedClientId = linkedClientIdByOrgId.get(t.organization_id) ?? null;
      if (linkedClientId) {
        clientId = linkedClientId;
        useSupplierRate = true;
      }
    }

    if (clientId == null) continue;

    // Trips can reference a client_id that's not present in the loaded clients list (e.g. cross-org trips).
    // Ensure per-client buckets exist before incrementing/pushing.
    if (!tripsByClientId[clientId]) tripsByClientId[clientId] = [];

    // 3) Only use supplier_rate when we are the supplier (linkedClient match). For trips we own (client_id/name
    //    match), always use client_price — even if trip has indent_id. Client Detail uses same rule.
    //    Removed: if (t.indent_id != null) useSupplierRate = true — that incorrectly used supplier_rate for
    //    our own indent-origin trips, causing billing/due mismatch (e.g. 44k vs 47k, 21k vs 24k).
    const billedAmount = useSupplierRate
      ? Number(t.supplier_rate ?? 0)
      : Number(t.client_price ?? 0);
    if (!billedAmount) continue;

    tripCount[clientId] = (tripCount[clientId] ?? 0) + 1;
    billedByClientId[clientId] = (billedByClientId[clientId] ?? 0) + billedAmount;

    const tripId = normId((t as { id?: string }).id);
    if (tripId) {
      tripsByClientId[clientId].push({
        tripId,
        sales: billedAmount,
        amountPaid: Number((t as { amount_paid?: number }).amount_paid ?? 0),
      });
    }
  }

  // Pass 4 (O(indents)): pre-trip indent billing. For each non-cancelled indent not yet converted to a trip,
  // attribute client_price to the matching client. Uses O(n) Set to prevent double-counting with trips.
  if (indents && indents.length > 0) {
    const indentIdsCoveredByTrips = new Set<string>();
    for (let i = 0; i < trips.length; i++) {
      const id = trips[i].indent_id;
      if (id) indentIdsCoveredByTrips.add(id);
    }
    for (let i = 0; i < indents.length; i++) {
      const indent = indents[i];
      const s = (indent.status || '').toLowerCase();
      if (s === 'cancelled' || s === 'completed') continue;
      if (indentIdsCoveredByTrips.has(indent.id)) continue;
      const nameKey = toNameKey(indent.client_name || '');
      if (!nameKey) continue;
      const clientId = clientIdByNameKey[nameKey] ?? null;
      if (!clientId) continue;
      const amount = Number(indent.client_price ?? 0);
      if (!amount) continue;
      tripCount[clientId] = (tripCount[clientId] ?? 0) + 1;
      billedByClientId[clientId] = (billedByClientId[clientId] ?? 0) + amount;
    }
  }

  // Build trip ID sets per client for per-trip attribution.
  const tripIdsByClientId: Record<string, Set<string>> = {};
  for (const [cid, list] of Object.entries(tripsByClientId)) {
    tripIdsByClientId[cid] = new Set(list.map((x) => x.tripId));
  }

  const rows: FinancialRowData[] = [];
  let totalBilling = 0;
  let totalBalance = 0;

  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const id = c.id;
    const displayName = getClientDisplayName(c);
    const nameKey = toNameKey(displayName);
    const fromLedgerId = ledgerByClientId[id];
    const fromLedgerName = ledgerByPartyName[nameKey];

    const billed = billedByClientId[id] ?? 0;
    const received =
      (fromLedgerId?.received ?? 0) + (fromLedgerName?.received ?? 0);
    const pendingLedger = (fromLedgerId?.pending ?? 0) + (fromLedgerName?.pending ?? 0);
    const clientTrips = tripsByClientId[id] ?? [];
    const clientTripIds = tripIdsByClientId[id];

    let pending: number;
    if (clientTrips.length > 0 && clientTripIds) {
      // Per-trip attribution (aligns with ClientDetailScreen): overpayment on one trip does not reduce due on another.
      const paidByTripId: Record<string, number> = {};
      for (const ct of clientTrips) {
        paidByTripId[ct.tripId] = ct.amountPaid;
      }
      const unlinkedClientAmounts: number[] = [];
      const isClientTx = (tx: LedgerTx) =>
        (tx.contact_id && tx.contact_id === id) ||
        (nameKey && (tx.party_name ?? '').trim().toLowerCase() === nameKey) ||
        (tx.trip_id && tripPartyMap?.[tx.trip_id]?.client_id === id);
      for (let ti = 0; ti < transactions.length; ti++) {
        const tx = transactions[ti];
        if (tx.contact_type === 'driver' || tx.contact_type === 'supplier') continue;
        if (tx.contact_type !== 'client') continue;
        if (!isClientTx(tx)) continue;
        const normalizedTripId = normId(tx.trip_id);
        const txTripKey = normalizedTripId && clientTripIds.has(normalizedTripId) ? normalizedTripId : undefined;
        if (txTripKey !== undefined) {
          paidByTripId[txTripKey] = (paidByTripId[txTripKey] ?? 0) + Number(tx.amount_in ?? 0);
        } else {
          unlinkedClientAmounts.push(Number(tx.amount_in ?? 0));
        }
      }
      const allocatedPaidByTripId = allocateAmountsToLargestDueTrips(
        clientTrips.map((ct) => ({
          tripId: ct.tripId,
          sales: ct.sales,
          paid: paidByTripId[ct.tripId] ?? 0,
        })),
        unlinkedClientAmounts,
      );
      pending = clientTrips.reduce(
        (sum, ct) => sum + Math.max(0, ct.sales - (allocatedPaidByTripId[ct.tripId] ?? 0)),
        0,
      );
    } else {
      // No trips with ids (indent-only or ledger-only): use legacy formula.
      pending = billed > 0 ? Math.max(0, billed - received) : pendingLedger;
    }

    totalBilling += billed;
    totalBalance += pending;

    rows.push({
      id,
      name: getClientRowName(c),
      subline: c.is_integrated === true ? 'INTEGRATED' : c.is_integrated === false ? 'NON_INTEGRATED' : 'SECURE NODE',
      trips: tripCount[id] ?? 0,
      received,
      pending,
      billed,
      is_integrated: c.is_integrated ?? false,
      linked_organization_id: c.linked_organization_id ?? undefined,
      contactPercent: c.contact_percent ?? undefined,
      contactPerson: (c.contact_person ?? '').trim() || undefined,
    });
  }

  for (const [key, tot] of Object.entries(ledgerByPartyName)) {
    if (clientNameKeys.has(key)) continue;
    totalBalance += tot.pending;
    rows.push({
      id: `ledger-party-${key}`,
      name: tot.displayName,
      subline: 'LEDGER',
      trips: 0,
      received: tot.received,
      pending: tot.pending,
    });
  }

  return {
    rows,
    totals: { totalIn: totalBilling, totalOut: totalBalance },
  };
}
