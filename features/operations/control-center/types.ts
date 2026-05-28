import type { ReimbursementState } from "@/features/trips/operations/types";

export type OperationalQueueKind =
  | "pending_approval"
  | "reimbursement_required"
  | "reconciliation_mismatch"
  | "posting_retry_failure"
  | "offline_sync_failure";

export type QueueSourceType = "fuel" | "toll" | "sync";

export interface QueueTripContext {
  tripId: string;
  tripLabel: string;
  organizationId: string;
  tripStatus: string | null;
  tripPayoutMode: string | null;
  supplierId: string | null;
  vehicleId: string | null;
}

export interface OperationalQueueItem {
  id: string;
  sourceType: QueueSourceType;
  sourceId: string;
  trip: QueueTripContext | null;
  amountInr: number;
  enteredAt: string;
  approvalState: string | null;
  postingState: string | null;
  reimbursementState: ReimbursementState | null;
  retryCount: number;
  paymentOwner: string | null;
  postingError: string | null;
  queueKinds: OperationalQueueKind[];
}

export interface QueueSection {
  kind: OperationalQueueKind;
  title: string;
  items: OperationalQueueItem[];
  totalAmountInr: number;
}

export interface QueueSectionPage {
  sections: QueueSection[];
  flatItems: OperationalQueueItem[];
  hasMore: boolean;
  nextOffset: number;
}
