/**
 * TanStack Query hooks for indents and related load data. Cached by orgId.
 *
 * IMPORTANT: This module is reachable from the startup graph (dock badges in
 * `DemoTabBar` call `useIndentsQuery` for the dispatcher dock count). To keep
 * the indents/direct-quotes/bids service graphs out of the startup chunk, all
 * service modules are **dynamic-imported inside queryFns**. The first call
 * incurs one extra microtask; the module is cached after that.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DirectQuoteRow } from '@/features/indents/services/direct-quotes.service';
import type { IndentRow } from '@/features/indents/services/indents.service';
import { findIndentInMarketList } from '@/features/indents/utils/findIndentInList.util';
import { queryKeys } from '@/lib/queryKeys';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { STALE } from '@/lib/queryClient';

const loadIndentsService = () =>
  import('@/features/indents/services/indents.service');

const loadDirectQuotesService = () =>
  import('@/features/indents/services/direct-quotes.service');
const loadBidsService = () => import('@/features/network/services/bids.service');

/** Full list. Use for Load Board, Create Indent when list is small. */
export function useIndentsQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.indents.finite(orgId ?? ''),
    queryFn: async () => {
      const { syncIndentsWithCache } = await loadIndentsService();
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
      const { getMarketIndentsForOrganization } = await loadIndentsService();
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
      const { getMyDirectQuotes } = await loadDirectQuotesService();
      const res = await getMyDirectQuotes(orgId!);
      if (res.error) throw res.error;
      return res.quotes;
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

/**
 * Single indent for detail / allocation — uses cached market list when available
 * so suppliers avoid refetching the full Find Work feed.
 */
export function useVisibleIndentQuery(
  orgId: string | null,
  indentId: string | null,
) {
  const qc = useQueryClient();
  return useQuery<IndentRow>({
    queryKey: queryKeys.indents.visible(orgId ?? '', indentId ?? ''),
    queryFn: async () => {
      const { getVisibleIndentById } = await loadIndentsService();
      const hint = qc.getQueryData<IndentRow[]>(
        queryKeys.indents.market(orgId ?? ''),
      );
      const res = await getVisibleIndentById(orgId, indentId!, {
        marketIndentsHint: hint ?? undefined,
      });
      if (res.error) throw res.error;
      if (!res.indent) throw new Error('Indent not found');
      return res.indent;
    },
    enabled: !!orgId && !!indentId,
    staleTime: STALE.moderate,
    placeholderData: () => {
      if (!orgId || !indentId) return undefined;
      const hint = qc.getQueryData<IndentRow[]>(
        queryKeys.indents.market(orgId),
      );
      if (!hint?.length) return undefined;
      return findIndentInMarketList(hint, indentId) ?? undefined;
    },
  });
}

/** All direct quotes on a specific indent (Give Load owner side). */
export function useIndentDirectQuotesQuery(indentId: string | null) {
  return useQuery<DirectQuoteRow[]>({
    queryKey: ['indents', indentId, 'direct-quotes'],
    queryFn: async () => {
      const { getDirectQuotesByIndentId } = await loadDirectQuotesService();
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
      const { getDirectQuoteCountsByIndentIds } = await loadDirectQuotesService();
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
      const { getIndentOfferCountsForOwnerIndents } = await loadBidsService();
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
      const { getIndentsByOrganization } = await loadIndentsService();
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
    qc.invalidateQueries({ queryKey: ['q', 'indents', orgId, 'visible'] });
  };
}
