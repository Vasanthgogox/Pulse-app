import type { FinanceTabBodyProps } from "../FinanceTabBody.types";
import { FinanceKanbanTab } from "../FinanceKanbanTab";
import { styles } from "../FinanceScreen.styles";
import { LedgerTab } from "../LedgerTab";
import { Platform, Text, View, useWindowDimensions } from "react-native";

export function FinanceCashTab({
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
  onTripSelect,
}: FinanceTabBodyProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isWebLargeScreen = Platform.OS === "web" && windowWidth >= 1024;

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
              if (row.trip_id) onTripSelect(row.trip_id);
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
