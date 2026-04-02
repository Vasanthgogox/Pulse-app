/**
 * TanStack Query hooks for trips. Cached by orgId; Realtime invalidates on DB change.
 * See docs/PAGINATION_AND_CACHE_ANALYSIS.md.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTripsByOrganization,
  getTripsWhereOrgIsSupplier,
  getShipperDisplayNamesForSupplierTrips,
} from '@/features/trips/services/trips.service';
import { queryKeys } from '@/lib/queryKeys';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

/** Merge owner trips + shared supplier-side load trips (dedupe by id), sort by created_at desc. */
function mergeTripsLists<T extends { id: string; created_at: string }>(
  ownerTrips: T[],
  supplierTrips: T[],
): T[] {
  const byId = new Map(ownerTrips.map((t) => [t.id, t]));
  for (const t of supplierTrips) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** Full list (no pagination). Use for Trips tab. Includes trips where org is owner or supplier on a shared load trip. */
export function useTripsQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.trips.all(orgId ?? ''),
    queryFn: async () => {
      const [ownerRes, supplierRes] = await Promise.all([
        getTripsByOrganization(orgId!),
        getTripsWhereOrgIsSupplier(orgId!),
      ]);
      if (ownerRes.error) throw ownerRes.error;
      if (supplierRes.error) throw supplierRes.error;
      return mergeTripsLists(ownerRes.trips, supplierRes.trips);
    },
    enabled: !!orgId,
  });
}

/** Map trip_id -> shipper display name for trips where current org is the supplier (Trips Control: show "Mukunt" not "Mukunt's client"). */
export function useShipperDisplayNamesQuery(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.trips.shipperNamesForSupplier(orgId ?? ''),
    queryFn: async () => {
      const res = await getShipperDisplayNamesForSupplierTrips(orgId!);
      if (res.error) throw res.error;
      return res.shipperNameByTripId;
    },
    enabled: !!orgId,
  });
}

/** Infinite list: first page on mount, load more on fetchNextPage. */
export function useTripsInfiniteQuery(orgId: string | null, opts?: { pageSize?: number }) {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: queryKeys.trips.all(orgId ?? ''),
    queryFn: async ({ pageParam = 0 }) => {
      const res = await getTripsByOrganization(orgId!, { limit: pageSize, offset: pageParam });
      if (res.error) throw res.error;
      return { trips: res.trips, hasMore: res.hasMore ?? false, nextOffset: pageParam + pageSize };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    initialPageParam: 0,
    enabled: !!orgId,
  });
}

export function useTripDetailQuery(tripId: string | null) {
  return useQuery({
    queryKey: queryKeys.trips.detail(tripId ?? ''),
    queryFn: async () => {
      const { getTripById } = await import('@/features/trips/services/trips.service');
      const res = await getTripById(tripId!);
      if (res.error) throw res.error;
      return res.trip;
    },
    enabled: !!tripId,
  });
}

/** Assignment audit for given trip ids (Private vs Shared). */
export function useAssignmentAuditQuery(tripIds: string[]) {
  const sorted = [...tripIds].sort();
  const key = sorted.join(',');
  return useQuery({
    queryKey: ['q', 'trips', 'assignment-audit', key],
    queryFn: async () => {
      const { getLatestAssignmentAuditByTripIds } = await import(
        '@/features/trips/services/trip-assignment-audit.service'
      );
      const res = await getLatestAssignmentAuditByTripIds(tripIds);
      if (res.error) throw res.error;
      return res.byTripId;
    },
    enabled: tripIds.length > 0,
  });
}

export function useInvalidateTrips() {
  const qc = useQueryClient();
  return (orgId: string) => qc.invalidateQueries({ queryKey: queryKeys.trips.all(orgId) });
}
