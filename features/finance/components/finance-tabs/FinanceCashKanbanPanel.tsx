import type { FinanceTabBodyProps } from "../FinanceTabBody.types";
import { FinanceKanbanTab } from "../FinanceKanbanTab";
import { styles } from "../FinanceScreen.styles";
import { Text, View } from "react-native";

export function FinanceCashKanbanPanel({
  ledgerLoading,
  ledgerTransactions,
  filteredLedgerForKanban,
  getVehicleNumberForTripId,
  tripDetailsMap,
  clientRows,
  supplierRows,
  driverRows,
  tripPartyMap,
  profileImages,
  linkedOrgDisplayMap,
  onTripSelect,
  onKanbanPartyAddPress,
}: FinanceTabBodyProps) {
  return (
    <View style={styles.tableBodyWrap}>
      {ledgerLoading && ledgerTransactions === null ? (
        <Text style={styles.ledgerLoading}>Loading…</Text>
      ) : (
        <FinanceKanbanTab
          transactions={filteredLedgerForKanban}
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
          showPartyPromosInColumns
          onKanbanPartyAddPress={onKanbanPartyAddPress}
        />
      )}
    </View>
  );
}
