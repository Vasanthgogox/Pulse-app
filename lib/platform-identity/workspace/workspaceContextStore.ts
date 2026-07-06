import type { RelationshipType } from '@/lib/onboarding/membershipTypes';

import {
  buildWorkspaceContext,
  EMPTY_WORKSPACE_CONTEXT,
  type PlatformWorkspaceContext,
} from '../types/workspace';

let store: PlatformWorkspaceContext = { ...EMPTY_WORKSPACE_CONTEXT };

export function getPlatformWorkspaceStore(): PlatformWorkspaceContext {
  return store;
}

export function setPlatformWorkspaceStore(ctx: PlatformWorkspaceContext): void {
  store = ctx;
}

/** Sync workspace store from ActiveWorkspaceContext after switch/load. */
export function syncPlatformWorkspaceFromActive(input: {
  personId?: string | null;
  organizationId: string;
  role?: string | null;
  membershipId?: string | null;
  relationshipType?: RelationshipType;
  permissions?: string[];
  features?: string[];
  locale?: string;
}): PlatformWorkspaceContext {
  const ctx = buildWorkspaceContext({
    personId: input.personId,
    activeOrganizationId: input.organizationId,
    activeMembershipId: input.membershipId ?? null,
    relationshipType: input.relationshipType ?? 'EMPLOYEE',
    role: input.role ?? undefined,
    permissions: input.permissions ?? defaultPermissionsForRole(input.role),
    features: input.features ?? [],
    locale: input.locale,
  });
  setPlatformWorkspaceStore(ctx);
  return ctx;
}

function defaultPermissionsForRole(role?: string | null): string[] {
  if (!role) return [];
  if (role === 'owner') return ['members.invite', 'members.view', 'members.remove', 'organization.settings'];
  if (role === 'admin') return ['members.invite', 'members.view', 'members.remove'];
  return ['members.view'];
}

export function clearPlatformWorkspaceStore(): void {
  store = { ...EMPTY_WORKSPACE_CONTEXT };
}
