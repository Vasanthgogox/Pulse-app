/**
 * Loads and holds all entity data for the Finance screen from TanStack Query cache.
 * Single source of truth: clients, trips, suppliers, vehicles, drivers, etc. read from cache.
 * No duplicate fetch on sub-tab change; refreshKey no longer triggers refetch (cache staleTime handles refocus).
 */
import type { PartyOption, TripOption } from "@/components/AddTransactionModal";
import { type ClientRow } from "@/features/clients/services/clients.service";
import { type DriverOffer, type DriverRow } from "@/features/drivers/services/drivers.service";
import type { IndentRow } from "@/features/indents/services/indents.service";
import { type SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { getTripDisplayNumber, type TripRow } from "@/features/trips/services/trips.service";
import { type VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { formatLedgerDate } from "@/lib/format";
import type { ConnectionRequestRow } from "@/features/connections/services/connectionRequests.service";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import {
  useClientsQuery,
  useConnectionRequestsSentQuery,
  useDriverOffersQuery,
  useDriversQuery,
  useIndentsForFinanceQuery,
  useSalaryRequestsQuery,
  useSuppliersQuery,
  useTripsQuery,
  useTripsWhereOrgIsClientQuery,
  useTripsWhereOrgIsSupplierQuery,
  useVehiclesQuery,
  useTripSubcontractsQuery,
} from "@/lib/queries";
import { useEffect, useMemo, useRef, useState } from "react";

export interface UseFinanceEntitiesArgs {
  organizationId: string | null;
  canAccess: boolean;
  /** No longer triggers refetch; kept for API compatibility. Cache handles staleness. */
  refreshKey?: number;
  /** Loads vehicles/pnl period helpers only when the garage tab needs them. */
  includeGaragePeriodOptions?: boolean;
}

export interface UseFinanceEntitiesResult {
  clients: PartyOption[];
  clientRows: ClientRow[];
  trips: TripOption[];
  tripRows: TripRow[];
  tripsWhereOrgIsClient: TripRow[];
  /** Trips from other orgs where this org is the supplier/carrier (load-board + direct trips). */
  tripsWhereOrgIsSupplier: TripRow[];
  supplierRows: SupplierRow[];
  suppliersList: PartyOption[];
  vehicleRows: VehicleRow[];
  driverRows: DriverRow[];
  driverOffers: Record<string, DriverOffer>;
  connectionRequestsSent: ConnectionRequestRow[];
  pendingDriverSalaryRequests: SalaryRequestWithDriverRow[];
  entitiesLoading: boolean;
  garagePeriodOptions: { value: string; label: string }[];
  /** Pending/quoted/awarded indents for finance aggregation (pre-trip customer billing visibility). */
  indentsForFinance: IndentRow[];
  setPendingDriverSalaryRequests: React.Dispatch<
    React.SetStateAction<SalaryRequestWithDriverRow[]>
  >;
}

export function useFinanceEntities({
  organizationId,
  canAccess,
  includeGaragePeriodOptions = false,
}: UseFinanceEntitiesArgs): UseFinanceEntitiesResult {
  const orgId = canAccess ? organizationId : null;

  const { data: clientRows = [], isPending: clientsLoading } = useClientsQuery(orgId);
  const { data: tripRows = [], isPending: tripsLoading } = useTripsQuery(orgId);
  const { data: supplierRows = [], isPending: suppliersLoading } = useSuppliersQuery(orgId);
  const { data: vehicleRows = [], isPending: vehiclesLoading } = useVehiclesQuery(orgId);
  const { data: driverRows = [], isPending: driversLoading } = useDriversQuery(orgId);
  const { data: driverOffers = {}, isPending: offersLoading } = useDriverOffersQuery(orgId);
  const { data: connectionRequestsSent = [], isPending: connLoading } =
    useConnectionRequestsSentQuery(orgId);
  const { data: tripsWhereOrgIsClient = [], isPending: tripsAsClientLoading } =
    useTripsWhereOrgIsClientQuery(orgId);
  const { data: tripsWhereOrgIsSupplier = [], isPending: tripsAsSupplierLoading } =
    useTripsWhereOrgIsSupplierQuery(orgId);
  const { data: indentsForFinance = [], isPending: indentsForFinanceLoading } =
    useIndentsForFinanceQuery(orgId);
  const { data: salaryRequestsFromQuery = [] } = useSalaryRequestsQuery(orgId, "pending");

  const tripIdsWhereOrgIsSupplier = useMemo(
    () => tripsWhereOrgIsSupplier.map((t) => t.id),
    [tripsWhereOrgIsSupplier]
  );
  const shouldLoadTripSubcontracts = !!orgId && tripIdsWhereOrgIsSupplier.length > 0;
  
  const { data: tripSubcontracts = [], isPending: subcontractsLoading } = 
    useTripSubcontractsQuery(orgId, tripIdsWhereOrgIsSupplier);

  const tripsWhereOrgIsSupplierWithSubcontracts = useMemo(() => {
    if (!tripSubcontracts.length) return tripsWhereOrgIsSupplier;
    const subMap = new Map(tripSubcontracts.map(s => [s.trip_id, s]));
    return tripsWhereOrgIsSupplier.map(t => {
      const sub = subMap.get(t.id);
      if (sub) {
        return { ...t, supplier_id: sub.supplier_id, supplier_rate: sub.rate };
      }
      return t;
    });
  }, [tripsWhereOrgIsSupplier, tripSubcontracts]);

  const [pendingDriverSalaryRequests, setPendingDriverSalaryRequests] = useState<
    SalaryRequestWithDriverRow[]
  >([]);

  const prevSalaryIdsKeyRef = useRef<string>("");
  useEffect(() => {
    const key = salaryRequestsFromQuery.map((r) => r.id).sort().join(",");
    if (key === prevSalaryIdsKeyRef.current) return;
    prevSalaryIdsKeyRef.current = key;
    setPendingDriverSalaryRequests(salaryRequestsFromQuery);
  }, [salaryRequestsFromQuery]);

  const entitiesLoading =
    clientsLoading ||
    tripsLoading ||
    suppliersLoading ||
    vehiclesLoading ||
    driversLoading ||
    offersLoading ||
    connLoading ||
    tripsAsClientLoading ||
    tripsAsSupplierLoading ||
    (shouldLoadTripSubcontracts && subcontractsLoading) ||
    indentsForFinanceLoading;

  const clients = useMemo(
    () =>
      clientRows.map((c) => ({
        id: c.id,
        name: c.name || c.contact_person || "",
        linked_organization_id: c.linked_organization_id ?? null,
        is_integrated: c.is_integrated === true,
        avatar_url: c.avatar_url ?? null,
        avatar_seed: c.avatar_seed ?? null,
      })),
    [clientRows]
  );

  const trips = useMemo(
    () =>
      tripRows.map((t) => ({
        id: t.id,
        trip_number: getTripDisplayNumber(t),
        client_id: t.client_id ?? null,
        client_name: t.client_name ?? null,
        supplier_id: t.supplier_id ?? null,
        driver_id: t.driver_id ?? null,
        vehicle_id: t.vehicle_id ?? null,
        indent_id: t.indent_id ?? null,
        route_label:
          [t.pickup_area, t.drop_location].filter(Boolean).join(" → ") || null,
        trip_date: formatLedgerDate(t.pickup_date || t.created_at),
        organization_id: t.organization_id ?? null,
        supplier_name: t.supplier_name ?? null,
        driver_display_name: t.driver_display_name ?? null,
        client_price: t.client_price ?? null,
        supplier_rate: t.supplier_rate ?? null,
        driver_commission: t.driver_commission ?? null,
        distance: t.distance ?? null,
        is_cross_org_supplier: false,
        trip_payout_mode: t.trip_payout_mode ?? null,
        status: t.status ?? null,
        completed_at: t.completed_at ?? null,
      })),
    [tripRows]
  );

  const suppliersList = useMemo(
    () =>
      supplierRows.map((s) => ({
        id: s.id,
        name:
          (s.company_name ||
            (s as { name?: string }).name ||
            s.contact_person ||
            ""),
        linked_organization_id: s.linked_organization_id ?? null,
        supplier_type: s.supplier_type ?? null,
        avatar_url: s.avatar_url ?? null,
        avatar_seed: s.avatar_seed ?? null,
      })),
    [supplierRows]
  );

  const [garagePeriodOptions, setGaragePeriodOptions] = useState<
    { value: string; label: string }[]
  >([]);

  useEffect(() => {
    if (
      (includeGaragePeriodOptions && tripRows.length > 0) ||
      garagePeriodOptions.length === 0
    ) {
      return;
    }
    setGaragePeriodOptions([]);
  }, [
    includeGaragePeriodOptions,
    tripRows.length,
    garagePeriodOptions.length,
  ]);

  useEffect(() => {
    if (!includeGaragePeriodOptions || tripRows.length === 0) {
      return;
    }
    let cancelled = false;
    void import("@/features/vehicles/pnl").then(({ getAvailablePeriodOptions }) => {
      if (!cancelled) {
        const next = getAvailablePeriodOptions(tripRows) ?? [];
        setGaragePeriodOptions((prev) => {
          if (
            prev.length === next.length &&
            prev.every(
              (opt, idx) =>
                opt.value === next[idx]?.value && opt.label === next[idx]?.label,
            )
          ) {
            return prev;
          }
          return next;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [includeGaragePeriodOptions, tripRows]);

  return {
    clients,
    clientRows,
    trips,
    tripRows,
    // Keep full partner-owned client-perspective set (load + aggregate) so shared-ledger
    // and supplier remap can include cross-org aggregate trips too.
    tripsWhereOrgIsClient,
    tripsWhereOrgIsSupplier: tripsWhereOrgIsSupplierWithSubcontracts,
    supplierRows,
    suppliersList,
    vehicleRows,
    driverRows,
    driverOffers,
    connectionRequestsSent,
    pendingDriverSalaryRequests,
    entitiesLoading,
    indentsForFinance,
    garagePeriodOptions,
    setPendingDriverSalaryRequests,
  };
}
