import { evaluateIdentityProviderPolicyV1 } from './identityProviderPolicyEvaluator';
import type { OrganizationIdentityPolicy } from '@/lib/onboarding/organizationIdentityPolicy';
import { emailIdentity, phoneIdentity, externalIdentity } from '@/lib/onboarding/identityTypes';

const REQUIRE_SSO: OrganizationIdentityPolicy = {
  allowedProviders: ['entra', 'email'],
  requirePhone: false,
  requireCorporateEmail: false,
  requireSso: true,
};

const REQUIRE_CORPORATE_EMAIL: OrganizationIdentityPolicy = {
  allowedProviders: ['email'],
  requirePhone: false,
  requireCorporateEmail: true,
  requireSso: false,
};

const REQUIRE_PHONE: OrganizationIdentityPolicy = {
  allowedProviders: ['phone'],
  requirePhone: true,
  requireCorporateEmail: false,
  requireSso: false,
};

describe('evaluateIdentityProviderPolicyV1', () => {
  it('allows when no organization identity policy is provided', () => {
    expect(evaluateIdentityProviderPolicyV1({})).toEqual({
      evaluatorId: 'identity_provider_v1',
      allowed: true,
    });
  });

  it('blocks with SSO_REQUIRED when the org requires SSO and none is verified', () => {
    const result = evaluateIdentityProviderPolicyV1({
      organizationIdentityPolicy: REQUIRE_SSO,
      verifiedIdentities: [emailIdentity('a@b.com', true)],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('SSO_REQUIRED');
    expect(result.requiredActions).toContain('COMPLETE_SSO');
  });

  it('allows when the org requires SSO and a matching provider is verified', () => {
    const result = evaluateIdentityProviderPolicyV1({
      organizationIdentityPolicy: REQUIRE_SSO,
      verifiedIdentities: [externalIdentity('entra', 'subject-1', true)],
    });
    expect(result).toEqual({ evaluatorId: 'identity_provider_v1', allowed: true });
  });

  it('blocks with CORPORATE_EMAIL_REQUIRED when no verified email is present', () => {
    const result = evaluateIdentityProviderPolicyV1({
      organizationIdentityPolicy: REQUIRE_CORPORATE_EMAIL,
      verifiedIdentities: [phoneIdentity('9999999999', true)],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('CORPORATE_EMAIL_REQUIRED');
    expect(result.requiredActions).toContain('VERIFY_CORPORATE_EMAIL');
  });

  it('blocks with PHONE_VERIFICATION_REQUIRED when no verified phone is present', () => {
    const result = evaluateIdentityProviderPolicyV1({
      organizationIdentityPolicy: REQUIRE_PHONE,
      verifiedIdentities: [],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('PHONE_VERIFICATION_REQUIRED');
    expect(result.requiredActions).toContain('VERIFY_PHONE');
  });

  it('allows when all required identities are verified', () => {
    const result = evaluateIdentityProviderPolicyV1({
      organizationIdentityPolicy: REQUIRE_PHONE,
      verifiedIdentities: [phoneIdentity('9999999999', true)],
    });
    expect(result).toEqual({ evaluatorId: 'identity_provider_v1', allowed: true });
  });
});
