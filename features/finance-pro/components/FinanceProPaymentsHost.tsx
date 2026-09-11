/**
 * Payments tab — existing Cash kanban + ledger-sync entry. Not invoice allocation.
 */
import { FAB } from "@/components/FAB";
import { FinanceKanbanTab } from "@/features/finance/components/FinanceKanbanTab";
import { styles as financeStyles } from "@/features/finance/components/FinanceScreen.styles";
import { useFinanceEntities } from "@/features/finance/hooks/useFinanceEntities";
import { useFinanceLedger } from "@/features/finance/hooks/useFinanceLedger";
import { useOrganization } from "@/contexts/OrganizationContext";
import { canAccessFinance, financeKanbanColumnsForSupplyFilter } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useDriverProfileImagesQuery } from "@/lib/queries/useDriverProfileImagesQuery";
import { useLinkedOrgProfileMap } from "@/lib/useLinkedOrgProfileMap";
import { useRouter } from "expo-router";
import { ROUTES } from "@/lib/routes";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";

export function FinanceProPaymentsHost() {
  const router = useRouter();
  const caps = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const canAccess = canAccessFinance(caps);
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const entities = useFinanceEntities({
    organizationId: orgId,
    canAccess,
  });
  const ledger = useFinanceLedger({
    organizationId: orgId,
    canAccess,
    tripRows: entities.tripRows,
    vehicleRows: entities.vehicleRows,
    clients: entities.clientRows,
    suppliers: entities.supplierRows,
  });

  const driverIdsForProfiles = useMemo(() => {
    const ids = new Set<string>();
    for (const row of ledger.ledgerTransactions ?? []) {
      const id = (row.contact_id ?? "").trim();
      if (id && row.contact_type === "driver") ids.add(id);
    }
    return Array.from(ids);
  }, [ledger.ledgerTransactions]);
  const profileImages = useDriverProfileImagesQuery(driverIdsForProfiles);
  const linkedOrgDisplayMap = useLinkedOrgProfileMap(
    entities.clientRows,
    entities.supplierRows,
  );
  const kanbanVisibleColumns = financeKanbanColumnsForSupplyFilter(
    caps,
    ledger.sourceSupplyFilter,
  );
  const canAdd = canSurface("finance.add_transaction");

  return (
    <View style={financeStyles.tableBodyWrap}>
      <Text style={styles.caption}>
        Customer and trip cash from the existing ledger. This is not invoice
        allocation.
      </Text>
      {ledger.ledgerLoading && ledger.ledgerTransactions === null ? (
        <Text style={financeStyles.ledgerLoading}>Loading…</Text>
      ) : (
        <FinanceKanbanTab
          transactions={ledger.filteredLedgerForKanban}
          getVehicleNumberForTripId={ledger.getVehicleNumberForTripId}
          tripDetailsMap={ledger.tripDetailsMap}
          clientRows={entities.clientRows}
          supplierRows={entities.supplierRows}
          driverRows={entities.driverRows}
          tripPartyMap={ledger.tripPartyMap}
          profileImages={profileImages}
          linkedOrgDisplayMap={linkedOrgDisplayMap}
          showPartyPromosInColumns
          visibleColumns={kanbanVisibleColumns}
          onRowSelect={(row) => {
            router.push(ROUTES.financeProCash(row.id));
          }}
        />
      )}
      {canAdd ? (
        <FAB
          label="Add cash"
          onPress={() => router.push("/(modals)/ledger-sync" as const)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: 10,
    paddingBottom: 8,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
});
