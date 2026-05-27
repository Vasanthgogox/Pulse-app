/**
 * Pure computation utilities for the Driver Performance Analytics tab.
 * All functions are side-effect-free and memoizable.
 * Reuses finance utilities already present in the codebase.
 */
import type { TripRow } from "@/features/trips/services/trips.service";
import type { LedgerRow } from "@/features/finance";
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import type { DriverRow } from "../../services/drivers.service";
import type { RatingRow } from "@/features/ratings";
import { computeDriverCommissionForTrip } from "@/features/finance";
import { averageScore } from "@/features/ratings";

// ─── Shared types ──────────────────────────────────────────────────────────────

export type AnalyticsPeriod = "monthly" | "quarterly" | "yearly" | "lifetime";

export interface DriverOffer {
  payableAmount: number | null;
  commissionPercent: number | null;
  commissionPerKm: number | null;
}

export interface PeriodPoint {
  label: string;
  revenue: number;
  earnings: number; // commission due for this period
  paid: number;     // actual payments from ledger
  tripCount: number;
  kmDriven: number;
}

export interface DriverKpiSummary {
  totalRevenue: number;
  totalEarnings: number;   // sum of computed commission across all trips
  totalPaid: number;       // sum of actual payment ledger entries
  pendingBalance: number;  // totalEarnings - totalPaid (clamped ≥ 0)
  tripsCompleted: number;
  tripsTotal: number;
  vehiclesOperated: number;
  monthlySalary: number | null;
  driverRating: number;       // 0–5
  settlementHealth: number;   // 0–100 %
  performanceScore: number;   // 0–100 composite
  revenuePerTrip: number;
}

export interface VehicleOpStat {
  vehicleId: string | null;
  vehicleNumber: string;
  revenue: number;
  earnings: number;
  km: number;
  tripCount: number;
}

export interface PaymentMonthRow {
  monthKey: string;  // "YYYY-MM"
  label: string;     // "May 2026"
  salary: number;
  commission: number;
  paid: number;
  pending: number;
}

export interface PaymentSummary {
  totalSalary: number;       // monthlySalary * months active
  totalCommission: number;
  totalPaid: number;
  totalPending: number;
  advances: number;
  deductions: number;
  months: PaymentMonthRow[];
}

