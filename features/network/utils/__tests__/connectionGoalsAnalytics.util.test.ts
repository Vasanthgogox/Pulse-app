import {
  achievementPct,
  buildPerformanceKpiRow,
  changePct,
  computePreviousPeriodActuals,
  computeTargetToDate,
  computeTripMetrics,
  elapsedFraction,
  pacingPct,
  periodBounds,
  previousPeriodAnchorMonthKey,
  tripsInDateRange,
} from '../connectionGoalsAnalytics.util';
import type { TripRow } from '@/features/trips/services/trips.service';

// No trailing "Z" -- these must parse as LOCAL time (matching periodBounds'
// local-time Date construction), not a UTC instant that could land on a
// different local calendar day depending on the test machine's timezone.
function trip(pickupDate: string, clientPrice: number, supplierRate = 0): Partial<TripRow> {
  return { pickup_date: pickupDate, client_price: clientPrice, supplier_rate: supplierRate };
}

describe('periodBounds', () => {
  it('month: first day of the month through first day of next month', () => {
    const { start, end } = periodBounds('2026-08', 'month');
    expect(start).toEqual(new Date(2026, 7, 1));
    expect(end).toEqual(new Date(2026, 8, 1));
  });

  it('quarter: full three-month quarter regardless of which month is selected', () => {
    const { start, end } = periodBounds('2026-08', 'quarter'); // Aug -> Q3 (Jul-Sep)
    expect(start).toEqual(new Date(2026, 6, 1));
    expect(end).toEqual(new Date(2026, 9, 1));
  });

  it('quarter boundary: January selects Q1, not spilling into the prior year', () => {
    const { start, end } = periodBounds('2026-01', 'quarter');
    expect(start).toEqual(new Date(2026, 0, 1));
    expect(end).toEqual(new Date(2026, 3, 1));
  });

  it('year: Jan 1 through Jan 1 of next year', () => {
    const { start, end } = periodBounds('2026-08', 'year');
    expect(start).toEqual(new Date(2026, 0, 1));
    expect(end).toEqual(new Date(2027, 0, 1));
  });
});

describe('previousPeriodAnchorMonthKey', () => {
  it('month -> previous month', () => {
    expect(previousPeriodAnchorMonthKey('2026-08', 'month')).toBe('2026-07');
  });

  it('month boundary: January rolls back to December of the prior year', () => {
    expect(previousPeriodAnchorMonthKey('2026-01', 'month')).toBe('2025-12');
  });

  it('quarter -> same relative month, previous quarter', () => {
    // Aug is month 2 of Q3 (Jul,Aug,Sep) -> month 2 of Q2 (Apr,May,Jun) = May
    expect(previousPeriodAnchorMonthKey('2026-08', 'quarter')).toBe('2026-05');
  });

  it('quarter boundary: Q1 rolls back to Q4 of the prior year', () => {
    expect(previousPeriodAnchorMonthKey('2026-01', 'quarter')).toBe('2025-10');
  });

  it('year -> same month, previous year', () => {
    expect(previousPeriodAnchorMonthKey('2026-08', 'year')).toBe('2025-08');
  });
});

describe('elapsedFraction', () => {
  const start = new Date(2026, 7, 1); // Aug 1
  const end = new Date(2026, 8, 1); // Sep 1 (31-day month)

  it('first day of period -> 0, not a small positive sliver', () => {
    expect(elapsedFraction(start, end, new Date(2026, 7, 1))).toBe(0);
  });

  it('mid-period -> a fraction strictly between 0 and 1', () => {
    const frac = elapsedFraction(start, end, new Date(2026, 7, 17));
    expect(frac).toBeGreaterThan(0);
    expect(frac).toBeLessThan(1);
  });

  it('last instant of period -> clamps to 1, not >1', () => {
    expect(elapsedFraction(start, end, end)).toBe(1);
  });

  it('future period (asOf before start) -> clamps to 0, never negative', () => {
    expect(elapsedFraction(start, end, new Date(2026, 6, 15))).toBe(0);
  });

  it('fully past period (asOf long after end) -> clamps to 1, never >1', () => {
    expect(elapsedFraction(start, end, new Date(2027, 0, 1))).toBe(1);
  });
});

