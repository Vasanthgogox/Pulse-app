import { LEDGER_RECEIPT } from "@/components/ledger/ledgerEntryReceiptPalette";
import {
  LedgerEntryReceiptCard,
  type LedgerEntryReceiptDetailRow,
} from "@/components/ledger/LedgerEntryReceiptCard";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

function formatLedgerDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = s.slice(0, 10);
  const [y, m, day] = d.split("-");
  const months = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const mi = Number(m);
  if (!y || !day || !Number.isFinite(mi) || mi < 1 || mi > 12) return "—";
  return `${day} ${months[mi - 1]} ${y}`;
}

function previewTitle(tx: LedgerRow): string {
  const label = getDoubleEntryDisplayLabel(tx);
  if (label) return label;
  const desc = tx.description?.trim();
  if (desc) return desc;
  if (Number(tx.amount_in ?? 0) > 0 && tx.contact_type === "client") {
    return "Customer payment";
  }
  if (Number(tx.amount_out ?? 0) > 0 && tx.contact_type === "supplier") {
    return "Supplier payment";
  }
  if (Number(tx.amount_out ?? 0) > 0 && tx.contact_type === "driver") {
    return "Driver payment";
  }
  return Number(tx.amount_in ?? 0) > 0 ? "Cash in" : "Cash out";
}

function buildReceiptDetails(tx: LedgerRow): LedgerEntryReceiptDetailRow[] {
  const party = (tx.party_name ?? "").trim() || "—";
  const details: LedgerEntryReceiptDetailRow[] = [
    {
      label: "Date",
      value: formatLedgerDate(tx.transaction_date ?? tx.created_at),
    },
    {
      label: "Party",
      value: party,
    },
    {
      label: "Payment mode",
      value: tx.payment_mode?.trim() || "—",
    },
    {
      label: "Reference",
      value: tx.payment_reference?.trim() || "—",
    },
  ];
  if (tx.description?.trim()) {
    details.push({
      label: "Note",
      value: tx.description.trim(),
      multiline: true,
    });
  }
  return details;
}

export function TripLedgerTransactionPreviewModal({
  visible,
  transaction,
  onClose,
  onViewAll,
}: {
  visible: boolean;
  transaction: LedgerRow | null;
  onClose: () => void;
  onViewAll?: () => void;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  if (!visible || !transaction) return null;

  const inAmt = Number(transaction.amount_in ?? 0);
  const outAmt = Number(transaction.amount_out ?? 0);
  const amount = inAmt > 0 ? inAmt : outAmt;
  const isIn = inAmt > 0;
  const title = previewTitle(transaction);
  const statusLabel = isIn ? "Payment received" : "Payment sent";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.cardShell} onPress={(e) => e.stopPropagation()}>
          <LedgerEntryReceiptCard
            desktop={isDesktop}
            statusLabel={statusLabel}
            title={title}
            amount={amount}
            isIn={isIn}
            details={buildReceiptDetails(transaction)}
            secondaryAction={onViewAll ? { label: "Close", onPress: onClose } : undefined}
            primaryAction={
              onViewAll
                ? {
                    label: "View all on trip",
                    onPress: () => {
                      onClose();
                      onViewAll();
                    },
                  }
                : { label: "Done", onPress: onClose }
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: LEDGER_RECEIPT.overlay,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  cardShell: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
});
