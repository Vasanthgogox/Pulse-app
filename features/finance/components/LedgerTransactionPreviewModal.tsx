import { LedgerEntryReceiptCard } from "@/components/ledger/LedgerEntryReceiptCard";
import type { LedgerEntryReceiptPartyAvatar } from "@/components/ledger/LedgerEntryReceiptCard";
import { LEDGER_RECEIPT } from "@/components/ledger/ledgerEntryReceiptPalette";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import {
  enrichLedgerReceiptDetails,
  ledgerReceiptFromRow,
  type LedgerReceiptTripDetailMap,
} from "@/features/finance/utils/ledgerTransactionReceipt.util";
import { ROUTES } from "@/lib/routes";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";

export function LedgerTransactionPreviewModal({
  visible,
  transaction,
  onClose,
  onViewAllOnTrip,
  resolveReceiptPartyAvatar,
  tripDetailsMap,
}: {
  visible: boolean;
  transaction: LedgerRow | null;
  onClose: () => void;
  /** When set, overrides default navigation to trip Finance Hub → Transactions. */
  onViewAllOnTrip?: (tripId: string) => void;
  /** Same resolver as finance list avatars (linked org branding + integration). */
  resolveReceiptPartyAvatar?: (row: LedgerRow) => LedgerEntryReceiptPartyAvatar | undefined;
  /** Preloaded trip context — avoids network fetch on open. */
  tripDetailsMap?: LedgerReceiptTripDetailMap;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;

  const receipt = useMemo(
    () => (transaction ? ledgerReceiptFromRow(transaction) : null),
    [transaction],
  );

  const partyAvatar = useMemo<LedgerEntryReceiptPartyAvatar | undefined>(() => {
    if (!transaction) return undefined;
    const resolved = resolveReceiptPartyAvatar?.(transaction);
    if (resolved) return resolved;
    return receipt?.partyAvatar;
  }, [transaction, resolveReceiptPartyAvatar, receipt?.partyAvatar]);

  const enrichedDetails = useMemo(() => {
    if (!receipt || !transaction) return [];
    const tripId = (transaction.trip_id ?? "").trim();
    const tripDetail = tripId ? tripDetailsMap?.[tripId] : undefined;
    return enrichLedgerReceiptDetails(receipt.details, tripDetail);
  }, [receipt, transaction, tripDetailsMap]);

  if (!visible || !transaction || !receipt) return null;

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
            {...(transaction.is_pending_request ? { heroAnimation: false as const } : {})}
            statusLabel={receipt.statusLabel}
            title={receipt.title}
            amount={receipt.amount}
            isIn={receipt.isIn}
            partyAvatar={partyAvatar}
            details={enrichedDetails}
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
    maxWidth: 380,
    alignSelf: "center",
  },
});
