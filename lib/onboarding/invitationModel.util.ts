import type { ResolvedTeamInvitation } from '@/features/organization/services/teamInvitationResolver.service';

import type { EmailIdentity, IdentityInvitation, InvitationIdentity, PhoneIdentity } from './identityTypes';
import { emailIdentity, phoneIdentity } from './identityTypes';
import { proposedRelationshipTypeFromTeamInvite } from './membershipTypes';

/** V1 row → IdentityInvitation (multi-identity model). */
export function legacyTeamInviteToIdentityInvitation(
  row: ResolvedTeamInvitation,
  phoneValue?: string,
): IdentityInvitation {
  const identities: InvitationIdentity[] = [];
  if (phoneValue?.trim()) {
    identities.push(phoneIdentity(phoneValue.trim()));
  }
  if (row.inviteeEmail?.trim()) {
    identities.push(emailIdentity(row.inviteeEmail.trim()));
  }

  const isExpired = row.isExpired || row.status === 'expired';
  const isAccepted = row.status === 'accepted';
  const proposedRelationshipType = proposedRelationshipTypeFromTeamInvite();

  return {
    id: row.inviteId,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    accepted: isAccepted,
    identities,
    proposedRelationshipType,
    membershipType: proposedRelationshipType,
    inviteeName: row.inviteeName,
    role: row.role,
    platformRole: row.platformRole,
    platformRoleLabel: row.platformRoleLabel,
    businessUnit: row.businessUnitName,
    department: row.departmentName,
    invitedByName: row.invitedByName,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    status: isAccepted ? 'accepted' : isExpired ? 'expired' : 'pending',
  };
}

export function identityInvitationToLegacy(
  invite: IdentityInvitation,
): ResolvedTeamInvitation {
  const phone = invite.identities.find((i): i is PhoneIdentity => i.type === 'phone')?.value;
  const email =
    invite.identities.find((i): i is EmailIdentity => i.type === 'email')?.value ?? null;

  return {
    inviteId: invite.id,
    inviteeName: invite.inviteeName,
    inviteeEmail: email,
    organizationId: invite.organizationId,
    organizationName: invite.organizationName,
    invitedByName: invite.invitedByName,
    role: invite.role,
    platformRole: (invite.platformRole as ResolvedTeamInvitation['platformRole']) ?? null,
    platformRoleLabel: invite.platformRoleLabel,
    businessUnitName: invite.businessUnit ?? null,
    departmentName: invite.department ?? null,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    isExpired: invite.status === 'expired',
    status: invite.status === 'expired' ? 'expired' : invite.accepted ? 'accepted' : 'pending',
  };
}

export function invitationProposedRelationshipType(
  invite: IdentityInvitation,
): import('./membershipTypes').RelationshipType {
  return invite.proposedRelationshipType ?? invite.membershipType ?? 'EMPLOYEE';
}
