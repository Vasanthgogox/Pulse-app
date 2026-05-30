import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTransactionsByOrganization, type LedgerRow } from "@/features/finance";
import {
  getSupplierDetails,
  getSuppliersByOrganization,
  type SupplierRow,
} from "@/features/suppliers/services/suppliers.service";
import {
  getTripsByOrganization,
  getTripsWhereOrgIsClient,
  getTripsWhereOrgIsSupplier,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { getTripSubcontracts } from "@/features/finance/services/tripSubcontracts.service";
import { buildUniqueLinkedOrgIdMap, isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";

export function useSupplierAnalyticsData(supplierId: string) {
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const load = useCallback(() => {
    if (!supplierId || !currentOrganization?.id) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;

    const supplierPromise = getSupplierDetails(supplierId);
    const asClientPromise = supplierPromise.then((res) => {
      const linkedOrgId = res.supplier?.linked_organization_id ?? null;
      if (!linkedOrgId) return [] as TripRow[];
      return getTripsWhereOrgIsClient(orgId).then((r) => (r.error ? [] : (r.trips ?? [])));
    });
    const subcontractsPromise = getTripsWhereOrgIsSupplier(orgId).then(async (res) => {
      if (res.error) return { sharedTrips: [] as TripRow[], subcontracts: [] };
      const sharedTrips = res.trips ?? [];
      const tripIds = sharedTrips.map((trip) => trip.id);
      if (tripIds.length === 0) return { sharedTrips, subcontracts: [] };
      const subRes = await getTripSubcontracts({ viewerOrgId: orgId, tripIds });
      return { sharedTrips, subcontracts: subRes.error ? [] : subRes.rows };
    });

    Promise.all([
      supplierPromise,
      getTripsByOrganization(orgId),
      getTransactionsByOrganization(orgId),
      getSuppliersByOrganization(orgId),
      asClientPromise,
      subcontractsPromise,
    ])
      .then(([res, tripsRes, txRes, suppliersRes, asClientTrips, subRes]) => {
        if (res.error) {
          setError(res.error.message);
          setSupplier(null);
          setTrips([]);
          setTransactions([]);
          return;
        }
        const sup = res.supplier ?? null;
        setSupplier(sup);
        const allTrips = tripsRes.error ? [] : (tripsRes.trips ?? []);
        const supplierDisplayName = sup
          ? (sup.name || sup.company_name || sup.contact_person || "").trim().toLowerCase()
          : "";
        const linkedOrgId = sup?.linked_organization_id ?? null;
        const linkedSupplierIdByOrgId = buildUniqueLinkedOrgIdMap(
          suppliersRes.error ? [] : (suppliersRes.suppliers ?? []),
        );
        const fromOwned = allTrips.filter(
          (trip) =>
            trip.supplier_id === supplierId ||
            (!trip.supplier_id &&
              supplierDisplayName &&
              (trip.supplier_name ?? "").trim().toLowerCase() === supplierDisplayName),
        );
        const seen = new Set(fromOwned.map((trip) => trip.id));
        const merged: TripRow[] = [...fromOwned];
        const { sharedTrips, subcontracts } = subRes;
        const tripIdToSubcontract = new Map(subcontracts.map((s) => [s.trip_id, s]));
        for (const trip of sharedTrips) {
          const sub = tripIdToSubcontract.get(trip.id);
          if (sub && sub.supplier_id === supplierId) {
            if (!seen.has(trip.id)) {
              seen.add(trip.id);
              merged.push({ ...trip, supplier_rate: sub.rate });
            }
          } else if (
            trip.supplier_id === supplierId ||
            (!trip.supplier_id &&
              supplierDisplayName &&
              (trip.supplier_name ?? "").trim().toLowerCase() === supplierDisplayName)
          ) {
            if (!seen.has(trip.id)) merged.push(trip);
          }
        }
        if (linkedOrgId && Array.isArray(asClientTrips)) {
          for (const trip of asClientTrips) {
            if (
              isLoadBasedTrip(trip) &&
              trip.organization_id === linkedOrgId &&
              linkedSupplierIdByOrgId.get(linkedOrgId) === supplierId &&
              !seen.has(trip.id)
            ) {
              merged.push(trip);
            }
          }
        }
        setTrips(merged);
        const allTx = (txRes.error ? [] : (txRes.transactions ?? [])) as LedgerRow[];
        const normId = (id: string | null | undefined) =>
          id == null ? "" : String(id).trim().toLowerCase();
        setTransactions(
          allTx.filter(
            (tx) =>
              tx.contact_type === "supplier" &&
              tx.contact_id != null &&
              normId(tx.contact_id) === normId(supplierId),
          ),
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load supplier analytics");
      })
      .finally(() => {
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [supplierId, currentOrganization?.id]);

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
    (supplier?.name || supplier?.company_name || supplier?.contact_person || "").trim() ||
    t("supplier");

  return {
    t,
    supplier,
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
