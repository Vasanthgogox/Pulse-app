import type { Query } from '@tanstack/react-query';

/**
 * Force network refetch when a persisted/hydrated entity list is empty (not just when stale).
 * Returns a typed callback so each hook preserves concrete query data generics.
 */
export function refetchOnMountIfEntityListEmpty<TData>() {
  return (
    query: Query<TData, Error, TData, readonly unknown[]>,
  ): boolean | 'always' => {
    const data = query.state.data;
    if (!Array.isArray(data) || data.length === 0) return 'always';
    return true;
  };
}

const ENTITY_FINITE_PREFIXES = new Set(['clients', 'suppliers', 'drivers', 'vehicles', 'trips', 'transactions']);

/** Drop hydrated empty entity lists saved before persistence guard shipped. */
export function isPersistedEntityListQueryKey(queryKey: readonly unknown[]): boolean {
  return (
    queryKey.length >= 4 &&
    queryKey[0] === 'q' &&
    typeof queryKey[1] === 'string' &&
    ENTITY_FINITE_PREFIXES.has(queryKey[1]) &&
    queryKey[3] === 'finite'
  );
}

export function purgeEmptyEntityQueriesFromCache(client: {
  getQueryCache: () => { getAll: () => Array<{ queryKey: readonly unknown[]; state: { status: string; data: unknown } }> };
  removeQueries: (filters: { queryKey: readonly unknown[]; exact: boolean }) => void;
}): void {
  for (const query of client.getQueryCache().getAll()) {
    const { data, status } = query.state;
    if (status !== 'success') continue;
    if (!Array.isArray(data) || data.length > 0) continue;
    if (!isPersistedEntityListQueryKey(query.queryKey)) continue;
    client.removeQueries({ queryKey: query.queryKey, exact: true });
  }
}
