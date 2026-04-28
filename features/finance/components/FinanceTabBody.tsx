/**
 * Renders the body of the selected finance tab: Ledger, Customers, Suppliers, Garage, or Drivers.
 */
import type { TripOption } from "@/components/AddTransactionModal";
import { CustomersTab } from "@/features/clients/components/CustomersTab";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { DriversTab } from "@/features/drivers/components/DriversTab";
import type {
    DriverOffer,
    DriverRow,
} from "@/features/drivers/services/drivers.service";
import type { IndentRow } from "@/features/indents/services/indents.service";
import { SuppliersTab } from "@/features/suppliers/components/SuppliersTab";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips";
import type { GarrageViewTab } from "@/features/vehicles/components/GarrageTab";
import { GarrageTab } from "@/features/vehicles/components/GarrageTab";
import type { VehicleRow } from "@/features/vehicles/services/vehicles.service";
import type { ConnectionRequestRow } from "@/services/connectionRequestsService";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import type { ReactNode } from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import type { LedgerRow } from "../services/finance.service";
import type { FinanceSubTab } from "../types";
import type { TripAdjustment } from "@/features/trips/services/tripAdjustments";
import { styles } from "./FinanceScreen.styles";
import { FinanceKanbanTab } from "./FinanceKanbanTab";
import type { FinancialRowData } from "./FinancialRow";
import { LedgerTab } from "./LedgerTab";
import type { EntityListFilter } from "./TreasurySummaryCard";

export interface FinanceTabBodyProps {
  financeSubTab: FinanceSubTab;
  organizationId: string | null;
  /** Ledger tab */
  ledgerLoading: boolean;
  ledgerTransactions: LedgerRow[] | null;
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
  /** Entity tabs */
  clientRows: ClientRow[];
  tripRows: TripRow[];
  supplierRows: SupplierRow[];
  tripsWhereOrgIsClient: TripRow[];
  /** Trips from other orgs where this org is the supplier; merged into Customers tab aggregation. */
  tripsWhereOrgIsSupplier?: TripRow[];
  /** Pre-trip indents for finance aggregation (pending/quoted/awarded). */
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
  /** Garage */
  garagePeriod: string;
  onGaragePeriodChange: (v: string) => void;
  garageViewTab: GarrageViewTab;
  onGarageViewTabChange: (v: GarrageViewTab) => void;
  onTripSelect: (tripId: string) => void;
  /** Called when user taps Add entry (Cash tab or Ledger empty state). */
  onAddTransactionPress?: () => void;
  topContent?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottomInset?: number;
  profileImages: Record<string, string>;
  linkedOrgDisplayMap: Record<string, LinkedOrgDisplay>;
  /** Loaded trip finance adjustments (undefined while loading — aggregation uses raw rates). */
  tripFinanceAdjustmentsByTripId?: Record<string, TripAdjustment[]>;
}

