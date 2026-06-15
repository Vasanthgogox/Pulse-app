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
  tripOptions: trips,
  tripDetailsMap,
  onLedgerMissionChange,
  onAddTransactionPress,
  clientRows,
  supplierRows,
  driverRows,
  tripPartyMap,
  profileImages,
  linkedOrgDisplayMap,
  topContent,
  embedInParentScroll = false,
}: FinanceTabBodyProps) {
  const header =
    topContent ??
    (orgId != null ? <FinanceAIInsights organizationId={orgId} /> : null);

  return (
    <View
      style={
        embedInParentScroll ? styles.tableBodyWrapEmbedded : styles.tableBodyWrap
      }
    >
      {header}
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
          embedInParentScroll={embedInParentScroll}
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
