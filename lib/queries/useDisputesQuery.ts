import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import {
  getDisputesReceived,
  getOpenDisputesByOrg,
  type DisputeRow,
} from '@/features/finance/services/sharedLedger.service';

export type { DisputeRow };

export function useDisputesReceivedQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.disputes.received(orgId ?? ''),
    queryFn: () => getDisputesReceived(orgId!).then((r) => r.disputes ?? []),
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useOpenDisputesQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.disputes.open(orgId ?? ''),
    queryFn: () => getOpenDisputesByOrg(orgId!).then((r) => r.disputes ?? []),
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export type DisputeMapEntry = {
  status: 'OPEN' | 'RESOLVED';
  direction: 'RAISED_BY_US' | 'RECEIVED';
};

/**
 * Combines org-wide raised + received disputes into a transaction_id → entry map.
 * Both sub-queries share staleTime so at most 2 network requests per org per 10 min,
 * regardless of how many components call this simultaneously.
 */
export function useDisputeMapQuery(orgId: string | null): {
  disputesByTripId: Record<string, DisputeMapEntry>;
  isLoading: boolean;
} {
  const raised = useOpenDisputesQuery(orgId);
  const received = useDisputesReceivedQuery(orgId);

  const disputesByTripId = useMemo(() => {
    const map: Record<string, DisputeMapEntry> = {};
    for (const d of raised.data ?? []) {
      if (d.status === 'OPEN' && d.transaction_id) {
        map[d.transaction_id] = { status: 'OPEN', direction: 'RAISED_BY_US' };
      }
    }
    for (const d of received.data ?? []) {
      if (d.status === 'OPEN' && d.transaction_id && !map[d.transaction_id]) {
        map[d.transaction_id] = { status: 'OPEN', direction: 'RECEIVED' };
      }
    }
    return map;
  }, [raised.data, received.data]);

  return { disputesByTripId, isLoading: raised.isLoading || received.isLoading };
}

export function useInvalidateDisputes() {
  const qc = useQueryClient();
  return (orgId: string) =>
    qc.invalidateQueries({ queryKey: queryKeys.disputes.all(orgId) });
}
