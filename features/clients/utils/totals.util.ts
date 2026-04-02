export interface ClientForTotals {
  id: string;
  name?: string | null;
  contact_person?: string | null;
}

export interface TripForClientTotals {
  client_id?: string | null;
  client_name?: string | null;
  client_price?: number;
  supplier_rate?: number;
}

export interface ClientTotalsMap {
  get: number;
  give: number;
}

/** Per-client get (client_price) and give (supplier_rate) from trips. Matches by client_id or client_name. */
export function computeClientTotals(
  clients: ClientForTotals[],
  trips: TripForClientTotals[]
): Record<string, ClientTotalsMap> {
  const map: Record<string, ClientTotalsMap> = {};
  for (const c of clients) {
    map[c.id] = { get: 0, give: 0 };
  }
  for (const t of trips) {
    const clientId =
      t.client_id ??
      clients.find(
        (c) =>
          (c.name || c.contact_person || '').toLowerCase() === (t.client_name || '').toLowerCase()
      )?.id;
    if (clientId && map[clientId] != null) {
      map[clientId].get += Number(t.client_price ?? 0);
      map[clientId].give += Number(t.supplier_rate ?? 0);
    }
  }
  return map;
}

export { computeTripSummary } from '@/lib/totals.util';

