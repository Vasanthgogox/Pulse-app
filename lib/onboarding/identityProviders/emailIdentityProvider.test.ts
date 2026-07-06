import { emailIdentityProvider } from './emailIdentityProvider';
import { emailIdentity } from '../identityTypes';

const mockGetUser = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockResolveTeamInvitationsByEmail = jest.fn();
jest.mock('@/features/organization/services/teamInvitationResolver.service', () => ({
  resolveTeamInvitationsByEmail: (...args: unknown[]) =>
    mockResolveTeamInvitationsByEmail(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('emailIdentityProvider.verify', () => {
  it('passes through an already-verified identity without a session check', async () => {
    const identity = emailIdentity('a@b.com', true);
    const result = await emailIdentityProvider.verify({ identity });
    expect(result).toEqual({ error: null, identity });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('verifies when the session email matches and is confirmed', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'A@B.com', email_confirmed_at: '2026-01-01T00:00:00Z' } },
      error: null,
    });

    const result = await emailIdentityProvider.verify({ identity: emailIdentity('a@b.com') });

    expect(result.error).toBeNull();
    expect(result.identity?.verified).toBe(true);
  });

  it('rejects when the session email is confirmed but does not match', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'someone-else@b.com', email_confirmed_at: '2026-01-01T00:00:00Z' } },
      error: null,
    });

    const result = await emailIdentityProvider.verify({ identity: emailIdentity('a@b.com') });

    expect(result.error).not.toBeNull();
    expect(result.identity).toBeNull();
  });

  it('rejects when the session email matches but is not confirmed', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'a@b.com', email_confirmed_at: null } },
      error: null,
    });

    const result = await emailIdentityProvider.verify({ identity: emailIdentity('a@b.com') });

    expect(result.error).not.toBeNull();
    expect(result.identity).toBeNull();
  });
});

describe('emailIdentityProvider.resolveInvitations', () => {
  it('returns active and expired invitations mapped from the email resolver', async () => {
    mockResolveTeamInvitationsByEmail.mockResolvedValue({
      error: null,
      result: {
        active: [
          {
            inviteId: 'inv-1',
            inviteeName: 'Jane',
            inviteeEmail: 'a@b.com',
            organizationId: 'org-1',
            organizationName: 'Acme',
            invitedByName: 'Admin',
            role: 'member',
            platformRole: 'operator',
            platformRoleLabel: 'Operator',
            businessUnitName: null,
            departmentName: null,
            createdAt: '2026-01-01T00:00:00Z',
            expiresAt: '2026-02-01T00:00:00Z',
            isExpired: false,
            status: 'pending',
          },
        ],
        expired: [],
      },
    });

    const result = await emailIdentityProvider.resolveInvitations(emailIdentity('a@b.com', true));

    expect(result.error).toBeNull();
    expect(result.invitations).toHaveLength(1);
    expect(result.invitations[0]?.organizationId).toBe('org-1');
    expect(mockResolveTeamInvitationsByEmail).toHaveBeenCalledWith('a@b.com');
  });

  it('returns empty without calling the resolver when the email is blank', async () => {
    const result = await emailIdentityProvider.resolveInvitations(emailIdentity(''));
    expect(result).toEqual({ error: null, invitations: [], expired: [] });
    expect(mockResolveTeamInvitationsByEmail).not.toHaveBeenCalled();
  });
});
