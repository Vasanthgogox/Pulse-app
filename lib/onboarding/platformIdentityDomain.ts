import type { PersonStatus } from './membershipTypes';
import type { InvitationIdentity } from './identityTypes';
import type { PlatformMembership } from './platformMembership';
import { activeMemberships } from './platformMembership';

/**
 * Platform Identity domain model (conceptual — not a DB schema).
 *
 * ```
 * Person
 *   ├── Identities[]     phone, email, employee_id, SSO
 *   ├── status           ACTIVE | SUSPENDED | DELETED | LOCKED
 *   └── Memberships[]
 *         ├── organization
 *         ├── relationshipType   EMPLOYEE | CONTRACTOR | PARTNER | SUPPORT | SYSTEM
 *         ├── role               Driver, Auditor, … (authorization)
 *         ├── lifecycleStatus    PENDING | ACTIVE | …
 *         └── permissions
 * ```
 */
export type PlatformPersonDomain = {
  personId: string | null;
  status: PersonStatus;
  identities: InvitationIdentity[];
  memberships: PlatformMembership[];
  activeOrganizationId: string | null;
};

/** @deprecated Use PlatformPersonDomain */
export type PlatformUserDomain = PlatformPersonDomain;

export function buildPlatformPersonDomain(input: {
  personId?: string | null;
  status?: PersonStatus;
  identities: InvitationIdentity[];
  memberships: PlatformMembership[];
  activeOrganizationId?: string | null;
}): PlatformPersonDomain {
  return {
    personId: input.personId ?? null,
    status: input.status ?? 'ACTIVE',
    identities: input.identities,
    memberships: input.memberships,
    activeOrganizationId: input.activeOrganizationId ?? null,
  };
}

/** @deprecated Use buildPlatformPersonDomain */
export const buildPlatformUserDomain = buildPlatformPersonDomain;

export function activeMembershipCount(memberships: PlatformMembership[]): number {
  return activeMemberships(memberships).length;
}

export function switchableWorkspaceCount(memberships: PlatformMembership[]): number {
  return activeMembershipCount(memberships);
}
