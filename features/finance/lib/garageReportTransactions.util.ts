import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import type { GarrageViewTab } from "@/features/vehicles/components/GarrageTab";
import {
  buildTripPnLListForPeriod,
  buildVehiclePnLList,
} from "@/features/vehicles/pnl";
import { formatIndianVehicleNumber } from "@/lib/format";
import type { LedgerRow } from "../services/finance.service";
import type { EntityListFilter } from "../components/TreasurySummaryCard";
import type { EntityCustomReport } from "./entityDetailReports.util";
import {
  buildGarageTripRosterReport,
  buildGarageVehicleRosterReport,
} from "./partyRosterReport.util";

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

export function buildGarageRosterReport({
  organizationId,
  tripRows,
  vehicleRows,
  ledgerTransactions,
  garagePeriod,
  garageViewTab,
  searchQuery,
  entityFilter,
  getVehicleNumberForTripId,
}: BuildGarageReportTransactionsParams): EntityCustomReport {
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
    return buildGarageTripRosterReport(filteredTripRows);
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

  return buildGarageVehicleRosterReport(
    filteredVehicleRows.map((row) => ({
      name: formatIndianVehicleNumber(row.name) || row.name,
      trips: row.trips,
      sales: row.sales,
      expense: row.expense,
      pnl: row.pnl,
    })),
  );
}
