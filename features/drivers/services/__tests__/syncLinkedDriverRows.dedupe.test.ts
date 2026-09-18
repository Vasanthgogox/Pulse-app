const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    rpc: (...a: unknown[]) => mockRpc(...a),
  }),
}));

import {
  __resetSyncLinkedDriversDedupeForTests,
  syncLinkedDriverRowsForCurrentUser,
} from '../drivers.service';

describe('syncLinkedDriverRowsForCurrentUser dedupe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetSyncLinkedDriversDedupeForTests();
    mockRpc.mockResolvedValue({ data: 2, error: null });
  });

  it('coalesces concurrent callers into one RPC', async () => {
    const [a, b] = await Promise.all([
      syncLinkedDriverRowsForCurrentUser(),
      syncLinkedDriverRowsForCurrentUser(),
    ]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('sync_my_driver_rows_user_id');
    expect(a.linkedCount).toBe(2);
    expect(b.linkedCount).toBe(2);
  });

  it('returns cached result within cooldown so password sign-in + driver-home do not double RPC', async () => {
    await syncLinkedDriverRowsForCurrentUser();
    await syncLinkedDriverRowsForCurrentUser();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
