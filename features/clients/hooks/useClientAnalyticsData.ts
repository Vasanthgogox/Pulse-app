import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTransactionsByOrganization, type LedgerRow } from "@/features/finance";
import {
  getClientDetailBundle,
  getClientsByOrganization,
  type ClientRow,
} from "@/features/clients/services/clients.service";
import { getTripsForOrg, type TripRow } from "@/features/trips/services/trips.service";
import { buildUniqueLinkedOrgIdMap, isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";

export function useClientAnalyticsData(clientId: string) {
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const load = useCallback(() => {
    if (!clientId || !currentOrganization?.id || status === "restoring") {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;

    // Reuse Trips tab cache — avoid a second get_trips_for_org round-trip.
    const tripsPromise = queryClient.ensureQueryData({
      queryKey: queryKeys.trips.finite(orgId),
      queryFn: async () => {
        const res = await getTripsForOrg(orgId);
        if (res.error) throw res.error;
        return res.trips;
      },
    });

    Promise.all([
      getClientDetailBundle(orgId, clientId),
      tripsPromise,
      getTransactionsByOrganization(orgId),
      getClientsByOrganization(orgId),
    ])
      .then(([bundleRes, allTrips, txRes, clientsRes]) => {
        if (bundleRes.error) {
          setError(bundleRes.error.message);
          setClient(null);
          setTrips([]);
          setTransactions([]);
          return;
        }
        setClient(bundleRes.client ?? null);
        const allTx = (txRes.error ? [] : (txRes.transactions ?? [])) as LedgerRow[];
        const allClients = clientsRes.error ? [] : (clientsRes.clients ?? []);
        const clientDisplayName = (
          bundleRes.client?.name ||
          bundleRes.client?.contact_person ||
          ""
        )
          .toLowerCase()
          .trim();
        const normId = (id: string | null | undefined) =>
          id == null ? "" : String(id).trim().toLowerCase();
        const linkedOrgId = bundleRes.client?.linked_organization_id ?? null;
        const linkedClientIdByOrgId = buildUniqueLinkedOrgIdMap(allClients);
        const tripIdsFromClientTx = new Set(
          allTx
            .filter(
              (tx) =>
                tx.contact_type === "client" &&
                tx.contact_id === clientId &&
                tx.trip_id != null,
            )
            .map((tx) => normId(tx.trip_id)),
        );
        const forClient = allTrips.filter((trip) => {
          const matchesDirect =
            trip.client_id === clientId ||
            (clientDisplayName !== "" &&
              (trip.client_name || "").toLowerCase().trim() === clientDisplayName);
          const matchesTx = tripIdsFromClientTx.has(normId(trip.id));
          const matchesLinkedOrg =
            bundleRes.client?.is_integrated === true &&
            linkedOrgId &&
            isLoadBasedTrip(trip) &&
            trip.organization_id &&
            trip.organization_id === linkedOrgId &&
            linkedClientIdByOrgId.get(linkedOrgId) === clientId;
          return matchesDirect || matchesTx || matchesLinkedOrg;
        });
        setTrips(forClient);
        setTransactions(
          allTx.filter(
            (tx) =>
              tx.contact_type === "client" &&
              tx.contact_id != null &&
              tx.contact_id === clientId,
          ),
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load client analytics");
      })
      .finally(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [clientId, currentOrganization?.id, status, queryClient]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    load();
  }, [load]);

  const displayName =
    (client?.name || client?.contact_person || "").trim() || t("client");

  return {
    t,
    client,
    displayName,
    trips,
    transactions,
    orgId: currentOrganization?.id ?? null,
    loading,
    error,
    refreshing,
    refresh,
  };
}
