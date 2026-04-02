/**
 * O(n) monthly driver salary statement. Groups trips by month (pickup_date/created_at)
 * and driver_ledger by month (created_at). Covers: fixed salary, trip commission,
 * advances, deductions, running balance. Single pass per collection.
 */
import type { DriverOfferForAggregation } from './types';
import { computeDriverCommissionForTrip } from './aggregateDrivers';
import type { TripForDriver } from './types';

/** driver_ledger.type from DB. */
const LEDGER_TYPES = [
  'salary',
  'settlement',
  'advance',
  'reimbursement',
  'adjustment',
  'deduction',
] as const;
export type DriverLedgerType = (typeof LEDGER_TYPES)[number];

export interface DriverLedgerEntryForStatement {
  id: string;
  driver_id: string;
  trip_id: string | null;
  type: string;
  amount: number;
  created_at: string;
  description?: string | null;
}

export interface TripForStatement extends TripForDriver {
  id: string;
  pickup_date?: string | null;
  created_at?: string;
  /** Display label e.g. TRP010 */
  missionId?: string;
  drop_location?: string | null;
}

/** One month's summary row for the statement table. */
export interface MonthlyStatementRow {
  monthKey: string;
  label: string;
  fixedSalary: number;
  tripCommission: number;
  /** Other earnings (e.g. bonus, adjustment as credit). Currently 0; reserved for future. */
  otherEarnings: number;
  totalEarnings: number;
  paidTotal: number;
  paidByType: {
    salary: number;
    settlement: number;
    advance: number;
    deduction: number;
    reimbursement: number;
    adjustment: number;
  };
  balanceAfter: number;
  tripCount: number;
  ledgerEntryCount: number;
}

/** Expandable detail for one month. */
export interface MonthlyStatementDetail {
  monthKey: string;
  trips: Array<{
    id: string;
    missionId: string;
    commission: number;
    paid: number;
    due: number;
  }>;
  ledgerEntries: Array<{
    id: string;
    date: string;
    type: string;
    amount: number;
    description: string | null;
    trip_id: string | null;
  }>;
}

/** Get YYYY-MM from ISO date string. */
function monthKey(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  const s = iso.trim().slice(0, 7);
  return s.length === 7 ? s : '';
}

/** Format "Mar 2025" from YYYY-MM. */
function monthLabel(key: string): string {
  if (key.length !== 7) return key;
  const [y, m] = key.split('-');
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const i = parseInt(m, 10) - 1;
  const name = Number.isFinite(i) && i >= 0 && i < 12 ? monthNames[i] : m;
  return `${name} ${y}`;
}

/**
 * Build monthly driver salary statement. O(n) over trips + ledger entries.
 * Edge cases: no fixed salary (0), fixed only, commission only, hybrid,
 * advances/deductions, payment in different month than trip, negative balance.
 */
