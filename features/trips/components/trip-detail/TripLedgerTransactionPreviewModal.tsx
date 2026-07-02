import { LedgerTransactionPreviewModal } from "@/features/finance/components/LedgerTransactionPreviewModal";
import type { LedgerRow } from "@/features/finance/services/finance.service";

/** Trip detail alias — same receipt modal as finance transaction lists. */
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
  return (
    <LedgerTransactionPreviewModal
      visible={visible}
      transaction={transaction}
      onClose={onClose}
      onViewAllOnTrip={onViewAll ? (_tripId: string) => onViewAll() : undefined}
    />
  );
}