export interface DocStatus {
  key: string;
  label: string;
  value: string | null;
  present: boolean;
  note: string;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function tripDateStr(trip: TripRow): string {
  return (trip.pickup_date ?? trip.created_at ?? "").slice(0, 10);
}

function txDateStr(tx: LedgerRow): string {
  return (tx.transaction_date ?? tx.created_at ?? "").slice(0, 10);
}

function getMonthKeys(count = 6): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
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

// Per-trip commission using same logic as the finance module
function tripEarnings(
  trip: TripRow,
  offer: DriverOffer | null,
): number {
  return computeDriverCommissionForTrip(
    {
      ...trip,
      client_price: trip.client_price ?? null,
      distance: trip.distance ?? null,
    },
    offer
      ? {
          commissionPercent: offer.commissionPercent,
          commissionPerKm: offer.commissionPerKm,
        }
      : null,
  );
}

// ─── KPI Summary ──────────────────────────────────────────────────────────────

export function computeDriverKpiSummary(
  trips: TripRow[],
  transactions: LedgerRow[],
  requests: SalaryRequestRow[],
  driver: DriverRow | null,
  offer: DriverOffer | null,
  ratings: RatingRow[],
): DriverKpiSummary {
  const totalRevenue = trips.reduce((s, t) => s + Number(t.client_price ?? 0), 0);
  const totalEarnings = trips.reduce((s, t) => s + tripEarnings(t, offer), 0);
  const totalPaid = transactions.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
  const pendingFromRequests = requests.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const pendingBalance = Math.max(0, totalEarnings - totalPaid) + pendingFromRequests;

  const tripsCompleted = trips.filter((t) =>
    ["completed", "started"].includes(t.status ?? ""),
  ).length;
  const tripsTotal = trips.length;

  const vehicleSet = new Set<string>();
  for (const t of trips) {
    const key = t.vehicle_id ?? (t.vehicle_display_number ?? "").trim();
    if (key) vehicleSet.add(key);
  }

  const monthlySalary = driver?.payable_amount
    ? Number(driver.payable_amount)
    : null;

  const driverRating = averageScore(ratings) ?? 0;

  const settlementHealth =
    totalEarnings > 0
      ? Math.min(100, Math.round((totalPaid / totalEarnings) * 100))
      : 100;

  // Composite performance score: settlement (40%), completion (30%), rating (30%)
  const completionRate = tripsTotal > 0 ? (tripsCompleted / tripsTotal) * 100 : 0;
  const ratingScore = (driverRating / 5) * 100;
  const performanceScore = Math.round(
    settlementHealth * 0.4 + completionRate * 0.3 + ratingScore * 0.3,
  );

  const revenuePerTrip = tripsTotal > 0 ? totalRevenue / tripsTotal : 0;

  return {
    totalRevenue,
    totalEarnings,
    totalPaid,
    pendingBalance,
    tripsCompleted,
    tripsTotal,
    vehiclesOperated: vehicleSet.size,
    monthlySalary,
    driverRating,
    settlementHealth,
    performanceScore,
    revenuePerTrip,
  };
}

// ─── Period points ─────────────────────────────────────────────────────────────

export function computeDriverPeriodPoints(
  trips: TripRow[],
  transactions: LedgerRow[],
  offer: DriverOffer | null,
  period: AnalyticsPeriod,
): PeriodPoint[] {
  if (period === "lifetime") {
    // One point total
    const rev = trips.reduce((s, t) => s + Number(t.client_price ?? 0), 0);
    const earn = trips.reduce((s, t) => s + tripEarnings(t, offer), 0);
    const paid = transactions.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
    const km = trips.reduce((s, t) => s + Number(t.distance ?? 0), 0);
    return [{ label: "All time", revenue: rev, earnings: earn, paid, tripCount: trips.length, kmDriven: km }];
  }

  if (period === "monthly") {
    return getMonthKeys(6).map((key) => {
      const slice = trips.filter((t) => tripDateStr(t).slice(0, 7) === key);
      const txSlice = transactions.filter((tx) => txDateStr(tx).slice(0, 7) === key);
      const rev = slice.reduce((s, t) => s + Number(t.client_price ?? 0), 0);
      const earn = slice.reduce((s, t) => s + tripEarnings(t, offer), 0);
      const paid = txSlice.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
      const km = slice.reduce((s, t) => s + Number(t.distance ?? 0), 0);
      return {
        label: MONTH_SHORT[parseInt(key.slice(5), 10) - 1] ?? "",
        revenue: rev,
        earnings: earn,
        paid,
        tripCount: slice.length,
        kmDriven: km,
      };
    });
  }

  if (period === "quarterly") {
    return getQuarterKeys(4).map(({ key, label }) => {
      const [yStr, qStr] = key.split("-Q");
      const y = parseInt(yStr, 10);
      const q = parseInt(qStr, 10);
      const inQ = (dateStr: string) => {
        return (
          parseInt(dateStr.slice(0, 4), 10) === y &&
          Math.ceil(parseInt(dateStr.slice(5, 7), 10) / 3) === q
        );
      };
      const slice = trips.filter((t) => inQ(tripDateStr(t)));
      const txSlice = transactions.filter((tx) => inQ(txDateStr(tx)));
      const rev = slice.reduce((s, t) => s + Number(t.client_price ?? 0), 0);
      const earn = slice.reduce((s, t) => s + tripEarnings(t, offer), 0);
      const paid = txSlice.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
      const km = slice.reduce((s, t) => s + Number(t.distance ?? 0), 0);
      return { label, revenue: rev, earnings: earn, paid, tripCount: slice.length, kmDriven: km };
    });
  }

  // yearly
  const curYear = new Date().getFullYear();
  return [curYear - 1, curYear].map((year) => {
    const slice = trips.filter((t) => parseInt(tripDateStr(t).slice(0, 4), 10) === year);
    const txSlice = transactions.filter(
      (tx) => parseInt(txDateStr(tx).slice(0, 4), 10) === year,
    );
    const rev = slice.reduce((s, t) => s + Number(t.client_price ?? 0), 0);
    const earn = slice.reduce((s, t) => s + tripEarnings(t, offer), 0);
    const paid = txSlice.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0);
    const km = slice.reduce((s, t) => s + Number(t.distance ?? 0), 0);
    return { label: String(year), revenue: rev, earnings: earn, paid, tripCount: slice.length, kmDriven: km };
  });
}

// ─── Vehicle operation stats ───────────────────────────────────────────────────

