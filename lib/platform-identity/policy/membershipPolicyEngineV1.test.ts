import { evaluateJoinPoliciesV1 } from './membershipPolicyEngineV1';
import { emailIdentity } from '@/lib/onboarding/identityTypes';
import type { OrganizationIdentityPolicy } from '@/lib/onboarding/organizationIdentityPolicy';

const BASE_INPUT = {
  proposedRelationshipType: 'EMPLOYEE' as const,
  proposedOrganizationId: 'org-1',
  proposedOrganizationName: 'Acme',
  existingMemberships: [],
  organizationStatus: 'ACTIVE' as const,
};

describe('evaluateJoinPoliciesV1 — identity provider and invitation evaluators are wired in', () => {
  it('allows when no identity policy or invitation status blocks the join', async () => {
    const result = await evaluateJoinPoliciesV1(BASE_INPUT);
    expect(result.allowed).toBe(true);
    expect(result.decisions.map((d) => d.evaluatorId)).toEqual(
      expect.arrayContaining(['identity_provider_v1', 'invitation_v1']),
    );
  });

  it('surfaces SSO_REQUIRED as the primary block when the org requires SSO', async () => {
    const requireSso: OrganizationIdentityPolicy = {
      allowedProviders: ['entra'],
      requirePhone: false,
      requireCorporateEmail: false,
      requireSso: true,
    };

    const result = await evaluateJoinPoliciesV1({
      ...BASE_INPUT,
      organizationIdentityPolicy: requireSso,
      verifiedIdentities: [emailIdentity('a@b.com', true)],
    });

    expect(result.allowed).toBe(false);
    expect(result.primaryBlock?.reason).toBe('SSO_REQUIRED');
  });

  it('surfaces INVITATION_EXPIRED as the primary block for an expired invitation', async () => {
    const result = await evaluateJoinPoliciesV1({
      ...BASE_INPUT,
      invitationStatus: 'expired',
    });

    expect(result.allowed).toBe(false);
    expect(result.primaryBlock?.reason).toBe('INVITATION_EXPIRED');
  });
});
