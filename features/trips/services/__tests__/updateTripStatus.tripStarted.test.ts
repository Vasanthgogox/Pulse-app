import { updateTripStatus } from '../trips.service';

const mockFrom = jest.fn();
const mockPublish = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ from: mockFrom }),
}));

jest.mock('@/lib/platform/events/InProcessEventBus', () => ({
  getPlatformEventBus: () => ({ publish: mockPublish }),
}));

const trip = {
  id: 'trip-1',
  organization_id: 'org-1',
  indent_id: 'indent-1',
  driver_id: 'driver-1',
  vehicle_id: 'veh-1',
  status: 'in_transit',
  started_at: '2026-07-10T10:00:00.000Z',
  completed_at: null,
};

/**
 * Thenable query builder — every chain method returns the same builder, and the
 * builder itself resolves like a promise (matches trips.service.ts's real chains,
 * some of which call further methods after `.select()`/`.eq()` before awaiting).
 */
function awaitable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function updateBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    select: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateTripStatus — TripStarted event', () => {
  it('publishes exactly one TripStarted event when started_at is set for the first time', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: { started_at: null }, error: null })) // before-fetch: not started yet
      .mockReturnValueOnce(updateBuilder({ data: trip, error: null })); // the commit

    const { error, trip: result } = await updateTripStatus('trip-1', {
      status: 'in_transit',
      started_at: '2026-07-10T10:00:00.000Z',
    });

    expect(error).toBeNull();
    expect(result).not.toBeNull();
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const published = mockPublish.mock.calls[0][0];
    expect(published.name).toBe('TripStarted');
    expect(published.workspaceId).toBe('org-1');
    expect(published.payload).toEqual({
      tripId: 'trip-1',
      indentId: 'indent-1',
      driverId: 'driver-1',
      vehicleId: 'veh-1',
      startedAt: '2026-07-10T10:00:00.000Z',
    });
    expect(typeof published.correlationId).toBe('string');
    expect(published.correlationId.length).toBeGreaterThan(0);
  });

  it('does not publish when the status update does not set started_at', async () => {
    mockFrom.mockReturnValueOnce(
      updateBuilder({ data: { ...trip, started_at: null }, error: null }),
    ); // the commit — no before-fetch since started_at isn't provided

    await updateTripStatus('trip-1', { status: 'assigned' });

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish on a retry where started_at was already set (idempotent retry)', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: { started_at: trip.started_at }, error: null })) // before-fetch: already started
      .mockReturnValueOnce(updateBuilder({ data: trip, error: null })); // the commit

    const { error, trip: result } = await updateTripStatus('trip-1', {
      status: 'in_transit',
      started_at: trip.started_at,
    });

    expect(error).toBeNull();
    expect(result).not.toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish when the commit fails', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: { started_at: null }, error: null })) // before-fetch
      .mockReturnValueOnce(updateBuilder({ data: null, error: { message: 'db error' } })); // commit fails

    const { error, trip: result } = await updateTripStatus('trip-1', {
      status: 'in_transit',
      started_at: '2026-07-10T10:00:00.000Z',
    });

    expect(error).not.toBeNull();
    expect(result).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish for an invalid status', async () => {
    const { error, trip: result } = await updateTripStatus('trip-1', {
      status: 'not_a_real_status',
      started_at: '2026-07-10T10:00:00.000Z',
    });

    expect(error).not.toBeNull();
    expect(result).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
