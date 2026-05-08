/**
 * TanStack Query hooks for ledger/transactions. Cached by orgId.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTransactionsByOrganization } from '@/features/finance/services/finance.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import { LEDGER_PAGE_SIZE } from '@/lib/pagination';

/** Full list (no pagination). Use for aggregation e.g. Trips tab "received by trip". */
export function useTransactionsQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.transactions.all(orgId ?? ''),
    queryFn: async () => {
      const res = await getTransactionsByOrganization(orgId!);
      if (res.error) throw res.error;
      return res.transactions;
    },
    enabled: !!orgId,
    staleTime: STALE.realtime,
  });
}

/** Paginated ledger (e.g. Finance Ledger tab). */
export function useTransactionsInfiniteQuery(orgId: string | null, opts?: { pageSize?: number }) {
  const pageSize = opts?.pageSize ?? LEDGER_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: [...queryKeys.transactions.all(orgId ?? ''), 'infinite', pageSize],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await getTransactionsByOrganization(orgId!, { limit: pageSize, offset: pageParam });
      if (res.error) throw res.error;
      return {
        transactions: res.transactions,
        hasMore: res.hasMore ?? false,
        nextOffset: pageParam + pageSize,
      };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    initialPageParam: 0,
    enabled: !!orgId,
    staleTime: STALE.realtime,
  });
}

export function useInvalidateTransactions() {
  const qc = useQueryClient();
  return (orgId: string) => qc.invalidateQueries({ queryKey: queryKeys.transactions.all(orgId) });
}
