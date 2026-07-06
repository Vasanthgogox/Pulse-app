import type { EmployeeIdentity, IdentityInvitation } from '../identityTypes';

import type {
  IdentityProvider,
  ResolveProviderInvitationsResult,
  VerifyIdentityInput,
  VerifyIdentityResult,
} from './identityProvider.types';

/** V2 — HR / partner employee ID lookup. */
export const employeeIdentityProvider: IdentityProvider = {
  type: 'employee_id',

  supports(identity): identity is EmployeeIdentity {
    return identity.type === 'employee_id';
  },

  async verify(input: VerifyIdentityInput): Promise<VerifyIdentityResult> {
    if (input.identity.type !== 'employee_id') {
      return { error: new Error('Not an employee ID identity'), identity: null };
    }
    if (input.identity.verified) {
      return { error: null, identity: input.identity };
    }
    return { error: new Error('Employee ID verification not implemented'), identity: null };
  },

  async resolveInvitations(identity): Promise<ResolveProviderInvitationsResult> {
    void identity;
    const empty: IdentityInvitation[] = [];
    return { error: null, invitations: empty, expired: empty };
  },
};
