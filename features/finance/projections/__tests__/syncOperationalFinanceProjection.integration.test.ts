/**
 * Integration test: exercises syncOperationalFinanceProjection against a REAL
 * QueryClient (not a mock) to verify it actually invalidates the trip/ledger/
 * reconciliation/identity query families it claims to touch. A mock-only test
 * would pass even if the wiring to react-query were broken.
 */
import { QueryClient } from '@tanstack/react-query';
import { syncOperationalFinanceProjection } from '../syncOperationalFinanceProjection';
import { queryKeys } from '@/lib/queryKeys';

describe('syncOperationalFinanceProjection (integration with real QueryClient)', () => {
  // The underlying invalidation helpers (lib/queries/operationalInvalidation) batch their
  // invalidateQueries calls behind an 80ms setTimeout debounce keyed by trip/org. Use fake
  // timers and advance past that window so each test observes the settled result.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function flushDebounce() {
    jest.advanceTimersByTime(100);
  }

  const organizationId = 'org-1';
  const tripId = 'trip-1';

  function seededClient(): QueryClient {
    const qc = new QueryClient();
    // Seed the cache with data for every query family this sync touches so we can
    // assert each one gets invalidated (an invalidated query with no observers is
    // marked stale rather than immediately refetched).
    const seed = (key: unknown[]) => qc.setQueryData(key, { seeded: true });
    seed(queryKeys.trips.detail(tripId) as unknown as unknown[]);
    seed(queryKeys.trips.bundle(tripId) as unknown as unknown[]);
    seed(queryKeys.transactions.all(organizationId) as unknown as unknown[]);
    seed(queryKeys.transactions.finite(organizationId) as unknown as unknown[]);
    seed(queryKeys.invoicing.trips(organizationId) as unknown as unknown[]);
    seed(queryKeys.operations.controlCenter(organizationId) as unknown as unknown[]);
    seed(queryKeys.operations.healthSnapshot(organizationId) as unknown as unknown[]);
    seed(queryKeys.trips.all(organizationId) as unknown as unknown[]);
    seed(queryKeys.trips.finite(organizationId) as unknown as unknown[]);
    seed(queryKeys.indents.all(organizationId) as unknown as unknown[]);
    seed(['q', 'vehicle-ledger']);
    seed(['q', 'garage']);
    seed(['q', 'business-pulse']);
    return qc;
  }

  function isInvalidated(qc: QueryClient, key: unknown[]): boolean {
    return qc.getQueryState(key)?.isInvalidated === true;
  }

  it('invalidates trip operational state for the given tripId', () => {
    const qc = seededClient();
    syncOperationalFinanceProjection({ queryClient: qc, organizationId, tripId });
    flushDebounce();
    expect(isInvalidated(qc, queryKeys.trips.detail(tripId) as unknown as unknown[])).toBe(true);
    expect(isInvalidated(qc, queryKeys.trips.bundle(tripId) as unknown as unknown[])).toBe(true);
  });

  it('invalidates org-wide ledger/transactions/invoicing state', () => {
    const qc = seededClient();
    syncOperationalFinanceProjection({ queryClient: qc, organizationId, tripId });
    flushDebounce();
    expect(isInvalidated(qc, queryKeys.transactions.all(organizationId) as unknown as unknown[])).toBe(true);
    expect(isInvalidated(qc, queryKeys.transactions.finite(organizationId) as unknown as unknown[])).toBe(true);
    expect(isInvalidated(qc, queryKeys.invoicing.trips(organizationId) as unknown as unknown[])).toBe(true);
    expect(isInvalidated(qc, ['q', 'garage'])).toBe(true);
    expect(isInvalidated(qc, ['q', 'business-pulse'])).toBe(true);
  });

  it('invalidates reconciliation and observability state for the org', () => {
    const qc = seededClient();
    syncOperationalFinanceProjection({ queryClient: qc, organizationId, tripId });
    flushDebounce();
    expect(isInvalidated(qc, queryKeys.operations.controlCenter(organizationId) as unknown as unknown[])).toBe(true);
    expect(isInvalidated(qc, queryKeys.operations.healthSnapshot(organizationId) as unknown as unknown[])).toBe(true);
  });

  it('invalidates operational identity (trip list, indents) for the org', () => {
    const qc = seededClient();
    syncOperationalFinanceProjection({ queryClient: qc, organizationId, tripId });
    flushDebounce();
    expect(isInvalidated(qc, queryKeys.trips.all(organizationId) as unknown as unknown[])).toBe(true);
    expect(isInvalidated(qc, queryKeys.trips.finite(organizationId) as unknown as unknown[])).toBe(true);
    expect(isInvalidated(qc, queryKeys.indents.all(organizationId) as unknown as unknown[])).toBe(true);
  });

  it('does not touch an unrelated organization/trip query key', () => {
    const qc = seededClient();
    const otherOrgKey = queryKeys.trips.all('org-other') as unknown as unknown[];
    qc.setQueryData(otherOrgKey, { seeded: true });
    syncOperationalFinanceProjection({ queryClient: qc, organizationId, tripId });
    flushDebounce();
    expect(isInvalidated(qc, otherOrgKey)).toBe(false);
  });
});
