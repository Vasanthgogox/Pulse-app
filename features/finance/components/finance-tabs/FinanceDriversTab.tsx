import { DriversTab } from "@/features/drivers/components/DriversTab";
import type { FinanceTabBodyProps } from "../FinanceTabBody.types";

export function FinanceDriversTab(props: FinanceTabBodyProps) {
  const {
    organizationId: orgId,
    driverRows,
    tripRows,
    ledgerTransactions,
    driverOffers,
    entitiesLoading,
    onTabTotals,
    onEntityRowSelect,
    searchQuery,
    entityFilter,
    tripPartyMap,
    vehicleRows,
    topContent,
    refreshing,
    onRefresh,
    bottomInset,
    financeSubTab,
  } = props;

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
      onRowSelect={(data, entityType) =>
        onEntityRowSelect(data, entityType, financeSubTab)
      }
      searchQuery={searchQuery}
      entityFilter={entityFilter}
      tripPartyMap={tripPartyMap}
      vehicles={vehicleRows}
      topContent={topContent}
      refreshing={refreshing}
      onRefresh={onRefresh}
      bottomInset={bottomInset}
      hideSummaryRow
    />
  );
}
