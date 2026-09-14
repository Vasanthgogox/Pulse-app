import {
  reportDriverLocation,
  shouldPersistDriverLocation,
} from '@/features/driver/services/driverLocation.service';

const mockGetSession = jest.fn();
const mockInsert = jest.fn();
const mockFrom = jest.fn(() => ({ insert: mockInsert }));

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

function baseParams(ownerUserId: string | null) {
  return {
    driverId: 'drv-1',
    organizationId: 'org-1',
    tripId: 'trip-1',
    latitude: 13.08,
    longitude: 80.27,
    source: 'live' as const,
    ownerUserId,
  };
}

describe('shouldPersistDriverLocation', () => {
  it('allows a matching auth uid', () => {
    expect(shouldPersistDriverLocation({ sessionUserId: 'user-a', ownerUserId: 'user-a' })).toBe(true);
  });

  it('skips a mismatched auth uid', () => {
    expect(shouldPersistDriverLocation({ sessionUserId: 'user-b', ownerUserId: 'user-a' })).toBe(false);
  });

  it('stops writes after logout', () => {
    expect(shouldPersistDriverLocation({ sessionUserId: null, ownerUserId: 'user-a' })).toBe(false);
  });
});

describe('reportDriverLocation ownership guard', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockInsert.mockReset();
    mockFrom.mockClear();
    mockInsert.mockResolvedValue({ error: null });
  });

  it('inserts when the live session owns the driver', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-a' } } },
    });
    const result = await reportDriverLocation(baseParams('user-a'));
    expect(result).toEqual({ error: null });
    expect(mockFrom).toHaveBeenCalledWith('driver_locations');
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('skips a stale scheduled ping after the session switches user', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'user-b' } } },
    });
    const result = await reportDriverLocation(baseParams('user-a'));
    expect(result).toEqual({ error: null, skipped: true });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('skips when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await reportDriverLocation(baseParams('user-a'));
    expect(result.skipped).toBe(true);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
