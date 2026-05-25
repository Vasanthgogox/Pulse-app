/**
 * Client Feed service — "From Your Clients" distributed bookkeeping feed.
 *
 * Responsibility (bounded context):
 *   Aggregate integrated-client ledger entries (via sharedLedgerService) that reference
 *   trips this supplier owns, and classify each against the local ledger so the UI can
 *   present the correct one-tap action (Add / Link / Review / Dispute).
 *
 * Design notes:
 *   - No new tables/migrations here; we reuse the shared-ledger RPC contract already
 *     shipped in Q-unified-base.
 *   - Duplicate detection is deliberately light: same trip_id + amount within
 *     a 7-day window counts as a strong match; amount-only on same trip is a soft match.
 *   - Local "already actioned" state (Added / Linked / Ignored / Disputed) is kept in
 *     AsyncStorage (see clientFeedLocalStatus.ts) so we don't require extra DB state
 *     and can ship immediately.
 */
import {
  getSharedLedgerConnections,
  getSharedLedgerEntriesForPartner,
} from "@/features/finance/services/sharedLedger.service";
import { getClientsByOrganization } from "@/features/clients/services/clients.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { ClientFeedLocalStatus } from "../lib/clientFeedLocalStatus";

export type ClientFeedMatchKind =
  /** No candidate local entry — supplier can one-tap add. */
  | "NEW"
  /** Same trip + amount (within date window) → one-tap link & reconcile. */
  | "DUPLICATE"
  /** Same trip but amounts differ → Adjust & Add, or Raise Dispute. */
  | "MISMATCH"
  /** Already actioned (added/linked/ignored/disputed). */
  | "ACTIONED";

export type ClientFeedEntryType = "PAYMENT" | "ADVANCE" | "EXPENSE";

export interface ClientFeedEntry {
  /** Stable id from the shared-ledger entry (partner_org + txn id). Used to persist local status. */
  id: string;
  /** Partner (client) organization id as returned by the RPC. */
  partnerKey: string;
  /** Our local contact row for this partner (clients table), when resolvable. */
  contactId: string | null;
  clientName: string;
  amount: number;
  transactionDate: string;
  /** Trip id if the partner entry referenced one (used for matching + display). */
  tripId: string | null;
  /** Inferred semantic type for UI chips. Derived from sign + heuristics. */
  type: ClientFeedEntryType;
  /** Strongest classification based on local ledger + local status. */
  match: ClientFeedMatchKind;
  /** Candidate local entry used for LINK/REVIEW. Empty when match==="NEW". */
  candidate: LedgerRow | null;
  /** Absolute variance amount when match==="MISMATCH", else 0. */
  variance: number;
  /** Local per-entry status (if any) — drives "ACTIONED" header chip. */
  localStatus: ClientFeedLocalStatus | null;
}

export interface ClientFeedBundle {
  entries: ClientFeedEntry[];
  /** Rollup of counts by match kind — drives home/badge counters. */
  counts: Record<ClientFeedMatchKind, number>;
  /** Unique client ids present in the feed (for entity filters / chips). */
  clientIds: string[];
  /** Unread (actionable) count — NEW + DUPLICATE + MISMATCH. */
  unreadCount: number;
}

export interface FetchClientFeedOpts {
  /** Current supplier org id (viewer). */
  orgId: string;
  /** Local ledger (already fetched by parent) used for duplicate detection. */
  localLedger: LedgerRow[];
  /** Per-entry local status map keyed by ClientFeedEntry.id. */
  localStatusByEntryId: Record<string, ClientFeedLocalStatus>;
}

/**
 * 7-day window for "close enough" date matching. Entries outside this window on the same
 * trip still count as soft matches if the amount matches, but are flagged as MISMATCH for
 * the user to review (a different leg / top-up / partial payment).
 */
const DATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  return Math.abs(ta - tb);
}

function inferEntryType(amount: number): ClientFeedEntryType {
  // Positive amount from the client = payment received by the supplier.
  // Zero/negative is rare; treat as ADVANCE by default.
  if (amount >= 1000) return "PAYMENT";
  if (amount > 0) return "ADVANCE";
  return "EXPENSE";
}

/**
 * Classify a single feed entry against the local ledger.
 * Rules (in order):
 *   1. local status present → ACTIONED
 *   2. trip_id + amount match within DATE_WINDOW_MS → DUPLICATE (one-tap link)
 *   3. trip_id match only (amount differs) → MISMATCH (compare + adjust / dispute)
 *   4. otherwise → NEW (one-tap add)
 */
