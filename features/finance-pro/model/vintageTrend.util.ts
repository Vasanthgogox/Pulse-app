import type { VintageMonthPoint } from "./financeProTypes";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function pickupMonthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return monthKey(d);
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

function lastSixMonthKeys(now: Date): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: monthKey(start), label: monthLabel(start) });
  }
  return out;
}

export function buildVintageTrend(
  trips: readonly {
    pickupDate: string | null;
    sales: number;
    remainingDue: number;
    clientId?: string | null;
  }[],
  now: Date,
): VintageMonthPoint[] {
  const months = lastSixMonthKeys(now);
  const byKey = new Map<string, VintageMonthPoint>();
  for (const m of months) {
    byKey.set(m.key, {
      key: m.key,
      label: m.label,
      billed: 0,
      attributedReceipts: 0,
      outstanding: 0,
      tripCount: 0,
      customerCount: 0,
    });
  }
  const clientsByMonth = new Map<string, Set<string>>();
  for (const trip of trips) {
    if (!trip.pickupDate) continue;
    const d = new Date(trip.pickupDate);
    if (!Number.isFinite(d.getTime())) continue;
    const key = monthKey(d);
    const point = byKey.get(key);
    if (!point) continue;
    point.billed += trip.sales;
    point.outstanding += trip.remainingDue;
    point.attributedReceipts += Math.max(0, trip.sales - trip.remainingDue);
    point.tripCount += 1;
    const clientId = "clientId" in trip ? String(trip.clientId ?? "") : "";
    if (clientId) {
      const set = clientsByMonth.get(key) ?? new Set<string>();
      set.add(clientId);
      clientsByMonth.set(key, set);
    }
  }
  for (const [key, set] of clientsByMonth) {
    const point = byKey.get(key);
    if (point) point.customerCount = set.size;
  }
  return months.map((m) => byKey.get(m.key)!);
}
