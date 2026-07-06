import { platformIdentityService } from './platformIdentity.service';

const mockAcceptPendingTeamInvitation = jest.fn();

jest.mock('@/features/organization/services/teamInvitationResolver.service', () => ({
  acceptPendingTeamInvitation: (...args: unknown[]) => mockAcceptPendingTeamInvitation(...args),
}));

jest.mock('@/features/organization/services/members.service', () => ({
  acceptTeamInvite: jest.fn(),
  getMyTeamInvites: jest.fn(),
}));

jest.mock('@/features/organization/utils/platformIdentityShadowCheck.util', () => ({
  shadowCheckPlatformIdentity: jest.fn(),
}));

const noopDeps = {
  refreshSession: jest.fn(),
  refreshOrganization: jest.fn(),
  refreshWorkspaces: jest.fn(),
  switchWorkspace: jest.fn(),
  queryClient: {} as never,
  loadExistingMemberships: async () => [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('platformIdentityService.acceptInvitation — invitationStatus wiring (PR-005)', () => {
  it('blocks with INVITATION_EXPIRED before attempting to accept', async () => {
    const result = await platformIdentityService.acceptInvitation(
      {
        inviteId: 'inv-1',
        proposedRelationshipType: 'EMPLOYEE',
        proposedOrganizationId: 'org-1',
        invitationStatus: 'expired',
      },
      noopDeps,
    );

    expect(result.error).not.toBeNull();
    expect(result.policy?.primaryBlock?.reason).toBe('INVITATION_EXPIRED');
    expect(mockAcceptPendingTeamInvitation).not.toHaveBeenCalled();
  });

  it('blocks with INVITATION_ALREADY_ACCEPTED before attempting to accept', async () => {
    const result = await platformIdentityService.acceptInvitation(
      {
        inviteId: 'inv-1',
        proposedRelationshipType: 'EMPLOYEE',
        proposedOrganizationId: 'org-1',
        invitationStatus: 'accepted',
      },
      noopDeps,
    );

    expect(result.error).not.toBeNull();
    expect(result.policy?.primaryBlock?.reason).toBe('INVITATION_ALREADY_ACCEPTED');
    expect(mockAcceptPendingTeamInvitation).not.toHaveBeenCalled();
  });

  it('does not block on the invitation evaluator when invitationStatus is pending', async () => {
    mockAcceptPendingTeamInvitation.mockResolvedValue({
      error: new Error('stop here — downstream workspace wiring is out of scope for this test'),
      organizationId: null,
    });

    const result = await platformIdentityService.acceptInvitation(
      {
        inviteId: 'inv-1',
        proposedRelationshipType: 'EMPLOYEE',
        proposedOrganizationId: 'org-1',
        invitationStatus: 'pending',
      },
      noopDeps,
    );

    const invitationDecision = result.policy?.decisions.find(
      (d) => d.evaluatorId === 'invitation_v1',
    );
    expect(invitationDecision?.allowed).toBe(true);
    expect(mockAcceptPendingTeamInvitation).toHaveBeenCalledWith('inv-1');
  });
});
