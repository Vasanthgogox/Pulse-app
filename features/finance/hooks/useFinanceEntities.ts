/**
 * Loads and holds all entity data for the Finance screen from TanStack Query cache.
 * Single source of truth: clients, trips, suppliers, vehicles, drivers, etc. read from cache.
 * No duplicate fetch on sub-tab change; refreshKey no longer triggers refetch (cache staleTime handles refocus).
 */
import type { PartyOption, TripOption } from "@/components/modals/AddTransactionModal";
import { type ClientRow } from "@/features/clients/services/clients.service";
import { type DriverOffer, type DriverRow } from "@/features/drivers/services/drivers.service";
import type { DirectQuoteRow } from "@/features/indents/services/direct-quotes.service";
import type { IndentRow } from "@/features/indents/services/indents.service";
import { type SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { getTripDisplayNumber, type TripRow } from "@/features/trips";
import { isLoadBasedTrip } from "@/features/trips/visibility/tripVisibility";
import { getAvailablePeriodOptions } from "@/features/vehicles/pnl";
import { type VehicleRow } from "@/features/vehicles/services/vehicles.service";
import { formatLedgerDate } from "@/lib/format";
import type { ConnectionRequestRow } from "@/features/network/services/connection-requests.service";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salary-requests.service";
import {
  useAcceptedDirectQuotesForFinanceQuery,
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
} from "@/lib/queries";
import { useEffect, useMemo, useRef, useState } from "react";

export interface UseFinanceEntitiesArgs {
  organizationId: string | null;
  canAccess: boolean;
  /** No longer triggers refetch; kept for API compatibility. Cache handles staleness. */
  refreshKey?: number;
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
  suppliersList: { id: string; name: string }[];
  vehicleRows: VehicleRow[];
  driverRows: DriverRow[];
  driverOffers: Record<string, DriverOffer>;
  connectionRequestsSent: ConnectionRequestRow[];
  pendingDriverSalaryRequests: SalaryRequestWithDriverRow[];
  entitiesLoading: boolean;
  garagePeriodOptions: { value: string; label: string }[];
  /** Pending/quoted/awarded indents for finance aggregation (pre-trip amount visibility). */
  indentsForFinance: IndentRow[];
  /** Accepted direct quotes on this org's indents (supplier awarded, pre-deploy). */
  acceptedDirectQuotes: DirectQuoteRow[];
  setPendingDriverSalaryRequests: React.Dispatch<
    React.SetStateAction<SalaryRequestWithDriverRow[]>
  >;
}

export function useFinanceEntities({
  organizationId,
  canAccess,
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
  const { data: acceptedDirectQuotes = [], isPending: acceptedQuotesLoading } =
    useAcceptedDirectQuotesForFinanceQuery(orgId);
  const { data: salaryRequestsFromQuery = [] } = useSalaryRequestsQuery(orgId, "pending");

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
    indentsForFinanceLoading ||
    acceptedQuotesLoading;

  const clients = useMemo(
    () =>
      clientRows.map((c) => ({
        id: c.id,
        name: c.name || c.contact_person || "",
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
      })),
    [tripRows]
  );

  const loadBoardOnlyTripsAsClient = useMemo(
    () => tripsWhereOrgIsClient.filter((t) => isLoadBasedTrip(t)),
    [tripsWhereOrgIsClient]
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
      })),
    [supplierRows]
  );

  const garagePeriodOptions = useMemo(
    () => getAvailablePeriodOptions(tripRows),
    [tripRows]
  );

  return {
    clients,
    clientRows,
    trips,
    tripRows,
    tripsWhereOrgIsClient: loadBoardOnlyTripsAsClient,
    tripsWhereOrgIsSupplier,
    supplierRows,
    suppliersList,
    vehicleRows,
    driverRows,
    driverOffers,
    connectionRequestsSent,
    pendingDriverSalaryRequests,
    entitiesLoading,
    indentsForFinance,
    acceptedDirectQuotes,
    garagePeriodOptions,
    setPendingDriverSalaryRequests,
  };
}