export function computeVehicleOpStats(
  trips: TripRow[],
  offer: DriverOffer | null,
): VehicleOpStat[] {
  const map = new Map<
    string,
    { vehicleId: string | null; vehicleNumber: string; revenue: number; earnings: number; km: number; tripCount: number }
  >();

  for (const t of trips) {
    const vNum = (t.vehicle_display_number ?? "").trim();
    const vId = t.vehicle_id ?? null;
    const key = vId ?? vNum ?? "__none__";
    if (key === "__none__") continue;
    const existing = map.get(key) ?? {
      vehicleId: vId,
      vehicleNumber: vNum || (vId?.slice(0, 8) ?? "—"),
      revenue: 0,
      earnings: 0,
      km: 0,
      tripCount: 0,
    };
    existing.revenue += Number(t.client_price ?? 0);
    existing.earnings += tripEarnings(t, offer);
    existing.km += Number(t.distance ?? 0);
    existing.tripCount += 1;
    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

// ─── Payment intelligence ──────────────────────────────────────────────────────

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_FULL[idx] ?? m} ${y}`;
}

export function computePaymentSummary(
  trips: TripRow[],
  transactions: LedgerRow[],
  requests: SalaryRequestRow[],
  driver: DriverRow | null,
  offer: DriverOffer | null,
): PaymentSummary {
  // Monthly buckets
  const monthSet = new Set<string>();
  trips.forEach((t) => {
    const k = tripDateStr(t).slice(0, 7);
    if (k.length === 7) monthSet.add(k);
  });
  transactions.forEach((tx) => {
    const k = txDateStr(tx).slice(0, 7);
    if (k.length === 7) monthSet.add(k);
  });

  const sortedKeys = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

  let totalCommission = 0;
  let totalPaid = 0;
  let advances = 0;
  let deductions = 0;

  const months: PaymentMonthRow[] = sortedKeys.map((key) => {
    const tSlice = trips.filter((t) => tripDateStr(t).slice(0, 7) === key);
    const txSlice = transactions.filter((tx) => txDateStr(tx).slice(0, 7) === key);

    const salary = driver?.payable_amount ? Number(driver.payable_amount) : 0;
    const commission = tSlice.reduce((s, t) => s + tripEarnings(t, offer), 0);
    const paid = txSlice.reduce((s, tx) => {
      const desc = (tx.description ?? "").toUpperCase();
      if (desc.includes("ADVANCE")) return s;
      return s + Number(tx.amount_out ?? 0);
    }, 0);
    const adv = txSlice.reduce((s, tx) => {
      const desc = (tx.description ?? "").toUpperCase();
      return desc.includes("ADVANCE") ? s + Number(tx.amount_out ?? 0) : s;
    }, 0);
    const pending = Math.max(0, salary + commission - paid);

    totalCommission += commission;
    totalPaid += paid;
    advances += adv;

    return { monthKey: key, label: monthLabel(key), salary, commission, paid, pending };
  });

  // Deductions from negative adjustments in transactions
  deductions = transactions.reduce((s, tx) => {
    const desc = (tx.description ?? "").toUpperCase();
    return desc.includes("DEDUCTION") || desc.includes("PENALTY")
      ? s + Number(tx.amount_out ?? 0)
      : s;
  }, 0);

  const totalPending = requests.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const totalSalary =
    (driver?.payable_amount ? Number(driver.payable_amount) : 0) * months.length;

  return {
    totalSalary,
    totalCommission,
    totalPaid,
    totalPending,
    advances,
    deductions,
    months,
  };
}

// ─── Document compliance ───────────────────────────────────────────────────────

export function computeDocCompliance(driver: DriverRow | null): DocStatus[] {
  return [
    {
      key: "license",
      label: "Driving Licence",
      value: driver?.license_number?.trim() || null,
      present: !!(driver?.license_number?.trim()),
      note: driver?.license_number?.trim()
        ? `DL: ${driver.license_number.trim()}`
        : "Not on record",
    },
    {
      key: "emergency",
      label: "Emergency Contact",
      value: driver?.emergency_contact?.trim() || null,
      present: !!(driver?.emergency_contact?.trim()),
      note: driver?.emergency_contact?.trim()
        ? driver.emergency_contact.trim()
        : "Not recorded",
    },
    {
      key: "phone",
      label: "Phone Verified",
      value: driver?.phone?.trim() || null,
      present: !!(driver?.phone?.trim()),
      note: driver?.phone?.trim() ? driver.phone.trim() : "No phone on record",
    },
    {
      key: "fleet_status",
      label: "Fleet Status",
      value: driver?.status ?? null,
      present: driver?.status === "active",
      note: driver?.left_at
        ? `Left fleet on ${new Date(driver.left_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}`
        : driver?.status === "active"
          ? "Active in fleet"
          : (driver?.status ?? "Unknown"),
    },
  ];
}
