import {
  selectTripPostingIntegrity,
  selectTripAccountingIntegrity,
  selectVehicleAllocationExposure,
  selectVehicleSettlementExposure,
  selectVehicleAccountingIntegrity,
  selectFleetProfitabilityHealth,
} from '../integritySelectors';
import type { TripCostEvent } from '../../domain/tripCostEvent';
import type { VehicleExpenseEvent } from '@/features/fleet/domain/VehicleExpenseEvent';
import type { TripRow } from '@/features/trips/services/trips.service';

function event(overrides: Partial<TripCostEvent>): TripCostEvent {
  return {
    id: 'e1',
    tripId: 'trip-1',
    operationalCode: 'TRP001',
    category: 'fuel',
    amount: 100,
    currency: 'INR',
    incurredBy: 'driver',
    payer: 'driver',
    reimbursable: true,
    approvalState: 'approved',
    postingState: 'posted',
    settlementState: 'unpaid',
    pnlImpact: true,
    source: 'driver_upload',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

function vehicleEvent(overrides: Partial<VehicleExpenseEvent>): VehicleExpenseEvent {
  return {
    id: 've1',
    vehicleId: 'veh-1',
    category: 'fuel',
    amount: 100,
    expenseScope: 'common',
    allocationStatus: 'unallocated',
    approvalState: 'approved',
    settlementState: 'unpaid',
    createdAt: '2026-01-01',
    ...overrides,
  } as VehicleExpenseEvent;
}

describe('selectTripPostingIntegrity', () => {
  it('reports posting coverage as posted / approved', () => {
    const events = [
      event({ approvalState: 'approved', postingState: 'posted' }),
      event({ approvalState: 'approved', postingState: 'unposted' }),
      event({ approvalState: 'pending', postingState: 'unposted' }),
    ];
    const result = selectTripPostingIntegrity(events);
    expect(result.approvedCount).toBe(2);
    expect(result.postedCount).toBe(1);
    expect(result.unpostedApprovedCount).toBe(1);
    expect(result.postingCoveragePct).toBe(50);
  });
});

describe('selectTripAccountingIntegrity', () => {
  it('flags posting_drift when there are unposted approved events', () => {
    const trip = { client_price: 1000 } as TripRow;
    const events = [event({ approvalState: 'approved', postingState: 'unposted' })];
    expect(selectTripAccountingIntegrity({ trip, events }).health).toBe('posting_drift');
  });

  it('flags payable_exposure when fully posted but reimbursable payables remain outstanding', () => {
    const trip = { client_price: 1000 } as TripRow;
    const events = [
      event({
        approvalState: 'approved',
        postingState: 'posted',
        reimbursable: true,
        settlementState: 'unpaid',
      }),
    ];
    expect(selectTripAccountingIntegrity({ trip, events }).health).toBe('payable_exposure');
  });

  it('is healthy when fully posted, no drift, and no outstanding payables', () => {
    const trip = { client_price: 1000 } as TripRow;
    const events = [
      event({
        approvalState: 'approved',
        postingState: 'posted',
        reimbursable: false,
        settlementState: 'settled',
      }),
    ];
    expect(selectTripAccountingIntegrity({ trip, events }).health).toBe('healthy');
  });
});

describe('selectVehicleAllocationExposure', () => {
  it('only considers "common" scope events for ownership cost', () => {
    const events = [
      vehicleEvent({ expenseScope: 'common', amount: 100 }),
      vehicleEvent({ expenseScope: 'trip', amount: 999 } as Partial<VehicleExpenseEvent>),
    ];
    expect(selectVehicleAllocationExposure(events).ownershipCostInr).toBe(100);
  });

  it('flags over-allocated and negative-balance events', () => {
    const events = [
      vehicleEvent({ amount: 100, allocatedAmount: 150 } as Partial<VehicleExpenseEvent>),
      vehicleEvent({ amount: -10 } as Partial<VehicleExpenseEvent>),
    ];
    const result = selectVehicleAllocationExposure(events);
    expect(result.overAllocatedCount).toBe(1);
    expect(result.negativeBalanceCount).toBe(1);
  });
});

describe('selectVehicleSettlementExposure', () => {
  it('counts only approved + not-settled events as open payables', () => {
    const events = [
      vehicleEvent({ approvalState: 'approved', settlementState: 'unpaid', amount: 100 }),
      vehicleEvent({ approvalState: 'approved', settlementState: 'settled', amount: 999 }),
    ];
    const result = selectVehicleSettlementExposure(events);
    expect(result.payableOpenCount).toBe(1);
    expect(result.payableOutstandingInr).toBe(100);
  });
});

describe('selectVehicleAccountingIntegrity', () => {
  it('flags settlement_exposure first when payables are outstanding', () => {
    const events = [vehicleEvent({ approvalState: 'approved', settlementState: 'unpaid', amount: 50 })];
    const result = selectVehicleAccountingIntegrity({
      monthlyRevenueInr: 1000,
      operationalCostInr: 200,
      events,
    });
    expect(result.health).toBe('settlement_exposure');
  });

  it('flags negative_margin when profitability is below 0 and no exposure/drift', () => {
    const events: VehicleExpenseEvent[] = [];
    const result = selectVehicleAccountingIntegrity({
      monthlyRevenueInr: 100,
      operationalCostInr: 500,
      events,
    });
    expect(result.health).toBe('negative_margin');
  });

  it('is healthy when there is no outstanding exposure, positive profitability, and full allocation coverage', () => {
    // Note: with events: [] the allocation-efficiency ratio is trivially 0/0 -> 0%, which
    // (since monthlyRevenueInr > 0) trips "low_utilization". A fully-allocated ownership
    // event is needed to get a genuinely "healthy" read.
    const events: VehicleExpenseEvent[] = [
      vehicleEvent({
        expenseScope: 'common',
        amount: 100,
        allocatedAmount: 100,
        allocationStatus: 'allocated',
        settlementState: 'settled',
      } as Partial<VehicleExpenseEvent>),
    ];
    const result = selectVehicleAccountingIntegrity({
      monthlyRevenueInr: 1000,
      operationalCostInr: 100,
      events,
    });
    expect(result.health).toBe('healthy');
  });
});

describe('selectFleetProfitabilityHealth', () => {
  it('tallies vehicle health categories across the fleet', () => {
    const healthyVehicleEvents: VehicleExpenseEvent[] = [
      vehicleEvent({
        expenseScope: 'common',
        amount: 100,
        allocatedAmount: 100,
        allocationStatus: 'allocated',
        settlementState: 'settled',
      } as Partial<VehicleExpenseEvent>),
    ];
    const result = selectFleetProfitabilityHealth({
      vehicles: [
        { monthlyRevenueInr: 1000, operationalCostInr: 100, events: healthyVehicleEvents },
        { monthlyRevenueInr: 100, operationalCostInr: 500, events: [] },
      ],
    });
    expect(result.healthyVehicles).toBe(1);
    expect(result.negativeMarginVehicles).toBe(1);
  });
});
