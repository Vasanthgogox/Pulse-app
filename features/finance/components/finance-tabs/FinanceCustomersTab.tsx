import { CustomersTab } from "@/features/clients/components/CustomersTab";
import type { FinanceTabBodyProps } from "../FinanceTabBody.types";

export function FinanceCustomersTab(props: FinanceTabBodyProps) {
  const {
    organizationId: orgId,
    ledgerForEntityAggregation,
    ledgerTransactions,
    filteredLedgerForDisplay,
    clientRows,
    tripRows,
    tripsWhereOrgIsSupplier,
    indentsForFinance,
    entitiesLoading,
    onTabTotals,
    onEntityRowSelect,
    searchQuery,
    entityFilter,
    connectionRequestsSent,
    tripPartyMap,
    tripDetailsMap,
    tripOptions: trips,
    onLedgerMissionChange,
    topContent,
    refreshing,
    onRefresh,
    bottomInset,
    tripFinanceAdjustmentsByTripId,
    financeSubTab,
    customerViewTab,
    onCustomerViewTabChange,
    embedInParentScroll,
    onAddPartyPress,
  } = props;

  const entityAggregationLedger =
    ledgerForEntityAggregation ?? ledgerTransactions ?? undefined;

  return (
    <CustomersTab
      organizationId={orgId}
      clients={clientRows}
      trips={tripRows}
      tripsWhereOrgIsSupplier={tripsWhereOrgIsSupplier}
      indents={indentsForFinance}
      transactions={entityAggregationLedger}
      parentLoading={entitiesLoading}
      onTotals={onTabTotals}
      onRowSelect={(data, entityType) =>
        onEntityRowSelect(data, entityType, financeSubTab)
      }
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
      viewTab={customerViewTab}
      onViewTabChange={onCustomerViewTabChange}
      hideSummaryRow
      embedInParentScroll={embedInParentScroll}
      onAddPartyPress={onAddPartyPress}
    />
  );
}
