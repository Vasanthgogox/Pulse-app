/**
 * TanStack Query hooks for ledger/transactions. Cached by orgId.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTransactionsByOrganization,
  syncTransactionsWithCache,
} from '@/features/finance/services/finance.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import { LEDGER_PAGE_SIZE } from '@/lib/pagination';

/** Full list (no pagination). Use for aggregation e.g. Trips tab "received by trip". */
export function useTransactionsQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.transactions.finite(orgId ?? ''),
    queryFn: async () => {
      const existing =
        (qc.getQueryData(queryKeys.transactions.finite(orgId ?? '')) as
          | Array<{ id: string }>
          | undefined) ?? [];
      const res = await syncTransactionsWithCache(orgId!, existing as any);
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
    queryKey: queryKeys.transactions.infinite(orgId ?? '', pageSize),
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
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.transactions.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.transactions.finite(orgId) });
    qc.invalidateQueries({ queryKey: ['q', 'transactions', orgId, 'infinite'] });
  };
}
