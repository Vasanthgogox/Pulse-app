import {
  driverRowToTripRow,
  supplierRowToTripRow,
  type DriverTripRow,
  type SupplierTripRow,
} from '@/types/trip-views';

describe('trip view row types', () => {
  const supplierRow: SupplierTripRow = {
    id: 'trip-1',
    booking_ref: 'BKG-abc123',
    source_indent_code: 'IND-001',
    supplier_trip_sequence: 26,
    status: 'assigned',
    pickup_location: 'Mumbai',
    pickup_address: 'Mumbai',
    pickup_scheduled_at: '2026-06-01T10:00:00Z',
    dropoff_location: 'Pune',
    dropoff_address: 'Pune',
    dropoff_scheduled_at: null,
    assigned_driver_id: 'driver-1',
    driver_display_trip_id: 'TRP001',
    vehicle_id: 'vehicle-1',
    instructions: 'Handle with care',
    created_at: '2026-06-01T09:00:00Z',
    updated_at: '2026-06-01T09:00:00Z',
  };

  const driverRow: DriverTripRow = {
    id: 'trip-1',
    driver_id: 'driver-1',
    driver_display_trip_id: 'TRP001',
    status: 'assigned',
    pickup_location: 'Mumbai',
    pickup_address: 'Mumbai',
    pickup_scheduled_at: '2026-06-01T10:00:00Z',
    dropoff_location: 'Pune',
    dropoff_address: 'Pune',
    dropoff_scheduled_at: null,
    instructions: 'Handle with care',
    vehicle_id: 'vehicle-1',
    created_at: '2026-06-01T09:00:00Z',
    updated_at: '2026-06-01T09:00:00Z',
  };

  it('SupplierTripRow omits shipper operational fields at type level', () => {
    // @ts-expect-error trip_number must not exist on supplier projection
    const _bad: string | undefined = supplierRow.trip_number;
    expect(_bad).toBeUndefined();
    const mapped = supplierRowToTripRow(supplierRow);
    expect(mapped.booking_ref).toBe('BKG-abc123');
    expect(mapped.organization_id).toBe('');
  });

  it('DriverTripRow omits booking_ref and trip_number at type level', () => {
    // @ts-expect-error booking_ref must not exist on driver projection
    const _bad: string | undefined = driverRow.booking_ref;
    expect(_bad).toBeUndefined();
    const mapped = driverRowToTripRow(driverRow);
    expect(mapped.driver_display_trip_id).toBe('TRP001');
    expect(mapped.trip_number).toBe('TRP001');
  });
});
