import { getOperationsControlCenterPage } from "@/features/operations/control-center/queries/controlCenter.service";
import { buildQueueHealthSnapshot, type QueueHealthSnapshot } from "./queueHealth";
import { getSyncHealthSnapshot, type SyncHealthSnapshot } from "./syncHealth";
import { getPostingHealthSnapshot, type PostingHealthSnapshot } from "./postingHealth";

export interface OperationalHealthSnapshot {
  queue: QueueHealthSnapshot;
  sync: SyncHealthSnapshot;
  posting: PostingHealthSnapshot;
  operatorAttentionRequired: boolean;
}

export async function getOperationalHealthSnapshot(input: {
  organizationId: string;
}): Promise<{ error: Error | null; snapshot: OperationalHealthSnapshot | null }> {
  const [queueRes, syncSnapshot, postingRes] = await Promise.all([
    getOperationsControlCenterPage({
      organizationId: input.organizationId,
      offset: 0,
      limit: 120,
    }),
    getSyncHealthSnapshot(),
    getPostingHealthSnapshot({ organizationId: input.organizationId }),
  ]);
  if (queueRes.error || !queueRes.page) {
    return { error: queueRes.error ?? new Error("Queue health unavailable"), snapshot: null };
  }
  if (postingRes.error || !postingRes.snapshot) {
    return {
      error: postingRes.error ?? new Error("Posting health unavailable"),
      snapshot: null,
    };
  }
  const queueSnapshot = buildQueueHealthSnapshot(queueRes.page.flatItems);
  const attention =
    queueSnapshot.approvalBacklog > 0 ||
    queueSnapshot.reconciliationBacklog > 0 ||
    queueSnapshot.postingRetryFailures > 0 ||
    syncSnapshot.failedCount > 0 ||
    postingRes.snapshot.postingFailures > 0;
  return {
    error: null,
    snapshot: {
      queue: queueSnapshot,
      sync: syncSnapshot,
      posting: postingRes.snapshot,
      operatorAttentionRequired: attention,
    },
  };
}
