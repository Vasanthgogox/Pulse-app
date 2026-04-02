import type { LedgerRow } from '../features/finance/services/finance.service';
import type { TripRow } from '../features/trips/services/trips.service';
import {
  buildTripPnLListForPeriod,
  buildVehiclePnLList,
  resolveVehicleIdForTrip,
} from '../features/vehicles/pnl';
import type { VehicleRow } from '../features/vehicles/services/vehicles.service';

function makeVehicle(overrides: Partial<VehicleRow>): VehicleRow {
  return {
    id: 'vehicle-1',
    organization_id: 'org-1',
    vehicle_number: 'MH12AB1234',
    vehicle_type: 'Truck',
    capacity: '14T',
    vehicle_brand: null,
    vehicle_model: null,
    vehicle_body_type: null,
    vehicle_size: null,
    vehicle_axle: null,
    status: 'active',
    type: 'owned',
    documents: null,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTrip(overrides: Partial<TripRow>): TripRow {
  return {
    id: 'trip-1',
    organization_id: 'org-1',
    trip_number: 'TRP001',
    sequence_number: 1,
    display_trip_id: 'TRP001',
    indent_id: null,
    source: 'manual',
    pickup_area: 'Mumbai',
    drop_location: 'Pune',
    distance: null,
    estimated_duration: null,
    client_id: null,
    client_name: 'ACME',
    supplier_id: null,
    supplier_name: null,
    driver_id: null,
    vehicle_id: null,
    driver_display_name: null,
    vehicle_display_number: null,
    client_price: 1000,
    supplier_rate: 200,
    margin: 800,
    platform_fee: 0,
    driver_commission: 0,
    is_guaranteed: false,
    payment_status: 'pending',
    amount_paid: 0,
    status: 'completed',
    pickup_date: '2026-03-10',
    started_at: null,
    completed_at: null,
    load_type: null,
    notes: null,
    created_at: '2026-03-10T00:00:00.000Z',
    updated_at: '2026-03-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('garragePnL owned-only filtering', () => {
  const vehicles: VehicleRow[] = [
    makeVehicle({ id: 'owned-1', vehicle_number: 'MH12AB1234' }),
  ];
  const transactions: LedgerRow[] = [];

  it('keeps owned trips and display-number matches, but excludes non-owned/unmatched trips', () => {
    const trips: TripRow[] = [
      makeTrip({ id: 'owned-direct', vehicle_id: 'owned-1', trip_number: 'TRP001', display_trip_id: 'TRP001' }),
      makeTrip({
        id: 'owned-display',
        trip_number: 'TRP002',
        display_trip_id: 'TRP002',
        vehicle_display_number: 'MH 12 AB 1234',
        client_price: 2000,
        supplier_rate: 500,
      }),
      makeTrip({
        id: 'unmatched-display',
        trip_number: 'TRP003',
        display_trip_id: 'TRP003',
        vehicle_display_number: 'DL01ZZ9999',
        client_price: 3000,
        supplier_rate: 700,
      }),
      makeTrip({
        id: 'foreign-vehicle-id',
        trip_number: 'TRP004',
        display_trip_id: 'TRP004',
        vehicle_id: 'adhoc-9',
        client_price: 4000,
        supplier_rate: 900,
      }),
    ];

    expect(resolveVehicleIdForTrip(trips[0], vehicles)).toBe('owned-1');
    expect(resolveVehicleIdForTrip(trips[1], vehicles)).toBe('owned-1');
    expect(resolveVehicleIdForTrip(trips[2], vehicles)).toBeNull();
    expect(resolveVehicleIdForTrip(trips[3], vehicles)).toBeNull();

    const tripRows = buildTripPnLListForPeriod(
      trips,
      vehicles,
      transactions,
      '2026-03',
      (trip) => trip.display_trip_id ?? trip.trip_number,
    );

    expect(tripRows.map((row) => row.id).sort()).toEqual([
      'owned-direct',
      'owned-display',
    ]);

    const vehicleRows = buildVehiclePnLList(
      vehicles,
      trips,
      transactions,
      '2026-03',
      (trip) => trip.display_trip_id ?? trip.trip_number,
      'org-1',
    );

    expect(vehicleRows).toHaveLength(1);
    expect(vehicleRows[0]).toMatchObject({
      id: 'owned-1',
      trips: 2,
      sales: 3000,
      expense: 700,
      pnl: 2300,
    });
  });

  it('keeps owned vehicles visible even when they have no trips in the selected period', () => {
    const vehicleRows = buildVehiclePnLList(
      vehicles,
      [],
      transactions,
      '2026-03',
      (trip) => trip.display_trip_id ?? trip.trip_number,
      'org-1',
    );

    expect(vehicleRows).toHaveLength(1);
    expect(vehicleRows[0]).toMatchObject({
      id: 'owned-1',
      trips: 0,
      sales: 0,
      expense: 0,
      pnl: 0,
      margin: 0,
    });
  });
});
