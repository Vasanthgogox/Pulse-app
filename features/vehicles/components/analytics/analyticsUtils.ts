/**
 * Pure computation utilities for the Vehicle Asset Analytics tab.
 * All functions are side-effect-free and memoizable.
 */
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "../../services/vehicles.service";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type AnalyticsPeriod = "monthly" | "quarterly" | "yearly";

/** Mirrors the missionRows shape computed in VehicleDetailScreen. */
export interface MissionRow {
  trip: TripRow;
  sales: number;
  expense: number;
  profit: number;
  margin: number;
  expenseLines: Array<{ label: string; amount: number }>;
}

export interface PeriodPoint {
  label: string;
  revenue: number;
  expense: number;
  profit: number;
  margin: number; // percentage
  tripCount: number;
}

export interface DriverStat {
  driverId: string | null;
  driverName: string;
  revenue: number;
  margin: number;
  tripCount: number;
  performanceScore: number; // 0–100
  rankTier: "gold" | "silver" | "bronze" | null;
}

export interface DocExpiry {
  key: string;
  label: string;
  expiryDate: string | null;
  daysRemaining: number | null;
  status: "valid" | "expiringSoon" | "expired" | "missing";
}

export interface ExpenseCat {
  label: string;
  amount: number;
  pct: number; // 0–100
  color: string;
}

export interface KpiSummary {
  totalRevenue: number;
  totalExpense: number;
  totalProfit: number;
  netMargin: number; // %
  tripsCompleted: number;
  totalKm: number;
  utilizationPct: number;
  upcomingRenewals: number;
  revenuePerDay: number;
  activeDays: number;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function tripDateStr(trip: TripRow): string {
  return (trip.pickup_date ?? trip.created_at ?? "").slice(0, 10);
}

// ─── Period bucket generators ──────────────────────────────────────────────────

function getMonthKeys(count = 6): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    keys.push(`${y}-${m}`);
  }
  return keys;
}

function getQuarterKeys(count = 4): Array<{ key: string; label: string }> {
  const now = new Date();
  const curQ = Math.floor(now.getMonth() / 3);
  const curY = now.getFullYear();
  const results: Array<{ key: string; label: string }> = [];
  for (let i = count - 1; i >= 0; i--) {
    let q = curQ - i;
    let y = curY;
    while (q < 0) { q += 4; y--; }
    results.push({ key: `${y}-Q${q + 1}`, label: `Q${q + 1} '${String(y).slice(2)}` });
  }
  return results;
}

// ─── Period aggregation ────────────────────────────────────────────────────────

export function computePeriodPoints(
  rows: MissionRow[],
  period: AnalyticsPeriod,
): PeriodPoint[] {
  if (period === "monthly") {
    return getMonthKeys(6).map((key) => {
      const slice = rows.filter((r) => tripDateStr(r.trip).slice(0, 7) === key);
      const rev = slice.reduce((s, r) => s + r.sales, 0);
      const exp = slice.reduce((s, r) => s + r.expense, 0);
      const pnl = rev - exp;
      return {
        label: MONTH_SHORT[parseInt(key.slice(5), 10) - 1] ?? "",
        revenue: rev,
        expense: exp,
        profit: pnl,
        margin: rev > 0 ? (pnl / rev) * 100 : 0,
        tripCount: slice.length,
      };
    });
  }

  if (period === "quarterly") {
    return getQuarterKeys(4).map(({ key, label }) => {
      const [yStr, qStr] = key.split("-Q");
      const y = parseInt(yStr, 10);
      const q = parseInt(qStr, 10);
      const slice = rows.filter((r) => {
        const d = tripDateStr(r.trip);
        return (
          parseInt(d.slice(0, 4), 10) === y &&
          Math.ceil(parseInt(d.slice(5, 7), 10) / 3) === q
        );
      });
      const rev = slice.reduce((s, r) => s + r.sales, 0);
      const exp = slice.reduce((s, r) => s + r.expense, 0);
      const pnl = rev - exp;
      return {
        label,
        revenue: rev,
        expense: exp,
        profit: pnl,
        margin: rev > 0 ? (pnl / rev) * 100 : 0,
        tripCount: slice.length,
      };
    });
  }

  // yearly: previous + current year
  const curYear = new Date().getFullYear();
  return [curYear - 1, curYear].map((year) => {
    const slice = rows.filter(
      (r) => parseInt(tripDateStr(r.trip).slice(0, 4), 10) === year,
    );
    const rev = slice.reduce((s, r) => s + r.sales, 0);
    const exp = slice.reduce((s, r) => s + r.expense, 0);
    const pnl = rev - exp;
    return {
      label: String(year),
      revenue: rev,
      expense: exp,
      profit: pnl,
      margin: rev > 0 ? (pnl / rev) * 100 : 0,
      tripCount: slice.length,
    };
  });
}

// ─── KPI summary ──────────────────────────────────────────────────────────────

