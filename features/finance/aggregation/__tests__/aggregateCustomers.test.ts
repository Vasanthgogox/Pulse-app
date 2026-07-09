import { aggregateCustomers } from '../aggregateCustomers';
import type { ClientLike, LedgerTx, TripForCustomer } from '../types';

describe('aggregateCustomers — client paid-amount double-count regression', () => {
  const client: ClientLike = { id: 'client-1', name: 'Acme Shipping' };

  it('does not double-count a linked client transaction on top of an already ledger-synced amount_paid', () => {
    // Trip billed 1000, half paid (amount_paid is ledger-synced and already reflects the
    // linked transaction below). Before the fix, seeding paidByTripId from amount_paid AND
    // adding the linked transaction's amount_in on top made this trip look fully paid.
    const trip: TripForCustomer = {
      id: 'trip-1',
      client_id: client.id,
      client_name: client.name ?? null,
      client_price: 1000,
      amount_paid: 500,
    };
    const transactions: LedgerTx[] = [
      { contact_id: client.id, contact_type: 'client', trip_id: 'trip-1', amount_in: 500 },
    ];

    const { rows } = aggregateCustomers([client], [trip], transactions);

    expect(rows).toHaveLength(1);
    expect(rows[0].billed).toBe(1000);
    // The real outstanding balance is 500 — a partially-paid trip must not appear fully paid.
    expect(rows[0].pending).toBe(500);
    expect(rows[0].received).toBe(500);
  });

  it('still counts the full amount_paid when there is no linked client transaction', () => {
    const trip: TripForCustomer = {
      id: 'trip-2',
      client_id: client.id,
      client_name: client.name ?? null,
      client_price: 1000,
      amount_paid: 1000,
    };

    const { rows } = aggregateCustomers([client], [trip], []);

    expect(rows[0].pending).toBe(0);
    expect(rows[0].received).toBe(1000);
  });
});
