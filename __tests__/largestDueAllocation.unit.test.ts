import { allocateAmountsToLargestDueTrips } from '../features/finance/utils/allocateToLargestDue';

describe('allocateAmountsToLargestDueTrips', () => {
  it('assigns each unlinked amount to the current largest due trip', () => {
    const result = allocateAmountsToLargestDueTrips(
      [
        { tripId: 'trip-1', sales: 1000, paid: 200 },
        { tripId: 'trip-2', sales: 900, paid: 100 },
      ],
      [300, 250],
    );

    expect(result).toEqual({
      'trip-1': 500,
      'trip-2': 350,
    });
  });

  it('keeps choosing the first trip when all dues are already zero', () => {
    const result = allocateAmountsToLargestDueTrips(
      [
        { tripId: 'trip-1', sales: 1000, paid: 1000 },
        { tripId: 'trip-2', sales: 900, paid: 900 },
      ],
      [100, 50],
    );

    expect(result).toEqual({
      'trip-1': 1150,
      'trip-2': 900,
    });
  });
});
