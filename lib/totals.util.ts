/**
 * Shared trip totals — revenue, cost, margin from trips.
 * Used by clients and suppliers features.
 */
export function computeTripSummary(trips: { client_price?: number; supplier_rate?: number }[]): {
  totalRevenue: number;
  totalCost: number;
  margin: number;
} {
  const totalRevenue = trips.reduce((s, t) => s + Number(t.client_price ?? 0), 0);
  const totalCost = trips.reduce((s, t) => s + Number(t.supplier_rate ?? 0), 0);
  return { totalRevenue, totalCost, margin: totalRevenue - totalCost };
}
