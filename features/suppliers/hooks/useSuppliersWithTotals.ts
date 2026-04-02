/**
 * Reusable hook: fetch suppliers + trips for an org and compute supplier totals and trip summary.
 * Used by Suppliers tab and can be reused anywhere that needs suppliers with give totals.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSuppliersByOrganization, type SupplierRow } from '@/features/suppliers';
import { getTripsByOrganization, type TripRow } from '@/features/trips/services/trips.service';
import {
  computeSupplierTotalsFromTrips,
  computeTripSummary,
} from '@/features/suppliers/utils/totals.util';

export function useSuppliersWithTotals(organizationId: string | null) {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    if (!organizationId) {
      setLoading(false);
      setError(null);
      setSuppliers([]);
      setTrips([]);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      getSuppliersByOrganization(organizationId),
      getTripsByOrganization(organizationId),
    ]).then(([resSuppliers, resTrips]) => {
      if (resSuppliers.error) {
        setError(resSuppliers.error.message);
        setSuppliers([]);
      } else {
        setSuppliers(resSuppliers.suppliers ?? []);
      }
      setTrips(resTrips.trips ?? []);
      setLoading(false);
    });
  }, [organizationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const { totalRevenue, totalCost } = useMemo(() => computeTripSummary(trips), [trips]);
  const supplierTotals = useMemo(() => computeSupplierTotalsFromTrips(trips), [trips]);

  return {
    suppliers,
    trips,
    supplierTotals,
    totalRevenue,
    totalCost,
    loading,
    error,
    refetch,
  };
}
