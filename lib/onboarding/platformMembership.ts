import type {
  MembershipLifecycleStatus,
  MembershipRole,
  RelationshipType,
} from './membershipTypes';
import {
  isActiveLifecycleStatus,
  normalizeMembershipLifecycleStatus,
} from './membershipTypes';

/**
 * A person's relationship with an organization.
 * relationshipType (policy) is separate from role (authorization).
 */
export type PlatformMembership = {
  organizationId: string;
  organizationName?: string;
  relationshipType: RelationshipType;
  /** Business role — may be assigned after invitation accept in enterprise flows. */
  role?: MembershipRole | string;
  lifecycleStatus: MembershipLifecycleStatus;
};

export function isActiveMembership(membership: PlatformMembership): boolean {
  return isActiveLifecycleStatus(membership.lifecycleStatus);
}

export function activeMemberships(memberships: PlatformMembership[]): PlatformMembership[] {
  return memberships.filter(isActiveMembership);
}

export function activeEmploymentRelationships(
  memberships: PlatformMembership[],
): PlatformMembership[] {
  return memberships.filter(
    (m) => m.relationshipType === 'EMPLOYEE' && isActiveMembership(m),
  );
}

/** @deprecated Use activeEmploymentRelationships */
export const activeEmploymentMemberships = activeEmploymentRelationships;

export function membershipOrganizationIds(memberships: PlatformMembership[]): string[] {
  return [...new Set(memberships.map((m) => m.organizationId))];
}

export function platformMembershipFromLegacyRow(row: {
  organizationId: string;
  organizationName?: string;
  relationshipType?: RelationshipType;
  role?: string;
  status: string;
}): PlatformMembership {
  return {
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    relationshipType: row.relationshipType ?? 'EMPLOYEE',
    role: row.role,
    lifecycleStatus: normalizeMembershipLifecycleStatus(row.status),
  };
}
