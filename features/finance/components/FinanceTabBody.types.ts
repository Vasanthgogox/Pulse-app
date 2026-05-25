import type { TripOption } from "@/components/AddTransactionModal";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type {
  DriverOffer,
  DriverRow,
} from "@/features/drivers/services/drivers.service";
import type { IndentRow } from "@/features/indents/services/indents.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import type { GarrageViewTab } from "@/features/vehicles/components/GarrageTab";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import type { ConnectionRequestRow } from "@/features/connections/services/connectionRequests.service";
import type { ReactNode } from "react";
import type { LedgerRow } from "../services/finance.service";
import type { FinanceSubTab } from "../types";
import type { FinancialRowData } from "./FinancialRow";
import type { EntityListFilter } from "./TreasurySummaryCard";

export interface FinanceTabBodyProps {
  financeSubTab: FinanceSubTab;
  organizationId: string | null;
  ledgerLoading: boolean;
  ledgerTransactions: LedgerRow[] | null;
  ledgerForEntityAggregation?: LedgerRow[] | null;
  filteredLedgerForDisplay: LedgerRow[];
  ledgerRefreshKey: number;
  onLedgerRowSelect: (data: FinancialRowData) => void;
  getVehicleNumberForTripId: (tripId: string | null) => string | null;
  tripOptions: TripOption[];
  tripDetailsMap?: Record<
    string,
    {
      trip_number: string;
      drop_location?: string;
      pickup_area?: string;
      client_name?: string;
      pickup_date?: string | null;
      vehicle_number?: string | null;
      client_price?: number | null;
      supplier_rate?: number | null;
      driver_commission?: number | null;
    }
  >;
  onLedgerMissionChange: (entryId: string, tripId: string) => void;
  clientRows: ClientRow[];
  tripRows: TripRow[];
  supplierRows: SupplierRow[];
  tripsWhereOrgIsClient: TripRow[];
  tripsWhereOrgIsSupplier?: TripRow[];
  indentsForFinance?: IndentRow[];
  vehicleRows: VehicleRow[];
  driverRows: DriverRow[];
  driverOffers: Record<string, DriverOffer>;
  entitiesLoading: boolean;
  onTabTotals: (totals: { totalIn: number; totalOut: number }) => void;
  onEntityRowSelect: (
    data: FinancialRowData,
    entityType: "CLIENT" | "SUPPLIER" | "VEHICLE" | "DRIVER",
    subTab: FinanceSubTab,
  ) => void;
  searchQuery: string;
  entityFilter: EntityListFilter;
  connectionRequestsSent: ConnectionRequestRow[];
  tripPartyMap: Record<
    string,
    {
      client_id?: string | null;
      supplier_id?: string | null;
      driver_id?: string | null;
    }
  >;
  garagePeriod: string;
  onGaragePeriodChange: (v: string) => void;
  garageViewTab: GarrageViewTab;
  onGarageViewTabChange: (v: GarrageViewTab) => void;
  onTripSelect: (tripId: string) => void;
  onAddTransactionPress?: () => void;
  topContent?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
  profileImages: Record<string, string>;
  linkedOrgDisplayMap: Record<string, LinkedOrgDisplay>;
  tripFinanceAdjustmentsByTripId?: Record<string, TripAdjustment[]>;
}
