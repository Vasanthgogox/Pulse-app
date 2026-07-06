/**
 * Platform Identity — bounded domain service for Person, Membership, Invitation, Policy, Workspace.
 *
 * Onboarding, admin portal, API, and mobile are clients of this façade.
 */
export { platformIdentityService, type PlatformIdentityService } from './platformIdentity.service';
export type {
  AcceptInvitationDeps,
  AcceptInvitationInput,
  AcceptInvitationResult,
} from './platformIdentity.service';

export type { OnboardingContextInput } from '@/lib/onboarding/onboardingContextInput';

export type { AuthenticationMethod, AuthenticationResult, AuthenticationSession } from './types/authentication';
export type { OrganizationStatus, OrganizationSummary } from './types/organizationStatus';
export {
  isOrganizationJoinable,
  loadOrganizationStatus,
  organizationStatusBlockedMessage,
} from './types/organizationStatus';
export type { PlatformWorkspaceContext } from './types/workspace';
export { buildWorkspaceContext, EMPTY_WORKSPACE_CONTEXT } from './types/workspace';
export type { PlatformPermission, DelegatedAdminScope } from './types/permissions';
export { hasPermission, FLEET_ADMIN_SCOPE } from './types/permissions';

export type {
  PolicyDecision,
  CombinedPolicyResult,
  PolicyDecisionReason,
  PolicyEvaluatorId,
} from './policy/policyDecision';
export { combinePolicyDecisions, policyResultToError } from './policy/policyDecision';
export { evaluateJoinPoliciesV1, type EvaluateJoinInput } from './policy/membershipPolicyEngineV1';

export type { PlatformIdentityAuditEvent, PlatformIdentityAuditEventType } from './audit/platformIdentityAudit';
export {
  recordPlatformIdentityAudit,
  getPlatformIdentityAuditBuffer,
  clearPlatformIdentityAuditBuffer,
} from './audit/platformIdentityAudit';
export { persistPlatformIdentityAuditEvent } from './audit/platformIdentityAuditPersistence';

export {
  getPlatformWorkspaceStore,
  setPlatformWorkspaceStore,
  syncPlatformWorkspaceFromActive,
  clearPlatformWorkspaceStore,
} from './workspace/workspaceContextStore';
export {
  getWorkspaceRequestContext,
  withWorkspaceContext,
  requireActiveWorkspaceOrganizationId,
  hasWorkspacePermission,
  type WorkspaceRequestContext,
} from './api/workspaceRequestContext';
