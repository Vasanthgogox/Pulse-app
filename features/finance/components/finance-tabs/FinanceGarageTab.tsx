import { GarrageTab } from "@/features/vehicles/components/GarrageTab";
import type { FinanceTabBodyProps } from "../FinanceTabBody.types";

export function FinanceGarageTab(props: FinanceTabBodyProps) {
  const {
    organizationId: orgId,
    ledgerTransactions,
    vehicleRows,
    driverRows,
    tripRows,
    entitiesLoading,
    onTabTotals,
    onEntityRowSelect,
    garagePeriod,
    onGaragePeriodChange,
    garageViewTab,
    onGarageViewTabChange,
    searchQuery,
    entityFilter,
    onTripSelect,
    topContent,
    refreshing,
    onRefresh,
    bottomInset,
    financeSubTab,
  } = props;

  return (
    <GarrageTab
      organizationId={orgId}
      vehicles={vehicleRows}
      drivers={driverRows}
      trips={tripRows}
      transactions={ledgerTransactions ?? undefined}
      parentLoading={entitiesLoading}
      onTotals={onTabTotals}
      onRowSelect={(data, entityType) =>
        onEntityRowSelect(data, entityType, financeSubTab)
      }
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
      hideSummaryRow
    />
  );
}
