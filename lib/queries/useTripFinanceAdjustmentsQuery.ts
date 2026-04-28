/**
 * Batches load of `trip_finance_adjustments` for finance aggregation and entity trip rows.
 */
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import {
  fetchTripFinanceAdjustmentsByTripIds,
  normTripFinanceAdjustmentKey,
} from "@/features/trips/services/tripAdjustments";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

function sortedTripIdsKey(ids: string[]): string {
  const u = [...new Set(ids.filter(Boolean).map((id) => String(id)))];
  u.sort();
  return u.join("|");
}

export function tripFinanceAdjustmentsQueryOptions(
  organizationId: string | null | undefined,
  tripIds: string[],
) {
  const filteredIds = [...new Set(tripIds.filter(Boolean).map((id) => String(id)))];
  const sortedKey = sortedTripIdsKey(filteredIds);
  return {
    queryKey: [...queryKeys.tripFinanceAdjustmentsRoot, organizationId ?? "", sortedKey] as const,
    queryFn: () => fetchTripFinanceAdjustmentsByTripIds(filteredIds),
    enabled: !!organizationId && filteredIds.length > 0,
    staleTime: 60_000,
  };
}

export function useTripFinanceAdjustmentsMap(
  organizationId: string | null | undefined,
  tripIds: string[],
) {
  const filteredIds = useMemo(
    () => [...new Set(tripIds.filter(Boolean).map((id) => String(id)))],
    [tripIds],
  );

  const q = useQuery({
    ...tripFinanceAdjustmentsQueryOptions(organizationId, filteredIds),
  });

  const record = useMemo<Record<string, TripAdjustment[]>>(() => {
    const m = q.data;
    if (!m || m.size === 0) return {};
    const rec: Record<string, TripAdjustment[]> = {};
    for (const [k, v] of m) {
      if (v.length) rec[k] = v;
    }
    return rec;
  }, [q.data]);

  return {
    map: q.data ?? null,
    record,
    isLoading: q.isPending,
    refetch: q.refetch,
  };
}

export function useInvalidateTripFinanceAdjustments() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: [...queryKeys.tripFinanceAdjustmentsRoot] });
  }, [qc]);
}

/** Lookup adjustments for a trip id using the record from {@link useTripFinanceAdjustmentsMap}. */
export function adjustmentsForTripId(
  record: Record<string, TripAdjustment[]> | undefined,
  tripId: string | null | undefined,
): TripAdjustment[] {
  if (!record || !tripId) return [];
  return record[normTripFinanceAdjustmentKey(tripId)] ?? [];
}
