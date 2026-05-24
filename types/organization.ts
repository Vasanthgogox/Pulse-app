/** Current org shape for list/detail screens. Aligned with Q-unified-base. */
export interface CurrentOrganization {
  id: string;
  name: string;
  /** Organization branding logo (storage path or http URL). Priority: logo_url → owner avatar → initials. */
  logo_url?: string | null;
  operatingModel?: 'ASSET_BASED' | 'NON_ASSET' | 'HYBRID';
  sourcingStrategy?: string;
  marketplaceEnabled?: boolean;
  capabilities?: {
    canPostIndent: boolean;
    canBid: boolean;
    canManageAssets: boolean;
    canUseMarketplace: boolean;
  };
}

export type OrgMemberRole = 'owner' | 'admin' | 'member' | 'driver';
export type OrgMemberStatus = 'active' | 'inactive' | 'invited';

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgMemberRole;
  status: OrgMemberStatus;
  permissions: Record<string, unknown>;
  joined_at: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  company_name?: string | null;
}

export interface UserProfileForInvite {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
}

export interface TeamInvite {
  id: string;
  organization_id: string;
  role: OrgMemberRole;
  joined_at: string;
  org_name: string;
}

// ─── Workspace KYC ────────────────────────────────────────────────────────────

export type KycVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface WorkspaceKyc {
  id: string;
  name: string;
  logo_url: string | null;
  business_pan: string | null;
  gstin: string | null;
  cin: string | null;
  verification_status: KycVerificationStatus;
  verified_at: string | null;
  kyc_rejected_reason: string | null;
}
