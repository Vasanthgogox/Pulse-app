/** Typed mirror of oms/'s Platform Identity (`platform.*` schema). Read-only — see docs/decisions.md ADR-001/ADR-002. */

export interface PlatformUser {
  id: string;
  code: string;
  auth_user_id: string | null;
  email: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PlatformOrganization {
  id: string;
  code: string;
  tenant_id: string;
  name: string;
  legal_name: string | null;
  legacy_organization_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type PlatformMembershipStatus = "active" | "suspended" | "revoked";

export interface PlatformMembership {
  id: string;
  code: string;
  user_id: string;
  organization_id: string;
  business_unit_id: string | null;
  role_id: number;
  status: PlatformMembershipStatus;
  created_at: string;
  updated_at: string;
}

export type PlatformInvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface PlatformInvitation {
  id: string;
  code: string;
  organization_id: string;
  email: string;
  role_id: number;
  business_unit_id: string | null;
  invited_by_user_id: string | null;
  status: PlatformInvitationStatus;
  expires_at: string;
  created_at: string;
  updated_at: string;
}
