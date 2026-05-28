import type { OperationalQueueItem } from "@/features/operations/control-center";

export interface QueueHealthSnapshot {
  approvalBacklog: number;
  reimbursementBacklog: number;
  reconciliationBacklog: number;
  postingRetryFailures: number;
  offlineSyncFailures: number;
}

export function buildQueueHealthSnapshot(
  items: OperationalQueueItem[],
): QueueHealthSnapshot {
  let approvalBacklog = 0;
  let reimbursementBacklog = 0;
  let reconciliationBacklog = 0;
  let postingRetryFailures = 0;
  let offlineSyncFailures = 0;
  for (const item of items) {
    if (item.queueKinds.includes("pending_approval")) approvalBacklog += 1;
    if (item.queueKinds.includes("reimbursement_required")) reimbursementBacklog += 1;
    if (item.queueKinds.includes("reconciliation_mismatch")) reconciliationBacklog += 1;
    if (item.queueKinds.includes("posting_retry_failure")) postingRetryFailures += 1;
    if (item.queueKinds.includes("offline_sync_failure")) offlineSyncFailures += 1;
  }
  return {
    approvalBacklog,
    reimbursementBacklog,
    reconciliationBacklog,
    postingRetryFailures,
    offlineSyncFailures,
  };
}
