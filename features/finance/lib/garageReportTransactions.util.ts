import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import type { GarrageViewTab } from "@/features/vehicles/components/GarrageTab";
import {
  buildTripPnLListForPeriod,
  buildVehiclePnLList,
  resolveVehicleIdForTrip,
} from "@/features/vehicles/pnl";
import { formatIndianVehicleNumber } from "@/lib/format";
import type { LedgerRow } from "../services/finance.service";
import type { EntityListFilter } from "../components/TreasurySummaryCard";
import { createReportRow } from "./reportRow.util";

export type BuildGarageReportTransactionsParams = {
  organizationId: string | null;
  tripRows: TripRow[];
  vehicleRows: VehicleRow[];
  ledgerTransactions: LedgerRow[] | null;
  garagePeriod: string;
  garageViewTab: GarrageViewTab;
  searchQuery: string;
  entityFilter: EntityListFilter;
  getVehicleNumberForTripId: (tripId: string | null) => string | null;
};

export function buildGarageReportTransactions({
  organizationId,
  tripRows,
  vehicleRows,
  ledgerTransactions,
  garagePeriod,
  garageViewTab,
  searchQuery,
  entityFilter,
  getVehicleNumberForTripId,
}: BuildGarageReportTransactionsParams): LedgerRow[] {
  const fallbackDate = new Date().toISOString();
  const q = searchQuery.trim().toLowerCase();

  const tripRowsForReport = buildTripPnLListForPeriod(
    tripRows,
    vehicleRows,
    ledgerTransactions,
    garagePeriod,
    getTripDisplayNumber,
  );
  const vehicleRowsForReport = buildVehiclePnLList(
    vehicleRows,
    tripRows,
    ledgerTransactions,
    null,
    null,
    garagePeriod,
    getTripDisplayNumber,
    organizationId,
  );

  const latestTripDateByVehicleId: Record<string, string> = {};
  const updateLatest = (
    map: Record<string, string>,
    key: string | null | undefined,
    value: string | null | undefined,
  ) => {
    if (!key || !value) return;
    if (!map[key] || value > map[key]) map[key] = value;
  };

  tripRows.forEach((trip) => {
    updateLatest(
      latestTripDateByVehicleId,
      resolveVehicleIdForTrip(trip, vehicleRows),
      trip.pickup_date ?? trip.created_at ?? fallbackDate,
    );
  });

  if (garageViewTab === "trips") {
    const filteredTripRows = tripRowsForReport.filter((row) => {
      if (!q) return true;
      const vehicleName =
        getVehicleNumberForTripId(row.id) ||
        (row.trip.vehicle_display_number
          ? formatIndianVehicleNumber(row.trip.vehicle_display_number)
          : "Unassigned");
      return (
        (row.missionId ?? "").toLowerCase().includes(q) ||
        (row.clientName ?? "").toLowerCase().includes(q) ||
        vehicleName.toLowerCase().includes(q)
      );
    });

    return filteredTripRows.map((row) => {
      const vehicleName =
        getVehicleNumberForTripId(row.id) ||
        (row.trip.vehicle_display_number
          ? formatIndianVehicleNumber(row.trip.vehicle_display_number)
          : "Unassigned");
      return createReportRow({
        id: `garage-trip-report-${row.id}`,
        organizationId,
        partyName: vehicleName,
        description: `${row.clientName} • ${row.origin} → ${row.dest}`,
        amountIn: Number(row.sales ?? 0),
        amountOut: Number(row.totalExpense ?? 0),
        transactionDate:
          row.trip.pickup_date ?? row.trip.created_at ?? fallbackDate,
        tripNumber: row.missionId,
        tripId: row.id,
      });
    });
  }

  let filteredVehicleRows = vehicleRowsForReport;
  if (garageViewTab === "revenue") {
    filteredVehicleRows = [...filteredVehicleRows].sort(
      (a, b) => b.sales - a.sales,
    );
  } else if (garageViewTab === "profit") {
    filteredVehicleRows = [...filteredVehicleRows].sort((a, b) => b.pnl - a.pnl);
  }
  if (q) {
    filteredVehicleRows = filteredVehicleRows.filter(
      (row) =>
        (row.name || "").toLowerCase().includes(q) ||
        (row.type || "").toLowerCase().includes(q),
    );
  }
  if (entityFilter === "has_due") {
    filteredVehicleRows = filteredVehicleRows.filter((row) => row.expense > 0);
  } else if (entityFilter === "no_due") {
    filteredVehicleRows = filteredVehicleRows.filter((row) => row.expense === 0);
  }

  return filteredVehicleRows.map((row) =>
    createReportRow({
      id: `garage-vehicle-report-${row.id}`,
      organizationId,
      partyName: row.name,
      description: `${row.type || "Vehicle"} • Trips ${row.trips} • P&L ₹${row.pnl.toLocaleString("en-IN")}`,
      amountIn: Number(row.sales ?? 0),
      amountOut: Number(row.expense ?? 0),
      transactionDate: latestTripDateByVehicleId[row.id] ?? fallbackDate,
      tripNumber: `${row.trips} trips`,
    }),
  );
}