describe('computeTargetToDate', () => {
  const start = new Date(2026, 7, 1);
  const end = new Date(2026, 8, 1);

  it('zero target -> 0 regardless of elapsed time, never NaN', () => {
    expect(computeTargetToDate(0, start, end, new Date(2026, 7, 17))).toBe(0);
  });

  it('future period -> 0 (elapsed fraction is 0)', () => {
    expect(computeTargetToDate(100000, start, end, new Date(2026, 6, 1))).toBe(0);
  });

  it('fully elapsed period -> equals the full period target', () => {
    expect(computeTargetToDate(100000, start, end, new Date(2027, 0, 1))).toBe(100000);
  });
});

describe('achievementPct', () => {
  it('zero target -> null, never a misleading 0% or division by zero', () => {
    expect(achievementPct(50000, 0)).toBeNull();
  });

  it('no actuals with a real target -> 0%, a real and non-misleading answer', () => {
    expect(achievementPct(0, 100000)).toBe(0);
  });

  it('normal case -> actual/target as a percentage', () => {
    expect(achievementPct(85000, 100000)).toBe(85);
  });
});

describe('pacingPct', () => {
  it('zero target-to-date -> null, never Infinity or NaN', () => {
    expect(pacingPct(50000, 0)).toBeNull();
    expect(Number.isFinite(pacingPct(50000, 0) as number)).toBe(false); // null, not a finite number
  });

  it('is distinct from achievement: a partial-month actual can pace ahead while achievement looks low', () => {
    // ₹1.55Cr actual, ₹3.3Cr full-month target, 17/31 days elapsed -> target-to-date ~ 1.81Cr
    const periodTarget = 3.3e7;
    const start = new Date(2026, 7, 1);
    const end = new Date(2026, 8, 1);
    const asOf = new Date(2026, 7, 17);
    const ttd = computeTargetToDate(periodTarget, start, end, asOf);
    const actual = 1.55e7;
    const achievement = achievementPct(actual, periodTarget)!;
    const pacing = pacingPct(actual, ttd)!;
    expect(achievement).toBeLessThan(50); // ~47%
    expect(pacing).toBeGreaterThan(80); // ~86%, "behind pace" but nowhere near as bad as 47% implies
    expect(pacing).not.toBe(achievement);
  });
});

describe('changePct (vs previous period)', () => {
  it('no previous-period data (previousActual 0) -> null, never +Infinity%', () => {
    expect(changePct(50000, 0)).toBeNull();
  });

  it('normal growth case', () => {
    expect(changePct(120000, 100000)).toBe(20);
  });

  it('normal decline case', () => {
    expect(changePct(80000, 100000)).toBe(-20);
  });
});

describe('tripsInDateRange', () => {
  it('is start-inclusive, end-exclusive', () => {
    const trips = [
      trip('2026-08-01T00:00:00', 100),
      trip('2026-08-31T23:00:00', 200),
      trip('2026-09-01T00:00:00', 300),
    ] as TripRow[];
    const rows = tripsInDateRange(trips, new Date(2026, 7, 1), new Date(2026, 8, 1));
    expect(rows.map((r) => r.client_price)).toEqual([100, 200]);
  });

  it('excludes trips with no usable date field', () => {
    const trips = [{ client_price: 999 }] as TripRow[];
    expect(tripsInDateRange(trips, new Date(2026, 7, 1), new Date(2026, 8, 1))).toHaveLength(0);
  });
});

