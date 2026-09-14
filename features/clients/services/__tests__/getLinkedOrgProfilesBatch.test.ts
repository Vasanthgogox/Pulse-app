import { getLinkedOrgProfilesBatch } from '@/features/clients/services/clients.service';

const mockGetSession = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@/lib/platform', () => ({
  CustomerService: {},
}));

jest.mock('@/lib/enrichConnectionPartnerAvatars', () => ({
  enrichConnectionPartnerAvatars: async (rows: unknown) => rows,
}));

describe('getLinkedOrgProfilesBatch session guard', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRpc.mockReset();
  });

  it('does not call the RPC when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await getLinkedOrgProfilesBatch(['org-1']);
    expect(result).toEqual({});
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls the RPC for an authenticated session', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt', user: { id: 'user-1' } } },
    });
    mockRpc.mockResolvedValue({
      data: {
        'org-1': { organizationName: 'Acme', contactPerson: 'Ada', phone: '1' },
      },
      error: null,
    });
    const result = await getLinkedOrgProfilesBatch(['org-1']);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_connection_partner_display_batch', {
      p_linked_organization_ids: ['org-1'],
    });
    expect(result['org-1']?.organizationName).toBe('Acme');
  });

  it('returns {} on 401 and does not throw or retry', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'stale', user: { id: 'user-1' } } },
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function get_connection_partner_display_batch', code: '42501', status: 401 },
    });
    const result = await getLinkedOrgProfilesBatch(['org-1', 'org-2']);
    expect(result).toEqual({});
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
