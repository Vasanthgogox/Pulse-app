/**
 * TanStack Query hooks for ledger/transactions. Cached by orgId.
 */
import { useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTransactionsByOrganization,
  syncTransactionsWithCache,
  type LedgerRow,
} from '@/features/finance/services/finance.service';
import { clearDomainCacheMeta } from '@/lib/cache/cacheMetadataStore';
import { fetchEntityListWithFallback } from '@/lib/queries/fetchEntityListWithFallback';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
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
          | LedgerRow[]
          | undefined) ?? [];
      return fetchEntityListWithFallback({
        orgId: orgId!,
        domain: 'transactions',
        cachedRows: existing,
        sync: async (id, cached) => {
          const res = await syncTransactionsWithCache(id, cached);
          return { error: res.error, rows: res.transactions };
        },
        fetchDirect: async (id) => {
          const res = await getTransactionsByOrganization(id);
          return { error: res.error, rows: res.transactions };
        },
      });
    },
    enabled: !!orgId,
    staleTime: STALE.realtime,
    refetchOnMount: refetchOnMountIfEntityListEmpty<LedgerRow[]>(),
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
  return useCallback((orgId: string) => {
    void clearDomainCacheMeta('transactions', orgId);
    void qc.invalidateQueries({ queryKey: queryKeys.transactions.all(orgId) });
    void qc.invalidateQueries({ queryKey: queryKeys.transactions.finite(orgId) });
    void qc.invalidateQueries({ queryKey: ['q', 'transactions', orgId, 'infinite'] });
  }, [qc]);
}
