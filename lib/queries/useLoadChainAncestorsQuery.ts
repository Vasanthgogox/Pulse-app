/**
 * Orgs already upstream in a load's custody chain, for the sub-contract loop
 * guard. See features/trips/services/loadChainGuard.service.ts.
 *
 * Keyed by indentId only — the chain is a property of the load, not the viewer.
 */
import { useQuery } from '@tanstack/react-query';
import {
  getLoadChainAncestors,
  type LoadChainAncestor,
} from '@/features/trips/services/loadChainGuard.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

export function useLoadChainAncestorsQuery(indentId: string | null | undefined) {
  const id = String(indentId ?? '').trim();
  return useQuery<LoadChainAncestor[], Error>({
    queryKey: queryKeys.indents.chainAncestors(id),
    queryFn: async () => {
      const { error, ancestors } = await getLoadChainAncestors(id);
      if (error) throw error;
      return ancestors;
    },
    enabled: id.length > 0,
    // The chain only changes when the load is re-awarded upstream.
    staleTime: STALE.moderate,
  });
}
