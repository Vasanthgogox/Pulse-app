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

  it('DriverTripRow omits booking_ref at type level', () => {
    // @ts-expect-error booking_ref must not exist on driver projection
    const _bad: string | undefined = driverRow.booking_ref;
    expect(_bad).toBeUndefined();
    const mapped = driverRowToTripRow(driverRow);
    expect(mapped.driver_display_trip_id).toBe('TRP001');
    expect(mapped.trip_number).toBe('TRP001');
  });

  // ── Regression: driver fleet-vs-open classification ────────────────────────
  // driverRowToTripRow used to hardcode organization_id:'' and source:'assigned'.
  // DriverWalletScreen's isEmployerOrgAtDate starts with `if (!orgId) return false`,
  // so a blank org made EVERY driver trip classify as a non-employer "Direct trip"
  // and the Fleet Trips tab was structurally always empty. Drivers then filed
  // attribution requests for work the app had already recorded.
  describe('driver fleet classification fields', () => {
    it('passes organization_id through instead of blanking it', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        organization_id: 'org-paperkraft',
      });
      expect(mapped.organization_id).toBe('org-paperkraft');
    });

    it('preserves the real source so mover_asset stays identifiable', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        source: 'mover_asset',
      });
      expect(mapped.source).toBe('mover_asset');
    });

    it('carries completed_at through for settlement ordering', () => {
      const mapped = driverRowToTripRow({
        ...driverRow,
        completed_at: '2026-07-28T12:49:50Z',
      });
      expect(mapped.completed_at).toBe('2026-07-28T12:49:50Z');
    });

    it('falls back safely when the view omits the fields', () => {
      const mapped = driverRowToTripRow(driverRow);
      expect(mapped.organization_id).toBe('');
      expect(mapped.source).toBe('assigned');
      expect(mapped.completed_at).toBeNull();
    });
  });
});
