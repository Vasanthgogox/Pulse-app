import { resolveDefaultTripForClient } from '../resolveDefaultTripForClient';
import type { TripForResolver } from '../resolveDefaultTripForClient';

describe('resolveDefaultTripForClient', () => {
  it('returns null when there are no trips for the client', () => {
    expect(resolveDefaultTripForClient('client-1', '2026-01-15', [])).toBeNull();
  });

  it('prefers the most recent trip on or before the transaction date', () => {
    const trips: TripForResolver[] = [
      { id: 'trip-old', payment_due_date: '2026-01-01' },
      { id: 'trip-recent', payment_due_date: '2026-01-10' },
      { id: 'trip-future', payment_due_date: '2026-02-01' },
    ];
    expect(resolveDefaultTripForClient('client-1', '2026-01-15', trips)).toBe('trip-recent');
  });

  it('falls back to the earliest trip after the date when none are on/before it', () => {
    const trips: TripForResolver[] = [
      { id: 'trip-far-future', payment_due_date: '2026-05-01' },
      { id: 'trip-near-future', payment_due_date: '2026-02-01' },
    ];
    expect(resolveDefaultTripForClient('client-1', '2026-01-15', trips)).toBe('trip-near-future');
  });

  it('falls back through pickup_date then created_at when payment_due_date is absent', () => {
    const trips: TripForResolver[] = [
      { id: 'trip-1', pickup_date: '2026-01-05' },
      { id: 'trip-2', created_at: '2026-01-06' },
    ];
    expect(resolveDefaultTripForClient('client-1', '2026-01-10', trips)).toBe('trip-2');
  });

  it('returns the first trip when no date fields are available on any trip', () => {
    const trips: TripForResolver[] = [{ id: 'trip-only' }];
    expect(resolveDefaultTripForClient('client-1', '2026-01-10', trips)).toBe('trip-only');
  });
});
