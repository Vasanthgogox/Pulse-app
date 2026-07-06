/**
 * API request context derived from Platform Workspace.
 * Every authenticated API call should include workspace scope for authorization.
 */
import { getAccessToken } from '@/lib/supabase';

import { platformIdentityService } from '../platformIdentity.service';
import type { PlatformWorkspaceContext } from '../types/workspace';

export type WorkspaceRequestContext = {
  workspace: PlatformWorkspaceContext;
  headers: Record<string, string>;
};

/** Headers for Edge Functions / REST proxies that enforce org-scoped authorization. */
export async function getWorkspaceRequestContext(): Promise<WorkspaceRequestContext> {
  const workspace = platformIdentityService.getCurrentWorkspace();
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (workspace.activeOrganizationId) {
    headers['X-Pulse-Organization-Id'] = workspace.activeOrganizationId;
  }
  if (workspace.personId) {
    headers['X-Pulse-Person-Id'] = workspace.personId;
  }
  if (workspace.activeMembershipId) {
    headers['X-Pulse-Membership-Id'] = workspace.activeMembershipId;
  }

  return { workspace, headers };
}

export function requireActiveWorkspaceOrganizationId(): string {
  const orgId = platformIdentityService.getCurrentWorkspace().activeOrganizationId;
  if (!orgId) {
    throw new Error('No active workspace organization. Switch workspace before calling this API.');
  }
  return orgId;
}

export function hasWorkspacePermission(permission: string): boolean {
  return platformIdentityService.getCurrentWorkspace().permissions.includes(permission);
}

/**
 * Wrap an async API call with workspace context validation.
 * Throws if active organization is required but missing.
 */
export async function withWorkspaceContext<T>(
  fn: (ctx: WorkspaceRequestContext) => Promise<T>,
  options?: { requireOrganization?: boolean },
): Promise<T> {
  const ctx = await getWorkspaceRequestContext();
  if (options?.requireOrganization && !ctx.workspace.activeOrganizationId) {
    throw new Error('Active workspace organization is required.');
  }
  return fn(ctx);
}
