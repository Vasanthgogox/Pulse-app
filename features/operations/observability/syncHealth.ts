import { listOperationsOutbox } from "@/features/trips/operations/offline/outbox";

export interface SyncHealthSnapshot {
  pendingCount: number;
  failedCount: number;
  oldestPendingAgeMinutes: number | null;
  failedUploads: number;
}

export async function getSyncHealthSnapshot(): Promise<SyncHealthSnapshot> {
  const queue = await listOperationsOutbox();
  const pending = queue.filter((item) => item.status !== "failed");
  const failed = queue.filter((item) => item.status === "failed");
  const oldestPending = pending
    .map((item) => +new Date(item.createdAt))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const oldestPendingAgeMinutes =
    oldestPending != null
      ? Math.max(0, Math.round((Date.now() - oldestPending) / 60000))
      : null;
  const failedUploads = failed.filter(
    (item) => item.kind === "fuel_photo" || item.kind === "toll_photo",
  ).length;
  return {
    pendingCount: pending.length,
    failedCount: failed.length,
    oldestPendingAgeMinutes,
    failedUploads,
  };
}
