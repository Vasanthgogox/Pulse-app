/**
 * Default-trip resolution for auto-tagging cash entries to a client's trip.
 * When user adds a transaction for a client without selecting a trip, we pick one trip
 * deterministically so the entry appears under the correct tab and ledger protocol.
 * O(n log n) in the number of trips for that client (single sort + pick).
 */

/** Minimal trip shape: id required; date fields optional for sorting. */
export interface TripForResolver {
  id: string;
  payment_due_date?: string | null;
  pickup_date?: string | null;
  created_at?: string | null;
}

/**
 * Returns the best default trip_id for a client when transactionDate is given.
 * Rule: prefer the most recent trip by payment_due_date (or pickup_date, then created_at)
 * that is on or before transactionDate; if none, use the earliest trip after transactionDate.
 * Returns null if tripsForClient is empty.
 */
export function resolveDefaultTripForClient(
  _clientId: string,
  transactionDate: string,
  tripsForClient: TripForResolver[]
): string | null {
  if (tripsForClient.length === 0) return null;
  const date = transactionDate.slice(0, 10);

  const withDate = tripsForClient.map((t) => {
    const d =
      (t.payment_due_date ?? t.pickup_date ?? t.created_at ?? "")?.slice(0, 10) ?? "";
    return { id: t.id, date: d || "9999-12-31" };
  });

  const onOrBefore = withDate.filter((t) => t.date <= date);
  const after = withDate.filter((t) => t.date > date);

  if (onOrBefore.length > 0) {
    onOrBefore.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));
    return onOrBefore[0].id;
  }
  if (after.length > 0) {
    after.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return after[0].id;
  }
  return withDate[0].id;
}
