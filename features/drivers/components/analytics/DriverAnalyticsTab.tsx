/**
 * Driver finance analytics — thin wrapper for embedded tab / full screen.
 */
import type { SalaryRequestRow } from "@/features/drivers/services/salaryRequests.service";
import type { DriverRow } from "../../services/drivers.service";
import type { LedgerRow } from "@/features/finance";
import type { RatingRow } from "@/features/ratings";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { DriverOffer } from "./driverAnalyticsUtils";
import { DriverFinanceAnalyticsDashboard } from "./DriverFinanceAnalyticsDashboard";

interface Props {
  trips: TripRow[];
  driverTransactions: LedgerRow[];
  driverRequests: SalaryRequestRow[];
  driver: DriverRow | null;
  driverOffer: DriverOffer | null;
  driverRatings: RatingRow[];
  orgId: string | null;
}

export default function DriverAnalyticsTab(props: Props) {
  return <DriverFinanceAnalyticsDashboard {...props} embedded />;
}
