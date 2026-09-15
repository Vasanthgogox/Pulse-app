import {
  allocateCommerceIndentToTrip,
  commerceShareForBiddingPatch,
} from '../services/commerce-ops-detail.service';

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getIdentityDb: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

describe('commerceShareForBiddingPatch', () => {
  it('transitions draft → broadcast using Give Load share fields', () => {
    const patch = commerceShareForBiddingPatch({
      circulationTarget: 'both',
      supplierTarget: 15000,
      sharedAtIso: '2026-09-15T10:00:00.000Z',
    });
    expect(patch).toEqual({
      circulation_target: 'both',
      supplier_target: 15000,
      status: 'broadcast',
      shared_at: '2026-09-15T10:00:00.000Z',
    });
  });
});

describe('allocateCommerceIndentToTrip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: { id: 'trip-1' }, error: null });
  });

  it('uses award_indent_to_trip (owner-side manual award), not create_trip_from_assigned_indent', async () => {
    const result = await allocateCommerceIndentToTrip({
      indentId: 'ind-1',
      driverId: 'drv-1',
      vehicleId: 'veh-1',
    });
    expect(result.error).toBeNull();
    expect(result.tripId).toBe('trip-1');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('award_indent_to_trip', expect.objectContaining({
      p_indent_id: 'ind-1',
      p_supplier_id: null,
      p_supplier_rate: null,
      p_driver_id: 'drv-1',
      p_vehicle_id: 'veh-1',
    }));
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain('create_trip_from_assigned_indent');
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain('get_driver_trip_stop_orders');
  });

  it('passes supplierId as a suppliers.id row directly (no assigned_supplier_id pre-patch)', async () => {
    const result = await allocateCommerceIndentToTrip({
      indentId: 'ind-1',
      supplierId: 'sup-1',
      supplierRate: 20000,
      driverId: 'drv-1',
      vehicleId: 'veh-1',
    });
    expect(result.error).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('award_indent_to_trip', expect.objectContaining({
      p_indent_id: 'ind-1',
      p_supplier_id: 'sup-1',
      p_supplier_rate: 20000,
      p_driver_id: 'drv-1',
      p_vehicle_id: 'veh-1',
    }));
  });
});
