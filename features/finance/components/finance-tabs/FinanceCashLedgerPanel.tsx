import type { FinanceTabBodyProps } from "../FinanceTabBody.types";
import { FinanceAIInsights } from "../FinanceAIInsights";
import { styles } from "../FinanceScreen.styles";
import { LedgerTab } from "../LedgerTab";
import { Text, View } from "react-native";

export function FinanceCashLedgerPanel({
  organizationId: orgId,
  ledgerLoading,
  ledgerTransactions,
  filteredLedgerForDisplay,
  ledgerRefreshKey,
  onLedgerRowSelect,
  getVehicleNumberForTripId,
  tripDetailsMap,
  onAddTransactionPress,
  clientRows,
  supplierRows,
  driverRows,
  tripPartyMap,
  profileImages,
  linkedOrgDisplayMap,
  topContent,
  embedInParentScroll = false,
  isAnyFilterActive = false,
}: FinanceTabBodyProps) {
  const header =
    topContent ??
    (orgId != null ? <FinanceAIInsights organizationId={orgId} /> : null);

  const ledgerEmpty =
    ledgerTransactions !== null && ledgerTransactions.length === 0;
  const filteredEmpty =
    ledgerTransactions !== null &&
    ledgerTransactions.length > 0 &&
    filteredLedgerForDisplay.length === 0;

  return (
    <View
      style={
        embedInParentScroll
          ? styles.tableBodyWrapLedgerFlatEmbedded
          : styles.tableBodyWrapLedgerFlat
      }
    >
      {header}
      {ledgerLoading && ledgerTransactions === null ? (
        <Text style={styles.ledgerLoading}>Loading…</Text>
      ) : ledgerEmpty ? (
        <LedgerTab
          organizationId={orgId}
          refreshKey={ledgerRefreshKey}
          transactions={[]}
          viewMode="transaction"
          showFiscalSubTabs={false}
          embedInParentScroll={embedInParentScroll}
          onAddTransactionPress={onAddTransactionPress}
          clientRows={clientRows}
          supplierRows={supplierRows}
          driverRows={driverRows}
          tripPartyMap={tripPartyMap}
          linkedOrgDisplayMap={linkedOrgDisplayMap}
        />
      ) : filteredEmpty ? (
        <Text style={styles.ledgerLoading}>
          No entries match the current filters.
        </Text>
      ) : (
        <LedgerTab
          organizationId={orgId}
          refreshKey={ledgerRefreshKey}
          transactions={
            ledgerTransactions !== null ? filteredLedgerForDisplay : undefined
          }
          viewMode="transaction"
          showFiscalSubTabs={false}
          embedInParentScroll={embedInParentScroll}
          onRowSelect={onLedgerRowSelect}
          onEntitySelect={() => {}}
          getVehicleNumberForTripId={getVehicleNumberForTripId}
          tripDetailsMap={tripDetailsMap}
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
