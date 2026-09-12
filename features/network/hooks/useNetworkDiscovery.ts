/**
 * Shared Discover list — one TanStack query per (orgId, search).
 * Realtime is ref-counted in useDiscoverRealtimeCoordinator (not per hook fetch).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearDiscoveryCache,
  getDiscoveryCache,
  getDiscoveryCacheStale,
  hydrateDiscoveryCacheFromStorage,
  setDiscoveryCache,
} from "@/features/network/lib/discoveryCache";
import {
  applyPartnerDisplayToDiscoverOrgs,
  discoverOrganizations,
  type DiscoverOrg,
} from "@/features/network/services/discover.service";
import { useDiscoverRealtimeCoordinator } from "@/features/network/hooks/useRealtimeDiscoverInvalidation";
import { ensureLinkedOrgDisplayProfiles } from "@/lib/queries/linkedOrgDisplayCache";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 40;

export type DiscoverListPage = {
  orgs: DiscoverOrg[];
  nextOffset: number | null;
};

export type UseNetworkDiscoveryOptions = {
  orgId: string | null;
  search: string;
  enabled?: boolean;
};

function flattenPages(
  data: InfiniteData<DiscoverListPage> | undefined,
): DiscoverOrg[] {
  if (!data?.pages?.length) return [];
  const seen = new Set<string>();
  const out: DiscoverOrg[] = [];
  for (const page of data.pages) {
    for (const org of page.orgs) {
      if (seen.has(org.id)) continue;
      seen.add(org.id);
      out.push(org);
    }
  }
  return out;
}

/** HEAD invariant: a full page that adds no new IDs is terminal. */
function nextDiscoverPageParam(
  lastPage: DiscoverListPage,
  allPages: DiscoverListPage[],
): number | undefined {
  if (lastPage.nextOffset == null) return undefined;
  const seen = new Set<string>();
  for (let i = 0; i < allPages.length - 1; i++) {
    for (const org of allPages[i].orgs) {
      const id = (org.id ?? "").trim();
      if (id) seen.add(id);
    }
  }
  const hasFresh = lastPage.orgs.some((org) => {
    const id = (org.id ?? "").trim();
    return Boolean(id) && !seen.has(id);
  });
  return hasFresh ? lastPage.nextOffset : undefined;
}

export function useNetworkDiscovery({
  orgId,
  search,
  enabled = true,
}: UseNetworkDiscoveryOptions) {
  const queryClient = useQueryClient();
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const searchRef = useRef(search);
  searchRef.current = debouncedSearch;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useDiscoverRealtimeCoordinator(enabled ? orgId : null);

  const queryKey = queryKeys.discover.search(orgId ?? "", debouncedSearch);
  const queryEnabled = Boolean(orgId && enabled);

  const query = useInfiniteQuery({
    queryKey,
    enabled: queryEnabled,
    staleTime: STALE.moderate,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const currentOrgId = orgId!;
      await hydrateDiscoveryCacheFromStorage();
      const { orgs: raw, error } = await discoverOrganizations(
        currentOrgId,
        debouncedSearch,
        PAGE_SIZE,
        pageParam,
      );
      if (error) {
        if (pageParam === 0) {
          const stale = getDiscoveryCacheStale(currentOrgId, debouncedSearch);
          if (stale?.data.length) {
            return { orgs: stale.data, nextOffset: null };
          }
        }
        throw error;
      }
      const profiles = await ensureLinkedOrgDisplayProfiles(
        raw.map((o) => o.id),
        queryClient,
        currentOrgId,
      );
      const orgs = applyPartnerDisplayToDiscoverOrgs(raw, profiles);
      if (pageParam === 0) {
        setDiscoveryCache(currentOrgId, debouncedSearch, orgs);
      }
      return {
        orgs,
        nextOffset: raw.length >= PAGE_SIZE ? pageParam + raw.length : null,
      };
    },
    getNextPageParam: (lastPage, allPages) =>
      nextDiscoverPageParam(lastPage, allPages),
    placeholderData: () => {
      if (!orgId) return undefined;
      const cached = getDiscoveryCache(orgId, debouncedSearch);
      if (!cached?.data.length) return undefined;
      return {
        pages: [
          {
            orgs: cached.data,
            nextOffset:
              cached.data.length >= PAGE_SIZE ? cached.data.length : null,
          },
        ],
        pageParams: [0],
      };
    },
  });

  const orgs = useMemo(() => flattenPages(query.data), [query.data]);

  const loading =
    queryEnabled &&
    ((query.isPending && orgs.length === 0) ||
      (query.isFetching && orgs.length === 0 && !query.isFetchingNextPage));

  const loadMoreOrgs = useCallback(async () => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;
    await query.fetchNextPage();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  const refetch = useCallback(
    (_term?: string) => {
      void query.refetch();
    },
    [query.refetch],
  );

  const invalidateCache = useCallback(() => {
    if (!orgId) return;
    clearDiscoveryCache(orgId);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.discover.all(orgId),
    });
  }, [orgId, queryClient]);

  const mutateOrgStatus = useCallback(
    (targetOrgId: string, status: string) => {
      if (!orgId) return;
      queryClient.setQueriesData<InfiniteData<DiscoverListPage>>(
        { queryKey: queryKeys.discover.all(orgId) },
        (old) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              orgs: page.orgs.map((org) =>
                org.id === targetOrgId
                  ? { ...org, connection_status: status }
                  : org,
              ),
            })),
          };
        },
      );
    },
    [orgId, queryClient],
  );

  const errorMessage =
    query.error instanceof Error
      ? query.error.message.includes("discover_organizations")
        ? "Could not load — run db:push to deploy the migration"
        : query.error.message
      : query.error
        ? String(query.error)
        : null;

  return {
    orgs,
    loading,
    loadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    loadMoreOrgs,
    hasFetched: query.isFetched || orgs.length > 0,
    error: errorMessage,
    refetch,
    invalidateCache,
    mutateOrgStatus,
    setSearchTerm: (term: string) => {
      searchRef.current = term;
      setDebouncedSearch(term);
    },
  };
}
