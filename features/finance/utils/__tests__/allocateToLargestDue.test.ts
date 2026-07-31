import { allocateAmountsToLargestDueTrips } from '../allocateToLargestDue';
import type { LargestDueTripAllocation } from '../allocateToLargestDue';

describe('allocateAmountsToLargestDueTrips', () => {
  it('allocates a single payment fully to the trip with the largest due', () => {
    const trips: LargestDueTripAllocation[] = [
      { tripId: 't1', sales: 1000, paid: 0 },
      { tripId: 't2', sales: 2000, paid: 0 },
    ];
    const result = allocateAmountsToLargestDueTrips(trips, [500]);
    expect(result).toEqual({ t1: 0, t2: 500 });
  });

  it('spills leftover payment onto the next-largest-due trip instead of overpaying the first', () => {
    const trips: LargestDueTripAllocation[] = [
      { tripId: 't1', sales: 1000, paid: 0 },
      { tripId: 't2', sales: 500, paid: 0 },
    ];
    // Payment of 1200 exceeds t1's due (1000): 1000 goes to t1, 200 spills to t2.
    const result = allocateAmountsToLargestDueTrips(trips, [1200]);
    expect(result).toEqual({ t1: 1000, t2: 200 });
  });

  it('re-evaluates largest due after each payment across multiple amounts', () => {
    const trips: LargestDueTripAllocation[] = [
      { tripId: 't1', sales: 300, paid: 0 },
      { tripId: 't2', sales: 300, paid: 0 },
    ];
    // First payment goes to t1 (tie broken by insertion order), second to t2.
    const result = allocateAmountsToLargestDueTrips(trips, [300, 300]);
    expect(result).toEqual({ t1: 300, t2: 300 });
  });

  it('respects existing paid amounts when computing due', () => {
    const trips: LargestDueTripAllocation[] = [
      { tripId: 't1', sales: 1000, paid: 900 },
      { tripId: 't2', sales: 1000, paid: 0 },
    ];
    // t1 due=100, t2 due=1000 -> payment of 100 should go to t2 (largest due).
    const result = allocateAmountsToLargestDueTrips(trips, [100]);
    expect(result).toEqual({ t1: 900, t2: 100 });
  });

  it('does nothing when there are no trips or no amounts', () => {
    expect(allocateAmountsToLargestDueTrips([], [100])).toEqual({});
    const trips: LargestDueTripAllocation[] = [{ tripId: 't1', sales: 500, paid: 0 }];
    expect(allocateAmountsToLargestDueTrips(trips, [])).toEqual({ t1: 0 });
  });

  it('stops allocating once all trips are fully paid, leaving remainder unapplied', () => {
    const trips: LargestDueTripAllocation[] = [{ tripId: 't1', sales: 100, paid: 0 }];
    const result = allocateAmountsToLargestDueTrips(trips, [500]);
    // Only 100 of the 500 payment can be applied; function returns paid totals only.
    expect(result).toEqual({ t1: 100 });
  });
});
