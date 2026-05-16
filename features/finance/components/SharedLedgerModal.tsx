/**
 * Shared Ledger modal — pick a client or supplier, then full-screen Compare & verify
 * (`SharedLedgerContent`) for that party.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { TripRow } from "@/features/trips";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LedgerRow } from "../services/finance.service";
import type { SharedLedgerContentProps } from "./SharedLedgerContent";
import { SharedLedgerContent } from "./SharedLedgerContent";

export type { SharedLedgerContentProps } from "./SharedLedgerContent";

export interface SharedLedgerModalProps {
  visible: boolean;
  onClose: () => void;
  organizationId: string | null;
  transactions: LedgerRow[];
  clients: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  tripCountByParty: Record<string, number>;
  tripRows: TripRow[];
  clientRows: ClientRow[];
  supplierRows: SupplierRow[];
}

type PickedParty = {
  id: string;
  name: string;
  entityType: "CLIENT" | "SUPPLIER";
};

function normId(id: string | null | undefined): string {
  return id == null ? "" : String(id).trim();
}

export function SharedLedgerModal({
  visible,
  onClose,
  organizationId,
  transactions,
  clients,
  suppliers,
  tripCountByParty,
  tripRows,
  clientRows,
  supplierRows,
}: SharedLedgerModalProps) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<PickedParty | null>(null);

  useEffect(() => {
    if (!visible) setPicked(null);
  }, [visible]);

  const clientById = useMemo(
    () => new Map(clientRows.map((c) => [c.id, c])),
    [clientRows],
  );
  const supplierById = useMemo(
    () => new Map(supplierRows.map((s) => [s.id, s])),
    [supplierRows],
  );

  const partyTrips = useMemo(() => {
    if (!picked) return [];
    if (picked.entityType === "CLIENT") {
      const pid = normId(picked.id);
      return tripRows.filter((t) => normId(t.client_id) === pid);
    }
    const pid = normId(picked.id);
    return tripRows.filter((t) => normId(t.supplier_id) === pid);
  }, [picked, tripRows]);

  const partyTransactions = useMemo(() => {
    if (!picked) return transactions;
    const want =
      picked.entityType === "CLIENT"
        ? ("client" as const)
        : ("supplier" as const);
    const pid = normId(picked.id);
    return transactions.filter((tx) => {
      if (normId(tx.contact_id) === pid && tx.contact_type === want)
        return true;
      if (!tx.trip_id) return false;
      const tid = normId(tx.trip_id);
      const trip = tripRows.find((tr) => normId(tr.id) === tid);
      if (!trip) return false;
      if (picked.entityType === "CLIENT")
        return normId(trip.client_id) === pid;
      return normId(trip.supplier_id) === pid;
    });
  }, [picked, transactions, tripRows]);

  const contentProps: SharedLedgerContentProps | null = useMemo(() => {
    if (!picked || !organizationId) return null;
    if (picked.entityType === "CLIENT") {
      const row = clientById.get(picked.id);
      return {
        entity: {
          id: picked.id,
          name: picked.name,
          linked_organization_id: row?.linked_organization_id ?? null,
          avatar_url: row?.avatar_url ?? null,
        },
        entityType: "CLIENT",
        trips: partyTrips,
        transactions: partyTransactions,
        organizationId,
        integrated: row?.is_integrated === true,
        embeddedInOverlay: true,
      };
    }
    const row = supplierById.get(picked.id);
    return {
      entity: {
        id: picked.id,
        name: picked.name,
        linked_organization_id: row?.linked_organization_id ?? null,
        avatar_url: row?.avatar_url ?? null,
      },
      entityType: "SUPPLIER",
      trips: partyTrips,
      transactions: partyTransactions,
      organizationId,
      integrated: row?.supplier_type === "integrated",
      embeddedInOverlay: true,
    };
  }, [
    picked,
    organizationId,
    clientById,
    supplierById,
    partyTrips,
    partyTransactions,
  ]);

  const renderPartyList = useCallback(() => {
    return (
      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.listContent}
      >
        <Text style={styles.listHint}>Choose a party to compare & verify.</Text>
        {clients.map((c) => (
          <TouchableOpacity
            key={`c-${c.id}`}
            style={styles.partyRow}
            onPress={() =>
              setPicked({ id: c.id, name: c.name, entityType: "CLIENT" })
            }
          >
            <Text style={styles.partyName}>{c.name}</Text>
            <Text style={styles.partyMeta}>
              Customer · {tripCountByParty[c.id] ?? 0} trips
            </Text>
          </TouchableOpacity>
        ))}
        {suppliers.map((s) => (
          <TouchableOpacity
            key={`s-${s.id}`}
            style={styles.partyRow}
            onPress={() =>
              setPicked({ id: s.id, name: s.name, entityType: "SUPPLIER" })
            }
          >
            <Text style={styles.partyName}>{s.name}</Text>
            <Text style={styles.partyMeta}>
              Supplier · {tripCountByParty[s.id] ?? 0} trips
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }, [clients, suppliers, tripCountByParty]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          {picked ? (
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => setPicked(null)}
              hitSlop={12}
            >
              <FontAwesome name="chevron-left" size={14} color={Theme.primary} />
              <Text style={styles.backLinkText}>Parties</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.headerTitle}>Shared Ledger</Text>
          <Text style={styles.headerSubtitle}>
            {picked ? picked.name : "Compare & verify — clients & suppliers"}
          </Text>
          <TouchableOpacity
            style={[styles.closeBtn, { top: insets.top + 16 }]}
            onPress={onClose}
            hitSlop={12}
          >
            <FontAwesome name="times" size={20} color={Theme.textPrimaryDark} />
          </TouchableOpacity>
        </View>
        {!organizationId ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>No organization selected.</Text>
          </View>
        ) : !picked ? (
          renderPartyList()
        ) : contentProps ? (
          <SharedLedgerContent {...contentProps} />
        ) : (
          <View style={styles.loadingWrap}>
            <LoadingIndicator size="large" color={Theme.primary} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderLight,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.primary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  headerSubtitle: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMutedDemo,
    letterSpacing: 1,
    marginTop: 4,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 20,
    padding: 8,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  listHint: {
    fontSize: 13,
    color: Theme.textMuted,
    marginBottom: 12,
  },
  partyRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Theme.surfaceLight,
    marginBottom: 10,
  },
  partyName: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  partyMeta: {
    fontSize: 12,
    color: Theme.textMuted,
    marginTop: 4,
  },
});
