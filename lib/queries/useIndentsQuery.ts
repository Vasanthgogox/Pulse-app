/**
 * TanStack Query hooks for indents and related load data. Cached by orgId.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getIndentsByOrganization,
  getMarketIndentsForOrganization,
  syncIndentsWithCache,
} from '@/features/indents/services/indents.service';
import {
  getMyDirectQuotes,
  getDirectQuotesByIndentId,
  getDirectQuoteCountsByIndentIds,
  type DirectQuoteRow,
} from '@/features/indents/services/direct-quotes.service';
import { getIndentOfferCountsForOwnerIndents } from '@/features/network/services/bids.service';
import { queryKeys } from '@/lib/queryKeys';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { STALE } from '@/lib/queryClient';

/** Full list. Use for Load Board, Create Indent when list is small. */
export function useIndentsQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.indents.finite(orgId ?? ''),
    queryFn: async () => {
      const existing =
        (qc.getQueryData(queryKeys.indents.finite(orgId ?? '')) as
          | Array<{ id: string }>
          | undefined) ?? [];
      const res = await syncIndentsWithCache(orgId!, existing as any);
      if (res.error) throw res.error;
      return res.indents;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

/** Market-facing indents for GET LOAD / Find Work (visible to current org as integrated supplier). */
export function useMarketIndentsQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.indents.market(orgId ?? ''),
    queryFn: async () => {
      const res = await getMarketIndentsForOrganization(orgId!);
      if (res.error) throw res.error;
      return res.indents;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

/** My direct quotes for GET LOAD views (carrier side). */
export function useMyDirectQuotesQuery(orgId: string | null) {
  return useQuery<DirectQuoteRow[]>({
    queryKey: [...queryKeys.indents.finite(orgId ?? ''), 'my-direct-quotes'],
    queryFn: async () => {
      const res = await getMyDirectQuotes(orgId!);
      if (res.error) throw res.error;
      return res.quotes;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

/** All direct quotes on a specific indent (Give Load owner side). */
export function useIndentDirectQuotesQuery(indentId: string | null) {
  return useQuery<DirectQuoteRow[]>({
    queryKey: ['indents', indentId, 'direct-quotes'],
    queryFn: async () => {
      const res = await getDirectQuotesByIndentId(indentId!);
      if (res.error) throw res.error;
      return res.quotes;
    },
    enabled: !!indentId,
    staleTime: STALE.frequent,
  });
}

/** Quote counts per indent for Hire Partner list (one query for all visible indents). */
export function useDirectQuoteCountsQuery(indentIds: string[] | null) {
  const stableKey = indentIds?.length
    ? [...indentIds].sort().join(',')
    : '';
  return useQuery<Record<string, number>>({
    queryKey: ['indents', 'quote-counts', stableKey],
    queryFn: async () => {
      const res = await getDirectQuoteCountsByIndentIds(indentIds!);
      if (res.error) throw res.error;
      return res.counts;
    },
    enabled: !!indentIds?.length,
    staleTime: STALE.frequent,
  });
}

/** Unique pending offers per indent (direct_quotes ∪ Pulse bids, deduped by bidder org). */
export function useIndentOfferCountsQuery(ownerOrgId: string | null, indentIds: string[]) {
  const stableKey = indentIds.length ? [...indentIds].sort().join(',') : '';
  return useQuery<Record<string, number>>({
    queryKey: ['indents', 'offer-counts', ownerOrgId ?? '', stableKey],
    queryFn: async () => {
      const res = await getIndentOfferCountsForOwnerIndents(ownerOrgId!, indentIds);
      if (res.error) throw res.error;
      return res.counts;
    },
    enabled: !!ownerOrgId && indentIds.length > 0,
    staleTime: STALE.frequent,
  });
}

/** Paginated list for Indents tab. */
export function useIndentsInfiniteQuery(orgId: string | null, opts?: { pageSize?: number }) {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: queryKeys.indents.infinite(orgId ?? '', pageSize),
    queryFn: async ({ pageParam = 0 }) => {
      const res = await getIndentsByOrganization(orgId!, { limit: pageSize, offset: pageParam });
      if (res.error) throw res.error;
      return { indents: res.indents, hasMore: res.hasMore ?? false, nextOffset: pageParam + pageSize };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    initialPageParam: 0,
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useInvalidateIndents() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.indents.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.indents.finite(orgId) });
    qc.invalidateQueries({ queryKey: ['q', 'indents', orgId, 'infinite'] });
    qc.invalidateQueries({ queryKey: queryKeys.indents.market(orgId) });
  };
}
