import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getTransactionsByOrganization,
  type LedgerRow,
} from "@/features/finance";
import {
  getTripsByOrganization,
  getTripsWhereOrgIsSupplier,
  getTripDisplayNumber,
  supplierRowToTripRow,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { formatLedgerDate, normalizeVehicleNumberForMatch } from "@/lib/format";
import { buildTripPnL, getExpenseLinesForTripPnL } from "@/features/vehicles/pnl";
import { getVehicleById, type VehicleRow } from "../services/vehicles.service";

export function useVehicleAnalyticsData(vehicleId: string) {
  const { t } = useLanguage();
  const { currentOrganization } = useOrganization();
  const [vehicle, setVehicle] = useState<VehicleRow | null>(null);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [transactions, setTransactions] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const load = useCallback(() => {
    if (!vehicleId || !currentOrganization?.id) {
      setLoading(false);
      return;
    }
    if (!isRefreshingRef.current && !initialLoadDoneRef.current) setLoading(true);
    setError(null);
    const orgId = currentOrganization.id;
    Promise.all([
      getVehicleById(orgId, vehicleId),
      getTripsByOrganization(orgId),
      getTripsWhereOrgIsSupplier(orgId),
      getTransactionsByOrganization(orgId),
    ]).then(([res, ownerRes, supplierRes, txRes]) => {
      if (res.error) {
        setError(res.error.message);
        setVehicle(null);
      } else {
        setVehicle(res.vehicle ?? null);
      }
      const ownerTrips = ownerRes.error ? [] : ownerRes.trips ?? [];
      const supplierTrips = supplierRes.error ? [] : (supplierRes.trips ?? []).map(supplierRowToTripRow);
      const byId = new Map(ownerTrips.map((trip) => [trip.id, trip]));
      for (const trip of supplierTrips) {
        if (!byId.has(trip.id)) byId.set(trip.id, trip);
      }
      setTrips(Array.from(byId.values()));
      setTransactions((txRes.error ? [] : (txRes.transactions ?? [])) as LedgerRow[]);
    }).finally(() => {
      setLoading(false);
      initialLoadDoneRef.current = true;
      isRefreshingRef.current = false;
      setRefreshing(false);
    });
  }, [vehicleId, currentOrganization?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const tripMatchesVehicle = useCallback(
    (trip: TripRow) => {
      if (trip.vehicle_id === vehicleId) return true;
      if (!vehicle) return false;
      const displayNum = (trip.vehicle_display_number ?? "").trim();
      if (!displayNum) return false;
      return (
        normalizeVehicleNumberForMatch(displayNum) ===
        normalizeVehicleNumberForMatch(vehicle.vehicle_number)
      );
    },
    [vehicleId, vehicle],
  );

  const vehicleTrips = useMemo(
    () => trips.filter(tripMatchesVehicle),
    [trips, tripMatchesVehicle],
  );

  const vehicleTransactions = useMemo(() => {
    const tripIds = new Set(vehicleTrips.map((trip) => trip.id));
    const targetVehicleNum = vehicle
      ? normalizeVehicleNumberForMatch(vehicle.vehicle_number)
      : null;
    return transactions.filter((tx) => {
      if (tx.trip_id != null && tripIds.has(tx.trip_id)) return true;
      if (targetVehicleNum && tx.vehicle_number) {
        return normalizeVehicleNumberForMatch(tx.vehicle_number) === targetVehicleNum;
      }
      return false;
    });
  }, [vehicleTrips, transactions, vehicle]);

  const vehicleTransactionsByTripId = useMemo(() => {
    const map = new Map<string, LedgerRow[]>();
    for (const trip of vehicleTrips) {
      map.set(
        trip.id,
        getTripLedgerEntries(vehicleTransactions, trip.id, getTripDisplayNumber(trip)),
      );
    }
    return map;
  }, [vehicleTrips, vehicleTransactions]);

  const missionRows = useMemo(() => {
    if (!vehicleTrips.length || !currentOrganization?.id) return [];
    const orgId = currentOrganization.id;
    return vehicleTrips.map((trip) => {
      const tripLedgerEntries = vehicleTransactionsByTripId.get(trip.id) ?? [];
      const pnl = buildTripPnL(trip, tripLedgerEntries, getTripDisplayNumber, true);
      const isSupplierTrip =
        String(trip.organization_id ?? "").trim() !== String(orgId).trim();
      const sales = isSupplierTrip ? Number(trip.supplier_rate ?? 0) : pnl.sales;
      const expense = isSupplierTrip
        ? pnl.totalExpense - Number(trip.supplier_rate ?? 0)
        : pnl.totalExpense;
      const profit = sales - expense;
      const margin = sales > 0 ? (profit / sales) * 100 : expense > 0 ? -100 : 0;
      return {
        trip: pnl.trip,
        missionId: pnl.missionId,
        route: `${pnl.origin} → ${pnl.dest}`.trim() || "—",
        sales,
        expense,
        profit,
        margin,
        expenseLines: getExpenseLinesForTripPnL(pnl.trip, tripLedgerEntries, true),
      };
    });
  }, [vehicleTrips, vehicleTransactionsByTripId, currentOrganization?.id]);

  const refresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    load();
  }, [load]);

  return {
    t,
    vehicle,
    vehicleTrips,
    vehicleTransactions,
    missionRows,
    orgId: currentOrganization?.id ?? null,
    loading,
    error,
    refreshing,
    refresh,
  };
}