export function computeKpiSummary(
  rows: MissionRow[],
  vehicle: VehicleRow | null,
): KpiSummary {
  const totalRevenue = rows.reduce((s, r) => s + r.sales, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
  const totalProfit = totalRevenue - totalExpense;
  const netMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const tripsCompleted = rows.filter((r) =>
    ["completed", "started"].includes(r.trip.status ?? ""),
  ).length;

  const totalKm = rows.reduce(
    (s, r) => s + Number(r.trip.distance ?? 0),
    0,
  );

  // Active days in last 30
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const activeDaySet = new Set<string>();
  rows.forEach((r) => {
    const d = tripDateStr(r.trip);
    if (d && new Date(d).getTime() >= cutoff) activeDaySet.add(d);
  });
  const activeDays = activeDaySet.size;
  const utilizationPct = Math.min(100, Math.round((activeDays / 30) * 100));
  const revenuePerDay = activeDays > 0 ? totalRevenue / activeDays : 0;

  const docs = vehicle?.documents ?? {};
  const now = Date.now();
  let upcomingRenewals = 0;
  for (const v of Object.values(docs)) {
    if ((v as { expiryDate?: string })?.expiryDate) {
      const daysLeft =
        (new Date((v as { expiryDate: string }).expiryDate).getTime() - now) /
        86400000;
      if (daysLeft <= 60) upcomingRenewals++;
    }
  }

  return {
    totalRevenue,
    totalExpense,
    totalProfit,
    netMargin,
    tripsCompleted,
    totalKm,
    utilizationPct,
    upcomingRenewals,
    revenuePerDay,
    activeDays,
  };
}

// ─── Driver statistics ─────────────────────────────────────────────────────────

export function computeDriverStats(rows: MissionRow[]): DriverStat[] {
  const map = new Map<
    string,
    {
      driverId: string | null;
      driverName: string;
      revenue: number;
      expense: number;
      profit: number;
      tripCount: number;
    }
  >();

  for (const row of rows) {
    const key =
      row.trip.driver_id ??
      row.trip.driver_display_name ??
      "__unassigned__";
    if (key === "__unassigned__") continue;
    const name = row.trip.driver_display_name ?? "Driver";
    const cur = map.get(key) ?? {
      driverId: row.trip.driver_id ?? null,
      driverName: name,
      revenue: 0,
      expense: 0,
      profit: 0,
      tripCount: 0,
    };
    cur.revenue += row.sales;
    cur.expense += row.expense;
    cur.profit += row.profit;
    cur.tripCount += 1;
    map.set(key, cur);
  }

  const list = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  const maxRev = Math.max(...list.map((d) => d.revenue), 1);

  return list.map((d, i) => {
    const margin = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0;
    const score = Math.round(
      (d.revenue / maxRev) * 50 +
        Math.max(0, Math.min(30, margin * 1.5)) +
        Math.min(20, d.tripCount * 2),
    );
    const rankTier: DriverStat["rankTier"] =
      i === 0 && list.length > 1
        ? "gold"
        : i === 1 && list.length > 2
          ? "silver"
          : i === 2 && list.length > 3
            ? "bronze"
            : null;
    return {
      driverId: d.driverId,
      driverName: d.driverName,
      revenue: d.revenue,
      margin,
      tripCount: d.tripCount,
      performanceScore: score,
      rankTier,
    };
  });
}

// ─── Document expiry ───────────────────────────────────────────────────────────

const DOC_LABELS: Record<string, string> = {
  insurance: "Insurance",
  rc: "RC / Registration",
  fitness: "Fitness Certificate",
  pollution: "PUC Certificate",
};

export function computeDocExpiry(vehicle: VehicleRow | null): DocExpiry[] {
  const docs = (vehicle?.documents ?? {}) as Record<
    string,
    { expiryDate?: string } | undefined
  >;
  const order = ["insurance", "rc", "fitness", "pollution"];
  const now = Date.now();

  return order.map((key) => {
    const doc = docs[key];
    if (!doc?.expiryDate) {
      return {
        key,
        label: DOC_LABELS[key] ?? key,
        expiryDate: null,
        daysRemaining: null,
        status: "missing" as const,
      };
    }
    const daysRemaining = Math.ceil(
      (new Date(doc.expiryDate).getTime() - now) / 86400000,
    );
    const status: DocExpiry["status"] =
      daysRemaining < 0
        ? "expired"
        : daysRemaining <= 30
          ? "expiringSoon"
          : "valid";
    return {
      key,
      label: DOC_LABELS[key] ?? key,
      expiryDate: doc.expiryDate,
      daysRemaining,
      status,
    };
  });
}

// ─── Expense categories ────────────────────────────────────────────────────────

const EXPENSE_COLOR_MAP: Record<string, string> = {
  Supplier: "#4F46E5",
  Fuel: "#F97316",
  Toll: "#0EA5E9",
  Other: "#94A3B8",
};

export function computeExpenseCategories(rows: MissionRow[]): ExpenseCat[] {
  const totals: Record<string, number> = {
    Supplier: 0,
    Fuel: 0,
    Toll: 0,
    Other: 0,
  };

  for (const row of rows) {
    for (const line of row.expenseLines) {
      const l = line.label.toUpperCase();
      if (l.includes("SUPPLIER") || l.includes("BASE FREIGHT")) {
        totals["Supplier"] += line.amount;
      } else if (l.includes("FUEL") || l.includes("DIESEL")) {
        totals["Fuel"] += line.amount;
      } else if (l.includes("TOLL") || l.includes("FASTAG")) {
        totals["Toll"] += line.amount;
      } else {
        totals["Other"] += line.amount;
      }
    }
  }

  const total = Object.values(totals).reduce((s, v) => s + v, 0);
  return Object.entries(totals)
    .filter(([, v]) => v > 0)
    .map(([label, amount]) => ({
      label,
      amount,
      pct: total > 0 ? (amount / total) * 100 : 0,
      color: EXPENSE_COLOR_MAP[label] ?? "#94A3B8",
    }))
    .sort((a, b) => b.amount - a.amount);
}
