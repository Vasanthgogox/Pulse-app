/**
 * Vehicle finance analytics — thin wrapper for embedded tab / full screen.
 */
import type { LedgerRow } from "@/features/finance";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { VehicleRow } from "../../services/vehicles.service";
import type { MissionRow } from "./analyticsUtils";
import { VehicleFinanceAnalyticsDashboard } from "./VehicleFinanceAnalyticsDashboard";

interface Props {
  missionRows: MissionRow[];
  vehicleTrips: TripRow[];
  vehicleTransactions: LedgerRow[];
  vehicle: VehicleRow | null;
  orgId: string | null;
}

export default function VehicleAnalyticsTab({
  missionRows,
  vehicleTrips,
  vehicleTransactions,
  vehicle,
  orgId,
}: Props) {
  return (
    <VehicleFinanceAnalyticsDashboard
      vehicle={vehicle}
      missionRows={missionRows}
      trips={vehicleTrips}
      transactions={vehicleTransactions}
      orgId={orgId}
      embedded
    />
  );
}
