import { useMemo } from 'react';
import { useDriversQuery } from '@/lib/queries/useDriversQuery';
import type { DriverRow } from '@/features/drivers/services/drivers.service';

/**
 * Org driver master for reassignment pickers (excludes left + tracking-only rows).
 */
export function useDriverMaster(orgId: string | null) {
  const q = useDriversQuery(orgId);

  const drivers = useMemo(() => {
    const rows = q.data ?? [];
    return rows.filter((d) => !d.left_at && d.tracking_only !== true) as DriverRow[];
  }, [q.data]);

  return {
    drivers,
    isLoading: q.isPending,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
  };
}
