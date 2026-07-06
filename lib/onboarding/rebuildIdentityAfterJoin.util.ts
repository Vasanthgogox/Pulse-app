import type { QueryClient } from '@tanstack/react-query';

/**
 * Rebuild app identity after joining an organization (invite accept).
 * Order: session → organizations → workspaces → active workspace → cache eviction.
 */
export async function rebuildIdentityAfterJoin(options: {
  organizationId: string;
  refreshSession: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  queryClient: QueryClient;
}): Promise<void> {
  const {
    organizationId,
    refreshSession,
    refreshOrganization,
    refreshWorkspaces,
    switchWorkspace,
    queryClient,
  } = options;

  await refreshSession();
  await refreshOrganization();
  await refreshWorkspaces();
  await switchWorkspace(organizationId);

  queryClient.removeQueries({
    predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'q',
  });
}
