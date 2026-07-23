/**
 * Is the active org KYC-verified? Reads the already-mapped verification_status
 * off ActiveWorkspaceContext — no extra network call. A "verified user" in the
 * product sense = a member of an org whose organizations.verification_status
 * === 'verified'. Used to gate Network actions (connect / give load / get load).
 */
import { useOptionalActiveWorkspace } from '@/contexts/ActiveWorkspaceContext';
import type { KycStatus } from '@/types/workspace';

export interface OrgVerifiedState {
  isVerified: boolean;
  status: KycStatus;
  isLoading: boolean;
}

export function useIsOrgVerified(): OrgVerifiedState {
  const ctx = useOptionalActiveWorkspace();
  const status = ctx?.activeWorkspace?.verification_status ?? 'unverified';
  return {
    isVerified: status === 'verified',
    status,
    // No provider / still resolving the workspace — hold callers from treating
    // "no data yet" as "unverified" and prompting prematurely.
    isLoading: ctx?.isLoading ?? true,
  };
}
