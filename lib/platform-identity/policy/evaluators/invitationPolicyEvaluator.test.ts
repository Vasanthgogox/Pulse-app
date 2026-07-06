import { evaluateInvitationPolicyV1 } from './invitationPolicyEvaluator';

describe('evaluateInvitationPolicyV1', () => {
  it('allows when no invitation status is present (e.g. owner signup, no invitation)', () => {
    expect(evaluateInvitationPolicyV1({})).toEqual({
      evaluatorId: 'invitation_v1',
      allowed: true,
    });
  });

  it('allows a pending invitation', () => {
    expect(evaluateInvitationPolicyV1({ invitationStatus: 'pending' })).toEqual({
      evaluatorId: 'invitation_v1',
      allowed: true,
    });
  });

  it('blocks with INVITATION_ALREADY_ACCEPTED when the invitation was already accepted', () => {
    const result = evaluateInvitationPolicyV1({ invitationStatus: 'accepted' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('INVITATION_ALREADY_ACCEPTED');
  });

  it('blocks with INVITATION_EXPIRED and a REQUEST_NEW_INVITATION action when expired', () => {
    const result = evaluateInvitationPolicyV1({ invitationStatus: 'expired' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('INVITATION_EXPIRED');
    expect(result.requiredActions).toContain('REQUEST_NEW_INVITATION');
  });
});
