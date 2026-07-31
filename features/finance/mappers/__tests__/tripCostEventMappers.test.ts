import {
  mapFuelEntryToTripCostEvent,
  mapTollEntryToTripCostEvent,
  mapOtherEntryToTripCostEvent,
  mapTripOperationalRowsToCostEvents,
  deriveTripCostFinancialSnapshot,
} from '../tripCostEventMappers';
import type { TripFuelEntry, TripTollEntry, TripOtherExpenseEntry } from '@/features/trips/operations/types';

function fuelRow(overrides: Partial<TripFuelEntry>): TripFuelEntry {
  return {
    id: 'fuel-1',
    trip_id: 'trip-1',
    amount_inr: 500,
    entered_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as TripFuelEntry;
}

describe('mapFuelEntryToTripCostEvent', () => {
  it('marks the event reimbursable and driver-paid when the driver reported and paid it', () => {
    const event = mapFuelEntryToTripCostEvent({
      row: fuelRow({ payment_owner: 'driver', approval_state: 'reported' } as any),
      tripOperationalCode: 'TRP001',
    });
    expect(event.payer).toBe('driver');
    expect(event.reimbursable).toBe(true);
    expect(event.approvalState).toBe('pending');
    expect(event.category).toBe('fuel');
  });

  it('treats a driver-reported + driver-reimbursement-state entry as driver-paid even if payment_owner differs', () => {
    const event = mapFuelEntryToTripCostEvent({
      row: fuelRow({
        payment_owner: 'organization',
        approval_state: 'reported',
        reimbursement_state: 'reported',
      } as any),
      tripOperationalCode: 'TRP001',
    });
    expect(event.payer).toBe('driver');
  });

  it('marks posting state "reversed" when the linked ledger row is voided, regardless of approval', () => {
    const event = mapFuelEntryToTripCostEvent({
      row: fuelRow({ ledger_state: 'void', approval_state: 'approved' } as any),
      tripOperationalCode: 'TRP001',
    });
    expect(event.postingState).toBe('reversed');
  });

  it('marks posting state "posted" once a ledgerTransactionId is attached', () => {
    const event = mapFuelEntryToTripCostEvent({
      row: fuelRow({ approval_state: 'approved' } as any),
      tripOperationalCode: 'TRP001',
      ledgerTransactionId: 'ledger-1',
    });
    expect(event.postingState).toBe('posted');
    expect(event.ledgerTransactionId).toBe('ledger-1');
  });

  it('normalizes negative or missing amounts to a rounded non-negative value', () => {
    const event = mapFuelEntryToTripCostEvent({
      row: fuelRow({ amount_inr: -50 } as any),
      tripOperationalCode: 'TRP001',
    });
    expect(event.amount).toBe(0);
  });

  it('marks settlementState settled once reimbursement_state is reimbursed', () => {
    const event = mapFuelEntryToTripCostEvent({
      row: fuelRow({ reimbursement_state: 'reimbursed' } as any),
      tripOperationalCode: 'TRP001',
    });
    expect(event.settlementState).toBe('settled');
  });
});

describe('mapTollEntryToTripCostEvent / mapOtherEntryToTripCostEvent', () => {
  it('maps a toll row to category "toll"', () => {
    const event = mapTollEntryToTripCostEvent({
      row: fuelRow({}) as unknown as TripTollEntry,
      tripOperationalCode: 'TRP001',
    });
    expect(event.category).toBe('toll');
    expect(event.id).toBe('toll:fuel-1');
  });

  it('maps an "other" row category via otherExpenseCategoryToCostCategory', () => {
    const event = mapOtherEntryToTripCostEvent({
      row: { ...fuelRow({}), expense_category: 'weighbridge' } as unknown as TripOtherExpenseEntry,
      tripOperationalCode: 'TRP001',
    });
    expect(event.category).toBe('misc');
  });
});

describe('mapTripOperationalRowsToCostEvents', () => {
  it('combines fuel/toll/other rows and sorts newest first by createdAt', () => {
    const events = mapTripOperationalRowsToCostEvents({
      fuelEntries: [fuelRow({ entered_at: '2026-01-01T00:00:00.000Z' })],
      tollEntries: [fuelRow({ id: 'toll-1', entered_at: '2026-02-01T00:00:00.000Z' }) as unknown as TripTollEntry],
      tripDisplay: { trip_operational_code: 'TRP001' },
    });
    expect(events).toHaveLength(2);
    expect(events[0].createdAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('attaches ledgerTransactionId per row from the ledgerBySource lookup', () => {
    const events = mapTripOperationalRowsToCostEvents({
      fuelEntries: [fuelRow({ id: 'fuel-1' })],
      tollEntries: [],
      tripDisplay: {},
      ledgerBySource: { fuel: { 'fuel-1': 'ledger-abc' } },
    });
    expect(events[0].ledgerTransactionId).toBe('ledger-abc');
  });
});

describe('deriveTripCostFinancialSnapshot', () => {
  const baseEvent = mapFuelEntryToTripCostEvent({
    row: fuelRow({ approval_state: 'approved' } as any),
    tripOperationalCode: 'TRP001',
    ledgerTransactionId: 'ledger-1',
  });

  it('tallies counts and cost totals across events', () => {
    const pendingEvent = mapFuelEntryToTripCostEvent({
      row: fuelRow({ id: 'fuel-2', approval_state: 'pending' } as any),
      tripOperationalCode: 'TRP001',
    });
    const snapshot = deriveTripCostFinancialSnapshot({ events: [baseEvent, pendingEvent] });
    expect(snapshot.totalEvents).toBe(2);
    expect(snapshot.postedCount).toBe(1);
    expect(snapshot.approvalPendingCount).toBe(1);
    expect(snapshot.postedOperationalCostInr).toBe(500);
  });

  it('computes costPerKm only when distanceKm is positive, else null', () => {
    expect(deriveTripCostFinancialSnapshot({ events: [baseEvent] }).costPerKm).toBeNull();
    const withDistance = deriveTripCostFinancialSnapshot({ events: [baseEvent], distanceKm: 100 });
    expect(withDistance.costPerKm).toBe(5);
  });
});
