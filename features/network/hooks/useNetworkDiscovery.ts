/**
 * Cached discover list with realtime invalidation and offline fallback.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  clearDiscoveryCache,
  getDiscoveryCache,
  getDiscoveryCacheStale,
  getDiscoverInvalidationCounter,
  hydrateDiscoveryCacheFromStorage,
  setDiscoveryCache,
  subscribeDiscoverInvalidation,
} from '@/features/network/lib/discoveryCache';
import {
  discoverOrganizations,
  type DiscoverOrg,
} from '@/features/network/services/discover.service';
import { useRealtimeDiscoverInvalidation } from '@/features/network/hooks/useRealtimeDiscoverInvalidation';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 40;

export type UseNetworkDiscoveryOptions = {
  orgId: string | null;
  search: string;
  enabled?: boolean;
};

export function useNetworkDiscovery({
  orgId,
  search,
  enabled = true,
}: UseNetworkDiscoveryOptions) {
  const [orgs, setOrgs] = useState<DiscoverOrg[]>([]);
  const [loading, setLoading] = useState(() => Boolean(orgId && enabled));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const isMountedRef = useRef(true);
  const searchRef = useRef(search);
  const orgIdRef = useRef(orgId);
  const fetchGenRef = useRef(0);
  const hydrateReadyRef = useRef<Promise<void> | null>(null);

  orgIdRef.current = orgId;
  searchRef.current = debouncedSearch;

  useEffect(() => {
    isMountedRef.current = true;
    hydrateReadyRef.current = hydrateDiscoveryCacheFromStorage();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchOrgs = useCallback(async (term: string, force = false) => {
    const currentOrgId = orgIdRef.current;
    if (!currentOrgId || !enabled) return;

    await hydrateReadyRef.current;

    if (!force) {
      const cached = getDiscoveryCache(currentOrgId, term);
      if (cached) {
        setOrgs(cached.data);
        setError(null);
        setHasFetched(true);
        setLoading(false);
        return;
      }
    }

    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);

    const { orgs: results, error: err } = await discoverOrganizations(
      currentOrgId,
      term,
      PAGE_SIZE,
      0,
    );

    if (!isMountedRef.current || gen !== fetchGenRef.current) return;

    setHasFetched(true);

    if (err) {
      const stale = getDiscoveryCacheStale(currentOrgId, term);
      if (stale) {
        setOrgs(stale.data);
        setError(null);
      } else {
        setError(
          err.message.includes('discover_organizations')
            ? 'Could not load — run db:push to deploy the migration'
            : err.message,
        );
        setOrgs([]);
      }
      setLoading(false);
      return;
    }

    setDiscoveryCache(currentOrgId, term, results);
    setOrgs(results);
    setHasMore(results.length >= PAGE_SIZE);
    setLoading(false);
    setError(null);
  }, [enabled]);

  const loadMoreOrgs = useCallback(async () => {
    const currentOrgId = orgIdRef.current;
    if (!currentOrgId || !enabled || loadingMore || !hasMore) return;

    const term = searchRef.current;
    const gen = fetchGenRef.current;
    setLoadingMore(true);

    const { orgs: results, error: err } = await discoverOrganizations(
      currentOrgId,
      term,
      PAGE_SIZE,
      orgs.length,
    );

    if (!isMountedRef.current || gen !== fetchGenRef.current) return;

    if (err) {
      setLoadingMore(false);
      return;
    }

    setOrgs((prev) => {
      const seen = new Set(prev.map((o) => o.id));
      const fresh = results.filter((o) => !seen.has(o.id));
      const merged = [...prev, ...fresh];
      setDiscoveryCache(currentOrgId, term, merged);
      // Stop paginating once a page yields no new orgs — offset drift from
      // concurrent inserts/removals can otherwise make results.length keep
      // hitting PAGE_SIZE while contributing nothing, looping forever.
      setHasMore(results.length >= PAGE_SIZE && fresh.length > 0);
      return merged;
    });
    setLoadingMore(false);
  }, [enabled, loadingMore, hasMore, orgs.length]);

  useEffect(() => {
    if (!orgId || !enabled) {
      setOrgs([]);
      setHasFetched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setHasMore(true);
    void fetchOrgs(debouncedSearch);
  }, [orgId, debouncedSearch, enabled, fetchOrgs]);

  const refetch = useCallback(
    (term?: string) => {
      const q = term ?? searchRef.current;
      void fetchOrgs(q, true);
    },
    [fetchOrgs],
  );

  // Re-fetch whenever clearDiscoveryCache() is called from anywhere (e.g. after
  // accepting/declining a connection request in the modal context).
  const invalidationCount = useSyncExternalStore(
    subscribeDiscoverInvalidation,
    getDiscoverInvalidationCounter,
    getDiscoverInvalidationCounter,
  );
  const prevInvalidationRef = useRef(invalidationCount);
  useEffect(() => {
    if (invalidationCount === prevInvalidationRef.current) return;
    prevInvalidationRef.current = invalidationCount;
    if (!orgId || !enabled) return;
    void fetchOrgs(searchRef.current, true);
  }, [invalidationCount, orgId, enabled, fetchOrgs]);

  useRealtimeDiscoverInvalidation(orgId, () => {
    void fetchOrgs(searchRef.current, true);
  });

  const invalidateCache = useCallback(() => {
    if (orgId) clearDiscoveryCache(orgId);
  }, [orgId]);

  const mutateOrgStatus = useCallback((targetOrgId: string, status: string) => {
    setOrgs((prev) =>
      prev.map((o) => (o.id === targetOrgId ? { ...o, connection_status: status } : o)),
    );
  }, []);

  return {
    orgs,
    loading,
    loadingMore,
    hasMore,
    loadMoreOrgs,
    hasFetched,
    error,
    refetch,
    invalidateCache,
    mutateOrgStatus,
    setSearchTerm: (term: string) => {
      searchRef.current = term;
      void fetchOrgs(term);
    },
  };
}
