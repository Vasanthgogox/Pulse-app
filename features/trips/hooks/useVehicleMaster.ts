import { useVehiclesQuery } from '@/lib/queries/useVehiclesQuery';
import type { VehicleRow } from '@/features/vehicles/services/vehicles.service';

/** Org vehicle master for reassignment pickers. */
export function useVehicleMaster(orgId: string | null) {
  const q = useVehiclesQuery(orgId);

  return {
    vehicles: (q.data ?? []) as VehicleRow[],
    isLoading: q.isPending,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
  };
}