describe('computePreviousPeriodActuals', () => {
  it('compares the same elapsed window, not the full previous month (Aug 1-17 vs Jul 1-17)', () => {
    const trips = [
      trip('2026-07-10T00:00:00', 1000), // inside Jul 1-17 -> counted
      trip('2026-07-25T00:00:00', 5000), // inside Jul but AFTER day 17 -> must NOT be counted
      trip('2026-08-05T00:00:00', 2000), // current period, irrelevant here
    ] as TripRow[];
    const asOf = new Date(2026, 7, 17); // Aug 17
    const prev = computePreviousPeriodActuals(trips, '2026-08', 'month', asOf);
    expect(prev.revenueInr).toBe(1000);
  });

  it('no previous-period data -> zero actuals, not an error', () => {
    const prev = computePreviousPeriodActuals([], '2026-08', 'month', new Date(2026, 7, 17));
    expect(prev.revenueInr).toBe(0);
    expect(prev.tripCount).toBe(0);
  });

  it('partial previous period: elapsed window longer than the previous (shorter) month clamps to that month\'s own end', () => {
    // Comparing Mar 31 elapsed (31 days in) against Feb, which only has 28 days in 2026.
    const trips = [
      trip('2026-02-28T12:00:00', 4000), // last valid day of Feb -> must be counted
      trip('2026-03-01T00:00:00', 9000), // spilled into March -> must NOT be counted as "previous period"
    ] as TripRow[];
    const asOf = new Date(2026, 2, 31); // Mar 31, fully elapsed March
    const prev = computePreviousPeriodActuals(trips, '2026-03', 'month', asOf);
    expect(prev.revenueInr).toBe(4000);
  });

  it('quarter/year boundary: Q1 2026 compares against Q4 2025, not a same-year underflow', () => {
    const trips = [
      // Elapsed window is Jan1-Feb15 (45 days) -> previous window is Oct1-Nov15 2025.
      // Nov 10 sits safely inside that window; Nov 20 sits safely outside it.
      trip('2025-11-10T00:00:00', 7000), // inside the previous-period window (Oct 1 - Nov 15)
      trip('2025-11-20T00:00:00', 6000), // outside that window -> must NOT be counted
      trip('2026-02-15T00:00:00', 3000), // current-period Q1 2026, irrelevant here
    ] as TripRow[];
    const asOf = new Date(2026, 1, 15); // mid Q1 2026
    const prev = computePreviousPeriodActuals(trips, '2026-01', 'quarter', asOf);
    expect(prev.revenueInr).toBe(7000);
  });
});

describe('buildPerformanceKpiRow', () => {
  const start = new Date(2026, 7, 1);
  const asOf = new Date(2026, 7, 17);

  it('no target set -> achievement/targetToDate/pacing all null, never fabricated', () => {
    const row = buildPerformanceKpiRow('Sales revenue', 'inr', 50000, 0, 40000, '2026-08', 'month', asOf);
    expect(row.hasTarget).toBe(false);
    expect(row.achievement).toBeNull();
    expect(row.targetToDate).toBeNull();
    expect(row.pacing).toBeNull();
  });

  it('no actuals -> achievement 0% (real target exists), pacing null only if target-to-date is 0', () => {
    const row = buildPerformanceKpiRow('Sales revenue', 'inr', 0, 100000, 0, '2026-08', 'month', start);
    expect(row.achievement).toBe(0);
    expect(row.targetToDate).toBe(0); // asOf === period start
    expect(row.pacing).toBeNull();
  });

  it('margin ("pct" unit) never gets a target-to-date/pacing pro-ration', () => {
    const row = buildPerformanceKpiRow('Margin', 'pct', 28.4, 31.6, 27.1, '2026-08', 'month', asOf);
    expect(row.targetToDate).toBeNull();
    expect(row.pacing).toBeNull();
    expect(row.achievement).not.toBeNull(); // achievement is still meaningful for a ratio metric
  });

  it('no previous-period data -> hasPreviousData false, changeVsPrevious null, not a fabricated percentage', () => {
    const row = buildPerformanceKpiRow('Trips', 'trips', 20, 90, 0, '2026-08', 'month', asOf);
    expect(row.hasPreviousData).toBe(false);
    expect(row.changeVsPrevious).toBeNull();
  });

  it('variance is actual - target and can be negative without being clamped', () => {
    const row = buildPerformanceKpiRow('Trips', 'trips', 20, 90, 18, '2026-08', 'month', asOf);
    expect(row.variance).toBe(20 - 90);
  });
});

describe('computeTripMetrics (exported for reuse by previous-period computation)', () => {
  it('empty trips -> all-zero metrics, not NaN', () => {
    const metrics = computeTripMetrics([]);
    expect(metrics.revenueInr).toBe(0);
    expect(metrics.tripCount).toBe(0);
    expect(metrics.marginPct).toBe(0);
  });
});