export function FinanceTabBody({
  financeSubTab,
  organizationId: orgId,
  ledgerLoading,
  ledgerTransactions,
  filteredLedgerForDisplay,
  ledgerRefreshKey,
  onLedgerRowSelect,
  getVehicleNumberForTripId,
  tripOptions: trips,
  tripDetailsMap,
  onLedgerMissionChange,
  clientRows,
  tripRows,
  supplierRows,
  tripsWhereOrgIsClient,
  tripsWhereOrgIsSupplier,
  indentsForFinance,
  vehicleRows,
  driverRows,
  driverOffers,
  entitiesLoading,
  onTabTotals,
  onEntityRowSelect,
  searchQuery,
  entityFilter,
  connectionRequestsSent,
  tripPartyMap,
  garagePeriod,
  onGaragePeriodChange,
  garageViewTab,
  onGarageViewTabChange,
  onTripSelect,
  onAddTransactionPress,
  topContent,
  refreshing = false,
  onRefresh,
  bottomInset = 120,
  profileImages,
  linkedOrgDisplayMap,
  tripFinanceAdjustmentsByTripId,
}: FinanceTabBodyProps) {
  const { width: windowWidth } = useWindowDimensions();
  // Kanban only for Web desktop (large screens); mobile/native/tablet uses standard list
  const isWebLargeScreen = Platform.OS === 'web' && windowWidth >= 1024;

  if (financeSubTab === "cash") {
    if (isWebLargeScreen) {
      return (
        <View style={styles.tableBodyWrap}>
          {ledgerLoading && ledgerTransactions === null ? (
            <Text style={styles.ledgerLoading}>Loading…</Text>
          ) : (
            <FinanceKanbanTab
              transactions={filteredLedgerForDisplay}
              getVehicleNumberForTripId={getVehicleNumberForTripId}
              tripDetailsMap={tripDetailsMap}
              clientRows={clientRows}
              supplierRows={supplierRows}
              driverRows={driverRows}
              tripPartyMap={tripPartyMap}
              linkedOrgDisplayMap={linkedOrgDisplayMap}
              onRowSelect={(row) => {
                if (row.trip_id) {
                  onTripSelect(row.trip_id);
                }
              }}
              profileImages={profileImages}
            />
          )}
        </View>
      );
    }
    return (
      <View style={styles.tableBodyWrap}>
        {ledgerLoading && ledgerTransactions === null ? (
          <Text style={styles.ledgerLoading}>Loading…</Text>
        ) : (
        <LedgerTab
          organizationId={orgId}
          refreshKey={ledgerRefreshKey}
          transactions={
            ledgerTransactions !== null ? filteredLedgerForDisplay : undefined
          }
          viewMode="transaction"
          showFiscalSubTabs={false}
          onRowSelect={onLedgerRowSelect}
          onEntitySelect={() => {}}
          getVehicleNumberForTripId={getVehicleNumberForTripId}
          tripOptions={trips}
          tripDetailsMap={tripDetailsMap}
          onMissionChange={onLedgerMissionChange}
          onAddTransactionPress={onAddTransactionPress}
          clientRows={clientRows}
          supplierRows={supplierRows}
          driverRows={driverRows}
          driverProfileImageUrls={profileImages}
          tripPartyMap={tripPartyMap}
          linkedOrgDisplayMap={linkedOrgDisplayMap}
        />
        )}
      </View>
    );
  }

  if (financeSubTab === "customers") {
    return (
      <CustomersTab
        organizationId={orgId}
        clients={clientRows}
        trips={tripRows}
        tripsWhereOrgIsSupplier={tripsWhereOrgIsSupplier}
        indents={indentsForFinance}
        transactions={ledgerTransactions ?? undefined}
        parentLoading={entitiesLoading}
        onTotals={onTabTotals}
        onRowSelect={onEntityRowSelect}
        searchQuery={searchQuery}
        entityFilter={entityFilter}
        pendingClientInvites={connectionRequestsSent.filter(
          (r) => r.request_shipper_client && r.status === "pending",
        )}
        tripPartyMap={tripPartyMap}
        ledgerRows={filteredLedgerForDisplay}
        tripDetailsMap={tripDetailsMap}
        tripOptions={trips}
        onMissionChange={onLedgerMissionChange}
        topContent={topContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        bottomInset={bottomInset}
        tripFinanceAdjustmentsByTripId={tripFinanceAdjustmentsByTripId}
        hideSummaryRow={isWebLargeScreen}
      />
    );
  }

  if (financeSubTab === "suppliers") {
    return (
      <SuppliersTab
        organizationId={orgId}
        suppliers={supplierRows}
        trips={tripRows}
        tripsWhereOrgIsClient={tripsWhereOrgIsClient}
        transactions={ledgerTransactions ?? undefined}
        parentLoading={entitiesLoading}
        onTotals={onTabTotals}
        onRowSelect={onEntityRowSelect}
        searchQuery={searchQuery}
        entityFilter={entityFilter}
        pendingSupplierInvites={connectionRequestsSent.filter(
          (r) => r.request_carrier_supplier && r.status === "pending",
        )}
        tripPartyMap={tripPartyMap}
        topContent={topContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        bottomInset={bottomInset}
        tripFinanceAdjustmentsByTripId={tripFinanceAdjustmentsByTripId}
        hideSummaryRow={isWebLargeScreen}
      />
    );
  }

  if (financeSubTab === "garage") {
    return (
      <GarrageTab
        organizationId={orgId}
        vehicles={vehicleRows}
        drivers={driverRows}
        trips={tripRows}
        transactions={ledgerTransactions ?? undefined}
        parentLoading={entitiesLoading}
        onTotals={onTabTotals}
        onRowSelect={onEntityRowSelect}
        garagePeriod={garagePeriod}
        onGaragePeriodChange={onGaragePeriodChange}
        viewTab={garageViewTab}
        onViewTabChange={onGarageViewTabChange}
        searchQuery={searchQuery}
        entityFilter={entityFilter}
        onTripSelect={onTripSelect}
        topContent={topContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        bottomInset={bottomInset}
        hideSummaryRow={isWebLargeScreen}
      />
    );
  }

  return (
    <DriversTab
      organizationId={orgId}
      drivers={driverRows}
      trips={tripRows}
      transactions={ledgerTransactions ?? undefined}
      driverOffers={
        Object.keys(driverOffers).length > 0 ? driverOffers : undefined
      }
      parentLoading={entitiesLoading}
      onTotals={onTabTotals}
      onRowSelect={onEntityRowSelect}
      searchQuery={searchQuery}
      entityFilter={entityFilter}
      tripPartyMap={tripPartyMap}
      vehicles={vehicleRows}
      topContent={topContent}
      refreshing={refreshing}
      onRefresh={onRefresh}
      bottomInset={bottomInset}
      hideSummaryRow={isWebLargeScreen}
    />
  );
}