export function buildMonthlyDriverStatement(
  driverId: string,
  trips: TripForStatement[],
  ledgerEntries: DriverLedgerEntryForStatement[],
  offer: DriverOfferForAggregation | null | undefined,
  options?: { maxMonths?: number }
): { rows: MonthlyStatementRow[]; detailsByMonth: Record<string, MonthlyStatementDetail> } {
  const maxMonths = options?.maxMonths ?? 12;
  const rawPayable = offer?.payableAmount;
  const fixedSalaryPerMonth = Math.max(
    0,
    Number.isFinite(Number(rawPayable)) ? Number(rawPayable) : 0
  );

  // 1) Group trips by month (trip month = pickup_date ?? created_at)
  const tripsByMonth: Record<string, TripForStatement[]> = {};
  for (let i = 0; i < trips.length; i++) {
    const t = trips[i];
    if (t.driver_id !== driverId) continue;
    const dateStr = t.pickup_date ?? t.created_at ?? '';
    const key = monthKey(dateStr);
    if (!key) continue;
    if (!tripsByMonth[key]) tripsByMonth[key] = [];
    tripsByMonth[key].push(t);
  }

  // 2) Group ledger by month (payment month = created_at)
  const ledgerByMonth: Record<string, DriverLedgerEntryForStatement[]> = {};
  for (let i = 0; i < ledgerEntries.length; i++) {
    const e = ledgerEntries[i];
    if (e.driver_id !== driverId) continue;
    const key = monthKey(e.created_at);
    if (!key) continue;
    if (!ledgerByMonth[key]) ledgerByMonth[key] = [];
    ledgerByMonth[key].push(e);
  }

  // 3) All month keys (union), sorted descending (newest first)
  const allKeys = new Set<string>([
    ...Object.keys(tripsByMonth),
    ...Object.keys(ledgerByMonth),
  ]);
  const sortedKeys = Array.from(allKeys).sort().reverse().slice(0, maxMonths);

  // 4) Paid per trip (from ledger entries that have trip_id and type settlement/salary)
  const paidByTripId: Record<string, number> = {};
  for (let i = 0; i < ledgerEntries.length; i++) {
    const e = ledgerEntries[i];
    if (e.driver_id !== driverId) continue;
    const tid = e.trip_id ?? '';
    if (!tid) continue;
    const type = (e.type || '').toLowerCase();
    if (type === 'settlement' || type === 'salary') {
      paidByTripId[tid] = (paidByTripId[tid] ?? 0) + Number(e.amount ?? 0);
    }
  }

  const detailsByMonth: Record<string, MonthlyStatementDetail> = {};
  const rows: MonthlyStatementRow[] = [];
  let runningBalance = 0;

  // Chronological order for balance (oldest first)
  const sortedKeysAsc = [...sortedKeys].reverse();

  for (let mi = 0; mi < sortedKeysAsc.length; mi++) {
    const key = sortedKeysAsc[mi];
    const monthTrips = tripsByMonth[key] ?? [];
    const monthLedger = ledgerByMonth[key] ?? [];

    const fixedSalary = fixedSalaryPerMonth;
    let tripCommission = 0;
    const tripDetails: MonthlyStatementDetail['trips'] = [];

    for (let i = 0; i < monthTrips.length; i++) {
      const t = monthTrips[i];
      const commission = computeDriverCommissionForTrip(t, offer);
      tripCommission += commission;
      const paid = paidByTripId[t.id] ?? 0;
      const due = Math.max(0, commission - paid);
      tripDetails.push({
        id: t.id,
        missionId: (t as TripForStatement).missionId ?? t.id?.slice(0, 8) ?? '—',
        commission,
        paid,
        due,
      });
    }

    const totalEarnings = fixedSalary + tripCommission;

    const byType = {
      salary: 0,
      settlement: 0,
      advance: 0,
      deduction: 0,
      reimbursement: 0,
      adjustment: 0,
    };
    const ledgerDetail: MonthlyStatementDetail['ledgerEntries'] = [];

    for (let i = 0; i < monthLedger.length; i++) {
      const e = monthLedger[i];
      const amount = Number(e.amount ?? 0);
      const type = (e.type || '').toLowerCase();
      if (type === 'salary') byType.salary += amount;
      else if (type === 'settlement') byType.settlement += amount;
      else if (type === 'advance') byType.advance += amount;
      else if (type === 'deduction') byType.deduction += amount;
      else if (type === 'reimbursement') byType.reimbursement += amount;
      else if (type === 'adjustment') byType.adjustment += amount;
      ledgerDetail.push({
        id: e.id,
        date: (e.created_at ?? '').slice(0, 10),
        type: e.type,
        amount,
        description: e.description ?? null,
        trip_id: e.trip_id,
      });
    }

    const paidTotal =
      byType.salary +
      byType.settlement +
      byType.advance +
      byType.reimbursement +
      byType.adjustment -
      byType.deduction;

    runningBalance += totalEarnings - paidTotal;

    detailsByMonth[key] = { monthKey: key, trips: tripDetails, ledgerEntries: ledgerDetail };

    const otherEarnings = 0;
    const totalEarningsComputed = fixedSalary + tripCommission + otherEarnings;

    rows.push({
      monthKey: key,
      label: monthLabel(key),
      fixedSalary,
      tripCommission,
      otherEarnings,
      totalEarnings: totalEarningsComputed,
      paidTotal,
      paidByType: byType,
      balanceAfter: runningBalance,
      tripCount: monthTrips.length,
      ledgerEntryCount: monthLedger.length,
    });
  }

  return { rows, detailsByMonth };
}
