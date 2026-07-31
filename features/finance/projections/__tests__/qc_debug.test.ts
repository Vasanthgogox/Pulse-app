/**
 * Regression: syncOperationalFinanceProjection funnels through debounced,
 * per-scope batching (lib/queries/operationalInvalidation). Multiple rapid
 * syncs for the *same* trip/org within the debounce window must still result
 * in every query family ending up invalidated exactly once settled — not
 * silently dropped, and not thrown away because a timer was already pending.
 */
import { QueryClient } from '@tanstack/react-query';
import { syncOperationalFinanceProjection } from '../syncOperationalFinanceProjection';
import { queryKeys } from '@/lib/queryKeys';

describe('syncOperationalFinanceProjection — rapid repeated calls (debounce regression)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('still invalidates the trip detail query after several back-to-back syncs within the debounce window', () => {
    const organizationId = 'org-debounce';
    const tripId = 'trip-debounce';
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.trips.detail(tripId), { seeded: true });

    // Simulate three rapid saves (e.g. a user editing a ledger entry quickly) firing
    // the same sync in quick succession, well inside the 80ms debounce window.
    syncOperationalFinanceProjection({ queryClient: qc, organizationId, tripId });
    jest.advanceTimersByTime(20);
    syncOperationalFinanceProjection({ queryClient: qc, organizationId, tripId });
    jest.advanceTimersByTime(20);
    syncOperationalFinanceProjection({ queryClient: qc, organizationId, tripId });

    // Not yet settled — the debounce window hasn't elapsed since the last call.
    expect(qc.getQueryState(queryKeys.trips.detail(tripId))?.isInvalidated).toBeFalsy();

    jest.advanceTimersByTime(100);

    expect(qc.getQueryState(queryKeys.trips.detail(tripId))?.isInvalidated).toBe(true);
  });
});