function classify(
  entry: {
    tripId: string | null;
    amount: number;
    transactionDate: string;
  },
  localLedger: LedgerRow[],
  localStatus: ClientFeedLocalStatus | null,
): { match: ClientFeedMatchKind; candidate: LedgerRow | null; variance: number } {
  if (localStatus) {
    return { match: "ACTIONED", candidate: null, variance: 0 };
  }
  if (!entry.tripId) {
    return { match: "NEW", candidate: null, variance: 0 };
  }
  const tripId = entry.tripId;
  const tripLocal = localLedger.filter(
    (r) => String(r.trip_id ?? "").toLowerCase() === tripId.toLowerCase(),
  );
  if (tripLocal.length === 0) {
    return { match: "NEW", candidate: null, variance: 0 };
  }
  // Strong match: same trip + same amount (within the date window).
  const strong = tripLocal.find((r) => {
    const localAmt = Number(r.amount_in ?? 0) || Number(r.amount_out ?? 0);
    return (
      Math.abs(localAmt - entry.amount) < 0.5 &&
      daysBetween(r.transaction_date, entry.transactionDate) <= DATE_WINDOW_MS
    );
  });
  if (strong) {
    return { match: "DUPLICATE", candidate: strong, variance: 0 };
  }
  // Soft match: same trip, different amount → show compare + adjust / dispute.
  const soft = [...tripLocal].sort(
    (a, b) =>
      daysBetween(a.transaction_date, entry.transactionDate) -
      daysBetween(b.transaction_date, entry.transactionDate),
  )[0];
  const localAmt = Number(soft.amount_in ?? 0) || Number(soft.amount_out ?? 0);
  return {
    match: "MISMATCH",
    candidate: soft,
    variance: Math.abs(localAmt - entry.amount),
  };
}

/**
 * Fetch + classify feed entries for the current org.
 * Returns an empty bundle (not an error) when there are no integrated clients.
 */
export async function fetchClientFeed(
  opts: FetchClientFeedOpts,
): Promise<{ error: Error | null; bundle: ClientFeedBundle }> {
  const { orgId, localLedger, localStatusByEntryId } = opts;
  const empty: ClientFeedBundle = {
    entries: [],
    counts: { NEW: 0, DUPLICATE: 0, MISMATCH: 0, ACTIONED: 0 },
    clientIds: [],
    unreadCount: 0,
  };
  if (!orgId) return { error: null, bundle: empty };

  // 1. Resolve integrated clients for this org (so we can show names + contact_ids).
  const { clients } = await getClientsByOrganization(orgId);
  const integratedClients = clients.filter(
    (c) => !!c.linked_organization_id || !!c.is_integrated,
  );
  if (integratedClients.length === 0) {
    return { error: null, bundle: empty };
  }

  // 2. Get shared-ledger connections to ensure we only read from connected partners.
  await getSharedLedgerConnections(orgId); // best-effort warm-up; RLS enforced server-side

  // 3. Fan out partner-entry reads. Prefer linked_organization_id; fall back to contact_id.
  const results = await Promise.all(
    integratedClients.map(async (client) => {
      const partnerKey =
        (client.linked_organization_id ?? client.id ?? "").trim();
      if (!partnerKey) return { client, entries: [] };
      const { entries } = await getSharedLedgerEntriesForPartner(
        orgId,
        partnerKey,
      );
      return { client, entries };
    }),
  );

  // 4. Flatten + classify.
  const feedEntries: ClientFeedEntry[] = [];
  const clientIdSet = new Set<string>();
  for (const r of results) {
    if (!r.entries.length) continue;
    clientIdSet.add(r.client.id);
    for (const e of r.entries) {
      const id = `${r.client.linked_organization_id ?? r.client.id}:${e.id}`;
      const tripId = e.reference_id?.trim() || null;
      const amount = Number(e.amount ?? 0);
      const localStatus = localStatusByEntryId[id] ?? null;
      const cls = classify(
        { tripId, amount, transactionDate: e.transaction_date },
        localLedger,
        localStatus,
      );
      feedEntries.push({
        id,
        partnerKey: r.client.linked_organization_id ?? r.client.id,
        contactId: r.client.id,
        clientName:
          r.client.name ||
          r.client.contact_person ||
          "Client",
        amount,
        transactionDate: e.transaction_date,
        tripId,
        type: inferEntryType(amount),
        match: cls.match,
        candidate: cls.candidate,
        variance: cls.variance,
        localStatus,
      });
    }
  }

  // 5. Sort newest first, compute rollups.
  feedEntries.sort(
    (a, b) =>
      new Date(b.transactionDate).getTime() -
      new Date(a.transactionDate).getTime(),
  );
  const counts: Record<ClientFeedMatchKind, number> = {
    NEW: 0,
    DUPLICATE: 0,
    MISMATCH: 0,
    ACTIONED: 0,
  };
  for (const e of feedEntries) counts[e.match] += 1;
  const unreadCount = counts.NEW + counts.DUPLICATE + counts.MISMATCH;

  return {
    error: null,
    bundle: {
      entries: feedEntries,
      counts,
      clientIds: Array.from(clientIdSet),
      unreadCount,
    },
  };
}
