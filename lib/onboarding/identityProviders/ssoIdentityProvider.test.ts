import { ssoIdentityProvider } from './ssoIdentityProvider';
import { externalIdentity } from '../identityTypes';

const mockGetUser = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ auth: { getUser: mockGetUser } }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ssoIdentityProvider.verify', () => {
  it('passes through an already-verified identity without a session check', async () => {
    const identity = externalIdentity('google', 'sub-1', true);
    const result = await ssoIdentityProvider.verify({ identity });
    expect(result).toEqual({ error: null, identity });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('rejects an unconfigured provider with a clear "not configured" error, never a fabricated pass', async () => {
    const result = await ssoIdentityProvider.verify({
      identity: externalIdentity('entra', 'sub-1'),
    });

    expect(result.identity).toBeNull();
    expect(result.error?.message).toMatch(/not yet configured/i);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('verifies google when the session has a matching linked identity', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          identities: [{ provider: 'google', id: 'google-sub-1' }],
        },
      },
      error: null,
    });

    const result = await ssoIdentityProvider.verify({
      identity: externalIdentity('google', 'google-sub-1'),
    });

    expect(result.error).toBeNull();
    expect(result.identity?.verified).toBe(true);
  });

  it('rejects google when no linked identity matches the claimed subject', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { identities: [{ provider: 'google', id: 'a-different-subject' }] } },
      error: null,
    });

    const result = await ssoIdentityProvider.verify({
      identity: externalIdentity('google', 'google-sub-1'),
    });

    expect(result.error).not.toBeNull();
    expect(result.identity).toBeNull();
  });
});

describe('ssoIdentityProvider.resolveInvitations', () => {
  it('returns empty — no backend capability exists yet for external-identity invitation lookup', async () => {
    const result = await ssoIdentityProvider.resolveInvitations(
      externalIdentity('google', 'sub-1', true),
    );
    expect(result).toEqual({ error: null, invitations: [], expired: [] });
  });
});
