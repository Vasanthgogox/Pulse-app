import { SuppliersTab } from "@/features/suppliers/components/SuppliersTab";
import type { FinanceTabBodyProps } from "../FinanceTabBody.types";

export function FinanceSuppliersTab(props: FinanceTabBodyProps) {
  const {
    organizationId: orgId,
    ledgerForEntityAggregation,
    ledgerTransactions,
    supplierRows,
    tripRows,
    tripsWhereOrgIsClient,
    entitiesLoading,
    onTabTotals,
    onEntityRowSelect,
    searchQuery,
    entityFilter,
    tripPartyMap,
    topContent,
    refreshing,
    onRefresh,
    bottomInset,
    tripFinanceAdjustmentsByTripId,
    financeSubTab,
    supplierViewTab,
    onSupplierViewTabChange,
  } = props;

  const entityAggregationLedger =
    ledgerForEntityAggregation ?? ledgerTransactions ?? undefined;

  return (
    <SuppliersTab
      organizationId={orgId}
      suppliers={supplierRows}
      trips={tripRows}
      tripsWhereOrgIsClient={tripsWhereOrgIsClient}
      transactions={entityAggregationLedger}
      parentLoading={entitiesLoading}
      onTotals={onTabTotals}
      onRowSelect={(data, entityType) =>
        onEntityRowSelect(data, entityType, financeSubTab)
      }
      searchQuery={searchQuery}
      entityFilter={entityFilter}
      tripPartyMap={tripPartyMap}
      topContent={topContent}
      refreshing={refreshing}
      onRefresh={onRefresh}
      bottomInset={bottomInset}
      tripFinanceAdjustmentsByTripId={tripFinanceAdjustmentsByTripId}
      viewTab={supplierViewTab}
      onViewTabChange={onSupplierViewTabChange}
      hideSummaryRow
    />
  );
}
