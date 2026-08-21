import { LedgerTransactionPreviewModal } from "@/features/finance/components/LedgerTransactionPreviewModal";
import type { LedgerEntryReceiptPartyAvatar } from "@/components/ledger/LedgerEntryReceiptCard";
import type { LedgerReceiptTripDetailMap } from "@/features/finance/utils/ledgerTransactionReceipt.util";
import type { LedgerRow } from "@/features/finance/services/finance.service";

/** Trip detail alias — same receipt modal as finance transaction lists. */
export function TripLedgerTransactionPreviewModal({
  visible,
  transaction,
  onClose,
  onViewAll,
  tripDetailsMap,
  resolveReceiptPartyAvatar,
}: {
  visible: boolean;
  transaction: LedgerRow | null;
  onClose: () => void;
  onViewAll?: () => void;
  tripDetailsMap?: LedgerReceiptTripDetailMap;
  resolveReceiptPartyAvatar?: (row: LedgerRow) => LedgerEntryReceiptPartyAvatar | undefined;
}) {
  return (
    <LedgerTransactionPreviewModal
      visible={visible}
      transaction={transaction}
      onClose={onClose}
      onViewAllOnTrip={onViewAll ? (_tripId: string) => onViewAll() : undefined}
      tripDetailsMap={tripDetailsMap}
      resolveReceiptPartyAvatar={resolveReceiptPartyAvatar}
    />
  );
}
