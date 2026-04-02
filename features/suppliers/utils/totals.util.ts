export interface TripForSupplierTotals {
  supplier_id?: string | null;
  supplier_rate?: number;
}

/** Per-supplier total "give" (supplier_rate) from trips. */
export function computeSupplierTotalsFromTrips(
  trips: TripForSupplierTotals[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const t of trips) {
    if (t.supplier_id) {
      map[t.supplier_id] = (map[t.supplier_id] ?? 0) + Number(t.supplier_rate ?? 0);
    }
  }
  return map;
}

export { computeTripSummary } from '@/lib/totals.util';

