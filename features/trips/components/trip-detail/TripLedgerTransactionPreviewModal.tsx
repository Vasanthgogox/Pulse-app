import { LedgerTransactionPreviewModal } from "@/features/finance/components/LedgerTransactionPreviewModal";
import type { LedgerReceiptTripDetailMap } from "@/features/finance/utils/ledgerTransactionReceipt.util";
import type { LedgerRow } from "@/features/finance/services/finance.service";

/** Trip detail alias — same receipt modal as finance transaction lists. */
export function TripLedgerTransactionPreviewModal({
  visible,
  transaction,
  onClose,
  onViewAll,
  tripDetailsMap,
}: {
  visible: boolean;
  transaction: LedgerRow | null;
  onClose: () => void;
  onViewAll?: () => void;
  tripDetailsMap?: LedgerReceiptTripDetailMap;
}) {
  return (
    <LedgerTransactionPreviewModal
      visible={visible}
      transaction={transaction}
      onClose={onClose}
      onViewAllOnTrip={onViewAll ? (_tripId: string) => onViewAll() : undefined}
      tripDetailsMap={tripDetailsMap}
    />
  );
}
