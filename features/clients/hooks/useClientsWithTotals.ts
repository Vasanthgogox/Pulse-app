/**
 * Reusable hook: fetch clients + trips for an org and compute client totals and trip summary.
 * Used by Clients tab and can be reused anywhere that needs clients with get/give totals.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getClientsByOrganization, type ClientRow } from '@/features/clients';
import { getTripsByOrganization, type TripRow } from '@/features/trips/services/trips.service';
import { computeClientTotals, computeTripSummary } from '@/features/clients/utils/totals.util';

export function useClientsWithTotals(organizationId: string | null, enabled: boolean) {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!organizationId || !enabled) {
      setLoading(false);
      setClients([]);
      setTrips([]);
      return;
    }
    setLoading(true);
    Promise.all([
      getClientsByOrganization(organizationId),
      getTripsByOrganization(organizationId),
    ]).then(([resClients, resTrips]) => {
      setClients(resClients.clients ?? []);
      setTrips(resTrips.trips ?? []);
      setLoading(false);
    });
  }, [organizationId, enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const { totalRevenue, totalCost } = useMemo(() => computeTripSummary(trips), [trips]);
  const clientTotals = useMemo(() => computeClientTotals(clients, trips), [clients, trips]);

  return {
    clients,
    trips,
    clientTotals,
    totalRevenue,
    totalCost,
    loading,
    refetch,
  };
}
