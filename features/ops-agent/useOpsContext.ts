/**
 * Fetches organization-scoped ops context (revenue, entities) for the Ops Agent.
 * Uses TanStack Query cache so data is shared with rest of app.
 */
import { useMemo } from "react";
import type { OpsContext } from "@/features/ops-agent/services/ops-agent.service";
import { formatIndianVehicleNumber } from "@/lib/format";
import {
  useClientsQuery,
  useDriversQuery,
  useSuppliersQuery,
  useTransactionsQuery,
  useVehiclesQuery,
} from "@/lib/queries";

export function useOpsContext(organizationId: string | undefined) {
  const orgId = organizationId ?? null;
  const { data: transactions = [] } = useTransactionsQuery(orgId);
  const { data: vehicles = [] } = useVehiclesQuery(orgId);
  const { data: drivers = [] } = useDriversQuery(orgId);
  const { data: clients = [] } = useClientsQuery(orgId);
  const { data: suppliers = [] } = useSuppliersQuery(orgId);

  return useMemo((): OpsContext | null => {
    if (!organizationId) return null;

    const totalIn = transactions.reduce((s, t) => s + (t.amount_in ?? 0), 0);
    const totalOut = transactions.reduce((s, t) => s + (t.amount_out ?? 0), 0);
    const net = totalIn - totalOut;
    const formatRupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

    const clientNames = clients.map((c) => c.name || c.contact_person || "").filter(Boolean);
    const supplierNames = suppliers.map(
      (s) => s.company_name || (s as { name?: string }).name || s.contact_person || ""
    ).filter(Boolean);
    const driverNames = drivers.map((d) => d.name ?? "").filter(Boolean);
    const vehicleNumbers = vehicles.map(
      (v) => formatIndianVehicleNumber(v.vehicle_number ?? "") || ""
    ).filter(Boolean);

    const revenueSummary = `Total amount in: ${formatRupee(totalIn)}. Total amount out: ${formatRupee(totalOut)}. Net: ${formatRupee(net)}. (${transactions.length} transactions.)`;
    const revenueTable = {
      headers: ["Metric", "Value"],
      rows: [
        ["Total In", formatRupee(totalIn)],
        ["Total Out", formatRupee(totalOut)],
        ["Net", formatRupee(net)],
        ["Transactions", String(transactions.length)],
      ],
    };

    const entityCounts = `Clients: ${clients.length}. Suppliers: ${suppliers.length}. Drivers: ${drivers.length}. Vehicles: ${vehicles.length}.`;
    const entityCountsTable = {
      headers: ["Entity", "Count"],
      rows: [
        ["Clients", String(clients.length)],
        ["Suppliers", String(suppliers.length)],
        ["Drivers", String(drivers.length)],
        ["Vehicles", String(vehicles.length)],
      ],
    };

    const vehicleSummary =
      vehicles.length === 0
        ? "No vehicles in the fleet."
        : `Total: ${vehicles.length}. ${vehicles
            .map(
              (v) =>
                `${formatIndianVehicleNumber(v.vehicle_number ?? "")}${v.vehicle_brand || v.vehicle_body_type ? ` (${[v.vehicle_brand, v.vehicle_body_type].filter(Boolean).join(", ")})` : ""}`
            )
            .join("; ")}.`;
    const vehicleTable =
      vehicles.length === 0
        ? undefined
        : {
            headers: ["Vehicle", "Details"],
            rows: vehicles.map((v) => [
              formatIndianVehicleNumber(v.vehicle_number ?? "") || "—",
              [v.vehicle_brand, v.vehicle_body_type].filter(Boolean).join(", ") || "—",
            ]),
          };

    const driverSummary =
      drivers.length === 0
        ? "No drivers."
        : `Total: ${drivers.length}. Names: ${drivers.map((d) => d.name ?? "—").join(", ")}.`;
    const driverTable =
      drivers.length === 0
        ? undefined
        : {
            headers: ["Driver"],
            rows: drivers.map((d) => [d.name ?? "—"]),
          };

    return {
      revenueSummary,
      revenueTable,
      entityCounts,
      entityCountsTable,
      vehicleSummary,
      vehicleTable,
      driverSummary,
      driverTable,
      availableClientNames: clientNames.length ? clientNames.join(", ") : "",
      availableSupplierNames: supplierNames.length ? supplierNames.join(", ") : "",
      availableDriverNames: driverNames.length ? driverNames.join(", ") : "",
      availableVehicleNumbers: vehicleNumbers.length ? vehicleNumbers.join(", ") : "",
    };
  }, [
    organizationId,
    transactions,
    vehicles,
    drivers,
    clients,
    suppliers,
  ]);
}
