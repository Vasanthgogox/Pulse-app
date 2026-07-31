import { computeTripEntryFinancialSnapshot } from '../computeTripEntryFinancials.util';
import type { LedgerRow } from '../../services/finance.service';

function tx(overrides: Partial<LedgerRow>): LedgerRow {
  return {
    id: 'tx1',
    organization_id: 'org1',
    trip_id: 'trip-1',
    trip_number: null,
    party_name: '',
    description: '',
    amount_in: 0,
    amount_out: 0,
    transaction_date: '2026-01-01',
    created_at: '2026-01-01',
    contact_id: null,
    contact_type: null,
    ...overrides,
  } as LedgerRow;
}

describe('computeTripEntryFinancialSnapshot', () => {
  it('returns null when the trip has no id', () => {
    expect(computeTripEntryFinancialSnapshot({ id: '' }, [], null, null)).toBeNull();
  });

  it('computes a market (supplier) trip: client receivable + supplier payable, no driver lines', () => {
    const trip = {
      id: 'trip-1',
      client_price: 1000,
      supplier_rate: 700,
      supplier_id: 'sup-1',
    };
    const entries: LedgerRow[] = [
      tx({ amount_in: 400, contact_type: 'client' }),
      tx({ amount_out: 200, contact_type: 'supplier' }),
    ];
    const snapshot = computeTripEntryFinancialSnapshot(trip, entries, null, null);
    expect(snapshot?.trip_type).toBe('market');
    expect(snapshot?.financials.client_receivable).toBe(600);
    expect(snapshot?.financials.supplier_payable).toBe(500);
    expect(snapshot?.financials.driver_payable).toBe(0);
    expect(snapshot?.lines.supplier_cost).toBe(700);
  });

  it('computes an asset (own fleet) trip: driver payable derived from commission, supplier lines zeroed', () => {
    const trip = {
      id: 'trip-2',
      client_price: 1000,
      driver_id: 'drv-1',
      driver_commission: 150,
      vehicle_id: 'veh-1',
    };
    const entries: LedgerRow[] = [tx({ trip_id: 'trip-2', amount_out: 50, contact_type: 'driver' })];
    const snapshot = computeTripEntryFinancialSnapshot(trip, entries, null, null);
    expect(snapshot?.trip_type).toBe('asset');
    expect(snapshot?.financials.supplier_payable).toBe(0);
    expect(snapshot?.lines.driver_to_pay).toBe(150);
    expect(snapshot?.lines.driver_paid).toBe(50);
    expect(snapshot?.financials.driver_payable).toBe(100);
  });

  it('uses supplier_rate as revenue and 0 cost for cross-org supplier trips', () => {
    const trip = { id: 'trip-3', client_price: 999, supplier_rate: 800, is_cross_org_supplier: true };
    const snapshot = computeTripEntryFinancialSnapshot(trip, [], null, null);
    expect(snapshot?.lines.client_sale).toBe(800);
  });

  it('only counts ledger entries linked to this trip_id', () => {
    const trip = { id: 'trip-4', client_price: 500 };
    const entries: LedgerRow[] = [tx({ trip_id: 'other-trip', amount_in: 500, contact_type: 'client' })];
    const snapshot = computeTripEntryFinancialSnapshot(trip, entries, null, null);
    expect(snapshot?.lines.client_received).toBe(0);
    expect(snapshot?.financials.client_receivable).toBe(500);
  });

  it('never returns a negative client_receivable when overpaid', () => {
    const trip = { id: 'trip-5', client_price: 100 };
    const entries: LedgerRow[] = [tx({ trip_id: 'trip-5', amount_in: 150, contact_type: 'client' })];
    const snapshot = computeTripEntryFinancialSnapshot(trip, entries, null, null);
    expect(snapshot?.financials.client_receivable).toBe(0);
  });
});
