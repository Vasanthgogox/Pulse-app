// Types: User, Workspace (with KYC), WorkspaceMember, ActiveWorkspaceState

export type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface User {
  id: string;               // auth.users.id
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null; // personal photo — shown in chat, account page
  avatar_seed: string | null; // legacy
  role: 'user' | 'driver';
}

export interface Workspace {
  id: string;               // organizations.id
  name: string;
  slug: string | null;
  logo_url: string | null;  // company logo — shown in TMS/marketplace/invoices
  operating_model: 'ASSET_BASED' | 'NON_ASSET' | 'HYBRID';
  // Address
  address_line: string | null;
  city: string | null;
  state: string | null;
  zone: string | null;
  // KYC
  business_pan: string | null;
  gstin: string | null;
  cin: string | null;
  verification_status: KycStatus;
  verified_at: string | null;
  kyc_rejected_reason: string | null;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;    // organization_members.organization_id
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'inactive' | 'pending';
  joined_at: string;
}

export interface ActiveWorkspaceState {
  // All workspaces the user belongs to
  workspaces: Workspace[];
  // Currently active workspace
  activeWorkspace: Workspace | null;
  // User's role in the active workspace
  memberRole: WorkspaceMember['role'] | null;
  // True while loading the workspace list
  isLoading: boolean;
  error: Error | null;
  // Switch the active workspace (persists to storage)
  switchWorkspace: (workspaceId: string) => Promise<void>;
  // Refresh from DB
  refresh: () => Promise<void>;
  // Convenience: is current user an owner or admin?
  canManageWorkspace: boolean;
}
