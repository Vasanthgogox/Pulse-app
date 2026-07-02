import { LedgerEntryReceiptCard } from "@/components/ledger/LedgerEntryReceiptCard";
import { LEDGER_RECEIPT } from "@/components/ledger/ledgerEntryReceiptPalette";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { ledgerReceiptFromRow } from "@/features/finance/utils/ledgerTransactionReceipt.util";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

export function LedgerTransactionPreviewModal({
  visible,
  transaction,
  onClose,
  onViewAllOnTrip,
}: {
  visible: boolean;
  transaction: LedgerRow | null;
  onClose: () => void;
  /** When set, overrides default navigation to trip Finance Hub → Transactions. */
  onViewAllOnTrip?: (tripId: string) => void;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  if (!visible || !transaction) return null;

  const receipt = ledgerReceiptFromRow(transaction);
  const showViewAll = Boolean(receipt.tripId);
  const viewAllOnTrip =
    onViewAllOnTrip ??
    ((tripId: string) => {
      router.push(ROUTES.tripDetailFinanceTransactions(tripId) as never);
    });

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
            statusLabel={receipt.statusLabel}
            title={receipt.title}
            amount={receipt.amount}
            isIn={receipt.isIn}
            details={receipt.details}
            secondaryAction={
              showViewAll ? { label: "Close", onPress: onClose } : undefined
            }
            primaryAction={
              showViewAll
                ? {
                    label: "View all on trip",
                    onPress: () => {
                      onClose();
                      if (receipt.tripId) viewAllOnTrip(receipt.tripId);
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
