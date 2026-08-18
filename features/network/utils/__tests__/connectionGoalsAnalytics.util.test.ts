import {
  achievementPct,
  buildAssetBreakdown,
  buildKamBreakdown,
  buildPerformanceKpiRow,
  buildPerformanceTripEvidenceRows,
  buildRegionBreakdown,
  buildSupplierBreakdown,
  changePct,
  computeGoalsActualsForRollup,
  computePreviousPeriodActuals,
  computeTargetToDate,
  computeTripMetrics,
  elapsedFraction,
  EMPTY_PERFORMANCE_CROSS_FILTER,
  filterTripsForCrossFilter,
  isPayableAffectedByFilter,
  pacingPct,
  periodBounds,
  previousPeriodAnchorMonthKey,
  resolveClientIdsForFilter,
  resolveFilteredPeriodTarget,
  resolvePeriodTarget,
  tripsInDateRange,
  tripsInSelectedRollup,
  type PerformanceCrossFilter,
} from '../connectionGoalsAnalytics.util';
import type { TripRow } from '@/features/trips/services/trips.service';
import type { NetworkGoalsStore } from '@/features/network/services/networkGoalsStorage.service';

// No trailing "Z" -- these must parse as LOCAL time (matching periodBounds'
// local-time Date construction), not a UTC instant that could land on a
// different local calendar day depending on the test machine's timezone.
function trip(
  pickupDate: string,
  clientPrice: number,
  supplierRate = 0,
  extra: Partial<TripRow> = {},
): Partial<TripRow> {
  return { pickup_date: pickupDate, client_price: clientPrice, supplier_rate: supplierRate, ...extra };
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

// ─── Phase 1 Commit 5: cross-filter engine ─────────────────────────────────

const CF = (patch: Partial<PerformanceCrossFilter> = {}): PerformanceCrossFilter => ({
  ...EMPTY_PERFORMANCE_CROSS_FILTER,
  ...patch,
});

const CLIENTS = [{ id: 'apple' }, { id: 'ajio' }, { id: 'acme' }];
const KAM_ASSIGNMENTS = { apple: 'bhujesh', ajio: 'bhujesh', acme: 'ravi' };
const CLIENT_REGIONS = { apple: 'south', ajio: 'north', acme: 'south' };

describe('resolveClientIdsForFilter', () => {
  it('no client-derived dimension active -> null ("no restriction"), not an empty set', () => {
    expect(resolveClientIdsForFilter(CF(), CLIENTS, KAM_ASSIGNMENTS, CLIENT_REGIONS)).toBeNull();
  });

  it('KAM filtering -> client-derived, matches every client assigned to that KAM', () => {
    const ids = resolveClientIdsForFilter(CF({ kamId: 'bhujesh' }), CLIENTS, KAM_ASSIGNMENTS, CLIENT_REGIONS);
    expect(ids).toEqual(new Set(['apple', 'ajio']));
  });

  it('Region filtering -> client-derived, matches every client in that region', () => {
    const ids = resolveClientIdsForFilter(CF({ regionId: 'south' }), CLIENTS, KAM_ASSIGNMENTS, CLIENT_REGIONS);
    expect(ids).toEqual(new Set(['apple', 'acme']));
  });

  it('Client filtering -> direct, exactly one id', () => {
    const ids = resolveClientIdsForFilter(CF({ clientId: 'apple' }), CLIENTS, KAM_ASSIGNMENTS, CLIENT_REGIONS);
    expect(ids).toEqual(new Set(['apple']));
  });

  it('multiple filters combine as an intersection, not a union', () => {
    // Bhujesh's clients: apple, ajio. South region: apple, acme. Intersection: apple only.
    const ids = resolveClientIdsForFilter(
      CF({ kamId: 'bhujesh', regionId: 'south' }),
      CLIENTS,
      KAM_ASSIGNMENTS,
      CLIENT_REGIONS,
    );
    expect(ids).toEqual(new Set(['apple']));
  });

  it('KAM never fabricated for suppliers/drivers -- resolveClientIdsForFilter only ever consults client-derived fields', () => {
    // supplierId/assetId aren't part of this function's input type at all --
    // this test documents that boundary rather than exercising new behavior.
    const ids = resolveClientIdsForFilter(CF({ kamId: 'bhujesh' }), CLIENTS, KAM_ASSIGNMENTS, CLIENT_REGIONS);
    expect(ids).not.toBeNull();
    expect([...ids!]).not.toContain('a-supplier-id');
  });
});

describe('filterTripsForCrossFilter', () => {
  const trips = [
    trip('2026-08-05T00:00:00', 1000, 800, { client_id: 'apple', supplier_id: 's1', vehicle_id: 'v1' }),
    trip('2026-08-06T00:00:00', 2000, 1500, { client_id: 'ajio', supplier_id: 's2', driver_id: 'd1' }),
    trip('2026-08-07T00:00:00', 3000, 2000, { client_id: 'acme', supplier_id: 's1', vehicle_id: 'v2' }),
  ] as TripRow[];

  it('no cross-filter -> returns the exact same array reference (the regression-safety case)', () => {
    const result = filterTripsForCrossFilter(trips, CF(), null);
    expect(result).toBe(trips);
  });

  it('Client filtering -> direct client_id match', () => {
    const clientIdSet = new Set(['apple']);
    const result = filterTripsForCrossFilter(trips, CF({ clientId: 'apple' }), clientIdSet);
    expect(result.map((t) => t.client_id)).toEqual(['apple']);
  });

  it('Supplier filtering -> direct trip.supplier_id match, independent of client', () => {
    const result = filterTripsForCrossFilter(trips, CF({ supplierId: 's1' }), null);
    expect(result.map((t) => t.client_id)).toEqual(['apple', 'acme']);
  });

  it('Vehicle asset filtering -> matches trip.vehicle_id', () => {
    const result = filterTripsForCrossFilter(trips, CF({ assetId: 'v2' }), null);
    expect(result).toHaveLength(1);
    expect(result[0].client_id).toBe('acme');
  });

  it('Driver asset filtering -> the same assetId field also matches trip.driver_id', () => {
    const result = filterTripsForCrossFilter(trips, CF({ assetId: 'd1' }), null);
    expect(result).toHaveLength(1);
    expect(result[0].client_id).toBe('ajio');
  });

  it('multiple filters combine as an AND across dimensions (client-set AND supplier)', () => {
    const clientIdSet = new Set(['apple', 'acme']); // e.g. Region=south
    const result = filterTripsForCrossFilter(trips, CF({ regionId: 'south', supplierId: 's1' }), clientIdSet);
    expect(result.map((t) => t.client_id)).toEqual(['apple', 'acme']);
  });

  it('client-derived filter excludes trips with no client_id at all', () => {
    const noClient = [trip('2026-08-05T00:00:00', 500, 400, { client_id: null })] as TripRow[];
    const result = filterTripsForCrossFilter(noClient, CF({ clientId: 'apple' }), new Set(['apple']));
    expect(result).toHaveLength(0);
  });
});

describe('cross-filter clearing', () => {
  it('clearing one filter (e.g. clientId) leaves the others active', () => {
    const withBoth = CF({ kamId: 'bhujesh', clientId: 'apple' });
    const clientCleared: PerformanceCrossFilter = { ...withBoth, clientId: null };
    expect(clientCleared.kamId).toBe('bhujesh');
    expect(clientCleared.clientId).toBeNull();
  });

  it('clear all returns to the exact empty default', () => {
    const filtered = CF({ kamId: 'bhujesh', clientId: 'apple', supplierId: 's1' });
    const cleared = EMPTY_PERFORMANCE_CROSS_FILTER;
    expect(cleared).not.toEqual(filtered);
    expect(cleared.kamId).toBeNull();
    expect(cleared.clientId).toBeNull();
    expect(cleared.supplierId).toBeNull();
  });
});

describe('filter persistence across Month/Quarter/Year', () => {
  it('resolveClientIdsForFilter and filterTripsForCrossFilter take no rollup/period argument at all -- '
    + 'the same crossFilter necessarily produces the same client-id set and filtered trips regardless of '
    + 'which Month/Quarter/Year is selected elsewhere in the panel', () => {
    const trips = [
      trip('2026-08-05T00:00:00', 1000, 800, { client_id: 'apple' }),
      trip('2025-01-05T00:00:00', 500, 400, { client_id: 'apple' }), // a wildly different period
    ] as TripRow[];
    const clientIdSet = resolveClientIdsForFilter(CF({ clientId: 'apple' }), CLIENTS, KAM_ASSIGNMENTS, CLIENT_REGIONS);
    const result = filterTripsForCrossFilter(trips, CF({ clientId: 'apple' }), clientIdSet);
    // Both trips match -- the client filter itself is period-agnostic; it's
    // computeGoalsActualsForRollup's OWN month-key filtering, not the cross-
    // filter, that later scopes this down to whichever period is selected.
    expect(result).toHaveLength(2);
  });
});

describe('KPI/trend/target/previous-period recalculation under a cross-filter', () => {
  const trips = [
    trip('2026-08-05T00:00:00', 100000, 80000, { client_id: 'apple' }),
    trip('2026-08-06T00:00:00', 200000, 150000, { client_id: 'ajio' }),
    trip('2026-07-10T00:00:00', 90000, 70000, { client_id: 'apple' }), // previous period, apple
    trip('2026-07-10T00:00:00', 300000, 200000, { client_id: 'acme' }), // previous period, NOT bhujesh's
  ] as TripRow[];
  const asOf = new Date(2026, 7, 17);

  function store(overrides: Partial<NetworkGoalsStore['months']> = {}): NetworkGoalsStore {
    return {
      version: 3,
      months: {
        '2026-08': {
          aggregate: { revenueInr: 1000000, tripCount: 100, marginPct: 30 },
          clients: { apple: { revenueInr: 120000, tripCount: 10 }, ajio: { revenueInr: 90000, tripCount: 8 } },
          vehicles: {},
          drivers: {},
        },
        ...overrides,
      },
      kamAssignments: KAM_ASSIGNMENTS,
      clientRegions: CLIENT_REGIONS,
      yearlyTargets: {},
      quarterlyTargets: {},
      updatedAt: '',
    };
  }

  it('KAM cross-filter recalculates actual, target, AND previous-period together -- not just a table', () => {
    const s = store();
    const cf = CF({ kamId: 'bhujesh' });
    const clientIdSet = resolveClientIdsForFilter(cf, CLIENTS, s.kamAssignments, s.clientRegions);
    const filteredTrips = filterTripsForCrossFilter(trips, cf, clientIdSet);

    const actual = computeGoalsActualsForRollup(filteredTrips, '2026-08', 'month');
    const target = resolveFilteredPeriodTarget(s, '2026-08', 'month', cf, clientIdSet);
    const previous = computePreviousPeriodActuals(filteredTrips, '2026-08', 'month', asOf);

    // Actual: apple (100000) + ajio (200000) only -- acme's trip must not leak in.
    expect(actual.revenueInr).toBe(300000);
    // Target: apple's (120000) + ajio's (90000) target, summed -- not the org aggregate (1000000).
    expect(target.revenueInr).toBe(210000);
    // Previous period: only apple's July trip (90000) -- acme's July trip excluded (not Bhujesh's client).
    expect(previous.revenueInr).toBe(90000);
  });

  it('Margin never gets a fabricated per-client target under a cross-filter', () => {
    const s = store();
    const cf = CF({ clientId: 'apple' });
    const clientIdSet = resolveClientIdsForFilter(cf, CLIENTS, s.kamAssignments, s.clientRegions);
    const target = resolveFilteredPeriodTarget(s, '2026-08', 'month', cf, clientIdSet);
    expect(target.marginPct).toBe(0); // "no target" -- buildPerformanceKpiRow already renders this as hasTarget=false
  });

  it('Supplier cross-filter -> no target at all, ever (no GoalFocus "supplier" case exists)', () => {
    const s = store();
    const cf = CF({ supplierId: 's1' });
    const target = resolveFilteredPeriodTarget(s, '2026-08', 'month', cf, null);
    expect(target.revenueInr).toBe(0);
    expect(target.tripCount).toBe(0);
  });

  it('Asset cross-filter -> that one asset\'s own target, independent of any client-side filter', () => {
    const s = store({
      '2026-08': {
        aggregate: { revenueInr: 0, tripCount: 0, marginPct: 0 },
        clients: {},
        vehicles: { v1: { revenueInr: 50000, tripCount: 5 } },
        drivers: {},
      },
    });
    const target = resolveFilteredPeriodTarget(s, '2026-08', 'month', CF({ assetId: 'v1' }), null);
    expect(target.revenueInr).toBe(50000);
    expect(target.tripCount).toBe(5);
  });
});

describe('Payable attribution under KAM/Region cross-filters', () => {
  it('KAM filter active -> Payable is NOT affected, must show the real org-wide figure with a label', () => {
    expect(isPayableAffectedByFilter(CF({ kamId: 'bhujesh' }))).toBe(false);
  });

  it('Region filter active -> same rule', () => {
    expect(isPayableAffectedByFilter(CF({ regionId: 'south' }))).toBe(false);
  });

  it('Client/Supplier/Asset filters alone -> Payable is unaffected by THIS rule (no KAM/Region active)', () => {
    // isPayableAffectedByFilter only answers the KAM/Region question; it
    // deliberately does not react to clientId/supplierId/assetId.
    expect(isPayableAffectedByFilter(CF({ clientId: 'apple' }))).toBe(true);
  });

  it('no cross-filter at all -> Payable is (trivially) affected by nothing, no label needed', () => {
    expect(isPayableAffectedByFilter(CF())).toBe(true);
  });
});

describe('regression: Aggregate with no filters must equal the pre-Performance, unfiltered calculation', () => {
  it('resolveClientIdsForFilter(empty) is null and resolveFilteredPeriodTarget(empty) equals resolvePeriodTarget', () => {
    const s: NetworkGoalsStore = {
      version: 3,
      months: { '2026-08': { aggregate: { revenueInr: 500000, tripCount: 40, marginPct: 28 }, clients: {}, vehicles: {}, drivers: {} } },
      kamAssignments: {},
      clientRegions: {},
      yearlyTargets: {},
      quarterlyTargets: {},
      updatedAt: '',
    };
    const clientIdSet = resolveClientIdsForFilter(CF(), CLIENTS, s.kamAssignments, s.clientRegions);
    expect(clientIdSet).toBeNull();

    const unfilteredTarget = resolvePeriodTarget(s, '2026-08', 'month');
    const filteredTarget = resolveFilteredPeriodTarget(s, '2026-08', 'month', CF(), clientIdSet);
    expect(filteredTarget).toEqual(unfilteredTarget);
  });

  it('filterTripsForCrossFilter(empty) returns the identical trips the old Goals calculation used -- same actual', () => {
    const trips = [
      trip('2026-08-05T00:00:00', 100000, 80000, { client_id: 'apple' }),
      trip('2026-08-06T00:00:00', 200000, 150000, { client_id: 'ajio' }),
    ] as TripRow[];
    const filtered = filterTripsForCrossFilter(trips, CF(), null);
    const oldActual = computeGoalsActualsForRollup(trips, '2026-08', 'month');
    const newActual = computeGoalsActualsForRollup(filtered, '2026-08', 'month');
    expect(newActual).toEqual(oldActual);
  });
});

describe('buildKamBreakdown / buildRegionBreakdown / buildSupplierBreakdown / buildAssetBreakdown (Phase 1 Commit 6)', () => {
  const goalsStore: NetworkGoalsStore = {
    version: 3,
    months: {
      '2026-08': {
        aggregate: { revenueInr: 1000000, tripCount: 100, marginPct: 30 },
        clients: { apple: { revenueInr: 120000, tripCount: 10 }, ajio: { revenueInr: 90000, tripCount: 8 } },
        vehicles: {},
        drivers: {},
      },
    },
    kamAssignments: KAM_ASSIGNMENTS,
    clientRegions: CLIENT_REGIONS,
    yearlyTargets: {},
    quarterlyTargets: {},
    updatedAt: '',
  };

  // apple/ajio -> bhujesh (south/north); acme -> ravi (south), but acme has
  // no client target set in goalsStore.months['2026-08'].clients above.
  const trips = [
    trip('2026-08-05T00:00:00', 100000, 80000, {
      client_id: 'apple',
      supplier_id: 'sup-1',
      vehicle_id: 'veh-1',
      driver_id: 'drv-1',
    }),
    trip('2026-08-06T00:00:00', 200000, 150000, {
      client_id: 'ajio',
      supplier_id: 'sup-2',
      vehicle_id: 'veh-2',
      driver_id: 'drv-2',
    }),
    trip('2026-08-07T00:00:00', 50000, 30000, {
      client_id: 'acme',
      supplier_id: 'sup-1',
      vehicle_id: 'veh-1',
      driver_id: 'drv-1',
    }),
  ] as TripRow[];
  const previousTrips = [
    trip('2026-07-10T00:00:00', 80000, 60000, {
      client_id: 'apple',
      supplier_id: 'sup-1',
      vehicle_id: 'veh-1',
      driver_id: 'drv-1',
    }),
  ] as TripRow[];

  const kamById = new Map([
    ['bhujesh', { name: 'Bhujesh' }],
    ['ravi', { name: 'Ravi' }],
  ]);
  const supplierById = new Map([
    ['sup-1', { name: 'Supplier One' }],
    ['sup-2', { name: 'Supplier Two' }],
  ]);
  const vehicleById = new Map([
    ['veh-1', { name: 'MH-01' }],
    ['veh-2', { name: 'MH-02' }],
  ]);
  const driverById = new Map([
    ['drv-1', { name: 'Driver One' }],
    ['drv-2', { name: 'Driver Two' }],
  ]);

  it('buildKamBreakdown: only KAMs with an actual matching trip appear; sums their clients\' revenue and target', () => {
    const rows = buildKamBreakdown(goalsStore, trips, previousTrips, kamById, '2026-08', 'month');
    expect(rows.map((r) => r.id).sort()).toEqual(['bhujesh', 'ravi']);

    const bhujesh = rows.find((r) => r.id === 'bhujesh')!;
    expect(bhujesh.actualRevenue).toBe(300000); // apple 100000 + ajio 200000
    expect(bhujesh.actualTrips).toBe(2);
    expect(bhujesh.targetRevenue).toBe(210000); // apple 120000 + ajio 90000, summed
    expect(bhujesh.hasTarget).toBe(true);
    expect(bhujesh.achievement).toBe(achievementPct(300000, 210000));
    expect(bhujesh.previousActualRevenue).toBe(80000); // apple's July trip only
    expect(bhujesh.hasPreviousData).toBe(true);

    const ravi = rows.find((r) => r.id === 'ravi')!;
    expect(ravi.actualRevenue).toBe(50000); // acme
    expect(ravi.targetRevenue).toBe(0); // acme has no target set in the store
    expect(ravi.hasTarget).toBe(false);
    expect(ravi.achievement).toBeNull();
  });

  it('buildKamBreakdown: a KAM is excluded entirely if none of their assigned clients has a matching trip', () => {
    const noAcmeTrips = trips.filter((t) => t.client_id !== 'acme');
    const rows = buildKamBreakdown(goalsStore, noAcmeTrips, [], kamById, '2026-08', 'month');
    expect(rows.map((r) => r.id)).toEqual(['bhujesh']);
  });

  it('buildRegionBreakdown: groups by clientRegions -- there is no trip.region field to read', () => {
    const rows = buildRegionBreakdown(goalsStore, trips, previousTrips, '2026-08', 'month');
    expect(rows.map((r) => r.id).sort()).toEqual(['north', 'south']);

    const south = rows.find((r) => r.id === 'south')!; // apple + acme
    expect(south.actualRevenue).toBe(150000);
    expect(south.actualTrips).toBe(2);
    expect(south.targetRevenue).toBe(120000); // only apple has a set target; acme has none

    const north = rows.find((r) => r.id === 'north')!; // ajio only
    expect(north.actualRevenue).toBe(200000);
    expect(north.targetRevenue).toBe(90000);
  });

  it('buildSupplierBreakdown: direct trip.supplier_id grouping, no target column, cost summed from supplier_rate', () => {
    const rows = buildSupplierBreakdown(trips, previousTrips, supplierById);
    expect(rows.map((r) => r.id).sort()).toEqual(['sup-1', 'sup-2']);

    const sup1 = rows.find((r) => r.id === 'sup-1')!; // apple's + acme's trips
    expect(sup1.actualRevenue).toBe(150000);
    expect(sup1.actualTrips).toBe(2);
    expect(sup1.actualCost).toBe(110000); // 80000 + 30000
    expect(sup1.previousActualRevenue).toBe(80000);
    expect(sup1.hasPreviousData).toBe(true);

    const sup2 = rows.find((r) => r.id === 'sup-2')!;
    expect(sup2.actualRevenue).toBe(200000);
    expect(sup2.previousActualRevenue).toBe(0);
    expect(sup2.hasPreviousData).toBe(false);
  });

  it('buildSupplierBreakdown: a supplier with zero matching trips never appears in the table', () => {
    const rows = buildSupplierBreakdown(trips, previousTrips, supplierById);
    expect(rows.find((r) => r.id === 'sup-nonexistent')).toBeUndefined();
  });

  it('buildAssetBreakdown: vehicle focus groups by vehicle_id', () => {
    const rows = buildAssetBreakdown(trips, previousTrips, 'vehicle', vehicleById);
    expect(rows.map((r) => r.id).sort()).toEqual(['veh-1', 'veh-2']);

    const veh1 = rows.find((r) => r.id === 'veh-1')!; // apple's + acme's trips
    expect(veh1.actualRevenue).toBe(150000);
    expect(veh1.actualTrips).toBe(2);
  });

  it('buildAssetBreakdown: driver focus groups by driver_id, independent of the vehicle grouping', () => {
    const rows = buildAssetBreakdown(trips, previousTrips, 'driver', driverById);
    expect(rows.map((r) => r.id).sort()).toEqual(['drv-1', 'drv-2']);

    const drv1 = rows.find((r) => r.id === 'drv-1')!;
    expect(drv1.actualRevenue).toBe(150000);
  });

  it('all breakdown rows sort by actualRevenue descending', () => {
    const rows = buildSupplierBreakdown(trips, previousTrips, supplierById);
    expect(rows[0].actualRevenue).toBeGreaterThanOrEqual(rows[1].actualRevenue);
  });
});

describe('Phase 2 Commit 1: entity trip evidence must be period-scoped, not just cross-filter-scoped', () => {
  it('tripsInSelectedRollup excludes a trip outside the selected month even though it matches the entity', () => {
    // Mirrors NetworkDesktopPerformancePanel progressEntityTrips composition.
    const entityTrips = [
      trip('2026-08-05T00:00:00', 100000, 0, { id: 'in-period' }),
      trip('2026-07-20T00:00:00', 90000, 0, { id: 'out-of-period' }),
    ] as TripRow[];
    const scoped = tripsInSelectedRollup(entityTrips, '2026-08', 'month');
    expect(scoped.map((t) => t.id)).toEqual(['in-period']);
  });
});

describe('Phase 2 Commit 3: breakdown Actuals must match aggregate KPI period (not full calendar Q/Y)', () => {
  // buildKam/Region/Supplier/AssetBreakdown only sum whatever trips they
  // are given. Callers must pre-scope with tripsInSelectedRollup -- the
  // same month-key window computeGoalsActualsForRollup uses. periodBounds
  // is the FULL quarter/year (for Target-to-date pacing) and must NOT be
  // used for Actuals, or Quarter/Year breakdowns disagree with the KPI.

  const goalsStore: NetworkGoalsStore = {
    version: 3,
    months: {
      '2026-08': {
        aggregate: { revenueInr: 1000000, tripCount: 100, marginPct: 30 },
        clients: { apple: { revenueInr: 120000, tripCount: 10 } },
        vehicles: {},
        drivers: {},
      },
    },
    kamAssignments: { apple: 'bhujesh' },
    clientRegions: { apple: 'south' },
    yearlyTargets: {},
    quarterlyTargets: {},
    updatedAt: '',
  };

  const allTimeTrips = [
    trip('2026-08-05T00:00:00', 100000, 80000, {
      client_id: 'apple',
      supplier_id: 'sup-1',
      vehicle_id: 'veh-1',
      driver_id: 'drv-1',
    }),
    trip('2026-07-20T00:00:00', 90000, 70000, {
      client_id: 'apple',
      supplier_id: 'sup-1',
      vehicle_id: 'veh-1',
      driver_id: 'drv-1',
    }),
  ] as TripRow[];
  const previousTrips = [] as TripRow[];
  const kamById = new Map([['bhujesh', { name: 'Bhujesh' }]]);
  const supplierById = new Map([['sup-1', { name: 'Supplier One' }]]);
  const vehicleById = new Map([['veh-1', { name: 'MH-01' }]]);
  const driverById = new Map([['drv-1', { name: 'Driver One' }]]);

  it('without period scoping, KAM/Region/Supplier/Asset Actuals include out-of-period trips (the bug)', () => {
    expect(buildKamBreakdown(goalsStore, allTimeTrips, previousTrips, kamById, '2026-08', 'month')[0].actualRevenue).toBe(190000);
    expect(buildRegionBreakdown(goalsStore, allTimeTrips, previousTrips, '2026-08', 'month')[0].actualRevenue).toBe(190000);
    expect(buildSupplierBreakdown(allTimeTrips, previousTrips, supplierById)[0].actualRevenue).toBe(190000);
    expect(buildAssetBreakdown(allTimeTrips, previousTrips, 'vehicle', vehicleById)[0].actualRevenue).toBe(190000);
    expect(buildAssetBreakdown(allTimeTrips, previousTrips, 'driver', driverById)[0].actualRevenue).toBe(190000);
  });

  it('with tripsInSelectedRollup, all four Actuals match August-only and the aggregate KPI', () => {
    const periodScoped = tripsInSelectedRollup(allTimeTrips, '2026-08', 'month');
    expect(periodScoped).toHaveLength(1);
    expect(computeGoalsActualsForRollup(allTimeTrips, '2026-08', 'month').revenueInr).toBe(100000);

    expect(buildKamBreakdown(goalsStore, periodScoped, previousTrips, kamById, '2026-08', 'month')[0].actualRevenue).toBe(100000);
    expect(buildRegionBreakdown(goalsStore, periodScoped, previousTrips, '2026-08', 'month')[0].actualRevenue).toBe(100000);
    expect(buildSupplierBreakdown(periodScoped, previousTrips, supplierById)[0].actualRevenue).toBe(100000);
    expect(buildAssetBreakdown(periodScoped, previousTrips, 'vehicle', vehicleById)[0].actualRevenue).toBe(100000);
    expect(buildAssetBreakdown(periodScoped, previousTrips, 'driver', driverById)[0].actualRevenue).toBe(100000);
  });

  it('Quarter selected as August is Jul+Aug (YTD within Q), NOT full Jul-Sep -- periodBounds would wrongly include Sep', () => {
    const qTrips = [
      trip('2026-07-10T00:00:00', 10000, 0, { id: 'jul', client_id: 'apple', supplier_id: 'sup-1', vehicle_id: 'veh-1', driver_id: 'drv-1' }),
      trip('2026-08-10T00:00:00', 20000, 0, { id: 'aug', client_id: 'apple', supplier_id: 'sup-1', vehicle_id: 'veh-1', driver_id: 'drv-1' }),
      trip('2026-09-10T00:00:00', 40000, 0, { id: 'sep', client_id: 'apple', supplier_id: 'sup-1', vehicle_id: 'veh-1', driver_id: 'drv-1' }),
    ] as TripRow[];

    // Full calendar Q3 (the Target-to-date window) would include Sep.
    const { start, end } = periodBounds('2026-08', 'quarter');
    expect(tripsInDateRange(qTrips, start, end).map((t) => t.id).sort()).toEqual(['aug', 'jul', 'sep']);

    // Aggregate Actuals and breakdown Actuals share the YTD-within-quarter window.
    const scoped = tripsInSelectedRollup(qTrips, '2026-08', 'quarter');
    expect(scoped.map((t) => t.id).sort()).toEqual(['aug', 'jul']);
    expect(computeGoalsActualsForRollup(qTrips, '2026-08', 'quarter').revenueInr).toBe(30000);
    expect(buildKamBreakdown(goalsStore, scoped, previousTrips, kamById, '2026-08', 'quarter')[0].actualRevenue).toBe(30000);
  });

  it('Year selected as March is Jan-Mar YTD, NOT full Jan-Dec', () => {
    const yTrips = [
      trip('2026-02-10T00:00:00', 10000, 0, { id: 'feb', client_id: 'apple', supplier_id: 'sup-1', vehicle_id: 'veh-1', driver_id: 'drv-1' }),
      trip('2026-03-10T00:00:00', 20000, 0, { id: 'mar', client_id: 'apple', supplier_id: 'sup-1', vehicle_id: 'veh-1', driver_id: 'drv-1' }),
      trip('2026-11-10T00:00:00', 80000, 0, { id: 'nov', client_id: 'apple', supplier_id: 'sup-1', vehicle_id: 'veh-1', driver_id: 'drv-1' }),
    ] as TripRow[];
    const scoped = tripsInSelectedRollup(yTrips, '2026-03', 'year');
    expect(scoped.map((t) => t.id).sort()).toEqual(['feb', 'mar']);
    expect(computeGoalsActualsForRollup(yTrips, '2026-03', 'year').revenueInr).toBe(30000);
    expect(buildSupplierBreakdown(scoped, previousTrips, supplierById)[0].actualRevenue).toBe(30000);
  });

  it('buildPerformanceKpiRow on a KAM row with a real target surfaces Target-to-date and Pacing (entity pacing)', () => {
    const periodScoped = tripsInSelectedRollup(allTimeTrips, '2026-08', 'month');
    const kam = buildKamBreakdown(goalsStore, periodScoped, previousTrips, kamById, '2026-08', 'month')[0];
    const asOf = new Date(2026, 7, 16); // mid-August
    const kpi = buildPerformanceKpiRow(
      'KAM',
      'inr',
      kam.actualRevenue,
      kam.targetRevenue,
      kam.previousActualRevenue,
      '2026-08',
      'month',
      asOf,
    );
    expect(kpi.hasTarget).toBe(true);
    expect(kpi.periodTarget).toBe(120000);
    expect(kpi.actual).toBe(100000);
    expect(kpi.targetToDate).not.toBeNull();
    expect(kpi.pacing).not.toBeNull();
  });

  it('buildPerformanceKpiRow on a Supplier row with target 0 never fabricates Target-to-date or Pacing', () => {
    const periodScoped = tripsInSelectedRollup(allTimeTrips, '2026-08', 'month');
    const supplier = buildSupplierBreakdown(periodScoped, previousTrips, supplierById)[0];
    const kpi = buildPerformanceKpiRow(
      'Supplier',
      'inr',
      supplier.actualRevenue,
      0,
      supplier.previousActualRevenue,
      '2026-08',
      'month',
      new Date(2026, 7, 16),
    );
    expect(kpi.hasTarget).toBe(false);
    expect(kpi.targetToDate).toBeNull();
    expect(kpi.pacing).toBeNull();
    expect(kpi.achievement).toBeNull();
  });
});

describe('buildPerformanceTripEvidenceRows (Phase 2 Commit 1)', () => {
  const supplierById = new Map([['sup-1', { name: 'Supplier One' }]]);
  const vehicleById = new Map([['veh-1', { name: 'MH-01' }]]);
  const driverById = new Map([['drv-1', { name: 'Driver One' }]]);

  it('maps every locked evidence column, preferring lookup names over the trip\'s own denormalized fields', () => {
    const trips = [
      trip('2026-08-05T00:00:00', 100000, 60000, {
        id: 't1',
        trip_number: 'TRP001',
        client_name: 'Apple Retail',
        supplier_id: 'sup-1',
        supplier_name: 'Stale Supplier Name',
        vehicle_id: 'veh-1',
        vehicle_display_number: 'STALE-VEH',
        driver_id: 'drv-1',
        driver_display_name: 'Stale Driver Name',
        margin: 40000,
        status: 'in_transit',
      }),
    ] as TripRow[];

    const rows = buildPerformanceTripEvidenceRows(trips, { supplierById, vehicleById, driverById });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe('t1');
    expect(row.tripRef).toBe('TRP001');
    expect(row.clientName).toBe('Apple Retail');
    expect(row.supplierName).toBe('Supplier One'); // lookup wins over trip.supplier_name
    expect(row.vehicleName).toBe('MH-01'); // lookup wins over trip.vehicle_display_number
    expect(row.driverName).toBe('Driver One'); // lookup wins over trip.driver_display_name
    expect(row.sales).toBe(100000);
    expect(row.cost).toBe(60000);
    expect(row.margin).toBe(40000); // uses the stored margin column, not sales - cost
    expect(row.statusLabel).toBe('In transit');
  });

  it('falls back to the trip\'s own denormalized name fields when no lookup map entry exists', () => {
    const trips = [
      trip('2026-08-05T00:00:00', 50000, 30000, {
        id: 't2',
        supplier_id: 'sup-unknown',
        supplier_name: 'Direct Supplier Name',
        vehicle_id: null,
        vehicle_display_number: 'DL01AB1234',
        driver_id: null,
        driver_display_name: 'Direct Driver Name',
      }),
    ] as TripRow[];

    const rows = buildPerformanceTripEvidenceRows(trips, { supplierById, vehicleById, driverById });
    expect(rows[0].supplierName).toBe('Direct Supplier Name');
    expect(rows[0].vehicleName).toBe('DL01AB1234');
    expect(rows[0].driverName).toBe('Direct Driver Name');
  });

  it('falls back to sales - cost when trip.margin is missing, and to "--" when no name is available at all', () => {
    const trips = [
      trip('2026-08-05T00:00:00', 80000, 50000, {
        id: 't3',
        margin: undefined as unknown as number,
        client_name: '',
        supplier_id: null,
        supplier_name: null,
        vehicle_id: null,
        vehicle_display_number: null,
        driver_id: null,
        driver_display_name: null,
      }),
    ] as TripRow[];

    const rows = buildPerformanceTripEvidenceRows(trips, {});
    expect(rows[0].margin).toBe(30000); // 80000 - 50000
    expect(rows[0].clientName).toBe('—');
    expect(rows[0].supplierName).toBe('—');
    expect(rows[0].vehicleName).toBe('—');
    expect(rows[0].driverName).toBe('—');
  });

  it('sorts rows by trip date descending -- most recent evidence first', () => {
    const trips = [
      trip('2026-08-01T00:00:00', 10000, 0, { id: 'older' }),
      trip('2026-08-15T00:00:00', 20000, 0, { id: 'newer' }),
    ] as TripRow[];
    const rows = buildPerformanceTripEvidenceRows(trips);
    expect(rows.map((r) => r.id)).toEqual(['newer', 'older']);
  });

  it('an empty trip array produces an empty row set -- callers use this to disable Download', () => {
    expect(buildPerformanceTripEvidenceRows([])).toEqual([]);
  });
});

describe('Phase 2 Commit 2: Client Progress previous-period must reuse the SAME filtered trip population', () => {
  it('computeTripMetrics(previousFilteredTrips filtered by client_id) matches what buildKamBreakdown/buildRegionBreakdown already compute for the same client', () => {
    // Mirrors exactly the composition NetworkDesktopPerformancePanel.tsx now
    // uses for progressKpi's "client" branch -- the bug being fixed was
    // that this was hardcoded to previousActual: 0 / hasPreviousData: false
    // unconditionally, even when previousFilteredTrips genuinely had this
    // client's trips in it.
    const previousFilteredTrips = [
      trip('2026-07-10T00:00:00', 90000, 70000, { client_id: 'apple' }),
      trip('2026-07-12T00:00:00', 30000, 20000, { client_id: 'apple' }),
      trip('2026-07-10T00:00:00', 300000, 200000, { client_id: 'acme' }), // a different client
    ] as TripRow[];

    const appleTrips = previousFilteredTrips.filter((t) => t.client_id === 'apple');
    const metrics = computeTripMetrics(appleTrips);

    expect(metrics.revenueInr).toBe(120000); // 90000 + 30000, acme's trip excluded
    expect(metrics.revenueInr > 0).toBe(true); // hasPreviousData would now be true, not hardcoded false
    expect(changePct(150000, metrics.revenueInr)).toBe(25); // (150000-120000)/120000 = 25%
  });

  it('a client with no previous-period trips at all correctly reports hasPreviousData: false, not a fabricated value', () => {
    const previousFilteredTrips = [
      trip('2026-07-10T00:00:00', 90000, 70000, { client_id: 'acme' }),
    ] as TripRow[];
    const ajioTrips = previousFilteredTrips.filter((t) => t.client_id === 'ajio');
    const metrics = computeTripMetrics(ajioTrips);
    expect(metrics.revenueInr).toBe(0);
  });
});

describe('Phase 2 Commit 3: breakdown builders must only sum the SELECTED-period trips, not all-time', () => {
  // Mirrors exactly the composition NetworkDesktopPerformancePanel.tsx now
  // applies before calling buildKamBreakdown/buildRegionBreakdown/
  // buildSupplierBreakdown/buildAssetBreakdown -- previously these were fed
  // filteredTrips directly (cross-filter-scoped only, otherwise all-time),
  // so an entity's "actual" silently included trips from every period the
  // org has ever had, while previousActualRevenue (fed previousFilteredTrips,
  // already window-scoped) did not -- an inconsistency within the same row.
  const goalsStore: NetworkGoalsStore = {
    version: 3,
    months: {
      '2026-08': {
        aggregate: { revenueInr: 0, tripCount: 0, marginPct: 0 },
        clients: { apple: { revenueInr: 120000, tripCount: 10 } },
        vehicles: {},
        drivers: {},
      },
    },
    kamAssignments: KAM_ASSIGNMENTS,
    clientRegions: CLIENT_REGIONS,
    yearlyTargets: {},
    quarterlyTargets: {},
    updatedAt: '',
  };

  const mixedPeriodTrips = [
    trip('2026-08-05T00:00:00', 100000, 60000, {
      client_id: 'apple',
      supplier_id: 'sup-1',
      vehicle_id: 'veh-1',
    }),
    // Same client/supplier/vehicle, but from a different (earlier) month --
    // must be excluded once the panel's period-scoping wrapper is applied.
    trip('2026-01-05T00:00:00', 900000, 500000, {
      client_id: 'apple',
      supplier_id: 'sup-1',
      vehicle_id: 'veh-1',
    }),
  ] as TripRow[];

  function periodScope(trips: TripRow[]): TripRow[] {
    return tripsInSelectedRollup(trips, '2026-08', 'month');
  }

  it('KAM actual only includes the selected period once periodScope is applied, not the January trip', () => {
    const scoped = periodScope(mixedPeriodTrips);
    const rows = buildKamBreakdown(goalsStore, scoped, [], new Map([['bhujesh', { name: 'Bhujesh' }]]), '2026-08', 'month');
    const bhujesh = rows.find((r) => r.id === 'bhujesh')!;
    expect(bhujesh.actualRevenue).toBe(100000); // NOT 100000 + 900000
  });

  it('without period-scoping, the same builder would wrongly include the January trip -- proving the bug this fixes', () => {
    // Deliberately calling the builder with the UNscoped array to document
    // the exact failure mode being closed, not just the fix.
    const rows = buildKamBreakdown(goalsStore, mixedPeriodTrips, [], new Map([['bhujesh', { name: 'Bhujesh' }]]), '2026-08', 'month');
    const bhujesh = rows.find((r) => r.id === 'bhujesh')!;
    expect(bhujesh.actualRevenue).toBe(1000000); // 100000 + 900000 -- the bug
  });

  it('Supplier actual only includes the selected period once periodScope is applied', () => {
    const scoped = periodScope(mixedPeriodTrips);
    const rows = buildSupplierBreakdown(scoped, [], new Map([['sup-1', { name: 'Supplier One' }]]));
    expect(rows.find((r) => r.id === 'sup-1')!.actualRevenue).toBe(100000);
  });

  it('Asset actual only includes the selected period once periodScope is applied', () => {
    const scoped = periodScope(mixedPeriodTrips);
    const rows = buildAssetBreakdown(scoped, [], 'vehicle', new Map([['veh-1', { name: 'MH-01' }]]));
    expect(rows.find((r) => r.id === 'veh-1')!.actualRevenue).toBe(100000);
  });
});

describe('Phase 2 Commit 3: buildPerformanceKpiRow reused for entity-level Progress -- no special-casing needed', () => {
  const selectedMonthKey = '2026-08';
  const rollup = 'month';
  const asOf = new Date(2026, 7, 17); // Aug 17 -- mid-period

  it('entity target present -> real target-to-date and pacing (KAM/Region/Client shape)', () => {
    const row = buildPerformanceKpiRow(
      'KAM', 'inr', 155000 /* actual */, 330000 /* target */, 100000 /* previous */,
      selectedMonthKey, rollup, asOf,
    );
    expect(row.hasTarget).toBe(true);
    expect(row.targetToDate).not.toBeNull();
    expect(row.pacing).not.toBeNull();
    expect(row.achievement).toBe(achievementPct(155000, 330000));
  });

  it('no entity target at all -> targetToDate/pacing both null, never fabricated (Supplier shape)', () => {
    const row = buildPerformanceKpiRow('Supplier', 'inr', 155000, 0, 100000, selectedMonthKey, rollup, asOf);
    expect(row.hasTarget).toBe(false);
    expect(row.targetToDate).toBeNull();
    expect(row.pacing).toBeNull();
    expect(row.achievement).toBeNull();
  });

  it('Asset target exists (resolved via resolveFilteredPeriodTarget) -> real target-to-date and pacing', () => {
    const store: NetworkGoalsStore = {
      version: 3,
      months: {
        '2026-08': {
          aggregate: { revenueInr: 0, tripCount: 0, marginPct: 0 },
          clients: {},
          vehicles: { 'veh-1': { revenueInr: 200000, tripCount: 10 } },
          drivers: {},
        },
      },
      kamAssignments: {},
      clientRegions: {},
      yearlyTargets: {},
      quarterlyTargets: {},
      updatedAt: '',
    };
    const target = resolveFilteredPeriodTarget(
      store, selectedMonthKey, rollup, { supplierId: null, assetId: 'veh-1' }, null,
    );
    expect(target.revenueInr).toBe(200000);
    const row = buildPerformanceKpiRow('Asset', 'inr', 90000, target.revenueInr, 0, selectedMonthKey, rollup, asOf);
    expect(row.hasTarget).toBe(true);
    expect(row.targetToDate).not.toBeNull();
    expect(row.pacing).not.toBeNull();
  });

  it('Asset target absent -> resolveFilteredPeriodTarget returns 0, no fabricated pacing', () => {
    const store: NetworkGoalsStore = {
      version: 3,
      months: { '2026-08': { aggregate: { revenueInr: 0, tripCount: 0, marginPct: 0 }, clients: {}, vehicles: {}, drivers: {} } },
      kamAssignments: {},
      clientRegions: {},
      yearlyTargets: {},
      quarterlyTargets: {},
      updatedAt: '',
    };
    const target = resolveFilteredPeriodTarget(
      store, selectedMonthKey, rollup, { supplierId: null, assetId: 'veh-unknown' }, null,
    );
    expect(target.revenueInr).toBe(0);
    const row = buildPerformanceKpiRow('Asset', 'inr', 90000, target.revenueInr, 0, selectedMonthKey, rollup, asOf);
    expect(row.hasTarget).toBe(false);
    expect(row.targetToDate).toBeNull();
    expect(row.pacing).toBeNull();
  });

  it('Vehicle/Driver focus does not alter target resolution incorrectly -- a driver-only target still resolves when no vehicle target exists for that id', () => {
    const store: NetworkGoalsStore = {
      version: 3,
      months: {
        '2026-08': {
          aggregate: { revenueInr: 0, tripCount: 0, marginPct: 0 },
          clients: {},
          vehicles: {}, // no vehicle target for this id
          drivers: { 'drv-1': { revenueInr: 80000, tripCount: 6 } },
        },
      },
      kamAssignments: {},
      clientRegions: {},
      yearlyTargets: {},
      quarterlyTargets: {},
      updatedAt: '',
    };
    // resolveFilteredPeriodTarget takes no assetFocus parameter at all --
    // it resolves independent of whichever sub-focus the panel's own UI
    // toggle happens to be showing.
    const target = resolveFilteredPeriodTarget(
      store, selectedMonthKey, rollup, { supplierId: null, assetId: 'drv-1' }, null,
    );
    expect(target.revenueInr).toBe(80000);
  });
});
